import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {WorldView} from '../src/world.js';
import {wakeFoamTexture} from '../src/battle-effects.js';
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

test('WorldView.effect pools attack meshes without allocating unique geometries per swing',()=>{
  const view=effectView('high');
  const attacker={kind:'unit',type:'knight',x:0,z:0},rangedAttacker={kind:'unit',type:'archer',x:1,z:0},target={kind:'unit',type:'spearman',x:4,z:0};
  view.effect({type:'attack',entity:attacker,target});
  view.effect({type:'attack',entity:rangedAttacker,target});
  assert.equal(view.fx.length,2);
  const geometries=view.fx.map(f=>view.flightEffects.geometry[f.kind]);
  let disposed=0;for(const g of geometries)g.addEventListener('dispose',()=>disposed++);
  assert.equal(typeof view.fx[0].recycle,'function');
  assert.equal(typeof view.fx[1].recycle,'function');
  view.fx[0].recycle(view.fx[0].object);
  assert.equal(disposed,0,'recycling an attack effect keeps its shared geometry alive');
  view.effect({type:'attack',entity:attacker,target});
  assert.equal(view.fx[2].object,view.fx[0].object,'pooled attack mesh is reused');
  view.flightEffects.dispose();
  assert.equal(disposed,2,'shared geometries dispose only on pool teardown');
});

test('hidden enemy deaths and healing use no transient effect budget',()=>{
  const view=effectView('low');
  view.sim={options:{},isVisible:x=>x<0};
  view.groundHeight=()=>1;
  const house={kind:'building',type:'house',owner:1,x:9,z:0,r:2};
  const soldier={kind:'unit',type:'swordsman',owner:1,x:12,z:0};
  view.effect({type:'death',entity:house});
  view.effect({type:'heal',entity:soldier,target:soldier});
  assert.equal(view.fx.length,0);
  assert.equal(view.impactEffects,undefined);

  view.effect({type:'death',entity:{...house,x:-2}});
  view.effect({type:'heal',entity:soldier,target:{...soldier,x:-3}});
  assert.deepEqual(view.fx.map(f=>f.object.userData.impactKind),['burst','sparks','burst','crater','heal']);

  view.sim.options.spectator=true;
  view.effect({type:'heal',entity:soldier,target:soldier});
  assert.equal(view.fx.at(-1).object.position.x,soldier.x);
  view.impactEffects.dispose();
});

test('fog suppresses existing particles and decals while their lifetimes advance',()=>{
  const view=effectView('low');
  let seen=true;
  view.sim={isVisible:()=>seen};
  view.battleFog={enabled:{value:1}};
  view.groundHeight=()=>1;
  view.burst(8,3);
  view.sparks(8,2,3);
  view.crater(8,3,1,12);
  view.wake(8,3,0);

  const [burst,sparks,crater,wake]=view.fx;
  const [burstMatrix,sparkMatrix]=[burst.object,sparks.object].map(object=>object.instanceMatrix);
  const versions=[burstMatrix.version,sparkMatrix.version];
  seen=false;
  view.updateBattleEffects(.1,.1);
  assert.ok(view.fx.every(f=>f.time===.1&&!f.object.visible));
  assert.deepEqual([burstMatrix.version,sparkMatrix.version],versions);

  seen=true;
  view.updateBattleEffects(.05,.05);
  assert.ok(view.fx.every(f=>f.object.visible));
  assert.equal(burstMatrix.updateRanges[0].count,burst.object.count*16);
  assert.equal(sparkMatrix.updateRanges[0].count,sparks.object.count*16);
  assert.ok(crater.object.material.opacity<.7&&wake.object.material.opacity<.38);

  seen=false;
  view.updateBattleEffects(0,12);
  assert.equal(view.fx.includes(crater),false);
  assert.equal(crater.object.parent,null);
  view.battleFog.enabled.value=0;
  view.updateBattleEffects(0,0);
  assert.ok(view.fx.every(f=>f.object.visible));
  view.impactEffects.dispose();
});

test('ship wakes use feathered seafoam textures, obey water boundaries and dissolve smoothly',()=>{
  const tex=wakeFoamTexture(64),data=tex.image.data;
  assert.equal(tex.flipY,false,'DataTexture stays flipY=false so WebGL 2 and WebGPU orient stern-to-tail identically');
  for(let i=0;i<64;i++){
    assert.equal(data[i*4+3],0,'stern border stays fully feathered');
    assert.equal(data[((63*64)+i)*4+3],0,'aft trailing border stays fully feathered');
    assert.equal(data[(i*64)*4+3],0,'port border stays fully feathered');
    assert.equal(data[(i*64+63)*4+3],0,'starboard border stays fully feathered');
  }
  let maxInside=0;
  for(let y=8;y<48;y++)for(let x=8;x<56;x++)maxInside=Math.max(maxInside,data[(y*64+x)*4+3]);
  assert.ok(maxInside>100,'interior carries visible seafoam wake texture');
  tex.dispose();

  const view=effectView('high');
  view.battleFog={enabled:{value:0}};
  view.sim={isVisible:()=>true,isWater:(x,z)=>z>0};
  // Stern on dry beach (z <= 0) or trailing aft onto dry beach must not spawn a wake.
  view.wake(0,-1,0,1);
  view.wake(0,2,0,1); // heading=0 -> aft tail reaches z = 2 - 2.9 = -0.9 (dry land)
  assert.equal(view.fx.length,0,'shoreline and dry-sand wakes are suppressed');

  // Open water wake spawns cleanly with feathered map and polygon offset.
  view.wake(0,8,0,1);
  assert.equal(view.fx.length,1);
  const [wake]=view.fx;
  assert.ok(wake.object.material.map,'wake uses procedural feathered seafoam texture');
  assert.equal(wake.object.material.polygonOffset,true);
  assert.equal(wake.object.material.depthWrite,false);
  const startOpacity=wake.object.material.opacity;
  view.updateBattleEffects(.23,.23);
  const peakOpacity=wake.object.material.opacity;
  view.updateBattleEffects(.65,.65);
  const lateOpacity=wake.object.material.opacity;
  assert.ok(peakOpacity>startOpacity&&peakOpacity<.38,'wake fades in softly without popping');
  assert.ok(lateOpacity<peakOpacity,'wake dissolves smoothly over its lifetime');
  view.impactEffects.dispose();
});
