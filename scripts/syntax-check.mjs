import fs from 'node:fs';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const targets=[path.join(root,'vite.config.js')];

function collect(dir){
  if(!fs.existsSync(dir))return;
  for(const entry of fs.readdirSync(dir,{withFileTypes:true})){
    if(entry.name==='node_modules'||entry.name==='.git'||entry.name==='blender')continue;
    const full=path.join(dir,entry.name);
    if(entry.isDirectory())collect(full);
    else if(/\.(?:js|mjs)$/.test(entry.name))targets.push(full);
  }
}

for(const folder of ['src','server','scripts','tests'])collect(path.join(root,folder));

let parseAst=null;
try{({parseAst}=await import('rollup/parseAst'));}catch{}

function checkWithNode(file){
  return new Promise((resolve,reject)=>{
    const child=spawn(process.execPath,['--check',file],{stdio:['ignore','ignore','pipe']});
    let stderr='';
    child.stderr.on('data',chunk=>{stderr+=chunk;});
    child.on('error',reject);
    child.on('close',code=>{
      if(code===0)resolve();
      else reject(new Error(`Syntax error in ${path.relative(root,file)}:\n${stderr}`));
    });
  });
}

if(parseAst){
  for(const file of targets){
    try{parseAst(fs.readFileSync(file,'utf8'));}
    catch(error){
      console.error(`Syntax error in ${path.relative(root,file)}:\n${error.message}`);
      process.exit(1);
    }
  }
}else{
  let index=0;
  const workers=Array.from({length:Math.min(16,targets.length)},async()=>{
    while(index<targets.length){const file=targets[index++];await checkWithNode(file);}
  });
  await Promise.all(workers);
}
console.log(JSON.stringify({ok:true,checked:targets.length}));
