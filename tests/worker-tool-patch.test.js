import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';
import {readGlb,writeGlb} from '../scripts/blender/glb-catalogue.mjs';
import {replaceWorkerTools} from '../scripts/blender/worker-tool-patch.mjs';
import {modelFingerprint} from '../scripts/blender/model-patch.mjs';
const keys=['unit:villager','unit:villager:wood','unit:villager:mine','unit:villager:build','unit:villager:food'],all=JSON.parse(fs.readFileSync(new URL('../src/assets3d/catalogue.json',import.meta.url))).models.map(model=>model.key);
function fixture(patch=false){
  const bin=Buffer.from(new Float32Array([0,0,0,1,0,0,0,1,0]).buffer),json={asset:{version:'2.0'},scene:0,scenes:[{nodes:[]}],nodes:[],meshes:[{primitives:[{attributes:{POSITION:0}}]}],accessors:[{bufferView:0,componentType:5126,count:3,type:'VEC3',min:[0,0,0],max:[1,1,0]}],bufferViews:[{buffer:0,byteOffset:0,byteLength:36}],buffers:[{byteLength:36}]};
  for(const key of patch?keys:all){const root={name:key,extras:{assetKey:key,model3d:{type:'villager',revision:'released'}},children:[]};json.scenes[0].nodes.push(json.nodes.length);json.nodes.push(root);const append=(name,role,motion)=>{root.children.push(json.nodes.length);json.nodes.push({name,mesh:0,extras:{assetMaterial:role,motion}});};if(!patch)append(key+' body','team',{type:'torso',pivot:[0,1.28,0],side:1});if(keys.includes(key))for(const role of patch?['wood','iron','steel']:['wood','steel'])append(key+(patch?' new ':' old ')+role,role,{type:'forearm',pivot:[.46,1.63,.035],side:1});}
  return writeGlb(json,bin);
}
test('worker tool composition keeps every unrelated model and released body while replacing only tools',()=>{
  const base=fixture(),patch=fixture(true),result=replaceWorkerTools(base,patch,keys),parsed=readGlb(result.bytes).json;assert.equal(result.unchangedModels,121);assert.equal(result.unchangedWorkerBodies,5);assert.equal(parsed.scenes[0].nodes.length,126);
  for(const key of all.filter(key=>!keys.includes(key)))assert.equal(modelFingerprint(result.bytes,key),modelFingerprint(base,key));
  for(const key of keys){const root=parsed.nodes.find(node=>node.extras?.assetKey===key),children=root.children.map(id=>parsed.nodes[id]);assert.equal(children.length,4);assert.equal(children[0].name,key+' body');assert.deepEqual(children.slice(1).map(node=>node.extras.assetMaterial),['wood','iron','steel']);assert.ok(children.slice(1).every(node=>node.name.includes(' new ')));assert.equal(root.extras.model3d.revision,'released');assert.equal(root.extras.model3d.toolRevision,'craft-tools-v1');}
});
test('tool patches reject body meshes, missing variants and changed root transforms',()=>{
  for(const fault of ['body','missing','transform']){const base=fixture(),{json,bin}=readGlb(fixture(true)),root=json.nodes.find(node=>node.extras?.assetKey===keys[0]);if(fault==='body')json.nodes[root.children[0]].extras.motion.type='torso';if(fault==='missing')delete root.extras.assetKey;if(fault==='transform')root.scale=[1,2,1];assert.throws(()=>replaceWorkerTools(base,writeGlb(json,bin),keys),fault);}
});
