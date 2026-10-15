import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import * as THREE from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {MeshoptDecoder} from 'three/addons/libs/meshopt_decoder.module.js';
import {BUILDINGS,MAPS} from '../src/data.js';
import {Simulation} from '../src/simulation.js';
import {Landscape} from '../src/landscape.js';
import {WorldView} from '../src/world.js';
import {registerAuthoredAssets,clearAuthoredAssets} from '../src/authored-assets.js';
import {terrainFloor,updateGatePortcullis,syncFoundationMaterials} from '../src/building-grounding.js';
import {WallVisuals} from '../src/wall-visuals.js';

const art=process.env.ART_CATALOGUE_DIR?pathToFileURL(path.resolve(process.env.ART_CATALOGUE_DIR)+path.sep):new URL('../src/assets3d/',import.meta.url);
async function catalogue(detail){const bytes=fs.readFileSync(new URL(`frontier-${detail}.glb`,art)),gltf=await new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'');return {gltf,assets:registerAuthoredAssets(gltf,detail==='near'?'high':detail==='balanced'?'medium':'low',bytes.length)};}
function viewFor(land,gltf,quality){
  const view=Object.create(WorldView.prototype),materials={};gltf.scene.traverse(part=>{if(part.isMesh&&part.userData.assetMaterial&&!materials[part.userData.assetMaterial])materials[part.userData.assetMaterial]=part.material.clone();});
  materials.shadow=new THREE.MeshBasicMaterial();materials.stone.map=new THREE.Texture();
  Object.assign(view,{landscape:land,foundationHeights:new Map(),materials,teamMaterials:[materials.team],roofMaterials:[materials.teamRoof],geo:{ring:new THREE.RingGeometry(.83,1,32)},modelsReady:true,settings:{quality},objects:new THREE.Group(),nodes:new Map(),ghost:new THREE.Group(),sim:{players:[{faction:'alder',age:0}]}});return view;
}
function release(view,assets,gltf){
  for(const node of view.nodes.values())view.releaseNode(node);view.ghost.traverse(mesh=>{if(mesh.isMesh){if(!view.sharedModelGeometry?.has(mesh.geometry))mesh.geometry.dispose();mesh.material.dispose();}});
  for(const geometry of [...(view.sharedModelGeometry||[]),...Object.values(view.geo),...assets.geometries])geometry.dispose();
  const materials=new Set(Object.values(view.materials));gltf.scene.traverse(part=>{if(part.isMesh)materials.add(part.material);});for(const m of materials){m.map?.dispose();m.dispose();}clearAuthoredAssets();
}

test('the minimum of displayed grid cells bounds the complete footprint, including between sample corners',()=>{
  for(const size of [160,280,400])for(const map of Object.keys(MAPS)){
    const land=new Landscape(512,map,size),ground=land.geometry(land.renderSize,112);
    for(const [x,z]of [[0,40],[-60,-35],[size/2-8,0]]){const floor=terrainFloor(land,x-6,x+6,z-6,z+6);for(let dz=-6;dz<=6;dz+=.4)for(let dx=-6;dx<=6;dx+=.4)assert.ok(land.surfaceHeightAt(x+dx,z+dz)>=floor-1e-6);}
    ground.dispose();
  }
});

