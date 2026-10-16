import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import * as THREE from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {MeshoptDecoder} from 'three/addons/libs/meshopt_decoder.module.js';
import {WorldView} from '../src/world.js';
import {registerAuthoredAssets,clearAuthoredAssets} from '../src/authored-assets.js';
import {buildingModel} from '../src/models-3d.js';
import {packBuildingModel} from '../src/structure-palette.js';

const directory=path.resolve(process.env.ART_CATALOGUE_DIR||fileURLToPath(new URL('../src/assets3d',import.meta.url)));
function fixture(assets,faction){
  const v=Object.create(WorldView.prototype);v.materials={};
  for(const template of assets.templates.values())template.traverse(p=>{if(p.isMesh&&p.userData.assetMaterial&&!['team','teamRoof'].includes(p.userData.assetMaterial))v.materials[p.userData.assetMaterial]??=p.material.clone();});
  v.teamMaterials=[new THREE.MeshStandardMaterial()];v.roofMaterials=[new THREE.MeshStandardMaterial()];
  v.geo={box:new THREE.BoxGeometry(),sphere:new THREE.IcosahedronGeometry(1,0),cylinder:new THREE.CylinderGeometry(1,1,1,10),cone:new THREE.ConeGeometry(1,1,7)};
  v.sim={players:[{faction,age:0}],options:{seed:512,map:'highlands'},isWater:()=>false};v.settings={quality:'low'};return v;
}
function check(root,label,buildingFront){
  let rotor;root.traverse(n=>{if(n.userData.windmill){assert.equal(rotor,undefined);rotor=n;}});assert.ok(rotor,label+' has an animated rotor');
  const base=new THREE.Box3(),box=new THREE.Box3();root.updateMatrixWorld(true);
  root.traverse(n=>{if(!n.isMesh||n.userData.windmillMount)return;let p=n;while(p){if(p===rotor)return;p=p.parent;}box.setFromObject(n);base.union(box);});
  let minimum=Infinity;buildingFront??=base.max.z;
  // Z does not vary under rotation about the axle. The sampled complete turn
  // also checks the real packed pivot and bounds instead of a metadata value.
  for(let degree=0;degree<=360;degree+=5){rotor.rotation.z=degree*Math.PI/180;root.updateMatrixWorld(true);box.setFromObject(rotor,true);minimum=Math.min(minimum,box.min.z-buildingFront);assert.ok(box.min.y>2.4,label+' blades stay above ground');}
  assert.ok(minimum>.24,`${label}: swept blades intersect the building (${minimum}m separation)`);
  rotor.rotation.z=0;return {minimum,buildingFront};
}
for(const detail of ['low','balanced','near'])test(`${detail} mills clear every roof throughout a full rotation before and after render batching`,async()=>{
  const bytes=fs.readFileSync(path.join(directory,`frontier-${detail}.glb`)),gltf=await new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'');
  try{
    const assets=registerAuthoredAssets(gltf,detail==='near'?'high':detail==='balanced'?'medium':'low',bytes.length);
    for(const faction of ['alder','sun','raven']){
      const view=fixture(assets,faction),e={kind:'building',type:'mill',owner:0,r:2.5,x:0,z:0},raw=buildingModel(view,e);
      let mounts=0;raw.traverse(n=>{if(n.isMesh&&n.userData.windmillMount)mounts++;});assert.equal(mounts,3,'solid bearing, axle and hub are present');
      const before=check(raw,detail+' '+faction),packed=packBuildingModel(view,raw,e);check(packed,detail+' '+faction+' batched',before.buildingFront);
      let draws=0;packed.traverse(n=>{if(n.isMesh)draws++;});assert.ok(draws<=6,'mounts merge into existing material draws');
    }
    if(detail==='low'){
      clearAuthoredAssets();
      for(const faction of ['alder','sun','raven'])check(buildingModel(fixture(assets,faction),{kind:'building',type:'mill',owner:0,r:2.5,x:0,z:0}),'procedural '+faction);
    }
  }finally{clearAuthoredAssets();}
});
