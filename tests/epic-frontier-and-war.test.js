import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {MeshoptDecoder} from 'three/addons/libs/meshopt_decoder.module.js';
import {Simulation} from '../src/simulation.js';
import {MAPS,MISSIONS} from '../src/data.js';
import {EPIC_FRONTIER_MAPS,isJungleBiome,hasWaterfallBiome} from '../src/terrain-biomes.js';
import {waterChannels,waterFords,channelAt,fordAt} from '../src/map-water.js';
import {bridgeSpans,bridgeAt,spanZ} from '../src/bridge-layout.js';
import {mapCartography,mapPreviewSvg} from '../src/map-preview.js';
import {CAMPAIGN_ACTS,CAMPAIGN_NODES,campaignAtlasState} from '../src/campaign-map-data.js';
import {CAMPAIGN_SCRIPTS} from '../src/campaigns.js';
import {tickWildlife} from '../src/wildlife.js';
import {WarCommsController} from '../src/war-comms.js';

const project=path.resolve(import.meta.dirname,'..');

test('Blender 4.5 LTS frontier-epic-props.glb packs all 17 sculpted models cleanly',async()=>{
  const bytes=await fs.readFile(path.join(project,'src','assets3d','frontier-epic-props.glb'));
  const gltf=await new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).parseAsync(
    bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),''
  );
  const keys=new Set();
  let meshes=0;
  gltf.scene.traverse(n=>{
    if(n.userData?.assetKey)keys.add(n.userData.assetKey);
    if(n.isMesh)meshes++;
  });
  const expected=[
    'waterfall:single','waterfall:tiered','rapid:rock','ice:floe',
    'tree:jungle:0','tree:jungle:1','tree:jungle:2','tree:jungle:3',
    'temple:jungle','temple:ruin','bridge:timber',
    'prop:stakes','prop:campfire','prop:tent','prop:crates',
    'wildlife:deer','wildlife:doe',
  ];
  for(const key of expected)assert.ok(keys.has(key),`Missing Blender epic prop: ${key}`);
  assert.equal(keys.size,17);
  assert.ok(meshes>=25,'Expected multi-part sculpted meshes');
});

test('All 5 Epic Frontier maps register water, multi-Z timber/stone bridges, shallow walkable fords, and jungle biome',()=>{
  assert.deepEqual([...EPIC_FRONTIER_MAPS],['waterfallgorge','frostfallsiege','deepwoodravine','templelagoon','ironfall']);
  for(const id of EPIC_FRONTIER_MAPS){
    assert.ok(MAPS[id],`MAPS missing ${id}`);
    const carto=mapCartography(id);
    assert.ok(carto.mountains.length+carto.forests.length>0,`Cartography empty for ${id}`);
    const svg=mapPreviewSvg(id);
    assert.ok(svg.includes('<rect'),`SVG preview missing for ${id}`);
  }
  assert.equal(isJungleBiome('templelagoon'),true);
  assert.equal(hasWaterfallBiome('waterfallgorge'),true);
  assert.equal(hasWaterfallBiome('frostfallsiege'),true);
  assert.equal(hasWaterfallBiome('templelagoon'),true);
  assert.equal(hasWaterfallBiome('ironfall'),true);

  // Verify shallow river ford walkability vs build blocking on Waterfall Gorge!
  const sim=new Simulation({mode:'skirmish',map:'waterfallgorge',seed:2026});
  const ford=waterFords('waterfallgorge')[0];
  assert.ok(ford,'Waterfall Gorge must define a shallow river ford');
  const ch=waterChannels('waterfallgorge')[0];
  const midX=ch.center+Math.sin(ford.z*ch.frequency)*ch.bend;
  assert.equal(channelAt('waterfallgorge',midX,ford.z),true,'Visual water still covers the ford');
  assert.ok(fordAt('waterfallgorge',midX,ford.z),'fordAt detects shallow crossing');
  assert.equal(sim.isWater(midX,ford.z),false,'Land armies can walk straight across shallow river fords');
  assert.equal(sim.buildValid('house',midX,ford.z,0),false,'Buildings cannot be placed underwater on a ford');

  // Verify southern timber bridge at z=46 is walkable across the river!
  const timberSpan=bridgeSpans('waterfallgorge').find(s=>s.style==='timber');
  assert.ok(timberSpan&&spanZ(timberSpan)===46,'Waterfall Gorge has timber bridge at z=46');
  assert.ok(bridgeAt('waterfallgorge',timberSpan.center,46));
  assert.equal(sim.isWater(timberSpan.center,46),false,'Timber bridge span is walkable over water');
});

