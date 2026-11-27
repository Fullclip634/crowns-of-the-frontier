import {standardMaterial} from './render-runtime.js';
import * as THREE from 'three';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';
import {UNITS} from './data.js';
import {siegeArmAngle,projectileTargetHeight} from './combat-timing.js';
import {bowArcher,bowReleasePoint} from './archery-pose.js';
import {visualBodyOffset} from './foot-placement.js';
import {markInstancePrefix} from './render-batches.js';

const clamp=(value,lo,hi)=>Math.max(lo,Math.min(hi,value));
const buildingHeight=type=>({tower:6.2,bombard:7.4,keep:9.5,towncenter:5.8,wall:2.4,gate:3.8}[type]||2.6);

export function witnessedEffect(view,entity){
  const sim=view.sim;
  return entity.owner===0||!sim||sim.options?.spectator||sim.isVisible(entity.x,entity.z);
}

// Cosmetic flight follows the visible/interpolated figures. Damage and attack
// timing remain authoritative simulation events, independent of visual quality.
export function attackFlight(view,entity,target,arrowIndex=0,event={}){
  const def=UNITS[entity.type],ranged=entity.kind==='building'||(def?.range||0)>5;
  const siege=['catapult','trebuchet','warship','bombard'].includes(entity.type);
  const fireball=Boolean(event.fireball||entity.type==='trebuchet');
  const cannonball=Boolean(event.cannonball||entity.type==='bombard');
  const javelin=Boolean(event.javelin||entity.type==='skirmisher');
  const flaming=Boolean(!siege&&!javelin&&ranged&&(event.flaming||view.sim?.players?.[entity.owner]?.tech?.fireArrows>0));
  const kind=fireball?'fireball':cannonball?'cannonball':siege?'stone':javelin?'javelin':flaming?'firearrow':ranged?'arrow':'slash';
  const x=entity.renderX??entity.x,z=entity.renderZ??entity.z;
  const tx=target.renderX??target.x,tz=target.renderZ??target.z;
  const distance=Math.hypot(tx-x,tz-z),heading=Math.atan2(tx-x,tz-z);
  const ground=view.entityHeight(entity,x,z)+(entity.kind==='unit'?visualBodyOffset(view,entity):0),targetGround=view.entityHeight(target,tx,tz)+(target.kind==='unit'?visualBodyOffset(view,target):0);
  const height=entity.kind==='building'?buildingHeight(entity.type):def?.naval?2.1:entity.type==='trebuchet'?4.4:entity.type==='catapult'?3.3:1.95;
  const localX=(kind==='arrow'||kind==='firearrow'||kind==='javelin')&&entity.kind==='unit'&&!def?.naval?-.48:entity.kind==='building'&&arrowIndex>0?(arrowIndex%2?-1:1)*Math.ceil(arrowIndex/2)*.55:0;
  const forward=entity.kind==='building'?Math.min(2,entity.r||1):def?.naval?1.7:entity.type==='trebuchet'?1.4:entity.type==='catapult'?1.1:.65;
  const from=new THREE.Vector3(x+Math.cos(heading)*localX+Math.sin(heading)*forward,ground+height,z-Math.sin(heading)*localX+Math.cos(heading)*forward);
  if(bowArcher(entity)){const p=bowReleasePoint;from.set(x+Math.cos(heading)*p.x+Math.sin(heading)*p.z,ground+p.y,z-Math.sin(heading)*p.x+Math.cos(heading)*p.z);}
  if((entity.type==='catapult'||entity.type==='trebuchet')&&event.pendingImpact){
    const angle=siegeArmAngle(entity),scale=entity.type==='trebuchet'?1.35:1;
    const y=(1.33*Math.cos(angle)+2.66*Math.sin(angle))*scale+2.8*scale,offset=(1.33*Math.sin(angle)-2.66*Math.cos(angle))*scale;
    from.set(x+Math.sin(heading)*offset,ground+y,z+Math.cos(heading)*offset);
  }
  if(arrowIndex>0)from.y+=(arrowIndex%3-1)*.12;
  const to=new THREE.Vector3(tx,targetGround+projectileTargetHeight(target,!!event.pendingImpact&&siege),tz);
  if(event.pendingImpact&&siege){to.x=event.aimX;to.z=event.aimZ;to.y=view.entityHeight(target,to.x,to.z)+projectileTargetHeight(target,true);}
  if(!ranged)from.lerp(to,.7);
  return {kind,from,to,duration:event.flightDuration??(cannonball?clamp(distance/36,.28,.95):siege?clamp(distance/(entity.type==='trebuchet'?26:30),.45,1.65):ranged?clamp(distance/34,.14,.65):.19),
    arc:fireball?clamp(distance*.38,4,15):cannonball?clamp(distance*.12,1.0,4.0):siege?clamp(distance*(entity.type==='warship'?.18:.32),2,12):javelin?clamp(distance*.075,.35,1.8):ranged?clamp(distance*.045,.18,1.4):.12,
    alignFlight:true,impact:siege&&!event.pendingImpact,fireball,cannonball,javelin,flaming,authoritative:!!event.pendingImpact,releasedAt:event.releasedAt,tracked:!siege&&event.pendingImpact?target.id:null,impactColor:fireball?0xff8c38:cannonball?0xff9a44:UNITS[target.type]?.naval?0xa6c9c4:0xb5aa95,impactSize:fireball?2.35:cannonball?1.95:siege?1.6:0};
}

export function updateFlight(effect,t){
  effect.object.position.lerpVectors(effect.from,effect.to,t);
  effect.object.position.y+=Math.sin(t*Math.PI)*(effect.arc||0);
  if(effect.alignFlight){
    const tangent=effect.tangent??=new THREE.Vector3(),forward=effect.forward??=new THREE.Vector3(0,0,1);
    tangent.subVectors(effect.to,effect.from);tangent.y+=Math.PI*(effect.arc||0)*Math.cos(t*Math.PI);
    if(tangent.lengthSq()>1e-8)effect.object.quaternion.setFromUnitVectors(forward,tangent.normalize());
  }
  if(effect.kind==='slash')effect.object.material.opacity=Math.sin(Math.PI*clamp(t,0,1))*.7;
}

export function releaseEffect(effect){
  effect.object.removeFromParent();
  if(effect.recycle)effect.recycle(effect.object);
  else{effect.object.geometry.dispose();effect.object.material.dispose();if(effect.object.isInstancedMesh)effect.object.dispose();}
}

