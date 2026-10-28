import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {beginUnitFrame,writeUnitPose,endUnitFrame,nearViewport,installRenderFrame} from '../src/render-batches.js';
import {animatePart} from '../src/world-polish.js';

test('joint pivot optimization matches independent translated rotations with nested and scaled roots',()=>{
  const parent={type:'sail',pivot:[.4,1.7,-.2],side:1},child={type:'oar',pivot:[-1.2,.8,.6],side:-1,parent},part={userData:{motion:child}},entity={id:9,moving:true,type:'galley'},view={clock:0};
  for(let frame=0;frame<60;frame++){
    view.clock=frame*.017;const root=new THREE.Matrix4().compose(new THREE.Vector3(13,2,-8),new THREE.Quaternion().setFromEuler(new THREE.Euler(.1,.8,-.2)),new THREE.Vector3(1.3,.8,1.1)),expected=root.clone();
    for(const [joint,angle]of [[parent,Math.sin(view.clock*1.5+entity.id)*.035],[child,Math.sin(view.clock*3+entity.id)*.18*child.side]])expected.multiply(new THREE.Matrix4().makeTranslation(...joint.pivot)).multiply(new THREE.Matrix4().makeRotationX(angle)).multiply(new THREE.Matrix4().makeTranslation(...joint.pivot.map(n=>-n)));
    const actual=animatePart(view,part,entity,root);for(let i=0;i<16;i++)assert.ok(Math.abs(actual.elements[i]-expected.elements[i])<1e-12);
  }
});

test('unit poses pack visible IDs despite freed slots, fog and embarked troops',()=>{
  const camera=new THREE.PerspectiveCamera(45,1,.1,200);camera.position.set(0,30,40);camera.lookAt(0,0,0);
  const batch={ids:[41,null,73,84],free:[1],renderIds:[],parts:[new THREE.InstancedMesh(new THREE.BoxGeometry(),new THREE.MeshBasicMaterial(),10)]};
  batch.parts[0].userData.unitIds=batch.renderIds;
  batch.parts[0].geometry.setAttribute('instanceOwner',new THREE.InstancedBufferAttribute(new Float32Array(10),1));
  const view={camera,unitBatches:new Map([['troops',batch]]),clock:1};
  beginUnitFrame(view);
  assert.ok(nearViewport(view,0,0,0));assert.equal(nearViewport(view,800,0,0),false);
  assert.ok(writeUnitPose(view,batch,{id:73,owner:7},new THREE.Matrix4().makeTranslation(2,0,0),true));
  assert.equal(writeUnitPose(view,batch,{id:41},new THREE.Matrix4(),false),false);
  assert.equal(writeUnitPose(view,batch,{id:84},new THREE.Matrix4().makeTranslation(800,0,0),true),false);
  endUnitFrame(view);
  assert.deepEqual(batch.parts[0].userData.unitIds,[73]);assert.equal(batch.parts[0].count,1);
  assert.equal(batch.parts[0].geometry.attributes.instanceOwner.getX(0),7);
  assert.deepEqual(batch.parts[0].instanceMatrix.updateRanges,[{start:0,count:16}]);
  const owner=batch.parts[0].geometry.attributes.instanceOwner;assert.deepEqual(owner.updateRanges,[{start:0,count:1}]);const version=owner.version;
  const pose=new THREE.Matrix4();batch.parts[0].getMatrixAt(0,pose);assert.equal(pose.elements[12],2);
  assert.deepEqual(batch.ids,[41,null,73,84]);assert.equal(view.unitRenderDiagnostics.allocated,3);
  beginUnitFrame(view);writeUnitPose(view,batch,{id:73,owner:7},new THREE.Matrix4().makeTranslation(3,0,0),true);endUnitFrame(view);assert.equal(owner.version,version,'unchanged ownership does not upload every frame');
  beginUnitFrame(view);endUnitFrame(view);assert.equal(batch.parts[0].count,0);assert.equal(batch.parts[0].visible,false);
  beginUnitFrame(view);writeUnitPose(view,batch,{id:41},new THREE.Matrix4(),true);endUnitFrame(view);
  assert.equal(batch.parts[0].visible,true);assert.deepEqual(batch.renderIds,[41]);
  assert.equal(owner.getX(0),0);assert.ok(owner.version>version,'repacking a different owner refreshes team color');
});

