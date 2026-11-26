import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import * as THREE from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {MeshoptDecoder} from 'three/addons/libs/meshopt_decoder.module.js';
import {Simulation,distance} from '../src/simulation.js';
import {FACTIONS,UNITS,TECHS,MODES,BUILDINGS} from '../src/data.js';
import {registerIronholdArtwork,clearIronholdArtwork,ironholdArtworkState,ironholdBuildingKey} from '../src/ironhold-art.js';
import {authoredUnit,authoredBuilding} from '../src/authored-assets.js';
import {ensureModels} from '../src/models-3d.js';
import {unitAttackValue,unitSpeedValue,inspectorStatsMarkup} from '../src/entity-inspector.js';
import {technologyTreeMarkup} from '../src/technology-tree.js';
import {missionLoadingMarkup} from '../src/mission-loading.js';
import {skirmishHubMarkup} from '../src/menus-ui.js';
import {synthesizeVocalBark,isHumanVoiceUnit} from '../src/voice-system.js';
import {bridgeFootprint} from '../src/bridge-layout.js';

function advance(sim,seconds,step=.2){
  for(let t=0;t<seconds;t+=step)sim.tick(step);
}

function mockView(sim){
  const makeMat=color=>new THREE.MeshStandardMaterial({color,roughness:.85});
  const view={
    sim,
    settings:{quality:'medium'},
    materials:{
      wood:makeMat(0x886644),darkwood:makeMat(0x3a2a1e),trunk:makeMat(0x6d5f50),
      plaster:makeMat(0xdcd4c0),stone:makeMat(0xa59e92),stoneDark:makeMat(0x686a66),
      soil:makeMat(0x7c6648),leaf:makeMat(0x4c7838),leafDark:makeMat(0x2f5426),
      iron:makeMat(0x555b62),gold:makeMat(0xd4a842),glass:makeMat(0xd6b872),skin:makeMat(0xdcb092),
      water:makeMat(0x366a78),shadow:makeMat(0x000000),crop:makeMat(0xc4a448),
      furrow:makeMat(0x624e38),timberEdge:makeMat(0x543c26),
    },
    teamMaterials:Array.from({length:8},()=>makeMat(0xc4603e)),
    roofMaterials:Array.from({length:8},()=>makeMat(0xa25036)),
    geo:{cylinder:new THREE.CylinderGeometry(1,1,1,8),cone:new THREE.ConeGeometry(1,1,8),sphere:new THREE.SphereGeometry(1,8,6)},
    groundHeight:()=>0,
    authoredGeometry:new Set(),
  };
  ensureModels(view);
  return view;
}

test('Blender 4.5 LTS Ironhold 3D pack decodes cleanly with all 30 models, motion joints, windmill, and dock piers',async()=>{
  const bytes=await fs.readFile(new URL('../src/assets3d/frontier-ironhold.glb',import.meta.url));
  const gltf=await new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'');
  registerIronholdArtwork(gltf.scene);
  try{
    const state=ironholdArtworkState();
    assert.equal(state.models,30,'Ironhold GLB contains 1 Ironbreaker unit + 12 Feudal + 17 Castle/Imperial buildings');

    const sim=new Simulation({mode:'sandbox',faction:'iron',seed:2026});
    const view=mockView(sim);

    // 1. Bespoke Blender Ironbreaker unit binds cleanly with full motion rig + warhammer + kite shield
    const ib=sim.addUnit('ironbreaker',0,0,0);
    const ibRoot=authoredUnit(view,ib);
    assert.ok(ibRoot,'Ironbreaker resolves from dedicated Blender pack');
    assert.equal(ibRoot.userData.model3d.detail,'ironhold');
    assert.equal(ibRoot.userData.model3d.type,'ironbreaker');
    const motionTypes=new Set();
    let meshCount=0,hasMaul=false,hasShield=false,hasGreathelm=false;
    ibRoot.traverse(n=>{
      if(n.isMesh){
        meshCount++;
        if(n.userData.motion?.type)motionTypes.add(n.userData.motion.type);
        if(/MaulHead/i.test(n.name))hasMaul=true;
        if(/KiteShield/i.test(n.name))hasShield=true;
        if(/Greathelm/i.test(n.name))hasGreathelm=true;
      }
    });
    assert.ok(meshCount>=20,`expected rich articulated Ironbreaker mesh set (got ${meshCount})`);
    for(const joint of ['torso','head','arm','forearm','leg','knee'])assert.ok(motionTypes.has(joint),`missing motion joint ${joint}`);
    assert.ok(hasMaul&&hasShield&&hasGreathelm,'Ironbreaker has sculpted warhammer, kite shield, and greathelm');

    // 2. All Feudal (Age 1), Castle (Age 2), and Imperial (Age 3) Ironhold buildings bind cleanly
    const feudalTypes=['towncenter','house','barracks','range','stable','blacksmith','market','mill','camp','mine','tower','dock'];
    sim.players[0].age=1;
    for(const type of feudalTypes){
      const b=sim.addBuilding(type,0,0,0,true);
      const model=authoredBuilding(view,b);
      assert.ok(model,`Feudal Ironhold ${type} resolves`);
      assert.equal(model.userData.model3d.detail,'ironhold');
      assert.equal(model.userData.model3d.authoredAgeVariant,true);
    }

    const castleTypes=['towncenter','house','barracks','range','stable','workshop','blacksmith','market','mill','camp','mine','tower','keep','monastery','wonder','dock'];
    sim.players[0].age=2;
    for(const type of castleTypes){
      const b=sim.addBuilding(type,0,0,0,true);
      const model=authoredBuilding(view,b);
      assert.ok(model,`Castle Ironhold ${type} resolves`);
      assert.equal(model.userData.model3d.detail,'ironhold');
      if(type==='mill'){
        let hasRotor=false;
        model.traverse(n=>{if(n.userData.windmill)hasRotor=true;});
        assert.ok(hasRotor,'Ironhold mill has spinning windmill rotor');
      }
      if(type==='dock'){
        let hasPier=false;
        model.traverse(n=>{if(n.userData.dockPier)hasPier=true;});
        assert.ok(hasPier,'Ironhold dock has orientable dockPier');
      }
      if(type==='workshop')assert.ok(model.userData.chimneyOutlet,'Ironhold Siege Workshop has chimney smoke outlet');
    }

    // 3. Imperial Town Center resolves its distinct Age 3 golden-crowned citadel
    sim.players[0].age=3;
    assert.equal(ironholdBuildingKey('towncenter',3),'building:towncenter:iron:3');
    const impTc=authoredBuilding(view,sim.addBuilding('towncenter',0,0,0,true));
    assert.ok(impTc&&impTc.userData.model3d.architectureAge===3);
  }finally{
    clearIronholdArtwork();
  }
});

