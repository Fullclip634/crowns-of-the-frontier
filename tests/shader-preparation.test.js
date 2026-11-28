import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {shaderPreview,prepareScenePrograms,releasePreparedPrograms,runtimeShaderPreview,warmRuntimePrograms,disposeRuntimePrograms} from '../src/shader-preparation.js';
import {transitionRendererQuality} from '../src/render-quality.js';
import {updateGlobalQueueStrip} from '../src/hud-macro.js';

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

test('shader previews deduplicate repeated identical mesh variants while keeping shadow and attribute distinctions',()=>{
  const scene=new THREE.Scene(),geometry=new THREE.BoxGeometry(),material=new THREE.MeshStandardMaterial();
  for(let i=0;i<24;i++){const m=new THREE.Mesh(geometry,material);m.castShadow=true;m.receiveShadow=true;scene.add(m);}
  const flat=new THREE.Mesh(geometry,material);flat.castShadow=false;flat.receiveShadow=true;scene.add(flat);
  const preview=shaderPreview(scene);
  assert.equal(preview.group.children.length,2,'24 identical casters pack as 1 proxy alongside 1 non-caster variant');
  assert.equal(preview.materials.size,1);
  preview.dispose();geometry.dispose();material.dispose();
});

test('WebGPU renderer skips synchronous scene-wide compileAsync warmup during quality transitions',async()=>{
  const {view,...asset}=fixture();let called=0;
  view.renderer.isWebGPURenderer=true;
  view.renderer.compileAsync=()=>{called++;return Promise.resolve();};
  await prepareScenePrograms(view);
  assert.equal(called,0);
  asset.geometry.dispose();asset.material.dispose();asset.mesh.dispose();
});

test('graphics settings prepare the chosen tier before any match has been created',async()=>{
  const {view,...asset}=fixture();
  view.sim=null;
  let prepared=false,activated=false;
  view.renderer.compileAsync=()=>assert.fail('The menu has no live scene to compile');
  const applied=await transitionRendererQuality(view,'high',async()=>{prepared=true;},()=>{assert.ok(prepared);activated=true;});
  assert.equal(applied,true);assert.ok(activated);assert.equal(view.sim,null);assert.equal(view.renderQuality,'high');assert.equal(view.graphicsLoading,null);
  asset.geometry.dispose();asset.material.dispose();asset.mesh.dispose();
});

