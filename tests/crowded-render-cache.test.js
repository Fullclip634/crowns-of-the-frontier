import test from 'node:test';import assert from 'node:assert/strict';import * as THREE from 'three';
import {entityGroundHeight} from '../src/entity-ground.js';
import {animateSceneDecorations} from '../src/scene-animation.js';

test('repeated authoritative and interpolated ground samples are shared and terrain changes invalidate them',()=>{
  let calls=0;const entity={},view={sim:{},landscape:{grid:{}},groundHeight:(x,z)=>{calls++;return x+z;}};
  for(let frame=0;frame<60;frame++){assert.equal(entityGroundHeight(view,entity,2,3),5);assert.equal(entityGroundHeight(view,entity,2.5,3.5),6);}
  assert.equal(calls,2);view.landscape.grid={};assert.equal(entityGroundHeight(view,entity,2,3),5);assert.equal(calls,3);
  view.sim={};entityGroundHeight(view,entity,2,3);assert.equal(calls,4);entityGroundHeight(view,entity,4,5);assert.equal(calls,5);
});

test('cached building decorations preserve animation while avoiding repeated model walks',()=>{
  const root=new THREE.Group(),flag=new THREE.Group(),mill=new THREE.Group(),gold=new THREE.MeshBasicMaterial(),shrine=new THREE.Mesh(new THREE.BoxGeometry(),gold);flag.userData.flag=true;mill.userData.windmill=true;root.add(flag,mill,shrine);
  let traversals=0;const traverse=root.traverse.bind(root);root.traverse=fn=>{traversals++;return traverse(fn);};const view={clock:0,materials:{gold}},entity={id:7,kind:'shrine',type:'mill'};
  for(let i=0;i<60;i++){view.clock=i*.016;animateSceneDecorations(view,root,entity);assert.equal(flag.rotation.y,Math.sin(view.clock*2+7)*.08);assert.equal(mill.rotation.z,view.clock*.4);assert.equal(shrine.position.y,Math.sin(view.clock*1.4)*.22);}
  assert.equal(traversals,1);shrine.geometry.dispose();gold.dispose();
});
