import test from 'node:test';
import assert from 'node:assert/strict';
import {Simulation} from '../src/simulation.js';
import {resourceBarMarkup} from '../src/resource-bar.js';

test('natural supplies last longer in ordinary and custom battles without changing an explicitly placed node',()=>{
  const standard=new Simulation({mode:'sandbox',map:'canyon',seed:818});
  const expected={wood:new Set([440,480,600]),food:new Set([700]),gold:new Set([3600,4400]),stone:new Set([3600,4400])};
  for(const node of standard.entities.filter(e=>e.kind==='resource')){
    assert.ok(expected[node.type].has(node.initialAmount),`${node.type} ${node.initialAmount}`);
    assert.equal(node.amount,node.initialAmount);
  }
  const custom=new Simulation({mode:'custom',map:'coast',seed:818});
  const deposits=custom.entities.filter(e=>e.startDeposit!==undefined);
  assert.ok(deposits.length);
  for(const node of deposits)assert.equal(node.initialAmount,node.type==='food'?1000:4400);
  for(const fish of custom.entities.filter(e=>e.water&&e.kind==='resource'))assert.equal(fish.initialAmount,5200);
  const explicit=standard.addResource('gold',1,2,123);assert.equal(explicit.amount,123);
});

test('save and restore retain the exact remaining resource amount',()=>{
  const sim=new Simulation({mode:'sandbox',seed:77});
  const source=sim.entities.find(e=>e.kind==='resource'&&e.type==='food');
  source.amount=19.25;
  const restored=Simulation.restore(JSON.parse(JSON.stringify(sim.serialize()))).entities.find(e=>e.id===source.id);
  assert.equal(restored.amount,19.25);
  assert.equal(restored.initialAmount,source.initialAmount);
});

test('all five resource counts have their own icon, visible label and exact accessible amount',()=>{
  const html=resourceBarMarkup({resources:{food:1021,wood:2312,gold:78,stone:2}},12,20);
  for(const [type,amount] of [['food',1021],['wood',2312],['gold',78],['stone',2]]){
    const group=html.match(new RegExp(`<div class="resource" role="group" aria-label="${type}: ${amount}"[\\s\\S]*?<\\/div>`))?.[0];
    assert.ok(group,`${type} is labelled with its exact count`);
    assert.ok(group.indexOf('<svg')<group.indexOf('<strong>'));
    assert.ok(group.includes(`<small>${type.toUpperCase()}</small>`));
  }
  assert.match(html,/aria-label="Population: 12 of 20"/);
  assert.match(html,/<small>POP<\/small>/);
});
