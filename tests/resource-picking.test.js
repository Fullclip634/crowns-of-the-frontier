import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {pickFruitVolume} from '../src/resource-picking.js';
import {WorldView} from '../src/world.js';

test('fruit hit volumes fill foliage gaps, choose the nearest cluster and never expose hidden resources',()=>{
  const near={id:1,kind:'resource',type:'food',hp:1,r:1.7,x:0,z:0},far={...near,id:2,z:-4},nodes=new Map();
  for(const e of [near,far]){const node=new THREE.Object3D();node.position.set(e.x,1,e.z);nodes.set(e.id,node);}
  let visible=true;const view={sim:{entities:[far,near],isVisible:()=>visible},nodes,raycaster:{ray:new THREE.Ray(new THREE.Vector3(0,1.7,6),new THREE.Vector3(0,0,-1))}};
  assert.equal(pickFruitVolume(view),near);nodes.get(1).visible=false;assert.equal(pickFruitVolume(view),far);visible=false;assert.equal(pickFruitVolume(view),null);
  visible=true;far.water=true;assert.equal(pickFruitVolume(view),null);far.water=false;far.hp=0;assert.equal(pickFruitVolume(view),null);
});
test('existing solid foreground picking takes priority over a fruit fallback',()=>{
  const building={id:3,owner:0,kind:'building'},view={groundPoint:()=>{},objects:{children:[]},sim:{get:()=>building},raycaster:{intersectObjects:()=>[{object:{userData:{entity:3}}}]}};
  assert.equal(WorldView.prototype.pick.call(view,10,10),building);
});
