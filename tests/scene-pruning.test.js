import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {WorldView} from '../src/world.js';

function fixture(sim){
  const objects=new THREE.Group(),batch={ids:[1,2,3],free:[]},nodes=new Map(),released=[];
  for(let index=0;index<3;index++){const node=new THREE.Group();node.userData={entity:index+1,batch,index};objects.add(node);nodes.set(index+1,node);}
  return {sim,objects,batch,nodes,released,releaseNode:node=>released.push(node.userData.entity)};
}

test('snapshot indexes remove dead and missing visuals without scanning the full entity array',()=>{
  const sim={get entities(){throw Error('Snapshot already has its authoritative index');}},living={id:1,hp:20},dead={id:2,hp:0},index=new Map([[1,living],[2,dead]]),view=fixture(sim);
  WorldView.prototype.pruneMissing.call(view,index);
  assert.deepEqual([...view.nodes.keys()],[1]);assert.deepEqual(view.released,[2,3]);assert.deepEqual(view.batch.ids,[1,null,null]);assert.deepEqual(view.batch.free,[1,2]);assert.equal(view.objects.children.length,1);
  WorldView.prototype.pruneMissing.call(view,index);assert.deepEqual(view.batch.free,[1,2],'repeated packets cannot free an allocation twice');assert.equal(index.get(2),dead);assert.equal(index.size,2);
});

test('callers without a snapshot index retain entity-list cleanup semantics',()=>{
  const view=fixture({entities:[{id:1,hp:20},{id:2,hp:0}],index:new Map([[3,{id:3,hp:20}]])});
  WorldView.prototype.pruneMissing.call(view);assert.deepEqual([...view.nodes.keys()],[1]);assert.deepEqual(view.released,[2,3]);assert.deepEqual(view.batch.free,[1,2]);
});
