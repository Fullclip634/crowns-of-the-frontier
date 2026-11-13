import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {WorldView} from '../src/world.js';
import {BattleRemains} from '../src/battle-remains.js';

function fixture(){
  const geometry=new THREE.BoxGeometry(.7,2,.4),material=new THREE.MeshStandardMaterial({color:0x397f8c});
  const view={clock:0,scene:new THREE.Scene(),settings:{quality:'low'},sim:{entities:[],isVisible:()=>true},groundHeight:()=>2,materials:{},
    makeUnit(){const group=new THREE.Group(),mesh=new THREE.Mesh(geometry,material);mesh.position.y=1;group.add(mesh);return group;},
    mergeModel:WorldView.prototype.mergeModel,releaseNode(model){model.traverse(mesh=>mesh.geometry?.dispose());}};
  return view;
}

test('fallen units stay volumetric and colored with a bounded lifetime, without entering gameplay state',()=>{
  const view=fixture(),pool=new BattleRemains(view),e={id:1,owner:0,type:'swordsman',kind:'unit',x:3,z:4,heading:.4};
  pool.spawn(e);pool.spawn(e);assert.equal(pool.items.length,1);assert.equal(view.sim.entities.length,0);
  const batch=[...pool.batches.values()][0];assert.ok(batch.mesh.geometry.attributes.color.array.some(color=>color>0&&color<1));
  pool.update();const a=new THREE.Matrix4();batch.mesh.getMatrixAt(0,a);view.clock=.7;pool.update();const b=new THREE.Matrix4();batch.mesh.getMatrixAt(0,b);assert.notDeepEqual(a.elements,b.elements);assert.ok(Math.abs(b.determinant()-1)<.001);
  for(let i=2;i<20;i++)pool.spawn({...e,id:i});pool.update();assert.equal(pool.items.length,8);assert.equal(batch.mesh.count,8);assert.equal(view.remainsDiagnostics.drawCalls,1);
  view.sim.isVisible=()=>false;pool.spawn({...e,id:99,owner:1});assert.equal(pool.items.length,8);
  view.clock=11;pool.update();assert.equal(batch.mesh.count,0);assert.equal(view.remainsDiagnostics.retained,0);pool.dispose();assert.equal(view.scene.children.length,0);
});

test('building destruction spawns collapsed stone piers, charred timbers, and rubble without leaving an intact house shell',()=>{
  const view=fixture(),geometry=new THREE.BoxGeometry(4,6,4),material=new THREE.MeshStandardMaterial({color:0x9b9c8e});
  view.structureByEntity=new Map([[20,{geometry,material}],[21,{geometry,material}]]);
  const pool=new BattleRemains(view);
  pool.spawn({id:20,owner:0,type:'towncenter',kind:'building',x:3,z:4,r:5,heading:.3});
  assert.equal(view.structureByEntity.has(20),false,'registry entry is released immediately');
  assert.equal(pool.items[0].shell,undefined,'destroyed buildings never retain a squashed intact-house shell mesh');
  assert.equal(pool.group.children.length,3,'only shared rubble, piers, and timbers instanced pools are mounted');

  view.clock=.45;pool.update();
  assert.equal(pool.rubble.count,17);
  assert.ok(pool.piers.count>=5&&pool.piers.count<=8,'foundation pad plus perimeter stone piers are instanced');
  assert.ok(pool.timbers.count>=3&&pool.timbers.count<=5,'charred rafters are instanced across the ruin');
  assert.equal(view.remainsDiagnostics.drawCalls,3);

  const pose=new THREE.Matrix4();
  for(const mesh of [pool.rubble,pool.piers,pool.timbers]){
    for(let i=0;i<mesh.count;i++){mesh.getMatrixAt(i,pose);assert.ok(pose.elements.every(Number.isFinite));assert.ok(pose.determinant()>0);}
  }

  // After settling (2s) vs final fade-out window (11.75s), pieces sink and shrink smoothly.
  view.clock=2;pool.update();
  const settledPose=new THREE.Matrix4();pool.piers.getMatrixAt(1,settledPose);
  view.clock=11.75;pool.update();
  const sinkingPose=new THREE.Matrix4();pool.piers.getMatrixAt(1,sinkingPose);
  assert.ok(sinkingPose.elements[13]<settledPose.elements[13],'piers sink beneath ground during fade-out');

  // Everything vanishes cleanly by 13s instead of lingering for 150s.
  view.clock=13.1;pool.update();
  assert.equal(pool.rubble.count,0);assert.equal(pool.piers.count,0);assert.equal(pool.timbers.count,0);
  assert.equal(view.remainsDiagnostics.retained,0);assert.equal(view.remainsDiagnostics.drawCalls,0);

  // Off-viewport deaths still release cached structure entries without leaking remains.
  view.sim.isVisible=()=>false;
  pool.spawn({id:21,owner:1,type:'house',kind:'building',x:99,z:99,r:2});
  assert.equal(view.structureByEntity.has(21),false);
  assert.equal(pool.items.length,0);
  pool.dispose();assert.equal(view.scene.children.length,0);
});

test('building death effect in WorldView syncs burnt crater duration to ruin lifetime',()=>{
  const captured=[];
  const mockView={
    fx:[],settings:{quality:'high'},renderQuality:'high',scene:new THREE.Scene(),groundHeight:()=>1.5,
    burst(){},sparks(){},smoke(){},
    crater(x,z,size,duration){captured.push({x,z,size,duration});}
  };
  WorldView.prototype.effect.call(mockView,{type:'death',entity:{id:44,kind:'building',type:'house',x:10,z:12,r:2.2}});
  assert.equal(captured.length,1);
  assert.equal(captured[0].duration,13);
});
