import fs from 'node:fs';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('../../',import.meta.url)),stage=path.join(root,'.tools/art-candidate/bridge'),output=path.join(stage,'full');fs.mkdirSync(output,{recursive:true});
async function run(command,args,name){const log=fs.openSync(path.join(stage,name+'.log'),'w');try{await new Promise((resolve,reject)=>{const child=spawn(command,args,{cwd:root,windowsHide:true,stdio:['ignore',log,log]});child.on('error',reject);child.on('close',code=>code===0?resolve():reject(new Error('Bridge '+name+' failed; see '+path.join(stage,name+'.log'))));});}finally{fs.closeSync(log);}}
await run(process.env.BLENDER_BIN||path.join(root,'.tools/blender-4.5.14-windows-x64/blender.exe'),['--background','--threads','1','--python-exit-code','1','--python','scripts/blender/author-bridge.py'],'author');
await run(process.env.GLTFPACK_BIN||path.join(root,'.tools/gltfpack/gltfpack.exe'),['-i',path.join(stage,'raw/frontier-bridge.glb'),'-o',path.join(output,'frontier-bridge.glb'),'-cc','-kn','-km','-ke','-kv','-vpf','-vtf'],'pack');
fs.copyFileSync(path.join(stage,'raw/bridge.json'),path.join(output,'bridge.json'));
console.log(JSON.stringify({directory:path.relative(root,output),editable:path.relative(root,path.join(stage,'raw/frontier-bridge.blend')),bytes:fs.statSync(path.join(output,'frontier-bridge.glb')).size,...JSON.parse(fs.readFileSync(path.join(output,'bridge.json')))}));