test('runtimeShaderPreview targets transient variants one at a time and warmRuntimePrograms retains them across frames',async()=>{
  const {view,...asset}=fixture();
  const sp=new THREE.MeshStandardMaterial({vertexColors:true});
  sp.defines={USE_UV:''};sp.customProgramCacheKey=()=>'frontier-structure-palette-v14';sp.onBeforeCompile=()=>{};
  const team=new THREE.MeshStandardMaterial({color:0x397f8c});
  const scaffold=new THREE.MeshStandardMaterial({color:0xb2a28a});
  const cloudMat=new THREE.MeshStandardMaterial({vertexColors:true,transparent:true});
  const clouds=new THREE.InstancedMesh(asset.geometry,cloudMat,4);clouds.setColorAt(0,new THREE.Color(0xffffff));
  const smokeMat=new THREE.MeshBasicMaterial({transparent:true});
  const smoke=new THREE.InstancedMesh(asset.geometry,smokeMat,4);smoke.setColorAt(0,new THREE.Color(0xffffff));
  view.materials={structurePalette:sp,plaster:new THREE.MeshStandardMaterial(),wood:new THREE.MeshStandardMaterial()};
  view.teamMaterials=[team];
  view.scaffoldDriftwoodMat=scaffold;
  view.weather={clouds,nightAtmosphere:{chimneySmoke:smoke}};
  view.renderer.localClippingEnabled=false;
  const compiledItems=[];
  let maxBatchSize=0;
  view.renderer.compileAsync=group=>{
    maxBatchSize=Math.max(maxBatchSize,group.children.length);
    compiledItems.push(...group.children);
    return Promise.resolve();
  };

  const ok=await warmRuntimePrograms(view);
  assert.equal(ok,true);
  assert.equal(view.renderer.localClippingEnabled,true,'enables local clipping before warming clipped shaders');
  assert.equal(maxBatchSize,1,'compiles at most one shader proxy per compileAsync step to avoid 4 GB RAM spikes');
  assert.ok(compiledItems.length>=8&&compiledItems.length<=16,'warms only the lean transient shader set');
  assert.ok(compiledItems.some(c=>c.isInstancedMesh&&c.instanceColor===clouds.instanceColor),'includes weather clouds instanced color variant');
  assert.ok(compiledItems.some(c=>c.isInstancedMesh&&c.instanceColor===smoke.instanceColor),'includes instanced smoke/fire color variant');
  assert.ok(compiledItems.some(c=>c.material?.customProgramCacheKey?.()==='frontier-structure-palette-v14'&&c.material.clippingPlanes?.length===1),'includes clipped construction structure palette');
  assert.ok(compiledItems.some(c=>c.isInstancedMesh&&c.material?.isMeshBasicMaterial&&c.material.transparent),'includes instanced spark VFX');

  // Releasing one-shot transition previews must NOT dispose match-lifetime retained programs.
  let retainedDisposed=0;
  for(const child of compiledItems)child.material?.addEventListener?.('dispose',()=>retainedDisposed++);
  releasePreparedPrograms(view);
  assert.equal(retainedDisposed,0,'match-lifetime programs stay pinned after first frame');

  // Re-warming with an identical shader state is a no-op (zero redundant compiles).
  const countAfterFirst=compiledItems.length;
  await warmRuntimePrograms(view);
  assert.equal(compiledItems.length,countAfterFirst,'unchanged shader signature skips redundant compileAsync');
  assert.equal(retainedDisposed,0);

  // Changing shadows/quality supersedes and disposes the previous preview; teardown disposes the active one.
  view.renderer.shadowMap.enabled=true;
  await warmRuntimePrograms(view);
  assert.ok(compiledItems.length>countAfterFirst);
  assert.ok(retainedDisposed>0,'previous retained preview is disposed when superseded');
  disposeRuntimePrograms(view);
  assert.equal(view.retainedRuntimePrograms,null);

  // WebGPU skips runtime compileAsync warmup.
  view.renderer.isWebGPURenderer=true;
  assert.equal(await warmRuntimePrograms(view),false);

  sp.dispose();team.dispose();scaffold.dispose();cloudMat.dispose();smokeMat.dispose();clouds.dispose();smoke.dispose();view.materials.plaster.dispose();view.materials.wood.dispose();
  asset.geometry.dispose();asset.material.dispose();asset.mesh.dispose();
});

test('updateGlobalQueueStrip patches countdown, progress and stack count in place without rewriting innerHTML',()=>{
  let innerHtmlWrites=0;
  const makeEl=(tag,cls='')=>({tagName:tag,className:cls,textContent:'',title:'',style:{},children:[],insertBefore(node,ref){const i=ref?this.children.indexOf(ref):-1;if(i>=0)this.children.splice(i,0,node);else this.children.push(node);},remove(){},querySelector(sel){return this.children.find(c=>'.'+c.className===sel)||null;}});
  const root={
    _html:'',children:[],
    ownerDocument:{createElement:tag=>makeEl(tag)},
    get firstElementChild(){return this.children[0]||null;},
    get innerHTML(){return this._html;},
    set innerHTML(v){
      innerHtmlWrites++;this._html=v;this.children=[];
      if(!v)return;
      const btn=makeEl('button','gq-item');btn.title='Villager (20s) · Click to focus';
      const time=makeEl('span','gq-time');time.textContent='20s';
      const fill=makeEl('i','gq-fill');fill.style.transform='scaleX(0.200)';
      btn.children.push(time,fill);this.children.push(btn);
    },
    querySelectorAll(){return this.children;},
  };
  updateGlobalQueueStrip(root,[{buildingId:1,kind:'unit',type:'villager',label:'Villager',icon:'<svg/>',remaining:20,percent:20,queued:1}]);
  assert.equal(innerHtmlWrites,1);
  updateGlobalQueueStrip(root,[{buildingId:1,kind:'unit',type:'villager',label:'Villager',icon:'<svg/>',remaining:18,percent:28,queued:3}]);
  assert.equal(innerHtmlWrites,1,'tick updates mutate existing DOM nodes instead of reparsing innerHTML');
  assert.equal(root.children[0].querySelector('.gq-time').textContent,'18s');
  assert.equal(root.children[0].querySelector('.gq-fill').style.transform,'scaleX(0.280)');
  assert.equal(root.children[0].querySelector('.gq-badge').textContent,'3');
});