test('Ironhold Vanguard bonuses: +20% gold/stone mining only, +20% siege HP, -15% siege cost, Ironbreaker & Master Siegecraft',()=>{
  assert.ok(FACTIONS.iron&&UNITS.ironbreaker&&TECHS.siegecraft);
  assert.equal(isHumanVoiceUnit({kind:'unit',type:'ironbreaker'}),true);

  // 1. Mining speed (+20% on gold & stone; 0% on food & wood so Sunward keeps early boom edge)
  const sampleGather=(faction,resType)=>{
    const s=new Simulation({mode:'sandbox',faction,seed:101});
    for(const e of s.entities)if(e.kind==='unit'||e.kind==='resource')e.hp=0;
    s.revision++;
    const r=s.addResource(resType,0,0,5000);
    const v=s.addUnit('villager',0,1.2,0);
    s.command([v.id],{type:'gather',target:r.id});
    advance(s,4,.2);
    return v.carry;
  };
  const ironGold=sampleGather('iron','gold'),alderGold=sampleGather('alder','gold');
  const ironStone=sampleGather('iron','stone'),alderStone=sampleGather('alder','stone');
  const ironWood=sampleGather('iron','wood'),alderWood=sampleGather('alder','wood');
  const ironFood=sampleGather('iron','food'),alderFood=sampleGather('alder','food');
  assert.ok(Math.abs(ironGold/alderGold-1.2)<.02,`Ironhold gold mining should be +20% (got ${ironGold/alderGold})`);
  assert.ok(Math.abs(ironStone/alderStone-1.2)<.02,`Ironhold stone mining should be +20% (got ${ironStone/alderStone})`);
  assert.ok(Math.abs(ironWood/alderWood-1.0)<.01,'Ironhold wood gathering stays baseline');
  assert.ok(Math.abs(ironFood/alderFood-1.0)<.01,'Ironhold food gathering stays baseline');

  // 2. Siege HP (+20%) & Siege Cost (-15%) with exact queue cancel refund
  const ironSim=new Simulation({mode:'sandbox',faction:'iron',seed:202});
  const alderSim=new Simulation({mode:'sandbox',faction:'alder',seed:202});
  const ironRam=ironSim.addUnit('ram',0,0,0),alderRam=alderSim.addUnit('ram',0,0,0);
  assert.ok(Math.abs(ironRam.maxHp/alderRam.maxHp-1.2)<.01,'Ironhold rams have +20% HP');
  const ironRamCost=ironSim.cost(UNITS.ram.cost,0,'unit','ram');
  assert.equal(ironRamCost.wood,Math.ceil(UNITS.ram.cost.wood*.85));
  assert.equal(ironRamCost.gold,Math.ceil(UNITS.ram.cost.gold*.85));
  const ws=ironSim.addBuilding('workshop',0,-25,35,true);
  const woodBefore=ironSim.players[0].resources.wood,goldBefore=ironSim.players[0].resources.gold;
  assert.equal(ironSim.train(ws.id,'ram'),true);
  assert.equal(ironSim.players[0].resources.wood,woodBefore-ironRamCost.wood);
  assert.equal(ironSim.players[0].resources.gold,goldBefore-ironRamCost.gold);
  ironSim.cancelQueue(ws.id,0,0);
  assert.equal(ironSim.players[0].resources.wood,woodBefore,'cancelling siege unit refunds exact discounted cost');
  assert.equal(ironSim.players[0].resources.gold,goldBefore);

  // 3. Ironbreaker armor penetration (3) and building bonus (1.5x)
  const s=new Simulation({mode:'sandbox',faction:'iron',seed:303});
  s.players[0].age=2;s.players[1].faction='alder';s.players[1].age=2;
  const ib=s.addUnit('ironbreaker',0,0,0),sw=s.addUnit('swordsman',0,0,2);
  const enemySentinel=s.addUnit('sentinel',1,3,0),enemyTower=s.addBuilding('tower',1,10,0,true);
  assert.ok(s.attackDamage(ib,enemySentinel)>s.attackDamage(sw,enemySentinel)+3,'Ironbreaker pierces heavy armor better than swordsman');
  assert.ok(s.attackDamage(ib,enemyTower)>s.attackDamage(sw,enemyTower)*2.2,'Ironbreaker crushes buildings compared to normal infantry');

  // 4. Master Siegecraft (+15% siege damage & +15% siege speed)
  const ram=s.addUnit('ram',0,5,5);
  const dmgBefore=s.attackDamage(ram,enemyTower),atkBefore=unitAttackValue(s,ram),spdBefore=Number(unitSpeedValue(s,ram));
  s.players[0].tech.siegecraft=1;
  const dmgAfter=s.attackDamage(ram,enemyTower),atkAfter=unitAttackValue(s,ram),spdAfter=Number(unitSpeedValue(s,ram));
  assert.ok(dmgAfter>dmgBefore*1.12,'Master siegecraft boosts siege combat damage by +15%');
  assert.ok(atkAfter>atkBefore&&spdAfter>spdBefore,'Entity inspector reflects Master siegecraft boosts');
  assert.match(inspectorStatsMarkup(s,ib),/3 Armor Piercing/);

  // 5. Tech Tree shows Ironhold unique unit, unique tech, and discounted ram cost
  const treeHtml=technologyTreeMarkup(s,'iron');
  assert.match(treeHtml,/Ironhold ironbreaker/);
  assert.match(treeHtml,/Master siegecraft/);
  assert.match(treeHtml,new RegExp(`${ironRamCost.wood} Wood`));
});

