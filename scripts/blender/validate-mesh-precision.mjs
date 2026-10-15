import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import * as THREE from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {MeshoptDecoder} from 'three/addons/libs/meshopt_decoder.module.js';

async function decode(bytes){return (await new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'')).scene;}
function collect(scene){const meshes=new Map(),roots=new Set(),buffers=new Set();
  const visit=(node,prefix='')=>{if(node.userData.assetKey){prefix=node.userData.assetKey;roots.add(prefix);}else prefix+='/'+node.name;
    if(node.isMesh){assert.ok(!meshes.has(prefix),'Named mesh paths must be unique');meshes.set(prefix,node);for(const attribute of [...Object.values(node.geometry.attributes),node.geometry.index].filter(Boolean))buffers.add((attribute.isInterleavedBufferAttribute?attribute.data.array:attribute.array).buffer);}
    for(const child of node.children)visit(child,prefix);
  };for(const child of scene.children)visit(child);return {meshes,roots,decodedBytes:[...buffers].reduce((sum,buffer)=>sum+buffer.byteLength,0)};
}
function semantics(node){return JSON.stringify(Object.fromEntries(Object.entries(node.userData).filter(([key])=>key!=='gltfExtensions')));}
function triangles(geometry){const p=geometry.attributes.position,index=geometry.index,result=[],v=new THREE.Vector3(),b=new THREE.Vector3(),c=new THREE.Vector3();
  for(let i=0;i<(index?.count??p.count);i+=3){const ids=[0,1,2].map(offset=>index?index.getX(i+offset):i+offset),keys=ids.map(id=>[p.getX(id),p.getY(id),p.getZ(id)].join(','));
    v.fromBufferAttribute(p,ids[0]);b.fromBufferAttribute(p,ids[1]);c.fromBufferAttribute(p,ids[2]);if(b.sub(v).cross(c.sub(v)).lengthSq()<=1e-16)continue;
    let first=0;if(keys[1]<keys[first])first=1;if(keys[2]<keys[first])first=2;const order=[0,1,2].map(offset=>(first+offset)%3);
    result.push({key:order.map(n=>keys[n]).join('|'),ids:order.map(n=>ids[n])});
  }return result;
}
function attributes(geometry,ids){return ids.map(id=>{const n=geometry.attributes.normal,uv=geometry.attributes.uv,color=geometry.attributes.color,normal=n?new THREE.Vector3(n.getX(id),n.getY(id),n.getZ(id)).normalize().toArray():null;return {normal,uv:uv?[uv.getX(id),uv.getY(id)]:null,color:color?[color.getX(id),color.getY(id),color.getZ(id),color.itemSize===4?color.getW(id):1]:null};});}
function difference(a,b){let normal=0,uv=0,color=0;for(let i=0;i<3;i++){assert.equal(!!a[i].normal,!!b[i].normal);assert.equal(!!a[i].uv,!!b[i].uv);assert.equal(!!a[i].color,!!b[i].color);if(a[i].normal){const dot=a[i].normal.reduce((n,v,k)=>n+v*b[i].normal[k],0);normal=Math.max(normal,Math.acos(Math.min(1,Math.max(-1,dot)))*180/Math.PI);}if(a[i].uv)for(let k=0;k<2;k++)uv=Math.max(uv,Math.abs(a[i].uv[k]-b[i].uv[k]));if(a[i].color)for(let k=0;k<4;k++)color=Math.max(color,Math.abs(a[i].color[k]-b[i].color[k]));}return {normal,uv,color};}
function dispose(scene){const geometry=new Set(),materials=new Set();scene.traverse(node=>{if(node.isMesh){geometry.add(node.geometry);for(const material of Array.isArray(node.material)?node.material:[node.material])materials.add(material);}});for(const value of [...geometry,...materials])value.dispose();}

export async function validateMeshPrecision(reference,candidate,{normalLimit=.05}={}){assert.ok(normalLimit>0&&normalLimit<=1);const scenes=[];try{
  const original=await decode(reference);scenes.push(original);const compact=await decode(candidate);scenes.push(compact);const a=collect(original),b=collect(compact);assert.deepEqual([...a.roots].sort(),[...b.roots].sort());assert.deepEqual([...a.meshes.keys()].sort(),[...b.meshes.keys()].sort());
  let count=0,maxNormalDegrees=0,maxUVError=0,maxColorError=0;
  for(const [key,node]of a.meshes){const next=b.meshes.get(key);assert.deepEqual(next.matrix.toArray(),node.matrix.toArray(),'Preserve mesh transforms: '+key);assert.equal(semantics(next),semantics(node),'Preserve motion and surface metadata: '+key);
    const expected=new Map();for(const face of triangles(node.geometry)){if(!expected.has(face.key))expected.set(face.key,[]);expected.get(face.key).push(attributes(node.geometry,face.ids));}
    for(const face of triangles(next.geometry)){const matches=expected.get(face.key);assert.ok(matches?.length,'Every visible triangle must retain exact Float32 positions and winding: '+key);const actual=attributes(next.geometry,face.ids);let chosen=-1,best;
      for(let i=0;i<matches.length;i++){const error=difference(matches[i],actual);if(error.normal<=normalLimit&&error.uv<=1e-6&&error.color<=1/255+1e-7){chosen=i;best=error;break;}}
      assert.ok(chosen>=0,'Shading/UV precision exceeds the declared limits: '+key+' '+JSON.stringify(matches.map(value=>difference(value,actual))));matches.splice(chosen,1);maxNormalDegrees=Math.max(maxNormalDegrees,best.normal);maxUVError=Math.max(maxUVError,best.uv);maxColorError=Math.max(maxColorError,best.color);count++;
    }for(const remaining of expected.values())assert.equal(remaining.length,0,'No visible triangle may disappear: '+key);
  }
  return {passed:true,models:a.roots.size,meshes:a.meshes.size,visibleTriangles:count,exactTrianglePositionsAndWinding:true,normalLimitDegrees:normalLimit,maxNormalDegrees,maxUVError,maxColorError,referenceBytes:reference.length,candidateBytes:candidate.length,referenceDecodedBufferBytes:a.decodedBytes,candidateDecodedBufferBytes:b.decodedBytes};
}finally{for(const scene of scenes)dispose(scene);}}

if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const args=process.argv.slice(2),options={};for(let i=0;i<args.length;i+=2){assert.ok(['--reference','--candidate','--report','--normal-limit'].includes(args[i])&&args[i+1]);options[args[i]]=args[i+1];}
  const root=fileURLToPath(new URL('../../',import.meta.url)),owned=value=>{const full=path.resolve(root,value),relative=path.relative(root,full);assert.ok(relative&&!relative.startsWith('..')&&!path.isAbsolute(relative));return full;};
  const report=await validateMeshPrecision(fs.readFileSync(owned(options['--reference'])),fs.readFileSync(owned(options['--candidate'])),{normalLimit:options['--normal-limit']?Number(options['--normal-limit']):.05});fs.writeFileSync(owned(options['--report']),JSON.stringify(report,null,2));console.log(JSON.stringify(report));
}
