import test from 'node:test';
import assert from 'node:assert/strict';
import {Simulation,distance} from '../src/simulation.js';
import {battlePreset,normalizeBattle,PLAYER_COLORS,visibilityFor,BATTLE_SIZES} from '../src/custom-battle.js';
import {weatherAt} from '../src/weather.js';
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
