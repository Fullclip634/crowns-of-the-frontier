import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import * as THREE from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {MeshoptDecoder} from 'three/addons/libs/meshopt_decoder.module.js';
import {bindMountedFootRig} from '../src/mounted-footing.js';
import {prepareFootPlacement,pruneFootPlacements,visualBodyOffset} from '../src/foot-placement.js';
import {animatePart,beginJointPose,endJointPose} from '../src/world-polish.js';
import {UnitLocomotion,CAVALRY_STRIDE} from '../src/locomotion.js';
import {writeUnitPose} from '../src/render-batches.js';
import {Landscape} from '../src/landscape.js';
import {Simulation} from '../src/simulation.js';
import {canonicalGeometry} from '../src/authored-assets.js';
import {createRigidUnitPart,writeRigidPose,finishRigidFrame,disposeRigidPart} from '../src/rig-batches.js';

const batch={model3d:{terrainHorse:true}},catalogues=new Map(),positions=[[-.3,-.58],[-.3,.59],[.3,-.58],[.3,.59]],tau=Math.PI*2;
async function catalogue(tier){
  if(!catalogues.has(tier)){
    const root=process.env.MOUNTED_ART_DIR||'src/assets3d',bytes=await fs.readFile(path.resolve(root,`frontier-${tier}.glb`));
    const gltf=await new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),''),models=new Map();
    gltf.scene.traverse(node=>{if(node.userData.assetKey)models.set(node.userData.assetKey,node);});catalogues.set(tier,models);
  }return catalogues.get(tier);
}
function environment(gait,sx=0,sz=0){
  let samples=0;const landscape={grid:{},walkableSampleAt(x,z,out){samples++;out.height=sx*x+sz*z;out.dx=sx;out.dz=sz;return out;}};
  return {clock:0,landscape,groundHeight:(x,z)=>sx*x+sz*z,locomotion:{get:()=>gait},footDiagnostics:{computed:0,reused:0,samples:0},sampleCount:()=>samples};
}
function rootAt(view,x,z,heading=0,bob=0){return new THREE.Matrix4().makeRotationY(heading).setPosition(x,view.groundHeight(x,z)+bob,z);}
function hooves(root){
  const result=[];root.updateMatrixWorld(true);root.traverse(mesh=>{if(!mesh.isMesh||mesh.userData.motion?.type!=='horsehoof')return;
    const p=mesh.geometry.attributes.position,points=[];let low=Infinity;for(let i=0;i<p.count;i++)low=Math.min(low,p.getY(i));for(let i=0;i<p.count;i++)if(p.getY(i)<low+.001)points.push(new THREE.Vector3().fromBufferAttribute(p,i));result.push({mesh,points,index:mesh.userData.motion.legIndex});
  });return result.sort((a,b)=>a.index-b.index);
}

test('all released mounted hooves meet sloped ground while their legs bend and clear it through the stride',async()=>{
  let models=0,contacts=0;
  for(const tier of ['low','balanced','near'])for(const type of ['scout','knight','outrider']){
    const root=(await catalogue(tier)).get('unit:'+type).clone(true),geometries=[];root.traverse(part=>{if(part.isMesh)geometries.push(part.geometry);});
    assert.equal(bindMountedFootRig(root),true);assert.equal(bindMountedFootRig(root),true,'binding is idempotent');let i=0;root.traverse(part=>{if(part.isMesh)assert.equal(part.geometry,geometries[i++],'binding retains the shared source buffers');});
    const feet=hooves(root);assert.equal(feet.length,4);assert.deepEqual(feet.map(foot=>foot.index),[0,1,2,3]);models++;
    for(const [sx,sz]of [[0,0],[.2,-.15],[.35,.12]])for(const heading of [0,.7,Math.PI/2]){
      const gait={phase:0,blend:0,bob:0},view=environment(gait,sx,sz),entity={id:1,kind:'unit',type,hp:100,moving:false},snapshot={...entity};
      for(let step=-1;step<24;step++){
        gait.phase=Math.max(0,step)*Math.PI/12;gait.blend=Number(step>=0);gait.bob=step<0?0:(1-Math.cos(gait.phase*2))*.027;entity.moving=step>=0;
        const matrix=rootAt(view,3,-2,heading,gait.bob),before=matrix.elements.slice(),body=prepareFootPlacement(view,batch,entity,matrix);assert.deepEqual(matrix.elements,before,'rendering cannot mutate the simulation root');beginJointPose(view,entity,body);
        for(const {mesh,points,index}of feet){
          const transform=animatePart(view,mesh,entity,body).clone(),cycle=(gait.phase+([0,3].includes(index)?Math.PI:0))%tau,stance=step<0||cycle<=Math.PI,foot=view.footPoses.get(entity.id).feet[index];
          assert.ok(foot.clamp<1e-5,'the articulated limbs can reach their targets');assert.ok(Math.abs(transform.determinant()-1)<1e-8,'foot transforms remain rigid');
          for(const source of points){const point=source.clone().applyMatrix4(transform),gap=point.y-view.groundHeight(point.x,point.z);assert.ok(gap>=-.001,`${tier}/${type} sole does not sink into the plane`);assert.ok(gap<.18,'swing lift stays bounded');if(stance)assert.ok(gap<.01,'stance hooves remain on the surface');contacts++;}
          if(step>=0&&Math.abs(cycle-Math.PI*1.5)<.01)assert.ok(foot.lift>.15,'swing hooves visibly clear the ground');
        }endJointPose(view);
      }
      entity.moving=snapshot.moving;assert.deepEqual(entity,snapshot,'the simulation unit is unchanged');
    }
  }
  assert.equal(models,9);assert.ok(contacts>30000);
});