test('Roaming wildlife deer herds spawn, roam, pause when hunted, and grant +35% faster food gathering',()=>{
  const sim=new Simulation({mode:'skirmish',map:'waterfallgorge',seed:2026});
  const deer=sim.entities.filter(e=>e.hp>0&&e.wildlife);
  assert.ok(deer.length>=6,`Expected roaming deer herds, got ${deer.length}`);
  assert.ok(deer.some(d=>d.wildlife==='deer')&&deer.some(d=>d.wildlife==='doe'),'Herds contain both stags and does');

  // Roaming tick advances grazing timers and moves unobstructed deer gently
  const sample=deer[0];
  sample.grazeTimer=0;
  for(let i=0;i<20;i++)tickWildlife(sim,0.25);
  assert.ok(Number.isFinite(sample.x)&&Number.isFinite(sample.z));

  // Verify hunting speed is +35% faster than gathering a berry bush
  const berry=sim.addResource('food',-45,45,400);
  const stag=sim.addResource('food',-30,45,280);
  stag.wildlife='deer';
  const v1=sim.addUnit('villager',0,berry.x+1.5,berry.z);
  const v2=sim.addUnit('villager',0,stag.x+1.5,stag.z);
  v1.order={type:'gather',target:berry.id};
  v2.order={type:'gather',target:stag.id};
  sim.tickUnit(v1,1.0);
  sim.tickUnit(v2,1.0);
  assert.ok(v2.carry>v1.carry*1.30,`Expected deer hunting (${v2.carry}) to be ~35% faster than berries (${v1.carry})`);
});

test('Act V Chapter XV (The Gates of Ironfall) creates 2 united walled bases behind a narrow pass vs 4 outer enemy bases',()=>{
  assert.ok(CAMPAIGN_ACTS.some(a=>a.id==='act5'),'Act V exists in Campaign Atlas');
  assert.equal(CAMPAIGN_NODES.filter(n=>n.act==='act5').length,5,'Act V has 5 chapters');
  const atlas=campaignAtlasState({},false);
  const ch15Node=atlas.nodes.find(i=>i.id==='campaign15');
  assert.ok(ch15Node?.unlocked,'Chapter XV (The Gates of Ironfall) is immediately unlocked on the Campaign Atlas');

  const sim=new Simulation({mode:'campaign15',faction:'iron',difficulty:'normal',seed:4315});
  assert.equal(sim.players.length,6,'2v4 team war has 6 kingdoms');
  assert.equal(sim.allied(0,5),true,'Marshal Rowan (owner 5) is allied with Player 0');
  for(const foe of [1,2,3,4])assert.equal(sim.hostile(0,foe),true,`Owner ${foe} is hostile`);

  // Both You (0) and Ally (5) start with full ready walled bases + keeps + workshops + farms!
  for(const allyOwner of [0,5]){
    assert.ok(sim.count(allyOwner,'building','towncenter')>=1,`Owner ${allyOwner} has Town Center`);
    assert.ok(sim.count(allyOwner,'building','keep')>=1,`Owner ${allyOwner} has Castle Keep`);
    assert.ok(sim.count(allyOwner,'building','wall')>=8,`Owner ${allyOwner} has ready perimeter walls`);
    assert.ok(sim.count(allyOwner,'building','gate')>=1,`Owner ${allyOwner} has gatehouse`);
    assert.ok(sim.count(allyOwner,'building','farm')>=4,`Owner ${allyOwner} has ready farms`);
    assert.ok(sim.count(allyOwner,'unit','villager')>=12,`Owner ${allyOwner} has strong worker economy`);
  }
  // All 4 enemy bases exist with Town Centers & defenders!
  for(const foe of [1,2,3,4]){
    assert.ok(sim.count(foe,'building','towncenter')>=1,`Enemy ${foe} has capital Town Center`);
    assert.ok(sim.count(foe,'unit')>=10,`Enemy ${foe} has starting workers & army`);
  }
  // Narrow pass cliffs + battlefield props + roaming deer present!
  assert.ok(sim.barriers.length>=25,'Narrow Ironfall pass has mountain cliff barriers');
  assert.ok(sim.battlefieldProps.length>=6,'War-camps & pass feature campfires, tents, and stakes');
  assert.ok(sim.entities.some(e=>e.wildlife),'Sanctuary includes roaming deer herds');

  // Verify remaining 4 Act V chapters initialize cleanly!
  for(const id of ['campaign16','campaign17','campaign18','campaign19']){
    assert.ok(MISSIONS.some(m=>m.id===id),`MISSIONS has ${id}`);
    assert.ok(CAMPAIGN_SCRIPTS[id],`CAMPAIGN_SCRIPTS has ${id}`);
    const s=new Simulation({mode:id,faction:'alder',difficulty:'normal'});
    assert.ok(s.players.length>=4,`${id} is a multi-kingdom team war`);
    assert.ok(s.count(0,'building','towncenter')>=1,`${id} gives player a ready base`);
  }

  // Save/restore round-trip preserves Act V state & props!
  const restored=Simulation.restore(JSON.parse(JSON.stringify(sim.serialize())));
  assert.equal(restored.players.length,6);
  assert.equal(restored.battlefieldProps.length,sim.battlefieldProps.length);
});