function colored(geometry,color){
  const p=geometry.attributes.position,c=new THREE.Color(color),array=new Float32Array(p.count*3);
  for(let i=0;i<p.count;i++){array[i*3]=c.r;array[i*3+1]=c.g;array[i*3+2]=c.b;}
  geometry.setAttribute('color',new THREE.BufferAttribute(array,3));return geometry;
}
function arrowGeometry(){
  const shaft=colored(new THREE.CylinderGeometry(.016,.016,.86,5).rotateX(Math.PI/2),0x5c4632);
  const tip=colored(new THREE.ConeGeometry(.045,.21,4).rotateX(Math.PI/2).translate(0,0,.49),0xd4dfdc);
  const feather=colored(new THREE.BoxGeometry(.15,.010,.20).translate(0,0,-.32),0xede6ce);
  const vertical=feather.clone().rotateZ(Math.PI/2);
  // Sleek wind-streak wake behind fletching for crisp RTS volley readability (0 extra draw calls).
  const streakH=colored(new THREE.PlaneGeometry(.055,.92).rotateX(-Math.PI/2).translate(0,0,-.86),0xf2e7ca);
  const streakV=streakH.clone().rotateZ(Math.PI/2);
  const parts=[shaft,tip,feather,vertical,streakH,streakV].map(g=>{
    const nonIdx=g.index?g.toNonIndexed():g;if(nonIdx!==g)g.dispose();
    if(!nonIdx.attributes.normal)nonIdx.computeVertexNormals();
    if(!nonIdx.attributes.uv)nonIdx.setAttribute('uv',new THREE.Float32BufferAttribute(new Float32Array(nonIdx.attributes.position.count*2),2));
    return nonIdx;
  }),merged=mergeGeometries(parts);
  for(const part of parts)part.dispose();return merged;
}
function fireArrowGeometry(){
  const shaft=colored(new THREE.CylinderGeometry(.018,.018,.88,5).rotateX(Math.PI/2),0x4e3722);
  const flame=colored(new THREE.ConeGeometry(.095,.34,5).rotateX(Math.PI/2).translate(0,0,.48),0xffa828);
  const core=colored(new THREE.IcosahedronGeometry(.075,0).translate(0,0,.38),0xfff08a);
  const trailH=colored(new THREE.PlaneGeometry(.09,1.15).rotateX(-Math.PI/2).translate(0,0,-.34),0xff6a18);
  const trailV=trailH.clone().rotateZ(Math.PI/2);
  const parts=[shaft,flame,core,trailH,trailV].map(g=>{
    const nonIdx=g.index?g.toNonIndexed():g;if(nonIdx!==g)g.dispose();
    if(!nonIdx.attributes.normal)nonIdx.computeVertexNormals();
    if(!nonIdx.attributes.uv)nonIdx.setAttribute('uv',new THREE.Float32BufferAttribute(new Float32Array(nonIdx.attributes.position.count*2),2));
    return nonIdx;
  }),merged=mergeGeometries(parts);
  for(const part of parts)part.dispose();return merged;
}
function fireballGeometry(){
  const rock=colored(new THREE.IcosahedronGeometry(.44,1),0xff6a18);
  const tail=colored(new THREE.ConeGeometry(.38,1.25,6).rotateX(-Math.PI/2).translate(0,0,-.62),0xffb830);
  const parts=[rock,tail].map(g=>{
    const nonIdx=g.index?g.toNonIndexed():g;if(nonIdx!==g)g.dispose();
    if(!nonIdx.attributes.normal)nonIdx.computeVertexNormals();
    if(!nonIdx.attributes.uv)nonIdx.setAttribute('uv',new THREE.Float32BufferAttribute(new Float32Array(nonIdx.attributes.position.count*2),2));
    return nonIdx;
  }),merged=mergeGeometries(parts);
  for(const part of parts)part.dispose();return merged;
}
function cannonballGeometry(){
  const ironBall=colored(new THREE.IcosahedronGeometry(.32,1),0x2c3035);
  const flare=colored(new THREE.ConeGeometry(.24,.95,6).rotateX(-Math.PI/2).translate(0,0,-.52),0xff942e);
  const parts=[ironBall,flare].map(g=>{
    const nonIdx=g.index?g.toNonIndexed():g;if(nonIdx!==g)g.dispose();
    if(!nonIdx.attributes.normal)nonIdx.computeVertexNormals();
    if(!nonIdx.attributes.uv)nonIdx.setAttribute('uv',new THREE.Float32BufferAttribute(new Float32Array(nonIdx.attributes.position.count*2),2));
    return nonIdx;
  }),merged=mergeGeometries(parts);
  for(const part of parts)part.dispose();return merged;
}
function javelinGeometry(){
  const shaft=colored(new THREE.CylinderGeometry(.024,.020,1.28,5).rotateX(Math.PI/2),0x6c4c2e);
  const tip=colored(new THREE.ConeGeometry(.062,.30,4).rotateX(Math.PI/2).translate(0,0,.72),0xdce6e4);
  const grip=colored(new THREE.CylinderGeometry(.032,.032,.22,5).rotateX(Math.PI/2).translate(0,0,-.06),0xb68642);
  const streakH=colored(new THREE.PlaneGeometry(.07,1.05).rotateX(-Math.PI/2).translate(0,0,-.95),0xf0e4c2);
  const streakV=streakH.clone().rotateZ(Math.PI/2);
  const parts=[shaft,tip,grip,streakH,streakV].map(g=>{
    const nonIdx=g.index?g.toNonIndexed():g;if(nonIdx!==g)g.dispose();
    if(!nonIdx.attributes.normal)nonIdx.computeVertexNormals();
    if(!nonIdx.attributes.uv)nonIdx.setAttribute('uv',new THREE.Float32BufferAttribute(new Float32Array(nonIdx.attributes.position.count*2),2));
    return nonIdx;
  }),merged=mergeGeometries(parts);
  for(const part of parts)part.dispose();return merged;
}
function stoneGeometry(){
  const g=new THREE.IcosahedronGeometry(.27,0),p=g.attributes.position,colors=new Float32Array(p.count*3);
  for(let i=0;i<p.count;i++){
    const x=p.getX(i),y=p.getY(i),z=p.getZ(i),warp=1+Math.sin(x*19+y*11)*.16+Math.cos(z*17-x*7)*.12;
    p.setXYZ(i,x*warp,y*(warp*.92),z*warp);
    const shade=.42+Math.max(0,y/.27)*.22+((i%3)*.04);
    colors[i*3]=shade*1.04;colors[i*3+1]=shade*.98;colors[i*3+2]=shade*.90;
  }
  g.setAttribute('color',new THREE.BufferAttribute(colors,3));g.computeVertexNormals();return g;
}
function splinterGeometry(){
  const g=new THREE.ConeGeometry(.10,.38,4);g.rotateX(Math.PI*.35);g.scale(.85,.52,1.45);return g;
}
function craterGeometry(){
  return new THREE.PlaneGeometry(3.1,3.1);
}
export function crossedPlumeGeometry(width=1.2,height=1.8,yOffset=.75){
  const parts=[];
  for(let i=0;i<3;i++){
    const plane=new THREE.PlaneGeometry(width,height);
    plane.translate(0,yOffset,0);
    plane.rotateY((i*Math.PI)/3);
    const nonIdx=plane.toNonIndexed();plane.dispose();
    parts.push(nonIdx);
  }
  const merged=mergeGeometries(parts);
  for(const p of parts)p.dispose();
  return merged;
}
export function billboardPlaneGeometry(width=1.4,height=1.9,yOffset=.82){
  const plane=new THREE.PlaneGeometry(width,height);
  if(yOffset)plane.translate(0,yOffset,0);
  return plane;
}

const smoothstep=(a,b,x)=>{const t=clamp((x-a)/(b-a),0,1);return t*t*(3-2*t);};
const lerp=(a,b,t)=>a+(b-a)*t;
function hash2(ix,iy){
  const n=Math.sin(ix*127.1+iy*311.7)*43758.5453123;
  return n-Math.floor(n);
}
function noise2(x,y){
  const ix=Math.floor(x),iy=Math.floor(y),fx=x-ix,fy=y-iy;
  const ux=fx*fx*(3-2*fx),uy=fy*fy*(3-2*fy);
  const a=hash2(ix,iy),b=hash2(ix+1,iy),c=hash2(ix,iy+1),d=hash2(ix+1,iy+1);
  return a+(b-a)*ux+(c-a)*uy+(a-b-c+d)*ux*uy;
}
function fbm2(x,y,octaves=4){
  let sum=0,amp=.5,freq=1,norm=0;
  for(let o=0;o<octaves;o++){
    sum+=noise2(x*freq,y*freq)*amp;
    norm+=amp;amp*=.5;freq*=2.04;
  }
  return sum/norm;
}
function blackbodyFireRGB(temp){
  const t=clamp(temp,0,1);
  if(t<.34){
    const k=t/.34;
    return [lerp(226,255,k),lerp(30,86,k),lerp(4,8,k)];
  }
  if(t<.66){
    const k=(t-.34)/.32;
    return [255,lerp(86,172,k),lerp(8,26,k)];
  }
  if(t<.88){
    const k=(t-.66)/.22;
    return [255,lerp(172,228,k),lerp(26,96,k)];
  }
  const k=(t-.88)/.12;
  return [255,lerp(228,252,k),lerp(96,214,k)];
}

