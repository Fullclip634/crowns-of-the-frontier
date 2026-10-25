import {standardMaterial} from './render-runtime.js';
import * as THREE from 'three';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';
import {UNITS} from './data.js';
import {siegeArmAngle,projectileTargetHeight} from './combat-timing.js';
import {bowArcher,bowReleasePoint} from './archery-pose.js';

const clamp=(value,lo,hi)=>Math.max(lo,Math.min(hi,value));
const buildingHeight=type=>({tower:6.2,keep:7.5,towncenter:5.8,wall:2.4,gate:3.8}[type]||2.6);

// Cosmetic flight follows the visible/interpolated figures. Damage and attack
// timing remain authoritative simulation events, independent of visual quality.
export function attackFlight(view,entity,target,arrowIndex=0,event={}){
  const def=UNITS[entity.type],ranged=entity.kind==='building'||(def?.range||0)>5;
  const siege=['catapult','warship'].includes(entity.type),kind=siege?'stone':ranged?'arrow':'slash';
  const x=entity.renderX??entity.x,z=entity.renderZ??entity.z;
  const tx=target.renderX??target.x,tz=target.renderZ??target.z;
  const distance=Math.hypot(tx-x,tz-z),heading=Math.atan2(tx-x,tz-z);
  const ground=view.entityHeight(entity,x,z),targetGround=view.entityHeight(target,tx,tz);
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
  const shaft=colored(new THREE.CylinderGeometry(.018,.018,.85,5).rotateX(Math.PI/2),0x80684d);
  const tip=colored(new THREE.ConeGeometry(.05,.18,4).rotateX(Math.PI/2).translate(0,0,.49),0xb9c3bd);
  const feather=colored(new THREE.BoxGeometry(.16,.012,.19).translate(0,0,-.32),0xd9d1b5);
  const vertical=feather.clone().rotateZ(Math.PI/2),parts=[shaft,tip,feather,vertical],merged=mergeGeometries(parts);
  for(const part of parts)part.dispose();return merged;
}

// Pools keep the same solid meshes/materials throughout a match and across
// scene switches. Shared geometry is never disposed when a single shot ends.
export class FlightEffects{
  constructor(){
    this.geometry={arrow:arrowGeometry(),stone:new THREE.IcosahedronGeometry(.26,1),slash:new THREE.TorusGeometry(.38,.026,5,14,Math.PI*.85)};
    this.material={arrow:standardMaterial({vertexColors:true,roughness:.75,metalness:.15}),stone:standardMaterial({color:0xa0927c,roughness:.96})};
    this.free={arrow:[],stone:[],slash:[]};this.retained=new Set();this.limit=96;
  }
  acquire(kind){
    let mesh=this.free[kind].pop();
    if(!mesh){const material=kind==='slash'?standardMaterial({color:0xe0d6b1,transparent:true,opacity:0,depthWrite:false,roughness:.6}):this.material[kind];mesh=new THREE.Mesh(this.geometry[kind],material);mesh.userData.flightKind=kind;this.retained.add(mesh);}
    mesh.visible=true;mesh.scale.setScalar(1);mesh.quaternion.identity();return mesh;
  }
  release(mesh){
    mesh.removeFromParent();mesh.visible=false;
    const kind=mesh.userData.flightKind;
    if(this.retained.size>this.limit){this.retained.delete(mesh);if(kind==='slash')mesh.material.dispose();}
    else if(!this.free[kind].includes(mesh))this.free[kind].push(mesh);
  }
  dispose(){
    for(const mesh of this.retained){mesh.removeFromParent();if(mesh.userData.flightKind==='slash')mesh.material.dispose();}
    for(const geometry of Object.values(this.geometry))geometry.dispose();for(const material of Object.values(this.material))material.dispose();
    this.retained.clear();for(const list of Object.values(this.free))list.length=0;
  }
}

// Retain short-lived feedback between attacks. Disposing its last material
// after each quiet gap can discard its linked GPU program as well.
export class ImpactEffects{
  constructor(){
    this.geometry={burst:new THREE.IcosahedronGeometry(.13,0),heal:new THREE.TorusGeometry(.85,.035,5,28)};
    this.free={burst:[],heal:[]};this.retained=new Set();this.limit=48;this.disposed=false;
  }
  acquire(kind,color=kind==='heal'?0x91e0b4:0xe8c28b){
    if(this.disposed)throw new Error('Impact effects have been disposed.');
    let mesh=this.free[kind].pop();
    if(!mesh){
      const material=kind==='burst'?standardMaterial({color,roughness:.9,transparent:true,opacity:.8}):new THREE.MeshBasicMaterial({color,transparent:true,opacity:.7,depthWrite:false,side:THREE.DoubleSide});
      mesh=kind==='burst'?new THREE.InstancedMesh(this.geometry.burst,material,8):new THREE.Mesh(this.geometry.heal,material);
      mesh.userData.impactKind=kind;this.retained.add(mesh);
      if(kind==='burst'){mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);mesh.frustumCulled=false;mesh.userData.velocities=Array.from({length:8},()=>({x:0,y:0,z:0}));}
    }
    mesh.material.color.setHex(color);mesh.material.opacity=kind==='burst'?.8:.7;
    mesh.visible=true;mesh.position.set(0,0,0);mesh.scale.setScalar(1);mesh.quaternion.identity();return mesh;
  }
  release(mesh){
    if(!this.retained.has(mesh))return;
    mesh.removeFromParent();mesh.visible=false;
    if(this.retained.size>this.limit){this.retained.delete(mesh);mesh.material.dispose();if(mesh.isInstancedMesh)mesh.dispose();}
    else{const list=this.free[mesh.userData.impactKind];if(!list.includes(mesh))list.push(mesh);}
  }
  dispose(){
    if(this.disposed)return;this.disposed=true;
    for(const mesh of this.retained){mesh.removeFromParent();mesh.material.dispose();if(mesh.isInstancedMesh)mesh.dispose();}
    for(const geometry of Object.values(this.geometry))geometry.dispose();
    this.retained.clear();for(const list of Object.values(this.free))list.length=0;
  }
}
