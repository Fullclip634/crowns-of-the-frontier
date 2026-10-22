import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {spawn} from 'node:child_process';
import {createHash} from 'node:crypto';
import {readGlb} from './glb-catalogue.mjs';
import {composeQualityCatalogue} from './quality-catalogue.mjs';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {GLTFExporter} from 'three/addons/exporters/GLTFExporter.js';
import {MeshoptDecoder} from 'three/addons/libs/meshopt_decoder.module.js';
import {canonicalGeometry} from '../../src/authored-assets.js';
import {validateMeshPrecision} from './validate-mesh-precision.mjs';

export const sharedTreeKeys=Object.freeze(['highlands','winter','desert'].flatMap(biome=>Array.from({length:4},(_,i)=>['near','far'].map(detail=>`tree:${biome}:${i}:${detail}`)).flat()));
export function composeSharedTrees(near){
  const keys=readGlb(near).json.nodes.filter(node=>node.extras?.assetKey?.startsWith('tree:')).map(node=>node.extras.assetKey);
  assert.deepEqual(keys.sort(),sharedTreeKeys.slice().sort(),'Every biome, variant and distance model is required.');
  return composeQualityCatalogue([{bytes:near,keys:sharedTreeKeys}]);
}

export async function buildSharedTrees(directory){
  const project=fileURLToPath(new URL('../../',import.meta.url)),relative=path.relative(project,directory);
  assert.ok(relative&&!relative.startsWith('..')&&!path.isAbsolute(relative),'Tree output must stay in the project.');
  const near=await fs.readFile(path.join(directory,'frontier-near.glb')),bytes=composeSharedTrees(near);
  const scratch=path.join(project,'.tools','art-candidate','shared-trees');await fs.mkdir(scratch,{recursive:true});
  const input=path.join(scratch,'trees-source.glb'),output=path.join(directory,'frontier-trees.glb');
  // Decode normalized source attributes before handing them to the optimizer.
  // Repacking their integer representation directly renormalizes bark normals
  // differently, even with the optimizer's floating-point output flags.
  const gltf=await new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'');
  gltf.scene.traverse(node=>{if(node.isMesh){canonicalGeometry(node.geometry);node.geometry.normalizeNormals();}});
  globalThis.FileReader??=class{readAsArrayBuffer(blob){blob.arrayBuffer().then(value=>{this.result=value;this.onloadend?.({target:this});}).catch(error=>this.onerror?.(error));}};
  const decoded=await new GLTFExporter().parseAsync(gltf.scene,{binary:true,onlyVisible:false});await fs.writeFile(input,Buffer.from(decoded));
  // Repack only: preserve the exact detailed tree geometry, colors and normals.
  // All presets load this one asset; no tree quality swap is possible.
  await new Promise((resolve,reject)=>{
    const child=spawn(process.env.GLTFPACK_BIN||path.join(project,'.tools','gltfpack','gltfpack.exe'),['-i',input,'-o',output,'-cc','-kn','-km','-ke','-kv','-vpf','-vtf','-vn','16','-vc','8'],{windowsHide:true,stdio:'inherit'});
    child.on('error',reject);child.on('close',code=>code===0?resolve():reject(new Error('Shared tree packing failed: '+code)));
  });
  const packed=await fs.readFile(output),precision=await validateMeshPrecision(bytes,packed),manifestPath=path.join(directory,'catalogue.json'),manifest=JSON.parse(await fs.readFile(manifestPath,'utf8'));
  manifest.sharedTrees={file:'frontier-trees.glb',models:sharedTreeKeys.length,bytes:packed.length,source:'High Blender tree geometry shared by every graphics preset; distance detail is independent of preset.',sha256:createHash('sha256').update(packed).digest('hex'),precision};
  await fs.writeFile(manifestPath,JSON.stringify(manifest,null,2)+'\n');
  return manifest.sharedTrees;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href){
  const args=process.argv.slice(2);assert.ok(!args.length||(args.length===2&&args[0]==='--directory'),'Use --directory for staged artwork.');
  console.log(JSON.stringify(await buildSharedTrees(path.resolve(args[1]||'src/assets3d'))));
}