export function fireTongueTexture(size=128){
  const data=new Uint8Array(size*size*4);
  for(let y=0;y<size;y++){
    const v=y/(size-1); // 0=bottom base, 1=flame tip
    for(let x=0;x<size;x++){
      const u=(x/(size-1))*2-1;
      // Organic multi-octave fBM turbulence carving a full, roaring, billowing blaze.
      const n1=fbm2(u*2.4+3.1,v*3.2-1.7,4)*2-1;
      const n2=fbm2(u*5.4-4.2,v*6.0+2.3,3)*2-1;
      const warp=(n1*.24+n2*.09)*Math.pow(v,.68);
      const su=u+warp;
      const spine=Math.sin(v*4.1-.5)*.085*v;

      // Wide roaring furnace cauldron base tapering gracefully to curling tongues.
      const baseBulb=Math.pow(clamp((v-.02)/.20,0,1),.48);
      const taper=Math.pow(clamp(1-(v-.18)/.78,0,1),1.05);
      const halfW=(v<.18?.74*baseBulb:.74*taper)*(.92+.20*n1);
      const dMain=Math.abs(su-spine)/Math.max(.05,halfW);

      // Broad billowing shoulder flames curling organically off both flanks.
      const leftEnv=Math.sin(clamp((v-.05)/.70,0,1)*Math.PI);
      const leftCenter=-.36*(1-v*.36)-Math.sin(v*6.2+.3)*.075;
      const dLeft=leftEnv>.03?Math.abs(su-leftCenter)/(.33*leftEnv):9;

      const rightEnv=Math.sin(clamp((v-.07)/.76,0,1)*Math.PI);
      const rightCenter=.35*(1-v*.34)+Math.sin(v*5.4+.95)*.08;
      const dRight=rightEnv>.03?Math.abs(su-rightCenter)/(.34*rightEnv):9;

      // Upper curling secondary wisp peeling smoothly off the main body for fluid silhouette break-up.
      const wispEnv=Math.sin(clamp((v-.36)/.58,0,1)*Math.PI);
      const wispCenter=.20*Math.sin(v*7.2)+.14*(1-v*.3);
      const dWisp=wispEnv>.03?Math.abs(su-wispCenter)/(.22*wispEnv):9;

      // Full lower hearth body linking base tongues smoothly (no gaps or spindly stems).
      const lowEnv=Math.sin(clamp((v-.03)/.46,0,1)*Math.PI);
      const dLow=lowEnv>.03?Math.abs(su+Math.sin(v*6.2)*.05)/(.68*lowEnv):9;

      const sMain=clamp(1-dMain,0,1);
      const sLeft=clamp(1-dLeft,0,1)*.90;
      const sRight=clamp(1-dRight,0,1)*.92;
      const sWisp=clamp(1-dWisp,0,1)*.78;
      const sLow=clamp(1-dLow,0,1)*.88;
      const shape=clamp(1-(1-sMain)*(1-sLeft*.76)*(1-sRight*.76)*(1-sWisp*.62)*(1-sLow*.70),0,1);

      const upperCarve=lerp(.34,.52,smoothstep(.35,.85,v));
      const edgeDetail=(1-upperCarve*.55)+upperCarve*fbm2(u*4.6+7.1,v*5.6-2.8,4);
      const density=clamp(shape*edgeDetail,0,1);

      // Strict border feathering guarantees alpha === 0 on all edges for zero card seams.
      const borderMask=smoothstep(.02,.13,v)*smoothstep(.98,.84,v)*smoothstep(.98,.78,Math.abs(u));
      // Fuller opacity ramp keeps outer crimson-orange flame shoulders vivid even on bright snow.
      const alpha=smoothstep(.06,.38,density)*borderMask;

      // Rich blackbody temperature: vivid fiery crimson & tangerine across the outer blaze, molten gold inner, incandescent heart strictly at lower core.
      const heart=Math.pow(clamp(1-Math.hypot((su-spine*.45)*2.05,(v-.22)*2.65),0,1),1.80);
      const temp=clamp(Math.pow(density,1.38)*.56+heart*.54-v*.36+n2*.10,0,1);
      const [r,g,b]=blackbodyFireRGB(temp);
      const i=(y*size+x)*4;
      data[i]=Math.round(r);data[i+1]=Math.round(g);data[i+2]=Math.round(b);
      data[i+3]=Math.round(clamp(alpha*.97,0,1)*255);
    }
  }
  const tex=new THREE.DataTexture(data,size,size,THREE.RGBAFormat);
  tex.colorSpace=THREE.SRGBColorSpace;tex.magFilter=THREE.LinearFilter;tex.minFilter=THREE.LinearMipmapLinearFilter;tex.generateMipmaps=true;tex.needsUpdate=true;
  return tex;
}

export function fireLickTexture(size=128){
  const data=new Uint8Array(size*size*4);
  for(let y=0;y<size;y++){
    const v=y/(size-1);
    for(let x=0;x<size;x++){
      const u=(x/(size-1))*2-1;
      // Full curling rising flame tongue for dynamic upward fiery motion.
      const n1=fbm2(u*2.9+9.4,v*3.9+1.9,4)*2-1;
      const n2=fbm2(u*6.0-2.1,v*6.8-3.4,3)*2-1;
      const curl=Math.sin(v*5.0+.4)*.24*Math.pow(v,.82)+n1*.19*v;
      const su=u-curl;
      const env=Math.sin(clamp((v-.03)/.90,0,1)*Math.PI);
      const width=(.18+.44*Math.pow(env,.68))*(1-v*.32)*(.88+.22*n2);
      const d=Math.abs(su)/Math.max(.045,width);
      const body=clamp(1-d,0,1);
      const borderMask=smoothstep(.02,.16,v)*smoothstep(.98,.80,v)*smoothstep(.98,.74,Math.abs(u));
      const intensity=Math.pow(body,1.22)*(.80+.30*fbm2(u*4.6-5.3,v*5.6+4.1,3))*borderMask;
      const temp=clamp(intensity*.62+(1-v)*.24,0,1);
      const [r,g,b]=blackbodyFireRGB(temp);
      // Additive-ready premultiplied fiery emission fades cleanly to pure black at border.
      const i=(y*size+x)*4;
      data[i]=Math.round(clamp(r*intensity,0,255));
      data[i+1]=Math.round(clamp(g*intensity,0,255));
      data[i+2]=Math.round(clamp(b*intensity,0,255));
      data[i+3]=Math.round(clamp(intensity,0,1)*255);
    }
  }
  const tex=new THREE.DataTexture(data,size,size,THREE.RGBAFormat);
  tex.colorSpace=THREE.SRGBColorSpace;tex.magFilter=THREE.LinearFilter;tex.minFilter=THREE.LinearMipmapLinearFilter;tex.generateMipmaps=true;tex.needsUpdate=true;
  return tex;
}

export function fireGlowTexture(size=64){
  const data=new Uint8Array(size*size*4);
  for(let y=0;y<size;y++){
    const v=(y/(size-1))*2-1;
    for(let x=0;x<size;x++){
      const u=(x/(size-1))*2-1,r=Math.hypot(u,v);
      const falloff=Math.pow(clamp(1-r/.96,0,1),2.35);
      const i=(y*size+x)*4;
      data[i]=Math.round(255*falloff);
      data[i+1]=Math.round(142*Math.pow(falloff,1.32));
      data[i+2]=Math.round(36*Math.pow(falloff,2.1));
      data[i+3]=Math.round(255*falloff);
    }
  }
  const tex=new THREE.DataTexture(data,size,size,THREE.RGBAFormat);
  tex.colorSpace=THREE.SRGBColorSpace;tex.magFilter=THREE.LinearFilter;tex.minFilter=THREE.LinearMipmapLinearFilter;tex.generateMipmaps=true;tex.needsUpdate=true;
  return tex;
}

export function emberSparkTexture(size=32){
  const data=new Uint8Array(size*size*4);
  for(let y=0;y<size;y++){
    const v=(y/(size-1))*2-1;
    for(let x=0;x<size;x++){
      const u=(x/(size-1))*2-1,r=Math.hypot(u*1.12,v*.90);
      const glow=Math.pow(clamp(1-r/.94,0,1),2.1);
      const core=Math.pow(clamp(1-r/.42,0,1),1.8);
      const i=(y*size+x)*4;
      data[i]=Math.round(clamp(255*glow+40*core,0,255));
      data[i+1]=Math.round(clamp(158*glow+97*core,0,255));
      data[i+2]=Math.round(clamp(32*glow+185*core,0,255));
      data[i+3]=Math.round(clamp(glow,0,1)*255);
    }
  }
  const tex=new THREE.DataTexture(data,size,size,THREE.RGBAFormat);
  tex.colorSpace=THREE.SRGBColorSpace;tex.magFilter=THREE.LinearFilter;tex.minFilter=THREE.LinearMipmapLinearFilter;tex.generateMipmaps=true;tex.needsUpdate=true;
  return tex;
}

