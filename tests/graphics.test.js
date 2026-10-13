import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {WorldView} from '../src/world.js';
import {Simulation} from '../src/simulation.js';
import {BUILDINGS,UNITS,MAPS} from '../src/data.js';
import {Landscape} from '../src/landscape.js';
import {buildingModel,unitModel,resourceModel,treeModel} from '../src/models-3d.js';
import {animatePart} from '../src/world-polish.js';
import {cargoGeometry,WorldInteractions} from '../src/world-interactions.js';
import {forestTransform} from '../src/realm-3d.js';
import {LocalMotion} from '../src/motion-smoothing.js';

function viewFixture(faction='alder'){
  const v=Object.create(WorldView.prototype);
  v.geo={box:new THREE.BoxGeometry(1,1,1),sphere:new THREE.IcosahedronGeometry(1,1),cylinder:new THREE.CylinderGeometry(1,1,1,10),cone:new THREE.ConeGeometry(1,1,7)};
  const keys=['stone','stoneDark','plaster','wood','darkwood','gold','iron','leaf','leafDark','trunk','skin','soil','furrow','water','glass','timberEdge'];
  v.materials=Object.fromEntries(keys.map(k=>[k,new THREE.MeshStandardMaterial({color:0x8d9580})]));v.materials.shadow=new THREE.MeshBasicMaterial();
  v.teamMaterials=[0x397f8c,0x9a687d].map(color=>new THREE.MeshStandardMaterial({color}));v.roofMaterials=v.teamMaterials.map(m=>m.clone());
  v.sim=new Simulation({mode:'sandbox',map:'coast',faction,seed:512});return v;
}
function solidBounds(group){
  const bounds=new THREE.Box3().setFromObject(group,true),size=bounds.getSize(new THREE.Vector3());assert.ok(Number.isFinite(size.length()));assert.ok(size.x>.05&&size.y>.05&&size.z>.05,'model has width, height and depth');
  group.traverse(mesh=>{if(!mesh.isMesh)return;for(const value of mesh.geometry.getAttribute('position').array)assert.ok(Number.isFinite(value),'all vertices are finite');assert.ok(mesh.geometry.getAttribute('normal'),'model has surface normals');assert.ok(mesh.geometry.getAttribute('uv'),'model supports textured surfaces');});return bounds;
}

test('all maps have seeded elevated meshes and picking follows their triangulated surface',()=>{
  for(const map of Object.keys(MAPS)){
    const a=new Landscape(512,map),b=new Landscape(512,map),geometry=a.geometry(320,112),copy=b.geometry(320,112);
    assert.deepEqual(geometry.getAttribute('position').array,copy.getAttribute('position').array);
    assert.ok(geometry.boundingBox.max.y-geometry.boundingBox.min.y>10);
    for(const [x,z]of [[-37,30],[27,19],[-10,-22],[0,0],[52,43]]){
      const hit=a.rayPoint(new THREE.Ray(new THREE.Vector3(x,80,z),new THREE.Vector3(0,-1,0)));
      assert.ok(hit);assert.ok(Math.abs(hit.y-a.surfaceHeightAt(x,z))<.002);
    }
    geometry.dispose();copy.dispose();
  }
});
test('naval basins sit below the water while bridge routes keep dry elevation',()=>{
  const coast=new Landscape(512,'coast');for(const z of [-65,-30,30,65])assert.ok(coast.heightAt(Math.sin(z*.03)*2,z)<0);
  for(const map of ['valley','rivers']){const land=new Landscape(512,map);for(const channel of land.channels()){assert.ok(land.heightAt(channel.center,0)>.5);const z=30,x=channel.center+Math.sin(z*channel.frequency)*channel.bend;assert.ok(land.heightAt(x,z)<0);}}
});
test('every building and troop has a solid model across all three civilizations',()=>{
  for(const faction of ['alder','sun','raven']){
    const v=viewFixture(faction);
    for(const [type,data]of Object.entries(BUILDINGS)){const model=buildingModel(v,{kind:'building',type,owner:0,r:data.r,x:-19,z:25});solidBounds(model);assert.equal(model.userData.model3d.type,type);}
    for(const type of Object.keys(UNITS)){const model=unitModel(v,{kind:'unit',type,owner:0,id:31});solidBounds(model);assert.equal(model.userData.model3d.type,type);}
  }
});
test('forests, fruit, mineral deposits, fish and shrines use volumetric mesh models',()=>{
  const v=viewFixture();for(const type of ['food','gold','stone'])solidBounds(resourceModel(v,{id:51,kind:'resource',type}));
  solidBounds(resourceModel(v,{id:52,kind:'resource',type:'food',water:true}));solidBounds(resourceModel(v,{id:53,kind:'shrine'}));
  for(const map of Object.keys(MAPS))for(let i=0;i<4;i++)solidBounds(treeModel(v,map,i));
});
test('batching preserves model bounds and articulated joints remain animated',()=>{
  const v=viewFixture(),e={id:31,kind:'unit',type:'knight',owner:0,moving:true,cooldown:0};
  const model=unitModel(v,e),before=solidBounds(model),raw=[];model.traverse(m=>{if(m.isMesh)raw.push(m);});
  v.mergeModel(model);const after=solidBounds(model),parts=[];model.traverse(m=>{if(m.isMesh)parts.push(m);});
  assert.ok(parts.length<raw.length);assert.ok(before.min.distanceTo(after.min)<.0001);assert.ok(before.max.distanceTo(after.max)<.0001);
  const joint=parts.find(p=>p.userData.motion?.type==='knee');assert.ok(joint);v.clock=.1;const first=animatePart(v,joint,e,new THREE.Matrix4()).clone();v.clock=.4;const second=animatePart(v,joint,e,new THREE.Matrix4()).clone();assert.notDeepEqual(first.elements,second.elements);assert.ok(Math.abs(first.determinant()-1)<.001);
});

