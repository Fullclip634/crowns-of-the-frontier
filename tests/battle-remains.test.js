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

test('building destruction scatters solid rubble within an affordable instanced budget',()=>{
  const view=fixture(),pool=new BattleRemains(view);pool.spawn({id:20,owner:0,type:'towncenter',kind:'building',x:3,z:4,r:5});
  view.clock=.45;pool.update();assert.equal(pool.rubble.count,12);assert.equal(view.remainsDiagnostics.drawCalls,1);
  const pose=new THREE.Matrix4();for(let i=0;i<12;i++){pool.rubble.getMatrixAt(i,pose);assert.ok(pose.elements.every(Number.isFinite));assert.ok(pose.determinant()>0);assert.ok(pose.elements[13]>2);}
  view.clock=10.1;pool.update();assert.equal(pool.rubble.count,0);pool.dispose();
});
