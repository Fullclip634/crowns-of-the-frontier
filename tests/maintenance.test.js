import test from 'node:test';
import assert from 'node:assert/strict';
import {Simulation} from '../src/simulation.js';
import {UNITS} from '../src/data.js';
import {workingTarget} from '../src/work-activity.js';
import {battlePreset} from '../src/custom-battle.js';

function fixture(options={}){const sim=new Simulation({mode:'sandbox',map:'highlands',seed:512,...options});for(const e of sim.entities)e.hp=0;sim.revision++;sim.visible.fill(1);for(const p of sim.players)p.resources={wood:1000,gold:1000,stone:1000,food:1000};return sim;}

test('a ram attacking a castle cannot gain health from its strikes or a nearby healer',()=>{
  const s=fixture(),castle=s.addBuilding('keep',0,0,0,true),ram=s.addUnit('ram',1,7,0),monk=s.addUnit('monk',1,8,0);ram.hp=ram.maxHp*.5;s.command([ram.id],{type:'attack',target:castle.id});const initial=castle.hp;let previous=ram.hp;
  for(let i=0;i<80;i++){s.time+=.1;s.tickUnit(ram,.1);s.tickUnit(monk,.1);s.tickBuilding(castle,.1);s.tickProjectiles();assert.ok(ram.hp<=previous+1e-8,'attacking and healer support must not refill a mechanical ram');previous=ram.hp;}
  assert.ok(castle.hp<initial);assert.ok(ram.hp>0);
});

test('automatic and explicit healing ignore siege engines and ships but still heal living allies',()=>{
  for(const type of ['ram','catapult','galley','warship','fishingboat','transport']){
    const s=fixture(),target=s.addUnit(type,0,0,0),monk=s.addUnit('monk',0,1,0);target.hp=target.maxHp*.5;const hp=target.hp;s.tickUnit(monk,.1);assert.equal(target.hp,hp,type);
    s.command([monk.id],{type:'heal',target:target.id});s.tickUnit(monk,.1);assert.equal(target.hp,hp,type+' explicit');assert.equal(monk.order,null);
  }
  const s=fixture(),soldier=s.addUnit('spearman',0,0,0),monk=s.addUnit('monk',0,1,0);soldier.hp=20;s.tickUnit(monk,.1);assert.equal(soldier.hp,32);
  soldier.embarked=true;monk.cooldown=0;s.command([monk.id],{type:'heal',target:soldier.id});s.tickUnit(monk,.1);assert.equal(soldier.hp,32);
});

test('villager smart commands repair a ram with proportional timber and gold, and stop at full health',()=>{
  const s=fixture(),ram=s.addUnit('ram',0,0,0),worker=s.addUnit('villager',0,2,0);ram.hp=ram.maxHp*.5;const before={...s.players[0].resources};s.smartCommand([worker.id],ram,ram.x,ram.z);assert.equal(worker.order.type,'repair');assert.equal(workingTarget(s,worker),ram);
  for(let i=0;i<1000&&worker.order;i++)s.tickUnit(worker,.1);
  assert.equal(ram.hp,ram.maxHp);assert.equal(worker.order,null);assert.equal(workingTarget(s,worker),null);for(const [resource,n]of Object.entries(UNITS.ram.cost))assert.ok(Math.abs(before[resource]-s.players[0].resources[resource]-n*.35*.5)<1e-7,resource);assert.equal(s.players[0].resources.food,before.food);assert.equal(s.players[0].resources.stone,before.stone);
});

test('repairs require resources and cannot heal enemies, living troops, hidden passengers or dead targets',()=>{
  for(const targetKind of ['enemy','organic','passenger','dead']){
    const s=fixture(),worker=s.addUnit('villager',0,2,0),target=s.addUnit(targetKind==='organic'?'spearman':'ram',targetKind==='enemy'?1:0,0,0);target.hp=targetKind==='dead'?0:20;if(targetKind==='passenger')target.embarked=true;s.command([worker.id],{type:'repair',target:target.id});s.tickUnit(worker,.1);assert.equal(target.hp,targetKind==='dead'?0:20,targetKind);assert.equal(worker.order,null);
  }
  const s=fixture(),worker=s.addUnit('villager',0,2,0),ram=s.addUnit('ram',0,0,0);ram.hp=20;s.players[0].resources.gold=0;const wood=s.players[0].resources.wood;s.smartCommand([worker.id],ram,0,0);s.tickUnit(worker,1);assert.equal(ram.hp,20);assert.equal(s.players[0].resources.wood,wood);assert.equal(worker.order,null);
});

test('villagers repair castles with stone, allied repairs charge the worker owner, and Stop cancels repairs',()=>{
  const s=fixture({mode:'custom',slots:battlePreset('2v2')}),castle=s.addBuilding('keep',1,0,0,true),worker=s.addUnit('villager',0,6,0);castle.hp-=200;const hp=castle.hp,stone=s.players[0].resources.stone,allyStone=s.players[1].resources.stone;s.smartCommand([worker.id],castle,0,0);assert.equal(worker.order.type,'repair');s.tickUnit(worker,1);assert.equal(castle.hp,hp+23);assert.ok(Math.abs(s.players[0].resources.stone-(stone-.6))<1e-9);assert.equal(s.players[1].resources.stone,allyStone);s.stop([worker.id]);const stopped=castle.hp;s.tickUnit(worker,1);assert.equal(castle.hp,stopped);
});

test('repair jobs survive saves and damaged transports are repaired before villagers try to board',()=>{
  const s=fixture(),worker=s.addUnit('villager',0,2,0),ram=s.addUnit('ram',0,0,0);ram.hp=20;s.smartCommand([worker.id],ram,0,0);const restored=Simulation.restore(JSON.parse(JSON.stringify(s.serialize())));restored.tickUnit(restored.get(worker.id),1);assert.equal(restored.get(ram.id).hp,43);
  const ship=s.addUnit('transport',0,0,0);ship.hp-=100;s.smartCommand([worker.id],ship,0,0);assert.equal(worker.order.type,'repair');s.tickUnit(worker,1);assert.equal(ship.hp,ship.maxHp-77);ship.hp=ship.maxHp;s.smartCommand([worker.id],ship,0,0);assert.equal(worker.order.type,'board');
});
