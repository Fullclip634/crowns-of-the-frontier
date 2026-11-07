import test from 'node:test';
import assert from 'node:assert/strict';
import {Landscape} from '../src/landscape.js';
import {MAPS} from '../src/data.js';
import {terrainReliefSamples,terrainClarityPixels,CLARITY_RESOLUTION} from '../src/terrain-clarity.js';

test('hillshade is deterministic, bounded and derived from the real height field',()=>{
  const a=terrainReliefSamples(new Landscape(512,'highlands',400));
  const b=terrainReliefSamples(new Landscape(512,'highlands',400));
  assert.equal(a.resolution,CLARITY_RESOLUTION);
  assert.equal(a.shade.length,CLARITY_RESOLUTION**2);
  assert.deepEqual(Array.from(a.shade),Array.from(b.shade),'the same seed produces identical shading');
  // Float32Array storage rounds the clamp bounds by ~1e-8.
  for(const value of a.shade)assert.ok(value>=.42-1e-6&&value<=1.24+1e-6&&Number.isFinite(value));
  assert.ok(a.diagnostics.min<.95,'lee slopes receive real shadow');
  assert.ok(a.diagnostics.max>1.02,'sun-facing slopes receive real light');
  assert.ok(a.diagnostics.max-a.diagnostics.min>.12,'the land reads as three-dimensional');
  assert.ok(a.diagnostics.exposed>0,'steep faces expose bedrock');
  assert.ok(a.diagnostics.cell>0);
});

test('different map seeds and terrain profiles produce distinct, readable relief',()=>{
  const highlands=terrainReliefSamples(new Landscape(512,'highlands',400));
  const canyon=terrainReliefSamples(new Landscape(512,'canyon',400));
  const other=terrainReliefSamples(new Landscape(913,'highlands',400));
  assert.notDeepEqual(Array.from(highlands.shade.slice(0,64)),Array.from(canyon.shade.slice(0,64)));
  assert.notDeepEqual(Array.from(highlands.shade.slice(0,64)),Array.from(other.shade.slice(0,64)));
  for(const land of Object.keys(MAPS)){
    const samples=terrainReliefSamples(new Landscape(512,land,400));
    assert.ok(samples.shade.every(Number.isFinite),`${land} has finite relief`);
    assert.ok(samples.diagnostics.max-samples.diagnostics.min>.02,`${land} is not a flat wash`);
  }
});

test('clarity overlays fit one RGBA buffer each with bounded alpha and no NaN',()=>{
  const clarity=terrainClarityPixels(new Landscape(512,'highlands',400));
  assert.equal(clarity.relief.length,CLARITY_RESOLUTION**2*4);
  assert.equal(clarity.rock.length,CLARITY_RESOLUTION**2*4);
  assert.ok(clarity.relief instanceof Uint8ClampedArray);
  let reliefAlpha=0,rockAlpha=0;
  for(let i=3;i<clarity.relief.length;i+=4){
    reliefAlpha=Math.max(reliefAlpha,clarity.relief[i]);rockAlpha=Math.max(rockAlpha,clarity.rock[i]);
  }
  assert.ok(reliefAlpha>30&&reliefAlpha<=160,'shadows are visible but never crush the land');
  assert.ok(rockAlpha>0&&rockAlpha<=108,'bedrock stays a subtle exposure');
  assert.equal(clarity.diagnostics.exposed>0,true);
});