test('real travelled distance plants the diagonal stance hooves across frame rates',async()=>{
  const source=(await catalogue('low')).get('unit:knight').clone(true);assert.ok(bindMountedFootRig(source));const feet=hooves(source);
  for(const frames of [120,240]){
    const entity={id:0,kind:'unit',type:'knight',moving:true,hp:100},gait=new UnitLocomotion(),view=environment(null,.2,.1);view.locomotion=gait;gait.update(entity,0,0,0);gait.get(0).blend=1;
    const previous=Array(4).fill(null),heading=.7;
    for(let frame=1;frame<=frames;frame++){
      const distance=CAVALRY_STRIDE*2*frame/frames,x=Math.sin(heading)*distance,z=Math.cos(heading)*distance,state=gait.update(entity,x,z,2/frames),body=prepareFootPlacement(view,batch,entity,rootAt(view,x,z,heading,state.bob));beginJointPose(view,entity,body);
      for(const {mesh,index}of feet){const [side,fore]=positions[index],point=new THREE.Vector3(side,0,fore-.02).applyMatrix4(animatePart(view,mesh,entity,body)),cycle=(state.phase+([0,3].includes(index)?Math.PI:0))%tau,old=previous[index];
        if(cycle<Math.PI&&old?.cycle<Math.PI&&cycle>old.cycle)assert.ok(point.distanceTo(old.point)<1e-5,'a planted hoof does not skate as the unit moves');previous[index]={cycle,point};
      }endJointPose(view);
    }
  }
});

test('stationary mounted poses reuse samples and are dropped when the unit is removed',()=>{
  const gait={phase:1,blend:0,bob:0},view=environment(gait,.2,.1),entity={id:7,type:'knight',hp:100,x:3,z:5},matrix=rootAt(view,3,5),body=prepareFootPlacement(view,batch,entity,matrix);
  assert.equal(view.sampleCount(),4);for(let i=0;i<100;i++)assert.equal(prepareFootPlacement(view,batch,entity,matrix),body);assert.equal(view.sampleCount(),4);assert.equal(view.footDiagnostics.reused,100);
  assert.equal(writeUnitPose(view,batch,entity,matrix,false),false);assert.equal(view.sampleCount(),4);assert.ok(Number.isFinite(visualBodyOffset(view,entity)));
  entity.x=20;assert.equal(visualBodyOffset(view,entity),0,'offscreen relocation never reuses an old body height');entity.x=3;
  view.landscape.grid={};prepareFootPlacement(view,batch,entity,matrix);assert.equal(view.sampleCount(),8,'a new terrain grid invalidates the cached pose');
  const scaled=new THREE.Matrix4().makeScale(2,2,2);assert.equal(prepareFootPlacement(view,batch,entity,scaled),scaled,'portrait and scaled transforms retain their established pose');
  pruneFootPlacements(view,{entities:[]});assert.equal(view.footPoses.size,0);
});

