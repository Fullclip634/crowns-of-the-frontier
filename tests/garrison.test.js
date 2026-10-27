import test from 'node:test';
import assert from 'node:assert/strict';
import {Simulation,distance} from '../src/simulation.js';
import {BUILDINGS} from '../src/data.js';
import {GARRISONS,garrisonCount,garrisonArrows} from '../src/garrison.js';
import {shelterControls} from '../src/garrison-ui.js';
import {attackFlight} from '../src/battle-effects.js';

function fixture(type='towncenter'){
  const sim=new Simulation({mode:'sandbox',seed:512});for(const e of sim.entities)if(e.kind==='resource')e.hp=0;sim.revision++;sim.visible.fill(1);
  const site=type==='towncenter'?sim.owned(0,'building','towncenter')[0]:sim.addBuilding(type,0,0,25,true);
  const workers=Array.from({length:18},(_,i)=>sim.addUnit('villager',0,site.x+site.r+2,site.z+i*.05));return {sim,site,workers};
}
function enter(sim,workers){for(const u of workers)if(u.order?.type==='garrison')sim.tickUnit(u,.1);}

test('Town Bell walks villagers into real shelter with bounded capacity, without changing resources or population',()=>{
  const {sim,site,workers}=fixture(),before={...sim.players[0].resources},pop=sim.population(0);assert.equal(sim.seekShelter(workers.map(w=>w.id),site.id),15);assert.equal(garrisonCount(sim,site),0);
  enter(sim,workers);assert.equal(garrisonCount(sim,site),15);assert.equal(garrisonArrows(sim,site),5);assert.equal(sim.population(0),pop);assert.deepEqual(sim.players[0].resources,before);
  for(const u of workers.slice(0,15)){assert.equal(u.embarked,true);assert.equal(u.shelter,site.id);assert.equal(u.transport,site.id);assert.equal(u.order,null);}
});

test('castles and towers have their own capacities and add real defensive arrow damage',()=>{
  for(const type of ['towncenter','keep','tower']){
    const {sim,site,workers}=fixture(type),enemy=sim.addUnit('knight',1,site.x+12,site.z),normal=sim.attackDamage(site,enemy);sim.seekShelter(workers.map(w=>w.id),site.id);enter(sim,workers);
    assert.equal(garrisonCount(sim,site),GARRISONS[type].capacity);const hp=enemy.hp,events=[];sim.on(e=>{if(e.type==='attack')events.push(e);});sim.hit(site,enemy);assert.equal(enemy.hp,hp,'A defensive volley deals damage on arrival');assert.equal(events.length,BUILDINGS[type].volley+garrisonArrows(sim,site));sim.time+=sim.projectiles[0].duration;sim.tickProjectiles();assert.ok(hp-enemy.hp>normal);
    const after=enemy.hp;sim.hit(site,enemy);assert.equal(enemy.hp,after,'one volley per actual building cooldown');
  }
});

test('every defensive building fires a faster multi-arrow base volley and saves it in flight',()=>{
  for(const type of ['towncenter','tower','keep']){
    const {sim,site}=fixture(type),enemy=sim.addUnit('knight',1,site.x+12,site.z),damage=sim.attackDamage(site,enemy),events=[];
    sim.on(event=>{if(event.type==='attack'&&event.entity.id===site.id)events.push(event);});sim.hit(site,enemy);
    assert.equal(events.length,BUILDINGS[type].volley);assert.ok(site.cooldown<1.6);assert.equal(site.cooldown,BUILDINGS[type].reload);
    const shot=sim.projectiles[0];assert.equal(shot.bonus.length+1,BUILDINGS[type].volley);assert.ok(Math.abs(shot.damage+shot.bonus.reduce((sum,n)=>sum+n,0)-damage)<1e-8);
    const restored=Simulation.restore(JSON.parse(JSON.stringify(sim.serialize())));assert.equal(restored.projectiles.length,1,'base arrows survive save and reconnect');
    const victim=restored.get(enemy.id),hp=victim.hp;restored.time+=shot.duration;restored.tickProjectiles();assert.ok(Math.abs(hp-victim.hp-damage)<1e-8);
  }
  assert.ok(BUILDINGS.keep.volley>BUILDINGS.tower.volley&&BUILDINGS.tower.volley>BUILDINGS.towncenter.volley);
});

