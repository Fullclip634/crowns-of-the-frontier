import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readGlb} from './glb-catalogue.mjs';
import {composeQualityCatalogue} from './quality-catalogue.mjs';
const parsed=new WeakMap(),hash=value=>createHash('sha256').update(value).digest('hex');
export function modelFingerprint(bytes,key){
  if(!parsed.has(bytes)){const p=readGlb(bytes);p.views=new Map();p.roots=new Map(p.json.nodes.flatMap(node=>node.extras?.assetKey?[[node.extras.assetKey,node]]:[]));parsed.set(bytes,p);}
  const {json,bin,views,roots}=parsed.get(bytes),root=roots.get(key);assert.ok(root,'Missing '+key);
  const view=index=>{if(!views.has(index)){const v=json.bufferViews[index],c=v.extensions?.EXT_meshopt_compression;views.set(index,{stride:v.byteStride,decode:c&&{stride:c.byteStride,count:c.count,mode:c.mode,filter:c.filter},hash:hash(bin.subarray(c?.byteOffset??v.byteOffset??0,(c?.byteOffset??v.byteOffset??0)+(c?.byteLength??v.byteLength)))});}return views.get(index);};
  const accessor=index=>{const a=structuredClone(json.accessors[index]);if(a.bufferView!==undefined)a.bufferView=view(a.bufferView);return a;};
  const node=n=>({...Object.fromEntries(Object.entries(n).filter(([key])=>!['children','mesh'].includes(key))),children:(n.children||[]).map(index=>node(json.nodes[index])),mesh:n.mesh===undefined?null:json.meshes[n.mesh].primitives.map(p=>({...p,attributes:Object.fromEntries(Object.entries(p.attributes).map(([key,index])=>[key,accessor(index)])),indices:p.indices===undefined?null:accessor(p.indices),material:p.material===undefined?null:json.materials[p.material]}))});
  return hash(JSON.stringify(node(root)));
}
export function replaceModelPatch(base,patch,keys){
  const original=readGlb(base).json,next=readGlb(patch).json,all=original.nodes.filter(n=>n.extras?.assetKey).map(n=>n.extras.assetKey),other=all.filter(key=>!keys.includes(key));
  assert.equal(all.length,126);assert.equal(new Set(all).size,126);assert.equal(new Set(keys).size,keys.length);assert.deepEqual(next.nodes.filter(n=>n.extras?.assetKey).map(n=>n.extras.assetKey).sort(),keys.slice().sort());
  for(const key of keys){const a=original.nodes.find(n=>n.extras?.assetKey===key),b=next.nodes.find(n=>n.extras?.assetKey===key);assert.ok(a);for(const field of ['matrix','translation','rotation','scale'])assert.deepEqual(b[field],a[field],'Preserve root transform: '+key);}
  const reused=keys.every(key=>modelFingerprint(base,key)===modelFingerprint(patch,key)),bytes=reused?base:composeQualityCatalogue([{bytes:base,keys:other},{bytes:patch,keys}]);
  assert.equal(readGlb(bytes).json.nodes.filter(n=>n.extras?.assetKey).length,126);
  for(const key of other)assert.equal(modelFingerprint(bytes,key),modelFingerprint(base,key),'Unrelated model changed: '+key);
  for(const key of keys)assert.equal(modelFingerprint(bytes,key),modelFingerprint(patch,key),'Patch model changed: '+key);
  return {bytes,unchangedModels:other.length,replacedModels:reused?0:keys.length,reused};
}
