
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {readGlb} from './glb-catalogue.mjs';
import {validateMeshPrecision} from './validate-mesh-precision.mjs';
import {composeQualityCatalogue} from './quality-catalogue.mjs';
import {buildSharedTrees,sharedTreeKeys} from './build-shared-trees.mjs';
import {refreshBalancedManifest} from './refresh-balanced-manifest.mjs';

const project=fileURLToPath(new URL('../../',import.meta.url));
const assets=path.join(project,'src','assets3d'),stage=path.join(project,'.tools','art-candidate','meadow-overview');
const raw=path.join(stage,'raw'),candidate=path.join(stage,'assets');
const blender=process.env.BLENDER_BIN||path.join(project,'.tools','blender-4.5.14-windows-x64','blender.exe');
const gltfpack=process.env.GLTFPACK_BIN||path.join(project,'.tools','gltfpack','gltfpack.exe');
const source=path.join(project,'.tools','art-refined','frontier-assets.blend');
const meadowKeys=sharedTreeKeys.filter(key=>key.startsWith('tree:highlands:'));
const keys=meadowKeys.filter(key=>key.endsWith(':far'));
await fs.mkdir(candidate,{recursive:true});

function run(command,args){
  return new Promise((resolve,reject)=>{
    const child=spawn(command,args,{cwd:project,windowsHide:true,stdio:'inherit'});
    child.on('error',reject);
    child.on('exit',code=>code===0?resolve():reject(new Error(path.basename(command)+' failed ('+code+')')));
  });
}

await run(blender,['--background','--threads','1','--python-exit-code','1','--python','scripts/blender/refine-catalogue.py',
  '--','--blend',source,'--prefix','tree:highlands:','--output',raw]);
const report=JSON.parse(await fs.readFile(path.join(raw,'report.json'),'utf8'));
assert.deepEqual(report.keys,meadowKeys.slice().sort());
const packed=path.join(stage,'packed-conifers.glb');
await run(gltfpack,['-i',path.join(raw,'frontier-near.glb'),'-o',packed,'-cc','-kn','-km','-ke','-kv','-vpf','-vtf','-vn','16','-vc','8']);

const atlas=await fs.readFile(path.join(assets,'frontier-near.glb'));
const trees=await fs.readFile(packed);
const remaining=readGlb(atlas).json.nodes.flatMap(node=>node.extras?.assetKey&&!keys.includes(node.extras.assetKey)?[node.extras.assetKey]:[]);
const composed=composeQualityCatalogue([{bytes:atlas,keys:remaining},{bytes:trees,keys}]);
const intermediate=path.join(stage,'composed-near.glb'),nearFile=path.join(candidate,'frontier-near.glb');
await fs.writeFile(intermediate,composed);
// Remove shared buffer ranges that only the replaced trees referenced.
await run(gltfpack,['-i',intermediate,'-o',nearFile,'-cc','-kn','-km','-ke','-kv','-vpf','-vtf','-vn','16','-vc','8']);
const near=await fs.readFile(nearFile);
await validateMeshPrecision(composed,near);
const manifest=JSON.parse(await fs.readFile(path.join(assets,'catalogue.json'),'utf8'));
manifest.sizes.near=near.length;
await fs.writeFile(path.join(candidate,'catalogue.json'),JSON.stringify(manifest,null,2)+'\n');
const shared=await buildSharedTrees(candidate);
for(const file of ['frontier-low.glb','frontier-foliage.glb','frontier-balanced.glb']){
  await fs.copyFile(path.join(assets,file),path.join(candidate,file));
}
await refreshBalancedManifest(candidate,path.join(stage,'balanced-precision'));

if(process.argv.includes('--apply')){
  for(const file of ['frontier-near.glb','frontier-trees.glb','catalogue.json'])await fs.copyFile(path.join(candidate,file),path.join(assets,file));
}
console.log(JSON.stringify({candidate,nearBytes:near.length,sharedTreeBytes:shared.bytes}));
