import test from 'node:test';
import assert from 'node:assert/strict';
import {currentGameUpdate,installGameUpdates} from '../src/game-updates.js';
test('build checks detect a newer host without using cached responses or failing offline play',async()=>{
  let options;const fetcher=async(url,o)=>{assert.equal(url,'/version.json');options=o;return {ok:true,json:async()=>({buildId:'1791697777777',version:'2.5.0'})};};
  assert.ok(await currentGameUpdate('1791696666666',fetcher));assert.equal(options.cache,'no-store');assert.equal(await currentGameUpdate('1791697777777',fetcher),null);
  assert.ok(await currentGameUpdate('01234567890123456789',async()=>({ok:true,json:async()=>({buildId:'98765432109876543210',version:'2.6.1'})})),'accepts 20-digit content-addressed build IDs');
  assert.equal(await currentGameUpdate('old',async()=>{throw new Error('offline');}),null);
  assert.equal(await currentGameUpdate('old',async()=>({ok:false})),null);
  assert.equal(await currentGameUpdate('old',async()=>({ok:true,json:async()=>({buildId:'malformed'})})),null);
});

test('refresh waits for a successful save and leaves a failed save open',async t=>{
  const target='98765432109876543210',button={},hint={},navigations=[];
  const notice={classList:{remove(){}},querySelector:selector=>selector==='button'?button:hint,setAttribute(){},remove(){}};
  const globals={
    document:{hidden:true,body:{append(){}},createElement:()=>notice},
    location:{href:'https://example.test/',assign:url=>navigations.push(url)},
  };
  for(const [key,value] of Object.entries(globals)){
    const original=Object.getOwnPropertyDescriptor(globalThis,key);
    Object.defineProperty(globalThis,key,{configurable:true,value});
    t.after(()=>original?Object.defineProperty(globalThis,key,original):delete globalThis[key]);
  }
  t.mock.method(globalThis,'fetch',async()=>({ok:true,json:async()=>({buildId:target})}));
  let finishSave;
  const updates=installGameUpdates({buildId:'old',canRefresh:()=>true,beforeRefresh:()=>new Promise(resolve=>{finishSave=resolve;})});
  t.after(()=>updates.dispose());
  await updates.check();
  const failed=button.onclick();
  assert.equal(button.disabled,true);
  assert.deepEqual(navigations,[]);
  finishSave(false);
  await failed;
  assert.match(hint.textContent,/could not be saved/);
  assert.deepEqual(navigations,[]);
  const successful=button.onclick();
  assert.deepEqual(navigations,[]);
  finishSave(true);
  await successful;
  assert.equal(navigations[0].searchParams.get('build'),target);
});