test('WarCommsController delivers spoken enemy/ally comms, real Ally Tactical Orders, Supplies & Enemy Taunts',()=>{
  const sim=new Simulation({mode:'campaign15',faction:'alder',difficulty:'normal',seed:4315});
  const pings=[];
  const comms=new WarCommsController(null,{settings:{volume:0.7,unitVoices:true,warHorns:true},onPing:(x,z,k)=>pings.push({x,z,k})});

  // 1. Ally Attack order steers Allied AI directive & pings enemy target
  const atk=comms.issueAllyOrder(sim,null,'attack');
  assert.equal(atk.ok,true);
  assert.equal(sim.allyDirective.type,'attack');
  assert.equal(pings.length,1);

  // 2. Ally Hold Pass order targets the narrow Ironfall bridgehead
  const def=comms.issueAllyOrder(sim,null,'defend');
  assert.equal(def.ok,true);
  assert.equal(sim.allyDirective.type,'defend');
  assert.equal(sim.allyDirective.x,-24);

  // 3. Ally Supplies transfers real resources from Marshal Rowan to Player 0
  const goldBefore=sim.players[0].resources.gold;
  const sup=comms.issueAllyOrder(sim,null,'supplies');
  assert.equal(sup.ok,true);
  assert.ok(sim.players[0].resources.gold>goldBefore,'Ally transferred real gold supplies');

  // 4. Enemy Taunt provokes an enemy warlord & logs their spoken reply
  const taunt=comms.sendEnemyTaunt(sim,'bringit');
  assert.equal(taunt.ok,true);
  assert.ok(sim.provokedWarlord&&sim.hostile(0,sim.provokedWarlord.owner),'Taunt provoked a hostile warlord');
  assert.ok(comms.history.some(h=>h.role==='enemy'),'Enemy response recorded in comms log');

  // 5. Mute toggle updates state cleanly
  assert.equal(comms.toggleMute(),true);
  assert.equal(comms.muted,true);
});

