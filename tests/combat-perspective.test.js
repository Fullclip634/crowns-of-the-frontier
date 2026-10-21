import test from 'node:test';
import assert from 'node:assert/strict';
import {combatPerspective} from '../server/combat-perspective.js';
const actor=(id,owner,x)=>({id,kind:'unit',type:'archer',owner,x,z:10,hp:65,maxHp:65});
const event=()=>({type:'attack',projectile:17,pendingImpact:true,damage:6,releasedAt:1,flightDuration:.65,aimX:20,aimZ:10,entity:actor(2,0,0),target:actor(3,1,20)});
test('a visible launch toward fog exposes its trajectory without hidden target identity or damage',()=>{
 const launch=event(),before=structuredClone(launch),sim={time:1.2,canSee:(_,entity)=>entity.x<10};
 const packet=combatPerspective(sim,0,launch);assert.deepEqual(packet.target,{kind:'ground',owner:-1,x:20,z:10,r:0});assert.equal(packet.damage,undefined);assert.equal(packet.entity.id,2);assert.ok(Math.abs(packet.flightAge-.2)<1e-8);assert.deepEqual(launch,before);
 assert.equal(combatPerspective(sim,2,{...launch,entity:actor(2,0,15)}),null);
});
test('a visible impact does not reveal its hidden shooter, and hidden impacts are omitted',()=>{
 const impact={...event(),type:'projectile-impact',entity:actor(2,0,-50),target:actor(3,1,20)},sim={time:1.7,canSee:(_,entity)=>entity.x>10};
 const packet=combatPerspective(sim,1,impact);assert.deepEqual(packet.entity,{kind:'projectile',type:'arrow',owner:-1,x:20,z:10});assert.equal(packet.target.id,3);
 assert.equal(combatPerspective({...sim,canSee:()=>false},2,impact),null);
});
test('a defeated-alliance observer receives complete cosmetic flight information',()=>{
 const launch=event(),sim={time:1.2,canSee:()=>false},packet=combatPerspective(sim,2,launch,{observer:true});
 assert.equal(packet.entity.id,2);assert.equal(packet.target.id,3);assert.equal(packet.target.hp,65);
});
