import {standardMaterial} from './render-runtime.js';
import * as THREE from 'three';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';
import {UNITS,seededRandom} from './data.js';
import {workerVisualTask} from './authored-assets.js';
import {nearViewport} from './render-batches.js';

function fallenGeometry(view,e){
  const model=view.mergeModel(view.makeUnit({...e,moving:false,cooldown:0,order:null})),parts=[];
  model.updateMatrixWorld(true);
  model.traverse(part=>{
    if(!part.isMesh||part.material.transparent)return;
    let geometry=part.geometry.clone().applyMatrix4(part.matrixWorld);
    if(geometry.index){const flat=geometry.toNonIndexed();geometry.dispose();geometry=flat;}
    for(const name of Object.keys(geometry.attributes))if(!['position','normal','uv','color'].includes(name))geometry.deleteAttribute(name);
    const position=geometry.attributes.position,existing=geometry.attributes.color,colors=new Float32Array(position.count*3),color=part.material.color.toArray();
    for(let i=0;i<position.count;i++)for(let k=0;k<3;k++)colors[i*3+k]=(existing?existing.getComponent(i,k):1)*color[k];
    geometry.setAttribute('color',new THREE.BufferAttribute(colors,3));parts.push(geometry);
  });
  const result=mergeGeometries(parts);for(const part of parts)part.dispose();view.releaseNode(model);
  return result;
}

// Cosmetic remains never enter the simulation, navigation grid or picking set.
export class BattleRemains{
  constructor(view){
    this.view=view;this.group=new THREE.Group();this.group.name='Battle remains';view.scene.add(this.group);
    this.limit=view.settings.quality==='high'?24:8;this.items=[];this.batches=new Map();this.seen=new Set();this.dummy=new THREE.Object3D();this.color=new THREE.Color();
    this.material=standardMaterial({vertexColors:true,roughness:.92,metalness:.08});
    this.rubble=new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1,0),standardMaterial({color:0xffffff,roughness:1}),this.limit*12);
    this.rubble.name='Solid masonry and timber rubble';this.rubble.count=0;this.rubble.frustumCulled=false;this.rubble.castShadow=view.settings.quality!=='low';this.rubble.receiveShadow=true;this.rubble.instanceMatrix.setUsage(THREE.DynamicDrawUsage);this.group.add(this.rubble);
  }
  spawn(e){
    const v=this.view;if(!e||this.seen.has(e.id)||!['unit','building'].includes(e.kind))return;
    this.seen.add(e.id);if(this.seen.size>2048)this.seen.delete(this.seen.values().next().value);
    if(e.owner!==0&&!v.sim.isVisible(e.x,e.z)||!nearViewport(v,e.x,v.groundHeight(e.x,e.z),e.z))return;
    const item={...e,at:v.clock,life:v.settings.quality==='high'?16:10};
    if(e.kind==='unit'){
      item.key=e.owner+':'+e.type+':'+workerVisualTask(v,e);
      if(!this.batches.has(item.key)){
        const geometry=fallenGeometry(v,e);if(!geometry)return;
        const mesh=new THREE.InstancedMesh(geometry,this.material,this.limit);mesh.count=0;mesh.frustumCulled=false;mesh.castShadow=v.settings.quality!=='low';mesh.receiveShadow=true;mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);this.group.add(mesh);this.batches.set(item.key,{mesh,last:v.clock});
      }
    }else{
      const rng=seededRandom(e.id+517);item.chunks=Array.from({length:12},(_,i)=>({dx:(rng()-.5)*e.r*1.8,dz:(rng()-.5)*e.r*1.8,scale:.2+rng()*Math.min(1,e.r*.2),height:.5+rng()*1.2,angle:rng()*Math.PI,color:i%3===0?0x75634f:0x9b9c8e}));
    }
    this.items.push(item);if(this.items.length>this.limit)this.items.shift();
  }
  update(){
    const v=this.view;this.items=this.items.filter(e=>v.clock-e.at<e.life);
    for(const batch of this.batches.values())batch.mesh.count=0;
    let rubble=0,bodies=0;
    for(const e of this.items){
      if(e.owner!==0&&!v.sim.isVisible(e.x,e.z)||!nearViewport(v,e.x,v.groundHeight(e.x,e.z),e.z))continue;
      const age=v.clock-e.at,sink=Math.max(0,(age-e.life+3)/3);
      if(e.key){
        const batch=this.batches.get(e.key),naval=UNITS[e.type].naval;
        const fall=Math.min(1,age/.65);this.dummy.position.set(e.x,(naval?.08:v.groundHeight(e.x,e.z)+.18)-sink*.65-(naval?fall*1.3:0),e.z);
        this.dummy.rotation.set(0,e.heading||0,naval?fall*.25:fall*1.48);this.dummy.scale.setScalar(1);this.dummy.updateMatrix();batch.mesh.setMatrixAt(batch.mesh.count++,this.dummy.matrix);batch.last=v.clock;bodies++;
      }else{
        const t=Math.min(1,age/.9);
        for(const chunk of e.chunks){const x=e.x+chunk.dx*t,z=e.z+chunk.dz*t;this.dummy.position.set(x,v.groundHeight(x,z)+chunk.scale*.35+Math.sin(t*Math.PI)*chunk.height-sink*.9,z);this.dummy.rotation.set(t*.8,chunk.angle,t*.35);this.dummy.scale.set(chunk.scale*1.4,chunk.scale*.65,chunk.scale);this.dummy.updateMatrix();this.rubble.setMatrixAt(rubble,this.dummy.matrix);this.rubble.setColorAt(rubble,this.color.setHex(chunk.color));rubble++;}
      }
    }
    let calls=rubble?1:0;
    for(const [key,batch] of this.batches){batch.mesh.visible=batch.mesh.count>0;batch.mesh.instanceMatrix.needsUpdate=true;batch.mesh.boundingSphere=null;if(batch.mesh.count)calls++;
      if(!batch.mesh.count&&!this.items.some(e=>e.key===key)&&(v.clock-batch.last>30||this.batches.size>this.limit*2)){batch.mesh.geometry.dispose();batch.mesh.dispose();batch.mesh.removeFromParent();this.batches.delete(key);}
    }
    this.rubble.count=rubble;this.rubble.instanceMatrix.needsUpdate=true;if(this.rubble.instanceColor)this.rubble.instanceColor.needsUpdate=true;
    v.remainsDiagnostics={bodies,rubble,retained:this.items.length,limit:this.limit,drawCalls:calls};
  }
  dispose(){for(const batch of this.batches.values()){batch.mesh.geometry.dispose();batch.mesh.dispose();}this.material.dispose();this.rubble.geometry.dispose();this.rubble.material.dispose();this.rubble.dispose();this.group.removeFromParent();}
}

export function installBattleRemains(WorldView){
  const p=WorldView.prototype,attach=p.attach,effect=p.effect,render=p.render;
  p.attach=function(sim){this.remains?.dispose();attach.call(this,sim);this.remains=new BattleRemains(this);};
  p.effect=function(event){if(event.type==='death')this.remains?.spawn(event.entity);effect.call(this,event);};
  p.render=function(dt,menu){this.remains?.update();render.call(this,dt,menu);};
}
