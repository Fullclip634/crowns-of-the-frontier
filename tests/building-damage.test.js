import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {BuildingDamageEffects} from '../src/battle-effects.js';

const building=(ratio,extra={})=>({id:1,kind:'building',type:'house',hp:ratio*100,maxHp:100,progress:1,r:2,...extra});

function setup(t){
  const scene=new THREE.Scene(),effects=new BuildingDamageEffects(scene),node=new THREE.Group();
  const geometry=new THREE.BoxGeometry(3,5,3),material=new THREE.MeshBasicMaterial();
  const roof=new THREE.Mesh(geometry,material);
  roof.position.y=2.5;node.add(roof);
  node.position.set(6,9,-3);
  const render=(entity,dt=.05)=>{
    effects.beginFrame();effects.add(entity,node,2,dt,null,true);effects.endFrame();
  };
  t.after(()=>{effects.dispose();geometry.dispose();material.dispose();});
  return {effects,render,node};
}

function pose(mesh){
  const matrix=new THREE.Matrix4();
  mesh.getMatrixAt(0,matrix);
  return {position:new THREE.Vector3().setFromMatrixPosition(matrix),scale:new THREE.Vector3().setFromMatrixScale(matrix)};
}

test('damage smoke starts below 60% and gets denser before flames appear',t=>{
  const {effects,render}=setup(t);
  render(building(.60));
  assert.equal(effects.smoke.count,0);
  render(building(.55));
  const early=pose(effects.smoke);
  assert.equal(effects.smoke.count,1);
  assert.equal(effects.flames.count,0);
  render(building(.30));
  const later=pose(effects.smoke);
  assert.equal(effects.flames.count,0);
  assert.ok(later.scale.y>early.scale.y);
  assert.ok(Math.abs(later.position.y-13.8)<1e-5,'smoke follows the model roof even above sloped terrain');
});

test('critical fire grows over time and clears when repaired',t=>{
  const {effects,render}=setup(t);
  const e=building(.10);
  render(e);
  assert.equal(effects.flames.count,1);
  const initial=pose(effects.flames).scale.y;
  render(e,.4);
  assert.ok(pose(effects.flames).scale.y>initial*3);
  assert.equal(e.hp,10,'visual effects cannot drain building health');
  render(building(.4));
  assert.equal(effects.flames.count,0);
  assert.equal(effects.smoke.count,1);
  render(building(1));
  assert.deepEqual([effects.flames.count,effects.smoke.count],[0,0]);
  render(e);
  assert.equal(pose(effects.flames).scale.y,initial);
});

test('unfinished and destroyed buildings stay clear, stone walls only smoke',t=>{
  const {effects,render}=setup(t);
  for(const e of [building(.10,{progress:.5}),building(0)]){
    render(e);
    assert.deepEqual([effects.flames.count,effects.smoke.count],[0,0]);
  }
  render(building(.10,{type:'wall'}));
  assert.deepEqual([effects.flames.count,effects.smoke.count],[0,1]);
});

test('a damaged town uses capped batches and uploads only their active instances',t=>{
  const {effects,node}=setup(t);
  effects.beginFrame();
  for(let id=1;id<=100;id++)effects.add(building(.10,{id}),node,2,.05,null,true);
  effects.endFrame();
  assert.deepEqual([effects.flames.count,effects.smoke.count],[80,80]);
  for(const batch of [effects.flames,effects.smoke]){
    assert.equal(batch.material.forceSinglePass,true);
    assert.deepEqual(batch.instanceMatrix.updateRanges,[{start:0,count:80*16}]);
  }
});
