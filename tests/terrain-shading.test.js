import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {Landscape} from '../src/landscape.js';
import {applyTerrainShading} from '../src/terrain-surface.js';

test('reused terrain materials remove obsolete detail samplers and shader flags when lowering quality',()=>{
  const original=globalThis.document,context={fillRect(){},beginPath(){},moveTo(){},lineTo(){},stroke(){}};
  globalThis.document={createElement:()=>({getContext:()=>context})};
  const material=new THREE.MeshStandardMaterial(),land=new Landscape(512,'highlands');
  const surfaces=Object.fromEntries(['grass','soil','rock'].map(role=>[role,Object.fromEntries(['color','normal','arm'].map(kind=>[kind,new THREE.Texture()]))]));
  try{
    material.defines={KEEP_EXISTING:''};
    applyTerrainShading(material,land,'high',surfaces,{});
    const roads=material.frontierOwnedTextures[0],highVersion=material.version,highKey=material.customProgramCacheKey();let disposed=0;roads.addEventListener('dispose',()=>disposed++);
    assert.ok(Object.hasOwn(material.defines,'FRONTIER_TERRAIN_ARM'));
    applyTerrainShading(material,land,'medium',surfaces,{});
    assert.equal(disposed,1);assert.equal(Object.hasOwn(material.defines,'FRONTIER_TERRAIN_ARM'),false);assert.ok(Object.hasOwn(material.defines,'KEEP_EXISTING'));
    assert.equal(material.normalMap,surfaces.grass.normal);assert.ok(material.version>highVersion);assert.notEqual(material.customProgramCacheKey(),highKey);
    for(const role of ['grass','soil','rock'])assert.equal(material.frontierTerrainUniforms[role+'Arm'].value,null);
    applyTerrainShading(material,land,'low',surfaces,{});assert.equal(material.normalMap,null);
    for(const role of ['grass','soil','rock'])assert.equal(material.frontierTerrainUniforms[role+'Normal'].value,null);
    applyTerrainShading(material,land,'high',surfaces,{});assert.ok(Object.hasOwn(material.defines,'FRONTIER_TERRAIN_ARM'));assert.equal(material.frontierTerrainUniforms.soilArm.value,surfaces.soil.arm);
  }finally{globalThis.document=original;for(const texture of material.frontierOwnedTextures||[])texture.dispose();material.dispose();for(const maps of Object.values(surfaces))for(const texture of Object.values(maps))texture.dispose();}
});
