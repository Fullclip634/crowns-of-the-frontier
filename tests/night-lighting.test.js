import test from 'node:test';
import assert from 'node:assert/strict';
import {Color} from 'three';
import {DayNightLighting} from '../src/day-night.js';

const fixture=(mode='night')=>({
  settings:{lighting:mode},sim:{time:0},
  scene:{background:new Color(0xa5b4ad),fog:{color:new Color()},environmentIntensity:.3},
  hemi:{groundColor:new Color(0x52633a),color:new Color(0xc7def1),intensity:.9},
  sun:{color:new Color(0xffe4bd),intensity:2.7},renderer:{toneMappingExposure:1.1},
  fogMesh:{material:{color:new Color(0xffffff)}},
  materials:{structurePalette:{frontierUniforms:{night:{value:0}}}},
});
const snapshot=v=>({sun:v.sun.intensity,hemi:v.hemi.intensity,background:v.scene.background.clone(),sunColor:v.sun.color.clone(),exposure:v.renderer.toneMappingExposure,environment:v.scene.environmentIntensity,fog:v.fogMesh.material.color.clone()});

test('night lighting is idempotent across repeated frames instead of compounding toward black',()=>{
  const v=fixture('night'),lighting=new DayNightLighting(v);lighting.update(.016);
  const first=snapshot(v);
  for(let frame=0;frame<180;frame++)lighting.update(.016);
  const last=snapshot(v);
  assert.ok(Math.abs(last.sun-first.sun)<1e-9,'moon intensity does not decay');
  assert.ok(Math.abs(last.hemi-first.hemi)<1e-9,'fill light does not decay');
  assert.ok(Math.abs(last.exposure-first.exposure)<1e-9,'exposure does not drift');
  assert.ok(last.background.equals(first.background),'the night sky is stable');
  assert.ok(last.sunColor.equals(first.sunColor),'moonlight colour is stable');
  assert.ok(last.fog.equals(first.fog),'fog overlay is stable');
});

test('switching between day and night fully restores the daylight palette',()=>{
  const v=fixture('cycle');v.settings.reducedMotion=true;
  const lighting=new DayNightLighting(v),day=snapshot(fixture('cycle'));
  lighting.update(.016);
  assert.equal(v.lightingState.label,'Day');
  assert.ok(v.scene.background.equals(day.background));
  v.settings.lighting='night';lighting.update(.016);
  assert.equal(v.lightingState.label,'Night');
  assert.ok(v.scene.background.r<day.background.r*.5,'the sky really turns to night');
  v.settings.lighting='day';lighting.update(.016);
  assert.ok(v.scene.background.equals(day.background),'daylight returns exactly');
  assert.ok(Math.abs(v.sun.intensity-day.sun)<1e-9);
  assert.ok(v.sun.color.equals(day.sunColor));
  assert.ok(Math.abs(v.renderer.toneMappingExposure-day.exposure)<1e-9);
});

test('a moonlit night stays readable while reading unmistakably as night',()=>{
  const v=fixture('night'),lighting=new DayNightLighting(v);lighting.update(.016);
  assert.ok(v.sun.intensity>.9,'the moon still lights the battlefield');
  assert.ok(v.hemi.intensity>.55,'the ground retains blue fill light');
  assert.ok(v.sun.color.b>v.sun.color.r,'moonlight is cool');
  assert.ok(v.scene.environmentIntensity>.15,'materials keep ambient response');
  assert.ok(v.renderer.toneMappingExposure>1.15,'exposure compensates for the dark sky');
  assert.ok(v.hemi.groundColor.b>v.hemi.groundColor.r,'ground bounce is blue, not black');
  assert.equal(v.materials.structurePalette.frontierUniforms.night.value,1,'warm structure windows glow');
  assert.equal(v.lightingState.night,1);
});

test('weather keeps authority over clouds and lightning while night modulates it',()=>{
  const v=fixture('night'),lighting=new DayNightLighting(v),base={background:new Color(0xa5b4ad),sun:new Color(0xffe4bd),hemi:new Color(0xc7def1)};
  let moon=0;
  for(let frame=0;frame<40;frame++){
    // WeatherRenderer writes absolute, cloud-dimmed values before each night pass.
    v.scene.background.copy(base.background).lerp(new Color(0x637780),.3);
    v.sun.color.copy(base.sun);v.sun.intensity=2.7*(1-.3*.72);
    v.hemi.color.copy(base.hemi);v.hemi.intensity=.9-.3*.22;
    v.hemi.groundColor.copy(new Color(0x52633a));
    lighting.update(.016);
    if(!frame)moon=v.sun.intensity;
    assert.ok(Math.abs(v.sun.intensity-moon)<1e-6,'no compounding across weather frames');
  }
  v.weatherState={flash:true};v.sun.intensity=4.7;lighting.update(.016);
  assert.ok(v.sun.intensity>1.5,'lightning still flashes at night');
  lighting.dispose();
  assert.equal(v.materials.structurePalette.frontierUniforms.night.value,0);
});

test('disposal restores every daylight resource including colours and intensities',()=>{
  const v=fixture('night'),before=snapshot(v),hemiColor=v.hemi.color.clone(),ground=v.hemi.groundColor.clone();
  const lighting=new DayNightLighting(v);lighting.update(.016);lighting.dispose();
  const after=snapshot(v);
  assert.ok(after.background.equals(before.background));
  assert.ok(after.sunColor.equals(before.sunColor));
  assert.ok(after.fog.equals(before.fog));
  assert.ok(v.hemi.color.equals(hemiColor));
  assert.ok(v.hemi.groundColor.equals(ground));
  assert.ok(Math.abs(after.sun-before.sun)<1e-9);
  assert.ok(Math.abs(after.hemi-before.hemi)<1e-9);
  assert.ok(Math.abs(after.exposure-before.exposure)<1e-9);
  assert.ok(Math.abs(after.environment-before.environment)<1e-9);
});
