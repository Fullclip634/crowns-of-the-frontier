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
console.log(plan.resources?'Exporting a separate resource preview.':'Exporting the complete source catalogue.');
await run(process.execPath,['scripts/blender/export-source.mjs',...(plan.resources?['--resources-only']:[])]);
console.log('Authoring and refining the game models in Blender.');
await run(blender,['--background','--threads','1','--python-exit-code','1','--python','scripts/blender/refine-catalogue.py'],path.join(plan.rawDirectory,'art-refine.log'));
for(const [name,ratio]of [['near','0.82'],['low','0.55']]){
  console.log(`Optimizing the ${name} catalogue.`);
  await run(optimizer,['-i',path.join(plan.rawDirectory,`frontier-${name}.glb`),'-o',path.join(plan.outputDirectory,`frontier-${name}.glb`),
    '-cc','-kn','-km','-ke','-kv','-vpf','-vtf','-si',ratio,'-r',path.join(plan.rawDirectory,`${name}-optimized.json`)]);
}
const source=JSON.parse(fs.readFileSync(path.join(plan.sourceDirectory,'catalogue.json'),'utf8'));
const sizes={};for(const name of ['near','low'])sizes[name]=(await stat(path.join(plan.outputDirectory,`frontier-${name}.glb`))).size;
await writeFile(path.join(plan.outputDirectory,'catalogue.json'),`${JSON.stringify({models:source,sizes,stage:plan.stage,completeCatalogue:!plan.resources,source:'Original Crowns of the Frontier assets authored/refined in Blender.'},null,2)}\n`);
console.log(JSON.stringify({models:source.length,bytes:sizes,stage:plan.stage,completeCatalogue:!plan.resources,output:plan.outputDirectory}));
