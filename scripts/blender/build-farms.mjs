import fs from 'node:fs';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {setPriority,constants} from 'node:os';
const root=fileURLToPath(new URL('../../',import.meta.url)),folder=path.join(root,'.tools/art-candidate/farms'),blender=process.env.BLENDER_BIN||path.join(root,'.tools/blender-4.5.14-windows-x64/blender.exe'),optimizer=process.env.GLTFPACK_BIN||path.join(root,'.tools/gltfpack/gltfpack.exe');
if(process.argv.length>2)throw new Error('This command authors only a separate farm candidate.');
fs.mkdirSync(path.join(folder,'raw'),{recursive:true});fs.mkdirSync(path.join(folder,'optimized'),{recursive:true});
async function run(command,args,log){const fd=fs.openSync(log,'w');try{await new Promise((resolve,reject)=>{const child=spawn(command,args,{cwd:root,windowsHide:true,env:{...process.env,BLENDER_USER_CONFIG:path.join(root,'.tools/blender-profile/config'),BLENDER_USER_SCRIPTS:path.join(root,'.tools/blender-profile/scripts')},stdio:['ignore',fd,fd]});try{setPriority(child.pid,constants.priority.PRIORITY_LOW);}catch{}child.on('error',reject);child.on('exit',code=>code===0?resolve():reject(new Error('Farm build failed: '+log)));});}finally{fs.closeSync(fd);}}
console.log('Authoring three original farm models in background Blender.');await run(blender,['--background','--factory-startup','--threads','1','--python-exit-code','1','--python','scripts/blender/author-farms.py'],path.join(folder,'raw/author.log'));
for(const detail of ['low','near']){console.log('Packing '+detail+' farm models.');await run(optimizer,['-i',path.join(folder,`raw/frontier-${detail}.glb`),'-o',path.join(folder,`optimized/frontier-${detail}.glb`),'-cc','-kn','-km','-ke','-kv','-vpf','-vtf','-r',path.join(folder,`optimized/${detail}-pack.json`)],path.join(folder,`optimized/${detail}-pack.log`));}
console.log(JSON.stringify({candidate:folder,low:fs.statSync(path.join(folder,'optimized/frontier-low.glb')).size,near:fs.statSync(path.join(folder,'optimized/frontier-near.glb')).size,liveCatalogueChanged:false}));
