import test from 'node:test';
import assert from 'node:assert/strict';
import {Simulation} from '../src/simulation.js';
import {battlePreset} from '../src/custom-battle.js';
import {BUILDINGS} from '../src/data.js';
import {clearSegment,findPath} from '../src/navigation.js';
import {wallConnections} from '../src/walls.js';
import {staffSettlements} from '../src/ai-settlements.js';
import {fortificationRoutesSafe,planFortification,planPerimeterUpgrade,fortifyKingdomWalls,fortificationReserved} from '../src/ai-fortifications.js';

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

test('a developed AI upgrades its paid front into a closed perimeter with two usable allied gates',()=>{
  const {sim,owner,workers,state}=fixture();fortifyKingdomWalls(sim,state,owner,workers,sim.owned(owner,'building'),[]);advanceWalls(sim,owner,320);
  const original=state.fortifications[0],paid=original.pieces.map(piece=>piece.id);assert.ok(paid.every(id=>sim.get(id)?.progress===1));
  for(let i=0;i<4;i++)sim.addUnit('villager',owner,-35-i,6);
  sim.time=650;sim.players[owner].resources={food:1500,wood:1800,gold:1200,stone:2500};
  const before=JSON.stringify(sim.serialize()),upgrade=planPerimeterUpgrade(sim,original,owner);
  assert.ok(upgrade,'a clear, visible core must accept a closed layout');assert.equal(upgrade.layout,'perimeter');assert.equal(upgrade.pieces.filter(piece=>piece.type==='gate').length,2);
  assert.ok(paid.every(id=>upgrade.pieces.some(piece=>piece.id===id)),'retain the already paid front');assert.equal(JSON.stringify(sim.serialize()),before,'planning does not edit the live battlefield');
  const missing=upgrade.pieces.filter(piece=>!sim.get(piece.id)),expectedStone=2500-missing.reduce((sum,piece)=>sum+sim.cost(BUILDINGS[piece.type].cost,owner,'building').stone,0);
  const gate=upgrade.pieces[0],normal={x:Math.sin(upgrade.angle),z:Math.cos(upgrade.angle)},inside={x:gate.x-normal.x*9,z:gate.z-normal.z*9};
  assert.equal(fortifyKingdomWalls(sim,state,owner,sim.owned(owner,'unit','villager'),sim.owned(owner,'building'),[]),true);
  assert.equal(state.fortifications[0].layout,'perimeter');assert.equal(sim.owned(owner,'unit','villager').filter(worker=>worker.order?.target===state.fortifications[0].pieces.find(piece=>!paid.includes(piece.id)&&piece.id)?.id).length,2);
  advanceWalls(sim,owner,120);const restored=Simulation.restore(JSON.parse(JSON.stringify(sim.serialize())));restored.tickCustomAI=()=>{};advanceWalls(restored,owner,650);
  const plan=restored.aiStates[owner].fortifications[0];assert.ok(plan.pieces.every(piece=>restored.get(piece.id)?.progress===1),'builders finish the saved perimeter');assert.equal(restored.players[owner].resources.stone,expectedStone);
  for(const opening of plan.pieces.filter(piece=>piece.type==='gate')){
    const from={x:opening.x-normal.x*9,z:opening.z-normal.z*9},to={x:opening.x+normal.x*9,z:opening.z+normal.z*9};
    for(const ally of [0,owner])assert.equal(clearSegment(restored,restored.grid(ally),from,to),true,'both gate roads stay open to allies');
    assert.equal(clearSegment(restored,restored.grid(2),from,to),false);
  }
  for(let i=0;i<8;i++){
    const angle=i*Math.PI/4,probe={type:'spearman',owner:2,r:.65,x:sim.get(plan.base).x+Math.sin(angle)*55,z:sim.get(plan.base).z+Math.cos(angle)*55};
    findPath(restored,probe,inside);assert.equal(probe.pathStatus,'blocked','enemy foot troops cannot walk around a perimeter end');
  }
  const rear=plan.pieces.find(piece=>piece.type==='gate'&&piece.id!==gate.id);
  assert.equal(fortificationReserved(restored,'house',rear.x-normal.x*8,rear.z-normal.z*8,owner),true,'economic construction preserves the rear gate road');
});

test('perimeter upgrades retain scouting and economic requirements',()=>{
  const {sim,owner,workers,state}=fixture();fortifyKingdomWalls(sim,state,owner,workers,sim.owned(owner,'building'),[]);advanceWalls(sim,owner,320);
  const plan=state.fortifications[0];sim.players[owner].resources.stone=180;const before=JSON.stringify(sim.serialize());assert.equal(planPerimeterUpgrade(sim,plan,owner),null);assert.equal(JSON.stringify(sim.serialize()),before);
  sim.players[owner].resources.stone=2500;sim.canSee=()=>false;assert.equal(planPerimeterUpgrade(sim,plan,owner),null);assert.equal(plan.layout,undefined);
});

test('custom AI can fortify during expansion without stealing the expansion crew',()=>{
  const {sim,owner,workers,state}=fixture(),crew=workers[0];crew.order={type:'move',x:50,z:50,aiExpansion:true};state.expansion={workers:[crew.id],x:50,z:50};
  const before=structuredClone(crew.order);assert.equal(fortifyKingdomWalls(sim,state,owner,workers,sim.owned(owner,'building'),[]),true);
  assert.deepEqual(crew.order,before);assert.ok(workers.some(worker=>worker.id!==crew.id&&worker.order?.type==='build'));
});

