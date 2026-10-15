import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {replaceModelPatch} from './model-patch.mjs';
const root=fileURLToPath(new URL('../../',import.meta.url)),args=process.argv.slice(2);
assert.ok(!args.length||(args.length===2&&args[0]==='--directory'),'Use --directory for a complete project-owned catalogue');
const baseFolder=path.resolve(root,args[1]||'src/assets3d'),relative=path.relative(root,baseFolder);assert.ok(relative&&!relative.startsWith('..')&&!path.isAbsolute(relative));
const folder=args.length?baseFolder:path.join(root,'.tools/art-candidate/gate-footings/full'),patchFolder=path.join(root,'.tools/art-candidate/gate-footings/optimized'),manifest=JSON.parse(fs.readFileSync(path.join(baseFolder,'catalogue.json')));assert.equal(manifest.completeCatalogue,true);fs.mkdirSync(folder,{recursive:true});
const keys=['alder','sun','raven'].map(faction=>`building:gate:${faction}:0`),sizes={},hashes={},checks=[];
for(const detail of ['low','near']){
  const base=fs.readFileSync(path.join(baseFolder,`frontier-${detail}.glb`)),patch=fs.readFileSync(path.join(patchFolder,`frontier-${detail}.glb`)),result=replaceModelPatch(base,patch,keys);
  if(detail==='low')assert.ok(result.bytes.length<4*1024*1024,'Retain the complete Low content budget');
  fs.writeFileSync(path.join(folder,`frontier-${detail}.glb`),result.bytes);sizes[detail]=result.bytes.length;hashes[detail]=createHash('sha256').update(patch).digest('hex');checks.push({detail,unchangedModels:result.unchangedModels,replacedModels:result.replacedModels,reused:result.reused,bytes:result.bytes.length});
}
fs.writeFileSync(path.join(folder,'catalogue.json'),JSON.stringify({...manifest,sizes:{...manifest.sizes,...sizes},gateRevision:'gate-footings-v1',gateSourceHashes:hashes},null,2)+'\n');
const report={passed:true,checks,liveCatalogueChanged:folder===path.join(root,'src/assets3d')};fs.writeFileSync(path.join(args.length?patchFolder:folder,'composition-validation.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report));
