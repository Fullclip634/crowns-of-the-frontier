import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {WorldView} from '../src/world.js';
import {VFX_QUALITY_BUDGETS,vfxBudget,particleCount,effectsAllowed,createFrameTimer,vfxFrameReport} from '../src/vfx-budget.js';

test('quality budgets are explicit, frozen and ordered',()=>{
  for(const budget of Object.values(VFX_QUALITY_BUDGETS))assert.ok(Object.isFrozen(budget));
  assert.ok(Object.isFrozen(VFX_QUALITY_BUDGETS));
  assert.ok(VFX_QUALITY_BUDGETS.low.effects<VFX_QUALITY_BUDGETS.medium.effects);
  assert.ok(VFX_QUALITY_BUDGETS.low.events<VFX_QUALITY_BUDGETS.medium.events);
  assert.ok(VFX_QUALITY_BUDGETS.low.baseParticles<VFX_QUALITY_BUDGETS.high.baseParticles);
  assert.equal(vfxBudget('unknown'),VFX_QUALITY_BUDGETS.medium);
  assert.equal(vfxBudget('low').effects,24);
  assert.equal(vfxBudget('medium').effects,70);
});

test('particle density falls under measured frame pressure but never disappears or exceeds the pool',()=>{
  const full=particleCount(12,0,'high');
  assert.equal(full,12);
  assert.ok(particleCount(12,0,'low')<full,'low quality starts sparser');
  let previous=full;
  for(const pressure of [.2,.4,.6,.8,1]){
    const count=particleCount(12,pressure,'high');
    assert.ok(count<=previous,'pressure never adds particles');
    assert.ok(count>=2&&count<=12,'always a readable, bounded spark pair');
    previous=count;
  }
  assert.equal(particleCount(8,-5,'high'),8);
  assert.equal(particleCount(8,99,'high'),particleCount(8,1,'high'));
  assert.equal(effectsAllowed(23,24),true);
  assert.equal(effectsAllowed(24,24),false);
});

test('the frame timer reports real timing, ramps pressure and ignores spikes and invalid deltas',()=>{
  const timer=createFrameTimer({targetSeconds:1/60});
  for(let i=0;i<60;i++)timer.sample(1/60);
  let report=timer.report();
  assert.equal(report.targetFPS,60);
  assert.ok(Math.abs(report.estimatedFPS-60)<1);
  assert.equal(report.pressure,0);
  assert.equal(report.samples,60);
  assert.equal(timer.sample(0),0);
  assert.equal(timer.sample(-1),0);
  assert.equal(timer.sample(Number.NaN),0);
  for(let i=0;i<120;i++)timer.sample(.040);
  report=timer.report();
  assert.ok(report.pressure>.3&&report.pressure<=1,'sustained 25 FPS raises pressure');
  assert.ok(report.estimatedFPS<50);
  assert.ok(report.worstFrameMs>=40);
  assert.ok(report.overBudgetRatio>0);
  assert.ok(Object.values(report).every(Number.isFinite));
  // One long hitch is clamped and smoothed, not treated as a permanent stall.
  const single=createFrameTimer({targetSeconds:1/60});
  for(let i=0;i<60;i++)single.sample(1/60);
  assert.equal(single.sample(5),0);
});

test('the frame report combines timing, effect counts and draw-call usage',()=>{
  const timer=createFrameTimer();
  for(let i=0;i<30;i++)timer.sample(.016);
  const view={vfxTimer:timer,renderQuality:'low',fx:[{},{},{}],renderer:{info:{render:{calls:42,triangles:9000}}}};
  const report=vfxFrameReport(view);
  assert.equal(report.quality,'low');
  assert.equal(report.effectLimit,24);
  assert.equal(report.eventLimit,32);
  assert.equal(report.activeEffects,3);
  assert.equal(report.drawCalls,42);
  assert.equal(report.triangles,9000);
  assert.ok(report.averageFrameMs>0);
  const empty=vfxFrameReport(null);
  assert.equal(empty.activeEffects,0);
  assert.equal(empty.drawCalls,0);
  assert.equal(empty.samples,0);
});

function effectView(quality,pressure=0){
  const view=Object.create(WorldView.prototype);
  view.settings={quality};view.renderQuality=quality;view.scene=new THREE.Scene();view.fx=[];
  view.vfxTimer=createFrameTimer({targetSeconds:1/60});
  if(pressure)for(let i=0;i<200;i++)view.vfxTimer.sample(.05);
  return view;
}

test('WorldView spawns bounded, pooled particle batches and exposes a report',()=>{
  const rich=effectView('high');
  rich.burst(0,0);rich.sparks(0,1,0);
  assert.equal(rich.fx.length,2);
  assert.equal(rich.fx[0].object.count,8);
  assert.equal(rich.fx[1].object.count,12);
  const report=rich.vfxReport();
  assert.equal(report.activeEffects,2);
  assert.equal(report.effectLimit,70);
  assert.ok(Number.isFinite(report.averageFrameMs));
  rich.impactEffects.dispose();

  const lean=effectView('low',1);
  for(let i=0;i<40;i++)lean.burst(i,0);
  assert.equal(lean.fx.length,24,'low-quality effect cap is enforced');
  const counts=lean.fx.map(f=>f.object.count);
  assert.ok(counts.every(count=>count>=2&&count<8),'measured pressure thins every burst');
  assert.ok(Math.max(...counts)<8,'no batch uses the full high-quality particle count');
  lean.impactEffects.dispose();
});