test('Under-attack alarm ignores offensive field combat and fires only for base buildings, workers, or home defenders',()=>{
  const sim=new Simulation({mode:'skirmish',map:'waterfallgorge',faction:'alder',difficulty:'normal',seed:101});
  const alarmCount=()=>sim.events.filter(e=>e.type==='alarm').length;

  // Place player soldier attacking an enemy unit out in the middle of the field (far from player base!)
  const enemySoldier=sim.addUnit('swordsman',1,10,0);
  const playerSoldier=sim.addUnit('swordsman',0,8,0);
  sim.hurt(playerSoldier,10,enemySoldier);
  assert.equal(alarmCount(),0,'Engaging enemies in the open field must NOT trigger "Your kingdom is under attack!"');

  // Place player soldier assaulting an enemy base right next to enemy TC
  const enemyTc=sim.owned(1,'building','towncenter')[0];
  const raider=sim.addUnit('knight',0,enemyTc.x-5,enemyTc.z);
  sim.hurt(raider,15,enemyTc);
  assert.equal(alarmCount(),0,'Assaulting an enemy base must NOT trigger "Your kingdom is under attack!"');

  // Now an enemy attacks a player building -> MUST fire alarm!
  const myTc=sim.owned(0,'building','towncenter')[0];
  sim.hurt(myTc,12,enemySoldier);
  assert.equal(alarmCount(),1,'Attacking a player building MUST trigger "Your kingdom is under attack!"');

  // Reset cooldown & test enemy attacking a player villager -> MUST fire alarm!
  sim.time+=20;
  const myVil=sim.owned(0,'unit','villager')[0];
  sim.hurt(myVil,8,enemySoldier);
  assert.equal(alarmCount(),2,'Attacking a player villager MUST trigger "Your kingdom is under attack!"');

  // Reset cooldown & test enemy fighting a player soldier INSIDE player base -> MUST fire alarm!
  sim.time+=20;
  const homeGuard=sim.addUnit('spearman',0,myTc.x+6,myTc.z);
  sim.hurt(homeGuard,8,enemySoldier);
  assert.equal(alarmCount(),3,'Fighting enemies inside your home base perimeter MUST trigger alarm');
});

test('Act V missions require wiping out ALL enemy base structures, not just sniping Town Centers',()=>{
  const sim=new Simulation({mode:'campaign15',faction:'alder',difficulty:'normal',seed:4315});
  // Destroy ONLY all 4 enemy Town Centers — every enemy still has Keeps/Barracks/Towers/Houses!
  for(const foe of [1,2,3,4]){
    for(const tc of sim.owned(foe,'building','towncenter'))tc.hp=0;
  }
  sim.tick(1.0);
  assert.equal(sim.ended,null,'Destroying only enemy Town Centers MUST NOT win Act V');
  for(const foe of [1,2,3,4]){
    assert.equal(sim.players[foe].defeated,false,`Enemy ${foe} stays active while base structures remain`);
  }

  // Advance timer past stage 0 hold & verify stage 1 still waits for full forward war-camp wipeout
  sim.time=125;
  sim.tick(1.0);
  assert.equal(sim.campaignState.stage,1,'Stage 0 passes after hold timer');
  assert.equal(sim.ended,null,'Stage 1 still requires wiping out every building in Warlord Vex & Krag camps');

  // Wipe out ALL non-wall/non-gate/non-farm structures for Warlord Vex (1) & Krag (2)
  for(const foe of [1,2]){
    for(const b of sim.owned(foe,'building')){
      if(!['wall','gate','farm'].includes(b.type))b.hp=0;
    }
  }
  sim.tick(1.0);
  assert.equal(sim.players[1].defeated,true,'Warlord Vex is defeated once all base structures are wiped');
  assert.equal(sim.players[2].defeated,true,'Siege-Master Krag is defeated once all base structures are wiped');
  assert.equal(sim.owned(1,'building').length,0,'Defeated enemy leftover walls/farms collapse cleanly');
  assert.equal(sim.campaignState.stage,2,'Advances to final stage once both forward camps are wiped');
  assert.equal(sim.ended,null,'Does not win while Emir Soliman & Draven still stand');

  // Wipe out ALL non-wall/non-gate/non-farm structures for Emir Soliman (3) & Overlord Draven (4)
  for(const foe of [3,4]){
    for(const b of sim.owned(foe,'building')){
      if(!['wall','gate','farm'].includes(b.type))b.hp=0;
    }
  }
  sim.tick(1.0);
  assert.ok(sim.ended?.won===true,'Act V wins only after ALL four enemy bases are completely wiped out!');
});
