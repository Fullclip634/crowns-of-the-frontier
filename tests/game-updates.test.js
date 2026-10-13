import test from 'node:test';
import assert from 'node:assert/strict';
import {currentGameUpdate} from '../src/game-updates.js';
test('build checks detect a newer host without using cached responses or failing offline play',async()=>{
  let options;const fetcher=async(url,o)=>{assert.equal(url,'/version.json');options=o;return {ok:true,json:async()=>({buildId:'1791697777777',version:'2.5.0'})};};
  assert.ok(await currentGameUpdate('1791696666666',fetcher));assert.equal(options.cache,'no-store');assert.equal(await currentGameUpdate('1791697777777',fetcher),null);
  assert.equal(await currentGameUpdate('old',async()=>{throw new Error('offline');}),null);
  assert.equal(await currentGameUpdate('old',async()=>({ok:false})),null);
  assert.equal(await currentGameUpdate('old',async()=>({ok:true,json:async()=>({buildId:'malformed'})})),null);
});