test('shelter reservations reject foreign troops, soldiers, unfinished sites and unreachable shores',()=>{
  const {sim,site,workers}=fixture(),foreign=sim.addUnit('villager',1,site.x+6,site.z),soldier=sim.addUnit('spearman',0,site.x+6,site.z);
  assert.equal(sim.seekShelter([foreign.id,soldier.id],site.id),0);assert.equal(sim.townBell(site.id,1),false);site.progress=.5;assert.equal(sim.seekShelter([workers[0].id],site.id),0);site.progress=1;
  const coast=new Simulation({mode:'tides',map:'coast',seed:512}),tc=coast.owned(0,'building','towncenter')[0],stranded=coast.addUnit('villager',0,20,35);assert.equal(coast.seekShelter([stranded.id],tc.id),0);
});

test('Return to work restores tasks, queued commands and cargo and ejects onto distinct dry walkable cells',()=>{
  const {sim,site,workers}=fixture(),worker=workers[0],source=sim.addResource('wood',site.x-18,site.z,500);worker.order={type:'gather',target:source.id};worker.orders=[{type:'move',x:0,z:0}];worker.carry=9;worker.carryType='wood';
  sim.seekShelter(workers.slice(0,6).map(w=>w.id),site.id);enter(sim,workers);assert.equal(sim.returnToWork(site.id),6);assert.equal(garrisonCount(sim,site),0);assert.equal(worker.order.type,'gather');assert.equal(worker.orders[0].type,'move');assert.equal(worker.carry,9);
  const group=workers.slice(0,6);for(const u of group){assert.equal(u.embarked,false);assert.equal(u.shelter,undefined);assert.ok(distance(u,site)>site.r);const c=sim.cell(u.x,u.z);assert.equal(sim.grid(0)[c.z*sim.gridSize+c.x],0);assert.equal(sim.isWater(u.x,u.z),false);}for(let i=0;i<group.length;i++)for(let j=i+1;j<group.length;j++)assert.ok(distance(group[i],group[j])>=1.3);
});

test('a later command cancels pending shelter and occupied villagers cannot build or gather invisibly',()=>{
  const {sim,site,workers}=fixture(),worker=workers[0];sim.seekShelter([worker.id],site.id);sim.command([worker.id],{type:'move',x:0,z:0});assert.equal(worker.shelterWork,undefined);assert.equal(worker.order.type,'move');
  sim.seekShelter([worker.id],site.id);enter(sim,[worker]);sim.assignWorker(worker);assert.equal(worker.order,null);const before={...sim.players[0].resources};assert.equal(sim.build('house',site.x+20,site.z,[worker.id]),false);assert.deepEqual(sim.players[0].resources,before);sim.command([worker.id],{type:'move',x:0,z:0});assert.equal(worker.order,null);
});

test('garrison occupants and return jobs survive real serialization and destruction releases survivors',()=>{
  const {sim,site,workers}=fixture();sim.seekShelter(workers.slice(0,4).map(w=>w.id),site.id);enter(sim,workers);const loaded=Simulation.restore(JSON.parse(JSON.stringify(sim.serialize()))),keep=loaded.get(site.id);assert.equal(garrisonCount(loaded,keep),4);assert.equal(loaded.returnToWork(keep.id),4);
  const enemy=sim.addUnit('ram',1,site.x+10,site.z);sim.hurt(site,site.hp+1,enemy);assert.equal(site.hp,0);for(const u of workers.slice(0,4)){assert.ok(u.hp>0&&u.hp<u.maxHp);assert.equal(u.embarked,false);assert.equal(u.shelter,undefined);assert.ok(Number.isFinite(u.x)&&Number.isFinite(u.z));}
});

test('a villager actually walks from the economy to shelter instead of teleporting from a bell command',()=>{
  const {sim,site,workers}=fixture(),worker=workers[0];worker.x=site.x+24;worker.z=site.z+9;const start={x:worker.x,z:worker.z};assert.equal(sim.seekShelter([worker.id],site.id),1);assert.equal(worker.embarked,undefined);assert.deepEqual({x:worker.x,z:worker.z},start);
  for(let i=0;i<200&&!worker.embarked;i++)sim.tick(.1);assert.equal(worker.embarked,true);assert.equal(garrisonCount(sim,site),1);
});

