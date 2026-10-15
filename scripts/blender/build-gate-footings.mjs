import fs from 'node:fs';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {setPriority,constants} from 'node:os';
const root=fileURLToPath(new URL('../../',import.meta.url)),folder=path.join(root,'.tools/art-candidate/gate-footings'),blender=process.env.BLENDER_BIN||path.join(root,'.tools/blender-4.5.14-windows-x64/blender.exe'),optimizer=process.env.GLTFPACK_BIN||path.join(root,'.tools/gltfpack/gltfpack.exe');
const args=process.argv.slice(2);if(args.length&&!(args.length===2&&args[0]==='--source'))throw new Error('Use --source to refine a complete project-owned editable catalogue');
const source=path.resolve(root,args[1]||'.tools/art-refined/frontier-assets.blend'),relative=path.relative(root,source);if(!relative||relative.startsWith('..')||path.isAbsolute(relative)||path.extname(source)!=='.blend'||!fs.statSync(source).isFile())throw new Error('The editable source must be a project-owned blend file');
fs.mkdirSync(path.join(folder,'raw'),{recursive:true});fs.mkdirSync(path.join(folder,'optimized'),{recursive:true});
async function run(command,args,log){const fd=fs.openSync(log,'w');try{await new Promise((resolve,reject)=>{const child=spawn(command,args,{cwd:root,windowsHide:true,stdio:['ignore',fd,fd]});try{setPriority(child.pid,constants.priority.PRIORITY_LOW);}catch{}child.on('error',reject);child.on('exit',code=>code===0?resolve():reject(new Error('Gate build failed: '+log)));});}finally{fs.closeSync(fd);}}
await run(blender,['--background','--threads','1','--python-exit-code','1','--python','scripts/blender/author-gate-footings.py','--','--source',source],path.join(folder,'raw/author.log'));
const authored=JSON.parse(fs.readFileSync(path.join(folder,'raw/authoring-validation.json')));if(!authored.passed||authored.models!==126||authored.unchangedOtherModels!==123)throw new Error('Gate authoring did not preserve the complete catalogue');
for(const detail of ['low','near'])await run(optimizer,['-i',path.join(folder,`raw/frontier-${detail}.glb`),'-o',path.join(folder,`optimized/frontier-${detail}.glb`),'-cc','-kn','-km','-ke','-kv','-vpf','-vtf'],path.join(folder,`optimized/${detail}-pack.log`));
console.log(JSON.stringify({staged:true,low:fs.statSync(path.join(folder,'optimized/frontier-low.glb')).size,near:fs.statSync(path.join(folder,'optimized/frontier-near.glb')).size,liveCatalogueChanged:false}));
