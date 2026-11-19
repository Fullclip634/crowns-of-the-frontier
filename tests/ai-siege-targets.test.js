import test from 'node:test';
import assert from 'node:assert/strict';
import {Simulation} from '../src/simulation.js';
import {orderSiegeAssault} from '../src/ai-siege.js';

function fixture(){
  const sim=new Simulation({mode:'sandbox',map:'highlands',seed:512});for(const e of sim.entities)e.hp=0;sim.revision++;
  const walls=[];for(let z=-79;z<=79;z+=2.85){const wall=sim.addBuilding('wall',1,0,z,true);wall.wallAngle=Math.PI/2;walls.push(wall);}
  sim.revision++;const wall=walls.reduce((best,item)=>Math.abs(item.z-1)<Math.abs(best.z-1)?item:best),tower=sim.addBuilding('tower',1,8,wall.z,true),ram=sim.addUnit('ram',0,-12,wall.z),trebuchet=sim.addUnit('catapult',0,-13,wall.z+2);
  return {sim,walls,wall,tower,ram,trebuchet};
}

test('rams choose a reachable breach while trebuchets retain ranged targets behind a sealed wall',()=>{
  const {sim,wall,tower,ram,trebuchet}=fixture();const before=structuredClone(ram);orderSiegeAssault(sim,0,[ram,trebuchet],[wall,tower],tower);
  assert.equal(ram.order?.target,wall.id,'the ram attacks masonry it can actually reach');assert.equal(trebuchet.order?.target,tower.id,'the trebuchet can fire over the wall');
  assert.deepEqual([ram.x,ram.z],[before.x,before.z]);assert.equal(ram.hp,before.hp);
  const order=ram.order,path=ram.path;orderSiegeAssault(sim,0,[ram],[wall,tower],tower);assert.equal(ram.order,order,'an unchanged target retains its order');assert.equal(ram.path,path,'planning does not reset an existing route');
});

test('rams preserve their previous order when all observed buildings are inaccessible',()=>{
  const {sim,tower,ram}=fixture();sim.command([ram.id],{type:'move',x:-30,z:20});const before=structuredClone(ram);orderSiegeAssault(sim,0,[ram],[tower],tower);assert.deepEqual(ram,before,'unreachable targets do not overwrite a real order or path state');
});

test('opening a real breach lets a ram select the defended building without teleporting',()=>{
  const {sim,walls,tower,ram}=fixture();for(const wall of walls)if(Math.abs(wall.z-ram.z)<9)wall.hp=0;sim.revision++;
  orderSiegeAssault(sim,0,[ram],[tower],tower);assert.equal(ram.order?.target,tower.id);assert.equal(ram.x,-12);
});

test('a ram breaches masonry through normal movement and damage before advancing on the tower',()=>{
  const {sim,walls,tower,ram}=fixture();sim.tickAI=()=>{};tower.cooldown=10000;let next=0,crossed=false;
  for(let i=0;i<1000&&tower.hp===tower.maxHp;i++){
    if(sim.time>=next){next=sim.time+2;const observed=[...walls.filter(wall=>wall.hp>0&&Math.hypot(wall.x-ram.x,wall.z-ram.z)<24),tower];orderSiegeAssault(sim,0,[ram],observed,tower);}
    const previous={x:ram.x,z:ram.z};sim.tick(.1);assert.ok(Math.hypot(ram.x-previous.x,ram.z-previous.z)<1,'the ram never teleports through the defenses');if(ram.x>1)crossed=true;
  }
  assert.ok(walls.some(wall=>wall.hp<=0),'the ram destroys an actual section');assert.ok(crossed,'the ram advances through the breach');assert.ok(tower.hp<tower.maxHp,'the ram reaches and damages the defended tower');
});

test('trebuchets select a firing position on their shore when a more attractive target is out of reach',()=>{
  const sim=new Simulation({mode:'sandbox',map:'coast',seed:512});
  for(const entity of sim.entities)entity.hp=0;
  sim.revision++;
  const engine=sim.addUnit('catapult',0,-24,0);
  const distantTower=sim.addBuilding('tower',1,19,0,true);
  const reachableTown=sim.addBuilding('towncenter',1,-23,35,true);
  const assignments=orderSiegeAssault(sim,0,[engine],[distantTower,reachableTown],distantTower);
  assert.ok(assignments.has(engine.id));
  assert.equal(engine.order?.target,reachableTown.id);
});

test('commander refreshes the army objective without resetting siege movement and escorts',()=>{
  const sim=new Simulation({mode:'skirmish',map:'highlands',seed:512});
  for(const entity of sim.entities)entity.hp=0;
  sim.revision++;
  sim.addBuilding('towncenter',1,-45,-40,true);
  const tower=sim.addBuilding('tower',0,20,0,true);
  const engine=sim.addUnit('catapult',1,-15,0);
  const escorts=Array.from({length:5},(_,i)=>sim.addUnit('spearman',1,-17-i,2));
  sim.players[1].resources={food:0,wood:0,gold:0,stone:0};
  sim.canSee=()=>true;
  sim.nextAttack=0;
  sim.time=500;
  sim.tickAI(1);
  assert.equal(engine.order?.target,tower.id);
  const screen=escorts.find(unit=>unit.order?.type==='guard');
  assert.equal(screen?.order.target,engine.id);
  const engineOrder=engine.order,screenOrder=screen.order;
  const path=[{x:-10,z:0},{x:-4,z:0}];
  engine.path=path;
  sim.time+=9;
  sim.tickAI(1);
  assert.equal(engine.order,engineOrder);
  assert.equal(engine.path,path);
  assert.equal(screen.order,screenOrder);
});

test('a commander keeps marching formations intact and redirects them when the objective moves',()=>{
  const sim=new Simulation({mode:'skirmish',map:'highlands',seed:512});
  for(const entity of sim.entities)entity.hp=0;
  sim.revision++;
  sim.addBuilding('towncenter',1,-45,-40,true);
  const objective=sim.addBuilding('towncenter',0,20,0,true);
  const fighters=Array.from({length:6},(_,i)=>sim.addUnit('spearman',1,-17-i,2));
  sim.players[1].resources={food:0,wood:0,gold:0,stone:0};
  sim.canSee=()=>true;
  sim.nextAttack=0;sim.time=500;
  sim.tickAI(1);
  assert.equal(sim.commanderAI.phase,'attack');
  assert.ok(fighters.every(unit=>unit.order?.type==='attackmove'));
  const fighter=fighters[0],order=fighter.order,path=[{x:-10,z:0},{x:-4,z:0}];
  fighter.path=path;fighter.pathStatus='ready';
  const reinforcement=sim.addUnit('spearman',1,-19,8);
  sim.time+=9;
  sim.tickAI(1);
  assert.equal(fighter.order,order,'orders for existing formation slots survive a commander refresh');
  assert.equal(fighter.path,path,'the formation keeps its current path');
  assert.equal(reinforcement.order?.type,'attackmove','new units join the current assault');

  objective.hp=0;
  const newObjective=sim.addBuilding('towncenter',0,30,13,true);
  sim.time+=9;
  sim.tickAI(1);
  assert.notEqual(fighter.order,order);
  assert.deepEqual(fighter.order?.commanderObjective,{x:newObjective.x,z:newObjective.z,phase:'attack'});
});
