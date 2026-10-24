import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';
import {composeBalancedCatalogue} from './balanced-foliage.mjs';
import {validateMeshPrecision} from './validate-mesh-precision.mjs';

// A surgical asset patch preserves the existing Balanced buffer encoding.
// Revalidate it against the current selected sources instead of copying old
// provenance or repacking unrelated, already reviewed geometry.
export async function refreshBalancedManifest(directory,scratch){
  const root=path.resolve(import.meta.dirname,'../..');directory=path.resolve(directory);scratch=path.resolve(scratch);
  for(const target of [directory,scratch]){const relative=path.relative(root,target);assert.ok(relative&&!relative.startsWith('..')&&!path.isAbsolute(relative),'Keep catalogue and scratch paths inside the project');}
  const manifest=JSON.parse(await fs.readFile(path.join(directory,'catalogue.json'),'utf8'));assert.equal(manifest.completeCatalogue,true);
  const read=name=>fs.readFile(path.join(directory,`frontier-${name}.glb`));
  const [near,low,foliage,candidate]=await Promise.all(['near','low','foliage','balanced'].map(read));
  const {bytes}=composeBalancedCatalogue({near,low,foliage,models:manifest.models});await fs.mkdir(scratch,{recursive:true});
  const input=path.join(scratch,'selected-source.glb'),reference=path.join(scratch,'source-precision-reference.glb'),log=await fs.open(path.join(scratch,'reference-pack.log'),'w');await fs.writeFile(input,bytes);
  try{await new Promise((resolve,reject)=>{const child=spawn(process.env.GLTFPACK_BIN||path.join(root,'.tools/gltfpack/gltfpack.exe'),['-i',input,'-o',reference,'-cc','-kn','-km','-ke','-kv','-noq'],{windowsHide:true,stdio:['ignore',log.fd,log.fd]});child.on('error',reject);child.on('close',code=>code===0?resolve():reject(Error('Inspect the source-reference packing log')));});}finally{await log.close();}
  const referenceBytes=await fs.readFile(reference),precision=await validateMeshPrecision(referenceBytes,candidate),hash=bytes=>createHash('sha256').update(bytes).digest('hex');
  assert.ok(precision.passed&&precision.exactTrianglePositionsAndWinding);assert.equal(precision.models,126);assert.equal(precision.maxUVError,0);assert.equal(precision.maxColorError,0);assert.ok(precision.maxNormalDegrees<=.05,'Retain the original compact-normal precision limit');
  manifest.balancedPrecision={...precision,referenceSHA256:hash(referenceBytes),candidateSHA256:hash(candidate)};
  manifest.balancedSourceHashes=Object.fromEntries(Object.entries({near,low,foliage}).map(([name,bytes])=>[name,hash(bytes)]));
  manifest.balancedEncoding='Floating-point positions and UVs; source-preserving normals and colors; retained compact surfaces; no additional triangle simplification.';
  manifest.sizes.balanced=candidate.length;await fs.writeFile(path.join(directory,'catalogue.json'),JSON.stringify(manifest,null,2)+'\n');return manifest.balancedPrecision;
}

if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href){assert.equal(process.argv.length,4,'Supply a catalogue directory and scratch directory');console.log(JSON.stringify(await refreshBalancedManifest(process.argv[2],process.argv[3])));}
