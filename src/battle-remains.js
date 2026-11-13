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

function brokenMasonryGeometry(){
  // Asymmetric two-course stepped stone pier so perimeter stumps read as fractured
  // masonry rather than uniform cubes.
  const base=new THREE.BoxGeometry(1,.44,.88);base.translate(0,.22,0);
  const top=new THREE.BoxGeometry(.64,.52,.66);top.rotateY(.22);top.rotateZ(-.08);top.translate(.1,.54,-.06);
  const parts=[base,top].map(part=>{const flat=part.index?part.toNonIndexed():part;if(flat!==part)part.dispose();for(const name of Object.keys(flat.attributes))if(!['position','normal','uv'].includes(name))flat.deleteAttribute(name);return flat;});
  const merged=mergeGeometries(parts);for(const part of parts)part.dispose();merged.computeVertexNormals();return merged;
}

function createPoolMesh(geometry,material,capacity,name,quality,group){
  const mesh=new THREE.InstancedMesh(geometry,material,capacity);
  mesh.name=name;mesh.count=0;mesh.frustumCulled=false;mesh.castShadow=quality!=='low';mesh.receiveShadow=true;mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  group.add(mesh);return mesh;
}

function flushInstances(mesh,count){
  mesh.count=count;mesh.visible=count>0;mesh.boundingSphere=null;mesh.instanceMatrix.needsUpdate=true;
  if(mesh.instanceColor)mesh.instanceColor.needsUpdate=true;
  return count?1:0;
}

const ruinTime=view=>view.ruinClock??view.clock;

const RUBBLE_COLORS=[0x8d8b80,0x6e6a62,0x7b4e3a,0x4e433a];
const PIER_COLORS=[0x6f6a62,0x5c5750,0x817b72];
const TIMBER_COLORS=[0x2e231b,0x3d2f24,0x241b14];

