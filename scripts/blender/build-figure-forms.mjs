import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';import {spawn} from 'node:child_process';import {fileURLToPath} from 'node:url';
import {replaceFigureParts} from './figure-part-patch.mjs';import {lowCatalogueBudget} from './content-budget.mjs';
import {refreshBalancedManifest} from './refresh-balanced-manifest.mjs';
assert.ok(process.argv.slice(2).every(arg=>arg==='--pack-existing'),'Only --pack-existing is supported; this command writes a candidate, never live assets');
const root=fileURLToPath(new URL('../../',import.meta.url)),stage=path.join(root,'.tools/art-candidate/figure-forms'),source=path.join(root,'src/assets3d'),target=path.join(stage,'full');fs.mkdirSync(target,{recursive:true});
const run=async(command,args,log)=>{const fd=fs.openSync(log,'w');try{await new Promise((resolve,reject)=>{const child=spawn(command,args,{cwd:root,windowsHide:true,stdio:['ignore',fd,fd]});child.on('error',reject);child.on('close',code=>code===0?resolve():reject(Error('Figure authoring failed; inspect '+log)));});}finally{fs.closeSync(fd);}};
if(!process.argv.includes('--pack-existing')){
  if(!fs.existsSync(path.join(root,'.tools/art-candidate/character-surfaces/character-materials.blend')))await run(process.execPath,['scripts/blender/build-character-surfaces.mjs'],path.join(stage,'materials.log'));
  await run(process.env.BLENDER_BIN||path.join(root,'.tools/blender-4.5.14-windows-x64/blender.exe'),['--background','--threads','1','--python-exit-code','1','--python','scripts/blender/author-figure-forms.py'],path.join(stage,'author.log'));
}
const author=JSON.parse(fs.readFileSync(path.join(stage,'raw/authoring-validation.json')));assert.ok(author.passed&&author.sourceModels===15&&author.keys.length===15);fs.mkdirSync(path.join(stage,'optimized'),{recursive:true});
for(const detail of ['low','near'])await run(process.env.GLTFPACK_BIN||path.join(root,'.tools/gltfpack/gltfpack.exe'),['-i',path.join(stage,`raw/frontier-${detail}.glb`),'-o',path.join(stage,`optimized/frontier-${detail}.glb`),'-cc','-kn','-km','-ke','-kv','-vpf','-vtf','-vn','16'],path.join(stage,detail+'-pack.log'));
const checks=[],manifest=JSON.parse(fs.readFileSync(path.join(source,'catalogue.json')));
for(const detail of ['low','balanced','near']){
  const file=`frontier-${detail}.glb`,patch=fs.readFileSync(path.join(stage,`optimized/frontier-${detail==='near'?'near':'low'}.glb`)),base=fs.readFileSync(path.join(source,file)),result=replaceFigureParts(base,patch,author);
  assert.ok(result.bytes.length-base.length<100000,'Bound the figure-part download growth');if(detail==='low')assert.ok(result.bytes.length<=lowCatalogueBudget(manifest),'Retain the existing phone catalogue budget');
  fs.writeFileSync(path.join(target,file),result.bytes);checks.push({detail,bytes:result.bytes.length,growthBytes:result.bytes.length-base.length,unchangedModels:result.unchangedModels,changedFigures:result.changedFigures,removedParts:result.removedParts,insertedParts:result.insertedParts});
}
for(const file of ['frontier-trees.glb','frontier-foliage.glb'])fs.copyFileSync(path.join(source,file),path.join(target,file));
manifest.figureRevision=author.revision;for(const check of checks)manifest.sizes[check.detail]=check.bytes;fs.writeFileSync(path.join(target,'catalogue.json'),JSON.stringify(manifest,null,2)+'\n');
const precision=await refreshBalancedManifest(target,path.join(stage,'precision'));
fs.writeFileSync(path.join(stage,'composition-validation.json'),JSON.stringify({passed:true,author,checks,precision},null,2)+'\n');console.log(JSON.stringify({passed:true,checks,precision,promotedToGame:false,editable:path.relative(root,path.join(stage,'raw/frontier-assets.blend'))}));