for(const detail of ['low','balanced','near'])test(`${detail} foundations close terrain gaps at valid sites without changing architecture or source models`,async()=>{
  const {gltf,assets}=await catalogue(detail),quality=detail==='near'?'high':detail==='balanced'?'medium':'low',models=[...assets.templates.keys()].filter(key=>key.startsWith('building:')&&!['farm','dock'].includes(key.split(':')[1])),report={detail,models:models.length,maps:7,validSites:0,extended:0,maximumGroundGap:-Infinity};assert.equal(models.length,60);
  const land=new Landscape(512,'canyon'),initial=land.geometry(land.renderSize,quality==='low'?112:160),view=viewFor(land,gltf,quality);initial.dispose();
  try{
    for(const map of Object.keys(MAPS)){
      const sim=new Simulation({mode:'sandbox',map,seed:512});sim.entities=[];sim.index=new Map();sim.revision++;sim.visible.fill(1);
      view.landscape=new Landscape(512,map,sim.worldSize,sim.spawnPositions);const ground=view.landscape.geometry(view.landscape.renderSize,quality==='low'?112:160);
      for(const [x,z]of [[-60,-35],[60,-50],[0,40],[45,55],[-15,-55],[-37,30]])for(const key of models){
        const [,type,faction,age]=key.split(':');if(!sim.buildValid(type,x,z))continue;report.validSites++;Object.assign(view.sim.players[0],{faction,age:Number(age)});
        const e={id:report.validSites,kind:'building',type,owner:0,x,z,r:BUILDINGS[type].r,hp:100,progress:1},template=view.makeBuilding(e),source=template.children.find(part=>part.isMesh&&part.userData.structureSurface).geometry,before=source.attributes.position.array.slice(),node=view.createNode(e),mesh=node.children.find(part=>part.isMesh&&part.userData.structureSurface),p=mesh.geometry.attributes.position,original=source.attributes.position,minimum=source.boundingBox.min.y;
        assert.equal(mesh.geometry.index.count,source.index.count);assert.deepEqual(source.attributes.position.array,before);assert.ok(mesh.geometry.attributes.normal.array.every(Number.isFinite));
        const bounds=new THREE.Box3(),point=new THREE.Vector3();let minY=Infinity;
        for(let i=0;i<p.count;i++){assert.equal(p.getX(i),original.getX(i));assert.equal(p.getZ(i),original.getZ(i));if(original.getY(i)>=minimum+.08)assert.equal(p.getY(i),original.getY(i),'only the original plinth underside moves');else{point.fromBufferAttribute(p,i).applyMatrix4(mesh.matrixWorld);bounds.expandByPoint(point);minY=Math.min(minY,point.y);}if(original.getY(i)>=.21)for(const axis of ['getX','getY','getZ'])assert.equal(mesh.geometry.attributes.normal[axis](i),source.attributes.normal[axis](i),'the architecture retains its authored normals');}
        for(let i=0;i<=12;i++){const t=i/12;for(const [wx,wz]of [[bounds.min.x+(bounds.max.x-bounds.min.x)*t,bounds.min.z],[bounds.min.x+(bounds.max.x-bounds.min.x)*t,bounds.max.z],[bounds.min.x,bounds.min.z+(bounds.max.z-bounds.min.z)*t],[bounds.max.x,bounds.min.z+(bounds.max.z-bounds.min.z)*t]]){const gap=minY-view.landscape.surfaceHeightAt(wx,wz);report.maximumGroundGap=Math.max(report.maximumGroundGap,gap);assert.ok(gap<.001,key+' has no daylight beneath the original footprint');}}
        if(node.userData.foundationGrounded.changedMeshes){report.extended++;assert.notEqual(mesh.geometry,source);assert.notEqual(mesh.geometry.index,source.index);assert.equal(mesh.geometry.index.array,source.index.array);assert.notEqual(mesh.geometry.attributes.color,source.attributes.color);assert.equal(mesh.geometry.attributes.color.array,source.attributes.color.array);assert.notEqual(mesh.geometry.attributes.uv.array,source.attributes.uv.array);}
        const gate=node.userData.portcullis;if(gate){const beforePositions=[];gate.traverse(part=>{if(part.isMesh)beforePositions.push(part.geometry.attributes.position.array.slice());});gate.position.y=2.5;gate.updateMatrixWorld(true);let i=0;gate.traverse(part=>{if(part.isMesh)assert.deepEqual(part.geometry.attributes.position.array,beforePositions[i++],'raising the portcullis retains its authored bars');});}
        view.releaseNode(node);node.removeFromParent();view.nodes.delete(e.id);
      }ground.dispose();
    }
    assert.ok(report.extended>100);assert.equal(report.validSites,2283);fs.writeFileSync(new URL(`../artifacts/foundation-${detail}-geometry.json`,import.meta.url),JSON.stringify({passed:true,...report},null,2));
  }finally{release(view,assets,gltf);}
});

test('moving a grounded construction preview restores its template and preserves shared buildings',async()=>{
  const {gltf,assets}=await catalogue('low'),land=new Landscape(512,'canyon'),ground=land.geometry(land.renderSize,112),view=viewFor(land,gltf,'low');
  try{
    view.showGhost('wonder',0,40,true);const mesh=view.ghost.children[0].children.find(part=>part.isMesh&&part.userData.structureSurface),geometry=mesh.geometry,first=geometry.attributes.position.array.slice(),version=geometry.attributes.position.version,cache=[...view.sharedModelGeometry];
    view.showGhost('wonder',-37,30,true);assert.equal(mesh.geometry,geometry);assert.ok(geometry.attributes.position.version>version,'moving a preview uploads the changed footing');
    view.showGhost('wonder',0,40,true);assert.deepEqual(geometry.attributes.position.array,first,'returning to a site cannot accumulate excavation');
    let privateDisposed=false,sharedDisposed=false;geometry.addEventListener('dispose',()=>privateDisposed=true);for(const source of cache)source.addEventListener('dispose',()=>sharedDisposed=true);view.showGhost('house',0,40,true);assert.equal(privateDisposed,true);assert.equal(sharedDisposed,false);
  }finally{release(view,assets,gltf);ground.dispose();}
});

