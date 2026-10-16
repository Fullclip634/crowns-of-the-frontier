import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {shaderPreview,prepareScenePrograms,releasePreparedPrograms} from '../src/shader-preparation.js';
import {transitionRendererQuality} from '../src/render-quality.js';

const deferred=()=>{let resolve;const promise=new Promise(done=>resolve=done);return {promise,resolve};};
const scene=()=>{const scene=new THREE.Scene(),geometry=new THREE.BoxGeometry(),material=new THREE.MeshStandardMaterial(),mesh=new THREE.InstancedMesh(geometry,material,64);mesh.userData.circular=mesh;mesh.receiveShadow=true;mesh.instanceColor=new THREE.InstancedBufferAttribute(new Float32Array(64*3),3);material.defines={CUSTOM:''};material.onBeforeCompile=()=>{};material.customProgramCacheKey=()=> 'original';scene.add(mesh);return {scene,geometry,material,mesh};};
const fixture=()=>{const asset=scene();return {...asset,view:{scene:asset.scene,camera:new THREE.PerspectiveCamera(),settings:{quality:'high'},sim:{},renderQuality:'low',renderer:{shadowMap:{enabled:false},setPixelRatio(){}},sun:{shadow:{mapSize:{x:1024,set(x){this.x=x;}}}},materials:{}}};};

test('shader previews preserve instance/color/material variants without cloning circular gameplay data or owning geometry',()=>{
  const asset=scene(),preview=shaderPreview(asset.scene),proxy=preview.group.children[0];let disposed=0,geometryDisposed=0;
  assert.ok(proxy.isInstancedMesh);assert.equal(proxy.instanceMatrix.count,1);assert.equal(proxy.instanceColor,asset.mesh.instanceColor);assert.equal(proxy.geometry,asset.geometry);assert.equal(proxy.receiveShadow,true);assert.notEqual(proxy.material,asset.material);assert.deepEqual(proxy.material.defines,asset.material.defines);assert.equal(proxy.material.onBeforeCompile,asset.material.onBeforeCompile);assert.equal(proxy.material.customProgramCacheKey(),asset.material.customProgramCacheKey());assert.deepEqual(proxy.userData,{});
  proxy.material.addEventListener('dispose',()=>disposed++);asset.geometry.addEventListener('dispose',()=>geometryDisposed++);preview.dispose();preview.dispose();assert.equal(disposed,1);assert.equal(geometryDisposed,0);asset.geometry.dispose();asset.material.dispose();asset.mesh.dispose();
});

test('prepared programs stay referenced until the live frame and remain safe when original materials are replaced',async()=>{
  const {view,...asset}=fixture(),ready=deferred();let proxy,disposed=0;
  view.renderer.compileAsync=(group,camera,target)=>{assert.equal(camera,view.camera);assert.equal(target,view.scene);proxy=group.children[0].material;proxy.addEventListener('dispose',()=>disposed++);return ready.promise;};
  const preparing=prepareScenePrograms(view);asset.material.dispose();assert.equal(disposed,0);ready.resolve();await preparing;assert.equal(disposed,0);releasePreparedPrograms(view);releasePreparedPrograms(view);assert.equal(disposed,1);asset.geometry.dispose();asset.mesh.dispose();
});

test('shader preparation defers GPU frame targets and a superseded compilation cannot overwrite the latest choice',async()=>{
  const {view,...asset}=fixture(),ready=deferred();let pixels=0;view.renderer.setPixelRatio=()=>pixels++;view.renderer.compileAsync=()=>ready.promise;
  const first=transitionRendererQuality(view,'high',()=>Promise.resolve(),()=>{});await new Promise(done=>setImmediate(done));assert.equal(view.graphicsRebuilding,1);assert.equal(view.renderQuality,'low');assert.equal(pixels,0);assert.equal(view.renderer.shadowMap.enabled,true);
  view.settings.quality='low';const second=transitionRendererQuality(view,'low',()=>Promise.resolve(),()=>{});await new Promise(done=>setImmediate(done));assert.equal(view.graphicsRebuilding,1,'the newer replacement waits for the current mutation to settle');ready.resolve();assert.equal(await first,false);assert.equal(await second,true);assert.equal(view.renderQuality,'low');assert.ok(pixels>=1);assert.equal(view.graphicsRebuilding,null);assert.equal(view.graphicsLoading,null);releasePreparedPrograms(view);asset.geometry.dispose();asset.material.dispose();asset.mesh.dispose();
});

test('failed optional shader preparation disposes proxies and permits the rebuilt quality to render normally',async()=>{
  const {view,...asset}=fixture();let disposed=0;view.renderer.compileAsync=group=>{group.children[0].material.addEventListener('dispose',()=>disposed++);return Promise.reject(new Error('compile failed'));};
  assert.equal(await transitionRendererQuality(view,'high',()=>Promise.resolve(),()=>{}),true);assert.equal(disposed,1);assert.equal(view.graphicsRebuilding,null);assert.equal(view.graphicsLoading,null);assert.equal(view.renderQuality,'high');assert.equal(view.renderer.shadowMap.enabled,true);assert.equal(view.sun.shadow.mapSize.x,2048);assert.equal(view.graphicsWarmupError,'compile failed');asset.geometry.dispose();asset.material.dispose();asset.mesh.dispose();
});
