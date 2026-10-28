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
