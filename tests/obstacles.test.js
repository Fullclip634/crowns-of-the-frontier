import test from 'node:test';
import assert from 'node:assert/strict';
import {Simulation,distance} from '../src/simulation.js';
import {clearSegment} from '../src/navigation.js';
import {battlePreset} from '../src/custom-battle.js';
const advance=(sim,seconds)=>{for(let i=0;i<seconds*10;i++)sim.tick(.1);};

test('trees and mineral deposits block construction and movement until harvested',()=>{
  for(const type of ['wood','gold','stone']){
    const sim=new Simulation({mode:'sandbox',seed:512});sim.entities=sim.entities.filter(e=>e.kind!=='resource');sim.index=new Map(sim.entities.map(e=>[e.id,e]));sim.revision++;sim.visible.fill(1);sim.stop(sim.owned(0,'unit').map(e=>e.id));
    sim.grid(0);const source=sim.addResource(type,0,20,6),worker=sim.addUnit('villager',0,0,15),scout=sim.addUnit('scout',0,-8,20);
    assert.equal(sim.buildValid('house',0,20),false);assert.equal(clearSegment(sim,sim.grid(0),scout,{x:8,z:20}),false);
    const route=sim.pathTo(scout,{x:8,z:20});assert.equal(scout.pathStatus,'ready');assert.ok(route.some(point=>Math.abs(point.z-20)>=1));
    const bank=sim.players[0].resources[type];sim.command([worker.id],{type:'gather',target:source.id});advance(sim,30);
    assert.equal(source.hp,0);assert.ok(sim.players[0].resources[type]>=bank+5.99);assert.equal(sim.buildValid('house',0,20),true);assert.equal(clearSegment(sim,sim.grid(0),scout,{x:8,z:20}),true);
  }
});

test('harbor placement respects shoreline trees and starting harbors have clear footprints',()=>{
  const sim=new Simulation({mode:'sandbox',map:'coast'});for(const e of sim.entities)if(e.kind==='resource')e.hp=0;sim.revision++;sim.visible.fill(1);assert.equal(sim.buildValid('dock',-20,-60),true);
  const tree=sim.addResource('wood',-20,-60,300);assert.equal(sim.buildValid('dock',-20,-60),false);tree.hp=0;sim.revision++;assert.equal(sim.buildValid('dock',-20,-60),true);
  for(const mode of ['tides','custom']){const coast=new Simulation({mode,map:'coast',slots:battlePreset('4v4'),seed:512});for(const dock of coast.entities.filter(e=>e.type==='dock'))assert.equal(coast.entities.some(e=>e.hp>0&&e.kind==='resource'&&!e.water&&['wood','gold','stone'].includes(e.type)&&distance(e,dock)<e.r+dock.r+.8),false);}
});

test('straight navigation cannot cut diagonal corners or cross a thin wall',()=>{
  const sim=new Simulation({mode:'sandbox'}),grid=new Uint8Array(sim.gridSize**2),from={x:1,z:21},to={x:5,z:25},cell=sim.cell(3,21);
  assert.equal(clearSegment(sim,grid,from,to),true);grid[cell.z*sim.gridSize+cell.x]=1;assert.equal(clearSegment(sim,grid,from,to),false);
  grid.fill(0);const wall=sim.cell(1,35);grid[wall.z*sim.gridSize+wall.x]=1;assert.equal(clearSegment(sim,grid,{x:1,z:21},{x:1,z:49}),false);
});

test('stable long orders keep their route when unrelated terrain changes',()=>{
  const sim=new Simulation({mode:'sandbox',map:'coast'});sim.stop(sim.owned(0,'unit').map(e=>e.id));const ship=sim.addUnit('transport',0,0,-60),original=sim.pathTo.bind(sim);let searches=0;sim.pathTo=(...args)=>{searches++;return original(...args);};
  sim.command([ship.id],{type:'move',x:0,z:60});advance(sim,12);assert.ok(ship.z>-40);assert.ok(searches<=2,`stable route searched ${searches} times`);
  const before=searches;sim.revision++;advance(sim,.2);assert.equal(searches,before);assert.equal(ship.pathStatus,'ready');
});

