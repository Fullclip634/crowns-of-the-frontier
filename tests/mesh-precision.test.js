import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {validateMeshPrecision} from '../scripts/blender/validate-mesh-precision.mjs';
import {composeBalancedCatalogue} from '../scripts/blender/balanced-foliage.mjs';
import {writeGlb} from '../scripts/blender/glb-catalogue.mjs';
import {createHash} from 'node:crypto';
function fixture({move=false,flip=false,normal=false,uv=false,color=false,motion=false}={}){
  const values=Buffer.alloc(108),position=new Float32Array([0,0,0,1,0,0,0,1,0]),normals=new Float32Array([0,0,1,0,0,1,0,0,1]),texcoords=new Float32Array([0,0,1,0,0,1]);
  if(move)position[3]=1.01;if(flip){position.set([0,1,0],3);position.set([1,0,0],6);}if(normal)normals.set([.1,0,.995],0);if(uv)texcoords[0]=.01;
  Buffer.from(position.buffer).copy(values,0);Buffer.from(normals.buffer).copy(values,36);Buffer.from(texcoords.buffer).copy(values,72);values.fill(127,96);if(color)values[96]=130;
  return writeGlb({asset:{version:'2.0'},scene:0,scenes:[{nodes:[0]}],nodes:[{name:'PrecisionFixture',mesh:0,extras:{assetKey:'fixture:solid',assetMaterial:'leaf',...(motion?{motion:{type:'arm'}}:{})}}],meshes:[{primitives:[{attributes:{POSITION:0,NORMAL:1,TEXCOORD_0:2,COLOR_0:3}}]}],buffers:[{byteLength:108}],bufferViews:[{buffer:0,byteOffset:0,byteLength:36},{buffer:0,byteOffset:36,byteLength:36},{buffer:0,byteOffset:72,byteLength:24},{buffer:0,byteOffset:96,byteLength:12}],accessors:[{bufferView:0,componentType:5126,type:'VEC3',count:3,min:[0,0,0],max:[move?1.01:1,1,0]},{bufferView:1,componentType:5126,type:'VEC3',count:3},{bufferView:2,componentType:5126,type:'VEC2',count:3},{bufferView:3,componentType:5121,type:'VEC4',count:3,normalized:true}]},values);
}
test('precision validation accepts identical visible triangles and reports their actual attribute errors',async()=>{const bytes=fixture(),report=await validateMeshPrecision(bytes,bytes);assert.equal(report.visibleTriangles,1);assert.equal(report.models,1);assert.equal(report.maxUVError,0);assert.equal(report.maxColorError,0);assert.equal(report.maxNormalDegrees,0);assert.ok(report.exactTrianglePositionsAndWinding);});
test('precision validation rejects moved/flipped faces, shading drift, UV/color damage and changed motion metadata',async()=>{const original=fixture();for(const option of ['move','flip','normal','uv','color','motion'])await assert.rejects(validateMeshPrecision(original,fixture({[option]:true})),undefined,option);});
test('compact Balanced retains all selected source triangles and exact UV/color data within the established source-normal envelope',async()=>{
  const base=process.env.ART_CATALOGUE_DIR?pathToFileURL(path.resolve(process.env.ART_CATALOGUE_DIR)+path.sep):new URL('../src/assets3d/',import.meta.url),read=name=>fs.readFileSync(new URL(name,base)),manifest=JSON.parse(read('catalogue.json')),near=read('frontier-near.glb'),low=read('frontier-low.glb'),foliage=read('frontier-foliage.glb'),candidate=read('frontier-balanced.glb');
  const source=composeBalancedCatalogue({near,low,foliage,models:manifest.models}).bytes;
  // The former -noq pack already changes source normals by up to 0.625 degrees.
  // The build separately enforces a stricter 0.05-degree *additional* compact
  // encoding limit against that same -noq reference, bound to this file hash.
  const report=await validateMeshPrecision(source,candidate,{normalLimit:1});assert.equal(report.models,126);assert.equal(report.maxUVError,0);assert.equal(report.maxColorError,0);assert.equal(manifest.balancedPrecision.candidateSHA256,createHash('sha256').update(candidate).digest('hex'));assert.ok(manifest.balancedPrecision.maxNormalDegrees<=.05&&manifest.balancedPrecision.exactTrianglePositionsAndWinding);
});
