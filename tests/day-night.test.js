import test from 'node:test';
import assert from 'node:assert/strict';
import {Color} from 'three';
import {lightingAt,DayNightLighting} from '../src/day-night.js';
import {treeDetail} from '../src/tree-lod.js';

test('lighting modes and the day/night cycle are stable, gradual and independent of simulation randomness',()=>{
  assert.equal(lightingAt(500,'day').night,0);assert.equal(lightingAt(0,'night').night,1);assert.equal(lightingAt(500,'unknown').night,0);
  assert.equal(lightingAt(0,'cycle').night,0);assert.equal(lightingAt(600,'cycle').night,1);assert.equal(lightingAt(1080,'cycle').night,0);
  for(let time=1;time<=1080;time++)assert.ok(Math.abs(lightingAt(time,'cycle').night-lightingAt(time-1,'cycle').night)<.02);
});

test('moonlight stays readable, retains lightning and restores daylight resources on disposal',()=>{
  const v={settings:{lighting:'night'},sim:{time:0},scene:{background:new Color(0xa5b4ad),fog:{color:new Color()},environmentIntensity:.3},hemi:{groundColor:new Color(0x52633a),color:new Color(0xc7def1),intensity:.9},sun:{color:new Color(0xffe4bd),intensity:2.7},renderer:{toneMappingExposure:1.1},fogMesh:{material:{color:new Color(0xffffff)}},materials:{structurePalette:{frontierUniforms:{night:{value:0}}}}};
  const lighting=new DayNightLighting(v),ground=v.hemi.groundColor.clone();lighting.update(.016);
  assert.equal(v.lightingState.label,'Night');assert.ok(v.sun.intensity>.4&&v.hemi.intensity>.4);assert.equal(v.materials.structurePalette.frontierUniforms.night.value,1);
  v.weatherState={flash:true};v.sun.intensity=4.7;lighting.update(.016);assert.ok(v.sun.intensity>1.5);
  lighting.dispose();assert.equal(v.scene.environmentIntensity,.3);assert.equal(v.renderer.toneMappingExposure,1.1);assert.deepEqual(v.hemi.groundColor,ground);assert.equal(v.materials.structurePalette.frontierUniforms.night.value,0);
});

test('tree detail does not flicker under small camera changes and resets on a quality change',()=>{
  let state=treeDetail(35,'high');assert.ok(state.near);
  for(const height of [33,34,32,31,28]){state=treeDetail(height,'high',state);assert.ok(state.near);}
  state=treeDetail(23,'high',state);assert.equal(state.near,false);assert.equal(treeDetail(29,'high',state).near,false);assert.equal(treeDetail(31,'high',state).near,true);
  assert.equal(treeDetail(50,'low',state).near,false);assert.equal(treeDetail(57,'medium').near,true);assert.equal(treeDetail(101,'low').near,true);
});