test('AI shelters threatened workers, preserves its shelter clock, and releases them after the raid ends',()=>{
  const {sim,site,workers}=fixture();sim.players[0].controller='ai';const enemy=sim.addUnit('knight',1,workers[0].x+4,workers[0].z);sim.tick(2.1);assert.ok(workers.some(u=>u.order?.type==='garrison'));enter(sim,workers);assert.ok(garrisonCount(sim,site)>0);
  enemy.hp=0;sim.revision++;sim.shelterClock=.7;const loaded=Simulation.restore(JSON.parse(JSON.stringify(sim.serialize())));assert.equal(loaded.shelterClock,.7);
  for(let i=0;i<170;i++)sim.tick(.1);assert.equal(garrisonCount(sim,site),0);assert.ok(workers.some(u=>!u.embarked&&u.order?.type==='gather')||workers.every(u=>!u.embarked));
});

test('shelter controls expose actual capacity, incoming villagers, arrows and return work without foreign controls',()=>{
  const {sim,site,workers}=fixture('keep');assert.match(shelterControls(sim,[site]),/0\/15 inside/);assert.doesNotMatch(shelterControls(sim,[site]),/data-return-work/);sim.seekShelter(workers.slice(0,4).map(w=>w.id),site.id);assert.match(shelterControls(sim,[site]),/4 coming/);enter(sim,workers);const markup=shelterControls(sim,[site]);assert.match(markup,/4\/15 inside/);assert.match(markup,/\+2 defensive arrows/);assert.match(markup,/data-return-work/);assert.equal(shelterControls(sim,[{...site,owner:1}]),'');assert.match(shelterControls(sim,[workers[5],workers[6]]),/seek-shelter/);
});

test('garrison volleys launch separate solid arrow flights from different firing positions',()=>{
  const {sim,site}=fixture(),target=sim.addUnit('knight',1,site.x+14,site.z+3),view={entityHeight:()=>1},shots=Array.from({length:6},(_,i)=>attackFlight(view,site,target,i));
  assert.equal(new Set(shots.map(shot=>shot.from.toArray().join(':'))).size,6);assert.ok(shots.every(shot=>shot.kind==='arrow'&&shot.from.toArray().every(Number.isFinite)&&shot.duration>0));assert.ok(shots.every(shot=>Math.hypot(shot.from.x-site.x,shot.from.z-site.z)<site.r));
});

test('stored villagers cannot be shot by remembered IDs or siege splash and attackers retarget outside shelter',()=>{
  const {sim,site,workers}=fixture(),worker=workers[0],archer=sim.addUnit('archer',1,site.x+10,site.z),catapult=sim.addUnit('catapult',1,site.x+15,site.z);sim.command([archer.id],{type:'attack',target:worker.id});sim.seekShelter([worker.id],site.id);enter(sim,[worker]);const hp=worker.hp;
  sim.hit(archer,worker);sim.hurt(worker,40,archer);assert.equal(worker.hp,hp);sim.command([archer.id],{type:'attack',target:worker.id});assert.equal(archer.order.type,'attack');sim.tickUnit(archer,.1);assert.notEqual(archer.order?.target,worker.id);
  sim.hit(catapult,site);assert.equal(worker.hp,hp,'splash outside cannot hit an occupant');const newcomer=sim.addUnit('archer',1,site.x+13,site.z);assert.equal(sim.command([newcomer.id],{type:'attack',target:worker.id}),false);assert.equal(newcomer.order,null);
});

test('demolishing an occupied fortress releases its villagers without injury or abandoning their work',()=>{
  const {sim,site,workers}=fixture('keep'),tree=sim.addResource('wood',site.x-15,site.z,500);for(const u of workers.slice(0,15))u.order={type:'gather',target:tree.id};sim.seekShelter(workers.slice(0,15).map(w=>w.id),site.id);enter(sim,workers);assert.equal(garrisonCount(sim,site),15);assert.equal(sim.demolish(site.id),true);for(const u of workers.slice(0,15)){assert.equal(u.hp,u.maxHp);assert.equal(u.embarked,false);assert.equal(u.order?.target,tree.id);}
  const own=fixture();own.sim.seekShelter([own.workers[0].id],own.site.id);enter(own.sim,own.workers);assert.equal(own.sim.demolish(own.site.id),false);assert.equal(own.workers[0].embarked,true,'refusing removal of the last town center preserves its protection');
});
