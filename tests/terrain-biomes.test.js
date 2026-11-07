import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {MAPS} from '../src/data.js';
import {Simulation} from '../src/simulation.js';
import {Landscape} from '../src/landscape.js';
import {terrainRelief,broadRelief,tacticalHeight,terrainPhase,highGroundMultiplier,slopeAt,slopeSpeedFactor,tacticalTerrainEnabled,HIGH_GROUND_THRESHOLD} from '../src/terrain-elevation.js';
import {terrainWeights} from '../src/terrain-layout.js';
import {waterChannels,channelAt} from '../src/map-water.js';
import {bridgeSpans} from '../src/bridge-layout.js';
import {terrainBiome,biomeProfile,isSnowBiome,isAridBiome,LEGACY_MEADOW_MAPS,NEW_BIOME_MAPS} from '../src/terrain-biomes.js';

const hex=value=>new THREE.Color(value);

test('new map kinds are registered with distinct palettes and gameplay profiles',()=>{
  for(const map of NEW_BIOME_MAPS){
    assert.ok(MAPS[map]?.name,map+' is selectable');
    assert.ok(MAPS[map].desc.length>30,map+' explains its premise');
    const style=terrainBiome(map),profile=biomeProfile(map);
    assert.equal(style.ground.length,3);
    assert.ok(profile.strength>0&&profile.cliffs>0,map+' has cliffs');
    assert.ok(profile.wood>0&&profile.gold>0&&profile.stone>0&&profile.food>0);
  }
  assert.equal(NEW_BIOME_MAPS.length,7);
  assert.equal(LEGACY_MEADOW_MAPS.includes('highlands'),true);
  // Palettes must be genuinely different, not seven shades of green.
  const signatures=NEW_BIOME_MAPS.map(map=>{
    const c=hex(terrainBiome(map).ground[0]);
    return `${Math.round(c.r*10)}:${Math.round(c.g*10)}:${Math.round(c.b*10)}`;
  });
  assert.equal(new Set(signatures).size,NEW_BIOME_MAPS.length,'every biome has a distinct base colour');
  for(const map of ['arid','tundra','volcanic']){
    const c=hex(terrainBiome(map).ground[0]);
    assert.ok(!(c.g>c.r&&c.g>c.b),map+' is not another green meadow');
  }
  assert.equal(isSnowBiome('tundra'),true);
  assert.equal(isSnowBiome('winter'),true);
  assert.equal(isSnowBiome('arid'),false);
  assert.equal(isAridBiome('arid'),true);
  assert.equal(isAridBiome('volcanic'),true);
});

test('cliffs and plateaus create measurable elevation range on every new map',()=>{
  for(const map of NEW_BIOME_MAPS){
    const land=new Landscape(512,map,400),geometry=land.geometry(land.renderSize,112);
    const range=geometry.boundingBox.max.y-geometry.boundingBox.min.y;
    assert.ok(range>10,map+' has real relief: '+range);
    assert.ok(geometry.attributes.position.array.every(Number.isFinite),map+' geometry is finite');
    const flats=new Set(),phase=land.phase;
    for(let x=-70;x<=70;x+=7)for(let z=-70;z<=70;z+=7)flats.add(Math.round(terrainRelief(map,x,z,phase)));
    assert.ok(flats.size>6,map+' has varied elevations, not a flat plane');
    geometry.dispose();
  }
});

test('tactical height uses the same seeded relief as the rendered terrain',()=>{
  for(const map of NEW_BIOME_MAPS){
    const seed=913,phase=terrainPhase(seed),land=new Landscape(seed,map,400);
    for(const [x,z]of [[-37,30],[0,0],[27,19],[52,43]]){
      const tactical=tacticalHeight(map,seed,x,z),rendered=broadRelief(map,x,z,land.phase);
      assert.ok(Math.abs(tactical-rendered)<1e-9,`${map} shares one height field at ${x},${z}`);
    }
  }
  assert.equal(tacticalTerrainEnabled('highlands'),false,'legacy maps keep published balance');
  assert.equal(tacticalTerrainEnabled('volcanic'),true);
});

test('high ground gives a bounded, measurable combat advantage',()=>{
  assert.equal(highGroundMultiplier(5,5),1,'flat ground is neutral');
  const downhill=highGroundMultiplier(12,0),uphill=highGroundMultiplier(0,12);
  assert.ok(downhill>1.1&&downhill<=1.25,'downhill bonus is capped');
  assert.ok(uphill<.95&&uphill>=.85,'uphill penalty is capped');
  assert.equal(highGroundMultiplier(HIGH_GROUND_THRESHOLD,0,{siege:true}),1,'siege keeps neutral on the threshold');
  assert.ok(highGroundMultiplier(12,0,{siege:true})<downhill,'siege gets half the effect');
  assert.ok(slopeSpeedFactor(.1)===1);
  assert.ok(slopeSpeedFactor(2)<1&&slopeSpeedFactor(2)>=.65,'steep slopes slow but never stop units');
});

