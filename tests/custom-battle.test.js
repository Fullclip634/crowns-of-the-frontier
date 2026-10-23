import test from 'node:test';
import assert from 'node:assert/strict';
import {Simulation,distance} from '../src/simulation.js';
import {battlePreset,normalizeBattle,PLAYER_COLORS,visibilityFor,BATTLE_SIZES,battleSpawns} from '../src/custom-battle.js';
import {forestSettlements} from '../src/starting-forests.js';
import {weatherAt} from '../src/weather.js';
import {customBattleMarkup} from '../src/custom-battle-ui.js';
const make=(options={})=>new Simulation({mode:'custom',seed:512,...options});
const destroy=(sim,owner,kind='building')=>{for(const e of sim.owned(owner,kind))e.hp=0;sim.revision++;sim.checkVictory();};

test('larger custom sizes retain full navigation and legacy saves retain their chosen dimensions',()=>{
  for(const [mapSize,{size}] of Object.entries(BATTLE_SIZES)){
    const sim=make({mapSize,slots:battlePreset('4v4')}),loaded=Simulation.restore(JSON.parse(JSON.stringify(sim.serialize())));
    assert.equal(sim.worldSize,size);assert.equal(loaded.worldSize,size);assert.equal(loaded.grid(0).length,(size/2)**2);assert.equal(loaded.visible.length,(size/2)**2);assert.deepEqual(loaded.spawnPositions,sim.spawnPositions);
  }
  assert.equal(make({mapSize:'huge'}).worldSize,400);assert.equal(make({mapSize:'epic'}).worldSize**2/make({mapSize:'huge'}).worldSize**2,1.96);
});

