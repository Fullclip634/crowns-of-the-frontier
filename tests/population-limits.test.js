import test from 'node:test';
import assert from 'node:assert/strict';
import {Simulation} from '../src/simulation.js';
import {POPULATION_LIMITS,battlePreset,normalizeBattle} from '../src/custom-battle.js';
import {customBattleMarkup} from '../src/custom-battle-ui.js';
import {customHostOptions} from '../src/custom-host.js';
import {customOpening} from '../src/allied-ai.js';
import {AI_PROFILES} from '../src/commander-ai.js';

test('lower population choices survive setup, hosting and normalization without changing the default',()=>{
  const draft={map:'highlands',mapSize:'spacious',playerSlot:1,seed:512,slots:battlePreset('2v2')};
  for(const populationLimit of POPULATION_LIMITS){
    assert.equal(normalizeBattle({...draft,populationLimit:String(populationLimit)}).populationLimit,populationLimit);
    assert.equal(customHostOptions({...draft,populationLimit}).populationLimit,populationLimit);
    assert.match(customBattleMarkup({...draft,populationLimit}),new RegExp(`<option value="${populationLimit}" selected>`));
  }
  assert.equal(normalizeBattle(draft).populationLimit,80);assert.equal(normalizeBattle({...draft,populationLimit:1}).populationLimit,80);
  assert.match(customBattleMarkup(draft),/<option value="80" selected>/);
});

test('10, 20, 40 and 60 unit caps include queued troops, apply to every kingdom and survive saving',()=>{
  for(const limit of [10,20,40,60]){
    const sim=new Simulation({mode:'custom',map:'highlands',mapSize:'spacious',seed:512,populationLimit:limit});
    for(const owner of [0,1]){
      const town=sim.owned(owner,'building','towncenter')[0];sim.players[owner].resources={food:10000,wood:10000,gold:10000,stone:10000};
      for(let i=0;i<6;i++)sim.addBuilding('house',owner,town.x+20+i*3,town.z,true);
      while(sim.population(owner)<limit-1)sim.addUnit('spearman',owner,town.x+10,town.z+10);
      assert.equal(sim.capacity(owner),limit);assert.equal(sim.train(town.id,'villager'),true);assert.equal(sim.train(town.id,'villager'),false,'a reserved unit uses the final slot');
      town.queue[0].remaining=.05;sim.tickBuilding(town,.1);assert.equal(sim.population(owner),limit);assert.equal(sim.train(town.id,'villager'),false);
      assert.match(sim.events.at(-1).message,new RegExp(`${limit} per kingdom`));
    }
    const loaded=Simulation.restore(JSON.parse(JSON.stringify(sim.serialize())));assert.equal(loaded.options.populationLimit,limit);assert.equal(loaded.capacity(1),limit);
    sim.owned(0,'unit')[0].hp=0;assert.equal(sim.train(sim.owned(0,'building','towncenter')[0].id,'villager'),true,'casualties free an actual population slot');
  }
});

test('AI kingdoms at the 20 cap can begin aging up on land and coastal maps',()=>{
  for(const map of ['highlands','coast']){
    const sim=new Simulation({mode:'custom',map,mapSize:'spacious',seed:512,populationLimit:20,slots:battlePreset('2v2')}),owner=1;
    sim.players[owner].resources={food:5000,wood:5000,gold:5000,stone:5000};sim.time=80;
    for(let tick=0;tick<12;tick++)sim.tickCustomAI(1);
    assert.equal(sim.players[owner].agePending,true,`${map}: the AI reaches its age-up threshold with eight starting workers`);
    assert.ok(sim.population(owner)<=20,`${map}: the AI remains within its chosen cap`);
  }
});

test('10 population starts leave training room at every age and AI can afford its opening requirements',()=>{
  for(const map of ['highlands','coast'])for(const startAge of [0,1,2,3]){
    const sim=new Simulation({mode:'custom',map,mapSize:'spacious',seed:512,populationLimit:10,startAge,slots:battlePreset('2v2')});
    for(let owner=0;owner<sim.players.length;owner++){
      assert.ok(sim.population(owner)<10,`${map}, age ${startAge}: starting units leave room to train`);
      assert.equal(sim.capacity(owner),10);
    }
    const opening=customOpening(sim,1,AI_PROFILES.normal);
    assert.ok(opening.workers<=sim.owned(1,'unit','villager').length,'opening economy threshold is reachable');
    if(startAge===0&&map==='highlands'){
      sim.players[1].resources={food:5000,wood:5000,gold:5000,stone:5000};sim.time=80;
      for(let i=0;i<12;i++)sim.tickCustomAI(1);
      assert.equal(sim.players[1].agePending,true,'small AI economies can advance their age');
    }
  }
});

test('a full 40 population AI can launch its longer-buildup offensive instead of waiting for an impossible army',()=>{
  for(const map of ['highlands','coast']){
  const slots=battlePreset('2v2').map(slot=>({...slot,difficulty:'brutal'})),sim=new Simulation({mode:'custom',map,mapSize:'spacious',seed:512,startAge:2,populationLimit:40,aiPace:'patient',slots}),owner=1,town=sim.owned(owner,'building','towncenter')[0];
  for(const unit of sim.owned(owner,'unit'))if(unit.type!=='villager'&&unit.type!=='scout')unit.hp=0;
  while(sim.owned(owner,'unit','villager').length<20)sim.addUnit('villager',owner,town.x+7,town.z+12);
  for(let i=0;i<(map==='coast'?6:18);i++)sim.addUnit('spearman',owner,town.x+12+i%4*2,town.z+9+Math.floor(i/4)*2);
  if(map==='coast'){for(const [type,count]of [['warship',6],['transport',2],['fishingboat',3]])for(let i=0;i<count;i++)sim.addUnit(type,owner,0,town.z-10-i*4);sim.addUnit('monk',owner,town.x+9,town.z+9);}
  sim.addUnit('monk',owner,town.x+9,town.z+9);assert.equal(sim.population(owner),40);
  sim.time=700;sim.tickCustomAI(5);assert.equal(sim.aiStates[owner].phase,'attack',map);if(map==='highlands')assert.ok(sim.aiStates[owner].homeGuard.length>=2);
  for(const limit of [20,40,60])for(const map of ['highlands','coast']){sim.options.populationLimit=limit;sim.options.map=map;const opening=customOpening(sim,owner,AI_PROFILES.brutal);assert.ok(opening.workers<=Math.floor(limit*.5),'the AI attack can reach its worker requirement');assert.ok(opening.army<=Math.max(4,Math.floor(limit*.4)-(map==='coast'?11:0)),'the opening army scales to the selected cap');}
  }
});
