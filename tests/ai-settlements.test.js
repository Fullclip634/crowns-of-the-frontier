import test from 'node:test';
import assert from 'node:assert/strict';
import {Simulation,distance} from '../src/simulation.js';
import {battlePreset} from '../src/custom-battle.js';
import {BUILDINGS} from '../src/data.js';
import {rememberDeposits,manageExpansion,staffSettlements,settlementThreats,protectWorkers,fortifySettlements} from '../src/ai-settlements.js';
import {orderSiegeAssault} from '../src/ai-siege.js';

function fixture(map='highlands'){
  const sim=new Simulation({mode:'custom',map,mapSize:'large',slots:battlePreset('2v2'),startAge:2,seed:512,shareVision:false}),owner=1,tc=sim.owned(owner,'building','towncenter')[0];
  for(const e of sim.entities)if(e.kind==='resource')e.hp=0;sim.revision++;
  while(sim.owned(owner,'unit','villager').length<24)sim.addUnit('villager',owner,tc.x-8,tc.z+12);
  sim.players[owner].resources={food:1200,wood:1600,gold:1200,stone:1200};
  const point={x:tc.x+58,z:tc.z},gold=sim.addResource('gold',point.x,point.z,4000),wood=sim.addResource('wood',point.x+4,point.z+6,2400);
  const scout=sim.owned(owner,'unit','scout')[0];scout.x=point.x;scout.z=point.z+8;scout.order=null;sim.time=500;sim.revision++;
  const state=sim.aiStates[owner]={known:{},phase:'opening',scoutIndex:0,lastOrders:-20,lastRebalance:-20,decision:0,nextAttack:150};return {sim,owner,tc,gold,wood,scout,state,workers:sim.owned(owner,'unit','villager')};
}

test('resource expansion remembers sightings without learning hidden depletion',()=>{
  const {sim,owner,tc,gold,scout,state}=fixture();scout.x=tc.x;scout.z=tc.z;sim.revision++;
  rememberDeposits(sim,state,owner);assert.equal(state.deposits[gold.id],undefined);
  scout.x=gold.x;scout.z=gold.z;sim.revision++;rememberDeposits(sim,state,owner);assert.equal(state.deposits[gold.id].amount,4000);
  scout.x=tc.x;scout.z=tc.z;gold.amount=0;sim.revision++;rememberDeposits(sim,state,owner);assert.equal(state.deposits[gold.id].amount,4000);
  scout.x=gold.x;scout.z=gold.z;sim.revision++;rememberDeposits(sim,state,owner);assert.equal(state.deposits[gold.id],undefined);
});

test('AI scouts a resource settlement, walks a paid builder there, and funds its real foundation',()=>{
  const {sim,owner,state,workers}=fixture(),before={...sim.players[owner].resources};
  manageExpansion(sim,state,owner,workers,[]);assert.equal(state.expansion,undefined);
  rememberDeposits(sim,state,owner);sim.time+=21;sim.players[owner].resources.wood=100;manageExpansion(sim,state,owner,workers,[]);assert.equal(state.expansion,undefined);
  sim.players[owner].resources={...before};sim.time+=21;manageExpansion(sim,state,owner,workers,[]);assert.ok(state.expansion);
  assert.equal(sim.owned(owner,'building','towncenter').length,1);assert.deepEqual(sim.players[owner].resources,before);
  const plan=state.expansion,worker=sim.get(plan.worker);assert.equal(worker.order.aiExpansion,true);
  worker.x=plan.x;worker.z=plan.z;worker.order=null;sim.revision++;manageExpansion(sim,state,owner,workers,[]);
  const sites=sim.owned(owner,'building','towncenter'),cost=sim.cost(BUILDINGS.towncenter.cost,owner,'building');assert.equal(sites.length,2);assert.ok(sites[1].progress<1);assert.equal(sim.players[owner].resources.wood,before.wood-cost.wood);assert.equal(sim.players[owner].resources.stone,before.stone-cost.stone);
  assert.equal(workers.filter(w=>w.order?.type==='build'&&w.order.target===sites[1].id).length,3);
  const restored=Simulation.restore(JSON.parse(JSON.stringify(sim.serialize())));assert.deepEqual(restored.aiStates[owner],state);
});

test('expansion cancels on observed danger and cannot dispatch across an unbridged sea',()=>{
  const {sim,owner,state,workers}=fixture();rememberDeposits(sim,state,owner);manageExpansion(sim,state,owner,workers,[]);assert.ok(state.expansion);
  state.known[123]={id:123,kind:'building',type:'keep',...state.expansion};manageExpansion(sim,state,owner,workers,[]);assert.equal(state.expansion,null);assert.equal(sim.owned(owner,'building','towncenter').length,1);
  const sea=fixture('coast'),base=sea.tc;sea.state.deposits={gold:{id:987,type:'gold',x:-Math.sign(base.x)*32,z:base.z,amount:5000}};
  manageExpansion(sea.sim,sea.state,sea.owner,sea.workers,[]);assert.ok(!sea.state.expansion);assert.equal(sea.sim.owned(sea.owner,'building','towncenter').length,1);
});

