import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {Simulation} from '../src/simulation.js';
import {
  MINIMAP_FILTERS,
  TacticalAlerts,
  minimapFilterStyle,
  needsDemolishConfirm,
  resolveCommandDecalKind,
  resolveCursorState,
} from '../src/tactical-ux.js';
import {SelectionOverlays} from '../src/selection-overlays.js';
import {drawMinimap} from '../src/minimap.js';
import {DEFAULT_BINDINGS, controlForKey, readBindings} from '../src/controls.js';

test('resolveCursorState and resolveCommandDecalKind map battlefield context cleanly',()=>{
  const sim=new Simulation({mode:'skirmish',map:'highlands',seed:303});
  const villager=sim.owned(0,'unit','villager')[0];
  const scout=sim.owned(0,'unit','scout')[0];
  const monk=sim.addUnit('monk',0,villager.x+2,villager.z);
  const enemy=sim.owned(1,'unit')[0];
  const tree=sim.entities.find(e=>e.kind==='resource'&&e.type==='wood');
  const tc=sim.owned(0,'building','towncenter')[0];
  const hurtBuilding=sim.addBuilding('barracks',0,tc.x+10,tc.z,true);
  hurtBuilding.hp=100;
  scout.hp=20;

  assert.equal(resolveCursorState(sim,[villager],null,{pingMode:true}),'ping');
  assert.equal(resolveCursorState(sim,[villager],null,{buildType:'house'}),'build');
  assert.equal(resolveCursorState(sim,[scout],null,{attackMove:true}),'attack');
  assert.equal(resolveCursorState(sim,[scout],null,{tacticalMode:'patrol'}),'patrol');
  assert.equal(resolveCursorState(sim,[scout],null,{tacticalMode:'guard'}),'guard');
  assert.equal(resolveCursorState(sim,[scout],enemy,{}),'attack');
  assert.equal(resolveCursorState(sim,[villager],tree,{}),'gather');
  assert.equal(resolveCursorState(sim,[villager],hurtBuilding,{}),'repair');
  assert.equal(resolveCursorState(sim,[monk],scout,{}),'heal');
  assert.equal(resolveCursorState(sim,[tc],null,{}),'rally');

  assert.equal(resolveCommandDecalKind(sim,[scout],enemy,{}),'attack');
  assert.equal(resolveCommandDecalKind(sim,[villager],tree,{}),'gather');
  assert.equal(resolveCommandDecalKind(sim,[scout],null,{tacticalMode:'patrol'}),'patrol');
  assert.equal(resolveCommandDecalKind(sim,[tc],null,{}),'rally');
  assert.equal(resolveCommandDecalKind(sim,[scout],null,{}),'move');
});

test('TacticalAlerts coalesces danger spam, cycles alert history, and expires old ripples',()=>{
  const alerts=new TacticalAlerts();
  assert.ok(alerts.record(10,20,'danger','Under attack',1000));
  // Within 1.4s and 14m -> coalesced into existing danger ripple
  alerts.record(12,22,'danger','Under attack',1500);
  assert.equal(alerts.history.length,1);
  // Distinct flare adds cleanly
  assert.ok(alerts.record(-30,15,'flare','Tactical flare',2000));
  assert.equal(alerts.history.length,2);
  assert.equal(alerts.activeRipples(2500).length,2);

  const first=alerts.cycleNext();
  const second=alerts.cycleNext();
  assert.equal(first.kind,'flare');
  assert.equal(second.kind,'danger');
  // Expired after 10s
  assert.equal(alerts.activeRipples(12000).length,0);
});