test('incomplete horse rigs do not opt into terrain posing',async()=>{
  const root=(await catalogue('low')).get('unit:scout').clone(true);let removed=false;root.traverse(part=>{if(!removed&&part.userData.motion?.type==='horsehoof'){part.userData.motion={...part.userData.motion,legIndex:8};removed=true;}});
  assert.ok(removed);assert.equal(bindMountedFootRig(root),false);assert.equal(bindMountedFootRig(new THREE.Group()),false);
});

test('mounted hooves follow actual varied terrain and bridge approaches',async()=>{
  const source=(await catalogue('low')).get('unit:knight').clone(true),feet=hooves(source);
  for(const map of ['highlands','winter','canyon','valley','rivers'])for(const segments of [112,160]){
    const land=new Landscape(512,map,160),geometry=land.geometry(land.renderSize,segments),sim=new Simulation({mode:'sandbox',map,seed:512}),gait={phase:0,blend:1,bob:0};
    const view={landscape:land,groundHeight:(x,z)=>land.walkableHeightAt(x,z),locomotion:{get:()=>gait}},entity={id:1,type:'knight',kind:'unit',hp:100,moving:true};
    const points=[[-35,24],[-28,-15],[-15,18],[8,15],[24,-20],[30,30],...(map==='valley'?[[0,0],[-10,0],[10,0]]:map==='rivers'?[[-19,0],[-9,0],[19,0],[29,0]]:[])];let count=0;
    for(const [x,z] of points)if(!sim.isWater(x,z))for(const heading of [0,.8,Math.PI/2])for(let phase=0;phase<16;phase++){
      gait.phase=phase*Math.PI/8;gait.bob=(1-Math.cos(gait.phase*2))*.027;
      const body=prepareFootPlacement(view,batch,entity,rootAt(view,x,z,heading,gait.bob));beginJointPose(view,entity,body);
      for(const foot of feet){const transform=animatePart(view,foot.mesh,entity,body);for(const point of foot.points){const p=point.clone().applyMatrix4(transform),gap=p.y-land.walkableHeightAt(p.x,p.z);assert.ok(gap>=-.02&&gap<.23,`${map}/${segments} hoof gap ${gap}`);count++;}}
      endJointPose(view);
    }
    assert.ok(count>0);geometry.dispose();
  }
});

test('real articulated horse parts share a rigid batch with the terrain-adjusted poses',async()=>{
  const source=(await catalogue('low')).get('unit:knight').clone(true),model=new THREE.Group(),material=new THREE.MeshStandardMaterial(),parts=[];
  source.traverse(part=>{if(part.isMesh&&['horseleg','horseknee','horsehoof'].includes(part.userData.motion?.type)){
    const copy=part.clone();copy.geometry=part.geometry.clone();canonicalGeometry(copy.geometry);copy.material=material;model.add(copy);parts.push(copy);
  }});
  assert.equal(parts.length,12);model.updateMatrixWorld(true);
  const gait={phase:.8,blend:1,bob:.03},view=environment(gait,.2,-.15),entity={id:7,type:'knight',hp:100,moving:true};view.renderer={domElement:new EventTarget()};
  const rigid=createRigidUnitPart(view,model,{capacity:16,renderIds:[entity.id]}),body=prepareFootPlacement(view,batch,entity,rootAt(view,3,-2,.7,gait.bob));
  beginJointPose(view,entity,body);writeRigidPose(rigid,0,entity,body);
  const rig=rigid.userData.rigidRig;assert.equal(rig.joints.length,12);
  for(let i=0;i<parts.length;i++){
    const expected=animatePart(view,parts[i],entity,body).elements;
    for(let j=0;j<16;j++)assert.ok(Math.abs(rig.data[i*16+j]-expected[j])<1e-6,'batched joints match the visible articulated pose');
  }
  endJointPose(view);assert.equal(finishRigidFrame(rigid,1).joints,12);rig.texture.onUpdate();
  const reused=prepareFootPlacement(view,batch,entity,rootAt(view,3,-2,.7,gait.bob));assert.equal(reused,body);
  beginJointPose(view,entity,reused);writeRigidPose(rigid,0,entity,reused);endJointPose(view);assert.equal(finishRigidFrame(rigid,1).uploaded,0,'unchanged poses do not upload again');
  disposeRigidPart(rigid);rigid.geometry.dispose();rigid.dispose();for(const part of parts)part.geometry.dispose();material.dispose();
});
