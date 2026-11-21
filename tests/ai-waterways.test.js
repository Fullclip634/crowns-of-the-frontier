import test from 'node:test';
import assert from 'node:assert/strict';
import {Simulation} from '../src/simulation.js';
import {battlePreset} from '../src/custom-battle.js';
import {adaptAssault} from '../src/ai-assault.js';
import {waterwayRegion} from '../src/ai-waterways.js';

test('an AI retargets a repeatedly blocked assault and keeps the cooled-down front across a save',()=>{
  const sim={time:0,halfWorld:80},town={x:0,z:0},state={};
  const gate={kind:'building',type:'gate',id:31,x:50,z:20,hp:800};
  const mine={kind:'building',type:'mine',id:32,x:35,z:50,hp:500};
  const troops=[20,22,24,26].map(x=>({x,z:20,type:'spearman',pathStatus:'blocked',order:{commanderObjective:{...gate,phase:'attack'}}}));
  assert.equal(adaptAssault(sim,state,gate,troops,[gate],[gate,mine],town),gate);
  sim.time=8;assert.equal(adaptAssault(sim,state,gate,troops,[gate],[gate,mine],town),gate);
  sim.time=32;assert.equal(adaptAssault(sim,state,gate,troops,[gate],[gate,mine],town),mine);
  const restored=JSON.parse(JSON.stringify(state));
  sim.time=48;assert.equal(adaptAssault(sim,restored,gate,[],[],[gate,mine],town),mine);
  sim.time=100;assert.equal(adaptAssault(sim,restored,gate,[],[],[gate,mine],town),gate);
});

test('observed damage resets the stall timer even when the routing reports blocked',()=>{
  const sim={time:0,halfWorld:80},town={x:0,z:0},state={};
  const gate={kind:'building',type:'gate',id:31,x:50,z:20,hp:800};
  const troops=[22,24,26].map(x=>({x,z:20,type:'spearman',pathStatus:'blocked',order:{commanderObjective:{...gate,phase:'attack'}}}));
  adaptAssault(sim,state,gate,troops,[gate],[gate],town);
  sim.time=8;adaptAssault(sim,state,gate,troops,[gate],[gate],town);
  sim.time=33;gate.hp-=200;assert.equal(adaptAssault(sim,state,gate,troops,[gate],[gate],town),gate);
  assert.equal(state.assaultAvoid,undefined);
});

test('Archipelago AI builds paid harbors and keeps its boats in connected fishing waters',()=>{
  const slots=battlePreset('2v2');
  const sim=new Simulation({mode:'custom',map:'archipelago',mapSize:'large',seed:512,slots,startAge:2,populationLimit:80});
  sim.players[0].controller='ai';
  let delivered=0;
  sim.on(event=>{if(event.type==='gathered'&&event.source==='fishingboat')delivered+=event.amount;});
  while(sim.time<240&&!delivered)sim.tick(.1);
  const harbors=sim.entities.filter(entity=>entity.type==='dock'&&entity.progress>=1&&entity.hp>0);
  const boats=sim.entities.filter(entity=>entity.type==='fishingboat'&&entity.hp>0);
  assert.ok(harbors.length,'at least one completed harbor');
  assert.ok(boats.length,'harbors train fishing boats');
  assert.ok(delivered>0,'a fishing boat actually delivers food');
  for(const boat of boats.filter(unit=>unit.order?.type==='gather'&&!unit.order.returning)){
    const fish=sim.get(boat.order.target);
    if(fish)assert.equal(waterwayRegion(sim,boat),waterwayRegion(sim,fish,boat.owner));
  }
});
