import test from 'node:test';
import assert from 'node:assert/strict';
import {preferredRenderer,compatibleGraphicsURL,startupCompatibilityURL} from '../src/graphics-compatibility.js';

const memory=()=>{const values=new Map();return {getItem:key=>values.get(key)??null,setItem:(key,value)=>values.set(key,value)};};
const href='https://example.test/game?room=ABC123#frontier';

test('new tabs prefer WebGPU while an actual compatible recovery is remembered in the current tab',()=>{
  const storage=memory();assert.equal(preferredRenderer(href,storage),'webgpu');
  const url=compatibleGraphicsURL(href,storage);assert.equal(new URL(url).searchParams.get('renderer'),'webgl');
  assert.equal(new URL(url).searchParams.get('room'),'ABC123');assert.equal(new URL(url).hash,'#frontier');
  assert.equal(preferredRenderer(href,storage),'webgl');assert.equal(preferredRenderer(href,memory()),'webgpu');
  assert.equal(preferredRenderer(href+'&renderer=webgpu',storage),'webgl','fragment contents are not renderer parameters');
  const retry=new URL(href);retry.searchParams.set('renderer','webgpu');assert.equal(preferredRenderer(retry.href,storage),'webgpu');
});

test('native first-frame failures automatically open a compatible context instead of requiring a recovery dialog',()=>{
  for(const failure of [{backendError:true},{deviceLost:true}]){
    const storage=memory(),url=startupCompatibilityURL({failure,backend:'webgpu',playing:false,network:false,modal:false,href,storage});
    assert.equal(new URL(url).searchParams.get('renderer'),'webgl');assert.equal(preferredRenderer(href,storage),'webgl');
    assert.equal(startupCompatibilityURL({failure,backend:'webgl',playing:false,network:false,modal:false,href:url,storage}),null,'the compatible page cannot start a reload loop');
  }
});

test('startup recovery never reloads over a match, a room connection, an open menu or an artwork failure',()=>{
  for(const override of [{playing:true},{network:true},{modal:true},{failure:{message:'Artwork download failed'}},{backend:'webgl'}]){
    const storage=memory();assert.equal(startupCompatibilityURL({failure:{backendError:true},backend:'webgpu',playing:false,network:false,modal:false,href,storage,...override}),null);
    assert.equal(preferredRenderer(href,storage),'webgpu','a rejected automatic recovery does not change the tab preference');
  }
});

test('blocked browser storage still permits a compatible reload and explicit renderer selection',()=>{
  const storage={getItem(){throw Error('Storage disabled');},setItem(){throw Error('Storage disabled');}};
  assert.equal(preferredRenderer(href,storage),'webgpu');const url=compatibleGraphicsURL(href,storage);assert.equal(preferredRenderer(url,storage),'webgl');
  assert.equal(preferredRenderer(href,null),'webgpu');assert.equal(preferredRenderer(compatibleGraphicsURL(href,null),null),'webgl');
});
