import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {composeQualityCatalogue} from './quality-catalogue.mjs';
import path from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {spawn} from 'node:child_process';
const project=fileURLToPath(new URL('../../',import.meta.url)),args=process.argv.slice(2);
assert.ok(!args.length||(args.length===2&&args[0]==='--directory'),'Use --directory for a staged complete catalogue.');
const directory=path.resolve(project,args[1]||'src/assets3d'),relative=path.relative(project,directory);
assert.ok(relative&&!relative.startsWith('..')&&!path.isAbsolute(relative),'Catalogue output must stay within the project');
const base=pathToFileURL(directory+path.sep),manifest=JSON.parse(await fs.readFile(new URL('catalogue.json',base),'utf8'));
assert.equal(manifest.completeCatalogue,true,'Partial catalogues cannot replace Balanced');
const near=await fs.readFile(new URL('frontier-near.glb',base)),low=await fs.readFile(new URL('frontier-low.glb',base));
const richer=manifest.models.filter(m=>/^(building|resource):/.test(m.key)).map(m=>m.key),lighter=manifest.models.filter(m=>!richer.includes(m.key)).map(m=>m.key);
assert.equal(richer.length+lighter.length,126);
const bytes=composeQualityCatalogue([{bytes:near,keys:richer},{bytes:low,keys:lighter}]);
const scratch=path.join(project,'.tools','art-candidate','balanced'),optimizer=process.env.GLTFPACK_BIN||path.join(project,'.tools','gltfpack','gltfpack.exe');
await fs.mkdir(scratch,{recursive:true});const input=path.join(scratch,'frontier-composed.glb'),output=path.join(scratch,'frontier-balanced.glb');await fs.writeFile(input,bytes);
// Source catalogues share whole-roster vertex buffers. Repack the selected
// accessor ranges without another simplification pass or losing joint extras.
await new Promise((resolve,reject)=>{const child=spawn(optimizer,['-i',input,'-o',output,'-cc','-kn','-km','-ke','-kv','-noq'],{windowsHide:true,stdio:'inherit'});child.on('error',reject);child.on('exit',code=>code===0?resolve():reject(new Error('Balanced mesh packing failed: '+code)));});
const packed=await fs.readFile(output);assert.ok(packed.length<near.length,'Balanced must download less than High');
await fs.writeFile(new URL('frontier-balanced.glb',base),packed);
manifest.sizes.balanced=packed.length;manifest.balancedComposition='High buildings/resources; Low troops and forests; selected geometry repacked without another simplification pass.';
manifest.balancedSourceHashes={near:createHash('sha256').update(near).digest('hex'),low:createHash('sha256').update(low).digest('hex')};
await fs.writeFile(new URL('catalogue.json',base),JSON.stringify(manifest,null,2)+'\n');
console.log(JSON.stringify({models:126,richer:richer.length,lighter:lighter.length,bytes:packed.length}));
