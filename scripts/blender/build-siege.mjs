import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {replaceModelPatch} from './model-patch.mjs';
import {SOLID_SIEGE_LOW_BUDGET} from './content-budget.mjs';
const root=fileURLToPath(new URL('../../',import.meta.url)),args=process.argv.slice(2),options={};
for(let i=0;i<args.length;i+=2){assert.ok(['--source','--directory'].includes(args[i])&&args[i+1]);options[args[i]]=args[i+1];}
const owned=value=>{const file=path.resolve(root,value),rel=path.relative(root,file);assert.ok(rel&&!rel.startsWith('..')&&!path.isAbsolute(rel));return file;};
const source=owned(options['--source']||'.tools/art-refined/frontier-assets.blend'),directory=owned(options['--directory']||'.tools/art-candidate/siege/full'),stage=path.join(root,'.tools/art-candidate/siege');
const manifest=JSON.parse(fs.readFileSync(path.join(directory,'catalogue.json')));assert.equal(manifest.completeCatalogue,true);
const blender=process.env.BLENDER_BIN||path.join(root,'.tools/blender-4.5.14-windows-x64/blender.exe'),optimizer=process.env.GLTFPACK_BIN||path.join(root,'.tools/gltfpack/gltfpack.exe');
fs.mkdirSync(path.join(stage,'optimized'),{recursive:true});
async function run(command,args,log){const fd=fs.openSync(log,'w');try{await new Promise((resolve,reject)=>{const p=spawn(command,args,{cwd:root,windowsHide:true,stdio:['ignore',fd,fd]});p.on('error',reject);p.on('exit',code=>code===0?resolve():reject(new Error('Siege authoring failed: '+log)));});}finally{fs.closeSync(fd);}}
await run(blender,['--background','--threads','1','--python-exit-code','1','--python','scripts/blender/author-siege.py','--','--source',source],path.join(stage,'author.log'));
const report=JSON.parse(fs.readFileSync(path.join(stage,'raw/authoring-validation.json')));assert.ok(report.passed&&report.unchangedOtherModels===124);
const checks=[],results=[];
for(const detail of ['low','near']){
 const patch=path.join(stage,`optimized/frontier-${detail}.glb`);
 await run(optimizer,['-i',path.join(stage,`raw/frontier-${detail}.glb`),'-o',patch,'-cc','-kn','-km','-ke','-kv','-vpf','-vtf'],path.join(stage,detail+'-pack.log'));
 const result=replaceModelPatch(fs.readFileSync(path.join(directory,`frontier-${detail}.glb`)),fs.readFileSync(patch),report.keys);
 assert.equal(result.unchangedModels,124);
 if(detail==='low')assert.ok(result.bytes.length<SOLID_SIEGE_LOW_BUDGET,'Keep the complete Low catalogue within its 4.125 MiB solid-siege budget');
 results.push([detail,result.bytes]);checks.push({detail,unchangedModels:result.unchangedModels,bytes:result.bytes.length});
}
for(const [detail,bytes]of results){fs.writeFileSync(path.join(directory,`frontier-${detail}.glb`),bytes);manifest.sizes[detail]=bytes.length;}
manifest.siegeRevision='solid-timber-v1';manifest.siegeSourceSHA256=createHash('sha256').update(fs.readFileSync(path.join(stage,'raw/frontier-assets.blend'))).digest('hex');
manifest.lowContentBudgetBytes=SOLID_SIEGE_LOW_BUDGET;
fs.writeFileSync(path.join(directory,'catalogue.json'),JSON.stringify(manifest,null,2)+'\n');
fs.writeFileSync(path.join(stage,'composition-validation.json'),JSON.stringify({passed:true,...report,checks},null,2));console.log(JSON.stringify({passed:true,checks,editable:path.relative(root,path.join(stage,'raw/frontier-assets.blend'))}));
