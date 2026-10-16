import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import * as THREE from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {MeshoptDecoder} from 'three/addons/libs/meshopt_decoder.module.js';
import {animatePart} from '../src/world-polish.js';
const directory=process.env.ART_CATALOGUE_DIR?pathToFileURL(path.resolve(process.env.ART_CATALOGUE_DIR)+path.sep):new URL('../src/assets3d/',import.meta.url);
for(const detail of ['low','balanced','near'])test(`${detail} siege keeps solid timber silhouettes, four animated wheels and a separate working mechanism`,async()=>{
  const bytes=fs.readFileSync(new URL(`frontier-${detail}.glb`,directory)),gltf=await new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'');
  const roots=[];gltf.scene.traverse(n=>{if(['unit:ram','unit:catapult'].includes(n.userData.assetKey))roots.push(n);});assert.equal(roots.length,2);
  for(const root of roots){
    assert.equal(root.userData.model3d.siegeRevision,'solid-timber-v1');root.updateMatrixWorld(true);
    const wheels=new Set(),roles=new Set(),bounds=new THREE.Box3().setFromObject(root),size=bounds.getSize(new THREE.Vector3());let mechanism=0,triangles=0,changed=0;
    assert.ok(size.x>2.3&&size.y>2.5&&size.z>3.1,`${root.name} has depth, height and width`);
    root.traverse(part=>{
      if(!part.isMesh)return;roles.add(part.userData.assetMaterial);const m=part.userData.motion,p=part.geometry.attributes.position,index=part.geometry.index;triangles+=(index?.count||p.count)/3;
      if(m?.type==='wheel')wheels.add(JSON.stringify(m.pivot));
      if(m?.type===(root.userData.assetKey==='unit:ram'?'ram':'siege')){
        mechanism++;const e={id:7,type:root.userData.model3d.type,cooldown:3.45,moving:false},pose=animatePart({clock:0},part,e,new THREE.Matrix4()).clone();
        const own=part.matrixWorld,rest=new THREE.Vector3(),animated=new THREE.Vector3();
        for(let i=0;i<p.count;i++){
          rest.fromBufferAttribute(p,i).applyMatrix4(own);animated.copy(rest).applyMatrix4(pose);assert.ok(Number.isFinite(animated.lengthSq()));
          assert.ok(animated.y>.90,'Mechanism remains above the chassis and ground');if(animated.distanceToSquared(rest)>.001)changed++;
        }
      }
    });
    assert.equal(wheels.size,4);assert.ok(mechanism>=2&&changed>20,'Metal and timber follow the animated mechanism');assert.ok(roles.has('wood')&&roles.has('iron')&&roles.has('darkwood'));
    assert.ok(triangles<10000,'Retain a bounded instanced siege model');
  }
  const geometries=new Set(),materials=new Set();gltf.scene.traverse(n=>{if(n.isMesh){geometries.add(n.geometry);materials.add(n.material);}});for(const g of geometries)g.dispose();for(const m of materials)m.dispose();
});
