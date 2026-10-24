import test from 'node:test';
import assert from 'node:assert/strict';
import {Simulation,distance} from '../src/simulation.js';
import {battlePreset} from '../src/custom-battle.js';
import {groupFieldForests} from '../src/field-forests.js';
import {seededRandom} from '../src/data.js';

function fixture(){
  const random=seededRandom(312),entities=Array.from({length:100},(_,i)=>({id:i+1,kind:'resource',type:'wood',owner:-1,hp:1,r:1.1,amount:400+i,initialAmount:400+i,x:(random()-.5)*145,z:(random()-.5)*145}));
  entities.push({id:101,kind:'building',type:'towncenter',owner:0,hp:100,r:5,x:-40,z:40},{id:102,kind:'resource',type:'gold',owner:-1,hp:1,r:1.7,amount:500,x:20,z:20},{id:103,kind:'unit',type:'spearman',owner:0,hp:50,r:.65,x:-30,z:40});
  return {entities,options:{mode:'sandbox',seed:512},worldSize:160,halfWorld:80,revision:7,grids:{old:true},rng:()=>{throw Error('Forest composition must not consume the live simulation RNG');},isWater:(x,z)=>Math.abs(x)<5&&Math.abs(z)>10,startClearing:(x,z)=>Math.abs(x)<12&&Math.abs(z)<12};
}

test('field groves reuse the existing wood supply and identities without moving non-wood resources or consuming simulation RNG',()=>{
  const a=fixture(),b=fixture(),before=a.entities.map(e=>({id:e.id,type:e.type,amount:e.amount,initialAmount:e.initialAmount})),fixed=structuredClone(a.entities.slice(100)),result=groupFieldForests(a);groupFieldForests(b);
  assert.equal(result.trees,100);assert.equal(result.moved,100);assert.equal(result.remaining,0);assert.equal(result.singles,5);assert.ok(result.groups>1);
  assert.deepEqual(a.entities.map(e=>({id:e.id,type:e.type,amount:e.amount,initialAmount:e.initialAmount})),before);assert.deepEqual(a.entities.slice(100),fixed);assert.deepEqual(a.entities,b.entities);assert.deepEqual(a.grids,{});assert.equal(a.revision,8);
  const wood=a.entities.filter(e=>e.type==='wood'),singles=wood.filter(tree=>!wood.some(other=>other!==tree&&distance(tree,other)<3.5));assert.equal(singles.length,result.singles);
  for(const tree of wood){assert.equal(a.isWater(tree.x,tree.z),false);assert.equal(a.startClearing(tree.x,tree.z),false);}
  for(const tree of singles)assert.ok(wood.every(other=>other===tree||distance(tree,other)>=6),'single trees retain open spacing');
});

test('field groves leave army routes open with occasional lone trees across custom sizes and biomes',()=>{
  for(const seed of [512,2026])for(const mapSize of ['spacious','vast','epic'])for(const map of ['highlands','winter','desert','canyon','valley','rivers','coast']){
    const sim=new Simulation({mode:'custom',map,mapSize,seed,slots:battlePreset('4v4')}),wood=sim.entities.filter(e=>e.hp>0&&e.type==='wood'),field=wood.filter(e=>e.startForest===undefined);
    assert.ok(field.length>0);
    const singles=field.filter(tree=>!wood.some(other=>other!==tree&&distance(tree,other)<3.5));
    assert.ok(singles.length>0&&singles.length<=Math.min(48,Math.floor(field.length*.05)),`${seed}/${map}/${mapSize}: sparse single trees`);
    for(const tree of field){assert.equal(sim.isWater(tree.x,tree.z),false);assert.equal(sim.startClearing(tree.x,tree.z),false);}
    for(const owner of sim.players.keys()){
      const scout=sim.owned(owner,'unit','scout')[0],goal=map==='coast'?{x:Math.sign(scout.x)*28,z:0}:{x:0,z:0};
      sim.pathTo(scout,goal);assert.equal(scout.pathStatus,'ready',`${seed}/${map}/${mapSize}/${owner}: field route`);
    }
  }
});

test('grouped wood locations survive save/reconnect and existing saves retain their exact original layout',()=>{
  const sim=new Simulation({mode:'custom',map:'rivers',seed:512,slots:battlePreset('2v2')}),saved=JSON.parse(JSON.stringify(sim.serialize())),tree=saved.entities.find(e=>e.kind==='resource'&&e.type==='wood'&&e.startForest===undefined);
  tree.x=63.125;tree.z=55.875;tree.amount=123;tree.initialAmount=600;
  const restored=Simulation.restore(saved);assert.deepEqual(restored.entities,saved.entities);assert.equal(restored.get(tree.id).x,63.125);assert.equal(restored.get(tree.id).amount,123,'restoring never regroups or replenishes a saved resource');
});
