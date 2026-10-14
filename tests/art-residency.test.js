import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as THREE from 'three';
import {loadAuthoredAssets,trimAuthoredAssets,clearAuthoredAssets} from '../src/authored-assets.js';

test('quality caches release unused catalogues, preserve scene and portrait geometry, and reload an evicted preset',async()=>{
  const original=globalThis.fetch,calls=[];globalThis.fetch=async url=>{const name=new URL(url).pathname.split('/').at(-1);calls.push(name);return new Response(fs.readFileSync(new URL('../src/assets3d/'+name,import.meta.url)));};
  try{
    const low=await loadAuthoredAssets('low'),medium=await loadAuthoredAssets('medium'),view={scene:new THREE.Scene(),modelPortrait:{scene:new THREE.Scene()}},root=low.templates.get('unit:archer').clone(true);view.scene.add(root);
    let disposed=0;for(const geometry of low.geometries)geometry.addEventListener('dispose',()=>disposed++);
    assert.deepEqual(trimAuthoredAssets(view).catalogues,['low','medium']);assert.equal(disposed,0,'an old scene remains safe while its replacement loads');
    view.scene.remove(root);view.modelPortrait.scene.add(root);assert.equal(trimAuthoredAssets(view).evicted,0,'a visible portrait can still use source geometry');
    view.modelPortrait.scene.remove(root);view.scene.add(medium.templates.get('unit:archer').clone(true));
    const result=trimAuthoredAssets(view);assert.deepEqual(result.catalogues,['medium']);assert.equal(result.bytes,medium.bytes);assert.equal(disposed,low.geometries.size);
    for(const geometry of medium.geometries)assert.ok(view.authoredGeometry.has(geometry));
    const reloaded=await loadAuthoredAssets('low');assert.notEqual(reloaded,low);assert.equal(calls.filter(n=>n==='frontier-low.glb').length,2);
    view.scene.clear();assert.deepEqual(trimAuthoredAssets(view).catalogues,['low']);
  }finally{globalThis.fetch=original;clearAuthoredAssets();}
});