test('custom defaults are vast, team-aware, and do not silently accept an empty opposition',()=>{
  const s=make();assert.equal(s.worldSize,480);assert.equal(s.gridSize,240);assert.equal(s.players.length,4);assert.ok(s.allied(0,1));assert.ok(s.hostile(0,2));assert.ok(s.hostile(2,0));assert.equal(s.options.victory,'annihilation');
  assert.throws(()=>normalizeBattle({slots:[{team:1},{team:1}]}),/different team/);
  const slots=battlePreset('4v4');slots[2].enabled=false;const a=make({slots}),b=Simulation.restore(a.serialize());assert.equal(a.players[2].color,PLAYER_COLORS[3]);assert.deepEqual(a.players.map(p=>p.color),b.players.map(p=>p.color));
});
test('solo commanders can choose a kingdom slot and keep its authored starting position',()=>{
  const slots=battlePreset('2v2'),defaultBattle=make({slots}),selected=make({slots,playerSlot:3});
  assert.equal(selected.options.playerSlot,3);assert.equal(selected.options.spectator,false);assert.equal(selected.options.slots[0].slotNumber,3);assert.equal(selected.options.slots[0].controller,'human');
  assert.deepEqual(selected.players[0].start,defaultBattle.spawnPositions[2]);
  for(const slot of selected.options.slots.slice(1))assert.equal(slot.controller,'ai');
  const defaultForest=forestSettlements(defaultBattle).find(base=>base.slotNumber===3),selectedForest=forestSettlements(selected).find(base=>base.slotNumber===3);
  const coords=sim=>sim.entities.filter(e=>e.kind==='resource'&&e.startForest===sim.options.slots.findIndex(slot=>slot.slotNumber===3)).map(e=>[e.x,e.z]).sort((a,b)=>a[0]-b[0]||a[1]-b[1]);
  assert.ok(defaultForest&&selectedForest);assert.deepEqual(coords(selected),coords(defaultBattle),'changing the human slot keeps each physical starting grove in place');
});
test('custom battle setup exposes a direct all-AI spectator role choice',()=>{
  const markup=customBattleMarkup({map:'highlands',mapSize:'vast',startAge:0,resourceLevel:'standard',populationLimit:80,seed:512,victory:'annihilation',shareVision:true,revealRemnants:true,aiPace:'balanced',slots:battlePreset('2v2'),playerSlot:1});
  assert.match(markup,/id="custom-player-slot"/);assert.match(markup,/Watch AI · Spectator/);assert.match(markup,/data-play-slot="1"/);assert.match(markup,/aria-label="Play as kingdom slot 3"/);
});
test('AI spectator mode runs every enabled kingdom as AI, reveals the map, and watches the final team win',()=>{
  const sim=make({slots:battlePreset('2v2'),playerSlot:0}),events=[];sim.on(event=>events.push(event));
  assert.equal(sim.options.spectator,true);assert.equal(sim.options.playerSlot,0);assert.ok(sim.players.every(player=>player.controller==='ai'));
  sim.updateFog();assert.ok(sim.visible.every(value=>value===1));assert.ok(sim.explored.every(value=>value===1));
  const distant=sim.players[2].start;assert.equal(sim.canSee(0,{...distant,r:2}),false,'spectator vision does not leak into AI scouting');
  for(let i=0;i<40;i++)sim.tick(.1);assert.ok(sim.aiStates[0]?.decision>0,'the selected kingdom is actually played by its AI');
  const restored=Simulation.restore(JSON.parse(JSON.stringify(sim.serialize())));assert.equal(restored.options.spectator,true);assert.ok(restored.players.every(player=>player.controller==='ai'));assert.ok(restored.visible.every(value=>value===1));
  destroy(sim,0);assert.equal(sim.ended,null,'the battle continues after the observer kingdom is eliminated');destroy(sim,2);assert.equal(sim.ended,null);destroy(sim,3);
  assert.deepEqual(sim.ended,{won:false,reason:'The last surviving alliance controls the battlefield.',winningTeam:1,spectator:true});
  assert.equal(events.filter(event=>event.type==='end').length,1);assert.equal(events.find(event=>event.type==='end').spectator,true);
});
test('eight kingdoms have distinct dry starts and local resources on every large biome',()=>{
  for(const map of ['highlands','desert','winter','canyon','valley','rivers','coast']){
    const s=make({map,slots:battlePreset('4v4')});assert.equal(s.players.length,8);assert.equal(new Set(s.players.map(p=>p.color)).size,8);
    for(let owner=0;owner<8;owner++){
      const p=s.players[owner],tc=s.owned(owner,'building','towncenter')[0];assert.ok(!s.isWater(tc.x,tc.z));assert.equal(s.owned(owner,'unit','villager').length,8);
      for(const type of ['wood','gold','stone','food'])assert.ok(s.entities.some(e=>e.kind==='resource'&&!e.water&&e.type===type&&distance(e,tc)<46),`${map} ${owner}: local ${type}`);
      for(const e of s.owned(owner))assert.ok(Math.abs(e.x)<s.halfWorld&&Math.abs(e.z)<s.halfWorld);
      for(let other=owner+1;other<8;other++)assert.ok(distance(p.start,s.players[other].start)>65);
    }
  }
});
test('navigation and fog cover the expanded map beyond the old battlefield boundary',()=>{
  const s=make({slots:battlePreset('ffa8')}),unit=s.owned(0,'unit','villager')[0],point={x:160,z:150},path=s.pathTo(unit,point);
  assert.equal(s.grid(0).length,57600);assert.equal(s.visible.length,57600);assert.ok(path.some(p=>p.x>80));assert.equal(unit.pathStatus,'ready');
  const e=s.addUnit('scout',0,160,150);s.updateFog();assert.equal(s.isVisible(e.x,e.z),true);assert.equal(s.isExplored(-190,-190),false);
});
test('alliances prevent automatic and explicit friendly damage while allowing healing and gates',()=>{
  const s=make({startAge:2}),a=s.addUnit('spearman',0,0,25),ally=s.addUnit('knight',1,1,25),enemy=s.addUnit('knight',2,2,25);s.command([a.id],{type:'attack',target:ally.id});
  const hp=ally.hp;s.tickUnit(a,1);assert.equal(ally.hp,hp);s.hit(a,ally);assert.equal(ally.hp,hp);
  a.cooldown=0;s.hit(a,enemy);assert.ok(enemy.hp<enemy.maxHp);
  const monk=s.addUnit('monk',0,0,25);ally.hp-=40;s.command([monk.id],{type:'heal',target:ally.id});s.tickUnit(monk,1);assert.ok(ally.hp>hp-40);
  const gate=s.addBuilding('gate',1,30,25,true),c=s.cell(gate.x,gate.z);assert.equal(s.grid(0)[c.z*s.gridSize+c.x],0);assert.equal(s.grid(2)[c.z*s.gridSize+c.x],1);
  assert.equal(s.guard([a.id],ally.id),true);assert.equal(s.guard([a.id],enemy.id),false);
});

