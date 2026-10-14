import test from 'node:test';
import assert from 'node:assert/strict';
import {Simulation} from '../src/simulation.js';
import {AI_PROFILES} from '../src/commander-ai.js';
import {alliedSupport,customOpening} from '../src/allied-ai.js';
import {battlePreset} from '../src/custom-battle.js';

const make=options=>new Simulation({mode:'custom',map:'highlands',mapSize:'spacious',startAge:1,seed:512,...options});
function readyArmy(sim,owner=1){const tc=sim.owned(owner,'building','towncenter')[0];for(let i=0;i<14;i++)sim.addUnit(i%2?'archer':'spearman',owner,tc.x+14+i%4*1.8,tc.z+10+Math.floor(i/4)*1.8);return sim.owned(owner,'unit').filter(e=>['archer','spearman','swordsman','knight','monk'].includes(e.type));}

test('custom openings build a full army and economy, with optional longer or aggressive pacing',()=>{
  const sim=make({startAge:0}),profile=AI_PROFILES.normal;
  assert.equal(sim.options.aiPace,'balanced');const balanced=customOpening(sim,1,profile);
  assert.equal(balanced.earliest,300);assert.equal(balanced.army,10);assert.equal(balanced.workers,16);assert.equal(balanced.age,1);
  sim.options.aiPace='patient';assert.ok(customOpening(sim,1,profile).earliest>balanced.earliest);
  sim.options.aiPace='aggressive';assert.ok(customOpening(sim,1,profile).earliest<balanced.earliest);
  sim.options.aiPace='balanced';sim.options.startAge=3;assert.ok(customOpening(sim,1,profile).earliest<balanced.earliest);
});

test('AI sends real reinforcements to a damaged allied base, keeping home defenders and private enemy information',()=>{
  const sim=make({shareVision:false}),base=sim.owned(0,'building','towncenter')[0],tc=sim.owned(1,'building','towncenter')[0],army=readyArmy(sim),enemy=sim.addUnit('knight',2,base.x+5,base.z);
  const before=army.map(e=>({id:e.id,x:e.x,z:e.z})),resources={...sim.players[1].resources},count=sim.entities.length;
  sim.time=70;sim.hurt(base,35,enemy);const state=sim.aiStates[1]={};let notice;sim.on(event=>{if(event.type==='ally-support')notice=event;});
  const sent=alliedSupport(sim,1,state,army,[],tc,[]);
  assert.ok(sent.size>=2&&sent.size<army.length);assert.ok(army.length-sent.size>=2);assert.equal(notice.ally,0);assert.equal(notice.owner,1);
  for(const e of army.filter(e=>sent.has(e.id)))assert.equal(e.order.type,'attackmove');
  assert.deepEqual(army.map(e=>({id:e.id,x:e.x,z:e.z})),before);assert.equal(sim.entities.length,count);assert.deepEqual(sim.players[1].resources,resources);
  const alarm=Object.values(sim.teamAlarms)[0];assert.equal(alarm.base,base.id);assert.equal(alarm.owner,0);assert.equal('attacker' in alarm,false);
  const restored=Simulation.restore(sim.serialize());assert.deepEqual(restored.aiStates[1].support,state.support);assert.deepEqual(restored.teamAlarms,sim.teamAlarms);
  assert.equal(restored.options.aiPace,'balanced');
});

test('reinforcements return when their own base is threatened and never control human allies',()=>{
  const sim=make(),base=sim.owned(0,'building','towncenter')[0],tc=sim.owned(1,'building','towncenter')[0],army=readyArmy(sim),enemy=sim.addUnit('knight',2,base.x+5,base.z),state={};
  sim.time=70;sim.hurt(base,35,enemy);const sent=alliedSupport(sim,1,state,army,[],tc,[]);assert.ok(sent.size);
  alliedSupport(sim,1,state,army,[],tc,[enemy]);assert.equal(state.support,null);for(const id of sent)assert.equal(sim.get(id).order.type,'move');
  sim.players[1].controller='human';assert.equal(alliedSupport(sim,1,{},army,[],tc,[]).size,0);
});

test('coastal reinforcements and their healer are chosen from the threatened shore',()=>{
  const sim=make({map:'coast',slots:battlePreset('2v2')}),owner=1,base=sim.owned(0,'building','towncenter')[0],tc=sim.owned(owner,'building','towncenter')[0];
  for(const e of sim.entities)if(e.kind==='resource')e.hp=0;sim.revision++;
  const sign=Math.sign(base.x),near=Array.from({length:5},(_,i)=>sim.addUnit('spearman',owner,base.x+sign*(12+i*2),base.z+8)),across=Array.from({length:6},(_,i)=>sim.addUnit('archer',owner,-sign*22,base.z+i*2)),foreignHealer=sim.addUnit('monk',owner,-sign*24,base.z),localHealer=sim.addUnit('monk',owner,base.x+sign*14,base.z+10),ready=[...near,...across,foreignHealer,localHealer],enemy=sim.addUnit('knight',2,base.x+5,base.z);
  sim.time=70;sim.hurt(base,35,enemy);const state=sim.aiStates[owner]={},sent=alliedSupport(sim,owner,state,ready,[],tc,[]);
  assert.ok(sent.size>=2);assert.ok(sent.has(localHealer.id));assert.ok(!sent.has(foreignHealer.id));assert.ok(across.every(unit=>!sent.has(unit.id)&&unit.order===null));
  assert.ok([...sent].every(id=>Math.sign(sim.get(id).x)===sign));assert.ok(near.filter(unit=>!sent.has(unit.id)).length>=2,'reserve defenders on the same shore');
  const restored=Simulation.restore(JSON.parse(JSON.stringify(sim.serialize())));assert.deepEqual(restored.aiStates[owner].support,state.support);
});