test('King of the Hill (koth): single cleared monument, 180s victory/defeat, non-bridge dry placement & save/restore',()=>{
  for(const map of ['highlands','valley','rivers','ironpass']){
    const sim=new Simulation({mode:'koth',map,seed:404});
    const shrines=sim.entities.filter(e=>e.kind==='shrine');
    assert.equal(shrines.length,1,`${map}: koth spawns exactly 1 central monument`);
    assert.equal(shrines[0].displayName,'Crown monument');
    assert.equal(sim.isWater(shrines[0].x,shrines[0].z),false,`${map}: monument is on dry land`);
    assert.equal(bridgeFootprint(map,shrines[0].x,shrines[0].z,4),false,`${map}: monument does not block bridge`);
    assert.ok(sim.entities.filter(e=>e.hp>0&&e.kind==='resource'&&!e.water&&distance(e,shrines[0])<7).length===0,`${map}: plaza cleared around monument`);
  }

  const s=new Simulation({mode:'koth',map:'highlands',seed:505});
  s.tickAI=()=>{};
  for(const u of s.owned(1,'unit'))u.hp=0;
  const hill=s.entities.find(e=>e.kind==='shrine');
  s.addUnit('spearman',0,hill.x,hill.z);
  advance(s,20);
  assert.equal(hill.owner,0,'player captures central monument in 18s');
  const saved=Simulation.restore(JSON.parse(JSON.stringify(s.serialize())));
  saved.tickAI=()=>{};
  assert.equal(saved.entities.find(e=>e.kind==='shrine').owner,0,'save/restore preserves hill ownership');
  advance(saved,182);
  assert.equal(saved.ended?.won,true);
  assert.match(saved.ended.reason,/central monument/i);
});

