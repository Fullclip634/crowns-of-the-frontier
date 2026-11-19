import {standardMaterial} from './render-runtime.js';
import * as THREE from 'three';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';
import {UNITS} from './data.js';
import {siegeArmAngle,projectileTargetHeight} from './combat-timing.js';
import {bowArcher,bowReleasePoint} from './archery-pose.js';
import {visualBodyOffset} from './foot-placement.js';
import {markInstancePrefix} from './render-batches.js';

const clamp=(value,lo,hi)=>Math.max(lo,Math.min(hi,value));
const buildingHeight=type=>({tower:6.2,keep:7.5,towncenter:5.8,wall:2.4,gate:3.8}[type]||2.6);

export function witnessedEffect(view,entity){
  const sim=view.sim;
  return entity.owner===0||!sim||sim.options?.spectator||sim.isVisible(entity.x,entity.z);
}

// Cosmetic flight follows the visible/interpolated figures. Damage and attack
// timing remain authoritative simulation events, independent of visual quality.
export function attackFlight(view,entity,target,arrowIndex=0,event={}){
  const def=UNITS[entity.type],ranged=entity.kind==='building'||(def?.range||0)>5;
  const siege=['catapult','warship'].includes(entity.type),kind=siege?'stone':ranged?'arrow':'slash';
  const x=entity.renderX??entity.x,z=entity.renderZ??entity.z;
  const tx=target.renderX??target.x,tz=target.renderZ??target.z;
  const distance=Math.hypot(tx-x,tz-z),heading=Math.atan2(tx-x,tz-z);
  const ground=view.entityHeight(entity,x,z)+(entity.kind==='unit'?visualBodyOffset(view,entity):0),targetGround=view.entityHeight(target,tx,tz)+(target.kind==='unit'?visualBodyOffset(view,target):0);
  const height=entity.kind==='building'?buildingHeight(entity.type):def?.naval?2.1:entity.type==='catapult'?3.3:1.95;
  const localX=kind==='arrow'&&entity.kind==='unit'&&!def?.naval?-.48:entity.kind==='building'&&arrowIndex>0?(arrowIndex%2?-1:1)*Math.ceil(arrowIndex/2)*.55:0;
  const forward=entity.kind==='building'?Math.min(2,entity.r||1):def?.naval?1.7:entity.type==='catapult'?1.1:.65;
  const from=new THREE.Vector3(x+Math.cos(heading)*localX+Math.sin(heading)*forward,ground+height,z-Math.sin(heading)*localX+Math.cos(heading)*forward);
  if(bowArcher(entity)){const p=bowReleasePoint;from.set(x+Math.cos(heading)*p.x+Math.sin(heading)*p.z,ground+p.y,z-Math.sin(heading)*p.x+Math.cos(heading)*p.z);}
  if(entity.type==='catapult'&&event.pendingImpact){
    const angle=siegeArmAngle(entity),y=1.33*Math.cos(angle)+2.66*Math.sin(angle)+2.8,offset=1.33*Math.sin(angle)-2.66*Math.cos(angle);
    from.set(x+Math.sin(heading)*offset,ground+y,z+Math.cos(heading)*offset);
  }
  if(arrowIndex>0)from.y+=(arrowIndex%3-1)*.12;
  const to=new THREE.Vector3(tx,targetGround+projectileTargetHeight(target,!!event.pendingImpact&&siege),tz);
  if(event.pendingImpact&&siege){to.x=event.aimX;to.z=event.aimZ;to.y=view.entityHeight(target,to.x,to.z)+projectileTargetHeight(target,true);}
  if(!ranged)from.lerp(to,.7);
  return {kind,from,to,duration:event.flightDuration??(siege?clamp(distance/30,.45,1.4):ranged?clamp(distance/34,.14,.65):.19),
    arc:siege?clamp(distance*(entity.type==='warship'?.18:.32),2,12):ranged?clamp(distance*.045,.18,1.4):.12,
    alignFlight:true,impact:siege&&!event.pendingImpact,authoritative:!!event.pendingImpact,releasedAt:event.releasedAt,tracked:!siege&&event.pendingImpact?target.id:null,impactColor:UNITS[target.type]?.naval?0xa6c9c4:0xb5aa95,impactSize:siege?1.6:0};
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
export function fireTongueTexture(size=64){
  const data=new Uint8Array(size*size*4);
  for(let y=0;y<size;y++){
    const v=y/(size-1); // 0=bottom base, 1=flame tip
    for(let x=0;x<size;x++){
      const u=(x/(size-1))*2-1;
      const sway=Math.sin(v*6.2+Math.cos(v*2.8))*.14*v;
      const halfW=Math.max(.08,(1-Math.pow(v,.92))*(.84+.18*Math.sin(v*11.0+u*2.4)));
      const d=Math.abs(u-sway)/halfW;
      const sideLick=Math.abs(u+sway*.7-.32*(1-v))/Math.max(.08,(1-Math.pow(v,.82))*.46);
      const shape=Math.max(clamp(1-d,0,1),clamp(1-sideLick,0,1)*.78);
      const licks=.86+.14*Math.sin(u*9.5-v*8.5);
      const baseFade=clamp(v/.12,0,1);
      const tipFade=clamp((1-v)/.24,0,1);
      const sideFade=clamp((1-Math.abs(u))/.10,0,1);
      const body=Math.pow(shape,.85)*baseFade*tipFade*sideFade*licks;
      const core=Math.pow(clamp(1-Math.hypot((u-sway)*.78,(v-.28)*1.35),0,1),1.4)*baseFade*tipFade*sideFade;
      const r=clamp(255*(body*1.15+core),0,255);
      const g=clamp((185*(1-v*.52)+55)*body+248*core,0,255);
      const b=clamp(28*(1-v)*body+205*core,0,255);
      const a=clamp((body*1.15+core*.8)*255,0,255);
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
      const shade=78+Math.round(clamp((v+1)*.5,0,1)*66);
      const i=(y*size+x)*4;
      data[i]=shade+10;data[i+1]=shade+5;data[i+2]=shade;data[i+3]=Math.round(clamp(edge*1.15,0,1)*245);
    }
  }
  const tex=new THREE.DataTexture(data,size,size,THREE.RGBAFormat);
  tex.colorSpace=THREE.SRGBColorSpace;tex.magFilter=THREE.LinearFilter;tex.minFilter=THREE.LinearMipmapLinearFilter;tex.generateMipmaps=true;tex.needsUpdate=true;
  return tex;
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
function wakeGeometry(){
  const positions=[-0.38,0,0,-1.45,0,-2.10,-0.82,0,-2.25,-0.38,0,0,-0.82,0,-2.25,-0.08,0,-0.45,0.38,0,0,0.82,0,-2.25,1.45,0,-2.10,0.38,0,0,0.08,0,-0.45,0.82,0,-2.25];
  const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));g.computeVertexNormals();return g;
}

