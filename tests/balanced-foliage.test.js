import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import * as THREE from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {MeshoptDecoder} from 'three/addons/libs/meshopt_decoder.module.js';
import {foliageKeys,augmentBalancedTrees} from '../scripts/blender/balanced-foliage.mjs';
import {readGlb,writeGlb} from '../scripts/blender/glb-catalogue.mjs';
import {modelFingerprint} from '../scripts/blender/model-patch.mjs';
import {registerAuthoredAssets,clearAuthoredAssets} from '../src/authored-assets.js';
import {WorldView} from '../src/world.js';
import {treeModel} from '../src/models-3d.js';
const base=process.env.ART_CATALOGUE_DIR?pathToFileURL(path.resolve(process.env.ART_CATALOGUE_DIR)+path.sep):new URL('../src/assets3d/',import.meta.url),read=name=>fs.readFileSync(new URL(name,base));
async function load(name){const bytes=read(`frontier-${name}.glb`),gltf=await new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'');gltf.scene.updateMatrixWorld(true);return gltf.scene;}
function roots(scene){const result=new Map();scene.traverse(node=>{if(node.userData.assetKey)result.set(node.userData.assetKey,node);});return result;}
function dispose(scene){const geometries=new Set(),materials=new Set();scene.traverse(node=>{if(node.isMesh){geometries.add(node.geometry);materials.add(node.material);}});for(const value of [...geometries,...materials])value.dispose();}
function triangles(root){let count=0;root.traverse(node=>{if(node.isMesh)count+=(node.geometry.index?.count??node.geometry.attributes.position.count)/3;});return count;}

test('the intermediate patch changes only eight near broadleaf models and retains their authored origins',()=>{
  const low=read('frontier-low.glb'),near=read('frontier-near.glb'),patch=read('frontier-foliage.glb'),augmented=augmentBalancedTrees(low,patch,near),j=readGlb(augmented).json;
  const byKey=bytes=>new Map(readGlb(bytes).json.nodes.filter(n=>n.extras?.assetKey).map(n=>[n.extras.assetKey,n]));
  const before=byKey(low),nearByKey=byKey(near),after=byKey(augmented);assert.equal(after.size,126);assert.equal(j.scenes[0].nodes.length,126);
  for(const [key,node]of before){if(!foliageKeys.includes(key)){assert.equal(modelFingerprint(augmented,key),modelFingerprint(low,key),key+' stays byte-exact before the final pack');continue;}
    const next=after.get(key),baseNear=nearByKey.get(key);assert.equal(next.children.length,(baseNear.children?.length||0)+2);assert.equal(next.extras.balancedFoliage,'volumetric-tips-v1');
    for(const field of ['translation','rotation','scale','matrix'])assert.deepEqual(next[field],node[field]);
  }
});

test('Shared sculpted trees keep closed 3D foliage, matching silhouettes and optimized triangle budgets across biomes',async()=>{
  const trees=await load('trees'),balanced=await load('balanced');const reports=[];
  try{const t=roots(trees),b=roots(balanced);for(const biome of ['highlands','winter','desert'])for(let variant=0;variant<4;variant++){
    const nearKey=`tree:${biome}:${variant}:near`,farKey=`tree:${biome}:${variant}:far`;
    const near=t.get(nearKey),far=t.get(farKey),bal=b.get(nearKey);
    const roles=new Set(),nearBounds=new THREE.Box3().setFromObject(near),farBounds=new THREE.Box3().setFromObject(far);
    let volume=0;
    near.traverse(node=>{if(!node.isMesh)return;roles.add(node.userData.assetMaterial);const g=node.geometry,p=g.attributes.position,index=g.index,a=new THREE.Vector3(),bb=new THREE.Vector3(),c=new THREE.Vector3();let localVolume=0;
      for(let i=0;i<(index?.count??p.count);i+=3){a.fromBufferAttribute(p,index?index.getX(i):i);bb.fromBufferAttribute(p,index?index.getX(i+1):i+1);c.fromBufferAttribute(p,index?index.getX(i+2):i+2);localVolume+=a.dot(bb.cross(c))/6;}
      assert.ok(localVolume>.001,nearKey+' meshes have outward closed volume');volume+=localVolume;assert.ok(p.array.every(Number.isFinite));assert.equal(g.attributes.normal.count,p.count);assert.equal(g.attributes.color.count,p.count);
    });
    const nearTriangles=triangles(near),farTriangles=triangles(far),balancedTriangles=triangles(bal);
    assert.ok(nearTriangles>farTriangles&&farTriangles>=600,nearKey+' keeps distinct near/far budgets');
    if(biome!=='highlands')assert.ok(nearTriangles<=2400,`${nearKey} stays optimized (${nearTriangles} tris)`);
    assert.ok(Math.abs(nearBounds.max.y-farBounds.max.y)<.5,nearKey+' far silhouette retains near height');
    reports.push({key:nearKey,volume,nearTriangles,farTriangles,balancedTriangles});
  }fs.mkdirSync('artifacts',{recursive:true});fs.writeFileSync('artifacts/balanced-foliage-geometry.json',JSON.stringify({passed:true,trees:reports},null,2));}
  finally{for(const scene of [trees,balanced])dispose(scene);}
});

test('foliage composition rejects incomplete patches and moved tree origins',()=>{
  const low=read('frontier-low.glb'),near=read('frontier-near.glb'),patch=readGlb(read('frontier-foliage.glb')),root=patch.json.nodes.find(n=>n.extras?.assetKey);const key=root.extras.assetKey;root.extras.assetKey='tree:missing:0:near';assert.throws(()=>augmentBalancedTrees(low,writeGlb(patch.json,patch.bin),near),/eight authored/);root.extras.assetKey=key;root.translation=[1,0,0];assert.throws(()=>augmentBalancedTrees(low,writeGlb(patch.json,patch.bin),near),/tree root transform/);
});

test('the real forest merge retains the new tips within the original three material batches',async()=>{
  const scene=await load('balanced'),catalogue=registerAuthoredAssets({scene},'medium'),view=Object.create(WorldView.prototype);view.materials={};
  for(const root of catalogue.templates.values())root.traverse(node=>{if(node.isMesh&&node.userData.assetMaterial)view.materials[node.userData.assetMaterial]??=node.material.clone();});
  view.teamMaterials=[];view.roofMaterials=[];view.geo={};view.sim={options:{seed:512,map:'highlands'},players:[{faction:'alder',age:0}]};const reports=[];
  try{for(const key of foliageKeys){const [,biome,variant]=key.split(':'),model=treeModel(view,biome,Number(variant)),expected=triangles(model),bounds=new THREE.Box3().setFromObject(model),merged=view.mergeModel(model);let meshes=0;
    merged.traverse(node=>{if(node.isMesh){meshes++;assert.ok(node.geometry.attributes.position.array.every(Number.isFinite));}});assert.equal(meshes,3);assert.equal(triangles(merged),expected);const after=new THREE.Box3().setFromObject(merged);assert.ok(bounds.min.distanceTo(after.min)<1e-5&&bounds.max.distanceTo(after.max)<1e-5);reports.push({key,meshes,triangles:expected});
    merged.traverse(node=>{if(node.isMesh)node.geometry.dispose();});
  }fs.writeFileSync('artifacts/balanced-foliage-batching.json',JSON.stringify({passed:true,trees:reports},null,2));}
  finally{clearAuthoredAssets();dispose(scene);for(const material of Object.values(view.materials))material.dispose();for(const geometry of Object.values(view.geo))geometry.dispose?.();}
});
