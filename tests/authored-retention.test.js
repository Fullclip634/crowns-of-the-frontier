import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {loadAuthoredAssets,prepareAuthoredAssets,retainAuthoredAssets,authoredAssetState,clearAuthoredAssets,trimAuthoredAssets} from '../src/authored-assets.js';

test('prepared and rollback artwork stays decoded without activating or duplicating a rendered scene',async()=>{
  const previous=globalThis.fetch;globalThis.fetch=async url=>new Response(await fs.readFile(new URL(url)));
  const view={};let saved,prepared;
  try{
    const low=await loadAuthoredAssets('low');saved=retainAuthoredAssets();prepared=await prepareAuthoredAssets('medium');
    assert.equal(authoredAssetState().detail,'low','preparing a preset must not change active scene artwork');assert.equal(saved.catalogue,low);
    let disposed=0;[...low.geometries][0].addEventListener('dispose',()=>disposed++);
    prepared.activate();let state=trimAuthoredAssets(view);assert.equal(disposed,0);assert.ok(state.catalogues.includes('low')&&state.catalogues.includes('medium'));assert.equal(state.retained,2);
    saved.activate();assert.equal(authoredAssetState().detail,'low');prepared.release();prepared.release();state=trimAuthoredAssets(view);assert.deepEqual(state.catalogues,['low']);assert.equal(state.retained,1);assert.equal(disposed,0);
    saved.release();assert.equal(trimAuthoredAssets(view).retained,0);clearAuthoredAssets();trimAuthoredAssets(view);assert.equal(disposed,1);
  }finally{saved?.release();prepared?.release();clearAuthoredAssets();trimAuthoredAssets(view);globalThis.fetch=previous;}
});

test('failed artwork preparation releases its reservation and permits a later successful retry',async()=>{
  const previous=globalThis.fetch;let unavailable=true;globalThis.fetch=async url=>{if(unavailable)throw new Error('artwork offline');return new Response(await fs.readFile(new URL(url)));};
  let prepared;
  try{await assert.rejects(prepareAuthoredAssets('high'),/artwork offline/);assert.equal(trimAuthoredAssets({}).reservations,0);unavailable=false;prepared=await prepareAuthoredAssets('high');assert.equal(prepared.catalogue.templates.size,126);assert.equal(authoredAssetState(),null);prepared.release();assert.equal(trimAuthoredAssets({}).catalogues.length,0);}
  finally{prepared?.release();clearAuthoredAssets();trimAuthoredAssets({});globalThis.fetch=previous;}
});
