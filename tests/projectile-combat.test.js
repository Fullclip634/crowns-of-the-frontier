import test from 'node:test';
import assert from 'node:assert/strict';
import {Simulation} from '../src/simulation.js';
import {projectileVisualEvents} from '../src/projectile-combat.js';
function fixture(type='archer'){
 const sim=new Simulation({mode:'sandbox',seed:512});for(const e of sim.entities)if(e.kind!=='resource')e.hp=0;sim.index=null;sim.revision++;sim.tickAI=()=>{};sim.visible.fill(1);
 const source=sim.addUnit(type,0,-20,20),target=sim.addUnit('knight',1,-20,type==='catapult'?42:29);target.stance='hold';source.stance='hold';sim.tickUnit=()=>{};sim.tickBuilding=()=>{};return {sim,source,target};
}
function advance(sim,seconds){for(let t=0;t<seconds-1e-6;t+=.05)sim.tick(.05);}
test('ranged damage waits for release and travel, and a released arrow survives its shooter',()=>{
 const {sim,source,target}=fixture(),hp=target.hp,events=[];sim.on(e=>events.push(e));sim.hit(source,target);assert.equal(target.hp,hp);assert.equal(events.filter(e=>e.type==='attack').length,0);
 advance(sim,.1);assert.equal(target.hp,hp);advance(sim,.1);assert.ok(events.some(e=>e.type==='attack'&&e.pendingImpact));assert.equal(target.hp,hp);
 source.hp=0;advance(sim,.4);assert.ok(target.hp<hp);assert.ok(events.some(e=>e.type==='projectile-impact'));assert.equal(sim.projectiles.length,0);
});
test('moving, dying or sheltering during a windup cancels release and a dead target cannot redirect an arrow',()=>{
 for(const command of ['move','death','shelter']){
  const {sim,source,target}=fixture(),hp=target.hp;sim.hit(source,target);if(command==='move')source.order={type:'move',x:source.x+10,z:source.z};if(command==='death')source.hp=0;if(command==='shelter')target.embarked=true;
  advance(sim,.8);assert.equal(target.hp,hp);assert.equal(sim.projectiles.length,0);
 }
 const {sim,source,target}=fixture(),other=sim.addUnit('knight',1,target.x+1,target.z);other.stance='hold';sim.hit(source,target);advance(sim,.2);target.hp=0;const hp=other.hp;advance(sim,.6);assert.equal(other.hp,hp,'An arrow cannot select a replacement target in flight');
});
test('siege resolves splash at the launched ground position and moving units can leave it',()=>{
 const {sim,source,target}=fixture('catapult'),nearby=sim.addUnit('spearman',1,target.x+1,target.z),ally=sim.addUnit('spearman',0,target.x+2,target.z),hidden=sim.addUnit('villager',1,target.x,target.z);hidden.embarked=true;nearby.stance=ally.stance='hold';const hp=target.hp,nearHP=nearby.hp,allyHP=ally.hp,storedHP=hidden.hp;
 sim.hit(source,target);advance(sim,.4);const shot=sim.projectiles[0];assert.equal(shot.stage,'flight');assert.equal(target.hp,hp);target.x+=15;advance(sim,.9);
 assert.equal(target.hp,hp,'Dodge leaves the impact area');assert.ok(nearby.hp<nearHP);assert.equal(ally.hp,allyHP);assert.equal(hidden.hp,storedHP);
});
test('save and restore preserve windups, in-flight damage and unique shot IDs without duplicate launches',()=>{
 for(const duration of [.05,.2]){
  const {sim,source,target}=fixture();sim.hit(source,target);advance(sim,duration);const data=JSON.parse(JSON.stringify(sim.serialize())),loaded=Simulation.restore(data);loaded.tickAI=()=>{};
  loaded.tickUnit=()=>{};loaded.tickBuilding=()=>{};assert.deepEqual(loaded.projectiles,sim.projectiles);assert.equal(loaded.nextProjectileId,sim.nextProjectileId);
  const visible=projectileVisualEvents(loaded.projectiles,loaded.time);assert.equal(visible.length,duration>.14?1:0);if(visible.length)assert.ok(visible[0].flightAge>=0);
  source.hp=0;loaded.get(source.id).hp=0;advance(sim,.8);advance(loaded,.8);assert.equal(loaded.get(target.id).hp,sim.get(target.id).hp);assert.equal(loaded.projectiles.length,0);
 }
 const legacy=fixture().sim.serialize();delete legacy.projectiles;delete legacy.nextProjectileId;assert.deepEqual(Simulation.restore(legacy).projectiles,[]);
});

