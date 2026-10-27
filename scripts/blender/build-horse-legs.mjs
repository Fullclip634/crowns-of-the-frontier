import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';import {spawn} from 'node:child_process';import {fileURLToPath} from 'node:url';
import {replaceHorseLegs} from './horse-leg-patch.mjs';import {lowCatalogueBudget} from './content-budget.mjs';
const root=fileURLToPath(new URL('../../',import.meta.url)),stage=path.join(root,'.tools/art-candidate/horse-legs'),source=path.join(root,'src/assets3d'),target=path.join(stage,'full');fs.mkdirSync(target,{recursive:true});
for(const file of ['frontier-low.glb','frontier-near.glb','frontier-balanced.glb','frontier-foliage.glb','frontier-trees.glb','catalogue.json'])fs.copyFileSync(path.join(source,file),path.join(target,file));
const run=async(command,args,log)=>{const fd=fs.openSync(log,'w');try{await new Promise((resolve,reject)=>{const child=spawn(command,args,{cwd:root,windowsHide:true,stdio:['ignore',fd,fd]});child.on('error',reject);child.on('close',code=>code===0?resolve():reject(Error('Horse authoring failed: '+log)));});}finally{fs.closeSync(fd);}};
await run(process.env.BLENDER_BIN||path.join(root,'.tools/blender-4.5.14-windows-x64/blender.exe'),['--background','--threads','1','--python-exit-code','1','--python','scripts/blender/author-horse-legs.py'],path.join(stage,'author.log'));
const author=JSON.parse(fs.readFileSync(path.join(stage,'raw/authoring-validation.json')));assert.ok(author.passed&&author.unchangedOtherModels===123&&author.unchangedBodies===3&&author.parts===36);fs.mkdirSync(path.join(stage,'optimized'),{recursive:true});
for(const detail of ['low','near'])await run(process.env.GLTFPACK_BIN||path.join(root,'.tools/gltfpack/gltfpack.exe'),['-i',path.join(stage,`raw/frontier-${detail}.glb`),'-o',path.join(stage,`optimized/frontier-${detail}.glb`),'-cc','-kn','-km','-ke','-kv','-vpf','-vtf'],path.join(stage,detail+'-pack.log'));
const checks=[],manifest=JSON.parse(fs.readFileSync(path.join(target,'catalogue.json')));
for(const detail of ['low','balanced','near']){
  const file=`frontier-${detail}.glb`,patch=fs.readFileSync(path.join(stage,`optimized/frontier-${detail==='low'?'low':'near'}.glb`)),base=fs.readFileSync(path.join(source,file)),result=replaceHorseLegs(base,patch,author.keys);
  assert.ok(result.bytes.length-base.length<20000,'Bound additional mounted geometry');if(detail==='low')assert.ok(result.bytes.length<=lowCatalogueBudget(manifest),'Retain the released Low catalogue budget');
  fs.writeFileSync(path.join(target,file),result.bytes);checks.push({detail,bytes:result.bytes.length,growthBytes:result.bytes.length-base.length,unchangedModels:result.unchangedModels,unchangedBodies:result.unchangedBodies});
}
manifest.horseLegRevision=author.revision;for(const check of checks)manifest.sizes[check.detail]=check.bytes;
fs.writeFileSync(path.join(target,'catalogue.json'),JSON.stringify(manifest,null,2)+'\n');
// Balanced must be rebuilt from the new Low/High sources, including precision
// reference hashes; patching its meshes alone leaves the catalogue stale.
await run(process.execPath,['scripts/blender/build-balanced.mjs','--directory',target],path.join(stage,'balanced.log'));
const balanced=checks.find(check=>check.detail==='balanced');balanced.bytes=fs.statSync(path.join(target,'frontier-balanced.glb')).size;balanced.growthBytes=balanced.bytes-fs.statSync(path.join(source,'frontier-balanced.glb')).size;
fs.writeFileSync(path.join(stage,'composition-validation.json'),JSON.stringify({passed:true,author,checks},null,2)+'\n');
console.log(JSON.stringify({passed:true,checks,editable:path.relative(root,path.join(stage,'raw/frontier-assets.blend')),promotedToGame:false}));