export function smokePlumeTexture(size=128){
  const data=new Uint8Array(size*size*4);
  for(let y=0;y<size;y++){
    const v=(y/(size-1))*2-1;
    for(let x=0;x<size;x++){
      const u=(x/(size-1))*2-1;
      // Multi-lobe turbulent cumulus cloud silhouette warped with 4-octave fBM.
      const n=fbm2(u*2.8+5.2,v*2.8-3.7,4);
      const nFine=fbm2(u*6.1-1.9,v*6.1+4.4,3);
      const wx=u+(n-.5)*.28,wy=v+(nFine-.5)*.24;
      const l1=Math.hypot(wx,wy)*.94;
      const l2=Math.hypot(wx-.27,wy+.17)*1.08;
      const l3=Math.hypot(wx+.26,wy-.15)*1.08;
      const l4=Math.hypot(wx+.07,wy+.26)*1.12;
      const l5=Math.hypot(wx-.16,wy-.24)*1.14;
      const d=Math.min(l1,l2,l3,l4,l5);
      const borderFade=smoothstep(.98,.74,Math.max(Math.abs(u),Math.abs(v)));
      const puff=Math.pow(clamp(1-d/.92,0,1),1.28)*(.76+.36*nFine)*borderFade;
      // Gentle volumetric self-shading: warm charcoal base transitioning to softer grey upper folds.
      const lit=clamp((v+1)*.42+(n-.35)*.45,0,1);
      const shade=56+lit*66;
      const i=(y*size+x)*4;
      data[i]=Math.round(clamp(shade+6,0,255));
      data[i+1]=Math.round(clamp(shade+3,0,255));
      data[i+2]=Math.round(clamp(shade,0,255));
      data[i+3]=Math.round(clamp(puff*1.15,0,1)*232);
    }
  }
  const tex=new THREE.DataTexture(data,size,size,THREE.RGBAFormat);
  tex.colorSpace=THREE.SRGBColorSpace;tex.magFilter=THREE.LinearFilter;tex.minFilter=THREE.LinearMipmapLinearFilter;tex.generateMipmaps=true;tex.needsUpdate=true;
  return tex;
}

export function buildingSmokeLevel(hpRatio){
  return clamp(1-hpRatio/.60,0,1);
}

export function buildingFireLevel(building,hpRatio){
  return building.type==='wall'?0:clamp(1-hpRatio/.50,0,1);
}

const GRAND_BUILDINGS=new Set(['towncenter','keep','wonder']);
const FIRE_TEMPLATES={
  palisade:[
    {rx:.10,rz:.06,hy:.70,scale:.84,threshold:0,tint:0xfff2dc},
  ],
  small:[
    {rx:.18,rz:.14,hy:.76,scale:.94,threshold:0,tint:0xffffff},
    {rx:-.40,rz:-.28,hy:.58,scale:.82,threshold:.20,tint:0xffebd2},
    {rx:-.20,rz:.40,hy:.62,scale:.74,threshold:.42,tint:0xfff4e0},
  ],
  medium:[
    {rx:.18,rz:.14,hy:.78,scale:.98,threshold:0,tint:0xffffff},
    {rx:-.42,rz:-.30,hy:.60,scale:.86,threshold:.16,tint:0xffe6ca},
    {rx:-.26,rz:.42,hy:.64,scale:.80,threshold:.32,tint:0xfff2da},
    {rx:.42,rz:-.30,hy:.54,scale:.76,threshold:.48,tint:0xffdfbe},
  ],
  gate:[
    {rx:.44,rz:.10,hy:.74,scale:.92,threshold:0,tint:0xffffff},
    {rx:-.44,rz:-.10,hy:.72,scale:.88,threshold:.18,tint:0xffead0},
    {rx:.38,rz:-.28,hy:.58,scale:.76,threshold:.36,tint:0xfff3de},
    {rx:-.38,rz:.28,hy:.56,scale:.74,threshold:.50,tint:0xffe2c2},
  ],
  grand:[
    {rx:.12,rz:.08,hy:.74,scale:1.06,threshold:0,tint:0xffffff},
    {rx:-.34,rz:-.28,hy:.58,scale:.92,threshold:.14,tint:0xffe8cc},
    {rx:.35,rz:-.24,hy:.54,scale:.86,threshold:.26,tint:0xfff3dd},
    {rx:-.28,rz:.34,hy:.52,scale:.82,threshold:.38,tint:0xffe0c0},
    {rx:.30,rz:.32,hy:.46,scale:.78,threshold:.52,tint:0xfff5e2},
  ],
};

export function buildingFirePoints(building,{palisadeWall=false}={}){
  if(palisadeWall)return FIRE_TEMPLATES.palisade;
  if(building.type==='wall')return [];
  if(building.type==='gate')return FIRE_TEMPLATES.gate;
  const r=building.r||2;
  if(GRAND_BUILDINGS.has(building.type)||r>3.1)return FIRE_TEMPLATES.grand;
  if(r>2.2)return FIRE_TEMPLATES.medium;
  return FIRE_TEMPLATES.small;
}

function plumeBatch(geometry,material,renderOrder,capacity=80){
  const mesh=new THREE.InstancedMesh(geometry,material,capacity);
  mesh.count=0;mesh.frustumCulled=false;mesh.renderOrder=renderOrder;
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  return mesh;
}

