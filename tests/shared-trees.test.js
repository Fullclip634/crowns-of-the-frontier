import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as THREE from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {MeshoptDecoder} from 'three/addons/libs/meshopt_decoder.module.js';
import {composeSharedTrees,sharedTreeKeys} from '../scripts/blender/build-shared-trees.mjs';
import {validateMeshPrecision} from '../scripts/blender/validate-mesh-precision.mjs';
import {registerAuthoredAssets,registerSharedTrees,useSharedTrees,clearAuthoredAssets,authoredTree} from '../src/authored-assets.js';

const read=name=>fs.readFileSync(new URL('../src/assets3d/frontier-'+name+'.glb',import.meta.url));
const decode=bytes=>new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'');
test('the shared forest preserves the detailed Blender trees without changing triangle positions or shading',async()=>{
  const precision=await validateMeshPrecision(composeSharedTrees(read('near')),read('trees'));
  assert.equal(precision.models,24);assert.equal(precision.exactTrianglePositionsAndWinding,true);
  fs.writeFileSync('artifacts/shared-trees-precision.json',JSON.stringify(precision,null,2)+'\n');
});

test('all presets render the same tree geometry for every biome, variant and distance while keeping their own troops',async()=>{
  const trees=registerSharedTrees(await decode(read('trees'))),view={materials:{},teamMaterials:[],roofMaterials:[]},scenes=[];
  try{
    for(const root of trees.templates.values())root.traverse(part=>{if(part.isMesh)view.materials[part.userData.assetMaterial]??=part.material;});
    const units=[];
    for(const [file,quality]of [['near','high'],['balanced','medium'],['low','low']]){
      const gltf=await decode(read(file));scenes.push(gltf.scene);const catalogue=registerAuthoredAssets(gltf,quality);const ownTroop=catalogue.templates.get('unit:knight');
      const superseded=[...catalogue.templates].filter(([key])=>key.startsWith('tree:')).map(([,root])=>root);
      useSharedTrees(catalogue,trees);assert.equal(catalogue.templates.size,126);assert.equal(catalogue.templates.get('unit:knight'),ownTroop);units.push(ownTroop);
      assert.ok(superseded.every(root=>root.parent===null),'non-tree template parents cannot retain the discarded forest');let oldTrees=0;gltf.scene.traverse(node=>{if(node.userData.assetKey?.startsWith('tree:'))oldTrees++;});assert.equal(oldTrees,0);
      const parents=[...trees.templates.values()].map(root=>root.parent);useSharedTrees(catalogue,trees);assert.deepEqual([...trees.templates.values()].map(root=>root.parent),parents,'repeated preparation preserves the shared forest scene');
      for(const key of sharedTreeKeys){assert.equal(catalogue.templates.get(key),trees.templates.get(key));const [,biome,variant,detail]=key.split(':'),rendered=authoredTree(view,biome,Number(variant),detail==='far'),expected=[];trees.templates.get(key).traverse(part=>{if(part.isMesh)expected.push(part.geometry);});const actual=[];rendered.traverse(part=>{if(part.isMesh)actual.push(part.geometry);});assert.deepEqual(actual,expected);assert.ok(new THREE.Box3().setFromObject(rendered).getSize(new THREE.Vector3()).length()>1);}
    }
    assert.notEqual(units[0],units[1]);assert.notEqual(units[1],units[2]);
  }finally{clearAuthoredAssets();const geometries=new Set(),materials=new Set();for(const scene of [...scenes,...trees.templates.values()])scene.traverse(part=>{if(part.isMesh){geometries.add(part.geometry);materials.add(part.material);}});for(const value of [...geometries,...materials])value.dispose();}
});

test('an incomplete shared forest cannot silently fall back to different preset models',async()=>{
  const gltf=await decode(read('trees'));let removed=false;gltf.scene.traverse(node=>{if(!removed&&node.userData.assetKey){delete node.userData.assetKey;removed=true;}});assert.throws(()=>registerSharedTrees(gltf),/incomplete/);
});