// Opaque projectiles share one instanced draw per shape. Melee slashes
// retain individual opacity and transparent sorting.
export class FlightEffects{
  constructor(){
    this.geometry={arrow:arrowGeometry(),stone:stoneGeometry(),slash:new THREE.TorusGeometry(.42,.022,4,16,Math.PI*.78)};
    this.material={arrow:standardMaterial({vertexColors:true,roughness:.75,metalness:.18}),stone:standardMaterial({vertexColors:true,roughness:.94})};
    this.free={arrow:[],stone:[],slash:[]};this.retained=new Set();this.limit=96;this.batches={};
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
      if(kind!=='arrow'&&kind!=='stone'||!object.visible)continue;
      if(fog&&!view.sim.isVisible(object.position.x,object.position.z))continue;
      let batch=this.batches[kind];
      if(!batch){
        batch=this.batches[kind]=new THREE.InstancedMesh(this.geometry[kind],this.material[kind],this.limit);
        batch.name=kind==='arrow'?'Battlefield arrows':'Battlefield siege stones';
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
        const material=new THREE.MeshBasicMaterial({color:0xdcebe8,transparent:true,opacity:.38,depthWrite:false,side:THREE.DoubleSide});
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
    else if(kind==='wake'){mesh.material.opacity=.38;}
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
