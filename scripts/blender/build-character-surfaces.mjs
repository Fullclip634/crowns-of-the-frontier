import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {createHash} from 'node:crypto';
const root=path.resolve(import.meta.dirname,'../..'),directory=path.join(root,'.tools/art-candidate/character-surfaces');
assert.ok(process.argv.slice(2).every(arg=>arg==='--promote'),'Only --promote is supported');const promote=process.argv.includes('--promote');
fs.mkdirSync(directory,{recursive:true});const log=path.join(directory,'author.log'),fd=fs.openSync(log,'w');
try{await new Promise((resolve,reject)=>{const child=spawn(process.env.BLENDER_BIN||path.join(root,'.tools/blender-4.5.14-windows-x64/blender.exe'),['--background','--threads','1','--python-exit-code','1','--python','scripts/blender/author-character-surfaces.py'],{cwd:root,windowsHide:true,stdio:['ignore',fd,fd]});child.on('error',reject);child.on('close',code=>code===0?resolve():reject(Error('Character material authoring failed: '+log)));});}finally{fs.closeSync(fd);}
const manifest=JSON.parse(fs.readFileSync(path.join(directory,'character-surfaces.json')));assert.equal(manifest.roles.length,4);assert.equal(manifest.baked,true);
for(const file of Object.values(manifest.files)){const bytes=fs.readFileSync(path.join(directory,file.file));assert.equal(bytes.readUInt32BE(16),512);assert.equal(bytes.readUInt32BE(20),512);assert.equal(createHash('sha256').update(bytes).digest('hex'),file.sha256);assert.ok(bytes.length<600000,'Keep each original material atlas within its texture budget');}
if(promote){const target=path.join(root,'src/assets3d/characters');fs.mkdirSync(target,{recursive:true});for(const file of Object.values(manifest.files))fs.copyFileSync(path.join(directory,file.file),path.join(target,file.file));fs.copyFileSync(path.join(directory,'character-surfaces.json'),path.join(target,'manifest.json'));}
console.log(JSON.stringify({passed:true,manifest,directory,promoted:promote}));
