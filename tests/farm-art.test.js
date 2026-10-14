import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import * as THREE from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {MeshoptDecoder} from 'three/addons/libs/meshopt_decoder.module.js';
import {registerAuthoredAssets,clearAuthoredAssets} from '../src/authored-assets.js';
import {WorldView} from '../src/world.js';
import {Landscape} from '../src/landscape.js';

const catalogue=process.env.ART_CATALOGUE_DIR?pathToFileURL(path.resolve(process.env.ART_CATALOGUE_DIR)+path.sep):new URL('../src/assets3d/',import.meta.url);
const factions=['alder','sun','raven'];
function makeView(land,gltf,quality){
  const view=Object.create(WorldView.prototype),materials={};
  gltf.scene.traverse(part=>{if(part.isMesh&&part.userData.assetMaterial&&!materials[part.userData.assetMaterial])materials[part.userData.assetMaterial]=part.material.clone();});
  materials.shadow=new THREE.MeshBasicMaterial();
  Object.assign(view,{landscape:land,foundationHeights:new Map(),materials,teamMaterials:[materials.team],roofMaterials:[materials.teamRoof],geo:{ring:new THREE.RingGeometry(.92,1,32)},modelsReady:true,settings:{quality},objects:new THREE.Group(),nodes:new Map(),ghost:new THREE.Group(),sim:{players:[{faction:'alder',age:0}]}});
  return view;
}
function disposeView(view){
  const geometry=new Set(view.sharedModelGeometry||[]),materials=new Set(Object.values(view.materials));
  for(const node of view.nodes.values())view.releaseNode(node);
  view.ghost.traverse(mesh=>{if(mesh.isMesh){geometry.add(mesh.geometry);materials.add(mesh.material);}});
  for(const g of Object.values(view.geo))geometry.add(g);
  for(const g of geometry)g.dispose();for(const m of materials)m.dispose();
}

for(const detail of ['low','balanced','near'])test(`${detail} exports solid original crops and fits real field, selection and preview geometry`,async()=>{
  const bytes=fs.readFileSync(new URL(`frontier-${detail}.glb`,catalogue)),gltf=await new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'');
  const quality=detail==='near'?'high':detail==='balanced'?'medium':'low',assets=registerAuthoredAssets(gltf,quality,bytes.length),land=new Landscape(512,'canyon'),ground=land.geometry(),view=makeView(land,gltf,quality);
  try{
    for(const faction of factions){
      const key=`building:farm:${faction}:0`,root=assets.templates.get(key);assert.equal(root.userData.model3d.artRevision,'field-crops-v1');root.updateMatrixWorld(true);
      const size=new THREE.Box3().setFromObject(root).getSize(new THREE.Vector3());assert.ok(size.x>5.7&&size.x<6.2&&size.z>5.7&&size.z<6.2&&size.y>1.2&&size.y<1.7,key+' has playable solid dimensions');
      let triangles=0;const volume={},roles=new Set();
      root.traverse(mesh=>{
        if(!mesh.isMesh)return;const role=mesh.userData.assetMaterial,g=mesh.geometry,p=g.attributes.position,count=g.index?.count??p.count;roles.add(role);triangles+=count/3;
        for(const name of ['position','normal','uv','color']){const attribute=g.attributes[name];assert.ok(attribute);for(let i=0;i<attribute.count;i++)for(let c=0;c<attribute.itemSize;c++)assert.ok(Number.isFinite(attribute.getComponent(i,c)),key+' has finite '+name);}
        if(detail==='low')assert.ok(!mesh.userData.nearOnly);
        const a=new THREE.Vector3(),b=new THREE.Vector3(),c=new THREE.Vector3();
        for(let i=0;i<count;i+=3){a.fromBufferAttribute(p,g.index?g.index.getX(i):i).applyMatrix4(mesh.matrixWorld);b.fromBufferAttribute(p,g.index?g.index.getX(i+1):i+1).applyMatrix4(mesh.matrixWorld);c.fromBufferAttribute(p,g.index?g.index.getX(i+2):i+2).applyMatrix4(mesh.matrixWorld);volume[role]=(volume[role]||0)+a.dot(b.cross(c))/6;}
      });
      for(const role of ['soil','furrow','grain','leaf','wood','team']){assert.ok(roles.has(role));assert.ok(volume[role]>.00001,key+' retains outward volumetric '+role);}
      assert.ok(triangles<(detail==='low'?14000:65000),'crop detail stays bounded');
      view.sim.players[0].faction=faction;
      const e={id:view.nodes.size+1,kind:'building',type:'farm',owner:0,x:-60,z:-35,r:3,hp:100,progress:1},template=view.makeBuilding(e),source=template.children.find(part=>part.isMesh).geometry,original=source.attributes.position.array.slice();
      const node=view.createNode(e),field=node.children.find(part=>part.isMesh&&part!==node.userData.ring),p=field.geometry.attributes.position,point=new THREE.Vector3();
      assert.notEqual(field.geometry,source);assert.deepEqual(source.attributes.position.array,original);assert.equal(node.userData.model3d.artRevision,'field-crops-v1');
      for(let i=0;i<p.count;i++){point.fromBufferAttribute(p,i).applyMatrix4(field.matrixWorld);assert.ok(Math.abs(point.y-land.surfaceHeightAt(point.x,point.z)-source.attributes.position.getY(i))<1e-5,key+' keeps authored crop height above the actual terrain');}
      const ring=node.userData.ring;for(let i=0;i<ring.geometry.attributes.position.count;i++){point.fromBufferAttribute(ring.geometry.attributes.position,i).applyMatrix4(ring.matrixWorld);assert.ok(Math.abs(point.y-land.surfaceHeightAt(point.x,point.z)-.07)<1e-5,'selection ring follows the same ground');}
      const hit=new THREE.Raycaster(new THREE.Vector3(e.x,20,e.z),new THREE.Vector3(0,-1,0)).intersectObject(node,true).find(hit=>hit.object!==ring);assert.ok(hit);assert.equal(hit.object.userData.entity,e.id);
    }
    view.showGhost('farm',45,55,true);const field=view.ghost.children[0].children.find(part=>part.isMesh),previewGeometry=field.geometry,first=previewGeometry.attributes.position.array.slice();
    view.showGhost('farm',-60,-35,true);assert.equal(field.geometry,previewGeometry);view.showGhost('farm',45,55,true);assert.deepEqual(previewGeometry.attributes.position.array,first,'moving the real crop preview cannot accumulate terrain offsets');
    let released=false;previewGeometry.addEventListener('dispose',()=>released=true);view.showGhost('house',45,55,true);assert.equal(released,true,'changing placement releases the unique fitted crop buffers');view.showGhost('farm',45,55,true);assert.ok(view.ghost.children[0].userData.farmTerrainFitted===undefined&&view.ghost.userData.farmTerrainFitted,'a newly chosen crop preview is fitted again');
  }finally{disposeView(view);ground.dispose();clearAuthoredAssets();for(const g of assets.geometries)g.dispose();const materials=new Set();gltf.scene.traverse(part=>{if(part.isMesh)materials.add(part.material);});for(const m of materials)m.dispose();}
});
