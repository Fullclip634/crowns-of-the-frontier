import fs from 'node:fs';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';

const root=fileURLToPath(new URL('../../',import.meta.url));
const stage=path.join(root,'.tools/art-candidate/biome-art');
const outFile=path.join(root,'src/assets3d/frontier-biome-art.glb');
fs.mkdirSync(stage,{recursive:true});

const blender=process.env.BLENDER_BIN||path.join(root,'.tools/blender-4.5.14-windows-x64/blender.exe');
const gltfpack=process.env.GLTFPACK_BIN||path.join(root,'.tools/gltfpack/gltfpack.exe');

async function run(command,args,name){
  const logPath=path.join(stage,`${name}.log`);
  const log=fs.openSync(logPath,'w');
  try{
    await new Promise((resolve,reject)=>{
      const child=spawn(command,args,{cwd:root,windowsHide:true,stdio:['ignore',log,log]});
      child.on('error',reject);
      child.on('close',code=>code===0?resolve():reject(new Error(`Biome art ${name} failed (${code}); see ${logPath}`)));
    });
  }finally{fs.closeSync(log);}
}

await run(blender,['--background','--threads','1','--python-exit-code','1','--python','scripts/blender/author-biome-art.py','--','--output',stage],'author');
await run(gltfpack,['-i',path.join(stage,'frontier-biome-art-raw.glb'),'-o',outFile,'-cc','-kn','-km','-ke','-kv','-vpf','-vtf'],'pack');

const report=JSON.parse(fs.readFileSync(path.join(stage,'report.json'),'utf8'));
console.log(JSON.stringify({output:path.relative(root,outFile),bytes:fs.statSync(outFile).size,count:report.keys.length,keys:report.keys}));
