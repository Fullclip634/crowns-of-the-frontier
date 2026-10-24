import test from 'node:test';
import assert from 'node:assert/strict';
import {Simulation} from '../src/simulation.js';
import {battlePreset} from '../src/custom-battle.js';
import {BUILDINGS} from '../src/data.js';
import {clearSegment} from '../src/navigation.js';
import {wallConnections} from '../src/walls.js';
import {staffSettlements} from '../src/ai-settlements.js';
import {fortificationRoutesSafe,planFortification,fortifyKingdomWalls,fortificationReserved} from '../src/ai-fortifications.js';

function fixture(){
  const sim=new Simulation({mode:'custom',map:'highlands',mapSize:'large',slots:battlePreset('2v2'),startAge:2,seed:512});
  sim.entities=[];sim.index=new Map();sim.grids={};sim.revision++;sim.time=240;sim.tickCustomAI=()=>{};
  const owner=1,base=sim.addBuilding('towncenter',owner,-40,0,true);
  sim.addBuilding('towncenter',0,-75,-50,true);sim.addBuilding('towncenter',2,65,65,true);sim.addBuilding('towncenter',3,80,50,true);
  sim.addBuilding('tower',owner,-25,0,true);sim.addBuilding('barracks',owner,-42,12,true);sim.addBuilding('barracks',0,-48,-12,true);
  const workers=Array.from({length:20},(_,index)=>sim.addUnit('villager',owner,-39-index%5,-8-Math.floor(index/5)*2));
  sim.addUnit('spearman',0,-32,2);sim.addUnit('ram',owner,-35,4);
  sim.players[owner].resources={food:1500,wood:1800,gold:1200,stone:1600};
  const state=sim.aiStates[owner]={known:{},decision:0};return {sim,owner,base,workers,state};
}

function advanceWalls(sim,owner,seconds){
  for(let tick=0;tick<seconds*10;tick++){
    sim.tick(.1);
    if(tick%30===0){const workers=sim.owned(owner,'unit','villager'),buildings=sim.owned(owner,'building'),state=sim.aiStates[owner];staffSettlements(sim,state,owner,workers,buildings);fortifyKingdomWalls(sim,state,owner,workers,buildings,[]);}
  }
}

test('AI plans a linked tower defense without altering live routes, resources, or wall topology',()=>{
  const {sim,owner,base,state}=fixture(),before=JSON.stringify(sim.serialize()),revision=sim.revision;
  const plan=planFortification(sim,state,owner,base,sim.owned(owner,'building'));
  assert.ok(plan);assert.equal(plan.pieces[0].type,'gate');assert.equal(plan.pieces.length,9);assert.equal(fortificationRoutesSafe(sim,plan,owner),true);
  assert.equal(JSON.stringify(sim.serialize()),before);assert.equal(sim.revision,revision);
});

test('real builders finish paid gates and walls, retain allied passage, and resume a saved construction plan',()=>{
  const {sim,owner,workers,state}=fixture(),before={...sim.players[owner].resources},gateCost=sim.cost(BUILDINGS.gate.cost,owner,'building'),wallCost=sim.cost(BUILDINGS.wall.cost,owner,'building');
  assert.equal(fortifyKingdomWalls(sim,state,owner,workers,sim.owned(owner,'building'),[]),true);
  const plan=state.fortifications[0],gate=sim.get(plan.pieces[0].id);
  assert.equal(gate.progress,0);assert.equal(sim.owned(owner,'building','wall').length,0);assert.equal(workers.filter(worker=>worker.order?.target===gate.id).length,1);
  assert.equal(sim.players[owner].resources.stone,before.stone-gateCost.stone);
  advanceWalls(sim,owner,65);
  const saved=JSON.parse(JSON.stringify(sim.serialize())),restored=Simulation.restore(saved);restored.tickCustomAI=()=>{};
  assert.deepEqual(restored.aiStates[owner].fortifications,state.fortifications);advanceWalls(restored,owner,240);
  const completed=restored.aiStates[owner].fortifications[0],pieces=completed.pieces.map(piece=>restored.get(piece.id));assert.ok(pieces.every(piece=>piece?.progress===1));
  assert.equal(restored.players[owner].resources.stone,before.stone-gateCost.stone-wallCost.stone*8);assert.equal(restored.players[owner].resources.wood,before.wood-gateCost.wood);
  assert.equal(wallConnections(restored.entities).length,8);
  const center=pieces[0],normal={x:Math.sin(completed.angle),z:Math.cos(completed.angle)},from={x:center.x-normal.x*9,z:center.z-normal.z*9},to={x:center.x+normal.x*9,z:center.z+normal.z*9};
  assert.equal(clearSegment(restored,restored.grid(owner),from,to),true);assert.equal(clearSegment(restored,restored.grid(0),from,to),true);assert.equal(clearSegment(restored,restored.grid(2),from,to),false);
  const count=restored.entities.length,resources={...restored.players[owner].resources};advanceWalls(restored,owner,70);assert.equal(restored.entities.length,count);assert.deepEqual(restored.players[owner].resources,resources);
});