test('AI does not start a major offensive early, but remains able to defend during its buildup',()=>{
  const sim=make({startAge:0}),owner=1,tc=sim.owned(owner,'building','towncenter')[0];readyArmy(sim,owner);
  sim.time=180;sim.tickCustomAI(5);assert.notEqual(sim.aiStates[owner].phase,'attack');
  const enemy=sim.addUnit('swordsman',2,tc.x+8,tc.z+3);sim.updateFog();sim.hurt(tc,20,enemy);sim.tickCustomAI(5);assert.equal(sim.aiStates[owner].phase,'defend');
  const old=sim.serialize();delete old.options.aiPace;assert.equal(Simulation.restore(old).options.aiPace,'aggressive');
});

test('allies react to a visible attacking army, while a lone scout does not summon reinforcements',()=>{
  const sim=make(),base=sim.owned(0,'building','towncenter')[0],tc=sim.owned(1,'building','towncenter')[0],army=readyArmy(sim),state={};sim.time=80;
  const scout=sim.addUnit('scout',2,base.x+8,base.z);sim.updateFog();
  assert.equal(alliedSupport(sim,1,state,army,[scout],tc,[]).size,0);
  const enemies=Array.from({length:3},(_,i)=>sim.addUnit('swordsman',2,base.x+10,base.z+i*2));sim.updateFog();
  assert.ok(alliedSupport(sim,1,state,army,enemies,tc,[]).size>=2);assert.equal(state.support.ally,0);
});

test('naval allies lend part of their fleet and recall it immediately when their own harbor is attacked',()=>{
  const sim=make({map:'coast'}),owner=1,tc=sim.owned(owner,'building','towncenter')[0],dock=sim.owned(owner,'building','dock')[0],ally=sim.owned(0,'building','dock')[0];sim.time=70;
  for(let i=0;i<4;i++)sim.addUnit('galley',owner,Math.sin(dock.z*.03)*2,dock.z-8-i*2);
  const enemy=sim.addUnit('galley',2,ally.x-Math.sign(ally.x)*8,ally.z);sim.hurt(ally,30,enemy);
  sim.commanderNavy({},[],[],[],tc,owner);
  const ships=sim.owned(owner,'unit','galley'),lent=ships.filter(ship=>ship.navyAid===ally.id);
  assert.ok(lent.length>=1&&lent.length<ships.length);for(const ship of lent)assert.equal(ship.order.type,'attackmove');
  enemy.x=dock.x-Math.sign(dock.x)*8;enemy.z=dock.z;sim.commanderNavy({},[enemy],[],[],tc,owner);
  assert.ok(ships.every(ship=>ship.navyAid===null));for(const ship of lent)assert.ok(Math.hypot(ship.order.x-enemy.x,ship.order.z-enemy.z)<8);
});

test('a coastal fleet receives distinct water formation slots and refreshes as one group',()=>{
  const sim=make({map:'coast'}),owner=1,tc=sim.owned(owner,'building','towncenter')[0],dock=sim.owned(owner,'building','dock')[0];sim.time=70;
  const ships=Array.from({length:6},(_,i)=>sim.addUnit('warship',owner,Math.sin(dock.z*.03)*2,dock.z-12-i*4));sim.commanderNavy({},[],[],[],tc,owner);
  const points=ships.map(ship=>ship.order);assert.equal(new Set(points.map(point=>point.x+':'+point.z)).size,ships.length);
  assert.ok(points.every(point=>sim.isWater(point.x,point.z)));for(let i=0;i<ships.length;i++)for(let j=i+1;j<ships.length;j++)assert.ok(Math.hypot(points[i].x-points[j].x,points[i].z-points[j].z)>=3.2);
  const added=sim.addUnit('galley',owner,0,dock.z-40);sim.time+=1;sim.commanderNavy({},[],[],[],tc,owner);assert.ok(added.order);assert.ok(ships.every(ship=>ship.navyOrderAt===sim.time));
});

test('a ready custom offensive keeps a home garrison while its main army advances',()=>{
  const sim=make(),tc=sim.owned(1,'building','towncenter')[0];readyArmy(sim);for(let i=0;i<10;i++)sim.addUnit('villager',1,tc.x+5+i%4,tc.z+15);
  sim.time=400;sim.tickCustomAI(5);const state=sim.aiStates[1];assert.equal(state.phase,'attack');assert.ok(state.homeGuard.length>=2);
  for(const id of state.homeGuard){const unit=sim.get(id);assert.equal(unit.order.type,'attackmove');assert.ok(Math.hypot(unit.order.x-tc.x,unit.order.z-tc.z)<20);}
  assert.ok(sim.owned(1,'unit').some(e=>e.order?.type==='attackmove'&&Math.hypot(e.order.x-tc.x,e.order.z-tc.z)>40));
  assert.equal(state.firstAttackAt,400);
});
