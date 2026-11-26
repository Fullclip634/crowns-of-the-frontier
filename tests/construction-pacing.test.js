import test from 'node:test';
import assert from 'node:assert/strict';
import {Simulation} from '../src/simulation.js';
import {BUILDINGS} from '../src/data.js';
import {PALISADE_WALL_TIME,wallBuildTime} from '../src/fortified-walls.js';
import {constructionPositions} from '../src/construction-contact.js';
import {multiBuilderRate} from '../src/maintenance.js';

function cleanFixture(faction='alder'){
  const sim=new Simulation({mode:'sandbox',faction,map:'highlands',seed:512});
  sim.entities=[];sim.index=new Map();sim.grids={};sim.entityBuckets=null;sim.revision++;sim.visible.fill(1);
  for(const p of sim.players)p.resources={food:9000,wood:9000,gold:9000,stone:9000};
  return sim;
}

function placeWorkersAtSite(sim,site,count,orderType='build',owner=0){
  const probe=sim.addUnit('villager',owner,site.x,site.z);
  const spots=constructionPositions(probe,site);
  sim.entities=sim.entities.filter(e=>e!==probe);
  sim.index?.delete(probe.id);
  const workers=[];
  for(let i=0;i<count;i++){
    const spot=spots[i%spots.length];
    const w=sim.addUnit('villager',owner,spot.x,spot.z);
    w.order={type:orderType,target:site.id};
    workers.push(w);
  }
  return workers;
}

test('rebalanced solo build times match standard AoE pacing',()=>{
  assert.equal(BUILDINGS.keep.time,120);
  assert.equal(BUILDINGS.towncenter.time,90);
  assert.equal(BUILDINGS.wonder.time,270);
  assert.equal(BUILDINGS.wall.time,9);
  assert.equal(PALISADE_WALL_TIME,5);
  const sim=cleanFixture();
  sim.players[0].age=0;
  assert.equal(wallBuildTime(sim,0,'wall'),5);
  sim.players[0].age=2;
  assert.equal(wallBuildTime(sim,0,'wall'),9);
});

test('multi-villager construction follows exact AoE diminishing returns 1 + (N - 1) / 3',()=>{
  for(const [type,expectedSolo] of [['keep',120],['towncenter',90],['wonder',270],['wall',9]]){
    for(const count of [1,2,4,10]){
      const sim=cleanFixture();
      sim.players[0].age=3;
      const site=sim.addBuilding(type,0,0,20,false);
      placeWorkersAtSite(sim,site,count,'build',0);
      sim.tick(0.1);
      const expectedRate=multiBuilderRate(count);
      const expectedProgress=(0.1*expectedRate)/expectedSolo;
      assert.ok(
        Math.abs(site.progress-expectedProgress)<1e-9,
        `${type} with ${count} workers: got ${site.progress}, expected ${expectedProgress}`
      );
    }
  }
});

test('10 villagers take 30s on a Castle and 67.5s on a Grand Monument (not 8s / 12s)',()=>{
  for(const [type,expectedSeconds] of [['keep',30],['wonder',67.5]]){
    const sim=cleanFixture();
    sim.players[0].age=3;
    const site=sim.addBuilding(type,0,0,20,false);
    placeWorkersAtSite(sim,site,10,'build',0);
    let ticks=0;
    while(site.progress<1&&ticks<2000){
      sim.tick(0.1);
      ticks++;
    }
    const elapsed=ticks*0.1;
    assert.equal(site.progress,1);
    assert.ok(Math.abs(elapsed-expectedSeconds)<=0.15,`${type} finished in ${elapsed}s, expected ~${expectedSeconds}s`);
  }
});

test('Jade +15% construction bonus composes cleanly with multi-villager diminishing returns',()=>{
  const sim=cleanFixture('jade');
  sim.players[0].age=3;
  const site=sim.addBuilding('keep',0,0,20,false);
  placeWorkersAtSite(sim,site,4,'build',0);
  sim.tick(0.1);
  const expected=(0.1*1.15*multiBuilderRate(4))/120;
  assert.ok(Math.abs(site.progress-expected)<1e-9);
});

test('multi-villager building repairs follow 1 + (N - 1) / 3 and scale resource cost proportionally',()=>{
  for(const count of [1,2,4,10]){
    const sim=cleanFixture();
    sim.players[0].age=3;
    const castle=sim.addBuilding('keep',0,0,20,true);
    castle.hp=castle.maxHp-1000;
    const startHp=castle.hp;
    const startStone=sim.players[0].resources.stone;
    placeWorkersAtSite(sim,castle,count,'repair',0);
    sim.tick(0.1);
    const rate=multiBuilderRate(count);
    assert.ok(Math.abs((castle.hp-startHp)-(0.1*23*rate))<1e-9,`repair HP for ${count} workers`);
    assert.ok(Math.abs((startStone-sim.players[0].resources.stone)-(0.1*0.6*rate))<1e-9,`repair stone cost for ${count} workers`);
  }
});

test('an allied repairer without resources does not steal the 100% repair slot from a funded worker',()=>{
  const sim=new Simulation({mode:'custom',map:'highlands',seed:512,slots:[
    {name:'P1',faction:'alder',team:1,difficulty:'normal',enabled:true,slotNumber:1,controller:'human'},
    {name:'P2',faction:'alder',team:1,difficulty:'normal',enabled:true,slotNumber:2,controller:'ai'},
    {name:'P3',faction:'raven',team:2,difficulty:'normal',enabled:true,slotNumber:3,controller:'ai'},
  ]});
  sim.entities=[];sim.index=new Map();sim.grids={};sim.entityBuckets=null;sim.revision++;sim.visible.fill(1);
  sim.players[0].resources={food:0,wood:0,gold:0,stone:0};
  sim.players[1].resources={food:500,wood:500,gold:500,stone:500};
  const castle=sim.addBuilding('keep',1,0,20,true);
  castle.hp=castle.maxHp-500;
  const startHp=castle.hp;
  const spots=constructionPositions(sim.addUnit('villager',0,0,0),castle);
  sim.entities.pop();
  const broke=sim.addUnit('villager',0,spots[0].x,spots[0].z);
  const funded=sim.addUnit('villager',1,spots[1].x,spots[1].z);
  broke.order={type:'repair',target:castle.id};
  funded.order={type:'repair',target:castle.id};
  sim.tickUnit(broke,1);
  sim.tickUnit(funded,1);
  assert.equal(broke.order,null,'broke repairer stops');
  assert.ok(Math.abs((castle.hp-startHp)-23)<1e-9,'funded repairer still contributes full 100% rate');
});