test('human slots, an unfinished economy, unscouted sites and a current attack do not receive AI walls',()=>{
  for(const change of ['human','age','workers','budget','vision','attack']){
    const {sim,owner,workers,state}=fixture(),before=sim.entities.length;let threats=[];
    if(change==='human')sim.players[owner].controller='human';
    if(change==='age')sim.players[owner].age=0;
    if(change==='workers')workers.splice(0,5);
    if(change==='budget')sim.players[owner].resources.stone=200;
    if(change==='vision')sim.canSee=()=>false;
    if(change==='attack')threats=[sim.addUnit('knight',2,-20,0)];
    const resources={...sim.players[owner].resources};assert.equal(fortifyKingdomWalls(sim,state,owner,workers,sim.owned(owner,'building'),threats),false,change);assert.equal(sim.entities.length,before+Number(change==='attack'),change);assert.deepEqual(sim.players[owner].resources,resources,change);
  }
});

test('a missing builder is replaced and a destroyed section costs resources to restore after danger clears',()=>{
  const {sim,owner,workers,state}=fixture();fortifyKingdomWalls(sim,state,owner,workers,sim.owned(owner,'building'),[]);
  const builder=workers.find(worker=>worker.order?.type==='build');builder.hp=0;sim.revision++;
  advanceWalls(sim,owner,280);const plan=sim.aiStates[owner].fortifications[0],walls=plan.pieces.map(piece=>sim.get(piece.id));assert.ok(walls.every(wall=>wall?.progress===1));
  const section=walls[3],before=sim.players[owner].resources.stone;sim.hurt(section,section.hp+1,null);sim.time+=31;
  assert.equal(fortifyKingdomWalls(sim,state,owner,sim.owned(owner,'unit','villager'),sim.owned(owner,'building'),[{type:'knight'}]),false);assert.equal(sim.players[owner].resources.stone,before);
  assert.equal(fortifyKingdomWalls(sim,state,owner,sim.owned(owner,'unit','villager'),sim.owned(owner,'building'),[]),true);assert.equal(sim.players[owner].resources.stone,before-sim.cost(BUILDINGS.wall.cost,owner,'building').stone);advanceWalls(sim,owner,35);assert.ok(sim.get(plan.pieces[3].id)?.progress===1);
});

test('AI economic construction preserves planned wall footprints and the gate approach for its allies',()=>{
  const {sim,owner,workers,state}=fixture();fortifyKingdomWalls(sim,state,owner,workers,sim.owned(owner,'building'),[]);
  const plan=state.fortifications[0],piece=plan.pieces[1],gate=plan.pieces[0];
  assert.equal(fortificationReserved(sim,'house',piece.x,piece.z,owner),true);assert.equal(fortificationReserved(sim,'house',piece.x,piece.z,0),true);
  assert.equal(fortificationReserved(sim,'house',gate.x-Math.sin(plan.angle)*8,gate.z-Math.cos(plan.angle)*8,owner),true);
  assert.equal(fortificationReserved(sim,'house',75,-65,owner),false);
  const site=sim.commanderBuild('house',piece,owner);assert.ok(site);assert.equal(fortificationReserved(sim,'house',site.x,site.z,owner),false);
  advanceWalls(sim,owner,300);assert.ok(plan.pieces.every(piece=>sim.get(piece.id)?.progress===1));
});

test('a later obstruction pauses a saved wall plan and construction resumes after the footprint clears',()=>{
  const {sim,owner,workers,state}=fixture();fortifyKingdomWalls(sim,state,owner,workers,sim.owned(owner,'building'),[]);advanceWalls(sim,owner,35);
  const plan=state.fortifications[0],piece=plan.pieces.find(piece=>!sim.get(piece.id)),obstruction=sim.addBuilding('house',0,piece.x,piece.z,true);
  advanceWalls(sim,owner,65);assert.ok(plan.retryAt>0);assert.equal(sim.get(piece.id),null);assert.equal(state.fortifications.length,1);
  obstruction.hp=0;sim.revision++;advanceWalls(sim,owner,280);assert.ok(plan.pieces.every(piece=>sim.get(piece.id)?.progress===1));
});
