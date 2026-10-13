import test from 'node:test';
import assert from 'node:assert/strict';
import {Simulation} from '../src/simulation.js';
import {UNITS} from '../src/data.js';
import {productionBuildings,trainAcrossBuildings} from '../src/production.js';

function setup(){
  const sim=new Simulation({mode:'sandbox',seed:512}),a=sim.owned(0,'building','barracks')[0],b=sim.addBuilding('barracks',0,-15,25,true);
  sim.players[0].resources={food:10000,wood:10000,gold:10000,stone:10000};return {sim,a,b};
}
test('group training distributes units across the shortest available queues',()=>{
  const {sim,a,b}=setup(),food=sim.players[0].resources.food;
  assert.equal(trainAcrossBuildings(sim,'spearman',[a.id,b.id],5),5);
  assert.deepEqual([a.queue.length,b.queue.length],[3,2]);assert.equal(sim.players[0].resources.food,food-UNITS.spearman.cost.food*5);
  assert.equal(sim.reservedPopulation(0),5);
  assert.equal(trainAcrossBuildings(sim,'spearman',[a.id,b.id]),1);assert.deepEqual([a.queue.length,b.queue.length],[3,3]);
});
test('full, hostile, incomplete, and incompatible buildings cannot consume group orders',()=>{
  const {sim,a,b}=setup(),enemy=sim.addBuilding('barracks',1,30,-30,true),foundation=sim.addBuilding('barracks',0,-15,40),range=sim.addBuilding('range',0,-50,40,true);
  for(let i=0;i<8;i++)assert.ok(sim.train(a.id,'spearman'));
  assert.equal(trainAcrossBuildings(sim,'spearman',[a.id,b.id,enemy.id,foundation.id,range.id],5),5);assert.equal(a.queue.length,8);assert.equal(b.queue.length,5);assert.equal(enemy.queue.length,0);assert.equal(foundation.queue.length,0);assert.equal(range.queue.length,0);
  assert.ok(!productionBuildings(sim).some(e=>e.owner!==0||e.progress<1));
});
test('batches stop at the actual resource and population budgets without charging rejected units',()=>{
  const {sim,a,b}=setup();sim.players[0].resources.food=UNITS.spearman.cost.food*2;
  assert.equal(trainAcrossBuildings(sim,'spearman',[a.id,b.id],5),2);assert.equal(sim.players[0].resources.food,0);
  const cap=sim.capacity(0);while(sim.population(0)+sim.reservedPopulation(0)<cap)sim.addUnit('scout',0,-20,20);
  const budget={...sim.players[0].resources};assert.equal(trainAcrossBuildings(sim,'spearman',[a.id,b.id],5),0);assert.deepEqual(sim.players[0].resources,budget);
});
test('multiplayer batches use virtual queue lengths while awaiting server snapshots',()=>{
  const {sim,a,b}=setup(),requests=[];sim.train=(id,type)=>{requests.push({id,type});return true;};
  assert.equal(trainAcrossBuildings(sim,'spearman',[a.id,b.id],5),5);assert.deepEqual(requests.map(r=>r.id),[a.id,b.id,a.id,b.id,a.id]);
  assert.equal(a.queue.length+b.queue.length,0,'network requests do not mutate authoritative queues');
});
test('production queues preserve refunds and completion through save and resume',()=>{
  const {sim,a,b}=setup(),before={...sim.players[0].resources};trainAcrossBuildings(sim,'spearman',[a.id,b.id],5);
  const loaded=Simulation.restore(sim.serialize());loaded.cancelQueue(a.id,0);assert.equal(loaded.reservedPopulation(0),4);
  for(const [resource,cost]of Object.entries(UNITS.spearman.cost))assert.equal(loaded.players[0].resources[resource],before[resource]-cost*4);
  const population=loaded.population(0);for(let i=0;i<600;i++)loaded.tick(.1);assert.equal(loaded.population(0),population+4);assert.equal(loaded.reservedPopulation(0),0);
});
