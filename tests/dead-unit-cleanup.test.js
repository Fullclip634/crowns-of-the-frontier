import test from 'node:test';
import assert from 'node:assert/strict';
import {retireDeadUnits} from '../src/dead-unit-cleanup.js';
import {Simulation} from '../src/simulation.js';

test('dead units retire after a grace period while IDs, terrain records, event data and totals survive',()=>{
  const alive={id:1,kind:'unit',hp:20},dead={id:2,kind:'unit',hp:0},building={id:3,kind:'building',hp:0},resource={id:4,kind:'resource',hp:0},entities=[alive,dead,building,resource],stats={lost:1},event={type:'death',entity:dead},sim={time:0,entities,index:new Map(entities.map(e=>[e.id,e])),nextId:5,stats,events:[event]};
  assert.equal(retireDeadUnits(sim),0);sim.time=10;assert.equal(retireDeadUnits(sim),0);sim.time=20;assert.equal(retireDeadUnits(sim),0);assert.equal(sim.index.get(2),dead);
  sim.time=30;assert.equal(retireDeadUnits(sim),1);assert.equal(sim.entities,entities);assert.deepEqual(entities,[alive,building,resource]);assert.equal(sim.index.has(2),false);assert.equal(sim.nextId,5);assert.equal(sim.stats,stats);assert.equal(event.entity,dead);
  sim.time=40;assert.equal(retireDeadUnits(sim),0);
});

test('a unit that becomes alive again gets a fresh death grace period',()=>{
  const unit={id:1,kind:'unit',hp:0},sim={time:0,entities:[unit]};retireDeadUnits(sim);unit.hp=20;sim.time=10;retireDeadUnits(sim);unit.hp=0;sim.time=20;retireDeadUnits(sim);sim.time=40;assert.equal(retireDeadUnits(sim),0);sim.time=50;assert.equal(retireDeadUnits(sim),1);
});

test('retirement survives real save/restore and never reuses an archived unit ID',()=>{
  const sim=new Simulation({mode:'sandbox',seed:512}),unit=sim.addUnit('spearman',0,0,20),id=unit.id;unit.hp=0;retireDeadUnits(sim);sim.time+=30;retireDeadUnits(sim);
  const loaded=Simulation.restore(JSON.parse(JSON.stringify(sim.serialize())));assert.equal(loaded.get(id),null);assert.equal(loaded.entities.some(e=>e.id===id),false);assert.ok(loaded.addUnit('spearman',0,0,20).id>id);
});

test('a released projectile still lands after its dead source record retires',()=>{
  const sim=new Simulation({mode:'sandbox',seed:512}),source=sim.addUnit('archer',0,0,20),target=sim.addUnit('spearman',1,4,20);sim.hit(source,target);sim.time=1;sim.tickProjectiles();
  const shot=sim.projectiles.find(p=>p.stage==='flight');assert.ok(shot);shot.impactAt=50;source.hp=0;retireDeadUnits(sim);sim.time=31;retireDeadUnits(sim);assert.equal(sim.entities.includes(source),false);
  const hp=target.hp;sim.time=50;sim.tickProjectiles();assert.ok(target.hp<hp);assert.ok(sim.events.some(e=>e.type==='projectile-impact'));
});

test('normal simulation ticks retire expired dead units automatically',()=>{
  const sim=new Simulation({mode:'sandbox',seed:512}),unit=sim.addUnit('spearman',0,0,20),id=unit.id;
  unit.hp=0;
  for(let i=0;i<31;i++)sim.tick(1);
  assert.equal(sim.get(id),null);assert.equal(sim.entities.some(entity=>entity.id===id),false);assert.ok(sim.nextId>id);
});
