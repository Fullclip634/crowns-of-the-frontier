import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {createRigidUnitPart,writeRigidPose,finishRigidFrame,disposeRigidPart,raycastRigidPart} from '../src/rig-batches.js';
import {animatePart,beginJointPose,endJointPose} from '../src/world-polish.js';

function fixture(){
  const material=new THREE.MeshStandardMaterial(),model=new THREE.Group(),body=new THREE.Mesh(new THREE.BoxGeometry().toNonIndexed(),material),arm=new THREE.Mesh(new THREE.BoxGeometry(.4,.7,.4).toNonIndexed(),material);
  body.geometry.translate(0,1,0);arm.geometry.translate(2,2,0);arm.userData.motion={type:'arm',pivot:[2,2.3,0],side:1,parent:{type:'torso',pivot:[0,1.3,0],side:1}};model.add(body,arm);model.updateMatrixWorld();
  const view={clock:.4,renderer:{domElement:new EventTarget()}},batch={capacity:64,renderIds:[7],ids:[7],free:[]},mesh=createRigidUnitPart(view,model,batch);return {view,batch,mesh,model,material,body,arm};
}
function cleanup(f){disposeRigidPart(f.mesh);f.mesh.geometry.dispose();f.mesh.dispose();f.body.geometry.dispose();f.arm.geometry.dispose();f.material.dispose();}

test('one rigid draw preserves every source vertex and exact nested world poses for both color and shadow passes',()=>{
  const f=fixture(),e={id:7,type:'spearman',moving:true},root=new THREE.Matrix4().makeRotationY(.8).setPosition(10,3,-5);beginJointPose(f.view,e,root);writeRigidPose(f.mesh,0,e,root);endJointPose(f.view);
  const rig=f.mesh.userData.rigidRig,p=f.mesh.geometry.attributes.position;assert.equal(p.count,f.body.geometry.attributes.position.count+f.arm.geometry.attributes.position.count);assert.equal(rig.joints.length,2);
  for(const [index,source]of [f.body,f.arm].entries()){
    const expected=animatePart(f.view,source,e,root).clone(),stored=new THREE.Matrix4().fromArray(rig.data,index*16),range=rig.joints[index];
    for(let vertex=range.start;vertex<range.start+range.count;vertex++){const a=new THREE.Vector3().fromBufferAttribute(p,vertex).applyMatrix4(stored),b=new THREE.Vector3().fromBufferAttribute(p,vertex).applyMatrix4(expected);assert.ok(a.distanceTo(b)<1e-6);}
  }
  const standard={vertexShader:THREE.ShaderLib.standard.vertexShader,fragmentShader:THREE.ShaderLib.standard.fragmentShader,uniforms:{}},depth={vertexShader:THREE.ShaderLib.depth.vertexShader,fragmentShader:THREE.ShaderLib.depth.fragmentShader,uniforms:{}};
  f.mesh.material.onBeforeCompile(standard);f.mesh.customDepthMaterial.onBeforeCompile(depth);assert.equal(standard.uniforms.frontierRigPoses,depth.uniforms.frontierRigPoses);assert.equal(standard.uniforms.frontierRigPoses.value,rig.texture);
  cleanup(f);
});

test('pose texture grows with visible rows, retains existing data and disposes replaced and final resources',()=>{
  const f=fixture(),e={id:7,type:'spearman',moving:false},root=new THREE.Matrix4().makeTranslation(4,2,1),rig=f.mesh.userData.rigidRig;let replaced=0,disposed=0;rig.texture.addEventListener('dispose',()=>replaced++);
  writeRigidPose(f.mesh,0,e,root);const before=rig.data.slice(0,32);writeRigidPose(f.mesh,18,e,new THREE.Matrix4().makeTranslation(-5,3,2));assert.equal(replaced,1);assert.equal(rig.rows,32);assert.deepEqual(rig.data.slice(0,32),before);
  assert.deepEqual(finishRigidFrame(f.mesh,19),{used:19*2*64,uploaded:32*2*64,capacity:32*2*64,joints:2});assert.equal(finishRigidFrame(f.mesh,0).uploaded,0);
  rig.texture.addEventListener('dispose',()=>disposed++);cleanup(f);disposeRigidPart(f.mesh);assert.equal(disposed,1);
});

