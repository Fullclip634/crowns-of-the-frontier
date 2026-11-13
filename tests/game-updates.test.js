import test from 'node:test';
import assert from 'node:assert/strict';
import {currentGameUpdate} from '../src/game-updates.js';
test('build checks detect a newer host without using cached responses or failing offline play',async()=>{
  let options;const fetcher=async(url,o)=>{assert.equal(url,'/version.json');options=o;return {ok:true,json:async()=>({buildId:'1791697777777',version:'2.5.0'})};};
  assert.ok(await currentGameUpdate('1791696666666',fetcher));assert.equal(options.cache,'no-store');assert.equal(await currentGameUpdate('1791697777777',fetcher),null);
  assert.ok(await currentGameUpdate('01234567890123456789',async()=>({ok:true,json:async()=>({buildId:'98765432109876543210',version:'2.6.1'})})),'accepts 20-digit content-addressed build IDs');
  assert.equal(await currentGameUpdate('old',async()=>{throw new Error('offline');}),null);
  assert.equal(await currentGameUpdate('old',async()=>({ok:false})),null);
  assert.equal(await currentGameUpdate('old',async()=>({ok:true,json:async()=>({buildId:'malformed'})})),null);
});