export class BuildingDamageEffects {
  constructor(scene){
    this.dummy=new THREE.Object3D();
    this.bounds=new THREE.Box3();
    this.color=new THREE.Color();
    this.fullBillboardQuat=new THREE.Quaternion();
    this.flameBillboardQuat=new THREE.Quaternion();
    this.rollQuat=new THREE.Quaternion();
    this.camDir=new THREE.Vector3();
    this.camRight=new THREE.Vector3(1,0,0);
    this.axisY=new THREE.Vector3(0,1,0);
    this.axisZ=new THREE.Vector3(0,0,1);
    this.hasCamera=false;

    const transparent={transparent:true,depthWrite:false,side:THREE.DoubleSide,forceSinglePass:true};
    const smokeTex=smokePlumeTexture();
    const fireTex=fireTongueTexture();
    const lickTex=fireLickTexture();
    const glowTex=fireGlowTexture();
    const emberTex=emberSparkTexture();

    // 1. Radiant roof firelight bloom hugging each active blaze base (AdditiveBlending).
    this.glow=plumeBatch(billboardPlaneGeometry(2.85,2.45,.52),new THREE.MeshBasicMaterial({
      ...transparent,map:glowTex,color:0xffffff,opacity:.56,blending:THREE.AdditiveBlending,
    }),2,240);
    this.glow.setColorAt(0,this.color.setRGB(1,.50,.14));

    // 2. Primary roof smoke anchor + billowing rising dark battle smoke column (shared texture).
    this.smoke=plumeBatch(billboardPlaneGeometry(2.65,2.65,.62),new THREE.MeshBasicMaterial({
      ...transparent,map:smokeTex,color:0xffffff,opacity:.64,blending:THREE.NormalBlending,
    }),2,140);
    this.smoke.setColorAt(0,this.color.setRGB(.34,.33,.36));

    this.smokeWisps=plumeBatch(billboardPlaneGeometry(2.55,2.55,.32),new THREE.MeshBasicMaterial({
      ...transparent,map:smokeTex,color:0xffffff,opacity:.54,blending:THREE.NormalBlending,
    }),2,420);
    this.smokeWisps.setColorAt(0,this.color.setRGB(.32,.31,.34));

    // 3. Camera-facing roaring primary flames (straight-alpha NormalBlending — vivid fiery crimson/orange even on bright snow!).
    this.flames=plumeBatch(billboardPlaneGeometry(2.05,2.25,1.02),new THREE.MeshBasicMaterial({
      ...transparent,map:fireTex,color:0xffffff,opacity:.98,blending:THREE.NormalBlending,
    }),3,240);
    // Pre-allocate instanceColor so WebGPU/WebGL never recompile shaders mid-match.
    this.flames.setColorAt(0,this.color.setHex(0xffffff));

    // 4. Continuously ascending sinuous flame licks adding live upward fiery motion (AdditiveBlending).
    this.flameLicks=plumeBatch(billboardPlaneGeometry(1.52,2.02,.94),new THREE.MeshBasicMaterial({
      ...transparent,map:lickTex,color:0xffffff,opacity:.76,blending:THREE.AdditiveBlending,
    }),4,480);
    this.flameLicks.setColorAt(0,this.color.setRGB(1,.54,.14));

    // 5. Rising incandescent embers floating up through the smoke column (AdditiveBlending).
    this.embers=plumeBatch(billboardPlaneGeometry(.28,.34,0),new THREE.MeshBasicMaterial({
      ...transparent,map:emberTex,color:0xffffff,opacity:.98,blending:THREE.AdditiveBlending,
    }),5,360);
    this.embers.setColorAt(0,this.color.setRGB(1,.66,.18));

    this.textures=[smokeTex,fireTex,lickTex,glowTex,emberTex];
    this.batches=[this.glow,this.smoke,this.smokeWisps,this.flames,this.flameLicks,this.embers];
    scene.add(this.glow,this.smoke,this.smokeWisps,this.flames,this.flameLicks,this.embers);
  }
  beginFrame(camera=null){
    for(const batch of this.batches)batch.count=0;
    this.hasCamera=Boolean(camera?.quaternion);
    if(this.hasCamera){
      if(typeof camera.getWorldQuaternion==='function')camera.getWorldQuaternion(this.fullBillboardQuat);
      else this.fullBillboardQuat.copy(camera.quaternion);
      this.camDir.set(0,0,1).applyQuaternion(this.fullBillboardQuat);
      this.camRight.set(1,0,0).applyQuaternion(this.fullBillboardQuat);
      const yaw=Math.atan2(this.camDir.x,this.camDir.z);
      this.flameBillboardQuat.setFromAxisAngle(this.axisY,yaw);
      // Blend 38% toward full spherical camera orientation so flames look tall and volumetric from overhead RTS angles without X-seams.
      this.flameBillboardQuat.slerp(this.fullBillboardQuat,.38);
      this.camDir.y=0;
      if(this.camDir.lengthSq()>1e-6)this.camDir.normalize();
      else this.camDir.set(0,0,1);
    }else{
      this.fullBillboardQuat.identity();
      this.flameBillboardQuat.identity();
      this.camDir.set(0,0,0);
      this.camRight.set(1,0,0);
    }
  }
  addSmokeColumn(bx,by,bz,smokeLevel,grows,baseScale,wx,wz,time,seed,reducedMotion){
    const wisps=this.smokeWisps,maxWisps=wisps.instanceMatrix.count;
    const puffs=grows>.25?3:2;
    const dummy=this.dummy;
    for(let k=0;k<puffs&&wisps.count<maxWisps;k++){
      const cycle=reducedMotion?((k+.5)/puffs):(((time*.22+seed*.17+k/puffs)%1)+1)%1;
      const life=Math.sin(cycle*Math.PI);
      const rise=.42+cycle*(3.4+smokeLevel*2.1);
      const drift=cycle*cycle*(2.6+smokeLevel*1.4);
      const swirlX=reducedMotion?0:Math.sin(time*1.15+seed+k*2.1)*.32*cycle;
      const swirlZ=reducedMotion?0:Math.cos(time*.95+seed+k*1.7)*.32*cycle;
      const puffScale=baseScale*Math.pow(life,.48)*(.64+cycle*1.05);
      dummy.position.set(bx+wx*drift+swirlX,by+rise,bz+wz*drift+swirlZ);
      dummy.quaternion.copy(this.fullBillboardQuat);
      const roll=seed*.9+k*2.09+(reducedMotion?0:cycle*1.15);
      this.rollQuat.setFromAxisAngle(this.axisZ,roll);
      dummy.quaternion.multiply(this.rollQuat);
      dummy.scale.set(puffScale,puffScale*.94,1);
      dummy.updateMatrix();
      const idx=wisps.count++;
      wisps.setMatrixAt(idx,dummy.matrix);
      // Warm fire-lit soot near the base when burning, rising into dramatic dark charcoal battle smoke.
      const fireUnderlight=grows>0?clamp((1-cycle*3.0)*grows,0,1):0;
      const soot=lerp(.54,.24,clamp(grows*.88+smokeLevel*.35,0,1));
      this.color.setRGB(
        clamp(soot+fireUnderlight*.46,0,1),
        clamp(soot*.98+fireUnderlight*.17,0,1),
        clamp(soot*1.03+fireUnderlight*.03,0,1),
      );
      wisps.setColorAt(idx,this.color);
    }
  }
  add(e,node,time,dt,wind,reducedMotion){
    if(e.hp<=0||e.progress<1)return;
    const data=node.userData,hpRatio=e.hp/e.maxHp,smokeLevel=buildingSmokeLevel(hpRatio);
    const palisadeWall=e.type==='wall'&&data.model3d?.wallTier==='palisade';
    const target=palisadeWall?clamp(1-hpRatio/.50,0,1):buildingFireLevel(e,hpRatio);
    if(target<=0)data.fireGrowth=0;
    const smoke=this.smoke,flames=this.flames;
    if(smokeLevel<=0||smoke.count>=smoke.instanceMatrix.count)return;

    if(data.fireHeight===undefined){
      this.bounds.setFromObject(node);
      if(this.bounds.isEmpty()){
        const r=Math.max(.8,e.r||2);
        data.fireHeight=Math.max(1,r*1.5);
        data.fireSpanX=r*1.3;
        data.fireSpanZ=r*1.3;
      }else{
        data.fireHeight=Math.max(.4,this.bounds.max.y-node.position.y);
        data.fireSpanX=Math.max(.8,this.bounds.max.x-this.bounds.min.x);
        data.fireSpanZ=Math.max(.8,this.bounds.max.z-this.bounds.min.z);
      }
    }

    const grows=Math.min(target,(data.fireGrowth??0)+dt*1.5);
    data.fireGrowth=grows;
    const dummy=this.dummy,{x,y,z}=node.position,height=data.fireHeight;
    const halfX=(data.fireSpanX??Math.max(1.2,(e.r||2)*1.3))*.5;
    const halfZ=(data.fireSpanZ??Math.max(1.2,(e.r||2)*1.3))*.5;
    const ox=Math.min(1.1,(e.r||2)*.22),oz=ox*.7;
    const wx=wind?.x??.4,wz=wind?.z??.2;
    const sway=reducedMotion?0:Math.sin(time*1.7+e.id*.71);
    const smokeSize=Math.sqrt(smokeLevel)*(.74+.42*smokeLevel);
    const drift=(.29+sway*.07)*smokeLevel;
    const sx=x+ox+wx*drift,sy=y+height*.96,sz=z+oz+wz*drift;

    dummy.position.set(sx,sy,sz);
    dummy.quaternion.copy(this.fullBillboardQuat);
    this.rollQuat.setFromAxisAngle(this.axisZ,e.id*.7+(reducedMotion?0:time*.18));
    dummy.quaternion.multiply(this.rollQuat);
    dummy.scale.set(smokeSize*(1+sway*.08),smokeSize*(1.08+sway*.10),smokeSize*(1+sway*.08));
    dummy.updateMatrix();
    const sIdx=smoke.count++;
    smoke.setMatrixAt(sIdx,dummy.matrix);
    const baseSoot=lerp(.60,.26,clamp(grows*.85+smokeLevel*.3,0,1));
    this.color.setRGB(baseSoot+grows*.14,baseSoot+grows*.03,baseSoot);
    smoke.setColorAt(sIdx,this.color);

    // Emit continuously billowing dark battle smoke rising downwind from the primary breach.
    this.addSmokeColumn(sx,sy,sz,smokeLevel,grows,smokeSize,wx,wz,time,e.id*1.73,reducedMotion);

    if(grows<=0)return;
    const points=buildingFirePoints(e,{palisadeWall});
    if(!points.length)return;

    // Deterministic orientation per building (skip rotation for gatehouses so flames hug both flanking towers).
    const rotAngle=e.type==='gate'||palisadeWall?0:((e.id*5)%8)*(Math.PI/4);
    const cosR=Math.cos(rotAngle),sinR=Math.sin(rotAngle);
    const footprintScale=clamp(Math.sqrt(halfX*halfZ*4)/3.8,.68,1.16);
    const windSide=wx*this.camRight.x+wz*this.camRight.z;
    const camBias=this.hasCamera?.24:0;
    const maxFlames=flames.instanceMatrix.count;
    const glow=this.glow,maxGlow=glow.instanceMatrix.count;
    const licks=this.flameLicks,maxLicks=licks.instanceMatrix.count;
    const embers=this.embers,maxEmbers=embers.instanceMatrix.count;

    for(let i=0;i<points.length&&flames.count<maxFlames;i++){
      const pt=points[i];
      if(grows<=pt.threshold)continue;
      const local=clamp((grows-pt.threshold)/Math.max(.22,1-pt.threshold),0,1);
      const localGrowth=i===0?grows:Math.pow(local,.74)*grows;
      const phase=e.id*2.13+i*1.97;
      const flicker=reducedMotion?1:1+Math.sin(time*(6.8+i*.85)+phase)*.08+Math.cos(time*(10.6-i*.55)+phase*.7)*.04;
      const breathX=reducedMotion?1:1+Math.sin(time*(5.1+i*.6)+phase*1.3)*.07;
      const flameSize=localGrowth*pt.scale*footprintScale*flicker;
      const lx=pt.rx*halfX,lz=pt.rz*halfZ;
      const fx=x+lx*cosR-lz*sinR+this.camDir.x*camBias*flameSize;
      const fz=z+lx*sinR+lz*cosR+this.camDir.z*camBias*flameSize;
      const fy=y+height*pt.hy;
      const mirror=i%2?-1:1;

      // 1. Subtle radiant roof firelight halo at the base of the flame.
      if(glow.count<maxGlow){
        const glowPulse=reducedMotion?1:.92+.14*Math.sin(time*8.4+phase);
        const gScale=flameSize*(1.02+.18*grows)*glowPulse;
        dummy.position.set(fx,fy+.08,fz);
        dummy.quaternion.copy(this.fullBillboardQuat);
        dummy.scale.set(gScale,gScale*.84,1);
        dummy.updateMatrix();
        const gIdx=glow.count++;
        glow.setMatrixAt(gIdx,dummy.matrix);
        const gi=.68+.32*grows;
        this.color.setRGB(gi,gi*.48,gi*.14);
        glow.setColorAt(gIdx,this.color);
      }

      // 2. Primary camera-facing roaring blaze (zero X-cardboard creases!).
      const leanAngle=reducedMotion?0:clamp(-windSide*.14*grows-Math.sin(time*4.5+phase)*.05,-.24,.24);
      dummy.position.set(fx,fy,fz);
      dummy.quaternion.copy(this.flameBillboardQuat);
      if(leanAngle){
        this.rollQuat.setFromAxisAngle(this.axisZ,leanAngle);
        dummy.quaternion.multiply(this.rollQuat);
      }
      dummy.scale.set(flameSize*1.08*breathX*mirror,flameSize*1.08,flameSize);
      dummy.updateMatrix();
      const idx=flames.count++;
      flames.setMatrixAt(idx,dummy.matrix);
      const heatGlow=reducedMotion?1:.95+.08*Math.sin(time*8.8+phase);
      this.color.setHex(pt.tint).multiplyScalar(heatGlow);
      flames.setColorAt(idx,this.color);

      // 3. Two staggered rising sinuous flame licks curling upward & downwind!
      const lickCount=localGrowth>.24?2:1;
      for(let k=0;k<lickCount&&licks.count<maxLicks;k++){
        const cycle=reducedMotion?(k*.45+.22):(((time*(1.35+i*.11)+phase*.23+k*.5)%1)+1)%1;
        const life=Math.sin(cycle*Math.PI);
        const rise=cycle*(1.12*flameSize);
        const drift=cycle*cycle*(.46*flameSize);
        const lickSign=(i+k)%2?-1:1;
        const wScale=flameSize*(1.02-cycle*.44)*lickSign;
        const hScale=flameSize*(.82+cycle*.52);
        dummy.position.set(fx+wx*drift+this.camDir.x*.05,fy+rise,fz+wz*drift+this.camDir.z*.05);
        dummy.quaternion.copy(this.flameBillboardQuat);
        this.rollQuat.setFromAxisAngle(this.axisZ,leanAngle*1.35+(reducedMotion?0:Math.sin(time*6.2+phase+k*2.4)*.08));
        dummy.quaternion.multiply(this.rollQuat);
        dummy.scale.set(wScale,hScale,1);
        dummy.updateMatrix();
        const lIdx=licks.count++;
        licks.setMatrixAt(lIdx,dummy.matrix);
        const lBright=Math.pow(life,.84)*(.72+.22*grows);
        // Deep fiery orange-amber licks cooling to crimson-orange at pinch-off (stays vibrant on bright snow!).
        this.color.setRGB(lBright,lBright*(.54-cycle*.32),lBright*(.14-cycle*.12));
        licks.setColorAt(lIdx,this.color);
      }

      // 4. Rising glowing sparks & embers swirling up through the smoke plume!
      const emberCount=localGrowth>.35?2:1;
      for(let k=0;k<emberCount&&embers.count<maxEmbers;k++){
        const cycle=reducedMotion?(k*.4+.25):(((time*(.52+i*.06)+phase*.37+k*.5)%1)+1)%1;
        const life=Math.sin(cycle*Math.PI);
        const rise=.35+cycle*(2.6+flameSize*1.6);
        const drift=cycle*cycle*(1.4+grows*.9);
        const swirlX=reducedMotion?0:Math.sin(time*3.6+phase+k*3.1)*(.28*cycle);
        const swirlZ=reducedMotion?0:Math.cos(time*3.1+phase+k*2.7)*(.28*cycle);
        const eSize=(.65+life*.75)*clamp(flameSize,.65,1.25);
        dummy.position.set(fx+wx*drift+swirlX,fy+rise,fz+wz*drift+swirlZ);
        dummy.quaternion.copy(this.fullBillboardQuat);
        dummy.scale.set(eSize,eSize*1.15,1);
        dummy.updateMatrix();
        const eIdx=embers.count++;
        embers.setMatrixAt(eIdx,dummy.matrix);
        const twinkle=reducedMotion?1:.78+.22*Math.sin(time*17+phase+k*4.3);
        const eBright=life*twinkle;
        this.color.setRGB(eBright,eBright*(.80-cycle*.45),eBright*(.28-cycle*.24));
        embers.setColorAt(eIdx,this.color);
      }
    }

    // Large heavily burning structures also vent a secondary billowing smoke plume from their second blaze point.
    if(points.length>=4&&grows>=.45&&smoke.count<smoke.instanceMatrix.count){
      const p2=points[1];
      const lx=p2.rx*halfX,lz=p2.rz*halfZ;
      const s2=smokeSize*.82;
      const sway2=reducedMotion?0:Math.sin(time*1.5+e.id*1.3+2.1);
      const sx2=x+lx*cosR-lz*sinR+wx*drift*.9,sy2=y+height*(p2.hy+.24),sz2=z+lx*sinR+lz*cosR+wz*drift*.9;
      dummy.position.set(sx2,sy2,sz2);
      dummy.quaternion.copy(this.fullBillboardQuat);
      this.rollQuat.setFromAxisAngle(this.axisZ,e.id*1.1+1.6+(reducedMotion?0:-time*.16));
      dummy.quaternion.multiply(this.rollQuat);
      dummy.scale.set(s2*(1+sway2*.08),s2*(1.06+sway2*.10),s2*(1+sway2*.08));
      dummy.updateMatrix();
      const s2Idx=smoke.count++;
      smoke.setMatrixAt(s2Idx,dummy.matrix);
      this.color.setRGB(baseSoot+grows*.10,baseSoot+grows*.02,baseSoot);
      smoke.setColorAt(s2Idx,this.color);
      this.addSmokeColumn(sx2,sy2,sz2,smokeLevel,grows,s2*.92,wx,wz,time,e.id*2.91+3.7,reducedMotion);
    }
  }
  endFrame(){
    for(const batch of this.batches){
      batch.visible=batch.count>0;
      markInstancePrefix(batch);
      if(batch.instanceColor&&batch.count>0){
        batch.instanceColor.clearUpdateRanges();
        batch.instanceColor.addUpdateRange(0,batch.count*3);
        batch.instanceColor.needsUpdate=true;
      }
    }
  }
  dispose(){
    for(const batch of this.batches){
      batch.removeFromParent();batch.geometry.dispose();batch.material.dispose();batch.dispose();
    }
    for(const tex of this.textures)tex.dispose();
  }
}