test('minimapFilterStyle emphasizes war vs economy targets and needsDemolishConfirm guards key structures',()=>{
  assert.deepEqual(MINIMAP_FILTERS.map(f=>f.id),['all','combat','economy']);
  assert.equal(minimapFilterStyle('combat',{kind:'resource',type:'gold'}),'hidden');
  assert.equal(minimapFilterStyle('combat',{kind:'unit',type:'knight'}),'highlight');
  assert.equal(minimapFilterStyle('combat',{kind:'unit',type:'villager'}),'muted');
  assert.equal(minimapFilterStyle('economy',{kind:'resource',type:'gold'}),'highlight');
  assert.equal(minimapFilterStyle('economy',{kind:'unit',type:'villager'}),'highlight');
  assert.equal(minimapFilterStyle('economy',{kind:'unit',type:'knight'}),'muted');

  assert.equal(needsDemolishConfirm({kind:'building',type:'keep',progress:1}),true);
  assert.equal(needsDemolishConfirm({kind:'building',type:'wonder',progress:1}),true);
  assert.equal(needsDemolishConfirm({kind:'building',type:'house',progress:1}),false);
  assert.equal(needsDemolishConfirm({kind:'building',type:'keep',progress:.5}),false);
});

test('SelectionOverlays renders command decals, Shift-queue waypoints, and flare beacons in existing batches',()=>{
  const sim=new Simulation({mode:'skirmish',map:'highlands',seed:303});
  const scout=sim.owned(0,'unit','scout')[0];
  scout.order={type:'move',x:scout.x+8,z:scout.z+6};
  scout.orders=[{type:'attackmove',x:scout.x+18,z:scout.z+12},{type:'patrol',x:scout.x+24,z:scout.z+4}];

  const alerts=new TacticalAlerts();
  alerts.record(scout.x+10,scout.z-6,'flare','Flare',performance.now());
  const view={
    sim,
    scene:new THREE.Scene(),
    clock:1.2,
    angle:Math.PI/4,
    selection:new Set([scout.id]),
    tacticalAlerts:alerts,
    groundHeight:()=>0,
    settings:{reducedMotion:false},
  };
  const overlays=new SelectionOverlays(view);
  try{
    overlays.addCommandDecal(scout.x+6,scout.z+2,'attack',false);
    overlays.update(false);
    assert.ok(view.selectionOverlayDiagnostics.waypoints>=3,'renders active + queued Shift waypoints');
    assert.ok(view.selectionOverlayDiagnostics.decals>=1,'renders active command confirmation decal');
    assert.ok(view.selectionOverlayDiagnostics.rallyDots>0,'renders dotted ground path between queued waypoints');
    assert.ok(view.selectionOverlayDiagnostics.rings>=6,'unit ring + waypoints + double attack decal + flare beacon');
  }finally{
    overlays.dispose();
  }
});

test('controls module exposes Backspace jump-to-alert hotkey by default',()=>{
  assert.equal(DEFAULT_BINDINGS['last-alert'],'backspace');
  const bindings=readBindings();
  assert.equal(controlForKey('backspace',bindings),'last-alert');
});

test('drawMinimap renders a clean rectangular camera locator rather than a skewed horizon wedge',()=>{
  const sim=new Simulation({mode:'skirmish',map:'highlands',seed:303});
  const camera=new THREE.PerspectiveCamera(46,16/9,.5,400);
  camera.position.set(28,36,28);camera.lookAt(0,0,0);camera.updateMatrixWorld();camera.updateProjectionMatrix();
  const rectStrokes=[];
  const ctx={
    clearRect(){},fillRect(){},drawImage(){},beginPath(){},moveTo(){},lineTo(){},arc(){},closePath(){},stroke(){},fill(){},
    strokeRect(x,y,w,h){rectStrokes.push({x,y,w,h});},
  };
  const canvas={width:200,height:200,getContext:()=>ctx};
  const view={camera,target:{x:0,z:0},zoom:40,groundHeight:()=>0};
  drawMinimap(canvas,sim,view,{fog:false});
  assert.ok(rectStrokes.length>=1,'camera viewport drawn via crisp strokeRect');
  const camRect=rectStrokes.at(-1);
  assert.ok(camRect.w>10&&camRect.w<110&&camRect.h>10&&camRect.h<110,`compact square/rectangular radar frame (${camRect.w.toFixed(1)}x${camRect.h.toFixed(1)})`);
});
