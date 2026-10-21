import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {watchRendererDevice} from '../src/render-context.js';
import {transitionRendererQuality} from '../src/render-quality.js';
import {releasePreparedPrograms} from '../src/shader-preparation.js';
import {graphicsRecoveryMarkup} from '../src/graphics-recovery-ui.js';

const deferred=()=>{let resolve;const promise=new Promise(done=>resolve=done);return {promise,resolve};};
test('device loss holds the battlefield and keeps the engine loss callback',()=>{
  let calls=0;const renderer={isWebGPURenderer:true,onDeviceLost(){assert.equal(this,renderer);calls++;}},view={renderer,renderQuality:'high',graphicsSceneValid:true};
  watchRendererDevice(view);renderer.onDeviceLost({message:'Disconnected'});
  assert.equal(calls,1);assert.equal(view.graphicsSceneValid,false);assert.deepEqual(view.graphicsFatal,{deviceLost:true,message:'Disconnected',quality:'high'});
  view.renderingReleased=true;view.graphicsFatal=null;renderer.onDeviceLost({message:'Page closed'});
  assert.equal(calls,2);assert.equal(view.graphicsFatal,null,'closing the page must not open another recovery dialog');
});

test('a quality warm-up cannot revive a lost device or rebuild through recovery',async()=>{
  const compiling=deferred(),resume=deferred();let restored=0,released=0;
  const view={settings:{quality:'high'},sim:{},renderQuality:'low',scene:new THREE.Scene(),camera:new THREE.PerspectiveCamera(),materials:{},graphicsSceneValid:true,
    renderer:{isWebGPURenderer:true,onDeviceLost(){},shadowMap:{enabled:false},getPixelRatio:()=>1,setPixelRatio(){},async compileAsync(){compiling.resolve();await resume.promise;}},
    sun:{shadow:{map:null,mapSize:{x:1024,y:1024,set(x,y){this.x=x;this.y=y;}}}}};
  watchRendererDevice(view);
  const change=transitionRendererQuality(view,'high',async()=>{},async()=>{},()=>({restore(){restored++;},release(){released++;}}));
  await compiling.promise;view.renderer.onDeviceLost({message:'Lost while compiling'});const failure=view.graphicsFatal;resume.resolve();
  assert.equal(await change,false);assert.equal(view.graphicsFatal,failure);assert.equal(view.graphicsSceneValid,false);assert.equal(restored,0);assert.equal(released,1);assert.equal(view.graphicsLoading,null);assert.equal(view.graphicsRebuilding,null);
  let prepared=false;assert.equal(await transitionRendererQuality(view,'low',async()=>{prepared=true;},()=>{}),false);assert.equal(prepared,false);
  releasePreparedPrograms(view);
});

test('a disconnected device offers reload instead of retrying the same renderer',()=>{
  const html=graphicsRecoveryMarkup({playing:true,network:false,saved:true,deviceLost:true});
  assert.match(html,/graphics device disconnected/);assert.match(html,/data-action="reload-battlefield"/);assert.doesNotMatch(html,/data-action="retry-battlefield"/);assert.match(html,/saved on this device/);
});

test('a failed downgrade keeps a node-renderer shadow target alive for its cached bindings',async()=>{
  let disposed=0;const target={dispose(){disposed++;}},view={settings:{quality:'medium'},sim:{},renderQuality:'high',materials:{},
    renderer:{isWebGPURenderer:true,shadowMap:{enabled:true},getPixelRatio:()=>1,setPixelRatio(){}},
    sun:{shadow:{map:target,mapSize:{x:2048,y:2048,set(x,y){this.x=x;this.y=y;}}}}};
  await assert.rejects(transitionRendererQuality(view,'medium',async()=>{assert.equal(view.sun.shadow.map,target);assert.equal(view.sun.shadow.mapSize.x,1024);throw Error('Network unavailable');},()=>assert.fail('failed art cannot replace the scene')),/Network unavailable/);
  assert.equal(disposed,0);assert.equal(view.sun.shadow.map,target);assert.equal(view.sun.shadow.mapSize.x,2048);assert.equal(view.renderer.shadowMap.enabled,true);assert.equal(view.renderQuality,'high');
});