test('high-ground advantage is real in simulation damage on cliff maps',()=>{
  const sim=new Simulation({mode:'sandbox',map:'highland',seed:512});
  assert.equal(sim.tacticalEnabled(),true);
  const phase=sim.tacticalPhase();
  let low=null,high=null;
  for(let x=-70;x<=70;x+=2)for(let z=-70;z<=70;z+=2){
    const h=tacticalHeight('highland',512,x,z,phase);
    if(!low||h<low.h)low={x,z,h};
    if(!high||h>high.h)high={x,z,h};
  }
  assert.ok(high.h-low.h>HIGH_GROUND_THRESHOLD*2,'map has a real hill and valley');
  const archer=type=>sim.addUnit(type,0,high.x,high.z),enemy=type=>sim.addUnit(type,1,low.x,low.z);
  const fromAbove=sim.attackDamage(archer('archer'),enemy('spearman'));
  const fromBelow=sim.attackDamage(sim.addUnit('archer',0,low.x,low.z),sim.addUnit('spearman',1,high.x,high.z));
  assert.ok(fromAbove>fromBelow,`downhill shots hit harder: ${fromAbove} vs ${fromBelow}`);
  const legacy=new Simulation({mode:'sandbox',map:'highlands',seed:512});
  assert.equal(legacy.tacticalEnabled(),false);
  assert.equal(legacy.terrainCombatMultiplier({x:60,z:60},{x:0,z:0},'ranged'),1);
});

test('water channels are shared by rendering and navigation',()=>{
  for(const map of ['coast','valley','rivers','riverland','archipelago']){
    const channels=waterChannels(map);
    assert.ok(channels.length>0,map+' has water');
    const land=new Landscape(512,map,400);
    assert.deepEqual(land.channels(),channels);
    // Coast is the naval map: it is crossed by transports, not bridges.
    assert.equal(bridgeSpans(map).length,map==='coast'?0:channels.length,map+' bridge layout is intentional');
    const c=channels[0],z=40,x=c.center+Math.sin(z*c.frequency)*c.bend;
    assert.equal(channelAt(map,x,z),true,`${map} water agrees at a sample point`);
    const sim=new Simulation({mode:'sandbox',map,seed:512});
    assert.equal(sim.isWater(x,z),true,`${map} navigation agrees with the rendered water`);
  }
  assert.equal(waterChannels('arid').length,0,'desert is dry');
  assert.equal(new Simulation({mode:'sandbox',map:'arid',seed:1}).isWater(0,60),false);
});

test('every new map generates a playable seeded simulation',()=>{
  for(const map of NEW_BIOME_MAPS){
    const sim=new Simulation({mode:'sandbox',map,seed:4301});
    assert.ok(sim.owned(0,'building','towncenter').length>0,map+' has a capital');
    assert.ok(sim.entities.filter(e=>e.kind==='resource').length>40,map+' has an economy');
    const profile=biomeProfile(map),wood=sim.entities.filter(e=>e.kind==='resource'&&e.type==='wood').length,stone=sim.entities.filter(e=>e.kind==='resource'&&e.type==='stone').length;
    assert.ok(profile.wood>profile.stone?wood>=stone*.5:stone>0,map+' resource mix is coherent');
    assert.ok(sim.entities.every(e=>Number.isFinite(e.x)&&Number.isFinite(e.z)));
    for(let i=0;i<50;i++)sim.tick(.1);
    assert.ok(sim.stats.gathered>=0,map+' advances without error');
  }
});

test('terrain splat weights give new biomes a distinct surface signature',()=>{
  const flat=map=>{
    const land=new Landscape(512,map,400);
    return terrainWeights(land,20,1,20,1);
  };
  const meadow=flat('highlands'),arid=flat('arid'),rocky=flat('volcanic');
  assert.ok(meadow.grass>.72,'legacy meadow stays grassy');
  assert.ok(arid.soil+arid.rock>meadow.soil+meadow.rock,'arid ground is bare earth/stone');
  assert.ok(rocky.rock>meadow.rock,'volcanic ground is exposed rock');
  for(const map of NEW_BIOME_MAPS){
    const w=flat(map);
    assert.ok(Number.isFinite(w.grass)&&Number.isFinite(w.soil)&&Number.isFinite(w.rock));
    assert.ok(Math.abs(w.grass+w.soil+w.rock-1)<1e-6,map+' weights are normalized');
  }
});