test('town centers gain solid age architecture and preserve age metadata when batched',()=>{
  const v=viewFixture(),vertices=[];for(let age=0;age<4;age++){v.sim.players[0].age=age;const model=buildingModel(v,{kind:'building',type:'towncenter',owner:0,r:5,x:-19,z:25});solidBounds(model);v.mergeModel(model);assert.equal(model.userData.model3d.architectureAge,age);let count=0;model.traverse(part=>{if(part.isMesh)count+=part.geometry.getAttribute('position').count;});vertices.push(count);}
  assert.ok(vertices.every((count,i)=>i===0||count>vertices[i-1]),'each age adds physical arches, turrets or banners to the architecture');
});

test('carried resources use solid batched geometry and depletion leaves stumps with a bounded draw cost',()=>{
  const v=viewFixture();buildingModel(v,{kind:'building',type:'towncenter',owner:0,r:5,x:-19,z:25});v.scene=new THREE.Scene();v.nodes=new Map();v.clock=0;v.groundHeight=()=>1;v.entityHeight=()=>1;v.sim.isVisible=()=>true;v.sim.isExplored=()=>true;
  for(const type of ['wood','food','gold','stone'])solidBounds(new THREE.Mesh(cargoGeometry(v,type),v.materials.wood));
  const worker=v.sim.owned(0,'unit','villager')[0],tree=v.sim.entities.find(e=>e.type==='wood');worker.carry=18;worker.carryType='wood';v.interactions=new WorldInteractions(v);tree.hp=0;tree.amount=0;v.interactions.update(.1,false);
  assert.equal(v.interactionDiagnostics.cargo.wood,1);assert.equal(v.interactionDiagnostics.stumps,1);assert.equal(v.treeFalls.size,1);assert.equal(v.interactionDiagnostics.drawCalls,2);
  for(const mesh of [v.interactions.stumps,...Object.values(v.interactions.cargo)]){const colors=mesh.geometry.attributes.color;assert.ok(colors&&colors.count===mesh.geometry.attributes.position.count&&colors.array.every(value=>value===1),'props retain neutral color when sharing baked Blender materials');}
  const oldX=worker.x;v.localMotion=new LocalMotion();v.localMotion.capture(v.sim);worker.x+=1;v.localMotion.commit(v.sim);v.localBlend=.25;worker.heading=0;
  v.interactions.update(.016,false);const cargo=new THREE.Matrix4();v.interactions.cargo.wood.getMatrixAt(0,cargo);
  assert.ok(Math.abs(cargo.elements[12]-(oldX+.25-Math.sin(worker.heading)*.42))<1e-5,'carried supplies follow the smooth figure between simulation ticks');assert.equal(worker.x,oldX+1,'visual interpolation preserves authoritative movement');
  v.clock=2;v.interactions.update(.1,false);assert.equal(v.treeFalls.size,0);assert.equal(v.interactionDiagnostics.stumps,1);v.interactions.dispose();assert.equal(v.scene.children.length,0);
});

test('tree falling and wind transforms preserve finite volume and original terrain placement',()=>{
  const base=new THREE.Matrix4().compose(new THREE.Vector3(14,2.5,7),new THREE.Quaternion(),new THREE.Vector3(1.2,1.2,1.2)),v={clock:1,settings:{quality:'high'},weatherState:{intensity:1}};
  for(const [leaves,fall]of [[true,null],[false,{at:0}]]){const pose=forestTransform(v,base,31,leaves,fall).clone();assert.ok(pose.elements.every(Number.isFinite));assert.ok(Math.abs(pose.determinant()-base.determinant())<.0001);assert.deepEqual(new THREE.Vector3().setFromMatrixPosition(pose).toArray(),[14,2.5,7]);assert.notDeepEqual(pose.elements,base.elements);}
  v.settings.quality='low';assert.deepEqual(forestTransform(v,base,31,true).elements,base.elements);
});