export function craterScorchTexture(size=64){
  const data=new Uint8Array(size*size*4);
  for(let y=0;y<size;y++){
    const v=(y/(size-1))*2-1;
    for(let x=0;x<size;x++){
      const u=(x/(size-1))*2-1,r=Math.hypot(u,v),ang=Math.atan2(v,u);
      const rays=.86+.14*Math.sin(ang*9+r*4)+.09*Math.cos(ang*15-r*7);
      const rad=r/rays;
      const alpha=Math.pow(clamp(1-rad/.95,0,1),1.75);
      const pit=clamp(1-rad/.45,0,1);
      const rim=Math.exp(-Math.pow((rad-.42)/.12,2));
      const ember=rim*clamp(Math.sin(ang*19+r*11)*Math.cos(ang*13-r*8),0,1);
      const soot=16+(1-pit)*34;
      const i=(y*size+x)*4;
      data[i]=clamp(soot*1.08+ember*88,0,255);
      data[i+1]=clamp(soot*.92+ember*34,0,255);
      data[i+2]=clamp(soot*.76+ember*8,0,255);
      data[i+3]=Math.round(clamp(alpha,0,1)*242);
    }
  }
  const tex=new THREE.DataTexture(data,size,size,THREE.RGBAFormat);
  tex.colorSpace=THREE.SRGBColorSpace;tex.magFilter=THREE.LinearFilter;tex.minFilter=THREE.LinearMipmapLinearFilter;tex.generateMipmaps=true;tex.needsUpdate=true;
  return tex;
}
export function dustPuffTexture(size=32){
  const data=new Uint8Array(size*size*4);
  for(let y=0;y<size;y++){
    const v=(y/(size-1))*2-1;
    for(let x=0;x<size;x++){
      const u=(x/(size-1))*2-1,r=Math.hypot(u,v);
      const wisp=.88+.12*Math.sin(u*7+v*5);
      const alpha=Math.pow(clamp(1-r/.94,0,1),1.7)*wisp;
      const i=(y*size+x)*4;
      data[i]=196;data[i+1]=182;data[i+2]=152;data[i+3]=Math.round(clamp(alpha,0,1)*220);
    }
  }
  const tex=new THREE.DataTexture(data,size,size,THREE.RGBAFormat);
  tex.colorSpace=THREE.SRGBColorSpace;tex.magFilter=THREE.LinearFilter;tex.minFilter=THREE.LinearMipmapLinearFilter;tex.generateMipmaps=true;tex.needsUpdate=true;
  return tex;
}
export function wakeFoamTexture(size=64){
  const data=new Uint8Array(size*size*4);
  const smooth=(a,b,x)=>{const t=clamp((x-a)/(b-a),0,1);return t*t*(3-2*t);};
  for(let y=0;y<size;y++){
    const v=y/(size-1); // 0 = stern apex, 1 = aft trailing dissolve
    for(let x=0;x<size;x++){
      const u=(x/(size-1))*2-1,au=Math.abs(u);
      const armX=.08+.64*Math.pow(v,.85);
      const armWidth=.14+.24*v;
      const arm=Math.pow(clamp(1-Math.abs(au-armX)/armWidth,0,1),1.85);
      const inner=clamp(1-au/Math.max(.12,armX*.92),0,1);
      const ripple=.55+.45*Math.sin(v*18-au*6.5);
      const wash=inner*inner*.42*ripple*(1-v*.55);
      const froth=.72+.28*Math.sin(u*13+v*9.5)*Math.cos(v*15-u*8);
      const frontFade=smooth(0,.16,v),tailFade=smooth(1,.28,v),sideFade=smooth(1,.72,au);
      const alpha=clamp((arm*.92+wash)*froth*frontFade*tailFade*sideFade,0,1);
      const i=(y*size+x)*4;
      data[i]=232;data[i+1]=246;data[i+2]=248;data[i+3]=Math.round(alpha*225);
    }
  }
  const tex=new THREE.DataTexture(data,size,size,THREE.RGBAFormat);
  tex.flipY=false;tex.colorSpace=THREE.SRGBColorSpace;tex.magFilter=THREE.LinearFilter;tex.minFilter=THREE.LinearMipmapLinearFilter;tex.generateMipmaps=true;tex.needsUpdate=true;
  return tex;
}
function wakeGeometry(){
  // Horizontal plane extending aft (-Z) from the stern with feathered seafoam UVs.
  const g=new THREE.PlaneGeometry(2.8,3.2);
  g.rotateX(-Math.PI/2);
  g.translate(0,0,-1.45);
  return g;
}