test('foundation masonry shares the existing stone textures and physical surface scale',()=>{
  const stone=new THREE.MeshStandardMaterial({roughness:.82}),stoneDark=new THREE.MeshStandardMaterial({roughness:.6}),maps=[new THREE.Texture(),new THREE.Texture(),new THREE.Texture()];[stone.map,stone.normalMap,stone.roughnessMap]=maps;stone.normalScale.set(.35,.6);const uuid=stoneDark.uuid;
  syncFoundationMaterials({materials:{stone,stoneDark}});assert.equal(stoneDark.uuid,uuid);assert.equal(stoneDark.map,maps[0]);assert.equal(stoneDark.normalMap,maps[1]);assert.equal(stoneDark.roughnessMap,maps[2]);assert.deepEqual(stoneDark.normalScale.toArray(),[.35,.6]);assert.equal(stoneDark.roughness,.82);for(const map of maps)map.dispose();stone.dispose();stoneDark.dispose();
});

test('land-building selection rings follow terrain and keep that contour when a connected wall turns',async()=>{
  const {gltf,assets}=await catalogue('low'),land=new Landscape(512,'canyon'),ground=land.geometry(land.renderSize,112),view=viewFor(land,gltf,'low'),original=view.geo.ring.attributes.position.array.slice(),point=new THREE.Vector3();
  try{
    let id=90000;for(const type of ['wonder','towncenter','wall','gate']){
      const node=view.createNode({id:++id,kind:'building',type,owner:0,x:0,z:40,r:BUILDINGS[type].r,hp:100,progress:1}),ring=node.userData.ring;assert.ok(node.userData.selectionRingFitted);assert.notEqual(ring.geometry,view.geo.ring);
      for(const yaw of type==='gate'||type==='wall'?[0,Math.PI/3,Math.PI/2]:[0]){node.rotation.y=yaw;ring.rotation.z=-yaw;node.updateMatrixWorld(true);for(let i=0;i<ring.geometry.attributes.position.count;i++){point.fromBufferAttribute(ring.geometry.attributes.position,i).applyMatrix4(ring.matrixWorld);assert.ok(Math.abs(point.y-land.surfaceHeightAt(point.x,point.z)-.07)<1e-5,'the selection contour remains on the same displayed ground');}}
    }
    assert.deepEqual(view.geo.ring.attributes.position.array,original,'shared source rings remain reusable');
  }finally{release(view,assets,gltf);ground.dispose();}
});

test('instanced wall connector footings reach displayed terrain without adding draw batches or repeated uploads',()=>{
  const sim=new Simulation({mode:'sandbox',map:'canyon',seed:512});sim.entities=[];sim.index=new Map();sim.revision++;sim.visible.fill(1);sim.addBuilding('wall',0,0,40,true);sim.addBuilding('wall',0,3,40,true);
  const land=new Landscape(512,'canyon'),ground=land.geometry(land.renderSize,112),view=Object.create(WorldView.prototype);Object.assign(view,{sim,landscape:land,foundationHeights:new Map(),objects:new THREE.Group(),geo:{box:new THREE.BoxGeometry()},materials:{stone:new THREE.MeshStandardMaterial(),stoneDark:new THREE.MeshStandardMaterial()}});const visual=new WallVisuals(view),matrix=new THREE.Matrix4(),point=new THREE.Vector3();
  try{
    visual.update(false);assert.equal(visual.meshes.length,2);assert.ok(visual.foundation.count>0);
    for(let i=0;i<visual.foundation.count;i++){visual.foundation.getMatrixAt(i,matrix);for(const x of [-.5,.5])for(const z of [-.5,.5]){point.set(x,-.5,z).applyMatrix4(matrix);assert.ok(point.y<land.surfaceHeightAt(point.x,point.z)-.1,'every lower corner intersects actual terrain');}}
    const version=visual.foundation.instanceMatrix.version;visual.update(false);assert.equal(visual.foundation.instanceMatrix.version,version);
  }finally{visual.dispose();ground.dispose();view.geo.box.dispose();for(const material of Object.values(view.materials))material.dispose();}
});

