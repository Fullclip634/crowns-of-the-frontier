import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {MeshoptDecoder} from 'three/addons/libs/meshopt_decoder.module.js';

const project=fileURLToPath(new URL('../../',import.meta.url));
const assets=path.join(project,'src','assets3d');
const stage=path.join(project,'.tools','art-candidate','epic-props');
const blender=process.env.BLENDER_BIN||path.join(project,'.tools','blender-4.5.14-windows-x64','blender.exe');
const gltfpack=process.env.GLTFPACK_BIN||path.join(project,'.tools','gltfpack','gltfpack.exe');

await fs.mkdir(stage,{recursive:true});

function run(command,args){
  return new Promise((resolve,reject)=>{
    const child=spawn(command,args,{cwd:project,windowsHide:true,stdio:'inherit'});
    child.on('error',reject);
    child.on('exit',code=>code===0?resolve():reject(new Error(path.basename(command)+' failed ('+code+')')));
  });
}

async function decode(bytes){
  return (await new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'')).scene;
}

function collect(scene){
  const roots=new Map(),meshes=new Map();
  const visit=(node,prefix='')=>{
    if(node.userData.assetKey){prefix=node.userData.assetKey;roots.set(prefix,node);}
    else prefix+='/'+node.name;
    if(node.isMesh){assert.ok(!meshes.has(prefix),'Duplicate mesh path: '+prefix);meshes.set(prefix,node);}
    for(const child of node.children)visit(child,prefix);
  };
  for(const child of scene.children)visit(child);
  return {roots,meshes};
}

const previewArgIndex=process.argv.indexOf('--preview');
const previewPath=previewArgIndex>=0?process.argv[previewArgIndex+1]:'';
const blenderArgs=[
  '--background','--factory-startup','--threads','1','--python-exit-code','1',
  '--python','scripts/blender/author-epic-props.py',
  '--','--output',stage,
];
if(previewPath)blenderArgs.push('--preview',previewPath);

await run(blender,blenderArgs);

const report=JSON.parse(await fs.readFile(path.join(stage,'report.json'),'utf8'));
assert.equal(report.count,17,'expected 17 epic prop models');

const rawPath=path.join(stage,'frontier-epic-props-raw.glb');
const packedPath=path.join(stage,'frontier-epic-props.glb');
await run(gltfpack,['-i',rawPath,'-o',packedPath,'-cc','-kn','-km','-ke','-kv','-vpf','-vtf','-vp','16','-vn','16','-vc','8']);

const [rawBytes,packedBytes]=await Promise.all([fs.readFile(rawPath),fs.readFile(packedPath)]);
const [rawScene,packedScene]=await Promise.all([decode(rawBytes),decode(packedBytes)]);
const rawCol=collect(rawScene),packedCol=collect(packedScene);
assert.deepEqual([...packedCol.roots.keys()].sort(),[...rawCol.roots.keys()].sort());
assert.deepEqual([...packedCol.meshes.keys()].sort(),[...rawCol.meshes.keys()].sort());

let visibleTriangles=0,maxPosDelta=0;
for(const [meshPath,rawMesh]of rawCol.meshes){
  const packedMesh=packedCol.meshes.get(meshPath);
  assert.deepEqual(packedMesh.matrix.toArray(),rawMesh.matrix.toArray(),'Transform mismatch: '+meshPath);
  assert.equal(packedMesh.userData.assetMaterial,rawMesh.userData.assetMaterial,'Material role mismatch: '+meshPath);
  const rawIdx=rawMesh.geometry.index?.count??rawMesh.geometry.attributes.position.count;
  const packedIdx=packedMesh.geometry.index?.count??packedMesh.geometry.attributes.position.count;
  assert.equal(packedIdx,rawIdx,'Triangle count mismatch: '+meshPath);
  visibleTriangles+=packedIdx/3;
  rawMesh.geometry.computeBoundingBox();packedMesh.geometry.computeBoundingBox();
  maxPosDelta=Math.max(maxPosDelta,
    rawMesh.geometry.boundingBox.min.distanceTo(packedMesh.geometry.boundingBox.min),
    rawMesh.geometry.boundingBox.max.distanceTo(packedMesh.geometry.boundingBox.max));
}
assert.ok(maxPosDelta<0.003,`Quantization drift too large: ${maxPosDelta}`);

if(process.argv.includes('--apply')){
  await fs.copyFile(packedPath,path.join(assets,'frontier-epic-props.glb'));
}
console.log(JSON.stringify({
  applied:process.argv.includes('--apply'),
  models:packedCol.roots.size,
  meshes:packedCol.meshes.size,
  visibleTriangles,
  rawBytes:rawBytes.length,
  packedBytes:packedBytes.length,
  maxPosDelta:Number(maxPosDelta.toFixed(6)),
}));