test('allied resource gifts transfer the exact integer amount and reject enemies, invalid amounts and ended games',()=>{
  const s=make({slots:battlePreset('4v4')}),events=[];s.on(event=>events.push(event));
  const before={from:s.players[0].resources.wood,to:s.players[1].resources.wood};
  assert.equal(s.donateResources(0,1,'wood',125),true);
  assert.equal(s.players[0].resources.wood,before.from-125);assert.equal(s.players[1].resources.wood,before.to+125);
  assert.deepEqual(events.at(-1),{type:'donation',from:0,to:1,resource:'wood',amount:125});
  const enemy=s.players[4].resources.gold;
  for(const [from,to,type,amount]of [[0,4,'gold',100],[0,0,'wood',1],[0,1,'iron',1],[0,1,'wood',0],[0,1,'wood',1.5],[0,1,'wood',1000001],[0,1,'wood',s.players[0].resources.wood+1]])assert.equal(s.donateResources(from,to,type,amount),false);
  assert.equal(s.players[4].resources.gold,enemy);
  s.end(false,'test');assert.equal(s.donateResources(0,1,'wood',1),false);
  const ordinary=new Simulation({mode:'skirmish',seed:512});assert.equal(ordinary.donateResources(0,1,'wood',1),false);
});
test('shared vision reveals allies but never distant opponents, and can be disabled',()=>{
  const s=make(),ally=s.players[1].start,enemy=s.players[2].start;s.updateFog();assert.equal(s.isVisible(ally.x,ally.z),true);assert.equal(s.isVisible(enemy.x,enemy.z),false);
  s.options.shareVision=false;s.updateFog();assert.equal(s.isVisible(ally.x,ally.z),false);
  const explored=new Uint8Array(s.gridSize**2),visible=visibilityFor(s,2,explored);assert.equal(visible[s.cell(enemy.x,enemy.z).z*s.gridSize+s.cell(enemy.x,enemy.z).x],1);
});
test('losing a capital does not end the default full-building battle; walls and foundations still count',()=>{
  const s=make(),capital=s.owned(2,'building','towncenter')[0];capital.hp=0;s.checkVictory();assert.equal(s.ended,null);assert.equal(s.players[2].defeated,false);
  const wall=s.addBuilding('wall',2,30,-10,true),foundation=s.addBuilding('house',2,40,-10);for(const b of s.owned(2,'building'))if(b!==wall&&b!==foundation)b.hp=0;s.checkVictory();assert.equal(s.players[2].defeated,false);
  wall.hp=0;s.checkVictory();assert.equal(s.players[2].defeated,false);foundation.hp=0;s.checkVictory();assert.equal(s.players[2].defeated,true);assert.equal(s.ended,null);
  destroy(s,3);assert.equal(s.ended.won,true);
});
test('capital and total-conquest rules finish correctly for all members of an alliance',()=>{
  const fast=make({victory:'capital'});fast.owned(2,'building','towncenter')[0].hp=0;fast.checkVictory();assert.equal(fast.players[2].defeated,true);assert.equal(fast.ended,null);fast.owned(3,'building','towncenter')[0].hp=0;fast.checkVictory();assert.equal(fast.ended.won,true);
  const s=make({victory:'conquest'});destroy(s,0);assert.equal(s.players[0].defeated,false);destroy(s,0,'unit');assert.equal(s.players[0].defeated,true);assert.equal(s.ended,null);destroy(s,1);destroy(s,1,'unit');assert.equal(s.ended.won,false);
});
test('each AI has an independent difficulty clock, economy, and saved planning state',()=>{
  const slots=battlePreset();slots[1].difficulty='story';slots[2].difficulty='brutal';slots[3].difficulty='hard';const s=make({slots});
  for(let i=0;i<120;i++)s.tick(.1);assert.ok(s.aiStates[2].decision>s.aiStates[1].decision);assert.ok(s.aiStates[2].nextAttack<s.aiStates[1].nextAttack);
  for(let owner=1;owner<4;owner++)assert.ok(s.owned(owner,'building').some(b=>b.queue.length)||s.population(owner)>9);
  const saved=s.serialize(),loaded=Simulation.restore(saved);assert.deepEqual(loaded.aiStates,s.aiStates);assert.deepEqual(loaded.players.map(p=>p.resources),s.players.map(p=>p.resources));assert.deepEqual(loaded.options,s.options);
});
test('multiplayer continues after the host loses and awards the actual surviving team',()=>{
  const slots=battlePreset('ffa4').map(slot=>({...slot,controller:'human'})),s=make({slots,multiplayer:true});destroy(s,0);assert.equal(s.ended,null);destroy(s,2);assert.equal(s.ended,null);destroy(s,3);assert.equal(s.ended.winningTeam,2);assert.equal(s.ended.won,false);
});
test('weather is repeatable, changes over a match, and supports snow, rain and storm overrides',()=>{
  const states=[];for(let t=0;t<1000;t+=5){const a=weatherAt(512,'highlands',t),b=weatherAt(512,'highlands',t);assert.deepEqual(a,b);assert.ok(a.amount>=0&&a.amount<=1);states.push(a.type);}
  assert.ok(states.includes('clear')&&states.includes('cloudy')&&states.some(type=>['rain','storm'].includes(type)));
  assert.equal(weatherAt(512,'winter',110,'snow').type,'snow');assert.equal(weatherAt(512,'highlands',110,'rain').type,'rain');assert.ok(weatherAt(512,'highlands',16,'storm').flash);
  const s=make(),rng=s.rng.state;for(let i=0;i<100;i++)weatherAt(s.options.seed,s.options.map,i);assert.equal(s.rng.state,rng);
});
