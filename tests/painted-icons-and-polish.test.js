import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {UNITS,BUILDINGS,TECHS,MODES} from '../src/data.js';
import {uiIcon,UI_ICONS,PAINTED_ICONS} from '../src/ui-icons.js';
import {jadeBuildingKey} from '../src/jade-heroes-art.js';
import {Simulation} from '../src/simulation.js';
import {tacticalRangeRadius} from '../src/selection-overlays.js';
import {inspectorStatsMarkup,unitAttackValue} from '../src/entity-inspector.js';

test('painted medieval icon atlas covers all resources, units, heroes, buildings, techs and modes',()=>{
  const atlasPath=new URL('../src/ui-art/medieval-icons-atlas.webp',import.meta.url);
  assert.ok(fs.existsSync(atlasPath),'medieval-icons-atlas.webp exists');
  const bytes=fs.readFileSync(atlasPath);
  assert.equal(bytes.subarray(0,4).toString('ascii'),'RIFF');
  assert.equal(bytes.subarray(8,12).toString('ascii'),'WEBP');
  assert.ok(bytes.length>50000&&bytes.length<800000,'packed atlas stays lightweight');

  const tiers=new Set(['common','uncommon','rare','epic','legendary']);
  for(const [key,[idx,tier]] of Object.entries(PAINTED_ICONS)){
    assert.ok(Number.isInteger(idx)&&idx>=0&&idx<64,`${key} index ${idx} in 0..63`);
    assert.ok(tiers.has(tier),`${key} tier ${tier} is valid`);
  }

  for(const key of ['food','wood','gold','stone','pop',...Object.keys(UNITS),...Object.keys(BUILDINGS),...Object.keys(TECHS),...MODES.map(m=>m.id)]){
    assert.ok(PAINTED_ICONS[key],`${key} has painted medieval icon`);
    assert.match(UI_ICONS[key],/ui-icon-painted/);
    assert.match(UI_ICONS[key],/<svg\b/);
    assert.match(UI_ICONS[key],/aria-hidden="true"/);
  }
  // Pure UI chrome stays crisp vector SVG (not forced into painted inventory tiles)
  assert.doesNotMatch(uiIcon('chevron-right'),/ui-icon-painted/);
  assert.doesNotMatch(uiIcon('x'),/ui-icon-painted/);
});

test('Jade Empire 4-Age architecture maps Age 0 early huts, Age 1 Feudal halls, and Age 2-3 palaces inside GLB',()=>{
  assert.equal(jadeBuildingKey('towncenter',0),null,'Age 0 uses Dark Age frontier settlement');
  assert.equal(jadeBuildingKey('house',0),null,'Age 0 houses use Dark Age frontier huts');
  assert.equal(jadeBuildingKey('towncenter',1),'building:towncenter:jade:1');
  assert.equal(jadeBuildingKey('barracks',1),'building:barracks:jade:1');
  assert.equal(jadeBuildingKey('towncenter',2),'building:towncenter:jade:2');
  assert.equal(jadeBuildingKey('towncenter',3),'building:towncenter:jade:3');
  assert.equal(jadeBuildingKey('keep',2),'building:keep:jade:0');
  assert.equal(jadeBuildingKey('wonder',3),'building:wonder:jade:0');

  // Verify the compiled GLB JSON chunk contains every expected Feudal & Castle/Imperial Jade key
  const glb=fs.readFileSync(new URL('../src/assets3d/frontier-jade-heroes.glb',import.meta.url));
  const jsonLen=glb.readUInt32LE(12);
  const gltf=JSON.parse(glb.subarray(20,20+jsonLen).toString('utf8'));
  const keys=new Set((gltf.nodes||[]).map(n=>n.extras?.assetKey).filter(Boolean));
  for(const k of [
    'building:towncenter:jade:1','building:house:jade:1','building:barracks:jade:1','building:tower:jade:1','building:dock:jade:1',
    'building:towncenter:jade:2','building:towncenter:jade:3','building:house:jade:0','building:keep:jade:0','building:wonder:jade:0',
    'unit:chukonu','unit:firelancer','unit:trebuchet','unit:hero_jade','prop:rubble',
  ]){
    assert.ok(keys.has(k),`frontier-jade-heroes.glb contains ${k}`);
  }
});

test('Soldier Veterancy promotes troops at 2/5/9 kills and boosts combat power and inspector markup',()=>{
  const sim=new Simulation({mode:'skirmish',faction:'alder',map:'highlands',seed:42});
  const fighter=sim.addUnit('swordsman',0,0,0);
  const baseHp=fighter.maxHp,baseAtk=unitAttackValue(sim,fighter);
  const promoted=[];
  sim.on(e=>{if(e.type==='veteran')promoted.push(e);});

  for(let i=0;i<9;i++){
    const foe=sim.addUnit('villager',1,2,0);
    sim.hurt(foe,999,fighter);
  }
  assert.equal(fighter.kills,9);
  assert.equal(fighter.vetRank,3);
  assert.deepEqual(promoted.map(e=>e.rank),[1,2,3]);
  assert.ok(fighter.maxHp>baseHp*1.25,'Champion veterancy boosts max HP by +30%');
  assert.ok(unitAttackValue(sim,fighter)>baseAtk*1.22,'Champion veterancy boosts ATK');
  assert.match(inspectorStatsMarkup(sim,fighter),/★★★ Champion/);
});

test('Spoils of War grants Gold & Wood plunder when razing completed enemy buildings',()=>{
  const sim=new Simulation({mode:'skirmish',faction:'jade',map:'highlands',seed:7});
  const raider=sim.addUnit('knight',0,0,0);
  const enemyKeep=sim.addBuilding('keep',1,10,0,true);
  const enemySite=sim.addBuilding('barracks',1,16,0,false);
  const goldBefore=sim.players[0].resources.gold,woodBefore=sim.players[0].resources.wood;
  const spoils=[];
  sim.on(e=>{if(e.type==='spoils')spoils.push(e);});

  // Incomplete site gives zero spoils
  sim.hurt(enemySite,9999,raider);
  assert.equal(spoils.length,0);

  // Completed enemy Castle Keep awards +140 Gold & +100 Wood
  sim.hurt(enemyKeep,9999,raider);
  assert.equal(spoils.length,1);
  assert.equal(spoils[0].gold,140);
  assert.equal(spoils[0].wood,100);
  assert.equal(sim.players[0].resources.gold,goldBefore+140);
  assert.equal(sim.players[0].resources.wood,woodBefore+100);
});

test('Giant Counterweight Trebuchet exposes 28m tactical range ring and phone HUD stays proportional',()=>{
  const sim=new Simulation({mode:'skirmish',faction:'jade',map:'highlands',seed:9});
  const treb=sim.addUnit('trebuchet',0,0,0);
  assert.equal(tacticalRangeRadius(sim,treb),28);

  const phoneCss=fs.readFileSync(new URL('../src/phone-hud.css',import.meta.url),'utf8');
  assert.match(phoneCss,/--ph-hdr-h:\s*clamp\(/,'fluid dvh header scaling');
  assert.match(phoneCss,/flex:\s*0 1 auto/, 'hug-content selection dock prevents hollow empty bar');
  assert.doesNotMatch(phoneCss,/backdrop-filter:\s*blur/i,'no expensive canvas blur on mobile');
});
