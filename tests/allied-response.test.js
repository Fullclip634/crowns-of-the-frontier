import test from 'node:test';
import assert from 'node:assert/strict';
import {Simulation} from '../src/simulation.js';
import {alliedSupport,customAttackTarget} from '../src/allied-ai.js';
import {battlePreset} from '../src/custom-battle.js';
import {UNITS} from '../src/data.js';

function scenario(preset='2v2',mapSize='spacious'){
 const sim=new Simulation({mode:'custom',map:'highlands',mapSize,startAge:1,slots:Array.isArray(preset)?preset:battlePreset(preset),seed:512}),base=sim.owned(0,'building','towncenter')[0],owner=1,tc=sim.owned(owner,'building','towncenter')[0],enemyOwner=sim.players.findIndex((_,i)=>sim.hostile(0,i));
 for(const e of sim.entities)if(e.kind==='resource')e.hp=0;sim.revision++;sim.time=100;
 const army=Array.from({length:18},(_,i)=>sim.addUnit('spearman',owner,base.x+16+i%4*2,base.z+12+Math.floor(i/4)*2)),enemy=sim.addUnit('swordsman',enemyOwner,base.x-12,base.z),state={};sim.hurt(base,100,enemy);
 return {sim,base,owner,tc,enemyOwner,army,enemy,state};
}

test('allied response works across two, three and four commander teams without a home-distance veto',()=>{
 for(const preset of ['2v2','3v3','4v4',[1,1,2].map(team=>({enabled:true,team})),[1,1,1,2].map(team=>({enabled:true,team}))]){
  const {sim,base,tc,enemy,army,state,owner}=scenario(preset,'epic');tc.x=base.x+300;tc.z=base.z-120;sim.revision++;
  const before=army.map(unit=>[unit.id,unit.x,unit.z]),resources=structuredClone(sim.players[owner].resources),sent=alliedSupport(sim,owner,state,army,[enemy],tc,[]);
  assert.ok(sent.size>=2&&sent.size<army.length,preset+' sends a real nearby army even when its home is far away');assert.ok(army.length-sent.size>=Math.ceil(army.length*.25));assert.equal(state.support.engaging,true);assert.equal(state.support.x,enemy.x);assert.equal(state.support.z,enemy.z);
  assert.deepEqual(army.map(unit=>[unit.id,unit.x,unit.z]),before,'dispatch never teleports troops');assert.deepEqual(sim.players[owner].resources,resources);
 }
});

test('relief troops switch from a rear rally to the visible attackers and replace casualties during a sustained attack',()=>{
 const {sim,base,tc,enemy,army,state,owner}=scenario();const sent=alliedSupport(sim,owner,state,army,[],tc,[]);assert.ok(sent.size);assert.equal(state.support.engaging,false);
 sim.time+=3;alliedSupport(sim,owner,state,army,[enemy],tc,[]);assert.equal(state.support.engaging,true);assert.equal(state.support.x,enemy.x);assert.equal(state.support.lastOrder,sim.time);
 const casualty=[...sent][0];sim.get(casualty).hp=0;const original=state.support.units.length;
 const newTroops=Array.from({length:10},(_,i)=>sim.addUnit('archer',owner,base.x+18+i,base.z+10));sim.time+=8;sim.hurt(base,350,enemy);
 alliedSupport(sim,owner,state,[...army,...newTroops],[enemy],tc,[]);assert.ok(!state.support.units.includes(casualty));assert.ok(state.support.units.length>original);assert.ok(state.support.units.some(id=>newTroops.some(unit=>unit.id===id)));assert.ok(state.support.units.every(id=>sim.get(id).owner===owner));
 sim.aiStates[owner]=state;const saved=Simulation.restore(JSON.parse(JSON.stringify(sim.serialize())));assert.deepEqual(saved.aiStates[owner].support,state.support);assert.ok(saved.get(base.id));
});

test('a small home harasser does not cancel relief, but an overwhelming home raid recalls the army',()=>{
 const {sim,base,tc,enemy,army,state,owner,enemyOwner}=scenario();alliedSupport(sim,owner,state,army,[enemy],tc,[]);
 const scout=sim.addUnit('scout',enemyOwner,tc.x+10,tc.z);sim.time+=7;
 alliedSupport(sim,owner,state,army,[enemy,scout],tc,[scout]);assert.ok(state.support?.units.length>=2,'home reserves handle a small distraction');
 const raid=Array.from({length:20},(_,i)=>sim.addUnit('knight',enemyOwner,tc.x+10+i%4,tc.z+i));const previous=[...state.support.units];sim.time+=7;
 alliedSupport(sim,owner,state,army,raid,tc,raid);assert.equal(state.support,null);assert.ok(previous.every(id=>sim.get(id).order?.type==='move'));assert.ok(base.hp>0);
});

