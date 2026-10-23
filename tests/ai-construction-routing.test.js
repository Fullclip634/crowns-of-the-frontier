import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {Simulation} from '../src/simulation.js';
import {constructionPreservesArmyRoutes} from '../src/commander-ai.js';
import {battlePreset} from '../src/custom-battle.js';

function narrowRoute(){
  const sim=new Simulation({mode:'sandbox',seed:512}),size=sim.gridSize,grid=new Uint8Array(size*size).fill(1),row=40;
  for(let x=30;x<=50;x++)grid[row*size+x]=0;
  sim.grid=()=>grid;
  const unit=sim.addUnit('spearman',0,-19,1);sim.command([unit.id],{type:'move',x:21,z:1});unit.path=sim.pathTo(unit,unit.order,1.4);
  assert.equal(unit.pathStatus,'ready');return {sim,unit};
}

test('AI foundations cannot overlap allied combat units',()=>{
  const sim=new Simulation({mode:'sandbox',seed:512}),unit=sim.addUnit('spearman',0,0,20),before={x:unit.x,z:unit.z};
  assert.equal(constructionPreservesArmyRoutes(sim,'mine',2,20,0),false);
  assert.deepEqual({x:unit.x,z:unit.z},before);
});

test('AI foundations preserve an army route through a narrow one-cell corridor without changing simulation state',()=>{
  const {sim,unit}=narrowRoute(),path=unit.path.map(point=>({...point})),revision=sim.revision;
  assert.equal(constructionPreservesArmyRoutes(sim,'mine',1,1,0),false);
  assert.equal(unit.pathStatus,'ready');assert.deepEqual(unit.path,path);assert.equal(sim.revision,revision);
});

test('AI may build beside an army route when the troop still has a valid detour',()=>{
  const sim=new Simulation({mode:'sandbox',seed:512}),unit=sim.addUnit('spearman',0,-20,1),grid=new Uint8Array(sim.gridSize*sim.gridSize);
  sim.grid=()=>grid;sim.command([unit.id],{type:'move',x:20,z:1});unit.path=sim.pathTo(unit,unit.order,1.4);assert.equal(unit.pathStatus,'ready');
  assert.equal(constructionPreservesArmyRoutes(sim,'mine',0,1,0),true);
  assert.equal(unit.pathStatus,'ready');
});

test('custom AI skips the audited mine site that overlaps a spearman and chooses a safe alternative',()=>{
  const sim=new Simulation({mode:'custom',map:'highlands',seed:512,mapSize:'vast',slots:battlePreset('2v2'),populationLimit:80,aiPace:'balanced'}),owner=3;
  const unit=sim.addUnit('spearman',owner,124.39982668964461,102.39982668964454),target={x:123.28876849395338,z:100.25172564898419};
  unit.order={type:'move',x:101,z:125};unit.path=sim.pathTo(unit,unit.order,1.4);
  assert.equal(unit.pathStatus,'ready');assert.ok(sim.buildValid('mine',target.x,target.z,owner));
  assert.equal(constructionPreservesArmyRoutes(sim,'mine',target.x,target.z,owner),false);
  const site=sim.commanderBuild('mine',{x:target.x-4,z:target.z},owner);
  assert.ok(site);assert.ok(Math.hypot(site.x-target.x,site.z-target.z)>.01);
  assert.equal(sim.pathTo(unit,unit.order,1.4).length>0,true);assert.equal(unit.pathStatus,'ready');
});

test('the restored audited trap fixture lets a spearman route out of a mine foundation',()=>{
  const snapshot=JSON.parse(fs.readFileSync(new URL('./fixtures/ai-construction-trap-save.json',import.meta.url),'utf8')),sim=Simulation.restore(snapshot),unit=sim.get(1463),mine=sim.get(1459);
  assert.ok(unit&&mine,'the fixture must retain the audited spearman and mine');
  assert.ok(Math.hypot(unit.x-mine.x,unit.z-mine.z)<mine.r+.9,'the spearman starts inside the mine clearance');
  const path=sim.pathTo(unit,{x:101,z:125},1.4);
  assert.equal(unit.pathStatus,'ready');assert.ok(path.length);assert.ok(Math.hypot(path.at(-1).x-101,path.at(-1).z-125)<2);
});

test('custom AI reinforcements stay routable through the audited early-game barracks and mine layout',()=>{
  const sim=new Simulation({mode:'custom',map:'highlands',seed:512,mapSize:'vast',slots:battlePreset('2v2'),populationLimit:80,aiPace:'balanced'});
  sim.players[0].controller='ai';const blocked=[];sim.on(event=>{if(event.type==='order-blocked'&&event.entity.owner===3)blocked.push(event.entity.id);});
  while(sim.time<30)sim.tick(.1);
  const unit=sim.owned(3,'unit','spearman')[0],mine=sim.owned(3,'building','mine').find(building=>Math.hypot(building.x-123.28876849395338,building.z-100.25172564898419)<.1);
  assert.ok(unit&&mine,'the deterministic fixture must produce the audited reinforcement and mine');
  assert.ok(Math.hypot(unit.x-mine.x,unit.z-mine.z)>=mine.r+.9,'the reinforcement spawns outside the mine clearance');
  const route=sim.pathTo(unit,{x:101,z:125},1.4);assert.equal(unit.pathStatus,'ready');assert.ok(route.length);
  assert.equal(blocked.includes(unit.id),false,'the reinforcement must not emit the audited blocked order');
});
