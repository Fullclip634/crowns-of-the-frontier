import assert from 'node:assert/strict';
import {readGlb,writeGlb} from './glb-catalogue.mjs';
import {composeQualityCatalogue} from './quality-catalogue.mjs';
import {modelFingerprint} from './model-patch.mjs';

const tool=node=>node.extras?.motion?.type==='forearm'&&node.extras.motion.side>0&&['wood','steel','iron'].includes(node.extras.assetMaterial);
function bodyFingerprint(bytes,key){const {json,bin}=readGlb(bytes),root=json.nodes.find(n=>n.extras?.assetKey===key);root.children=root.children.filter(id=>!tool(json.nodes[id]));delete root.extras.model3d.toolRevision;return modelFingerprint(writeGlb(json,bin),key);}

// Retain the released body buffers verbatim. Only the closed tool meshes are
// imported from Blender, even inside the five affected figure roots.
export function replaceWorkerTools(base,patch,keys){
  const original=readGlb(base),replacement=readGlb(patch),all=original.json.nodes.filter(n=>n.extras?.assetKey).map(n=>n.extras.assetKey),other=all.filter(key=>!keys.includes(key));assert.equal(all.length,126);assert.equal(other.length,121);
  assert.deepEqual(replacement.json.nodes.filter(n=>n.extras?.assetKey).map(n=>n.extras.assetKey).sort(),keys.slice().sort());
  for(const key of keys){const a=original.json.nodes.find(n=>n.extras?.assetKey===key),b=replacement.json.nodes.find(n=>n.extras?.assetKey===key);for(const field of ['matrix','translation','rotation','scale'])assert.deepEqual(a[field],b[field],key+' root transform');assert.ok(a.children.some(id=>tool(original.json.nodes[id])));a.children=a.children.filter(id=>!tool(original.json.nodes[id]));assert.ok(b.children.length&&b.children.every(id=>tool(replacement.json.nodes[id])),'Only replacement tools may be exported');a.extras.assetKey='worker-body:'+key;b.extras.assetKey='worker-tool:'+key;}
  const combined=composeQualityCatalogue([{bytes:writeGlb(original.json,original.bin),keys:all.map(key=>keys.includes(key)?'worker-body:'+key:key)},{bytes:writeGlb(replacement.json,replacement.bin),keys:keys.map(key=>'worker-tool:'+key)}]),result=readGlb(combined);
  for(const key of keys){const body=result.json.nodes.find(n=>n.extras?.assetKey==='worker-body:'+key),tools=result.json.nodes.find(n=>n.extras?.assetKey==='worker-tool:'+key),id=result.json.nodes.indexOf(tools);body.extras.assetKey=key;body.extras.model3d.toolRevision='craft-tools-v1';body.children.push(...tools.children);result.json.scenes[0].nodes=result.json.scenes[0].nodes.filter(index=>index!==id);delete tools.extras.assetKey;tools.children=[];}
  const bytes=writeGlb(result.json,result.bin);assert.equal(result.json.nodes.filter(n=>n.extras?.assetKey).length,126);
  for(const key of other)assert.equal(modelFingerprint(bytes,key),modelFingerprint(base,key),'Unrelated model: '+key);
  for(const key of keys)assert.equal(bodyFingerprint(bytes,key),bodyFingerprint(base,key),'Released worker body: '+key);
  return {bytes,unchangedModels:other.length,unchangedWorkerBodies:keys.length};
}
