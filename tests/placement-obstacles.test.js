import test from 'node:test';
import assert from 'node:assert/strict';
import {placementCollision} from '../src/placement-obstacles.js';
import {Simulation} from '../src/simulation.js';
import {BUILDINGS,seededRandom} from '../src/data.js';

const reference=(sim,type,x,z,radius)=>sim.entities.some(e=>e.hp>0&&(e.kind==='building'||e.kind==='resource'&&!e.water&&['wood','gold','stone'].includes(e.type))&&Math.hypot(e.x-x,e.z-z)<(type==='wall'&&e.kind==='resource'&&e.type==='wood'?e.r+.8:e.r+radius+(type==='wall'&&e.type==='wall'?-.3:.8)));

test('nearby placement checks preserve walls, tree joints, mines, negative cells and strict footprint edges',()=>{
  const sim={revision:0,entities:[{kind:'building',type:'wall',x:-16,z:-8,r:1.5,hp:100},{kind:'resource',type:'wood',x:16,z:8,r:1.1,hp:1},{kind:'resource',type:'gold',x:48,z:-24,r:1.7,hp:1},{kind:'resource',type:'food',x:80,z:0,r:1.7,hp:1},{kind:'unit',type:'ram',x:112,z:0,r:2,hp:100}]};
  assert.equal(placementCollision(sim,'wall',-16+2.7+1e-10,-8,1.5),false,'wall spacing retains its reduced clearance');
  assert.equal(placementCollision(sim,'wall',-16+2.7-1e-10,-8,1.5),true,'a wall just inside the clearance remains blocked');
  assert.equal(placementCollision(sim,'wall',16+1.9,8,1.5),true,'a tree inside its contact clearance still blocks a wall');
  assert.equal(placementCollision(sim,'wall',16+1.9+1e-10,8,1.5),false);
  assert.equal(placementCollision(sim,'house',48,-24,2.3),true);assert.equal(placementCollision(sim,'house',80,0,2.3),false);assert.equal(placementCollision(sim,'house',112,0,2.3),false);
  const rng=seededRandom(634);for(let i=0;i<250;i++)sim.entities.push({kind:i%3?'resource':'building',type:i%3?['wood','gold','stone','food'][i%4]:'house',x:rng()*320-160,z:rng()*320-160,r:i%3?1.7:2.3,hp:i%9?100:0,water:i%11===0});sim.revision++;
  for(const type of ['wall','house','towncenter','keep'])for(let i=0;i<400;i++){const x=rng()*320-160,z=rng()*320-160,radius=BUILDINGS[type].r;assert.equal(placementCollision(sim,type,x,z,radius),reference(sim,type,x,z,radius));}
});

test('appended foundations, resources and units preserve the static lookup without rescanning distant trees',()=>{
  const sim=new Simulation({mode:'sandbox',seed:512});sim.entities=[];sim.index=new Map();sim.revision++;sim.visible.fill(1);
  const tree=sim.addResource('wood',-50,-50,100);assert.equal(sim.buildValid('house',0,20),true);
  let reads=0;Object.defineProperty(tree,'x',{configurable:true,get:()=>{reads++;return -50;}});
  sim.addBuilding('house',0,0,20);assert.equal(sim.buildValid('house',0,20),false);
  sim.addUnit('villager',0,10,30);assert.equal(sim.buildValid('house',10,30),true);
  sim.addResource('gold',10,30,100);assert.equal(sim.buildValid('house',10,30),false);assert.equal(reads,0,'ordinary appends update only the new object');
  sim.entities.push({id:99999,kind:'building',type:'house',hp:10,r:2.3,x:30,z:30});assert.equal(sim.buildValid('house',30,30),false);assert.ok(reads>0,'untracked entity changes fall back to a full scan');
});

test('new foundations block immediately and topology changes, deaths and restores refresh placement safely',()=>{
  const sim=new Simulation({mode:'sandbox',seed:512});sim.entities=[];sim.index=new Map();sim.revision++;sim.visible.fill(1);
  assert.equal(sim.buildValid('house',0,20),true);const site=sim.addBuilding('house',0,0,20);assert.equal(sim.buildValid('house',0,20),false,'new foundations are seen before the next simulation tick');
  site.hp=0;assert.equal(sim.buildValid('house',0,20),true);site.hp=10;assert.equal(sim.buildValid('house',0,20),false,'live health is checked even with a cached index');
  site.x=32;site.z=20;sim.revision++;assert.equal(sim.buildValid('house',0,20),true);assert.equal(sim.buildValid('house',32,20),false);
  const tree=sim.addResource('wood',0,20,100);assert.equal(sim.buildValid('house',0,20),false);tree.hp=0;assert.equal(sim.buildValid('house',0,20),true);
  const data=JSON.parse(JSON.stringify(sim.serialize())),loaded=Simulation.restore(data);loaded.visible.fill(1);assert.equal(loaded.buildValid('house',32,20),false);assert.equal(loaded.buildValid('house',0,20),true);
  sim.entities=[];assert.equal(sim.buildValid('house',32,20),true,'replacing the entity array releases previous placement objects');
  assert.equal(sim.buildValid('house',sim.halfWorld,0),false);sim.visible.fill(0);assert.equal(sim.buildValid('house',0,20),false,'visibility remains mandatory for human construction');
});
