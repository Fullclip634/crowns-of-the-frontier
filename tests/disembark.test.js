import test from 'node:test';
import assert from 'node:assert/strict';
import {Simulation} from '../src/simulation.js';
import {battlePreset} from '../src/custom-battle.js';
import {landingClearance,landingGroundClearance} from '../src/disembark.js';

function fixture(types=['ram','catapult','knight','spearman','ram','catapult','knight','spearman']){
  const sim=new Simulation({mode:'sandbox',map:'coast',seed:512}),ship=sim.owned(0,'unit','transport')[0];
  for(const e of sim.entities)if(e!==ship&&Math.hypot(e.x+19,e.z)<23)e.hp=0;
  sim.revision++;sim.index=null;ship.x=-12;ship.z=0;
  const troops=types.map(type=>sim.addUnit(type,0,-16,0));
  for(const unit of troops){sim.command([unit.id],{type:'board',target:ship.id});sim.tickUnit(unit,.1);assert.equal(unit.embarked,true);}
  return {sim,ship,troops};
}
function clearLanding(sim,ship,units){
  for(const unit of units){
    assert.equal(unit.embarked,false);assert.equal(unit.transport,null);assert.ok(Math.hypot(unit.x-ship.x,unit.z-ship.z)<=11);
    const cell=sim.cell(unit.x,unit.z);assert.equal(sim.grid(unit.owner)[cell.z*sim.gridSize+cell.x],0);
    const groundRadius=landingGroundClearance(unit);for(let i=0;i<32;i++)assert.equal(sim.isWater(unit.x+Math.cos(i*Math.PI/16)*groundRadius,unit.z+Math.sin(i*Math.PI/16)*groundRadius),false);
    for(const other of sim.entities)if(other!==unit&&other.hp>0&&!other.embarked&&other.kind==='unit'&&!sim.unitDefinition(other).naval)assert.ok(Math.hypot(unit.x-other.x,unit.z-other.z)>=landingClearance(unit)+landingClearance(other)+.14,'Each troop has its own model clearance');
  }
}

test('mixed siege and infantry unload with full dry footprints and shared room around standing troops',()=>{
  const {sim,ship,troops}=fixture(),standing=sim.addUnit('ram',0,-17,0),hp=troops.map(u=>u.hp),events=[];sim.on(e=>events.push(e));
  troops[0].carry=17;troops[0].carryType='wood';let released=0;
  for(let wave=0;wave<8&&ship.passengers.length;wave++){
    const aboard=new Set(ship.passengers);assert.equal(sim.unload(ship.id,-15,0),true);const landed=troops.filter(unit=>aboard.has(unit.id)&&!unit.embarked);assert.ok(landed.length>0);clearLanding(sim,ship,landed);released+=landed.length;
    // The player can make room for the next batch without losing the passengers
    // that could not fit. Ordinary movement still uses the original radii.
    for(const unit of landed){sim.command([unit.id],{type:'move',x:-40,z:unit.id%20-10});for(let i=0;i<100;i++)sim.tickUnit(unit,.1);}
  }
  assert.equal(ship.passengers.length,0);assert.equal(released,8);
  assert.deepEqual(troops.map(u=>u.hp),hp);assert.equal(troops[0].carry,17);assert.equal(troops[0].carryType,'wood');assert.equal(standing.x,-17);
  assert.equal(events.filter(e=>e.type==='unload').reduce((sum,event)=>sum+event.count,0),8);
});

test('a clear destination behind connected shore walls cannot teleport passengers through the barrier',()=>{
  const {sim,ship,troops}=fixture(),walls=[];for(let z=-12;z<=12;z+=2.85)walls.push(sim.addBuilding('wall',1,-17,z,true));
  const destination=sim.cell(-22,0);assert.equal(sim.grid(0)[destination.z*sim.gridSize+destination.x],0);
  assert.equal(sim.unload(ship.id,-22,0),false);assert.equal(ship.passengers.length,8);assert.ok(troops.every(u=>u.embarked));
  for(const wall of walls.filter(w=>Math.abs(w.z)<5))sim.hurt(wall,wall.hp+1,null);
  assert.equal(sim.unload(ship.id,-22,0),true);assert.ok(troops.some(u=>!u.embarked));clearLanding(sim,ship,troops.filter(u=>!u.embarked));
});

