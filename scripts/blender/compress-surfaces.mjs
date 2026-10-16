import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {readGlb} from './glb-catalogue.mjs';
import {read as readKtx} from 'three/addons/libs/ktx-parse.module.js';

const root=path.resolve(fileURLToPath(new URL('../../',import.meta.url)));
const source=path.join(root,'src/assets3d/textures');
const tool=process.env.GLTFPACK_PATH||path.join(root,'.tools/gltfpack/gltfpack.exe');
const output=path.resolve(process.env.SURFACE_OUTPUT||path.join(root,'.tools/compressed-surfaces-uastc3'));
if(!output.startsWith(root+path.sep))throw new Error('Surface output must stay in the workspace.');
fs.mkdirSync(output,{recursive:true});
const manifest=JSON.parse(fs.readFileSync(path.join(source,'manifest.json'),'utf8'));
const selected=process.env.SURFACE_FILE;
// The accepted color/ARM candidate preserves detail; original normals remain JPEG.
const codec=process.env.SURFACE_CODEC||'uastc',quality=Number(process.env.SURFACE_QUALITY||3),kinds=(process.env.SURFACE_KINDS||'color,arm').split(',');
if(!['uastc','etc1s'].includes(codec)||!Number.isInteger(quality)||quality<1||quality>10||kinds.some(kind=>!['color','normal','arm'].includes(kind)))throw new Error('Invalid texture encoding settings.');
const report={encoder:'gltfpack 1.3',codec,quality,threads:1,preserveResolution:true,maps:[]};
const digest=bytes=>createHash('sha256').update(bytes).digest('hex');
const vertices=new Float32Array([0,0,0,1,0,0,0,1,0,0,0,1,0,0,1,0,0,1,0,0,1,0,0,1]);
for(const asset of manifest)for(const map of asset.maps){
  if(selected&&map.file!==selected||!kinds.includes(map.kind))continue;
  const input=fs.readFileSync(path.join(source,map.file)),material={name:map.file,pbrMetallicRoughness:{metallicFactor:0,roughnessFactor:1}};
  if(map.kind==='color')material.pbrMetallicRoughness.baseColorTexture={index:0};
  else if(map.kind==='normal')material.normalTexture={index:0};
  else {material.pbrMetallicRoughness.metallicRoughnessTexture={index:0};material.occlusionTexture={index:0};}
  const scene={asset:{version:'2.0'},scene:0,scenes:[{nodes:[0]}],nodes:[{mesh:0}],meshes:[{primitives:[{attributes:{POSITION:0,NORMAL:1,TEXCOORD_0:2},material:0}]}],
    materials:[material],textures:[{source:0}],images:[{uri:'data:image/jpeg;base64,'+input.toString('base64')}],
    buffers:[{byteLength:vertices.byteLength,uri:'data:application/octet-stream;base64,'+Buffer.from(vertices.buffer).toString('base64')}],
    bufferViews:[{buffer:0,byteOffset:0,byteLength:36},{buffer:0,byteOffset:36,byteLength:36},{buffer:0,byteOffset:72,byteLength:24}],
    accessors:[{bufferView:0,componentType:5126,count:3,type:'VEC3',min:[0,0,0],max:[1,1,0]},{bufferView:1,componentType:5126,count:3,type:'VEC3'},{bufferView:2,componentType:5126,count:3,type:'VEC2'}]};
  const fixture=path.join(output,'texture-input.gltf'),packed=path.join(output,'texture-output.glb');
  fs.writeFileSync(fixture,JSON.stringify(scene));
  const start=Date.now(),result=spawnSync(tool,['-i',fixture,'-o',packed,codec==='uastc'?'-tu':'-tc','-tq',String(quality),'-tj','1','-noq'],{encoding:'utf8',windowsHide:true,maxBuffer:1024*1024});
  if(result.status!==0)throw new Error(`Surface encoding failed: ${map.file}\n${result.stderr||result.stdout}`);
  const {json,bin}=readGlb(fs.readFileSync(packed));
  const image=json.images?.find(image=>image.mimeType==='image/ktx2');if(!image)throw new Error('Encoder did not produce KTX2.');
  const view=json.bufferViews[image.bufferView],bytes=bin.subarray(view.byteOffset||0,(view.byteOffset||0)+view.byteLength),ktx=readKtx(bytes);
  if(ktx.pixelDepth||ktx.layerCount||ktx.faceCount!==1||ktx.levels.length!==11||ktx.pixelWidth!==1024||ktx.pixelHeight!==1024)throw new Error('Unexpected surface dimensions/mips.');
  const expectedTransfer=map.kind==='color'?2:1;if(ktx.dataFormatDescriptor[0].transferFunction!==expectedTransfer)throw new Error(`Incorrect transfer function for ${map.file}`);
  const file=map.file.replace(/\.jpg$/,'.ktx2');fs.writeFileSync(path.join(output,file),bytes);
  const check={source:map.file,file,kind:map.kind,sourceSHA256:digest(input),SHA256:digest(bytes),sourceBytes:input.length,bytes:bytes.length,width:ktx.pixelWidth,height:ktx.pixelHeight,mips:ktx.levels.length,transfer:expectedTransfer,ms:Date.now()-start};
  report.maps.push(check);console.log(`${file}: ${check.bytes} bytes, ${check.mips} mips, ${check.ms}ms`);
  fs.rmSync(fixture);fs.rmSync(packed);
}
if(!report.maps.length)throw new Error('No surface maps selected.');
fs.writeFileSync(path.join(output,'compression.json'),JSON.stringify(report,null,2)+'\n');
