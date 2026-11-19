import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {readGlb} from './glb-catalogue.mjs';
import {validateMeshPrecision} from './validate-mesh-precision.mjs';
import {composeQualityCatalogue} from './quality-catalogue.mjs';
import {buildSharedTrees,sharedTreeKeys} from './build-shared-trees.mjs';

const project=fileURLToPath(new URL('../../',import.meta.url));
const assets=path.join(project,'src','assets3d'),stage=path.join(project,'.tools','art-candidate','biome-trees');
const candidate=path.join(stage,'assets');
const blender=process.env.BLENDER_BIN||path.join(project,'.tools','blender-4.5.14-windows-x64','blender.exe');
const gltfpack=process.env.GLTFPACK_BIN||path.join(project,'.tools','gltfpack','gltfpack.exe');
const source=path.join(project,'.tools','art-refined','frontier-assets.blend');
const prefixes=['tree:desert:','tree:winter:'];
const keys=sharedTreeKeys.filter(key=>prefixes.some(prefix=>key.startsWith(prefix)));
await fs.mkdir(candidate,{recursive:true});

function run(command,args){
  return new Promise((resolve,reject)=>{
    const child=spawn(command,args,{cwd:project,windowsHide:true,stdio:'inherit'});
    child.on('error',reject);
    child.on('exit',code=>code===0?resolve():reject(new Error(path.basename(command)+' failed ('+code+')')));
  });
}

const packedGroups=[];
for(const prefix of prefixes){
  const slug=prefix.replace(/[^a-z0-9]+/gi,'-').replace(/^-|-$/g,'');
  const raw=path.join(stage,'raw-'+slug);
  await fs.mkdir(raw,{recursive:true});
  await run(blender,['--background','--threads','1','--python-exit-code','1','--python','scripts/blender/refine-catalogue.py',
    '--','--blend',source,'--prefix',prefix,'--output',raw]);
  const report=JSON.parse(await fs.readFile(path.join(raw,'report.json'),'utf8'));
  const expected=sharedTreeKeys.filter(key=>key.startsWith(prefix)).sort();
  assert.deepEqual(report.keys,expected);
  const packed=path.join(stage,`packed-${slug}.glb`);
  await run(gltfpack,['-i',path.join(raw,'frontier-near.glb'),'-o',packed,'-cc','-kn','-km','-ke','-kv','-vpf','-vtf','-vn','16','-vc','8']);
  packedGroups.push({bytes:await fs.readFile(packed),keys:expected});
}

// Patch both frontier-near.glb and frontier-low.glb cleanly so every catalogue tier shares the sculpted desert acacias & winter spruces.
const manifest=JSON.parse(await fs.readFile(path.join(assets,'catalogue.json'),'utf8'));
for(const tier of ['near','low']){
  const atlas=await fs.readFile(path.join(assets,`frontier-${tier}.glb`));
  const remaining=readGlb(atlas).json.nodes.flatMap(node=>node.extras?.assetKey&&!keys.includes(node.extras.assetKey)?[node.extras.assetKey]:[]);
  const composed=composeQualityCatalogue([{bytes:atlas,keys:remaining},...packedGroups]);
  const intermediate=path.join(stage,`composed-${tier}.glb`),outFile=path.join(candidate,`frontier-${tier}.glb`);
  await fs.writeFile(intermediate,composed);
  await run(gltfpack,['-i',intermediate,'-o',outFile,'-cc','-kn','-km','-ke','-kv','-vpf','-vtf','-vn','16','-vc','8']);
  const finalBytes=await fs.readFile(outFile);
  await validateMeshPrecision(composed,finalBytes);
  manifest.sizes[tier]=finalBytes.length;
}
await fs.writeFile(path.join(candidate,'catalogue.json'),JSON.stringify(manifest,null,2)+'\n');
const shared=await buildSharedTrees(candidate);

if(process.argv.includes('--apply')){
  for(const file of ['frontier-near.glb','frontier-low.glb','frontier-trees.glb','catalogue.json']){
    await fs.copyFile(path.join(candidate,file),path.join(assets,file));
  }
}
console.log(JSON.stringify({candidate,nearBytes:manifest.sizes.near,lowBytes:manifest.sizes.low,sharedTreeBytes:shared.bytes}));