test('economic construction and abandoned foundations do not steal a worker clearing a wall exit',()=>{
  const {sim,owner,workers,state}=fixture();for(const worker of workers)worker.order={type:'move',x:-30,z:-4,aiFortification:true};
  const orders=workers.map(worker=>structuredClone(worker.order));assert.equal(sim.commanderBuild('house',null,owner),false);
  sim.addBuilding('house',owner,-32,-15,false);staffSettlements(sim,state,owner,workers,sim.owned(owner,'building'));
  assert.deepEqual(workers.map(worker=>worker.order),orders);
});

test('food and gold committed to armies do not freeze a stone-funded wall plan',()=>{
  const {sim,owner,workers,state}=fixture();sim.players[owner].resources.food=0;sim.players[owner].resources.gold=0;
  assert.equal(fortifyKingdomWalls(sim,state,owner,workers,sim.owned(owner,'building'),[]),true);
  advanceWalls(sim,owner,320);assert.ok(state.fortifications[0].pieces.every(piece=>sim.get(piece.id)?.progress===1));
  assert.equal(sim.players[owner].resources.food,0);assert.equal(sim.players[owner].resources.gold,0);
});

test('a worker at a distant future wall does not freeze the next safe foundation',()=>{
  const {sim,owner,workers,state}=fixture();fortifyKingdomWalls(sim,state,owner,workers,sim.owned(owner,'building'),[]);advanceWalls(sim,owner,320);
  sim.players[owner].resources.stone=5000;sim.time=650;const plan=state.fortifications[0],upgrade=planPerimeterUpgrade(sim,plan,owner);assert.ok(upgrade);Object.assign(plan,upgrade);
  const later=plan.pieces.at(-1),temporary=sim.addUnit('villager',owner,later.x,later.z),next=plan.pieces.find(p=>!sim.get(p.id));
  assert.equal(fortificationRoutesSafe(sim,plan,owner),false);assert.equal(fortificationRoutesSafe(sim,plan,owner,null,next),true,'the next foundation leaves the worker a real exit');
  assert.equal(fortifyKingdomWalls(sim,state,owner,sim.owned(owner,'unit','villager'),sim.owned(owner,'building'),[]),true);assert.ok(sim.get(next.id));assert.ok(temporary.hp>0);
});

test('covering walls route around developed buildings and complete with actual builders',()=>{
  const {sim,owner,workers,state}=fixture();fortifyKingdomWalls(sim,state,owner,workers,sim.owned(owner,'building'),[]);advanceWalls(sim,owner,320);
  const front=state.fortifications[0],gate=front.pieces[0],n={x:Math.sin(front.angle),z:Math.cos(front.angle)},t={x:n.z,z:-n.x};
  for(const sign of [-1,1])sim.addBuilding('house',owner,gate.x+t.x*sign*17.1-n.x*19.95,gate.z+t.z*sign*17.1-n.z*19.95,true);
  for(let i=0;i<4;i++)sim.addUnit('villager',owner,-35-i,6);
  sim.time=650;sim.players[owner].resources.stone=5000;
  const plan=planPerimeterUpgrade(sim,front,owner);assert.ok(plan,'a developed core must allow a detour instead of abandoning enclosure');
  assert.ok(plan.pieces.some(p=>Math.abs((p.x-gate.x)*t.x+(p.z-gate.z)*t.z)>20),'side walls detour outside the buildings');
  Object.assign(front,plan);advanceWalls(sim,owner,950);assert.ok(front.pieces.every(piece=>sim.get(piece.id)?.progress===1));
  const inside={x:gate.x-n.x*9,z:gate.z-n.z*9},probe={type:'spearman',owner:2,r:.65,x:gate.x+n.x*9,z:gate.z+n.z*9};findPath(sim,probe,inside);assert.equal(probe.pathStatus,'blocked');
});

test('a harvested natural wall anchor becomes a paid replacement instead of a permanent gap',()=>{
  const {sim,owner,workers,state}=fixture();fortifyKingdomWalls(sim,state,owner,workers,sim.owned(owner,'building'),[]);advanceWalls(sim,owner,320);
  const plan=state.fortifications[0];plan.layout='perimeter';const piece=plan.pieces.at(-1),section=sim.get(piece.id);sim.hurt(section,section.hp+1,null);delete piece.id;
  const ore=sim.addResource('stone',piece.x,piece.z,100);piece.anchorIds=[ore.id];const stone=sim.players[owner].resources.stone;sim.time+=31;
  assert.equal(fortifyKingdomWalls(sim,state,owner,workers,sim.owned(owner,'building'),[]),false);assert.equal(sim.players[owner].resources.stone,stone);
  ore.hp=0;ore.amount=0;sim.revision++;sim.time+=31;
  assert.equal(fortifyKingdomWalls(sim,state,owner,workers,sim.owned(owner,'building'),[]),true);assert.equal(sim.players[owner].resources.stone,stone-sim.cost(BUILDINGS.wall.cost,owner,'building').stone);
  advanceWalls(sim,owner,45);assert.equal(sim.get(piece.id)?.progress,1);
});