// Opaque projectiles share one instanced draw per shape. Melee slashes
// retain individual opacity and transparent sorting.
export class FlightEffects{
  constructor(){
    this.geometry={arrow:arrowGeometry(),firearrow:fireArrowGeometry(),javelin:javelinGeometry(),stone:stoneGeometry(),fireball:fireballGeometry(),cannonball:cannonballGeometry(),slash:new THREE.TorusGeometry(.42,.022,4,16,Math.PI*.78)};
    this.material={
      arrow:standardMaterial({vertexColors:true,roughness:.75,metalness:.18}),
      firearrow:standardMaterial({vertexColors:true,emissive:0xff6b1c,emissiveIntensity:1.1,roughness:.45}),
      javelin:standardMaterial({vertexColors:true,roughness:.70,metalness:.26}),
      stone:standardMaterial({vertexColors:true,roughness:.94}),
      fireball:standardMaterial({vertexColors:true,emissive:0xff5512,emissiveIntensity:1.35,roughness:.42}),
      cannonball:standardMaterial({vertexColors:true,emissive:0xff6a1c,emissiveIntensity:.65,roughness:.45,metalness:.68}),
    };
    this.free={arrow:[],firearrow:[],javelin:[],stone:[],fireball:[],cannonball:[],slash:[]};this.retained=new Set();this.limit=96;this.batches={};
  }
  acquire(kind){
    let mesh=this.free[kind].pop();
    if(!mesh){
      mesh=kind==='slash'
        ?new THREE.Mesh(this.geometry.slash,standardMaterial({color:0xe0d6b1,transparent:true,opacity:0,depthWrite:false,roughness:.6}))
        :new THREE.Object3D();
      mesh.userData.flightKind=kind;
      this.retained.add(mesh);
    }
    mesh.visible=true;mesh.scale.setScalar(1);mesh.quaternion.identity();return mesh;
  }
  clearBatches(){
    for(const batch of Object.values(this.batches)){batch.count=0;batch.visible=false;}
  }
  syncBatches(view){
    this.clearBatches();
    const fog=view.battleFog?.enabled.value;
    for(const effect of view.fx){
      const {kind,object}=effect;
      if(!['arrow','firearrow','javelin','stone','fireball','cannonball'].includes(kind)||!object.visible)continue;
      if(fog&&!view.sim.isVisible(object.position.x,object.position.z))continue;
      let batch=this.batches[kind];
      if(!batch){
        batch=this.batches[kind]=new THREE.InstancedMesh(this.geometry[kind],this.material[kind],this.limit);
        batch.name=kind==='fireball'?'Trebuchet fire boulders':kind==='cannonball'?'Bombard cannonballs':kind==='javelin'?'Skirmisher javelins':kind==='firearrow'?'Flaming arrows':kind==='arrow'?'Battlefield arrows':'Battlefield siege stones';
        batch.userData.flightKind=kind;
        batch.frustumCulled=false;
        batch.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
        batch.count=0;
        view.scene.add(batch);
      }
      if(batch.count>=this.limit)continue;
      object.updateMatrix();
      batch.setMatrixAt(batch.count++,object.matrix);
      batch.visible=true;
    }
    for(const batch of Object.values(this.batches))markInstancePrefix(batch);
  }
  release(mesh){
    mesh.removeFromParent();mesh.visible=false;
    const kind=mesh.userData.flightKind;
    if(this.retained.size>this.limit){this.retained.delete(mesh);if(kind==='slash')mesh.material.dispose();}
    else if(!this.free[kind].includes(mesh))this.free[kind].push(mesh);
  }
  dispose(){
    if(this.disposed)return;
    this.disposed=true;
    for(const batch of Object.values(this.batches)){batch.removeFromParent();batch.dispose();}
    this.batches={};
    for(const mesh of this.retained){mesh.removeFromParent();if(mesh.userData.flightKind==='slash')mesh.material.dispose();}
    for(const geometry of Object.values(this.geometry))geometry.dispose();for(const material of Object.values(this.material))material.dispose();
    this.retained.clear();for(const list of Object.values(this.free))list.length=0;
  }
}