test('long relief routes retain a realistic travel allowance instead of expiring before slow infantry arrives',()=>{
 const {sim,base,tc,enemy,army,state,owner}=scenario('4v4','epic');for(const unit of army){unit.x=tc.x+8;unit.z=tc.z+12;}
 const sent=alliedSupport(sim,owner,state,army,[enemy],tc,[]);assert.ok(sent.size);
 const slowest=Math.max(...[...sent].map(id=>Math.hypot(sim.get(id).x-enemy.x,sim.get(id).z-enemy.z)/UNITS[sim.get(id).type].speed));assert.ok(state.support.until-sim.time>slowest+25);
});

test('public enemy-front selection is based on distance and scouting, never a preference for the human slot',()=>{
 const {sim}=scenario('4v4','epic'),targets=[];
 for(let owner=4;owner<8;owner++){
  const tc=sim.owned(owner,'building','towncenter')[0],target=customAttackTarget(sim,owner,{},tc,[]),closest=sim.spawnPositions.map((point,i)=>({...point,owner:i})).filter(point=>sim.hostile(owner,point.owner)).sort((a,b)=>Math.hypot(a.x-tc.x,a.z-tc.z)-Math.hypot(b.x-tc.x,b.z-tc.z))[0];assert.equal(target.owner,closest.owner);targets.push(target.owner);
 }
 assert.ok(new Set(targets).size>=2,'opposing commanders do not all default to kingdom zero');
 const owner=4,tc=sim.owned(owner,'building','towncenter')[0],far=sim.owned(0,'building','towncenter')[0],known={...far,lastSeen:sim.time};assert.notEqual(customAttackTarget(sim,owner,{},tc,[known]).owner,0,'a distant scouted capital does not override a much nearer unexplored front');
});

test('relief plans never command human allies, workers, embarked troops or opponents',()=>{
 const {sim,base,tc,enemy,army,state,owner}=scenario();const human=sim.addUnit('knight',0,base.x+10,base.z),worker=sim.addUnit('villager',owner,base.x+10,base.z),embarked=sim.addUnit('archer',owner,base.x+10,base.z);embarked.embarked=123;
 const sent=alliedSupport(sim,owner,state,[...army,human,worker,embarked,enemy],[enemy],tc,[]);assert.ok(sent.size);for(const unit of [human,worker,embarked,enemy])assert.ok(!sent.has(unit.id));assert.equal(human.order,null);assert.equal(worker.order,null);assert.equal(embarked.order,null);
});

test('relief reaches a real raid, inflicts ordinary combat damage and preserves the threatened capital',()=>{
 const sim=new Simulation({mode:'custom',map:'highlands',mapSize:'spacious',startAge:1,seed:512,slots:battlePreset('2v2')}),base=sim.owned(0,'building','towncenter')[0],tc=sim.owned(1,'building','towncenter')[0];
 sim.entities=sim.entities.filter(e=>e.kind==='building'&&e.type==='towncenter');sim.revision++;for(const player of sim.players)player.controller='human';sim.players[1].controller='ai';sim.time=100;base.hp=550;
 const army=Array.from({length:22},(_,i)=>sim.addUnit('spearman',1,base.x+(i%5-2)*2,base.z-17-Math.floor(i/5)*2)),enemies=Array.from({length:7},(_,i)=>sim.addUnit('spearman',2,base.x+(i%4-1.5)*2,base.z+14+Math.floor(i/4)*2));for(const unit of enemies)sim.command([unit.id],{type:'attack',target:base.id});
 const state={};sim.hurt(base,1,enemies[0]);let next=0,firstAttack=null,damage=0;
 sim.on(event=>{if(event.type==='attack'&&event.entity?.owner===1){firstAttack??=sim.time;damage+=event.damage||0;}});
 sim.tickCustomAI=()=>{if(sim.time<next)return;next=sim.time+1;sim.updateFog();const visible=sim.entities.filter(e=>e.hp>0&&sim.hostile(1,e.owner)&&sim.canSee(1,e));alliedSupport(sim,1,state,army.filter(e=>e.hp>0),visible,tc,[]);};
 for(let i=0;i<400&&base.hp>0;i++)sim.tick(.1);
 assert.ok(firstAttack!==null&&firstAttack-100<12,'relief attacks instead of waiting behind the capital');assert.ok(damage>500);assert.ok(base.hp>0);assert.equal(enemies.filter(e=>e.hp>0).length,0);assert.equal(sim.owned(1,'unit').length,22,'the rescue creates no free troops');
});

test('free-for-all kingdoms do not receive former allies as reinforcements',()=>{
 const {sim,tc,enemy,army,state,owner}=scenario();sim.players[owner].team=3;assert.equal(alliedSupport(sim,owner,state,army,[enemy],tc,[]).size,0);assert.equal(state.support,undefined);
});
