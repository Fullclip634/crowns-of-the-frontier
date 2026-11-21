import test from 'node:test';
import assert from 'node:assert/strict';
import {registerOfflineGame,loadStartupGraphics} from '../src/offline-registration.js';

function environment(ready){const calls=[],window=new EventTarget();return {calls,runtime:{window,document:{readyState:ready},navigator:{serviceWorker:{register:async path=>{calls.push(path);return {};}}}}};}
test('offline registration still occurs when artwork decoding outlasts page load',()=>{
  const {calls,runtime}=environment('complete');assert.equal(registerOfflineGame(runtime),true);assert.deepEqual(calls,['/sw.js']);runtime.window.dispatchEvent(new Event('load'));assert.equal(calls.length,1);
});
test('offline registration waits for the first load event when the page is still loading',()=>{
  for(const ready of ['loading','interactive']){const {calls,runtime}=environment(ready);registerOfflineGame(runtime);assert.equal(calls.length,0);runtime.window.dispatchEvent(new Event('load'));runtime.window.dispatchEvent(new Event('load'));assert.deepEqual(calls,['/sw.js']);}
});
test('unsupported offline APIs and a rejected installation do not stop online gameplay',async()=>{
  assert.equal(registerOfflineGame({navigator:{}}),false);const {runtime}=environment('complete');runtime.navigator.serviceWorker.register=async()=>{throw new Error('storage unavailable');};assert.equal(registerOfflineGame(runtime),true);await new Promise(resolve=>setImmediate(resolve));
});

const catalogueURLs={low:'/low.glb',medium:'/balanced.glb',high:'/high.glb',trees:'/trees.glb'};
function offlineBrowser(files,{online=false,controlled=true}={}){
  return {
    navigator:{onLine:online,serviceWorker:{controller:controlled?{}:null}},
    caches:{match:async file=>files.includes(file)?{}:undefined},
  };
}

test('offline startup uses the cached authored Performance catalogue for a missing High or Balanced catalogue',async()=>{
  const runtime=offlineBrowser(['/low.glb','/trees.glb']);
  for(const requested of ['medium','high']){
    const loads=[];
    const quality=await loadStartupGraphics(requested,catalogueURLs,async tier=>{loads.push(tier);},runtime);
    assert.equal(quality,'low');
    assert.deepEqual(loads,['low']);
  }
});

test('offline startup keeps a cached requested catalogue',async()=>{
  const runtime=offlineBrowser(['/low.glb','/trees.glb','/high.glb']);
  const loads=[];
  assert.equal(await loadStartupGraphics('high',catalogueURLs,async tier=>{loads.push(tier);},runtime),'high');
  assert.deepEqual(loads,['high']);
});

test('an offline hotspot can fall back even when the browser reports a network link',async()=>{
  const runtime=offlineBrowser(['/low.glb','/trees.glb'],{online:true});
  const loads=[];
  const quality=await loadStartupGraphics('medium',catalogueURLs,async tier=>{
    loads.push(tier);if(tier==='medium')throw Error('Network unavailable');
  },runtime);
  assert.equal(quality,'low');
  assert.deepEqual(loads,['medium','low']);
});

test('startup reports a failed catalogue when no controlling offline cache can supply the fallback',async()=>{
  for(const runtime of [offlineBrowser(['/low.glb']),offlineBrowser(['/low.glb','/trees.glb'],{controlled:false})]){
    const original=Error('Required models unavailable'),loads=[];
    await assert.rejects(loadStartupGraphics('high',catalogueURLs,async tier=>{loads.push(tier);throw original;},runtime),error=>error===original);
    assert.deepEqual(loads,['high']);
  }
});
