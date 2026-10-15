import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import {composeQualityCatalogue} from '../scripts/blender/quality-catalogue.mjs';
import {augmentBalancedTrees,composeBalancedCatalogue} from '../scripts/blender/balanced-foliage.mjs';
import {readGlb,writeGlb} from '../scripts/blender/glb-catalogue.mjs';
import * as THREE from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {MeshoptDecoder} from 'three/addons/libs/meshopt_decoder.module.js';

const parsed=new WeakMap();
// Validate a complete staged catalogue without first replacing the live art.
const catalogue=process.env.ART_CATALOGUE_DIR?pathToFileURL(path.resolve(process.env.ART_CATALOGUE_DIR)+path.sep):new URL('../src/assets3d/',import.meta.url);
const asset=name=>new URL(name,catalogue);
function fingerprint(bytes,key){
  if(!parsed.has(bytes)){const p=readGlb(bytes);p.views=new Map();p.roots=new Map(p.json.nodes.flatMap(n=>n.extras?.assetKey?[[n.extras.assetKey,n]]:[]));parsed.set(bytes,p);}
  const {json:j,bin,views,roots}=parsed.get(bytes),root=roots.get(key);assert.ok(root,key);
  const view=index=>{if(!views.has(index)){const v=j.bufferViews[index],c=v.extensions?.EXT_meshopt_compression;views.set(index,{stride:v.byteStride,decode:c&&{stride:c.byteStride,count:c.count,mode:c.mode,filter:c.filter},hash:createHash('sha256').update(bin.subarray(c?.byteOffset??v.byteOffset??0,(c?.byteOffset??v.byteOffset??0)+(c?.byteLength??v.byteLength))).digest('hex')});}return views.get(index);};
  const accessor=index=>{const a=j.accessors[index],out=structuredClone(a);if(a.bufferView!==undefined)out.bufferView=view(a.bufferView);return out;};
  const node=n=>({...Object.fromEntries(Object.entries(n).filter(([k])=>!['children','mesh'].includes(k))),children:(n.children||[]).map(i=>node(j.nodes[i])),mesh:n.mesh===undefined?null:j.meshes[n.mesh].primitives.map(p=>({...p,attributes:Object.fromEntries(Object.entries(p.attributes).map(([k,i])=>[k,accessor(i)])),indices:p.indices===undefined?null:accessor(p.indices),material:p.material===undefined?null:j.materials[p.material]}))});
  return createHash('sha256').update(JSON.stringify(node(root))).digest('hex');
}

test('Balanced covers all 126 original models and its composition preserves selected compressed geometry before packing',()=>{
  const manifest=JSON.parse(fs.readFileSync(asset('catalogue.json'))),near=fs.readFileSync(asset('frontier-near.glb')),low=fs.readFileSync(asset('frontier-low.glb')),foliage=fs.readFileSync(asset('frontier-foliage.glb')),balanced=fs.readFileSync(asset('frontier-balanced.glb'));
  const j=readGlb(balanced).json;assert.equal(j.scenes[0].nodes.length,126);assert.equal(j.nodes.filter(n=>n.extras?.assetKey).length,126);assert.equal(balanced.length,manifest.sizes.balanced);assert.ok(balanced.length<near.length);
  for(const [name,bytes]of [['near',near],['low',low],['foliage',foliage]])assert.equal(createHash('sha256').update(bytes).digest('hex'),manifest.balancedSourceHashes[name],'Rebuild Balanced after changing a source catalogue');
  const trees=augmentBalancedTrees(low,foliage,near),{bytes:composed}=composeBalancedCatalogue({near,low,foliage,models:manifest.models});
  for(const model of manifest.models){const source=/^(building|resource):/.test(model.key)?near:trees;assert.equal(fingerprint(composed,model.key),fingerprint(source,model.key),model.key+' retains its surfaces, joints and exact compressed mesh before repacking');}
  for(const v of j.bufferViews){const c=v.extensions?.EXT_meshopt_compression;if(c)assert.ok(c.buffer===0&&c.byteOffset+c.byteLength<=j.buffers[0].byteLength);else if(v.buffer===0)assert.ok((v.byteOffset||0)+v.byteLength<=j.buffers[0].byteLength);}
});

