import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {contactPose,updateContacts} from '../src/visual-depth.js';
import {prepareViewport} from '../src/render-batches.js';
import {LocalMotion} from '../src/motion-smoothing.js';

test('terrain-aligned contact shadows stay attached to moving units while stationary scenery reuses its pose',()=>{
  let samples=0;const view={contactDummy:new THREE.Object3D(),groundHeight:(x,z)=>{samples++;return x*.05+z*.1;}},entity={id:7};
  const first=contactPose(view,entity,3,5,2);const afterFirst=samples;assert.ok(first.matrix.elements.every(Number.isFinite));assert.equal(first.matrix.elements[12],3);assert.equal(first.matrix.elements[14],5);assert.ok(Math.abs(first.matrix.elements[13]-.685)<.0001);
  for(let i=0;i<60;i++)assert.equal(contactPose(view,entity,3,5,2),first);assert.equal(samples,afterFirst,'idle objects do not repeatedly resample static terrain');
  const moved=contactPose(view,entity,4,8,2);assert.notEqual(moved,first);assert.equal(moved.matrix.elements[12],4);assert.equal(moved.matrix.elements[14],8);assert.ok(samples>afterFirst);
  const larger=contactPose(view,entity,4,8,3);assert.notEqual(larger,moved);assert.ok(Math.abs(larger.matrix.determinant())>Math.abs(moved.matrix.determinant()));
  view.contactCache=new Map();view.groundHeight=()=>9;const changedMap=contactPose(view,entity,4,8,3);assert.ok(Math.abs(changedMap.matrix.elements[13]-9.035)<.0001);
});

test('offscreen contacts skip terrain normals and use the current interpolated position on reentry',()=>{
  const unit={id:1,hp:10,owner:0,kind:'unit',type:'spearman',x:0,z:0,r:.5,renderX:-50,renderZ:-50},hidden={...unit,id:2,x:500,renderX:0},sim={entities:[unit,hidden],time:0,get:id=>sim.entities.find(e=>e.id===id),isVisible:()=>true,isExplored:()=>true};
  const camera=new THREE.PerspectiveCamera(45,1,.1,1000);camera.position.set(0,30,40);camera.lookAt(0,0,0);let samples=0;
  const view={sim,camera,clock:0,contactDummy:new THREE.Object3D(),contactShadows:new THREE.InstancedMesh(new THREE.PlaneGeometry(),new THREE.MeshBasicMaterial(),1024),groundHeight:()=>{samples++;return 2;},localMotion:new LocalMotion(),localBlend:.5};
  view.localMotion.capture(sim);unit.x=1;sim.time=.1;view.localMotion.commit(sim);prepareViewport(view);updateContacts(view,false);
  assert.equal(view.contactShadows.count,1);assert.equal(samples,6,'one offscreen height sample, without its four normal samples');assert.deepEqual(view.contactDiagnostics,{visible:1,culled:1,computed:1,reused:0,cached:2,matrixUploadBytes:64});
  const matrix=new THREE.Matrix4();view.contactShadows.getMatrixAt(0,matrix);assert.equal(matrix.elements[12],.5,'shadow uses this frame interpolation, not the previous renderX');
  const version=view.contactShadows.instanceMatrix.version;updateContacts(view,false);assert.equal(samples,6,'stationary visible and offscreen contacts reuse their ground samples');assert.equal(view.contactDiagnostics.reused,1);assert.equal(view.contactDiagnostics.matrixUploadBytes,0);assert.equal(view.contactShadows.instanceMatrix.version,version,'unchanged shadows do not request a GPU upload');
  hidden.x=510;updateContacts(view,false);assert.equal(samples,7,'moving offscreen contacts refresh height without sampling normals');assert.equal(view.contactCache.get(hidden.id).matrix,null);hidden.x=500;
  unit.hp=0;camera.position.set(500,30,40);camera.lookAt(500,0,0);prepareViewport(view);updateContacts(view,false);assert.equal(view.contactShadows.count,1);view.contactShadows.getMatrixAt(0,matrix);assert.equal(matrix.elements[12],500,'newly visible objects receive their complete pose');
  hidden.embarked=true;updateContacts(view,false);assert.equal(view.contactShadows.count,0);
  view.contactShadows.geometry.dispose();view.contactShadows.material.dispose();view.contactShadows.dispose();
});
