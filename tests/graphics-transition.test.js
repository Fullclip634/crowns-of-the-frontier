import test from 'node:test';
import assert from 'node:assert/strict';
import {transitionRendererQuality} from '../src/render-quality.js';

function fixture(){
  const pixels=[],sizes=[],disposed=[];
  const view={settings:{quality:'high',autoQuality:false},sim:{},renderQuality:'low',renderer:{shadowMap:{enabled:false},setPixelRatio:value=>pixels.push(value)},sun:{shadow:{map:{dispose:()=>disposed.push(true)},mapSize:{x:1024,y:1024,set(x,y){this.x=x;this.y=y;sizes.push([x,y]);}}}},materials:{}};
  return {view,pixels,sizes,disposed};
}
const deferred=()=>{let resolve;const promise=new Promise(done=>resolve=done);return {promise,resolve};};

test('High allocates larger rendering targets only after art preparation and scene replacement',async()=>{
  const {view,pixels,sizes,disposed}=fixture(),art=deferred();let rebuilds=0;
  const ready=transitionRendererQuality(view,'high',()=>art.promise,()=>{rebuilds++;assert.equal(view.renderer.shadowMap.enabled,false);assert.equal(view.sun.shadow.mapSize.x,1024);assert.equal(pixels.length,0);});
  assert.equal(view.graphicsLoading,'high');assert.equal(rebuilds,0);assert.equal(view.renderQuality,'low');assert.deepEqual(sizes,[]);assert.deepEqual(pixels,[]);
  art.resolve();assert.equal(await ready,true);assert.equal(rebuilds,1);assert.deepEqual(sizes,[[2048,2048]]);assert.deepEqual(disposed,[true]);assert.equal(view.renderer.shadowMap.enabled,true);assert.equal(view.renderQuality,'high');assert.equal(view.settings.quality,'high');assert.equal(view.settings.autoQuality,false);assert.equal(view.graphicsLoading,null);
});

test('a superseded High load cannot replace a later Performance selection',async()=>{
  const {view,sizes}=fixture(),high=deferred(),low=deferred(),rebuilt=[];
  const first=transitionRendererQuality(view,'high',()=>high.promise,()=>rebuilt.push('high'));
  view.settings.quality='low';const second=transitionRendererQuality(view,'low',()=>low.promise,()=>rebuilt.push('low'));
  high.resolve();assert.equal(await first,false);assert.equal(view.graphicsLoading,'low');assert.deepEqual(rebuilt,[]);assert.deepEqual(sizes,[]);
  low.resolve();assert.equal(await second,true);assert.deepEqual(rebuilt,['low']);assert.equal(view.renderQuality,'low');assert.equal(view.renderer.shadowMap.enabled,false);assert.equal(view.settings.quality,'low');assert.equal(view.graphicsLoading,null);
});

test('failed preparation preserves the working renderer and clears the loading state',async()=>{
  const {view,pixels,sizes}=fixture();let rebuilt=false;
  await assert.rejects(transitionRendererQuality(view,'high',()=>Promise.reject(new Error('asset unavailable')),()=>rebuilt=true),/asset unavailable/);
  assert.equal(rebuilt,false);assert.deepEqual(pixels,[]);assert.deepEqual(sizes,[]);assert.equal(view.renderQuality,'low');assert.equal(view.graphicsLoading,null);
});