test('Stop cancels an unreleased shot but preserves an arrow already in flight',()=>{
 for(const elapsed of [.05,.2]){
  const {sim,source,target}=fixture(),hp=target.hp;sim.hit(source,target);advance(sim,elapsed);sim.stop([source.id]);advance(sim,.8);
  assert.equal(target.hp<hp,elapsed>.14);assert.equal(sim.projectiles.length,0);
 }
 const {sim,source,target}=fixture();source.order={type:'attack',target:target.id};sim.hit(source,target);source.order=null;advance(sim,.8);assert.equal(sim.projectiles.length,0);assert.equal(target.hp,target.maxHp);
});

test('damaged projectile saves discard malformed and duplicate records without poisoning valid impacts',()=>{
 const {sim,source,target}=fixture();sim.hit(source,target);advance(sim,.2);const data=sim.serialize(),valid=data.projectiles[0];
 const broken=[null,{...valid,id:-1},{...valid,id:10,aim:{x:NaN,z:0}},{...valid,id:11,damage:Infinity},{...valid,id:12,duration:-1},{...valid,id:13,impactAt:NaN},{...valid,id:14,entity:null},{...valid,id:15,bonus:[-1]},{...valid,id:16,releasedAt:sim.time+100},{...valid,id:17,victim:{...valid.victim,type:'unknown'}},{...valid,id:18,stage:'unknown'}];
 data.projectiles=[valid,...broken,structuredClone(valid)];data.nextProjectileId=Infinity;
 const restored=Simulation.restore(data);assert.equal(restored.projectiles.length,1);assert.deepEqual(restored.projectiles[0],valid);assert.equal(restored.nextProjectileId,valid.id);
 restored.tickAI=()=>{};restored.tickUnit=()=>{};restored.tickBuilding=()=>{};const hp=restored.get(target.id).hp;advance(restored,.8);assert.ok(Number.isFinite(restored.get(target.id).hp));assert.equal(restored.get(target.id).hp,hp-valid.damage);
 const old={...data,projectiles:{bad:true},nextProjectileId:-5};assert.deepEqual(Simulation.restore(old).projectiles,[]);
});

test('exhausted or invalid projectile counters do not reuse an active shot ID',()=>{
 const {sim,source,target}=fixture();sim.hit(source,target);sim.projectiles.push({...sim.projectiles[0],id:3});sim.nextProjectileId=Number.MAX_SAFE_INTEGER;
 for(let i=0;i<2;i++){source.cooldown=0;sim.hit(source,target);}
 assert.equal(sim.projectiles.length,4);assert.equal(new Set(sim.projectiles.map(p=>p.id)).size,4);assert.ok(sim.projectiles.every(p=>Number.isSafeInteger(p.id)));
});

test('a damaged windup cannot turn an ordinary house or melee troop into a projectile weapon',()=>{
 const {sim,source,target}=fixture();sim.hit(source,target);const data=sim.serialize(),shot=data.projectiles[0],house=sim.addBuilding('house',0,-10,20,true),melee=sim.addUnit('spearman',0,-10,22);data.entities=sim.serialize().entities;
 data.projectiles=[{...shot,id:2,source:house.id},{...shot,id:3,source:melee.id}];const restored=Simulation.restore(data);assert.deepEqual(restored.projectiles,[]);
});