test('Grand War (deathmatch): starts in Imperial Age with huge treasury, 10 villagers, and full military halls',()=>{
  const s=new Simulation({mode:'deathmatch',faction:'iron',map:'highlands',seed:606});
  for(const owner of [0,1]){
    assert.equal(s.players[owner].age,3,`owner ${owner} starts in Imperial Age`);
    assert.equal(s.players[owner].resources.food,10000);
    assert.equal(s.players[owner].resources.wood,10000);
    assert.equal(s.players[owner].resources.gold,6000);
    assert.equal(s.players[owner].resources.stone,4000);
    assert.equal(s.owned(owner,'unit','villager').length,10);
    for(const type of ['towncenter','barracks','range','stable','workshop','blacksmith']){
      assert.ok(s.owned(owner,'building',type).length>=1,`owner ${owner} starts with ${type}`);
    }
  }
  assert.ok(s.nextAttack<=65,'Deathmatch shortens initial attack timer for instant war');
  advance(s,6);
  assert.equal(s.ended,null);
});

test('Castle Siege (siege): fixes Iron Pass 240x240, fortifies Player 0 castle, spawns Enemy 1 Siege War-Camp',()=>{
  const s=new Simulation({mode:'siege',faction:'iron',map:'highlands',seed:707});
  assert.equal(s.options.map,'ironpass','Castle Siege forces Iron Pass mountain terrain');
  assert.equal(s.worldSize,240);
  assert.equal(s.players[0].age,2);
  assert.equal(s.players[1].age,2);
  assert.ok(s.owned(0,'building','keep').length>=1,'Player 0 starts with a Castle (Keep)');
  assert.ok(s.owned(0,'building','wall').length>=8,'Player 0 castle is walled');
  assert.ok(s.owned(0,'building','gate').length>=1,'Player 0 castle has gatehouse');
  assert.ok(s.owned(0,'unit').filter(u=>u.type!=='villager'&&u.type!=='scout').length>=10,'Player 0 starts with castle garrison');

  assert.ok(s.owned(1,'building','keep').length>=1,'Enemy 1 starts with fortified fortress Keep');
  assert.ok(s.owned(1,'building','workshop').length>=1,'Enemy 1 starts with Siege Workshop');
  assert.ok(s.owned(1,'unit','ram').length>=2,'Enemy 1 starts with battering rams');
  assert.ok(s.owned(1,'unit','catapult').length>=1,'Enemy 1 starts with trebuchet');
  assert.ok(s.barriers.length>=20,'Iron Pass mountain barriers exist');

  for(const u of s.entities.filter(e=>e.kind==='unit')){
    assert.equal(s.isWater(u.x,u.z),false,`unit ${u.type} spawns on dry land`);
  }
  advance(s,8);
  assert.equal(s.ended,null);
  // Destroying only the rival Town Center does NOT win while the rival Castle stands
  s.owned(1,'building','towncenter')[0].hp=0;
  s.checkVictory();
  assert.equal(s.ended,null,'rival castle still stands');
  // Destroying the rival Castle wins Castle Siege
  s.owned(1,'building','keep')[0].hp=0;
  s.checkVictory();
  assert.equal(s.ended?.won,true);

  // Losing player Castle causes defeat even while player Town Center still stands
  const loss=new Simulation({mode:'siege',faction:'iron',map:'highlands',seed:708});
  loss.owned(0,'building','keep')[0].hp=0;
  loss.checkVictory();
  assert.equal(loss.ended?.won,false);
  assert.match(loss.ended.reason,/castle/i);
});

test('UI briefings, hub markup, and Ironhold voice synthesis work cleanly across all new modes',()=>{
  for(const mode of ['koth','deathmatch','siege']){
    assert.ok(MODES.some(m=>m.id===mode),`MODES includes ${mode}`);
    const brief=missionLoadingMarkup({mode,faction:'iron',map:'highlands'});
    assert.match(brief,/Ironhold Vanguard/);
    const hub=skirmishHubMarkup({mode,faction:'iron',map:'highlands'});
    assert.match(hub,new RegExp(`data-hub-mode="${mode}"`));
  }
  // Procedural vocal bark for Ironhold does not throw on mock Web Audio context
  const nodes=[];
  const makeNode=()=>({
    frequency:{setValueAtTime(){},exponentialRampToValueAtTime(){}},
    gain:{setValueAtTime(){},linearRampToValueAtTime(){},exponentialRampToValueAtTime(){}},
    Q:{setValueAtTime(){}},
    type:'',connect(){return this;},start(){},stop(){},
  });
  const ctx={currentTime:1,createOscillator:()=>{const n=makeNode();nodes.push(n);return n;},createBiquadFilter:makeNode,createGain:makeNode,destination:{}};
  const out=synthesizeVocalBark(ctx,'iron','attack',1.0);
  assert.ok(out&&nodes.length>0,'Ironhold vocal cadence synthesizes cleanly');
});