// Cosmetic remains never enter the simulation, navigation grid or picking set.
export class BattleRemains{
  constructor(view){
    this.view=view;this.group=new THREE.Group();this.group.name='Battle remains';view.scene.add(this.group);
    this.limit=view.settings.quality==='high'?24:8;this.items=[];this.batches=new Map();this.seen=new Set();this.dummy=new THREE.Object3D();this.color=new THREE.Color();
    this.material=standardMaterial({vertexColors:true,roughness:.92,metalness:.08});
    const quality=view.settings.quality;
    this.rubble=createPoolMesh(new THREE.IcosahedronGeometry(1,0),standardMaterial({color:0xffffff,roughness:.96}),this.limit*24,'Solid masonry and timber rubble',quality,this.group);
    this.piers=createPoolMesh(brokenMasonryGeometry(),standardMaterial({color:0xffffff,roughness:.95}),this.limit*8,'Collapsed stone foundations and broken piers',quality,this.group);
    this.timbers=createPoolMesh(new THREE.BoxGeometry(1,.15,.17),standardMaterial({color:0xffffff,roughness:.98}),this.limit*6,'Charred structural timbers',quality,this.group);
  }
  retire(item){
    if(item?.shell){item.shell.removeFromParent();item.shell=null;}
  }
  spawn(e){
    const v=this.view;if(!e||this.seen.has(e.id)||!['unit','building'].includes(e.kind))return;
    this.seen.add(e.id);if(this.seen.size>2048)this.seen.delete(this.seen.values().next().value);
    if(e.kind==='building')v.structureByEntity?.delete(e.id);
    if(e.owner!==0&&!v.sim.isVisible(e.x,e.z)||!nearViewport(v,e.x,v.groundHeight(e.x,e.z),e.z))return;
    const building=e.kind==='building',now=ruinTime(v);
    const item={...e,at:now,life:building?12:(v.settings.quality==='high'?16:10)};
    if(!building){
      item.key=e.owner+':'+e.type+':'+workerVisualTask(v,e);
      if(!this.batches.has(item.key)){
        const geometry=fallenGeometry(v,e);if(!geometry)return;
        const mesh=new THREE.InstancedMesh(geometry,this.material,this.limit);mesh.count=0;mesh.frustumCulled=false;mesh.castShadow=v.settings.quality!=='low';mesh.receiveShadow=true;mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);this.group.add(mesh);this.batches.set(item.key,{mesh,last:now});
      }
    }else{
      // Replace the destroyed structure with collapsed stone piers, charred timbers,
      // and a shattered masonry mound instead of keeping a squashed intact building mesh.
      const rng=seededRandom(e.id+517),radius=Math.max(1.4,e.r||2),heading=e.heading||0;
      const pieces=Math.min(24,12+Math.round(e.r||0));
      item.chunks=Array.from({length:pieces},(_,i)=>({
        dx:(rng()-.5)*radius*1.05,dz:(rng()-.5)*radius*1.05,
        scale:.22+rng()*Math.min(.95,radius*.22),height:.35+rng()*.95,
        angle:rng()*Math.PI,color:RUBBLE_COLORS[i%RUBBLE_COLORS.length]
      }));
      const pierCount=Math.min(7,4+Math.round(radius*.5));
      item.piers=[{dx:0,dz:0,sx:radius*1.05,sy:.22,sz:radius*1.05,yaw:heading,tiltX:0,tiltZ:0,color:0x49443e}];
      for(let i=0;i<pierCount;i++){
        const a=heading+(i/pierCount)*Math.PI*2+(rng()-.5)*.45,dist=radius*(.42+rng()*.3);
        const w=.45+rng()*Math.min(.75,radius*.2),h=.35+rng()*Math.min(.85,radius*.28);
        item.piers.push({dx:Math.cos(a)*dist,dz:Math.sin(a)*dist,sx:w,sy:h,sz:w*.85,yaw:a+Math.PI*.5+(rng()-.5)*.5,tiltX:(rng()-.5)*.38,tiltZ:(rng()-.5)*.38,color:PIER_COLORS[i%PIER_COLORS.length]});
      }
      const timberCount=Math.min(5,3+Math.round(radius*.35));
      item.timbers=Array.from({length:timberCount},(_,i)=>{
        const a=heading+rng()*Math.PI*2,dist=radius*(.1+rng()*.38);
        return {dx:Math.cos(a)*dist,dz:Math.sin(a)*dist,len:radius*(.7+rng()*.65),yaw:a+(rng()-.5)*1.2,pitch:.16+rng()*.38,roll:(rng()-.5)*.3,drop:.4+rng()*Math.min(1.6,radius*.45),color:TIMBER_COLORS[i%TIMBER_COLORS.length]};
      });
    }
    this.items.push(item);if(this.items.length>this.limit)this.retire(this.items.shift());
  }
  update(){
    const v=this.view,now=ruinTime(v);
    this.items=this.items.filter(e=>{const alive=now-e.at<e.life;if(!alive)this.retire(e);return alive;});
    for(const batch of this.batches.values())batch.mesh.count=0;
    let rubble=0,piers=0,timbers=0,bodies=0;
    for(const e of this.items){
      const shown=!(e.owner!==0&&!v.sim.isVisible(e.x,e.z)||!nearViewport(v,e.x,v.groundHeight(e.x,e.z),e.z));
      if(!shown)continue;
      const age=now-e.at;
      if(e.key){
        const batch=this.batches.get(e.key),naval=UNITS[e.type].naval;
        const sink=Math.max(0,(age-e.life+3)/3),fall=Math.min(1,age/.65);
        this.dummy.position.set(e.x,(naval?.08:v.groundHeight(e.x,e.z)+.18)-sink*.65-(naval?fall*1.3:0),e.z);
        this.dummy.rotation.set(0,e.heading||0,naval?fall*.25:fall*1.48);this.dummy.scale.setScalar(1);this.dummy.updateMatrix();
        batch.mesh.setMatrixAt(batch.mesh.count++,this.dummy.matrix);batch.last=now;bodies++;
        continue;
      }
      // Smoothly settle beneath the soil over the final 4s so building ruins clear inside 12s.
      const fade=Math.max(0,Math.min(1,(age-(e.life-4))/4)),shrink=1-fade*.88,sink=fade*fade*1.15;
      const collapse=Math.min(1,age/.65),t=Math.min(1,age/.85);
      for(const pier of e.piers){
        const x=e.x+pier.dx*collapse,z=e.z+pier.dz*collapse;
        this.dummy.position.set(x,v.groundHeight(x,z)+(.55*(1-collapse))-sink*.75-.04,z);
        this.dummy.rotation.set(pier.tiltX*collapse,pier.yaw,pier.tiltZ*collapse);
        this.dummy.scale.set(pier.sx*shrink,pier.sy*shrink,pier.sz*shrink);
        this.dummy.updateMatrix();
        this.piers.setMatrixAt(piers,this.dummy.matrix);this.piers.setColorAt(piers,this.color.setHex(pier.color));piers++;
      }
      for(const beam of e.timbers){
        const x=e.x+beam.dx*collapse,z=e.z+beam.dz*collapse,drop=(1-collapse)*(1-collapse)*beam.drop;
        this.dummy.position.set(x,v.groundHeight(x,z)+.14*shrink+drop-sink*.8,z);
        this.dummy.rotation.set(beam.pitch*(1-(1-collapse)*.4),beam.yaw,beam.roll);
        this.dummy.scale.set(beam.len*shrink,shrink,shrink);
        this.dummy.updateMatrix();
        this.timbers.setMatrixAt(timbers,this.dummy.matrix);this.timbers.setColorAt(timbers,this.color.setHex(beam.color));timbers++;
      }
      for(const chunk of e.chunks){
        const x=e.x+chunk.dx*t,z=e.z+chunk.dz*t;
        this.dummy.position.set(x,v.groundHeight(x,z)+chunk.scale*.3*shrink+Math.sin(t*Math.PI)*chunk.height-sink*.85,z);
        this.dummy.rotation.set(t*.8,chunk.angle,t*.35);
        this.dummy.scale.set(chunk.scale*1.35*shrink,chunk.scale*.62*shrink,chunk.scale*shrink);
        this.dummy.updateMatrix();
        this.rubble.setMatrixAt(rubble,this.dummy.matrix);this.rubble.setColorAt(rubble,this.color.setHex(chunk.color));rubble++;
      }
    }
    let calls=flushInstances(this.rubble,rubble)+flushInstances(this.piers,piers)+flushInstances(this.timbers,timbers);
    for(const [key,batch] of this.batches){batch.mesh.visible=batch.mesh.count>0;batch.mesh.instanceMatrix.needsUpdate=true;batch.mesh.boundingSphere=null;if(batch.mesh.count)calls++;
      if(!batch.mesh.count&&!this.items.some(e=>e.key===key)&&(now-batch.last>30||this.batches.size>this.limit*2)){batch.mesh.geometry.dispose();batch.mesh.dispose();batch.mesh.removeFromParent();this.batches.delete(key);}
    }
    v.remainsDiagnostics={bodies,rubble,piers,timbers,retained:this.items.length,limit:this.limit,drawCalls:calls};
  }
  dispose(){
    for(const item of this.items)this.retire(item);
    for(const batch of this.batches.values()){batch.mesh.geometry.dispose();batch.mesh.dispose();}
    this.material.dispose();
    for(const pool of [this.rubble,this.piers,this.timbers]){pool.geometry.dispose();pool.material.dispose();pool.dispose();}
    this.group.removeFromParent();
  }
}

export function installBattleRemains(WorldView){
  const p=WorldView.prototype,attach=p.attach,effect=p.effect,render=p.render;
  p.attach=function(sim){this.remains?.dispose();attach.call(this,sim);this.remains=new BattleRemains(this);};
  p.effect=function(event){if(event.type==='death')this.remains?.spawn(event.entity);effect.call(this,event);};
  p.render=function(dt,menu){this.remains?.update();render.call(this,dt,menu);};
}
