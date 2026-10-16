import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {SurfaceResidency,surfaceKeys,surfacePins} from '../src/surface-residency.js';

test('surface loads share one decode, retry failures, and remove only completed unused maps',async()=>{
  const removed=[],cache=new SurfaceResidency({removed:(key,texture)=>removed.push([key,texture])});let loads=0,disposed=0;
  const texture=new THREE.Texture();texture.addEventListener('dispose',()=>disposed++);
  let release;const pending=cache.load('grass:normal',()=>{loads++;return new Promise(resolve=>release=resolve);});assert.equal(cache.load('grass:normal',()=>{throw new Error('duplicate');}),pending);
  await Promise.resolve();assert.equal(loads,1);assert.deepEqual(cache.trim(new Set()),{loaded:0,pending:1,evicted:0});release(texture);await pending;
  assert.equal(cache.trim(new Set(['grass:normal'])).evicted,0);assert.equal(cache.trim(new Set()).evicted,1);assert.equal(disposed,1);assert.deepEqual(removed,[['grass:normal',texture]]);
  await assert.rejects(cache.load('stone:arm',()=>Promise.reject(new Error('network'))),/network/);const retry=new THREE.Texture();assert.equal(await cache.load('stone:arm',()=>retry),retry);assert.equal(cache.trim(new Set()).evicted,1);
});

test('scene and portrait material/uniform references pin maps until their replacement is ready',async()=>{
  const cache=new SurfaceResidency(),normal=new THREE.Texture(),arm=new THREE.Texture(),view={scene:new THREE.Scene(),modelPortrait:{scene:new THREE.Scene()},materials:{}};
  await cache.load('stone:normal',()=>normal);await cache.load('stone:arm',()=>arm);
  const sceneMaterial=new THREE.MeshStandardMaterial({normalMap:normal}),portraitMaterial=new THREE.MeshStandardMaterial();portraitMaterial.frontierUniforms={arm:{value:arm}};
  const geometry=new THREE.BoxGeometry(),scene=new THREE.Mesh(geometry,sceneMaterial),portrait=new THREE.Mesh(geometry,portraitMaterial);view.scene.add(scene);view.modelPortrait.scene.add(portrait);
  assert.equal(cache.trim(new Set(),surfacePins(view)).evicted,0);sceneMaterial.normalMap=null;assert.equal(cache.trim(new Set(),surfacePins(view)).evicted,1);
  portraitMaterial.frontierUniforms.arm.value=null;assert.equal(cache.trim(new Set(),surfacePins(view)).evicted,1);
  geometry.dispose();sceneMaterial.dispose();portraitMaterial.dispose();
});

test('quality switches preserve exactly the required surface roles and all active pending details',async()=>{
  const roles=['grass','soil','rock','boulder','wood','stone','plaster'],cache=new SurfaceResidency();let disposed=0;
  for(const key of surfaceKeys('high',roles)){const texture=new THREE.Texture();texture.addEventListener('dispose',()=>disposed++);await cache.load(key,()=>texture);}
  assert.equal(cache.textures().size,21);assert.equal(cache.trim(surfaceKeys('medium',roles)).evicted,4);assert.equal(cache.textures().size,17);
  assert.equal(cache.trim(surfaceKeys('low',roles)).evicted,10);assert.equal(cache.textures().size,7);assert.equal(disposed,14);
  for(const key of surfaceKeys('high',roles))await cache.load(key,()=>new THREE.Texture());assert.equal(cache.textures().size,21);cache.trim(new Set());
});
