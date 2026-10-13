import * as THREE from 'three';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';
import {renderPosition,smoothHeading} from './motion-smoothing.js';
import {nearViewport,markInstancePrefix} from './render-batches.js';

export function cargoGeometry(view,type){
  const parts=[],add=(geometry,x,y,z,sx,sy,sz,angle=0)=>{const copy=geometry.clone();copy.scale(sx,sy,sz);copy.rotateZ(angle);copy.translate(x,y,z);parts.push(copy);};
  if(type==='wood')for(const [y,z]of [[-.08,-.07],[-.08,.07],[.08,0]])add(view.geo.cylinder,0,y,z,.08,.65,.08,Math.PI/2);
  else if(type==='gold')for(const [x,y]of [[-.13,-.08],[.13,-.08],[0,.06]])add(view.geo.box,x,y,0,.25,.12,.28);
  else if(type==='stone')for(const [x,y]of [[-.12,-.05],[.12,-.05],[0,.1]])add(view.geo.rock3d,x,y,0,.19,.17,.20);
  else add(view.geo.capsule,0,0,0,.43,.55,.42);
  const result=mergeGeometries(parts);for(const part of parts)part.dispose();return result;
}

export class WorldInteractions {
  constructor(view){
    this.view=view;this.group=new THREE.Group();this.group.name='3D world interactions';view.scene.add(this.group);this.dummy=new THREE.Object3D();this.cargo={};this.stumpPoses=new Map();this.stumpSlots=[];this.fell=new Set(view.sim.entities.filter(e=>e.type==='wood'&&e.hp<=0).map(e=>e.id));view.treeFalls=new Map();
    for(const type of ['wood','food','gold','stone']){const mesh=new THREE.InstancedMesh(cargoGeometry(view,type),view.materials[type==='food'?'canvas':type],512);mesh.count=0;mesh.frustumCulled=false;mesh.castShadow=true;mesh.userData.model3d={type:'cargo',resource:type,volumetric:true};this.cargo[type]=mesh;this.group.add(mesh);}
    const stumpGeometry=new THREE.CylinderGeometry(.27,.36,.32,8);stumpGeometry.setAttribute('color',new THREE.Float32BufferAttribute(new Float32Array(stumpGeometry.attributes.position.count*3).fill(1),3));
    this.stumps=new THREE.InstancedMesh(stumpGeometry,view.materials.trunk,4096);this.stumps.count=0;this.stumps.frustumCulled=false;this.stumps.receiveShadow=true;this.stumps.userData.model3d={type:'stump',volumetric:true};this.group.add(this.stumps);
  }
  update(dt,menu){
    const v=this.view,counts={wood:0,food:0,gold:0,stone:0};let stumpCount=0,stumpsChanged=false,culledCargo=0;
    for(const e of v.sim.entities){
      if(e.type==='wood'&&e.hp<=0){
        if(!this.fell.has(e.id)){this.fell.add(e.id);if(v.sim.isVisible(e.x,e.z)){v.treeFalls.set(e.id,{at:v.clock});v.forestRefresh=undefined;}}
        if(stumpCount<4096&&(menu||v.sim.isExplored(e.x,e.z))){
          let pose=this.stumpPoses.get(e.id),changed=!pose||pose.x!==e.x||pose.z!==e.z;
          if(changed){this.dummy.position.set(e.x,v.groundHeight(e.x,e.z)+.15,e.z);this.dummy.rotation.set(0,e.id*.7,0);this.dummy.scale.setScalar(1);this.dummy.updateMatrix();pose={x:e.x,z:e.z,matrix:this.dummy.matrix.clone()};this.stumpPoses.set(e.id,pose);if(this.stumpPoses.size>4096)this.stumpPoses.delete(this.stumpPoses.keys().next().value);}
          if(changed||this.stumpSlots[stumpCount]!==e.id){this.stumps.setMatrixAt(stumpCount,pose.matrix);stumpsChanged=true;}
          this.stumpSlots[stumpCount++]=e.id;
        }continue;
      }
      if(e.kind==='resource'&&['gold','stone'].includes(e.type)&&e.hp>0){const node=v.nodes.get(e.id);if(node)node.scale.setScalar(.48+.52*Math.min(1,e.amount/(e.initialAmount||Math.max(e.amount,1800))));}
      if(e.hp<=0||e.type!=='villager'||e.embarked)continue;
      const shown=menu||e.owner===0||v.sim.isVisible(e.x,e.z);if(!shown)continue;
      if(!e.moving&&['gather','build','repair'].includes(e.order?.type)){const target=v.sim.get(e.order.target);if(target)e.heading=Math.atan2(target.x-e.x,target.z-e.z);}
      if(!e.carry||!this.cargo[e.carryType]||counts[e.carryType]>=512)continue;
      const position=renderPosition(v,e),x=position.x,z=position.z,ground=v.entityHeight(e,x,z);
      if(!nearViewport(v,x,ground+1.24,z,4)){culledCargo++;continue;}
      const node=v.nodes.get(e.id),heading=node?.userData.headingReady?smoothHeading(node,e.heading,dt):e.heading||0;this.dummy.position.set(x-Math.sin(heading)*.42,ground+1.24,z-Math.cos(heading)*.42);this.dummy.rotation.set(0,heading,0);this.dummy.scale.setScalar(.72+.28*Math.min(1,e.carry/18));this.dummy.updateMatrix();this.cargo[e.carryType].setMatrixAt(counts[e.carryType]++,this.dummy.matrix);
    }
    for(const [id,fall]of v.treeFalls)if(v.clock-fall.at>1.7){v.treeFalls.delete(id);v.forestRefresh=undefined;}
    let matrixUploadBytes=0;for(const type of Object.keys(counts)){this.cargo[type].count=counts[type];markInstancePrefix(this.cargo[type]);matrixUploadBytes+=counts[type]*64;}
    this.stumps.count=stumpCount;this.stumpSlots.length=stumpCount;if(stumpsChanged){markInstancePrefix(this.stumps);matrixUploadBytes+=stumpCount*64;}
    if(v.clock-(this.prunedAt||0)>2){const present=new Set(v.sim.entities.filter(e=>e.type==='wood').map(e=>e.id));for(const id of this.stumpPoses.keys())if(!present.has(id))this.stumpPoses.delete(id);this.prunedAt=v.clock;}
    v.interactionDiagnostics={cargo:counts,culledCargo,stumps:stumpCount,fallingTrees:v.treeFalls.size,drawCalls:Object.values(counts).filter(count=>count>0).length+(stumpCount?1:0),matrixUploadBytes,cachedStumps:this.stumpPoses.size};
  }
  dispose(){for(const mesh of this.group.children){mesh.geometry.dispose();mesh.dispose();}this.group.removeFromParent();}
}

export function installWorldInteractions(WorldView){const p=WorldView.prototype,attach=p.attach,render=p.render;p.attach=function(sim){this.interactions?.dispose();this.treeFalls=new Map();this.fallSlots=new Map();attach.call(this,sim);this.interactions=new WorldInteractions(this);};p.render=function(dt,menu=false){this.interactions?.update(dt,menu);render.call(this,dt,menu);};}
