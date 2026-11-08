import {spawn} from 'node:child_process';
import {mkdir,stat,writeFile} from 'node:fs/promises';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {setPriority,constants as osConstants} from 'node:os';
import {artBuildPlan} from './build-plan.mjs';

const project=fileURLToPath(new URL('../../',import.meta.url));
const plan=artBuildPlan(project,process.argv.slice(2));
const tools=path.join(project,'.tools');
const blender=process.env.BLENDER_BIN||path.join(tools,'blender-4.5.14-windows-x64','blender.exe');
const optimizer=process.env.GLTFPACK_BIN||path.join(tools,'gltfpack','gltfpack.exe');
await stat(blender);await stat(optimizer);
await mkdir(plan.outputDirectory,{recursive:true});await mkdir(plan.rawDirectory,{recursive:true});
const env={...process.env,FRONTIER_ART_STAGE:plan.stage,BLENDER_USER_CONFIG:path.join(tools,'blender-profile','config'),BLENDER_USER_SCRIPTS:path.join(tools,'blender-profile','scripts')};

async function run(command,args,log){
  await new Promise((resolve,reject)=>{
    const output=log?fs.openSync(log,'w'):null;
    const child=spawn(command,args,{cwd:project,env,windowsHide:true,stdio:output===null?'inherit':['ignore',output,output]});
    if(plan.stage)try{setPriority(child.pid,osConstants.priority.PRIORITY_LOW);}catch{} // Never change the game or user's process priority.
    child.on('error',error=>{if(output!==null)fs.closeSync(output);reject(error);});
    child.on('exit',code=>{if(output!==null)fs.closeSync(output);code===0?resolve():reject(new Error(`${path.basename(command)} failed (${code}); inspect ${log||'the console'}.`));});
  });
}
if(plan.packOnly){
  console.log('Reusing the existing raw export; only packing settings change.');
}else{
  console.log(plan.resources?'Exporting a separate resource preview.':'Exporting the complete source catalogue.');
  await run(process.execPath,['scripts/blender/export-source.mjs',...(plan.resources?['--resources-only']:[])]);
  console.log('Authoring and refining the game models in Blender.');
  await run(blender,['--background','--threads','1','--python-exit-code','1','--python','scripts/blender/refine-catalogue.py'],path.join(plan.rawDirectory,'art-refine.log'));
}
// -se bounds how far simplification may move a vertex. gltfpack's default is
// 1% of the whole scene, which is larger than a gold nugget or a roof finial,
// so the default silently deleted those parts outright: 63 models lost meshes,
// including the metallic inclusions that identify a gold deposit.
//
// 0.2% keeps every authored part on both tiers. Near is still smaller than it
// was under the default, and Low grows by about 0.6 MB, which is the honest
// cost of shipping the complete authored catalogue on the phone tier.
const simplificationError='0.002';
for(const [name,ratio]of [['near','0.82'],['low','0.55']]){
  console.log(`Optimizing the ${name} catalogue.`);
  await run(optimizer,['-i',path.join(plan.rawDirectory,`frontier-${name}.glb`),'-o',path.join(plan.outputDirectory,`frontier-${name}.glb`),
    '-cc','-kn','-km','-ke','-kv','-vpf','-vtf','-si',ratio,'-se',simplificationError,'-r',path.join(plan.rawDirectory,`${name}-optimized.json`)]);
}
const source=JSON.parse(fs.readFileSync(path.join(plan.sourceDirectory,'catalogue.json'),'utf8'));
const sizes={};for(const name of ['near','low'])sizes[name]=(await stat(path.join(plan.outputDirectory,`frontier-${name}.glb`))).size;
await writeFile(path.join(plan.outputDirectory,'catalogue.json'),`${JSON.stringify({models:source,sizes,stage:plan.stage,completeCatalogue:!plan.resources,source:'Original Crowns of the Frontier assets authored/refined in Blender.'},null,2)}\n`);
if(!plan.resources){
  // Preserve the independently authored crop fields in complete regeneration.
  // Each stage is sequential so Blender/packing never compete for memory.
  await run(process.execPath,['scripts/blender/build-farms.mjs']);
  await run(process.execPath,['scripts/blender/compose-farms.mjs','--directory',plan.outputDirectory]);
  const editable=path.join(plan.rawDirectory,'frontier-assets.blend');
  await run(blender,['--background','--threads','1','--python-exit-code','1','--python','scripts/blender/compose-farm-editable.py','--','--source',editable,'--output',editable],path.join(plan.rawDirectory,'farm-editable-compose.log'));
  await run(process.execPath,['scripts/blender/build-gate-footings.mjs','--source',editable]);
  await run(process.execPath,['scripts/blender/compose-gate-footings.mjs','--directory',plan.outputDirectory]);
  fs.copyFileSync(path.join(tools,'art-candidate/gate-footings/raw/frontier-assets.blend'),editable);
  await run(process.execPath,['scripts/blender/build-windmill-mounts.mjs','--source',editable,'--directory',plan.outputDirectory]);
  fs.copyFileSync(path.join(tools,'art-candidate/windmill-mounts/raw/frontier-assets.blend'),editable);
  await run(process.execPath,['scripts/blender/build-siege.mjs','--source',editable,'--directory',plan.outputDirectory]);
  fs.copyFileSync(path.join(tools,'art-candidate/siege/raw/frontier-assets.blend'),editable);
  await run(process.execPath,['scripts/blender/build-balanced-foliage.mjs','--source',editable,'--directory',plan.outputDirectory]);
  await run(process.execPath,['scripts/blender/build-balanced.mjs','--directory',plan.outputDirectory]);
}
console.log(JSON.stringify({models:source.length,bytes:sizes,stage:plan.stage,completeCatalogue:!plan.resources,output:plan.outputDirectory}));
