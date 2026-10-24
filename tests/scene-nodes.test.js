import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {prepareViewport} from '../src/render-batches.js';
import {sceneNodeFor,sceneNodeNear} from '../src/scene-nodes.js';

function fixture(){
  const camera=new THREE.PerspectiveCamera(45,16/9,.1,2500),objects=new THREE.Group(),released=[];
  const view={camera,objects,nodes:new Map(),selection:new Set(),clock:0,settings:{quality:'high'},entityHeight:()=>0,releaseNode:node=>released.push(node.userData.entity)};
  view.createNode=entity=>{const node=new THREE.Group();node.userData.entity=entity.id;node.userData.detail=view.settings.quality;objects.add(node);view.nodes.set(entity.id,node);return node;};
  const look=(x,z)=>{camera.position.set(x,30,z+40);camera.lookAt(x,0,z);camera.updateProjectionMatrix();prepareViewport(view);};look(0,0);return {view,look,released};
}

test('a revealed large battlefield loads local visuals and creates the same full-detail nodes after a camera jump',()=>{
  const {view,look}=fixture(),entities=[{id:1,kind:'building',type:'towncenter',hp:2000,x:0,z:0,r:5},{id:2,kind:'unit',type:'spearman',hp:100,x:8,z:3,r:.65},{id:3,kind:'resource',type:'gold',hp:1,x:-8,z:4,r:1.7},...Array.from({length:2000},(_,index)=>({id:index+4,kind:'building',type:'house',hp:1000,x:500+index%20*10,z:500+Math.floor(index/20)*10,r:2.3}))],saved=JSON.stringify(entities);
  for(const entity of entities)sceneNodeFor(view,entity,true);assert.equal(view.nodes.size,3,'revealed offscreen towns must not allocate their visual models at match start');
  look(500,500);for(const entity of entities)sceneNodeFor(view,entity,true);
  assert.ok(view.nodes.has(4));assert.equal(view.nodes.get(4).userData.detail,'high');assert.ok(view.nodes.size<entities.length/4);
  assert.equal(JSON.stringify(entities),saved,'visual residency must not edit the battle');assert.equal(view.settings.quality,'high');
});

test('distant visuals are released after a delay and unit allocation slots are returned exactly once',()=>{
  const {view,look,released}=fixture(),entity={id:1,kind:'unit',type:'spearman',hp:100,x:0,z:0,r:.65},node=sceneNodeFor(view,entity,true),batch={ids:[1],free:[]};node.userData.batch=batch;node.userData.index=0;
  look(500,500);assert.equal(sceneNodeFor(view,entity,true),null);assert.equal(node.visible,false);assert.equal(view.nodes.has(1),true);
  view.clock=7;sceneNodeFor(view,entity,true);assert.deepEqual(batch.free,[]);
  view.clock=9;sceneNodeFor(view,entity,true);assert.equal(view.nodes.has(1),false);assert.deepEqual(batch.ids,[null]);assert.deepEqual(batch.free,[0]);assert.deepEqual(released,[1]);assert.equal(view.objects.children.length,0);
  sceneNodeFor(view,entity,true);assert.deepEqual(batch.free,[0]);look(0,0);assert.ok(sceneNodeFor(view,entity,true));
});

test('fog and transport visibility, nearby shadow casters, and selected-unit state survive visual residency',()=>{
  const {view,look}=fixture(),unit={id:1,kind:'unit',type:'spearman',hp:100,x:0,z:0,r:.65};
  assert.equal(sceneNodeFor(view,unit,false),null);unit.embarked=true;assert.equal(sceneNodeFor(view,unit,true),null);unit.embarked=false;const node=sceneNodeFor(view,unit,true);
  assert.equal(sceneNodeNear(view,{kind:'building',x:60,z:0,r:5}),true,'nearby shadow casters receive a generous preload margin');
  unit.renderX=-100;unit.renderZ=-100;view.selection.add(1);look(500,500);sceneNodeFor(view,unit,true);assert.equal(unit.renderX??unit.x,unit.x);assert.equal(unit.renderZ??unit.z,unit.z);view.clock=20;sceneNodeFor(view,unit,true);assert.equal(view.nodes.get(1),node);assert.ok(view.selection.has(1));
  view.selection.delete(1);sceneNodeFor(view,unit,true);assert.equal(view.nodes.has(1),false);assert.equal(unit.hp,100);
});
