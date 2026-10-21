import test from 'node:test';
import assert from 'node:assert/strict';
import {Simulation} from '../src/simulation.js';
import {battlePreset} from '../src/custom-battle.js';
import {rememberVisibleEnemies} from '../src/commander-ai.js';
import {chooseLandingShore,coastalApproach} from '../src/ai-landings.js';
import {UNITS} from '../src/data.js';

test('a loaded AI transport leaves a forest-blocked beach and unloads through ordinary movement',()=>{
 const sim=new Simulation({mode:'custom',map:'coast',slots:battlePreset('2v2'),seed:512}),owner=2,tc=sim.owned(owner,'building','towncenter')[0],ship=sim.owned(owner,'unit','transport')[0],army=sim.owned(owner,'unit','spearman');
 sim.entities=sim.entities.filter(e=>e.kind!=='resource'||Math.abs(e.x+20)>12||Math.abs(e.z)>35);sim.index=null;
 for(let x=-23;x<=-15;x+=2)for(let z=-10;z<=10;z+=2)sim.addResource('wood',x,z,300);
 Object.assign(ship,coastalApproach(-1,0),{landing:{...sim.players[0].start,shoreZ:0,sign:-1,blockedSince:587},order:null,passengers:army.map(e=>e.id)});
 for(const unit of army){unit.embarked=true;unit.transport=ship.id;unit.x=ship.x;unit.z=ship.z;}
 sim.time=600;sim.revision++;sim.grids={};sim.commanderNavy({},[],[],army,tc,owner);assert.ok(Math.abs(ship.landing.shoreZ)>=18);assert.equal(ship.order.type,'move');
 const start={x:ship.x,z:ship.z};for(let i=0;i<160&&ship.passengers.length;i++){const before={x:ship.x,z:ship.z};sim.tickUnit(ship,.1);assert.ok(Math.hypot(ship.x-before.x,ship.z-before.z)<2,'retry uses ordinary movement without teleporting');for(const unit of army)if(unit.embarked)sim.tickUnit(unit,.1);sim.time+=.1;if(i%10===0)sim.commanderNavy({},[],[],army,tc,owner);}
 assert.ok(Math.hypot(ship.x-start.x,ship.z-start.z)>5);assert.equal(ship.passengers.length,0);assert.ok(army.every(e=>!e.embarked&&!sim.isWater(e.x,e.z)&&e.order.type==='attackmove'));
});

test('unknown beaches are scouted without querying hidden collision or enemy data',()=>{
 const sim={halfWorld:100,owned:()=>[],canSee:()=>false,grid:()=>{throw Error('Unseen collision lookup');}};
 assert.equal(chooseLandingShore(sim,2,{x:12,z:0},-1,0,[],[]),0);
});

test('a ready capped army can board with its surviving escort after the buildup window',()=>{
 const sim=new Simulation({mode:'custom',map:'coast',slots:battlePreset('2v2'),seed:512}),owner=2,tc=sim.owned(owner,'building','towncenter')[0],ship=sim.owned(owner,'unit','transport')[0];
 while(sim.owned(owner,'unit','villager').length<16)sim.addUnit('villager',owner,tc.x,tc.z);
 while(sim.population(owner)<sim.capacity(owner))sim.addUnit('spearman',owner,tc.x+6,tc.z+6);
 sim.time=600;Object.assign(ship,coastalApproach(1,tc.z));
 const army=sim.owned(owner,'unit').filter(e=>UNITS[e.type].damage&&!UNITS[e.type].naval&&e.type!=='scout');
 sim.commanderNavy({},[],[],army,tc,owner);assert.ok(army.some(e=>e.order?.type==='board'&&e.order.target===ship.id));assert.equal(ship.loadingSince,600);
});

test('AI observes a transport without learning the troops hidden inside it',()=>{
 const sim=new Simulation({mode:'custom',map:'coast',slots:battlePreset('2v2'),seed:512}),ship=sim.addUnit('transport',0,0,0),hidden=sim.addUnit('knight',0,0,0);sim.addUnit('scout',2,18,0);
 ship.passengers=[hidden.id];hidden.embarked=true;hidden.transport=ship.id;const state={known:{}},visible=rememberVisibleEnemies(sim,state,2);
 assert.ok(visible.some(e=>e.id===ship.id));assert.equal(visible.some(e=>e.id===hidden.id),false);assert.equal(state.known[hidden.id],undefined);
});
