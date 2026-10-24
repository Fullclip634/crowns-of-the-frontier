import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs/promises';import * as THREE from 'three';import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';import {MeshoptDecoder} from 'three/addons/libs/meshopt_decoder.module.js';
import {Simulation,distance} from '../src/simulation.js';import {gatheringRange} from '../src/work-ranges.js';import {workingTarget} from '../src/work-activity.js';import {UnitActions} from '../src/unit-actions.js';import {entityPerspective} from '../server/entity-perspective.js';import {bindWorkerToolJoints} from '../src/worker-tool-rig.js';import {animatePart,beginJointPose,endJointPose} from '../src/world-polish.js';import {SpatialBuckets} from '../src/spatial-buckets.js';

function fixture(map='highlands'){const s=new Simulation({mode:'sandbox',map,seed:512});s.entities=[];s.index=new Map();s.grids={};s.revision++;s.visible.fill(1);return s;}
function source(s,style,x=0,z=20){return style==='harvest'?s.addBuilding('farm',0,x,z,true):s.addResource('food',x,z,3000);}

test('berry pickers and farmers walk into reach across fractional cells and approach bearings',()=>{
 const s=fixture();let reached=0;
 for(const style of ['forage','harvest'])for(const x of [0,.5,1,1.5])for(const z of [20,20.5,21,21.5])for(let bearing=0;bearing<8;bearing++){
  s.entities=[];s.index=new Map();s.grids={};s.revision++;
  const food=source(s,style,x,z),a=bearing*Math.PI/4,w=s.addUnit('villager',0,x+Math.sin(a)*10,z+Math.cos(a)*10);s.command([w.id],{type:'gather',target:food.id});assert.equal(workingTarget(s,w),null);
  for(let n=0;n<180&&w.order&&!w.carry;n++){const before={x:w.x,z:w.z};s.tickUnit(w,.1);s.time+=.1;assert.ok(distance(before,w)<=.411,'the final approach walks without teleporting');}
  assert.ok(w.carry>0,`${style} ${x},${z} bearing ${bearing} reaches food`);assert.ok(distance(w,food)<=gatheringRange(w,food)+1e-8);assert.ok(distance(w,food)>(style==='forage'?1.5:2.9));assert.equal(workingTarget(s,w),food);assert.equal(s.events.some(e=>e.type==='order-blocked'&&e.entity.id===w.id),false);reached++;
 }assert.equal(reached,256);
});

test('food work never starts through a continuous hostile wall or unbridged water',()=>{
 for(const style of ['forage','harvest'])for(const barrier of ['wall','water']){
  const s=fixture(barrier==='water'?'coast':'highlands'),food=source(s,style,25,20),w=s.addUnit('villager',0,barrier==='water'?-25:0,20);if(barrier==='wall')for(let z=-79;z<=79;z+=2.85)s.addBuilding('wall',1,12,z,true);w.order={type:'gather',target:food.id};for(let n=0;n<150;n++){s.tickUnit(w,.1);s.time+=.1;}assert.equal(w.carry,0);assert.equal(w.work,0);assert.equal(workingTarget(s,w),null);assert.ok(w.x<(barrier==='water'?0:12));
 }
});

test('AI assignment uses the reachable food approach and older saved approach ranges are refreshed',()=>{
 for(const style of ['forage','harvest'])for(const legacy of [false,true]){
  const initial=fixture(),food=source(initial,style,.75,20.25),w=initial.addUnit('villager',1,food.x,food.z+10);if(style==='harvest')food.owner=1;
  if(legacy){w.order={type:'gather',target:food.id};w.gatherType='food';w.path=[{x:food.x,z:food.z+(style==='forage'?3.1:4.4)}];w.pathStatus='ready';w.pathRevision=initial.revision;w.pathTargetId=food.id;w.pathTargetX=food.x;w.pathTargetZ=food.z;w.pathRange=style==='forage'?3.1:4.4;w.repath=1.5;}
  else{initial.assignWorker(w);assert.equal(w.order?.target,food.id);assert.equal(w.gatherType,'food');}
  const s=Simulation.restore(JSON.parse(JSON.stringify(initial.serialize()))),worker=s.get(w.id);for(let n=0;n<180&&!worker.carry;n++){s.tickUnit(worker,.1);s.time+=.1;}
  assert.ok(worker.carry>0,`${style}, legacy ${legacy} keeps gathering`);assert.ok(distance(worker,s.get(food.id))<=gatheringRange(worker,s.get(food.id)));assert.equal(s.events.some(e=>e.type==='order-blocked'),false);
 }
});

test('human and AI food crews resume saved routes and make repeat deliveries without losing berries',()=>{
 for(const style of ['forage','harvest'])for(const owner of [0,1]){
  const initial=fixture(),food=source(initial,style);food.owner=style==='harvest'?owner:-1;initial.addBuilding('mill',owner,-12,20,true);const bank=initial.players[owner].resources.food;
  const ids=Array.from({length:6},(_,i)=>{const a=i*Math.PI/3,w=initial.addUnit('villager',owner,Math.sin(a)*9,20+Math.cos(a)*9);w.order={type:'gather',target:food.id};w.gatherType='food';initial.tickUnit(w,.1);return w.id;});
  const s=Simulation.restore(JSON.parse(JSON.stringify(initial.serialize()))),crew=ids.map(id=>s.get(id)),buckets=new SpatialBuckets(4);s.unitBuckets=buckets.columns;
  for(let n=0;n<450;n++){buckets.reset();for(const w of crew)buckets.add(w);for(const w of crew)s.tickUnit(w,.1);s.time+=.1;}
  const deposited=s.players[owner].resources.food-bank,carried=crew.reduce((n,w)=>n+w.carry,0);assert.ok(deposited>100);assert.ok(crew.every(w=>w.work>10&&w.order?.target===food.id));assert.equal(s.events.some(e=>e.type==='order-blocked'),false);
  if(style==='forage')assert.ok(Math.abs(3000-s.get(food.id).amount-deposited-carried)<1e-7,'each berry is credited exactly once');
 }
});

