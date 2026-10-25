import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs/promises';import * as THREE from 'three';import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';import {MeshoptDecoder} from 'three/addons/libs/meshopt_decoder.module.js';
import {animatePart,beginJointPose,endJointPose} from '../src/world-polish.js';import {archeryPose,bowReleasePoint} from '../src/archery-pose.js';import {attackFlight} from '../src/battle-effects.js';import {UNITS} from '../src/data.js';import {releaseDelay} from '../src/combat-timing.js';

test('released Blender bows stay in both hands, keep strings attached at constant length and release along the held arrow',async()=>{
 for(const tier of ['low','balanced','near']){
  const bytes=await fs.readFile(new URL('../src/assets3d/frontier-'+tier+'.glb',import.meta.url)),gltf=await new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'');const roots=new Map();gltf.scene.traverse(n=>{if(n.userData.assetKey)roots.set(n.userData.assetKey,n);});
  for(const type of ['archer','marksman']){
   const root=roots.get('unit:'+type);root.updateMatrixWorld(true);let left,right,upper,lower;const strings=[],arrows=[];root.traverse(p=>{const m=p.userData.motion;if(!p.isMesh)return;if(m?.type==='forearm'&&p.userData.assetMaterial==='skin'){if(m.side<0)left=p;else right=p;}if(m?.type==='bow'){if(m.part==='upper')upper=p;if(m.part==='lower')lower=p;if(m.part.startsWith('string'))strings.push(p);if(m.part==='arrow')arrows.push(p);}});assert.ok(left&&right&&upper&&lower&&strings.length===2&&arrows.length>=2,'all closed bow parts are released');
   const lg=new THREE.Box3().setFromObject(left).getCenter(new THREE.Vector3()),rg=new THREE.Box3().setFromObject(right).getCenter(new THREE.Vector3()),e={id:1,type,kind:'unit',hp:65,moving:false,cooldown:1,order:{type:'attack',target:2}},view={clock:0,sim:{time:0},combatTime:0},interval=UNITS[type].cooldown||1.2,base=new THREE.Matrix4().makeRotationY(.7).setPosition(4,2,-3);let first,last;
   for(let i=0;i<=512;i++){
    const age=interval*i/512;e.cooldown=interval-age;const p=archeryPose(e),hand=lg.clone().applyMatrix4(animatePart(view,left,e,base)),drawHand=rg.clone().applyMatrix4(animatePart(view,right,e,base)),grip=new THREE.Vector3(...upper.userData.motion.pivot).applyMatrix4(animatePart(view,upper,e,base));assert.ok(hand.distanceTo(grip)<.002,`${tier}/${type}/${age}: left palm stays on the grip`);
    if(age<=releaseDelay(e))assert.ok(drawHand.distanceTo(p.nock.clone().applyMatrix4(base))<.002,'right hand draws the string');
    for(const string of strings){const m=string.userData.motion,mat=animatePart(view,string,e,base).clone(),a=new THREE.Vector3(...m.a).applyMatrix4(mat),b=new THREE.Vector3(...m.b).applyMatrix4(mat),limb=m.part==='stringUpper'?upper:lower,tip=new THREE.Vector3(...m.a).applyMatrix4(animatePart(view,limb,e,base));assert.ok(a.distanceTo(tip)<1e-5,'string remains attached to limb tip');assert.ok(b.distanceTo(p.nock.clone().applyMatrix4(base))<1e-5,'strings meet at the nock');assert.ok(Math.abs(a.distanceTo(b)-new THREE.Vector3(...m.a).distanceTo(new THREE.Vector3(...m.b)))<1e-5,'limb flex preserves string length');assert.ok(mat.elements.every(Number.isFinite));}
    const pose=animatePart(view,upper,e,base).clone();beginJointPose(view,e,base);const cached=animatePart(view,upper,e,base).clone();endJointPose(view);assert.deepEqual(cached.elements,pose.elements);if(!first)first=pose;if(last)assert.ok(grip.distanceTo(new THREE.Vector3(...upper.userData.motion.pivot).applyMatrix4(last))<.04,'grip trajectory is continuous');last=pose;
   }
   assert.ok(first.elements.every((v,i)=>Math.abs(v-last.elements[i])<1e-6),'shot loop closes without a posture snap');e.cooldown=interval-releaseDelay(e);const p=archeryPose(e),arrow=arrows[0],m=arrow.userData.motion,center=new THREE.Vector3(m.pivot[0]+.035,m.pivot[1],m.pivot[2]+.205).applyMatrix4(animatePart(view,arrow,e,new THREE.Matrix4()));assert.ok(center.distanceTo(new THREE.Vector3(bowReleasePoint.x,bowReleasePoint.y,bowReleasePoint.z))<1e-5);assert.ok(p.right.distanceTo(p.nock)<1e-5);
  }
  const geometries=new Set(),materials=new Set();gltf.scene.traverse(p=>{if(p.isMesh){geometries.add(p.geometry);materials.add(p.material);}});for(const value of [...geometries,...materials])value.dispose();
 }
});

test('archery presentation uses visible cooldowns, preserves idle locomotion and aligns flights in any heading',()=>{
 for(const type of ['archer','marksman']){
  const interval=UNITS[type].cooldown||1.2,own={type,hp:65,cooldown:interval-.07,order:{type:'attack',target:2}},observed={...own,order:undefined};const a=structuredClone(archeryPose(own)),b=structuredClone(archeryPose(observed));assert.deepEqual(a,b);
  for(const change of [{moving:true},{hp:0},{embarked:4},{cooldown:0,order:undefined}])assert.equal(archeryPose({...own,...change}),null);
  for(const angle of [0,.7,Math.PI,-Math.PI/2]){const e={...own,kind:'unit',x:3,z:5},target={kind:'unit',type:'spearman',x:3+Math.sin(angle)*10,z:5+Math.cos(angle)*10};const flight=attackFlight({entityHeight:()=>2},e,target,0,{pendingImpact:true,flightDuration:.5});assert.ok(flight.from.distanceTo(new THREE.Vector3(bowReleasePoint.x,bowReleasePoint.y,bowReleasePoint.z).applyMatrix4(new THREE.Matrix4().makeRotationY(angle).setPosition(3,2,5)))<1e-6);}
 }
 assert.equal(archeryPose({type:'galley',cooldown:1}),null);assert.equal(archeryPose({type:'swordsman',cooldown:1}),null);
});
