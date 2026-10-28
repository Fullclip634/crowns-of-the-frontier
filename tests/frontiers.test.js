import test from 'node:test';
import assert from 'node:assert/strict';
import {Simulation} from '../src/simulation.js';
import {MinHeap,navigationRegions} from '../src/navigation.js';
import {battlePreset} from '../src/custom-battle.js';
const advance=(s,t)=>{for(let i=0;i<t*10;i++)s.tick(.1);};
test('heap returns priorities in ascending order',()=>{const heap=new MinHeap();heap.push(1,8);heap.push(2,2);heap.push(3,5);assert.deepEqual([heap.pop(),heap.pop(),heap.pop()],[2,3,1]);});
test('naval mode starts with a fishing economy and separates land and sea navigation',()=>{const s=new Simulation({mode:'tides'});s.tickAI=()=>{};s.stop(s.owned(0,'unit','villager').map(e=>e.id));const boat=s.owned(0,'unit','fishingboat')[0],food=s.players[0].resources.food;advance(s,65);assert.ok(s.players[0].resources.food>=food+75,'a fishing boat actually deposited its catch');assert.ok(s.isWater(boat.x,boat.z));const cell=s.cell(0,30);assert.equal(s.grid(0)[cell.z*80+cell.x],1);assert.equal(s.grid(0,true)[cell.z*80+cell.x],0);});
test('harbors require a shoreline and fishing boats spawn on water',()=>{const s=new Simulation({mode:'tides'});s.tickAI=()=>{};assert.equal(s.buildValid('dock',-45,50),false);const dock=s.owned(0,'building','dock')[0];assert.ok(s.train(dock.id,'fishingboat'));advance(s,21);assert.ok(s.owned(0,'unit','fishingboat').every(e=>s.isWater(e.x,e.z)));});
test('trained land units spawn on clear navigation-cell centers outside nearby foundations',()=>{
  const sim=new Simulation({mode:'custom',map:'highlands',seed:512,mapSize:'vast',slots:battlePreset('2v2')}),barracks=sim.owned(3,'building','barracks')[0],mine=sim.addBuilding('mine',3,123.28876849395338,100.25172564898419),spawn=sim.spawnPoint(barracks),cell=sim.cell(spawn.x,spawn.z),grid=sim.grid(3);
  assert.equal(spawn.x,cell.x*2-sim.halfWorld+1);assert.equal(spawn.z,cell.z*2-sim.halfWorld+1);assert.equal(grid[cell.z*sim.gridSize+cell.x],0);
  assert.ok(Math.hypot(spawn.x-mine.x,spawn.z-mine.z)>=mine.r+.9,'spawn point must clear the building footprint');
  const unit=sim.addUnit('spearman',3,spawn.x,spawn.z),base=sim.owned(3,'building','towncenter')[0],route=sim.pathTo(unit,base,base.r+3);assert.equal(unit.pathStatus,'ready');assert.ok(route.length);
});
test('trained units exit through the town-center region instead of a closer enclosed pocket',()=>{
  const sim=new Simulation({mode:'custom',map:'highlands',seed:512,mapSize:'vast',slots:battlePreset('4v4')}),owner=5,size=sim.gridSize,grid=new Uint8Array(size*size);
  sim.entities=[];sim.index=null;sim.revision++;
  const tc=sim.addBuilding('towncenter',owner,163.2,0,true),range=sim.addBuilding('range',owner,175.2,0,true),pocket=[[179,3],[181,1],[181,3]].map(([x,z])=>sim.cell(x,z)),center=sim.cell(179,3);
  for(let z=center.z-2;z<=center.z+2;z++)for(let x=center.x-2;x<=center.x+2;x++)grid[z*size+x]=1;
  for(const cell of pocket)grid[cell.z*size+cell.x]=0;
  sim.grid=()=>grid;
  const spawn=sim.spawnPoint(range),labels=navigationRegions(sim,grid),spawnCell=sim.cell(spawn.x,spawn.z),tcCell=sim.cell(tc.x,tc.z);
  assert.notEqual(labels[spawnCell.z*size+spawnCell.x],labels[pocket[0].z*size+pocket[0].x],'spawn must leave the enclosed cell pocket');
  assert.equal(labels[spawnCell.z*size+spawnCell.x],labels[tcCell.z*size+tcCell.x],'spawn must share the town center region');
  const unit=sim.addUnit('spearman',owner,spawn.x,spawn.z),route=sim.pathTo(unit,{x:150,z:20});
  assert.equal(unit.pathStatus,'ready');assert.ok(route.length);
  tc.hp=0;
  const fallback=sim.spawnPoint(range),fallbackCell=sim.cell(fallback.x,fallback.z);
  assert.notEqual(labels[fallbackCell.z*size+fallbackCell.x],labels[pocket[0].z*size+pocket[0].x],'a destroyed town center must not restore the enclosed pocket');
});
test('transports board land units, move on water, unload on shore, and reject remote landings',()=>{const s=new Simulation({mode:'tides'});s.tickAI=()=>{};const ship=s.owned(0,'unit','transport')[0];ship.x=-10;ship.z=34;const unit=s.addUnit('spearman',0,-16,34);s.command([unit.id],{type:'board',target:ship.id});advance(s,2);assert.equal(unit.embarked,true);assert.equal(ship.passengers.length,1);assert.equal(s.unload(ship.id,60,34),false);assert.equal(s.unload(ship.id,-18,34),true);assert.equal(unit.embarked,false);assert.equal(s.isWater(unit.x,unit.z),false);});
test('sinking transports also defeats their embarked troops',()=>{const s=new Simulation({mode:'tides'}),ship=s.owned(0,'unit','transport')[0],unit=s.addUnit('spearman',0,ship.x-5,ship.z);unit.embarked=true;unit.transport=ship.id;ship.passengers=[unit.id];s.hurt(ship,ship.hp+1,s.owned(1,'unit','galley')[0]);assert.equal(unit.hp,0);});
test('player two can trade, cancel queues, and demolish its own buildings',()=>{const s=new Simulation();s.players[1].resources={food:2000,wood:2000,gold:2000,stone:2000};s.players[1].age=1;const market=s.addBuilding('market',1,60,-50,true),before=s.players[1].resources.gold;assert.ok(s.trade('food',true,1));assert.equal(s.players[1].resources.gold,before-130);assert.equal(s.players[0].resources.gold,250);const tc=s.owned(1,'building','towncenter')[0];s.train(tc.id,'villager');s.cancelQueue(tc.id,0,1);assert.equal(tc.queue.length,0);assert.ok(s.demolish(market.id,1));});
test('saved transports preserve passenger and naval research state',()=>{const s=new Simulation({mode:'tides'}),ship=s.owned(0,'unit','transport')[0],unit=s.addUnit('spearman',0,-17,34);unit.embarked=true;unit.transport=ship.id;ship.passengers=[unit.id];s.players[0].tech.seamanship=1;const restored=Simulation.restore(JSON.parse(JSON.stringify(s.serialize())));assert.equal(restored.get(unit.id).embarked,true);assert.deepEqual(restored.get(ship.id).passengers,[unit.id]);assert.equal(restored.players[0].tech.seamanship,1);});
test('classic multiplayer leaves the second human transport under player control while local naval AI still unloads',()=>{
  for(const multiplayer of [false,true]){
    const sim=new Simulation({mode:'tides',multiplayer,seed:512}),ship=sim.owned(1,'unit','transport')[0];
    for(const e of sim.entities)if(e!==ship&&Math.hypot(e.x+18,e.z-30)<20)e.hp=0;sim.revision++;sim.index=null;ship.x=-12;ship.z=30;
    const unit=sim.addUnit('spearman',1,-16,30);sim.command([unit.id],{type:'board',target:ship.id});sim.tickUnit(unit,.1);assert.ok(unit.embarked);
    sim.tickUnit(ship,.1);assert.equal(unit.embarked,multiplayer);assert.equal(ship.passengers.length,multiplayer?1:0);
    if(multiplayer){assert.equal(sim.unload(ship.id,-18,30,0),false);assert.equal(sim.unload(ship.id,-18,30,1),true);assert.equal(unit.embarked,false);}
  }
});
test('unworked foundations do not reveal unexplored territory',()=>{const s=new Simulation({mode:'sandbox'}),site=s.addBuilding('house',0,65,65);s.updateFog();assert.equal(s.isVisible(65,65),false);assert.equal(s.canSee(0,{x:65,z:65,r:0}),false);site.progress=.1;s.updateFog();assert.equal(s.isVisible(65,65),true);});
test('healers cannot damage enemies through an explicit attack order',()=>{const s=new Simulation({mode:'sandbox'}),healer=s.addUnit('monk',0,0,0),enemy=s.addUnit('spearman',1,1,0);enemy.stance='hold';s.command([healer.id],{type:'attack',target:enemy.id});advance(s,2);assert.equal(enemy.hp,enemy.maxHp);});
