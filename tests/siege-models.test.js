import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import * as THREE from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {MeshoptDecoder} from 'three/addons/libs/meshopt_decoder.module.js';
import {animatePart} from '../src/world-polish.js';
import {landingClearance,landingGroundClearance} from '../src/disembark.js';
const directory=process.env.ART_CATALOGUE_DIR?pathToFileURL(path.resolve(process.env.ART_CATALOGUE_DIR)+path.sep):new URL('../src/assets3d/',import.meta.url);
for(const detail of ['low','balanced','near'])test(`${detail} siege keeps solid timber silhouettes, working mechanisms and enough landing clearance`,async t=>{
  const bytes=fs.readFileSync(new URL(`frontier-${detail}.glb`,directory)),gltf=await new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'');
  const roots=[];gltf.scene.traverse(n=>{if(['unit:ram','unit:catapult'].includes(n.userData.assetKey))roots.push(n);});assert.equal(roots.length,2);
  for(const root of roots){
    assert.equal(root.userData.model3d.siegeRevision,'solid-timber-v1');root.updateMatrixWorld(true);
    const wheels=new Set(),roles=new Set(),bounds=new THREE.Box3().setFromObject(root),size=bounds.getSize(new THREE.Vector3());let mechanism=0,triangles=0,changed=0,sweptRadius=0,groundRadius=0;
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
      const rest=new THREE.Vector3(),animated=new THREE.Vector3(),identity=new THREE.Matrix4(),view={clock:0};
      for(let phase=0;phase<=40;phase++){
        const pose=animatePart(view,part,{id:7,type:root.userData.model3d.type,cooldown:phase*.1,moving:false},identity);
        for(let i=0;i<p.count;i++){rest.fromBufferAttribute(p,i).applyMatrix4(part.matrixWorld);animated.copy(rest).applyMatrix4(pose);sweptRadius=Math.max(sweptRadius,Math.hypot(animated.x,animated.z));if(animated.y<1.05)groundRadius=Math.max(groundRadius,Math.hypot(animated.x,animated.z));}
      }
    });
    assert.equal(wheels.size,4);assert.ok(mechanism>=2&&changed>20,'Metal and timber follow the animated mechanism');assert.ok(roles.has('wood')&&roles.has('iron')&&roles.has('darkwood'));
    assert.ok(triangles<10000,'Retain a bounded instanced siege model');
    const entity={type:root.userData.model3d.type,r:1.35},clearance=landingClearance(entity),groundClearance=landingGroundClearance(entity);assert.ok(sweptRadius<=clearance,'Landing room covers the actual authored model through its sampled firing cycle');assert.ok(groundRadius<=groundClearance,'The wheels and lower chassis stay entirely on dry ground');t.diagnostic(JSON.stringify({detail,type:entity.type,sweptRadius,clearance,groundRadius,groundClearance}));
  }
  const geometries=new Set(),materials=new Set();gltf.scene.traverse(n=>{if(n.isMesh){geometries.add(n.geometry);materials.add(n.material);}});for(const g of geometries)g.dispose();for(const m of materials)m.dispose();
});

for(const detail of ['low','balanced','near'])test(`${detail} naval fleet keeps sculpted hulls, billowing sails, animated joints and bounded geometry`,async t=>{
  const bytes=fs.readFileSync(new URL(`frontier-${detail}.glb`,directory)),gltf=await new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'');
  const keys=['unit:fishingboat','unit:galley','unit:warship','unit:transport'];
  const roots=[];gltf.scene.traverse(n=>{if(keys.includes(n.userData.assetKey))roots.push(n);});assert.equal(roots.length,4);
  for(const root of roots){
    assert.equal(root.userData.model3d.navalRevision,'carvel-timber-v1');root.updateMatrixWorld(true);
    const type=root.userData.model3d.type,roles=new Set(),motions=new Set(),bounds=new THREE.Box3().setFromObject(root),size=bounds.getSize(new THREE.Vector3());
    let triangles=0,animatedSails=0,oars=new Set();
    assert.ok(size.x>2.0&&size.y>2.2&&size.z>4.5,`${type} has full naval silhouette (${size.toArray().map(v=>v.toFixed(2))})`);
    root.traverse(part=>{
      if(!part.isMesh)return;
      roles.add(part.userData.assetMaterial);
      const m=part.userData.motion,p=part.geometry.attributes.position,index=part.geometry.index;
      triangles+=(index?.count||p.count)/3;
      if(m?.type){
        motions.add(m.type);
        const e={id:7,type,moving:true,cooldown:0};
        const a=animatePart({clock:0.2},part,e,new THREE.Matrix4()).clone();
        const b=animatePart({clock:1.1},part,e,new THREE.Matrix4()).clone();
        assert.ok(a.elements.every(Number.isFinite)&&b.elements.every(Number.isFinite));
        assert.notDeepEqual(a.elements,b.elements,`${type} ${m.type} animates over time`);
        if(m.type==='sail')animatedSails++;
        if(m.type==='oar')oars.add(JSON.stringify(m.pivot));
      }
    });
    assert.ok(roles.has('wood')&&roles.has('darkwood')&&roles.has('canvas'),`${type} keeps timber hull and canvas rigging`);
    if(type==='fishingboat')assert.ok(roles.has('teamRoof')&&roles.has('iron'));
    if(type!=='fishingboat')assert.ok(animatedSails>=2&&roles.has('team'),`${type} carries animated billowing sails with team heraldry`);
    if(type==='galley')assert.equal(oars.size,8,'galley keeps 8 articulated rowing oars');
    if(type==='warship')assert.ok(roles.has('steel')&&roles.has('gold')&&size.z>6.0,'warship carries metallic broadside cannons and galleon scale');
    assert.ok(triangles<8000,`${type} remains bounded (${triangles} tris)`);
    t.diagnostic(JSON.stringify({detail,type,triangles:Math.round(triangles),size:size.toArray().map(v=>+v.toFixed(2))}));
  }
  const geometries=new Set(),materials=new Set();gltf.scene.traverse(n=>{if(n.isMesh){geometries.add(n.geometry);materials.add(n.material);}});for(const g of geometries)g.dispose();for(const m of materials)m.dispose();
});
