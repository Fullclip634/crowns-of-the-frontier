import test from 'node:test';
import assert from 'node:assert/strict';
import {Simulation} from '../src/simulation.js';
import {battlePreset} from '../src/custom-battle.js';
import {BUILDINGS} from '../src/data.js';
import {fortifyKingdomWalls} from '../src/ai-fortifications.js';

// A razed capital used to end the opponent: tickAI returned and the kingdom sat
// idle for the rest of the match while its villagers stood in a field.
test('a commander whose capital is razed rebuilds it instead of idling',()=>{
  const sim=new Simulation({mode:'skirmish',map:'highlands',seed:512});
  sim.tickAI();
  const before=sim.owned(1,'building','towncenter');
  assert.equal(before.length,1,'the AI starts with a capital');
  const home=sim.commanderAI.home;
  assert.ok(home&&Number.isFinite(home.x)&&Number.isFinite(home.z),'the AI remembers where home was');

  const capital=before[0],wood=sim.players[1].resources.wood,stone=sim.players[1].resources.stone;
  capital.hp=0;sim.revision++;
  assert.equal(sim.owned(1,'building','towncenter').length,0,'the capital is gone');

  sim.tickAI();
  const rebuilt=sim.owned(1,'building','towncenter');
  assert.equal(rebuilt.length,1,'the AI founds a replacement town centre');
  assert.ok(rebuilt[0].progress<1,'the replacement is a real paid foundation, not a free building');
  assert.equal(sim.players[1].resources.wood,wood-Math.ceil(BUILDINGS.towncenter.cost.wood*sim.faction(1).cost),'timber is paid');
  assert.equal(sim.players[1].resources.stone,stone-Math.ceil(BUILDINGS.towncenter.cost.stone*sim.faction(1).cost),'stone is paid');
  assert.ok(Math.hypot(rebuilt[0].x-home.x,rebuilt[0].z-home.z)<40,'it rebuilds near the old settlement, not wherever the last villager stood');
});

// One barracks forever capped the AI at roughly half a human's production. The
// count must scale with the age, but only once the economy can carry it.
test('production buildings scale past one per type as the economy grows',()=>{
  const sim=new Simulation({mode:'custom',spectator:true,map:'highlands',mapSize:'medium',seed:909});
  while(sim.time<600&&!sim.ended)sim.tick(.1);
  for(const owner of [0,1]){
    const built=sim.owned(owner,'building').filter(e=>e.type==='barracks'&&e.progress>=1);
    assert.ok(built.length>=2,`commander ${owner} fields more than one barracks (${built.length})`);
    assert.ok(sim.players[owner].age>=2,`commander ${owner} still advances in age (${sim.players[owner].age})`);
    assert.ok(sim.owned(owner,'unit','villager').length>=20,`commander ${owner} keeps its economy (${sim.owned(owner,'unit','villager').length} villagers)`);
  }
});

// A single unit poking the perimeter every half minute used to suspend walls
// indefinitely. Walls wait out a real attack, then resume once it is being held.
test('a sustained threat does not suspend fortification forever',()=>{
  const sim=new Simulation({mode:'custom',map:'highlands',mapSize:'large',slots:battlePreset('2v2'),startAge:2,populationLimit:80,seed:512});
  sim.entities=[];sim.index=new Map();sim.grids={};sim.revision++;sim.time=240;sim.tickCustomAI=()=>{};
  const owner=1;
  sim.addBuilding('towncenter',owner,-40,0,true);
  sim.addBuilding('towncenter',0,-75,-50,true);sim.addBuilding('towncenter',2,65,65,true);sim.addBuilding('towncenter',3,80,50,true);
  sim.addBuilding('tower',owner,-25,0,true);sim.addBuilding('barracks',owner,-42,12,true);
  const workers=Array.from({length:20},(_,index)=>sim.addUnit('villager',owner,-39-index%5,-8-Math.floor(index/5)*2));
  for(let i=0;i<3;i++)sim.addUnit('spearman',owner,-34+i,-6);
  sim.players[owner].resources={food:1500,wood:1800,gold:1200,stone:1600};
  const state=sim.aiStates[owner]={known:{},decision:0};
  const raid=[sim.addUnit('knight',2,-20,0)];

  assert.equal(fortifyKingdomWalls(sim,state,owner,workers,sim.owned(owner,'building'),raid),false,'walls wait while the attack is live');
  assert.ok(state.threatSince>0,'the AI records when the attack started');

  sim.time+=120;
  assert.equal(fortifyKingdomWalls(sim,state,owner,workers,sim.owned(owner,'building'),raid),true,'fortification resumes once the attack has been held off');

  sim.time+=10;
  fortifyKingdomWalls(sim,state,owner,workers,sim.owned(owner,'building'),[]);
  assert.equal(state.threatSince,undefined,'the threat clock resets once the attack ends');
});