test('the decoded Balanced geometry keeps visible triangles, silhouettes, surface roles and animated joints',async()=>{
  const loader=new GLTFLoader().setMeshoptDecoder(MeshoptDecoder),snapshot=async name=>{
    const bytes=Buffer.isBuffer(name)?name:fs.readFileSync(asset(`frontier-${name}.glb`)),gltf=await loader.parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'');
    const models=new Map(),geometries=new Set(),materials=new Set();gltf.scene.updateMatrixWorld(true);
    gltf.scene.traverse(root=>{if(!root.userData.assetKey)return;const bounds=new THREE.Box3().setFromObject(root),data={triangles:0,solidTriangles:0,surfaces:{},min:bounds.min.toArray(),max:bounds.max.toArray(),semantics:[]};
      root.traverse(part=>{if(part.userData.motion||part.userData.gate||part.userData.windmill||part.userData.dockPier)data.semantics.push(JSON.stringify(part.userData));if(!part.isMesh)return;const g=part.geometry;geometries.add(g);materials.add(part.material);const count=g.index?.count??g.attributes.position.count;data.triangles+=count/3;let solid=0;const a=new THREE.Vector3(),b=new THREE.Vector3(),c=new THREE.Vector3();for(let i=0;i<count;i+=3){a.fromBufferAttribute(g.attributes.position,g.index?g.index.getX(i):i);b.fromBufferAttribute(g.attributes.position,g.index?g.index.getX(i+1):i+1);c.fromBufferAttribute(g.attributes.position,g.index?g.index.getX(i+2):i+2);if(b.sub(a).cross(c.sub(a)).lengthSq()>1e-16)solid++;}data.solidTriangles+=solid;if(solid)data.surfaces[part.userData.assetMaterial]=(data.surfaces[part.userData.assetMaterial]||0)+solid;for(let i=0;i<g.attributes.position.count;i++)assert.ok(Number.isFinite(g.attributes.position.getX(i))&&Number.isFinite(g.attributes.position.getY(i))&&Number.isFinite(g.attributes.position.getZ(i)));});
      data.semantics.sort();models.set(root.userData.assetKey,data);
    });for(const geometry of geometries)geometry.dispose();for(const material of materials)material.dispose();return models;
  };
  const balanced=await snapshot('balanced');assert.equal(balanced.size,126);
  const trees=augmentBalancedTrees(fs.readFileSync(asset('frontier-low.glb')),fs.readFileSync(asset('frontier-foliage.glb')),fs.readFileSync(asset('frontier-near.glb')));
  for(const source of ['near','low'])for(const [key,expected]of await snapshot(source==='near'?source:trees)){
    if((/^(building|resource):/.test(key)?'near':'low')!==source)continue;const actual=balanced.get(key);assert.equal(actual.solidTriangles,expected.solidTriangles,key+' keeps every nondegenerate triangle');assert.ok(actual.triangles>=actual.solidTriangles&&actual.triangles<=expected.triangles,'Packing may remove only invisible degenerate faces');assert.deepEqual(actual.surfaces,expected.surfaces,key+' keeps its visible surface coverage');assert.deepEqual(actual.semantics,expected.semantics,key+' keeps its animation semantics');
    for(const bound of ['min','max'])for(let i=0;i<3;i++)assert.ok(Math.abs(actual[bound][i]-expected[bound][i])<.025,key+' retains its authored silhouette');
  }
});

test('quality composition rejects missing/duplicate models and unsupported external geometry',()=>{
  const low=fs.readFileSync(asset('frontier-low.glb')),key='unit:archer';
  assert.throws(()=>composeQualityCatalogue([{bytes:low,keys:['missing:model']}]),/Missing model/);
  assert.throws(()=>composeQualityCatalogue([{bytes:low,keys:[key,key]}]),/Duplicate model/);
  const external=readGlb(low);external.json.buffers[0].uri='external.bin';assert.throws(()=>composeQualityCatalogue([{bytes:writeGlb(external.json,external.bin),keys:[key]}]),/embedded/);
});