test('render extensions see the fresh camera frustum and a shared timestamp on immediate pans',()=>{
  class View{render(){return {origin:nearViewport(this,0,0,0,4),destination:nearViewport(this,500,0,0,4),at:this.renderFrameAt};}}
  installRenderFrame(View);const view=new View();view.camera=new THREE.PerspectiveCamera(45,1,.1,1000);view.camera.position.set(0,30,40);view.camera.lookAt(0,0,0);
  const first=view.render(.016);assert.equal(first.origin,true);assert.equal(first.destination,false);assert.ok(Number.isFinite(first.at));
  view.camera.position.set(500,30,40);view.camera.lookAt(500,0,0);const second=view.render(.016);assert.equal(second.origin,false);assert.equal(second.destination,true);assert.ok(second.at>=first.at);
});

test('shader preparation holds the complete render pipeline and releases warmed programs after the live frame',()=>{
  const events=[];class View{render(){events.push('draw');return 42;}}installRenderFrame(View);
  const view=new View();view.camera=new THREE.PerspectiveCamera();view.graphicsRebuilding=1;view.graphicsProgramReleases=[()=>events.push('release')];
  assert.equal(view.render(.016),false);assert.deepEqual(events,[]);assert.equal(view.frameFrustum,undefined);
  view.graphicsRebuilding=null;assert.equal(view.render(.016),42);assert.deepEqual(events,['draw','release']);view.render(.016);assert.deepEqual(events,['draw','release','draw']);assert.deepEqual(view.graphicsProgramReleases,[]);
});

test('shared torso and limb poses retain exact animation while reusing prefixes only within one unit',()=>{
  const torso={type:'torso',pivot:[0,1,0],side:1},arm={type:'arm',pivot:[.4,1.7,0],side:1,parent:torso};
  const definitions=[torso,arm,{type:'forearm',pivot:[.45,1.3,.1],side:1,parent:arm},{type:'head',pivot:[0,1.9,0],side:1,parent:torso}];
  const parts=definitions.map(motion=>{const part=new THREE.InstancedMesh(new THREE.BoxGeometry(),new THREE.MeshBasicMaterial(),4);part.userData.motion=structuredClone(motion);return part;});
  const camera=new THREE.PerspectiveCamera(45,1,.1,200);camera.position.set(0,30,40);camera.lookAt(0,0,0);
  const batch={ids:[1,2],free:[],renderIds:[],parts},view={camera,unitBatches:new Map([['workers',batch]]),clock:.4};beginUnitFrame(view);
  for(const [index,entity]of [{id:1,type:'villager',owner:0,moving:false,order:{type:'gather'},carryType:'wood'},{id:2,type:'swordsman',owner:1,moving:false,cooldown:.6}].entries()){
    const root=new THREE.Matrix4().makeRotationY(index*.8).setPosition(index*3,2,1);writeUnitPose(view,batch,entity,root,true);
    for(const part of parts){const cached=new THREE.Matrix4();part.getMatrixAt(index,cached);const uncached=animatePart(view,part,entity,root).clone();for(let i=0;i<16;i++)assert.ok(Math.abs(cached.elements[i]-uncached.elements[i])<1e-6,'cached animation matches each unit and action');}
  }
  assert.equal(view.jointPoseEntity,null);assert.ok(view.jointPoseDiagnostics.reused>=6);assert.equal(view.jointPoseCache.size,4,'cache stores joint definitions, not an ever-growing unit history');
  const before=parts[2].instanceMatrix.array.slice(0,16);view.clock=.8;beginUnitFrame(view);writeUnitPose(view,batch,{id:1,type:'villager',moving:false,order:{type:'build'}},new THREE.Matrix4(),true);assert.notDeepEqual(parts[2].instanceMatrix.array.slice(0,16),before);
  for(const part of parts){part.geometry.dispose();part.material.dispose();part.dispose();}
});
