import fs from 'node:fs/promises';
import fsSync from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {setPriority,constants as osConstants} from 'node:os';
import {replaceModelPatch} from './model-patch.mjs';

const project=fileURLToPath(new URL('../../',import.meta.url));
const args=process.argv.slice(2),options={};
for(let i=0;i<args.length;i+=2){
  assert.ok(['--prefix','--source','--directory','--stage'].includes(args[i])&&args[i+1],'Use --prefix <prefix> [--source <blend>] [--directory <dir>]');
  options[args[i]]=args[i+1];
}
const prefix=options['--prefix'];assert.ok(prefix,'--prefix is required');
const owned=value=>{const full=path.resolve(project,value),rel=path.relative(project,full);assert.ok(rel&&!rel.startsWith('..')&&!path.isAbsolute(rel));return full;};
const source=owned(options['--source']||'.tools/art-refined/frontier-assets.blend');
const directory=owned(options['--directory']||'src/assets3d');
const stageName=options['--stage']||prefix.replace(/[^a-z0-9]+/gi,'-').replace(/^-|-$/g,'');
const stage=path.join(project,'.tools','art-candidate','subset-'+stageName);
const raw=path.join(stage,'raw'),optimized=path.join(stage,'optimized');
await fs.mkdir(raw,{recursive:true});await fs.mkdir(optimized,{recursive:true});

const blender=process.env.BLENDER_BIN||path.join(project,'.tools','blender-4.5.14-windows-x64','blender.exe');
const optimizer=process.env.GLTFPACK_BIN||path.join(project,'.tools','gltfpack','gltfpack.exe');

async function run(command,argv,logPath){
  const fd=fsSync.openSync(logPath,'w');
  try{
    await new Promise((resolve,reject)=>{
      const child=spawn(command,argv,{cwd:project,windowsHide:true,stdio:['ignore',fd,fd]});
      try{setPriority(child.pid,osConstants.priority.PRIORITY_LOW);}catch{}
      child.on('error',reject);
      child.on('exit',code=>code===0?resolve():reject(new Error(`${path.basename(command)} failed (${code}): ${logPath}`)));
    });
  }finally{fsSync.closeSync(fd);}
}

await run(blender,['--background','--threads','1','--python-exit-code','1','--python','scripts/blender/refine-catalogue.py','--','--blend',source,'--prefix',prefix,'--output',raw],path.join(stage,'refine.log'));
const report=JSON.parse(await fs.readFile(path.join(raw,'report.json'),'utf8'));
const keys=report.keys;assert.ok(Array.isArray(keys)&&keys.length>0,'Subset refined 0 models for '+prefix);

const manifestPath=path.join(directory,'catalogue.json');
const manifest=JSON.parse(await fs.readFile(manifestPath,'utf8'));
assert.equal(manifest.completeCatalogue,true);

const patched={};
for(const [detail,ratio]of [['low','0.55'],['near','0.82']]){
  const packOut=path.join(optimized,`frontier-${detail}.glb`);
  await run(optimizer,['-i',path.join(raw,`frontier-${detail}.glb`),'-o',packOut,'-cc','-kn','-km','-ke','-kv','-vpf','-vtf','-vn','16','-vc','8','-si',ratio,'-se','0.002'],path.join(stage,`${detail}-pack.log`));
  const baseBytes=await fs.readFile(path.join(directory,`frontier-${detail}.glb`));
  const patchBytes=await fs.readFile(packOut);
  const result=replaceModelPatch(baseBytes,patchBytes,keys);
  // Final buffer GC repack removes orphaned compressed chunks left by replaceModelPatch
  // when a patched group previously shared bufferViews with unrelated models.
  const composedPath=path.join(optimized,`frontier-${detail}-composed.glb`);
  const gcPath=path.join(optimized,`frontier-${detail}-gc.glb`);
  await fs.writeFile(composedPath,result.bytes);
  await run(optimizer,['-i',composedPath,'-o',gcPath,'-cc','-kn','-km','-ke','-kv','-vpf','-vtf','-vn','16','-vc','8'],path.join(stage,`${detail}-gc.log`));
  patched[detail]=await fs.readFile(gcPath);
}

for(const detail of ['low','near']){
  await fs.writeFile(path.join(directory,`frontier-${detail}.glb`),patched[detail]);
  manifest.sizes[detail]=patched[detail].length;
}
await fs.writeFile(manifestPath,JSON.stringify(manifest,null,2)+'\n');

await run(process.execPath,['scripts/blender/build-balanced.mjs','--directory',path.relative(project,directory)],path.join(stage,'balanced.log'));
await run(process.execPath,['scripts/blender/build-lod.mjs'],path.join(stage,'lod.log'));

console.log(JSON.stringify({passed:true,prefix,models:keys.length,sizes:{low:patched.low.length,near:patched.near.length}}));