test('a crowded beach unloads only troops that fit and preserves the remaining cargo through save and retry',()=>{
  const {sim,ship,troops}=fixture(Array(8).fill('spearman')),blockers=[];
  for(let x=-25;x<=-15;x+=2)for(let z=-9;z<=9;z+=2)if(Math.hypot(x+15,z)>3.2&&!sim.isWater(x,z))blockers.push(sim.addUnit('villager',0,x,z));
  const events=[];sim.on(e=>events.push(e));assert.equal(sim.unload(ship.id,-15,0),true);
  const landed=troops.filter(u=>!u.embarked);assert.ok(landed.length>0&&landed.length<8);assert.equal(ship.passengers.length,8-landed.length);clearLanding(sim,ship,landed);
  assert.ok(events.some(e=>e.type==='notice'&&e.message.includes('remain aboard')));
  const restored=Simulation.restore(JSON.parse(JSON.stringify(sim.serialize()))),boat=restored.get(ship.id),saved=boat.passengers.slice();
  for(const unit of [...blockers,...landed]){const e=restored.get(unit.id);e.x=-50;e.z=unit.id%30;}
  assert.equal(restored.unload(boat.id,-15,0),true);assert.deepEqual(boat.passengers,[]);clearLanding(restored,boat,saved.map(id=>restored.get(id)));
  assert.equal(troops.length,8);assert.ok(saved.every(id=>restored.get(id).hp>0));
});

test('invalid landing input and a fully occupied beach leave embarked troops unchanged',()=>{
  const {sim,ship,troops}=fixture(['spearman']),before=JSON.stringify(ship.passengers);
  for(const [x,z,owner]of [[NaN,0,0],[Infinity,0,0],[-15,NaN,0],[-500,0,0],[0,0,0],[-15,0,1]])assert.equal(sim.unload(ship.id,x,z,owner),false);
  for(let x=-25;x<=-15;x+=2)for(let z=-9;z<=9;z+=2)if(!sim.isWater(x,z))sim.addUnit('ram',0,x,z);
  assert.equal(sim.unload(ship.id,-15,0),false);assert.equal(JSON.stringify(ship.passengers),before);assert.ok(troops[0].embarked);
});

test('allied passengers disembark through allied gates while closed hostile gates block the same route',()=>{
  const sim=new Simulation({mode:'custom',map:'coast',seed:512,slots:battlePreset('2v2')}),ship=sim.owned(0,'unit','transport')[0];
  for(const e of sim.entities)if(e!==ship&&Math.hypot(e.x+19,e.z)<25)e.hp=0;sim.revision++;sim.index=null;ship.x=-12;ship.z=0;
  const ally=sim.players.findIndex((p,i)=>i!==0&&sim.allied(0,i)),enemy=sim.players.findIndex((p,i)=>sim.hostile(0,i)),troop=sim.addUnit('spearman',ally,-16,0);
  sim.command([troop.id],{type:'board',target:ship.id});sim.tickUnit(troop,.1);assert.ok(troop.embarked);
  const gate=sim.addBuilding('gate',enemy,-17,0,true);gate.wallAngle=-Math.PI/2;for(const z of [-11.2,-8.35,-5.5,5.5,8.35,11.2])sim.addBuilding('wall',enemy,-17,z,true);
  assert.equal(sim.unload(ship.id,-22,0),false);assert.ok(troop.embarked);
  gate.owner=ally;sim.revision++;assert.equal(sim.unload(ship.id,-22,0),true);assert.equal(ship.passengers.length,0);clearLanding(sim,ship,[troop]);assert.equal(troop.owner,ally);
});

test('custom AI keeps its landing mission and commands only the troops that fit on a crowded shore',()=>{
  const sim=new Simulation({mode:'custom',map:'coast',seed:512,slots:battlePreset('2v2')}),owner=2,ship=sim.owned(owner,'unit','transport')[0],tc=sim.owned(owner,'building','towncenter')[0];
  for(const e of sim.entities)if(e!==ship&&Math.hypot(e.x+19,e.z)<25)e.hp=0;sim.revision++;sim.index=null;ship.x=-12;ship.z=0;
  const army=Array.from({length:8},()=>sim.addUnit('spearman',owner,-16,0));for(const unit of army){sim.command([unit.id],{type:'board',target:ship.id});sim.tickUnit(unit,.1);assert.ok(unit.embarked);}
  for(let x=-27;x<=-13;x+=2)for(let z=-17;z<=17;z+=2)if(Math.hypot(x+20,z)>3.2&&!sim.isWater(x,z))sim.addUnit('villager',owner,x,z);
  const destination={...sim.players[0].start,shoreZ:0,sign:-1};ship.landing={...destination};sim.time=600;sim.commanderNavy({},[],[],army,tc,owner);
  const landed=army.filter(unit=>!unit.embarked);assert.ok(landed.length>0&&landed.length<8);assert.ok(ship.passengers.length>0);assert.deepEqual(ship.landing,destination);
  assert.ok(landed.every(unit=>unit.order?.type==='attackmove'));assert.ok(army.filter(unit=>unit.embarked).every(unit=>unit.order===null));clearLanding(sim,ship,landed);
});
