import {standardMaterial} from './render-runtime.js';
import * as THREE from 'three';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';
import {UNITS} from './data.js';
import {siegeArmAngle,projectileTargetHeight} from './combat-timing.js';
import {bowArcher,bowReleasePoint} from './archery-pose.js';
import {visualBodyOffset} from './foot-placement.js';
import {markInstancePrefix} from './render-batches.js';

const clamp=(value,lo,hi)=>Math.max(lo,Math.min(hi,value));
const buildingHeight=type=>({tower:6.2,keep:9.5,towncenter:5.8,wall:2.4,gate:3.8}[type]||2.6);

export function witnessedEffect(view,entity){
  const sim=view.sim;
  return entity.owner===0||!sim||sim.options?.spectator||sim.isVisible(entity.x,entity.z);
}

// Cosmetic flight follows the visible/interpolated figures. Damage and attack
// timing remain authoritative simulation events, independent of visual quality.
export function attackFlight(view,entity,target,arrowIndex=0,event={}){
  const def=UNITS[entity.type],ranged=entity.kind==='building'||(def?.range||0)>5;
  const siege=['catapult','trebuchet','warship'].includes(entity.type);
  const fireball=Boolean(event.fireball||entity.type==='trebuchet');
  const flaming=Boolean(!siege&&ranged&&(event.flaming||view.sim?.players?.[entity.owner]?.tech?.fireArrows>0));
  const kind=fireball?'fireball':siege?'stone':flaming?'firearrow':ranged?'arrow':'slash';
  const x=entity.renderX??entity.x,z=entity.renderZ??entity.z;
  const tx=target.renderX??target.x,tz=target.renderZ??target.z;
  const distance=Math.hypot(tx-x,tz-z),heading=Math.atan2(tx-x,tz-z);
  const ground=view.entityHeight(entity,x,z)+(entity.kind==='unit'?visualBodyOffset(view,entity):0),targetGround=view.entityHeight(target,tx,tz)+(target.kind==='unit'?visualBodyOffset(view,target):0);
  const height=entity.kind==='building'?buildingHeight(entity.type):def?.naval?2.1:entity.type==='trebuchet'?4.4:entity.type==='catapult'?3.3:1.95;
  const localX=(kind==='arrow'||kind==='firearrow')&&entity.kind==='unit'&&!def?.naval?-.48:entity.kind==='building'&&arrowIndex>0?(arrowIndex%2?-1:1)*Math.ceil(arrowIndex/2)*.55:0;
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
  return {kind,from,to,duration:event.flightDuration??(siege?clamp(distance/(entity.type==='trebuchet'?26:30),.45,1.65):ranged?clamp(distance/34,.14,.65):.19),
    arc:fireball?clamp(distance*.38,4,15):siege?clamp(distance*(entity.type==='warship'?.18:.32),2,12):ranged?clamp(distance*.045,.18,1.4):.12,
    alignFlight:true,impact:siege&&!event.pendingImpact,fireball,flaming,authoritative:!!event.pendingImpact,releasedAt:event.releasedAt,tracked:!siege&&event.pendingImpact?target.id:null,impactColor:fireball?0xff8c38:UNITS[target.type]?.naval?0xa6c9c4:0xb5aa95,impactSize:fireball?2.35:siege?1.6:0};
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
export function fireTongueTexture(size=128){
  const data=new Uint8Array(size*size*4);
  for(let y=0;y<size;y++){
    const v=y/(size-1); // 0=bottom base, 1=flame tip
    for(let x=0;x<size;x++){
      const u=(x/(size-1))*2-1;
      // Wide roaring multi-tongue medieval fire: central blaze + 3 curling flanking tongues.
      const sway=Math.sin(v*5.6+Math.cos(v*2.7))*.11*v;
      const tMain=Math.abs(u-sway)/Math.max(.08,(1-Math.pow(v,.92))*(.66+.14*Math.sin(v*9.5+u*2.8)));
      const tLeft=Math.abs(u+.36*(1-v*.58)-sway*.65)/Math.max(.07,(1-Math.pow(clamp(v/.84,0,1),.86))*.46);
      const tRight=Math.abs(u-.38*(1-v*.55)+sway*.55)/Math.max(.07,(1-Math.pow(clamp(v/.88,0,1),.84))*.48);
      const tLow=Math.abs(u+.16*Math.sin(v*6.2))/Math.max(.08,(1-Math.pow(clamp(v/.62,0,1),.95))*.78);
      const shape=Math.max(
        clamp(1-tMain,0,1),
        clamp(1-tLeft,0,1)*.92,
        clamp(1-tRight,0,1)*.94,
        clamp(1-tLow,0,1)*.88,
      );
      const turbulence=.82+.18*Math.sin(u*9.8-v*11.4)*Math.cos(v*6.7+u*5.1);
      const baseFade=clamp(v/.11,0,1);
      const tipFade=clamp((1-v)/.18,0,1);
      const sideFade=clamp((1-Math.abs(u))/.11,0,1);
      const mask=baseFade*tipFade*sideFade;
      const body=Math.pow(shape,.78)*turbulence*mask;
      // Rich heat gradient (NormalBlending): deep crimson-red outer tongues -> vivid orange -> golden inner heart -> hot yellow base.
      const midHeat=Math.pow(clamp(shape*1.12-v*.42,0,1),1.25)*mask;
      const core=Math.pow(clamp(1-Math.hypot((u-sway)*.92,(v-.24)*1.65),0,1),1.65)*mask;
      // Detached glowing ember flecks rising above the curling tips.
      const e1=Math.pow(clamp(1-Math.hypot((u-.22)*10.5,(v-.82)*10.5),0,1),1.5);
      const e2=Math.pow(clamp(1-Math.hypot((u+.26)*11.0,(v-.76)*11.0),0,1),1.5);
      const e3=Math.pow(clamp(1-Math.hypot((u-.03)*11.5,(v-.89)*11.5),0,1),1.5);
      const ember=(e1+e2*.92+e3*.88)*mask;

      const r=clamp(212*body+55*midHeat+40*core+255*ember,0,255);
      const g=clamp(42*body+148*midHeat+102*core+152*ember,0,255);
      const b=clamp(6*body+22*midHeat+118*core+28*ember,0,255);
      const a=clamp((body*1.12+midHeat*.35+ember*.95)*255,0,255);
      const i=(y*size+x)*4;
      data[i]=r;data[i+1]=g;data[i+2]=b;data[i+3]=a;
    }
  }
  const tex=new THREE.DataTexture(data,size,size,THREE.RGBAFormat);
  tex.colorSpace=THREE.SRGBColorSpace;tex.magFilter=THREE.LinearFilter;tex.minFilter=THREE.LinearMipmapLinearFilter;tex.generateMipmaps=true;tex.needsUpdate=true;
  return tex;
}
export function smokePlumeTexture(size=64){
  const data=new Uint8Array(size*size*4);
  for(let y=0;y<size;y++){
    const v=(y/(size-1))*2-1;
    for(let x=0;x<size;x++){
      const u=(x/(size-1))*2-1;
      // Multi-lobe billowing charcoal smoke silhouette with feathered edges.
      const l1=Math.hypot(u,v)*.92;
      const l2=Math.hypot(u-.28,v+.16)*1.08;
      const l3=Math.hypot(u+.26,v-.14)*1.10;
      const l4=Math.hypot(u+.08,v+.24)*1.14;
      const d=Math.min(l1,l2,l3,l4);
      const wisp=.88+.12*Math.sin(u*7.4+v*5.6)*Math.cos(v*8.1-u*4.8);
      const borderFade=clamp((1-Math.max(Math.abs(u),Math.abs(v)))/.14,0,1);
      const edge=Math.pow(clamp(1-d/.94,0,1),1.25)*wisp*borderFade;
      const shade=42+Math.round(clamp((v+1)*.5,0,1)*54);
      const i=(y*size+x)*4;
      data[i]=shade+10;data[i+1]=shade+5;data[i+2]=shade;data[i+3]=Math.round(clamp(edge*1.18,0,1)*242);
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
    {rx:.12,rz:.06,hy:.74,scale:.88,threshold:0,tint:0xffe4b8},
  ],
  small:[
    {rx:.22,rz:.16,hy:.80,scale:.96,threshold:0,tint:0xfff0cc},
    {rx:-.46,rz:-.30,hy:.62,scale:.84,threshold:.20,tint:0xffbf7c},
    {rx:-.22,rz:.46,hy:.66,scale:.76,threshold:.42,tint:0xffd89e},
  ],
  medium:[
    {rx:.22,rz:.16,hy:.82,scale:1.02,threshold:0,tint:0xfff0cc},
    {rx:-.48,rz:-.34,hy:.64,scale:.90,threshold:.16,tint:0xffba74},
    {rx:-.30,rz:.48,hy:.68,scale:.84,threshold:.32,tint:0xffd698},
    {rx:.48,rz:-.34,hy:.58,scale:.80,threshold:.48,tint:0xffaa62},
  ],
  gate:[
    {rx:.46,rz:.12,hy:.76,scale:.94,threshold:0,tint:0xffecc2},
    {rx:-.46,rz:-.12,hy:.74,scale:.90,threshold:.18,tint:0xffc27e},
    {rx:.40,rz:-.30,hy:.60,scale:.78,threshold:.36,tint:0xffd89e},
    {rx:-.40,rz:.30,hy:.58,scale:.76,threshold:.50,tint:0xffb26a},
  ],
  grand:[
    {rx:.16,rz:.12,hy:.84,scale:1.14,threshold:0,tint:0xfff2d2},
    {rx:-.48,rz:-.38,hy:.72,scale:1.02,threshold:.14,tint:0xffc07a},
    {rx:.48,rz:-.32,hy:.66,scale:.94,threshold:.26,tint:0xffda9e},
    {rx:-.36,rz:.48,hy:.60,scale:.90,threshold:.38,tint:0xffb068},
    {rx:.38,rz:.44,hy:.54,scale:.84,threshold:.52,tint:0xffe2ae},
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
    const transparent={transparent:true,depthWrite:false,side:THREE.DoubleSide,forceSinglePass:true};
    this.flames=plumeBatch(crossedPlumeGeometry(2.2,2.4,1.08),new THREE.MeshBasicMaterial({
      ...transparent,map:fireTongueTexture(),color:0xffffff,opacity:.94,blending:THREE.NormalBlending,
    }),3,240);
    // Pre-allocate instanceColor so WebGPU/WebGL never recompile shaders mid-match.
    this.flames.setColorAt(0,this.color.setHex(0xffa448));
    this.smoke=plumeBatch(crossedPlumeGeometry(2.8,2.7,.92),new THREE.MeshBasicMaterial({
      ...transparent,map:smokePlumeTexture(),opacity:.58,
    }),2,140);
    scene.add(this.flames,this.smoke);
  }
  beginFrame(){this.flames.count=0;this.smoke.count=0;}
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
    const sway=reducedMotion?0:Math.sin(time*1.7+e.id*.71);
    const smokeSize=Math.sqrt(smokeLevel)*(.76+.45*smokeLevel);
    const drift=(.29+sway*.07)*smokeLevel;
    dummy.position.set(x+ox+(wind?.x??.4)*drift,y+height*.96,z+oz+(wind?.z??.2)*drift);
    dummy.rotation.set(0,e.id*.7,0);
    dummy.scale.set(smokeSize*(1+sway*.10),smokeSize*(1.15+sway*.13),smokeSize*(1+sway*.10));
    dummy.updateMatrix();
    smoke.setMatrixAt(smoke.count++,dummy.matrix);

    if(grows<=0)return;
    const points=buildingFirePoints(e,{palisadeWall});
    if(!points.length)return;

    // Deterministic orientation per building (skip rotation for gatehouses so flames hug both flanking towers).
    const rotAngle=e.type==='gate'||palisadeWall?0:((e.id*5)%8)*(Math.PI/4);
    const cosR=Math.cos(rotAngle),sinR=Math.sin(rotAngle);
    const footprintScale=clamp(Math.sqrt(halfX*halfZ*4)/3.4,.74,1.34);
    const wx=wind?.x??.4,wz=wind?.z??.2;
    const maxFlames=flames.instanceMatrix.count;

    for(let i=0;i<points.length&&flames.count<maxFlames;i++){
      const pt=points[i];
      if(grows<=pt.threshold)continue;
      const local=clamp((grows-pt.threshold)/Math.max(.22,1-pt.threshold),0,1);
      const localGrowth=i===0?grows:Math.pow(local,.74)*grows;
      const phase=e.id*2.13+i*1.97;
      const flicker=reducedMotion?1:1+Math.sin(time*(7.2+i*.85)+phase)*.10+Math.cos(time*(11.4-i*.6)+phase*.7)*.05;
      const flameSize=localGrowth*pt.scale*footprintScale*flicker;
      const lx=pt.rx*halfX,lz=pt.rz*halfZ;
      const fx=x+lx*cosR-lz*sinR,fz=z+lx*sinR+lz*cosR;
      const fy=y+height*pt.hy;
      const leanX=reducedMotion?0:wz*.08*grows+Math.sin(time*4.8+phase)*.04;
      const leanZ=reducedMotion?0:-wx*.08*grows+Math.cos(time*4.3+phase)*.04;

      dummy.position.set(fx,fy,fz);
      dummy.rotation.set(leanX,e.id*.7+i*1.37,leanZ);
      dummy.scale.set(flameSize*1.26,flameSize*1.12,flameSize*1.26);
      dummy.updateMatrix();
      const idx=flames.count++;
      flames.setMatrixAt(idx,dummy.matrix);
      const heatGlow=reducedMotion?1:.92+.16*Math.sin(time*9.2+phase);
      this.color.setHex(pt.tint).multiplyScalar(heatGlow);
      flames.setColorAt(idx,this.color);
    }

    // Large heavily burning structures also vent a secondary smoke plume from their second blaze point.
    if(points.length>=4&&grows>=.45&&smoke.count<smoke.instanceMatrix.count){
      const p2=points[1];
      const lx=p2.rx*halfX,lz=p2.rz*halfZ;
      const s2=smokeSize*.82;
      const sway2=reducedMotion?0:Math.sin(time*1.5+e.id*1.3+2.1);
      dummy.position.set(x+lx*cosR-lz*sinR+wx*drift*.9,y+height*(p2.hy+.24),z+lx*sinR+lz*cosR+wz*drift*.9);
      dummy.rotation.set(0,e.id*1.1+1.6,0);
      dummy.scale.set(s2*(1+sway2*.10),s2*(1.12+sway2*.12),s2*(1+sway2*.10));
      dummy.updateMatrix();
      smoke.setMatrixAt(smoke.count++,dummy.matrix);
    }
  }
  endFrame(){
    markInstancePrefix(this.flames);
    if(this.flames.instanceColor&&this.flames.count>0){
      this.flames.instanceColor.clearUpdateRanges();
      this.flames.instanceColor.addUpdateRange(0,this.flames.count*3);
      this.flames.instanceColor.needsUpdate=true;
    }
    markInstancePrefix(this.smoke);
  }
  dispose(){
    for(const batch of [this.flames,this.smoke]){
      batch.removeFromParent();batch.geometry.dispose();batch.material.map.dispose();batch.material.dispose();batch.dispose();
    }
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
    this.geometry={arrow:arrowGeometry(),firearrow:fireArrowGeometry(),stone:stoneGeometry(),fireball:fireballGeometry(),slash:new THREE.TorusGeometry(.42,.022,4,16,Math.PI*.78)};
    this.material={
      arrow:standardMaterial({vertexColors:true,roughness:.75,metalness:.18}),
      firearrow:standardMaterial({vertexColors:true,emissive:0xff6b1c,emissiveIntensity:1.1,roughness:.45}),
      stone:standardMaterial({vertexColors:true,roughness:.94}),
      fireball:standardMaterial({vertexColors:true,emissive:0xff5512,emissiveIntensity:1.35,roughness:.42}),
    };
    this.free={arrow:[],firearrow:[],stone:[],fireball:[],slash:[]};this.retained=new Set();this.limit=96;this.batches={};
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
      if(!['arrow','firearrow','stone','fireball'].includes(kind)||!object.visible)continue;
      if(fog&&!view.sim.isVisible(object.position.x,object.position.z))continue;
      let batch=this.batches[kind];
      if(!batch){
        batch=this.batches[kind]=new THREE.InstancedMesh(this.geometry[kind],this.material[kind],this.limit);
        batch.name=kind==='fireball'?'Trebuchet fire boulders':kind==='firearrow'?'Flaming arrows':kind==='arrow'?'Battlefield arrows':'Battlefield siege stones';
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
