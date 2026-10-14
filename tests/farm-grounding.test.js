import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {fitFarmTerrain,farmSelectionGeometry} from '../src/farm-grounding.js';
import {Landscape} from '../src/landscape.js';
import {WorldView} from '../src/world.js';
import {Simulation} from '../src/simulation.js';

test('the farm selection frame outlines its square footprint and leaves the crops clear',()=>{
  const geometry=farmSelectionGeometry(),material=new THREE.MeshBasicMaterial({side:THREE.DoubleSide}),mesh=new THREE.Mesh(geometry,material),ray=new THREE.Raycaster();
  const hits=(x,y)=>{ray.set(new THREE.Vector3(x,y,2),new THREE.Vector3(0,0,-1));return ray.intersectObject(mesh).length;};
  assert.equal(hits(0,0),0);assert.equal(hits(.96,.96),0,'interior corners remain open');
  for(const [x,y]of [[0,.985],[0,-.985],[.985,0],[-.985,0],[.985,.985],[-.985,-.985]])assert.ok(hits(x,y)>0,'the visible perimeter includes edges and corners');
  assert.ok(geometry.attributes.normal.array.every(Number.isFinite));geometry.dispose();material.dispose();
});

test('field terrain fitting preserves authored detail and shared templates across real slopes',()=>{
  for(const map of ['highlands','winter','desert','canyon','valley','rivers','coast']){
    const land=new Landscape(512,map),ground=land.geometry(),source=new THREE.PlaneGeometry(5.7,5.7,12,12);source.rotateX(-Math.PI/2);source.translate(0,.16,0);source.setAttribute('color',new THREE.Float32BufferAttribute(new Float32Array(source.attributes.position.count*3).fill(.8),3));
    const before=source.attributes.position.array.slice(),node=new THREE.Group(),mesh=new THREE.Mesh(source,new THREE.MeshStandardMaterial());node.add(mesh);node.position.set(45,land.surfaceHeightAt(45,55),55);fitFarmTerrain(node,land);const world=new THREE.Vector3();
    assert.notEqual(mesh.geometry,source);assert.deepEqual(source.attributes.position.array,before);assert.equal(mesh.geometry.attributes.color.array,source.attributes.color.array);assert.notEqual(mesh.geometry.attributes.color,source.attributes.color,'one field cannot dispose another field’s GPU attribute');
    for(let i=0;i<mesh.geometry.attributes.position.count;i++){world.fromBufferAttribute(mesh.geometry.attributes.position,i).applyMatrix4(mesh.matrixWorld);assert.ok(Math.abs(world.y-land.surfaceHeightAt(world.x,world.z)-.16)<1e-5);}
    const fitted=mesh.geometry;fitFarmTerrain(node,land);assert.equal(mesh.geometry,fitted);assert.ok(mesh.geometry.attributes.normal.array.every(Number.isFinite));assert.ok(Number.isFinite(mesh.geometry.boundingSphere.radius));mesh.geometry.dispose();source.dispose();ground.dispose();mesh.material.dispose();
  }
});

test('the displayed sloped field and its picking surface occupy the same height',()=>{
  const land=new Landscape(512,'canyon'),ground=land.geometry(),node=new THREE.Group(),source=new THREE.PlaneGeometry(5.7,5.7,12,12);source.rotateX(-Math.PI/2);source.translate(0,.16,0);const mesh=new THREE.Mesh(source,new THREE.MeshBasicMaterial({side:THREE.DoubleSide}));node.add(mesh);node.position.set(-60,land.surfaceHeightAt(-60,-35),-35);fitFarmTerrain(node,land);
  const x=-60+1.9,z=-35+.95,ray=new THREE.Raycaster(new THREE.Vector3(x,20,z),new THREE.Vector3(0,-1,0)),hit=ray.intersectObject(node,true)[0];assert.ok(hit);assert.ok(Math.abs(hit.point.y-land.surfaceHeightAt(x,z)-.16)<.025,'clicking follows the visible field rather than its former flat plane');
  mesh.geometry.dispose();source.dispose();ground.dispose();mesh.material.dispose();
});

test('field height uses its centre terrain and unique fitted geometry releases with the node',()=>{
  const land=new Landscape(512,'highlands'),ground=land.geometry(),view=Object.create(WorldView.prototype);view.landscape=land;view.foundationHeights=new Map();view.materials={};view.teamMaterials=[];view.geo={};view.authoredGeometry=new Set();view.sharedModelGeometry=new Set();const e={id:31,kind:'building',type:'farm',x:45,z:55,r:3};assert.equal(view.entityHeight(e),land.surfaceHeightAt(e.x,e.z));
  const node=new THREE.Group(),source=new THREE.BoxGeometry(1,1,1),material=new THREE.MeshBasicMaterial();node.position.set(e.x,view.entityHeight(e),e.z);node.userData.entity=e.id;node.add(new THREE.Mesh(source,material));view.sharedModelGeometry.add(source);fitFarmTerrain(node,land);let released=false,originalReleased=false;node.children[0].geometry.addEventListener('dispose',()=>released=true);source.addEventListener('dispose',()=>originalReleased=true);view.releaseNode(node);assert.equal(released,true);assert.equal(originalReleased,false);source.dispose();ground.dispose();
});

test('a moving field preview resamples its template without accumulating terrain offsets',()=>{
  const land=new Landscape(512,'canyon'),ground=land.geometry(),node=new THREE.Group(),source=new THREE.PlaneGeometry(5.7,5.7,12,12);source.rotateX(-Math.PI/2);source.translate(0,.16,0);const mesh=new THREE.Mesh(source,new THREE.MeshBasicMaterial({side:THREE.DoubleSide}));node.add(mesh);
  node.position.set(45,land.surfaceHeightAt(45,55),55);fitFarmTerrain(node,land,true);const geometry=mesh.geometry,first=geometry.attributes.position.array.slice();
  node.position.set(-60,land.surfaceHeightAt(-60,-35),-35);fitFarmTerrain(node,land,true);const sample=new THREE.Vector3().fromBufferAttribute(geometry.attributes.position,5).applyMatrix4(mesh.matrixWorld);assert.ok(Math.abs(sample.y-land.surfaceHeightAt(sample.x,sample.z)-.16)<1e-5);assert.equal(mesh.geometry,geometry,'pointer movement reuses the existing buffers');
  node.position.set(45,land.surfaceHeightAt(45,55),55);fitFarmTerrain(node,land,true);assert.deepEqual(geometry.attributes.position.array,first);geometry.dispose();source.dispose();ground.dispose();mesh.material.dispose();
});

test('land buildings require a dry footprint while docks retain their shoreline placement',()=>{
  const sim=new Simulation({mode:'sandbox',map:'coast',seed:512});sim.entities=[];sim.index=new Map();sim.revision++;sim.visible.fill(1);
  for(const [type,x]of [['farm',-14],['house',-13.8],['towncenter',-15.8]]){assert.equal(sim.isWater(x,40),false,'the old centre-only placement is dry');assert.equal(sim.buildValid(type,x,40),false,'the footprint must not put crops or foundations in the channel');}
  assert.equal(sim.buildValid('farm',-30,40),true);assert.equal(sim.buildValid('dock',-20,-60),true,'piers still reach water through the dedicated dock rule');
});