for(const detail of ['low','balanced','near'])test(`${detail} gates ground their closed bars and keep the open passage, housing and shared models intact`,async()=>{
  const {gltf,assets}=await catalogue(detail),quality=detail==='near'?'high':detail==='balanced'?'medium':'low',land=new Landscape(512,'canyon'),ground=land.geometry(land.renderSize,quality==='low'?112:160),view=viewFor(land,gltf,quality),ray=new THREE.Raycaster(),point=new THREE.Vector3();let id=40000;
  try{
    for(const faction of ['alder','sun','raven'])for(const [x,z]of [[0,40],[-60,-35],[-37,30]]){
      Object.assign(view.sim.players[0],{faction,age:0});const entity={id:++id,kind:'building',type:'gate',owner:0,x,z,r:BUILDINGS.gate.r,hp:100,progress:1},template=view.makeBuilding(entity),sources=[];template.userData.portcullis.traverse(mesh=>{if(mesh.isMesh)sources.push({geometry:mesh.geometry,positions:mesh.geometry.attributes.position.array.slice()});});
      const node=view.createNode(entity),gate=node.userData.portcullis,state=gate.userData.terrainGate;assert.ok(state?.parts.length&&state.openLift>=2.5);assert.equal(node.userData.model3d.artRevision,'gate-footings-v1');
      for(const yaw of [0,Math.PI/4,Math.PI/2,Math.PI*.83]){
        node.rotation.y=yaw;gate.position.y=0;updateGatePortcullis(gate);node.updateMatrixWorld(true);const closed=new THREE.Box3().setFromObject(gate);assert.ok(closed.min.y<=land.surfaceHeightAt(x,z)-.1);
        const direction=new THREE.Vector3(0,0,1).applyAxisAngle(new THREE.Vector3(0,1,0),yaw),origin=new THREE.Vector3(0,1,-8).applyAxisAngle(new THREE.Vector3(0,1,0),yaw).add(node.position);ray.set(origin,direction);ray.far=16;assert.ok(ray.intersectObject(gate,true).length,'the closed bars remain selectable');
        gate.position.y=state.openLift*.5;updateGatePortcullis(gate);node.updateMatrixWorld(true);for(const {mesh}of state.parts){assert.ok(mesh.geometry.attributes.position.array.every(Number.isFinite));assert.ok(mesh.geometry.attributes.normal.array.every(Number.isFinite));}
        gate.position.y=state.openLift;updateGatePortcullis(gate);node.updateMatrixWorld(true);assert.equal(gate.visible,false);
        for(const {mesh}of state.parts){const positions=mesh.geometry.attributes.position;for(let i=0;i<positions.count;i++){point.fromBufferAttribute(positions,i).applyMatrix4(mesh.matrixWorld);assert.ok(point.y<=node.position.y+3.501,'open bars retract into the authored housing');}}
        for(const y of [.25,1.2,2.4])for(const lane of [-.6,0,.6]){
          origin.set(lane,y,-8).applyAxisAngle(new THREE.Vector3(0,1,0),yaw).add(node.position);ray.set(origin,direction);ray.far=16;
          const hits=ray.intersectObject(node,true).filter(hit=>hit.object.userData.structureSurface);assert.equal(hits.length,0,'a raised gate has no slab or invisible pick geometry across its passage: '+JSON.stringify({detail,faction,x,z,yaw,y,lane,hits:hits.map(hit=>({role:hit.object.userData.assetMaterial,point:hit.point.clone().sub(node.position).applyAxisAngle(new THREE.Vector3(0,1,0),-yaw).toArray(),moving:state.parts.some(part=>part.mesh===hit.object)}))}));
        }
        const versions=state.parts.map(({mesh})=>mesh.geometry.attributes.position.version);for(let n=0;n<5;n++)updateGatePortcullis(gate);assert.deepEqual(state.parts.map(({mesh})=>mesh.geometry.attributes.position.version),versions,'a stationary gate does not upload geometry again');
        gate.position.y=0;updateGatePortcullis(gate);assert.equal(gate.visible,true);for(const {mesh,closed:positions}of state.parts)assert.deepEqual(mesh.geometry.attributes.position.array,positions,'closing restores the complete closed bars without accumulated clipping');
      }
      for(const source of sources)assert.deepEqual(source.geometry.attributes.position.array,source.positions,'gate animation never modifies shared source buffers');view.releaseNode(node);node.removeFromParent();view.nodes.delete(entity.id);
    }
  }finally{release(view,assets,gltf);ground.dispose();}
});