// Retain short-lived feedback between attacks. Disposing its last material
// after each quiet gap can discard its linked GPU program as well.
export class ImpactEffects{
  constructor(){
    this.geometry={burst:splinterGeometry(),heal:new THREE.TorusGeometry(.85,.035,5,28)};
    this.textures={};
    this.free={burst:[],heal:[]};this.retained=new Set();this.limit=48;this.disposed=false;
  }
  acquire(kind,color=kind==='heal'?0x91e0b4:kind==='sparks'?0xffe680:0xe8c28b){
    if(this.disposed)throw new Error('Impact effects have been disposed.');
    if(!this.free[kind])this.free[kind]=[];
    let mesh=this.free[kind].pop();
    if(!mesh){
      if(kind==='sparks'){
        this.geometry.sparks??=new THREE.BoxGeometry(.025,.025,.34);
        const material=new THREE.MeshBasicMaterial({color,transparent:true,opacity:.9,depthWrite:false});
        mesh=new THREE.InstancedMesh(this.geometry.sparks,material,12);
        mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);mesh.frustumCulled=false;mesh.userData.velocities=Array.from({length:12},()=>({x:0,y:0,z:0}));
      }else if(kind==='crater'){
        this.geometry.crater??=craterGeometry();
        this.textures.crater??=craterScorchTexture();
        const material=new THREE.MeshBasicMaterial({map:this.textures.crater,color:0xffffff,transparent:true,opacity:.7,depthWrite:false,side:THREE.DoubleSide,polygonOffset:true,polygonOffsetFactor:-1,polygonOffsetUnits:-1});
        mesh=new THREE.Mesh(this.geometry.crater,material);
      }else if(kind==='dust'){
        this.geometry.dust??=crossedPlumeGeometry(.82,.58,.24);
        this.textures.dust??=dustPuffTexture();
        const material=new THREE.MeshBasicMaterial({map:this.textures.dust,color,transparent:true,opacity:.34,depthWrite:false,side:THREE.DoubleSide});
        mesh=new THREE.Mesh(this.geometry.dust,material);
      }else if(kind==='wake'){
        this.geometry.wake??=wakeGeometry();
        this.textures.wake??=wakeFoamTexture();
        const material=new THREE.MeshBasicMaterial({map:this.textures.wake,color:0xe4f3f2,transparent:true,opacity:.06,depthWrite:false,side:THREE.DoubleSide,polygonOffset:true,polygonOffsetFactor:-1,polygonOffsetUnits:-1});
        mesh=new THREE.Mesh(this.geometry.wake,material);
      }else{
        const material=kind==='burst'?standardMaterial({color,roughness:.9,transparent:true,opacity:.8}):new THREE.MeshBasicMaterial({color,transparent:true,opacity:.7,depthWrite:false,side:THREE.DoubleSide});
        mesh=kind==='burst'?new THREE.InstancedMesh(this.geometry.burst,material,8):new THREE.Mesh(this.geometry.heal,material);
        if(kind==='burst'){mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);mesh.frustumCulled=false;mesh.userData.velocities=Array.from({length:8},()=>({x:0,y:0,z:0}));}
      }
      mesh.userData.impactKind=kind;this.retained.add(mesh);
    }
    if(kind==='sparks'){mesh.material.color.setHex(color);mesh.material.opacity=.9;}
    else if(kind==='crater'){mesh.material.opacity=.7;}
    else if(kind==='dust'){mesh.material.color.setHex(color);mesh.material.opacity=.34;}
    else if(kind==='wake'){mesh.material.opacity=.06;}
    else{mesh.material.color.setHex(color);mesh.material.opacity=kind==='burst'?.8:.7;}
    mesh.visible=true;mesh.position.set(0,0,0);mesh.scale.setScalar(1);mesh.quaternion.identity();return mesh;
  }
  release(mesh){
    if(!this.retained.has(mesh))return;
    mesh.removeFromParent();mesh.visible=false;
    if(this.retained.size>this.limit){this.retained.delete(mesh);mesh.material.dispose();if(mesh.isInstancedMesh)mesh.dispose();}
    else{const list=this.free[mesh.userData.impactKind]??=[];if(!list.includes(mesh))list.push(mesh);}
  }
  dispose(){
    if(this.disposed)return;this.disposed=true;
    for(const mesh of this.retained){mesh.removeFromParent();mesh.material.dispose();if(mesh.isInstancedMesh)mesh.dispose();}
    for(const geometry of Object.values(this.geometry))geometry.dispose();
    for(const texture of Object.values(this.textures))texture.dispose();
    this.retained.clear();for(const list of Object.values(this.free))list.length=0;
  }
}

// Reuse lightweight attack tracer/ring meshes and geometries instead of
// allocating GPU buffers per weapon swing or projectile release.
export class AttackEffects{
  constructor(){
    this.geometry={
      siege:new THREE.SphereGeometry(.3,5,4),
      arrow:new THREE.SphereGeometry(.09,5,4),
      slash:new THREE.RingGeometry(.3,.6,8),
    };
    this.free={siege:[],arrow:[],slash:[]};
    this.retained=new Set();
    this.limit=64;
    this.disposed=false;
  }
  acquire(kind,color=0xf3db9b){
    if(this.disposed)throw new Error('Attack effects have been disposed.');
    const key=this.geometry[kind]?kind:'arrow';
    let mesh=this.free[key].pop();
    if(!mesh){
      const material=new THREE.MeshBasicMaterial({color,transparent:true,opacity:1});
      mesh=new THREE.Mesh(this.geometry[key],material);
      mesh.userData.attackKind=key;
      this.retained.add(mesh);
    }
    mesh.material.color.setHex(color);
    mesh.material.opacity=1;
    mesh.visible=true;
    mesh.position.set(0,0,0);
    mesh.scale.setScalar(1);
    mesh.quaternion.identity();
    return mesh;
  }
  release(mesh){
    if(!this.retained.has(mesh))return;
    mesh.removeFromParent();
    mesh.visible=false;
    if(this.retained.size>this.limit){
      this.retained.delete(mesh);
      mesh.material.dispose();
    }else{
      const list=this.free[mesh.userData.attackKind]??=[];
      if(!list.includes(mesh))list.push(mesh);
    }
  }
  dispose(){
    if(this.disposed)return;
    this.disposed=true;
    for(const mesh of this.retained){mesh.removeFromParent();mesh.material.dispose();}
    for(const geometry of Object.values(this.geometry))geometry.dispose();
    this.retained.clear();
    for(const list of Object.values(this.free))list.length=0;
  }
}
