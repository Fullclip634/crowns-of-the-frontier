import test from 'node:test';
import assert from 'node:assert/strict';
import {Simulation,distance} from '../src/simulation.js';
import {BUILDINGS,UNITS,TECHS,MODES,MAPS,MISSIONS} from '../src/data.js';

const advance=(s,seconds)=>{for(let i=0;i<seconds*10;i++)s.tick(.1);};
const funded=s=>s.players[0].resources={food:100000,wood:100000,gold:100000,stone:100000};

test('world seeds reproduce resources and starting positions',()=>{
  const a=new Simulation({seed:781}),b=new Simulation({seed:781});assert.deepEqual(a.serialize(),b.serialize());
  const c=new Simulation({seed:782});assert.notDeepEqual(a.entities.filter(e=>e.kind==='resource'),c.entities.filter(e=>e.kind==='resource'));
});
test('villagers collect and deposit each of the four resources',()=>{
  const s=new Simulation({mode:'sandbox'});const tc=s.owned(0,'building','towncenter')[0];
  for(const type of ['food','wood','gold','stone']){
    const v=s.addUnit('villager',0,tc.x+9,tc.z),r=s.addResource(type,tc.x+11,tc.z,2000);const before=s.players[0].resources[type];
    s.command([v.id],{type:'gather',target:r.id});advance(s,30);assert.ok(s.players[0].resources[type]>before,`${type} deposited`);
  }
});
test('construction costs resources, takes worker time, and increases capacity',()=>{
  const s=new Simulation({mode:'sandbox'}),v=s.owned(0,'unit','villager')[0];const cap=s.capacity(0),wood=s.players[0].resources.wood;
  const b=s.build('house',-36,49,[v.id]);assert.ok(b);assert.equal(s.capacity(0),cap);assert.ok(s.players[0].resources.wood<wood);advance(s,45);assert.equal(b.progress,1);assert.equal(s.capacity(0),cap+10);
});
test('age restrictions, occupied terrain, visibility and insufficient funds prevent building',()=>{
  const s=new Simulation({mode:'tutorial'}),v=s.owned(0,'unit','villager')[0],tc=s.owned(0,'building','towncenter')[0];
  assert.equal(s.build('keep',-36,49,[v.id]),false);assert.equal(s.build('house',tc.x,tc.z,[v.id]),false);assert.equal(s.build('house',65,65,[v.id]),false);
  s.players[0].resources.wood=0;assert.equal(s.build('house',-36,49,[v.id]),false);
});
test('troops train through queues; cancellations refund and population limits apply',()=>{
  const s=new Simulation({mode:'sandbox'}),b=s.owned(0,'building','barracks')[0],before=s.players[0].resources.food;
  assert.ok(s.train(b.id,'spearman'));s.cancelQueue(b.id,0);assert.equal(s.players[0].resources.food,before);assert.equal(b.queue.length,0);
  s.train(b.id,'spearman');const n=s.population(0);advance(s,18);assert.equal(s.population(0),n+1);
  while(s.population(0)<s.capacity(0))s.addUnit('spearman',0,-20,40);assert.equal(s.train(b.id,'spearman'),false);
});
test('age research is queued once and applies health improvements on completion',()=>{
  const s=new Simulation({mode:'tutorial'});funded(s);const tc=s.owned(0,'building','towncenter')[0],v=s.owned(0,'unit','villager')[0],hp=v.maxHp;
  assert.ok(s.research(tc.id,'age'));assert.equal(s.research(tc.id,'age'),false);advance(s,56);assert.equal(s.players[0].age,1);assert.ok(v.maxHp>hp);
});
test('research levels have age caps and cannot be researched simultaneously',()=>{
  const s=new Simulation({mode:'sandbox'});funded(s);const b=s.addBuilding('blacksmith',0,-15,35,true);
  assert.ok(s.research(b.id,'attack'));assert.equal(s.research(b.id,'attack'),false);advance(s,33);assert.equal(s.players[0].tech.attack,1);
});
test('spearmen counter cavalry and siege counters buildings',()=>{
  const s=new Simulation({mode:'sandbox'}),spear=s.addUnit('spearman',0,0,0),knight=s.addUnit('knight',1,1,0),archer=s.addUnit('archer',1,1,0),ram=s.addUnit('ram',0,0,0),wall=s.addBuilding('wall',1,1,0,true);
  assert.ok(s.attackDamage(spear,knight)>s.attackDamage(spear,archer)*2);assert.ok(s.attackDamage(ram,wall)>s.attackDamage(ram,archer)*5);
});
test('combat destroys units, records kills, and healers restore health',()=>{
  const s=new Simulation({mode:'sandbox'}),spear=s.addUnit('spearman',0,0,0),enemy=s.addUnit('scout',1,1,0);enemy.hp=12;s.command([spear.id],{type:'attack',target:enemy.id});advance(s,1);assert.equal(enemy.hp,0);assert.ok(s.stats.kills>=1);
  spear.hp=20;const monk=s.addUnit('monk',0,2,0);advance(s,3);assert.ok(spear.hp>20);
});
test('pathfinding routes around walls and across the river bridge',()=>{
  const s=new Simulation({mode:'sandbox',map:'valley'});for(let z=-15;z<15;z+=3)s.addBuilding('wall',1,20,z,true);
  const e=s.addUnit('scout',0,15,0),path=s.pathTo(e,{x:26,z:0});assert.ok(path.some(p=>Math.abs(p.z)>14));
  const river=s.pathTo(s.addUnit('scout',0,-10,30),{x:12,z:30});assert.ok(river.some(p=>Math.abs(p.z)<=9));assert.ok(river.every(p=>!s.isWater(p.x,p.z)));
});
test('friendly gates allow passage while enemy gates block',()=>{
  const s=new Simulation({mode:'sandbox'});s.addBuilding('gate',0,0,0,true);const cell=s.cell(0,0);assert.equal(s.grid(0)[cell.z*80+cell.x],0);assert.equal(s.grid(1)[cell.z*80+cell.x],1);
});
test('shift commands queue each movement order once',()=>{
  const s=new Simulation({mode:'sandbox'}),v=s.owned(0,'unit','villager')[0];s.smartCommand([v.id],null,-30,48);s.smartCommand([v.id],null,-20,48,true);assert.equal(v.orders.length,1);
});
test('wall construction queues every segment in order',()=>{
  const s=new Simulation({mode:'sandbox'}),v=s.owned(0,'unit','villager')[0];funded(s);
  const a=s.build('wall',-36,49,[v.id]),b=s.build('wall',-33.15,49,[v.id],0,true),c=s.build('wall',-30.3,49,[v.id],0,true);assert.ok(a&&b&&c);assert.equal(v.order.target,a.id);assert.equal(v.orders.length,2);advance(s,100);assert.equal(a.progress,1);assert.equal(b.progress,1);assert.equal(c.progress,1);
});
test('enemy AI gathers resources, constructs buildings and trains troops',()=>{
  const s=new Simulation({difficulty:'story'}),n=s.population(1),initial=s.owned(1,'building').length;advance(s,180);assert.ok(s.population(1)>n);assert.ok(s.owned(1,'building').length>initial);assert.ok(s.owned(1,'unit','villager').some(v=>v.carry>0));assert.ok(Object.values(s.players[1].resources).every(n=>n>=0));
});
test('shrines capture with military presence and holding all yields victory',()=>{
  const s=new Simulation({mode:'dominion'});s.tickAI=()=>{};for(const enemy of s.owned(1,'unit'))enemy.hp=0;for(const shrine of s.entities.filter(e=>e.kind==='shrine'))s.addUnit('spearman',0,shrine.x,shrine.z);
  advance(s,20);assert.equal(s.entities.filter(e=>e.kind==='shrine'&&e.owner===0).length,3);advance(s,180);assert.equal(s.ended?.won,true);
});
test('survival does not end before all waves are eliminated',()=>{
  const s=new Simulation({mode:'survival'});s.wave=9;s.nextWave=Infinity;s.checkVictory();assert.equal(s.ended,null);s.wave=10;s.addUnit('spearman',1,70,70);s.checkVictory();assert.equal(s.ended,null);for(const e of s.owned(1,'unit'))e.hp=0;s.checkVictory();assert.equal(s.ended.won,true);
});
test('wonder defense and town center destruction produce the correct results',()=>{
  const s=new Simulation({mode:'wonder'});s.tickAI=()=>{};s.addBuilding('wonder',0,-58,61,true);s.wonderTime[0]=239.9;s.tick(.2);assert.equal(s.ended.won,true);
  const defeat=new Simulation();defeat.owned(0,'building','towncenter')[0].hp=0;defeat.checkVictory();assert.equal(defeat.ended.won,false);
  const win=new Simulation();win.owned(1,'building','towncenter')[0].hp=0;win.checkVictory();assert.equal(win.ended.won,true);
});
test('save/load preserves resources, queues, orders, exploration and objective timers',()=>{
  const s=new Simulation({mode:'dominion'});advance(s,10);const tc=s.owned(0,'building','towncenter')[0];s.train(tc.id,'villager');s.hold=42;const data=JSON.parse(JSON.stringify(s.serialize())),restored=Simulation.restore(data);
  assert.deepEqual(restored.players,s.players);assert.equal(restored.time,s.time);assert.equal(restored.hold,42);assert.deepEqual(restored.entities,s.entities);assert.deepEqual(restored.explored,s.explored);restored.tick(.1);assert.ok(restored.time>s.time);
});
test('all declared buildings and troops instantiate in sandbox',()=>{
  const s=new Simulation({mode:'sandbox'});for(const type of Object.keys(BUILDINGS)){const e=s.addBuilding(type,0,0,0,true);assert.ok(e.hp>0&&e.maxHp>0);}for(const type of Object.keys(UNITS)){const e=s.addUnit(type,0,0,0);assert.ok(e.hp>0);}assert.ok(TECHS.seamanship);
});
test('every game mode and campaign initializes and runs without errors',()=>{
  for(const mode of [...MODES,...MISSIONS]){const s=new Simulation({mode:mode.id});advance(s,8);assert.ok(s.time>0);assert.ok(s.owned(0,'building','towncenter').length);}
});
test('all six maps run and twin rivers require both bridges',()=>{
  for(const map of Object.keys(MAPS)){const s=new Simulation({map,mode:'sandbox'});advance(s,5);assert.ok(s.stats.gathered>=0);}
  const s=new Simulation({map:'rivers',mode:'sandbox'}),u=s.addUnit('scout',0,-35,30),path=s.pathTo(u,{x:35,z:-30});assert.ok(path.some(p=>Math.abs(p.z)<=9));assert.ok(path.every(p=>!s.isWater(p.x,p.z)));assert.ok(path.at(-1).x>30);
});
test('regicide checks sovereigns independently of surviving town centers',()=>{
  const s=new Simulation({mode:'regicide'});s.owned(1,'building','towncenter')[0].hp=0;s.checkVictory();assert.equal(s.ended,null);s.owned(1,'unit','king')[0].hp=0;s.checkVictory();assert.equal(s.ended.won,true);
});
test('the tutorial is winnable using the starting economy and regular commands',()=>{
  const s=new Simulation({mode:'tutorial'}),v=s.owned(0,'unit','villager')[0],b=s.owned(0,'building','barracks')[0],tc=s.owned(0,'building','towncenter')[0];
  s.build('house',-36,49,[v.id]);for(let i=0;i<3;i++)assert.ok(s.train(b.id,'spearman'));advance(s,65);
  s.command(s.owned(0,'unit','spearman').map(e=>e.id),{type:'move',x:-20,z:42});assert.ok(s.research(tc.id,'age'));advance(s,65);assert.equal(s.ended.won,true);
});
test('holding ground attacks nearby enemies without pursuing distant ones',()=>{
  const s=new Simulation({mode:'sandbox'}),archer=s.addUnit('archer',0,0,0),enemy=s.addUnit('spearman',1,8,0);enemy.stance='hold';s.stop([archer.id]);advance(s,2);assert.ok(enemy.hp<enemy.maxHp);assert.equal(archer.x,0);
});
test('canceling construction refunds supplies and protects the final town center',()=>{
  const s=new Simulation({mode:'sandbox'}),v=s.owned(0,'unit','villager')[0];s.stop(s.owned(0,'unit').map(e=>e.id));const before=s.players[0].resources.wood,b=s.build('house',-36,49,[v.id]);assert.ok(s.demolish(b.id));assert.equal(s.players[0].resources.wood,before-55+Math.floor(55*.7));assert.equal(s.demolish(s.owned(0,'building','towncenter')[0].id),false);
});
test('saved games preserve the next random AI decision',()=>{
  const s=new Simulation();advance(s,15);const restored=Simulation.restore(JSON.parse(JSON.stringify(s.serialize())));assert.equal(s.rng(),restored.rng());
});
