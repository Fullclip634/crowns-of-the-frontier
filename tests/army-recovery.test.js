import test from 'node:test';
import assert from 'node:assert/strict';
import {Simulation,distance} from '../src/simulation.js';
import {battlePreset} from '../src/custom-battle.js';

test('injured AI troops retreat into distinct dry formation slots and retain their routes',()=>{
  const sim=new Simulation({mode:'custom',map:'highlands',mapSize:'huge',seed:512,slots:battlePreset('2v2'),startAge:2}),owner=1,tc=sim.owned(owner,'building','towncenter')[0];
  const units=Array.from({length:12},(_,i)=>sim.addUnit('swordsman',owner,tc.x-40+i%4*2,tc.z+35+Math.floor(i/4)*2));for(const unit of units)unit.hp=unit.maxHp*.2;
  sim.time=400;sim.tickAI(owner);
  const points=units.map(unit=>unit.order);assert.equal(new Set(points.map(p=>p.x+':'+p.z)).size,units.length);
  for(const [i,p] of points.entries()){assert.equal(p.type,'move');assert.equal(p.aiRetreat,true);assert.equal(sim.isWater(p.x,p.z),false);assert.ok(distance(p,tc)<20);assert.equal(sim.grid(owner)[sim.cell(p.x,p.z).z*sim.gridSize+sim.cell(p.x,p.z).x],0);units[i].path=sim.pathTo(units[i],p);}
  const paths=units.map(unit=>unit.path);sim.time+=4;sim.tickAI(owner);for(let i=0;i<units.length;i++){assert.equal(units[i].order,points[i]);assert.equal(units[i].path,paths[i]);}
  const restored=Simulation.restore(JSON.parse(JSON.stringify(sim.serialize())));assert.ok(units.every(unit=>restored.get(unit.id).order.aiRetreat));
});

test('coastal regrouping distributes troops on their current shore',()=>{
  const sim=new Simulation({mode:'custom',map:'coast',seed:512,slots:battlePreset('2v2')}),owner=2,tc=sim.owned(owner,'building','towncenter')[0];
  for(const entity of sim.entities)if(entity.kind==='resource')entity.hp=0;sim.revision++;
  const units=Array.from({length:16},(_,i)=>sim.addUnit('spearman',owner,tc.x+25+i%4*2,tc.z+25+Math.floor(i/4)*2));
  sim.time=40;sim.tickAI(owner);
  const points=units.map(unit=>unit.order);assert.ok(points.every(p=>p?.type==='move'));assert.equal(new Set(points.map(p=>p.x+':'+p.z)).size,units.length);
  assert.ok(points.every(p=>Math.sign(p.x)===Math.sign(tc.x)&&!sim.isWater(p.x,p.z)));
});
