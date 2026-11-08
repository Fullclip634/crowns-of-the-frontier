import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import * as THREE from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {MeshoptDecoder} from 'three/addons/libs/meshopt_decoder.module.js';
import {WorldView} from '../src/world.js';
import {BUILDINGS} from '../src/data.js';
import {registerAuthoredAssets,clearAuthoredAssets} from '../src/authored-assets.js';
import {buildingModel} from '../src/models-3d.js';
import {packBuildingModel} from '../src/structure-palette.js';

// A town is the densest thing a match ever draws. These ceilings exist so that
// art work cannot quietly cost frames: every change to foundations, battlements
// or age styling has to keep the town inside them. Measured at Imperial, where
// buildings are tallest and carry the most detail.
const TOWN=['towncenter','house','house','house','house','house','house','barracks','range','stable',
  'blacksmith','market','mill','tower','keep','monastery','workshop','farm','farm',
  'wall','wall','wall','wall','wall','wall','wall','wall','wall','wall','wall','wall'];

function fixture(assets){
  const view=Object.create(WorldView.prototype);
  view.materials={};
  for(const template of assets.templates.values())template.traverse(part=>{
    if(part.isMesh&&part.userData.assetMaterial&&!['team','teamRoof'].includes(part.userData.assetMaterial))
      view.materials[part.userData.assetMaterial]??=part.material.clone();
  });
  view.materials.water??=new THREE.MeshStandardMaterial();
  view.teamMaterials=Array.from({length:8},()=>new THREE.MeshStandardMaterial());
  view.roofMaterials=view.teamMaterials.map(material=>material.clone());
  view.geo={box:new THREE.BoxGeometry(1,1,1),sphere:new THREE.IcosahedronGeometry(1,0),cylinder:new THREE.CylinderGeometry(1,1,1,10),cone:new THREE.ConeGeometry(1,1,7)};
  view.sim={players:Array.from({length:8},()=>({faction:'alder',age:3})),options:{seed:512,map:'highlands'},isWater:()=>false};
  view.settings={quality:'low'};
  return view;
}

async function measure(detail){
  const bytes=readFileSync(`src/assets3d/frontier-${detail}.glb`);
  const gltf=await new GLTFLoader().setMeshoptDecoder(MeshoptDecoder)
    .parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'');
  const assets=registerAuthoredAssets(gltf,detail==='near'?'high':detail==='balanced'?'medium':'low',bytes.length);
  try{
    const view=fixture(assets),root=new THREE.Group();
    TOWN.forEach((type,index)=>{
      const entity={kind:'building',type,owner:0,r:BUILDINGS[type].r,x:index*6,z:0};
      const model=buildingModel(view,entity);
      packBuildingModel(view,model,entity);
      root.add(model);
    });
    let drawCalls=0,triangles=0;
    root.traverse(node=>{
      if(!node.isMesh)return;
      drawCalls++;
      const index=node.geometry.index;
      triangles+=(index?index.count:node.geometry.attributes.position.count)/3;
    });
    return {drawCalls,triangles:Math.round(triangles)};
  }finally{clearAuthoredAssets();}
}

test('a full town stays inside its draw-call and triangle budgets',async()=>{
  const low=await measure('low'),near=await measure('near');
  // Structures merge into one opaque draw each, so the count tracks buildings
  // and moving pivots, not mesh parts. Thirty-two buildings plus a mill rotor
  // and a gate portcullis is the practical ceiling.
  assert.ok(low.drawCalls<=40,`low town draws in ${low.drawCalls} calls`);
  assert.ok(near.drawCalls<=40,`near town draws in ${near.drawCalls} calls`);
  assert.equal(low.drawCalls,near.drawCalls,'detail tiers change geometry, never draw calls');
  assert.ok(low.triangles<=60000,`low town costs ${low.triangles} triangles`);
  assert.ok(near.triangles<=250000,`near town costs ${near.triangles} triangles`);
  assert.ok(near.triangles>low.triangles,'the high tier is allowed to be heavier');
});