test('a new obstruction invalidates an existing route and separated shores remain unreachable',()=>{
  const sim=new Simulation({mode:'sandbox'});sim.entities=sim.entities.filter(e=>e.kind!=='resource');sim.index=new Map(sim.entities.map(e=>[e.id,e]));sim.revision++;sim.stop(sim.owned(0,'unit').map(e=>e.id));const unit=sim.addUnit('scout',0,-15,20),original=sim.pathTo.bind(sim);let searches=0;sim.pathTo=(...args)=>{searches++;return original(...args);};
  sim.command([unit.id],{type:'move',x:15,z:20});advance(sim,.5);const before=searches,house=sim.addBuilding('house',0,0,20,true);advance(sim,.2);assert.ok(searches>before);assert.equal(unit.pathStatus,'ready');house.hp=0;sim.revision++;advance(sim,8);assert.ok(distance(unit,{x:15,z:20})<2);
  const coast=new Simulation({mode:'sandbox',map:'coast'}),infantry=coast.addUnit('spearman',0,-25,30);assert.deepEqual(coast.pathTo(infantry,{x:25,z:30}),[]);assert.equal(infantry.pathStatus,'blocked');
});

test('a fishing boat delivers the final catch when no fish shoals remain',()=>{
  const sim=new Simulation({mode:'sandbox',map:'coast'});for(const e of sim.entities)if(e.kind==='resource')e.hp=0;sim.stop(sim.owned(0,'unit').map(e=>e.id));const boat=sim.owned(0,'unit','fishingboat')[0],fish=sim.addResource('food',boat.x,boat.z,6);fish.water=true;fish.r=2.1;
  const before=sim.players[0].resources.food;sim.command([boat.id],{type:'gather',target:fish.id});advance(sim,20);assert.equal(fish.hp,0);assert.ok(sim.players[0].resources.food>=before+5.99);assert.equal(boat.carry,0);
});

test('AI intelligence can locate publicly revealed final buildings without revealing hidden troops',()=>{
  const sim=new Simulation({mode:'custom',slots:battlePreset('2v2'),seed:512});for(const tc of sim.owned(2,'building','towncenter'))tc.hp=0;sim.revision++;sim.checkVictory();assert.ok(sim.revealedOwners.includes(2));
  const house=sim.owned(2,'building','house')[0];assert.equal(sim.canSee(0,house),true);const hidden=sim.addUnit('scout',2,190,-190);assert.equal(sim.canSee(0,hidden),false);
});

test('spatial targeting finds enemies across bucket boundaries and includes large buildings',()=>{
  const sim=new Simulation({mode:'custom',slots:battlePreset('2v2'),seed:512});const archer=sim.addUnit('archer',0,7.95,30),enemy=sim.addUnit('spearman',2,15.95,30),tower=sim.addBuilding('keep',2,23.95,30,true);enemy.stance='hold';sim.tick(.1);
  assert.equal(sim.nearest(archer,e=>e===enemy,10),enemy);assert.equal(sim.nearest(archer,e=>e===tower,14),tower);assert.equal(sim.nearest(archer,e=>e===tower,2),null);
  const originalHP=enemy.hp;advance(sim,5);assert.ok(enemy.hp<originalHP);assert.ok(distance(archer,enemy)<20);
});

test('an AI attack continues across a large map while its next raid clock resets',()=>{
  const sim=new Simulation({mode:'custom',slots:battlePreset('2v2'),seed:512}),owner=2,tc=sim.owned(owner,'building','towncenter')[0],enemy=sim.owned(0,'building','towncenter')[0];
  sim.aiStates[owner]={known:{[enemy.id]:{id:enemy.id,owner:0,kind:'building',type:'towncenter',x:enemy.x,z:enemy.z,lastSeen:0}},phase:'attack',scoutIndex:0,lastOrders:-20,lastRebalance:0,decision:0,nextAttack:500};
  for(let i=0;i<12;i++)sim.addUnit('spearman',owner,tc.x+i,tc.z+15);sim.time=200;sim.tickAI(owner);
  assert.equal(sim.aiStates[owner].phase,'attack');assert.ok(distance(sim.aiStates[owner].target,enemy)<1);assert.ok(sim.owned(owner,'unit','spearman').every(unit=>unit.order?.type==='attackmove'));
});
