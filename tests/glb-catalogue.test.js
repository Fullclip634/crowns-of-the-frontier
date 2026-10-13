import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {readGlb,replaceCatalogueResources,writeGlb} from '../scripts/blender/glb-catalogue.mjs';

function fixture(marker,base=false){
  const nodes=Array.from({length:12},(_,i)=>({mesh:0,name:'resource'+i,extras:{assetKey:`resource:${['food','gold','stone'][Math.floor(i/4)]}:${i%4}`,model3d:{resourceRevision:marker}}}));
  if(base)nodes.push({mesh:0,extras:{assetKey:'unit:archer',motion:{type:'forearm',parent:{type:'arm'}}}});
  const json={asset:{version:'2.0'},scene:0,scenes:[{nodes:nodes.map((_,i)=>i)}],nodes,meshes:[{primitives:[{attributes:{POSITION:0},indices:0,material:0}]}],materials:[{name:marker}],accessors:[{bufferView:0,componentType:5126,count:1,type:'VEC3'}],
    buffers:[{byteLength:4},{byteLength:12,extensions:{EXT_meshopt_compression:{fallback:true}}}],bufferViews:[{buffer:1,byteOffset:0,byteLength:12,extensions:{EXT_meshopt_compression:{buffer:0,byteOffset:0,byteLength:4,byteStride:12,count:1,mode:'ATTRIBUTES'}}}],extensionsUsed:['EXT_meshopt_compression']};
  return writeGlb(json,Buffer.from([marker==='old'?1:2,3,4,5]));
}
test('catalogue composition preserves old binary data, remaps compressed offsets and keeps unrelated joint extras',()=>{
  const old=fixture('old',true),patch=fixture('new'),composed=replaceCatalogueResources(old,patch),parsed=readGlb(composed.bytes),source=readGlb(old);
  assert.equal(composed.keys.length,12);assert.deepEqual(parsed.bin.subarray(0,source.bin.length),source.bin);
  assert.deepEqual(parsed.json.nodes[12],source.json.nodes[12]);assert.deepEqual(parsed.json.meshes[0],source.json.meshes[0]);assert.deepEqual(parsed.json.accessors[0],source.json.accessors[0]);
  assert.deepEqual(parsed.json.scenes[0].nodes.slice(0,12),Array.from({length:12},(_,i)=>i+13));assert.equal(parsed.json.scenes[0].nodes[12],12);
  assert.equal(parsed.json.nodes.filter(node=>node.extras?.assetKey).length,13,'superseded definitions do not appear as duplicate roster entries');
  const view=parsed.json.bufferViews[1];assert.equal(view.buffer,2);assert.equal(view.extensions.EXT_meshopt_compression.buffer,0);assert.equal(view.extensions.EXT_meshopt_compression.byteOffset,4);
  assert.equal(parsed.json.nodes[13].mesh,1);assert.equal(parsed.json.meshes[1].primitives[0].attributes.POSITION,1);assert.equal(parsed.json.meshes[1].primitives[0].material,1);
});
test('unsupported formats and incomplete resource batches fail before a complete catalogue can be emitted',()=>{
  const old=fixture('old',true),patch=readGlb(fixture('new'));patch.json.nodes.pop();assert.throws(()=>replaceCatalogueResources(old,writeGlb(patch.json,patch.bin)));
  const unsupported=readGlb(fixture('new'));unsupported.json.images=[{uri:'external.png'}];assert.throws(()=>replaceCatalogueResources(old,writeGlb(unsupported.json,unsupported.bin)));
  assert.throws(()=>readGlb(Buffer.alloc(24)));
});
test('the real playable roster contains only the supported self-contained mesh and semantic format',()=>{
  for(const detail of ['near','low']){
    const bytes=fs.readFileSync(new URL(`../src/assets3d/frontier-${detail}.glb`,import.meta.url)),document=readGlb(bytes).json;
    assert.equal(document.nodes.filter(node=>node.extras?.assetKey).length,126);assert.ok(document.bufferViews.some(view=>view.extensions?.EXT_meshopt_compression));
    for(const field of ['images','textures','skins','animations','cameras'])assert.ok(!document[field]?.length);
    assert.ok(document.nodes.every(node=>!node.extensions&&node.skin===undefined&&node.camera===undefined));
  }
});