test('raycasting follows stored articulated poses and packed IDs after repacking instead of the bind pose',()=>{
  const f=fixture(),e={id:7,type:'spearman',moving:true},root=new THREE.Matrix4().makeTranslation(10,1,20);writeRigidPose(f.mesh,0,e,root);f.mesh.count=1;f.mesh.updateMatrixWorld();
  const rig=f.mesh.userData.rigidRig,pose=new THREE.Matrix4().fromArray(rig.data,16),center=new THREE.Vector3(2,2,0).applyMatrix4(pose),ray=new THREE.Raycaster(center.clone().add(new THREE.Vector3(0,0,10)),new THREE.Vector3(0,0,-1)),hits=[];
  raycastRigidPart(f.mesh,ray,hits);assert.ok(hits.length>0);assert.ok(hits.every(hit=>hit.instanceId===0&&hit.object===f.mesh));assert.deepEqual(f.mesh.geometry.drawRange,{start:0,count:Infinity});
  f.batch.renderIds[0]=11;writeRigidPose(f.mesh,0,{...e,id:11},new THREE.Matrix4().makeTranslation(-30,1,20));const repacked=[];raycastRigidPart(f.mesh,ray,repacked);assert.equal(repacked.length,0,'old matrix rows cannot select a unit that has moved away');cleanup(f);
});

test('unchanged poses skip uploads while moved and repacked rows update color and shadow data exactly',()=>{
  const f=fixture(),rig=f.mesh.userData.rigidRig,e={id:7,type:'spearman',moving:false},root=new THREE.Matrix4().makeTranslation(4.1,2,1);
  writeRigidPose(f.mesh,0,e,root);assert.equal(finishRigidFrame(f.mesh,1).uploaded,16*2*64);
  rig.texture.onUpdate();const version=rig.texture.version;
  writeRigidPose(f.mesh,0,e,root);assert.equal(finishRigidFrame(f.mesh,1).uploaded,0);assert.equal(rig.texture.version,version,'Float32 rounding does not turn an unchanged pose into an upload');
  writeRigidPose(f.mesh,3,{...e,id:11},root.clone().setPosition(8,2,1));
  assert.equal(finishRigidFrame(f.mesh,4).uploaded,2*64);assert.deepEqual(rig.texture.updateRanges,[{start:3*2*16,count:2*16}]);
  // A skipped draw must keep its pending row when the next field frame writes a
  // different row; clearing the request before the GPU consumed it loses poses.
  writeRigidPose(f.mesh,0,e,root.clone().setPosition(6,2,1));assert.equal(finishRigidFrame(f.mesh,4).uploaded,2*2*64);
  assert.deepEqual(rig.texture.updateRanges,[{start:3*2*16,count:2*16},{start:0,count:2*16}]);
  rig.texture.onUpdate();writeRigidPose(f.mesh,0,e,root.clone().setPosition(8,2,1));assert.equal(finishRigidFrame(f.mesh,1).uploaded,2*64);
  assert.equal(rig.data[12],8);assert.equal(rig.roots[12],8);cleanup(f);
});

test('a restored graphics context uploads the complete pose texture and disposal removes its listener',()=>{
  const f=fixture(),rig=f.mesh.userData.rigidRig;
  writeRigidPose(f.mesh,0,{id:7,type:'spearman'},new THREE.Matrix4());finishRigidFrame(f.mesh,1);rig.texture.onUpdate();
  f.view.renderer.domElement.dispatchEvent(new Event('webglcontextrestored'));assert.equal(finishRigidFrame(f.mesh,1).uploaded,rig.data.byteLength);assert.deepEqual(rig.texture.updateRanges,[]);cleanup(f);
  const version=rig.texture.version;f.view.renderer.domElement.dispatchEvent(new Event('webglcontextrestored'));assert.equal(rig.texture.version,version,'Disposed rigs release the context listener');
});
