import test from 'node:test';
import assert from 'node:assert/strict';
import {registerOfflineGame} from '../src/offline-registration.js';

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
