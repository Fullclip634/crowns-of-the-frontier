import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs/promises';import * as THREE from 'three';import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';import {MeshoptDecoder} from 'three/addons/libs/meshopt_decoder.module.js';import {bindWorkerToolJoints} from '../src/worker-tool-rig.js';import {animatePart} from '../src/world-polish.js';
import {constructionPositions,constructionHeading,constructionHalfSize} from '../src/construction-contact.js';

test('released Blender hammers cross each construction work plane at impact and clear it on preparation',async()=>{
 for(const tier of ['low','balanced','near']){
  const bytes=await fs.readFile(new URL('../src/assets3d/frontier-'+tier+'.glb',import.meta.url)),gltf=await new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'');let source;gltf.scene.traverse(n=>{if(n.userData.assetKey==='unit:villager:build')source=n;});const model=source.clone(true);bindWorkerToolJoints(model);model.updateMatrixWorld(true);
  const state={task:'build',blend:1,phase:0},view={clock:0,unitActions:{get:()=>state}},worker={id:1,type:'villager',moving:false,cooldown:0,x:0,z:0,r:.65},point=new THREE.Vector3();
  for(const angle of [0,Math.PI/4])for(let face=0;face<4;face++){
    const site={x:3,z:17,r:2.3,wallAngle:angle},anchor=constructionPositions(worker,site).find(p=>p.face===face),base=new THREE.Matrix4().makeRotationY(constructionHeading(site,face)).setPosition(anchor.x,0,anchor.z),c=Math.cos(angle),s=Math.sin(angle);
    for(const phase of [.4,.58]){state.phase=phase;let min=Infinity,max=-Infinity,count=0;
      model.traverse(part=>{if(!part.isMesh||part.userData.motion?.type!=='workerTool'||!['steel','iron'].includes(part.userData.assetMaterial))return;const matrix=animatePart(view,part,worker,base).clone().multiply(part.matrixWorld),positions=part.geometry.attributes.position;for(let i=0;i<positions.count;i++){point.fromBufferAttribute(positions,i).applyMatrix4(matrix);const dx=point.x-site.x,dz=point.z-site.z,lx=c*dx-s*dz,lz=s*dx+c*dz,distance=(face===0?lx:face===1?-lx:face===2?lz:-lz)-constructionHalfSize(site);min=Math.min(min,distance);max=Math.max(max,distance);count++;}});
      assert.ok(count>0);if(phase===.4)assert.ok(min>.4,'the raised hammer clears the surface');else assert.ok(min<.02&&max>-.02,`${tier} hammer crosses the ${face} work face`);
    }
  }
  const geometries=new Set(),materials=new Set();gltf.scene.traverse(p=>{if(p.isMesh){geometries.add(p.geometry);materials.add(p.material);}});for(const item of [...geometries,...materials])item.dispose();
 }
});

for(const task of ['wood','mine'])test('both '+task+' hands remain on the handle through the complete cycle in every detail tier',async()=>{
 for(const tier of ['near','balanced','low']){
  const bytes=await fs.readFile(new URL('../src/assets3d/frontier-'+tier+'.glb',import.meta.url)),gltf=await new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'');let source;gltf.scene.traverse(n=>{if(n.userData.assetKey==='unit:villager:'+task)source=n;});const model=source.clone(true);bindWorkerToolJoints(model);model.updateMatrixWorld(true);let left,right,tool;model.traverse(p=>{if(!p.isMesh)return;const m=p.userData.motion;if(p.userData.assetMaterial==='skin'&&m?.type==='forearm'){if(m.side<0)left=p;else right=p;}if(m?.type==='workerTool')tool=p;});
  const leftGrip=new THREE.Box3().setFromObject(left).getCenter(new THREE.Vector3()),rightGrip=new THREE.Box3().setFromObject(right).getCenter(new THREE.Vector3()),state={task,blend:1,phase:0},view={clock:0,unitActions:{get:()=>state}},entity={id:1,type:'villager',moving:false,cooldown:0},base=new THREE.Matrix4().makeRotationY(.73).setPosition(3,1,-8);let previous;
  const samples=task==='mine'?1536:100;
  for(let i=0;i<=samples;i++){state.phase=i/samples;const lm=animatePart(view,left,entity,base).clone(),rm=animatePart(view,right,entity,base).clone(),tm=animatePart(view,tool,entity,base).clone(),shaft=new THREE.Vector3(0,1,0).transformDirection(tm),grip=rightGrip.clone().applyMatrix4(rm),support=grip.clone().addScaledVector(shaft,-.15),actual=leftGrip.clone().applyMatrix4(lm);assert.ok(actual.distanceTo(support)<.01,`${tier} phase ${state.phase}: support misses by ${actual.distanceTo(support)}`);assert.ok(rightGrip.clone().applyMatrix4(tm).distanceTo(grip)<1e-6);assert.ok(tm.elements.every(Number.isFinite));if(previous)assert.ok(actual.distanceTo(previous)<.15,'support motion must stay continuous');previous=actual;}
  for(const blend of [0.001,.1,.4,.7,1]){state.blend=blend;state.phase=.55;for(const part of [left,right,tool])assert.ok(animatePart(view,part,entity,base).elements.every(Number.isFinite));}
  if(task==='mine'){
    // Sample inside every interpolation interval against the analytic solver
    // just below the full-strength threshold, using the real released rig.
    for(let sample=0;sample<512;sample++){
      state.phase=(sample+1/3)/512;state.blend=1;
      const parts=[left,right,tool],baked=parts.map(part=>animatePart(view,part,entity,base).clone());state.blend=1-2e-6;
      for(let part=0;part<parts.length;part++){
        const solved=animatePart(view,parts[part],entity,base).clone();
        for(const point of [[0,0,0],[1,0,0],[0,1,0],[0,0,1]])assert.ok(new THREE.Vector3(...point).applyMatrix4(baked[part]).distanceTo(new THREE.Vector3(...point).applyMatrix4(solved))<.001,'interpolated mining retains the solved joint transform');
      }
    }
    state.blend=1;state.phase=.59;const bounds=new THREE.Box3(),point=new THREE.Vector3();
    model.traverse(part=>{if(part.userData.motion?.type!=='workerTool'||!['steel','iron'].includes(part.userData.assetMaterial))return;const pose=animatePart(view,part,entity,new THREE.Matrix4()).clone().multiply(part.matrixWorld),positions=part.geometry.attributes.position;for(let n=0;n<positions.count;n++)bounds.expandByPoint(point.fromBufferAttribute(positions,n).applyMatrix4(pose));});
    const size=bounds.getSize(new THREE.Vector3());assert.ok(size.x<.2&&size.z>.5,'the pick points strike forward in the swing plane');
  }
  const geometries=new Set(),materials=new Set();gltf.scene.traverse(p=>{if(p.isMesh){geometries.add(p.geometry);materials.add(p.material);}});for(const item of [...geometries,...materials])item.dispose();
 }
});
