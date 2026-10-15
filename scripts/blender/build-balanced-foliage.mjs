import fs from 'node:fs';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {setPriority,constants} from 'node:os';
const root=fileURLToPath(new URL('../../',import.meta.url)),folder=path.join(root,'.tools/art-candidate/balanced-foliage');
const args=process.argv.slice(2),options={};for(let i=0;i<args.length;i+=2){if(!['--source','--directory'].includes(args[i])||!args[i+1]||options[args[i]])throw new Error('Use --source and optionally --directory for a staged catalogue');options[args[i]]=args[i+1];}
const owned=value=>{const full=path.resolve(root,value),relative=path.relative(root,full);if(!relative||relative.startsWith('..')||path.isAbsolute(relative))throw new Error('Art paths must stay within this project');return full;};
const source=owned(options['--source']||'.tools/art-refined/frontier-assets.blend');if(path.extname(source)!=='.blend'||!fs.statSync(source).isFile())throw new Error('A complete editable Blender source is required');
const destination=options['--directory']?owned(options['--directory']):null;
fs.mkdirSync(path.join(folder,'raw'),{recursive:true});fs.mkdirSync(path.join(folder,'optimized'),{recursive:true});
async function run(command,args,log){const fd=fs.openSync(log,'w');try{await new Promise((resolve,reject)=>{const child=spawn(command,args,{cwd:root,windowsHide:true,stdio:['ignore',fd,fd]});try{setPriority(child.pid,constants.priority.PRIORITY_LOW);}catch{}child.on('error',reject);child.on('exit',code=>code===0?resolve():reject(new Error('Balanced foliage build failed: '+log)));});}finally{fs.closeSync(fd);}}
await run(process.env.BLENDER_BIN||path.join(root,'.tools/blender-4.5.14-windows-x64/blender.exe'),['--background','--threads','1','--python-exit-code','1','--python','scripts/blender/author-balanced-foliage.py','--','--source',source],path.join(folder,'raw/author.log'));
const report=JSON.parse(fs.readFileSync(path.join(folder,'raw/authoring-validation.json'),'utf8'));if(!report.passed||report.models!==8||!report.sourceUnchanged)throw new Error('Foliage source validation failed');
const output=path.join(folder,'optimized/frontier-foliage.glb');
await run(process.env.GLTFPACK_BIN||path.join(root,'.tools/gltfpack/gltfpack.exe'),['-i',path.join(folder,'raw/frontier-foliage.glb'),'-o',output,'-cc','-kn','-km','-ke','-kv','-vpf','-vtf'],path.join(folder,'optimized/pack.log'));
if(destination){fs.mkdirSync(destination,{recursive:true});fs.copyFileSync(output,path.join(destination,'frontier-foliage.glb'));}
console.log(JSON.stringify({staged:true,models:8,bytes:fs.statSync(output).size,destination,liveEditableChanged:false}));