test('ordinary construction completes a resource settlement and the AI staffs and uses both town centers',()=>{
  const {sim,owner,state,workers}=fixture();rememberDeposits(sim,state,owner);sim.tickCustomAI=()=>{};manageExpansion(sim,state,owner,workers,[]);
  for(let i=0;i<900;i++){sim.tick(.1);if(i%10===0)manageExpansion(sim,state,owner,workers,[]);}
  const towns=sim.owned(owner,'building','towncenter');assert.equal(towns.length,2);assert.ok(towns.every(b=>b.progress===1));
  staffSettlements(sim,state,owner,workers,sim.owned(owner,'building'));assert.ok(state.staffedCenters.includes(towns[1].id));assert.ok(workers.filter(w=>distance(w,towns[1])<30||w.order?.type==='move'&&distance(w.order,towns[1])<15).length>=5);
  for(const town of towns)town.queue=[];for(const worker of workers.slice(0,8))worker.hp=0;sim.revision++;sim.tickAI();
  assert.ok(towns.every(town=>town.queue.some(q=>q.kind==='unit'&&q.type==='villager')),'both centers replace workers');
});

test('new settlements receive defenses and attacks on remote economy count as base threats',()=>{
  const {sim,owner,state,workers,tc}=fixture(),base=sim.addBuilding('towncenter',owner,tc.x+58,tc.z-25,true),before=sim.players[owner].resources.stone;
  for(let i=0;i<2;i++)fortifySettlements(sim,state,owner,workers,sim.owned(owner,'building'),[]);
  assert.equal(sim.owned(owner,'building','tower').length,1);assert.equal(sim.players[owner].resources.stone,before-sim.cost(BUILDINGS.tower.cost,owner,'building').stone);
  const tower=sim.owned(owner,'building','tower')[0];tower.progress=1;fortifySettlements(sim,state,owner,workers,sim.owned(owner,'building'),[]);assert.equal(sim.owned(owner,'building','tower').length,2);
  assert.ok(sim.owned(owner,'building','tower').some(t=>distance(t,base)<30));
  const mine=sim.addBuilding('mine',owner,tc.x+70,tc.z+20,true),enemy=sim.addUnit('knight',2,mine.x+5,mine.z);
  assert.ok(distance(enemy,tc)>30);assert.ok(settlementThreats(sim,owner,[enemy],sim.owned(owner,'building')).includes(enemy));
});

test('raided workers retreat through real orders and return to work after danger clears',()=>{
  const {sim,owner,state,workers,tc}=fixture(),worker=workers[0],enemy=sim.addUnit('knight',2,worker.x+4,worker.z),before={...sim.players[owner].resources},position={x:worker.x,z:worker.z};
  protectWorkers(sim,state,owner,[worker],sim.owned(owner,'building'),[enemy]);assert.equal(worker.order?.aiEvade,true);assert.ok(worker.aiFleeing>sim.time);assert.deepEqual({x:worker.x,z:worker.z},position);assert.deepEqual(sim.players[owner].resources,before);
  sim.assignWorker(worker);assert.equal(worker.order,null);enemy.hp=0;sim.time+=13;sim.addResource('wood',tc.x-20,tc.z+2,1000);sim.revision++;sim.assignWorker(worker);assert.equal(worker.order?.type,'gather');assert.equal(worker.aiFleeing,undefined);
});

test('abandoned foundations regain a builder and survive planning save and restore',()=>{
  const {sim,owner,state,workers,tc}=fixture(),site=sim.addBuilding('tower',owner,tc.x+25,tc.z+2);staffSettlements(sim,state,owner,workers,sim.owned(owner,'building'));
  assert.ok(workers.some(w=>w.order?.type==='build'&&w.order.target===site.id));
  const restored=Simulation.restore(JSON.parse(JSON.stringify(sim.serialize())));assert.deepEqual(restored.aiStates[owner].staffedCenters,state.staffedCenters);
});

test('siege attacks observed fortifications while infantry screens the trebuchet',()=>{
  const {sim,owner,tc}=fixture(),ram=sim.addUnit('ram',owner,tc.x+30,tc.z),catapult=sim.addUnit('catapult',owner,tc.x+29,tc.z+4),troops=Array.from({length:10},(_,i)=>sim.addUnit('spearman',owner,tc.x+25+i,tc.z+8)),tower=sim.addBuilding('tower',2,tc.x+52,tc.z,true),house=sim.addBuilding('house',2,tc.x+43,tc.z+5,true);
  const fighters=[ram,catapult,...troops];orderSiegeAssault(sim,owner,fighters,[tower,house],tower);assert.equal(ram.order.type,'attack');assert.equal(ram.order.target,tower.id);assert.equal(catapult.order.target,tower.id);assert.equal(troops.filter(u=>u.order?.type==='guard'&&u.order.target===catapult.id).length,2);
  sim.command([ram.id,catapult.id],{type:'move',x:tc.x,z:tc.z});orderSiegeAssault(sim,owner,fighters,[],tower);assert.equal(ram.order.type,'move');assert.equal(catapult.order.type,'move');
});
