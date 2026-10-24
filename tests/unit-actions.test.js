import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import * as THREE from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {MeshoptDecoder} from 'three/addons/libs/meshopt_decoder.module.js';
import {UnitActions,workTarget} from '../src/unit-actions.js';
import {bindWorkerToolJoints} from '../src/worker-tool-rig.js';
import {animatePart,beginJointPose,endJointPose} from '../src/world-polish.js';
import {entityPerspective} from '../server/entity-perspective.js';

function fixture(){const resource={id:2,type:'wood',kind:'resource',amount:100,hp:1,x:0,z:2.05,r:1.1},unit={id:1,type:'villager',kind:'unit',owner:1,hp:40,x:0,z:0,r:.65,work:.4,order:{type:'gather',target:2},carry:2},sim={time:.4,get:id=>id===2?resource:id===1?unit:null};return {resource,unit,sim,view:{sim,clock:4},actions:new UnitActions()};}
test('work actions start only at a live resource or unfinished building and fade when work stops',()=>{
  const f=fixture(),{unit,resource,view,actions}=f;assert.equal(workTarget(view,unit),resource);assert.equal(actions.update(view,unit,.2).task,'wood');
  for(const change of [{moving:true},{x:100},{hp:0},{embarked:1},{order:{type:'gather',target:2,returning:true}},{cooldown:.5}])assert.equal(workTarget(view,{...unit,...change}),null);
  resource.amount=0;assert.equal(workTarget(view,unit),null);resource.type='house';resource.kind='building';resource.progress=.5;resource.maxHp=100;unit.order={type:'build',target:2};assert.equal(workTarget(view,unit),null);resource.z=2.68;assert.equal(actions.update(view,unit,.2).task,'build');
  resource.progress=1;resource.hp=100;assert.equal(workTarget(view,unit),null);for(let i=0;i<20;i++)actions.update(view,unit,.1);assert.equal(actions.get(unit.id).task,null);
  unit.carry=10;unit.moving=true;assert.equal(actions.update(view,unit,.2).task,'carry');unit.carry=0;unit.type='monk';unit.moving=false;unit.cooldown=1;assert.equal(actions.update(view,unit,.2).task,'heal');
  actions.prune({get:()=>null});assert.equal(actions.states.size,0);
});

test('observed workers retain the same visible work phase without exposing their targets or orders',()=>{
  const {unit,sim,view}=fixture(),local=new UnitActions(),remote=new UnitActions();unit.gatherType='wood';const observed=entityPerspective(sim,0,unit);
  assert.equal(observed.working,true);assert.equal(observed.activity,'gather');assert.equal(observed.order,undefined);assert.deepEqual(observed.orders,[]);
  assert.deepEqual(remote.update(view,observed,.1),local.update(view,unit,.1));unit.order.returning=true;assert.equal(entityPerspective(sim,0,unit).working,false);
});

test('large combat armies retain no work states and changing a unit role clears its old action',()=>{
  const {unit,view,actions}=fixture();actions.update(view,unit,.1);assert.equal(actions.states.size,1);
  assert.equal(actions.update(view,{...unit,type:'swordsman'},.1),null);assert.equal(actions.states.size,0);
  for(let id=1;id<=1280;id++)actions.update(view,{id,type:id%2?'knight':'archer',moving:true},1/60);assert.equal(actions.states.size,0);
});

test('visible gold and stone miners share their close-range animation with observers without exposing commands',()=>{
  for(const type of ['gold','stone']){
    const {unit,resource,sim,view}=fixture();resource.type=type;resource.r=1.7;resource.z=2.75;unit.gatherType=type;
    const local=new UnitActions(),remote=new UnitActions(),observed=entityPerspective(sim,0,unit);
    assert.equal(observed.working,true);assert.equal(observed.order,undefined);assert.deepEqual(observed.orders,[]);
    const own=local.update(view,unit,.2),other=remote.update(view,observed,.2);assert.equal(own.task,'mine');assert.deepEqual(other,own);
    resource.z=3.1;assert.equal(workTarget(view,unit),null);assert.equal(entityPerspective(sim,0,unit).working,false);
  }
});

test('Blender tool grips stay attached to the hands through chopping, mining and construction in all detail tiers',async()=>{
  for(const tier of ['near','balanced','low']){
    const bytes=await fs.readFile(new URL('../src/assets3d/frontier-'+tier+'.glb',import.meta.url)),gltf=await new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'');
    const roots=new Map();gltf.scene.traverse(node=>{if(node.userData.assetKey)roots.set(node.userData.assetKey,node);});
    for(const task of ['wood','mine','build','food']){
      const source=roots.get('unit:villager:'+task),model=source.clone(true),before=[];source.traverse(part=>{if(part.userData.motion)before.push(structuredClone(part.userData.motion));});assert.ok(bindWorkerToolJoints(model)>=2);assert.equal(bindWorkerToolJoints(model),0,'binding is idempotent');
      let hand,tool;model.traverse(part=>{if(part.userData.assetMaterial==='skin'&&part.userData.motion?.type==='forearm'&&part.userData.motion.side>0)hand=part;if(part.userData.motion?.type==='workerTool')tool=part;});assert.ok(hand&&tool);
      const grip=new THREE.Vector3(...tool.userData.motion.pivot),e={id:1,type:'villager',moving:false,cooldown:0},state={task,blend:1,phase:0},view={clock:0,unitActions:{get:()=>state}},root=new THREE.Matrix4().makeRotationY(.7).setPosition(3,1,-8);let last;
      for(const phase of [0,.4,.58,.75,1]){
        state.phase=phase;const handPose=animatePart(view,hand,e,root).clone(),toolPose=animatePart(view,tool,e,root).clone();assert.ok(grip.clone().applyMatrix4(handPose).distanceTo(grip.clone().applyMatrix4(toolPose))<1e-6,'the wrist rotation does not detach the tool');assert.ok(Math.abs(toolPose.determinant()-1)<1e-6);
        beginJointPose(view,e,root);const cached=animatePart(view,tool,e,root).clone();endJointPose(view);assert.ok(cached.elements.every((value,index)=>Math.abs(value-toolPose.elements[index])<1e-6));if(last)assert.notDeepEqual(toolPose.elements,last);last=toolPose.elements;
      }
      const after=[];source.traverse(part=>{if(part.userData.motion)after.push(part.userData.motion);});assert.deepEqual(after,before,'shared Blender templates remain untouched');
    }
    const geometries=new Set(),materials=new Set();gltf.scene.traverse(part=>{if(part.isMesh){geometries.add(part.geometry);materials.add(part.material);}});for(const value of [...geometries,...materials])value.dispose();
  }
});