test('food subtype is visible only during actual work and observers animate the same pose without private orders',()=>{
 for(const style of ['forage','harvest']){
  const s=fixture(),food=source(s,style),w=s.addUnit('villager',1,0,20+(style==='forage'?1.8:3.15));w.order={type:'gather',target:food.id};w.gatherType='food';w.work=.4;const view={sim:s,clock:4};
  const observed=entityPerspective(s,0,w);assert.equal(observed.working,true);assert.equal(observed.workStyle,style);assert.equal(observed.order,undefined);assert.deepEqual(observed.orders,[]);assert.deepEqual(observed.path,[]);
  const own=new UnitActions().update(view,w,.2),other=new UnitActions().update(view,observed,.2);assert.equal(own.style,style);assert.equal(own.task,'food');assert.deepEqual(other,own);
  for(const change of [{moving:true},{x:100},{hp:0},{embarked:5},{cooldown:.5},{order:{...w.order,returning:true}}]){const e={...w,...change,workStyle:style},hidden=entityPerspective(s,0,e);assert.equal(hidden.working,false);assert.equal(hidden.workStyle,undefined);}
  const actions=new UnitActions();actions.update(view,w,.2);food.amount=0;if(style==='harvest')food.hp=0;for(let n=0;n<20;n++)actions.update(view,w,.1);assert.equal(actions.get(w.id).style,null);assert.equal(actions.get(w.id).task,null);
 }
});

test('released food rigs keep tool grips attached, reach berry height by hand and cut through crop height in every detail tier',async()=>{
 for(const tier of ['low','balanced','near']){
  const bytes=await fs.readFile(new URL('../src/assets3d/frontier-'+tier+'.glb',import.meta.url)),gltf=await new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'');let root;gltf.scene.traverse(n=>{if(n.userData.assetKey==='unit:villager:food')root=n;});const model=root.clone(true);bindWorkerToolJoints(model);model.updateMatrixWorld(true);let left,right,tool;const steel=[];
  model.traverse(p=>{if(p.userData.assetMaterial==='skin'&&p.userData.motion?.type==='forearm'){if(p.userData.motion.side<0)left=p;else right=p;}if(p.userData.motion?.type==='workerTool'){tool=p;if(['steel','iron'].includes(p.userData.assetMaterial))steel.push(p);}});
  const leftGrip=new THREE.Box3().setFromObject(left).getCenter(new THREE.Vector3()),grip=new THREE.Vector3(...tool.userData.motion.pivot),base=new THREE.Matrix4(),e={id:1,type:'villager',moving:false,cooldown:0},state={task:'food',style:'forage',phase:0,blend:1},view={clock:0,unitActions:{get:()=>state}};
  for(const style of ['forage','harvest']){
   state.style=style;let first,last,minimumBlade=Infinity,maximumBlade=-Infinity;const hands=[];
   for(let n=0;n<=200;n++){
    state.phase=n/200;const hp=animatePart(view,right,e,base).clone(),tp=animatePart(view,tool,e,base).clone();assert.ok(grip.clone().applyMatrix4(hp).distanceTo(grip.clone().applyMatrix4(tp))<1e-6);assert.ok(Math.abs(tp.determinant()-1)<1e-6);
    beginJointPose(view,e,base);const cached=animatePart(view,tool,e,base).clone();endJointPose(view);assert.ok(cached.elements.every((v,i)=>Math.abs(v-tp.elements[i])<1e-6));
    if(last)assert.ok(new THREE.Vector3(0,2,0).applyMatrix4(tp).distanceTo(new THREE.Vector3(0,2,0).applyMatrix4(last))<.1,'stroke is continuous');if(!first)first=tp;last=tp;
    if(n===70||n===110)hands.push(leftGrip.clone().applyMatrix4(animatePart(view,left,e,base)));
    if(style==='forage'||n===70||n===110)for(const p of steel){const matrix=animatePart(view,p,e,base).clone().multiply(p.matrixWorld),positions=p.geometry.attributes.position,point=new THREE.Vector3();for(let j=0;j<positions.count;j++){point.fromBufferAttribute(positions,j).applyMatrix4(matrix);minimumBlade=Math.min(minimumBlade,point.y);maximumBlade=Math.max(maximumBlade,point.y);}}
   }
   assert.ok(first.elements.every((v,i)=>Math.abs(v-last.elements[i])<1e-6),'loop closes exactly');
   if(style==='forage'){assert.ok(hands.every(p=>p.y>.8&&p.y<1.2&&p.z>.8&&p.z<1.15),'free hand reaches the fruit band');assert.ok(minimumBlade>.2&&maximumBlade<1.1,'sickle stays down while picking');}
   else assert.ok(minimumBlade>.8&&maximumBlade<1.3,'blade sweeps through the crop head band');
  }
  const geometries=new Set(),materials=new Set();gltf.scene.traverse(p=>{if(p.isMesh){geometries.add(p.geometry);materials.add(p.material);}});for(const value of [...geometries,...materials])value.dispose();
 }
});
