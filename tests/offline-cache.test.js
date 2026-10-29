import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {precacheFiles} from '../scripts/offline-assets.js';

test('offline precache keeps the low-detail shell and defers optional art',()=>{
  const files=[
    '/assets/frontier-low-abc.glb','/assets/frontier-trees-abc.glb','/assets/frontier-bridge-abc.glb',
    '/assets/frontier-near-abc.glb','/assets/frontier-balanced-abc.glb',
    '/assets/leafy_grass_color-abc.jpg','/assets/leafy_grass_normal-abc.jpg','/assets/leafy_grass_color-abc.ktx2','/assets/leafy_grass_arm-abc.ktx2',
    '/assets/character-color-abc.png','/assets/character-normal-roughness-abc.png','/assets/index-abc.js','/assets/basis_transcoder-abc.js','/icon.svg',
    '/fonts/dm-sans-normal-400.woff2','/fonts/cormorant-garamond-normal-400.woff2',
  ];
  assert.deepEqual(precacheFiles(files),[
    '/assets/frontier-low-abc.glb','/assets/frontier-trees-abc.glb','/assets/frontier-bridge-abc.glb',
    '/assets/leafy_grass_color-abc.jpg','/assets/leafy_grass_color-abc.ktx2','/assets/character-color-abc.png','/assets/index-abc.js','/assets/basis_transcoder-abc.js','/icon.svg',
    '/fonts/dm-sans-normal-400.woff2','/fonts/cormorant-garamond-normal-400.woff2',
  ]);
});

const template=fs.readFileSync(new URL('../scripts/sw-template.js',import.meta.url),'utf8').replace('__CACHE__','"frontier-test"').replace('__FILES__','[]');
function environment({cached=null}={}){
  const listeners={},puts=[],fetched=[];
  const cache={addAll:async()=>{},put:async(request,response)=>{puts.push({url:request.url,response});}};
  const caches={open:async()=>cache,match:async()=>cached,keys:async()=>[],delete:async()=>{}};
  const fetch=async request=>{fetched.push(request.url);return new Response('asset',{status:200});};
  const self={location:{origin:'https://game.test'},addEventListener:(name,handler)=>listeners[name]=handler,skipWaiting:async()=>{},clients:{claim:async()=>{}}};
  vm.runInNewContext(template,{self,caches,fetch,URL,Response,console});
  return {listeners,fetched,puts};
}
async function request(env,{url='https://game.test/assets/frontier-near-abc.glb',headers={has:()=>false},mode='cors'}={}){
  let responded;const waits=[];
  env.listeners.fetch({request:{method:'GET',url,headers,mode},respondWith:promise=>{responded=promise},waitUntil:promise=>waits.push(promise)});
  const response=responded&&await responded;await Promise.all(waits);return response;
}

test('the service worker caches optional assets after their first real fetch',async()=>{
  const env=environment(),response=await request(env);
  assert.equal(await response.text(),'asset');
  assert.deepEqual(env.puts.map(put=>put.url),['https://game.test/assets/frontier-near-abc.glb']);
});

test('the service worker returns cached assets without refetching and skips non-asset responses',async()=>{
  const cached=new Response('cached'),hit=environment({cached});
  assert.equal(await (await request(hit)).text(),'cached');
  assert.equal(hit.fetched.length,0);assert.equal(hit.puts.length,0);
  const api=environment();await request(api,{url:'https://game.test/api/state'});
  assert.equal(api.puts.length,0);
  const range=environment();await request(range,{headers:{has:name=>name==='range'}});
  assert.equal(range.puts.length,0);
  const version=environment();let responded;
  version.listeners.fetch({request:{method:'GET',url:'https://game.test/version.json',headers:{has:()=>false},mode:'cors'},respondWith:promise=>{responded=promise},waitUntil:()=>{}});
  assert.equal(responded,undefined);assert.equal(version.fetched.length,0);
});
