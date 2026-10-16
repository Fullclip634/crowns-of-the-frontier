import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {composeQualityCatalogue} from './quality-catalogue.mjs';
import {readGlb} from './glb-catalogue.mjs';
import {lowCatalogueBudget} from './content-budget.mjs';
const root=fileURLToPath(new URL('../../',import.meta.url)),args=process.argv.slice(2);
assert.ok(!args.length||(args.length===2&&args[0]==='--directory'),'Use --directory for a complete catalogue built by the art pipeline.');
const baseFolder=path.resolve(root,args[1]||'src/assets3d'),folder=args.length?baseFolder:path.join(root,'.tools/art-candidate/farms/full'),relative=path.relative(root,baseFolder);
assert.ok(relative&&!relative.startsWith('..')&&!path.isAbsolute(relative),'Catalogue must stay within the project');
const patchFolder=path.join(root,'.tools/art-candidate/farms/optimized'),manifest=JSON.parse(fs.readFileSync(path.join(baseFolder,'catalogue.json'))),farmKeys=['alder','sun','raven'].map(faction=>`building:farm:${faction}:0`),otherKeys=manifest.models.map(model=>model.key).filter(key=>!farmKeys.includes(key));
assert.equal(manifest.completeCatalogue,true,'Partial catalogues cannot receive a full farm composition');assert.equal(manifest.models.length,126);assert.equal(otherKeys.length,123);fs.mkdirSync(folder,{recursive:true});
const hash=value=>createHash('sha256').update(value).digest('hex');
function fingerprint(bytes,key){
  const {json,bin}=readGlb(bytes),root=json.nodes.find(node=>node.extras?.assetKey===key);assert.ok(root,'Missing '+key);
  const view=index=>{const v=json.bufferViews[index],c=v.extensions?.EXT_meshopt_compression;return {stride:v.byteStride,decode:c&&{stride:c.byteStride,count:c.count,mode:c.mode,filter:c.filter},hash:hash(bin.subarray(c?.byteOffset??v.byteOffset??0,(c?.byteOffset??v.byteOffset??0)+(c?.byteLength??v.byteLength)))};};
  const accessor=index=>{const a=structuredClone(json.accessors[index]);if(a.bufferView!==undefined)a.bufferView=view(a.bufferView);return a;};
  const node=n=>({...Object.fromEntries(Object.entries(n).filter(([key])=>!['children','mesh'].includes(key))),children:(n.children||[]).map(index=>node(json.nodes[index])),mesh:n.mesh===undefined?null:json.meshes[n.mesh].primitives.map(p=>({...p,attributes:Object.fromEntries(Object.entries(p.attributes).map(([key,index])=>[key,accessor(index)])),indices:p.indices===undefined?null:accessor(p.indices),material:p.material===undefined?null:json.materials[p.material]}))});return hash(JSON.stringify(node(root)));
}
const sizes={},farmSourceHashes={},checks=[];
for(const detail of ['low','near']){
  const base=fs.readFileSync(path.join(baseFolder,`frontier-${detail}.glb`)),patch=fs.readFileSync(path.join(patchFolder,`frontier-${detail}.glb`)),p=readGlb(patch).json;
  assert.deepEqual(p.nodes.filter(node=>node.extras?.assetKey).map(node=>node.extras.assetKey).sort(),farmKeys.slice().sort());
  const reused=farmKeys.every(key=>fingerprint(base,key)===fingerprint(patch,key));
  const composed=reused?base:composeQualityCatalogue([{bytes:base,keys:otherKeys},{bytes:patch,keys:farmKeys}]),j=readGlb(composed).json;assert.equal(j.nodes.filter(node=>node.extras?.assetKey).length,126);
  for(const key of otherKeys)assert.equal(fingerprint(composed,key),fingerprint(base,key),'Unrelated model changed: '+key);
  for(const key of farmKeys){assert.equal(fingerprint(composed,key),fingerprint(patch,key),'Farm patch changed while composing');const old=readGlb(base).json.nodes.find(node=>node.extras?.assetKey===key),next=j.nodes.find(node=>node.extras?.assetKey===key);for(const field of ['matrix','translation','rotation','scale'])assert.deepEqual(next[field],old[field],'Farm transforms must stay compatible');}
  fs.writeFileSync(path.join(folder,`frontier-${detail}.glb`),composed);sizes[detail]=composed.length;farmSourceHashes[detail]=hash(patch);checks.push({detail,unchangedOtherModels:otherKeys.length,farms:farmKeys.length,replacedFarms:reused?0:farmKeys.length,patchAlreadyPresent:reused,bytes:composed.length});
}
assert.ok(sizes.low<lowCatalogueBudget(manifest),'The complete Low catalogue must retain its content budget');
fs.writeFileSync(path.join(folder,'catalogue.json'),JSON.stringify({...manifest,sizes:{...manifest.sizes,...sizes},farmRevision:'field-crops-v1',farmSourceHashes,source:'Original Blender crop fields composed with unchanged original models.'},null,2)+'\n');
const report={passed:true,checks,liveCatalogueChanged:folder===path.join(root,'src/assets3d')};
// Build diagnostics belong to development tools, not the browser asset payload.
const reportFolder=args.length?patchFolder:folder;
fs.writeFileSync(path.join(reportFolder,'composition-validation.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report));
