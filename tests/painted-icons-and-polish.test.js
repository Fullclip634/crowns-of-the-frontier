import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {UNITS,BUILDINGS,TECHS,MODES} from '../src/data.js';
import {uiIcon,UI_ICONS,PAINTED_ICONS} from '../src/ui-icons.js';
import {jadeBuildingKey} from '../src/jade-heroes-art.js';
import {Simulation} from '../src/simulation.js';
import {tacticalRangeRadius} from '../src/selection-overlays.js';
import {inspectorStatsMarkup,unitAttackValue} from '../src/entity-inspector.js';
import {WarCommsController} from '../src/war-comms.js';
import {WATER_PALETTES} from '../src/water-surface.js';
import {bridgeArtwork} from '../src/bridge-layout.js';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {MeshoptDecoder} from 'three/addons/libs/meshopt_decoder.module.js';
import {registerBiomeArtwork,clearBiomeArtwork,biomeCliffWallGeometry} from '../src/biome-art.js';
import {selectionDetailsMarkup} from '../src/compact-hud.js';
import {skirmishHubMarkup} from '../src/menus-ui.js';

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

test('WarCommsController prevents duplicate overlapping banners during campaign dialogue',()=>{
  const makeClassList=(initial=[])=>{
    const s=new Set(initial);
    return {
      add:(...c)=>c.forEach(x=>s.add(x)),
      remove:(...c)=>c.forEach(x=>s.delete(x)),
      toggle:(c,force)=>force===undefined?(s.has(c)?(s.delete(c),false):(s.add(c),true)):(force?(s.add(c),true):(s.delete(c),false)),
      contains:(c)=>s.has(c),
    };
  };
  const banner={classList:makeClassList(['hidden']),dataset:{},innerHTML:''};
  const dialogue={classList:makeClassList([]),innerHTML:''};
  const root={
    querySelector:(sel)=>sel==='#war-comms-banner'?banner:sel==='#commander-dialogue'?dialogue:null,
  };
  const wc=new WarCommsController(root,{settings:{unitVoices:false,warHorns:false}});

  // Campaign intro with showBanner:false logs to War Comms without opening a duplicate banner
  wc.speak({speaker:'Admiral Iven',role:'ally',text:'Welcome to the Emerald Temple Lagoon!',showBanner:false});
  assert.equal(wc.history.length,1);
  assert.equal(banner.classList.contains('hidden'),true,'war-comms banner stays hidden for showBanner:false');
  assert.equal(dialogue.classList.contains('hidden'),false,'commander dialogue stays visible');

  // Campaign sim events also suppress the duplicate war-comms banner
  const fakeSim={time:12,options:{mode:'campaign18'},players:[{faction:'alder',name:'Admiral Iven',color:0x40a0e0}]};
  wc.onSimEvent(fakeSim,{type:'campaign-event',speaker:'Admiral Iven',text:'Seize the temple!'});
  wc.onSimEvent(fakeSim,{type:'campaign-stage',speaker:'Admiral Iven',text:'Hold the shrine!'});
  assert.equal(banner.classList.contains('hidden'),true,'campaign-event and campaign-stage never open a duplicate banner');

  // When a non-campaign war-comms banner displays, it hides #commander-dialogue so only one modal is ever shown
  wc._showBanner({speaker:'Rival Warlord',role:'enemy',text:'You dare enter my bay?'});
  assert.equal(banner.classList.contains('hidden'),false,'war-comms banner displays for combat taunts');
  assert.equal(dialogue.classList.contains('hidden'),true,'commander dialogue is automatically hidden when war-comms banner opens');

  wc.hideBanner();
  assert.equal(banner.classList.contains('hidden'),true,'hideBanner hides war-comms banner immediately');
  wc.reset();
});

test('Campaign World Map centers atlas top-bar icon chips, progress pill, and act tabs on mobile',()=>{
  const css=fs.readFileSync(new URL('../src/campaign-map.css',import.meta.url),'utf8');
  assert.match(css,/\.atlas-chip\{[^}]*justify-content:center/,'atlas-chip centers icon and text');
  assert.match(css,/\.atlas-progress-pill\{[^}]*justify-content:center/,'atlas-progress-pill centers trophy and count');
  assert.match(css,/#modal-root \.atlas-chip,#modal-root \.atlas-close\{[^}]*padding:0;justify-content:center;align-items:center/,'mobile atlas icon chips override modal button sizing and stay dead-center');
  assert.match(css,/#modal-root \.atlas-act-tab\{[^}]*align-items:center;justify-content:center/,'mobile landscape act tabs center text cleanly');
});

test('AoE2:DE battlefield upgrades deliver chiseled stone cliffs, sunlit turquoise water palettes, and flat stone causeway bridges',async()=>{
  // 1. Verify sunlit turquoise water palettes on river/coastal/epic maps
  for(const map of ['rivers','riverland','coast','archipelago','waterfallgorge','templelagoon','ironfall','threecrowns']){
    const pal=WATER_PALETTES[map];
    assert.ok(pal,`WATER_PALETTES.${map} is defined`);
    const sb=pal.shallow&255,sg=(pal.shallow>>8)&255,sr=(pal.shallow>>16)&255;
    const db=pal.deep&255,dr=(pal.deep>>16)&255;
    assert.ok(sb>sr*1.8&&sg>sr*1.8,`${map} shallow water is sunlit turquoise (${pal.shallow.toString(16)})`);
    assert.ok(db>dr*3,`${map} deep water is rich cerulean blue (${pal.deep.toString(16)})`);
  }

  // 2. Verify flat-decked AoE2:DE monumental stone causeway bridge replaces the arched hump across the game
  assert.equal(bridgeArtwork.revision,'aoe-causeway-v2');
  assert.ok(bridgeArtwork.crownHeight<=0.10,`bridge deck stays flat and level (crownHeight=${bridgeArtwork.crownHeight})`);
  assert.ok(bridgeArtwork.triangles<=7600,`bridge stays within lean triangle budget (${bridgeArtwork.triangles})`);
  const bridgeArtSrc=fs.readFileSync(new URL('../src/bridge-art.js',import.meta.url),'utf8');
  assert.doesNotMatch(bridgeArtSrc,/cloneEpicProp\('bridge:timber'\)/,'all maps use the unified AoE2:DE stone causeway bridge');
  assert.match(bridgeArtSrc,/view\.materials\.stone/,'bridge masonry uses crisp dressed ashlar stone texture');

  // 3. Verify Blender chiseled cliffwall carries deep V-cleft AO and stays natural stone (zero neon green on rocks)
  const bytes=fs.readFileSync(new URL('../src/assets3d/frontier-biome-art.glb',import.meta.url));
  const gltf=await new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'');
  registerBiomeArtwork(gltf.scene);
  try{
    const cliff=biomeCliffWallGeometry('ironpass');
    const col=cliff.attributes.color;
    let minLuma=1,neonGreen=0;
    for(let i=0;i<col.count;i++){
      const r=col.getX(i),g=col.getY(i),b=col.getZ(i);
      minLuma=Math.min(minLuma,(r+g+b)/3);
      if(g>r*1.15&&g>b*1.25)neonGreen++;
    }
    assert.ok(minLuma<0.45,`chiseled cliffwall carries crisp deep V-cleft AO (${minLuma.toFixed(2)})`);
    assert.equal(neonGreen,0,'cliffwall rock faces stay pure weathered limestone/slate without neon green paint');
    cliff.dispose();
  }finally{clearBiomeArtwork();}
});

test('Phone selection drawer and setup/multiplayer modals keep aligned inputs, readable cards, and opaque footers',()=>{
  // 1. Expanded selection drawer replaces confusing double-X with chevron-down "Less" button
  const fakePanel={classList:{contains:cls=>cls==='selection-expanded'}};
  const expandedBtn=selectionDetailsMarkup(fakePanel);
  assert.match(expandedBtn,/<span>Less<\/span>/,'expanded selection toggle says Less instead of duplicate Close X');
  assert.match(expandedBtn,/aria-expanded="true"/);

  // 2. Expanded selection drawer gives production/research buttons roomy grid layout with zero icon overlap
  const phoneCss=fs.readFileSync(new URL('../src/phone-hud.css',import.meta.url),'utf8');
  assert.match(phoneCss,/#hud \.selection-panel\.selection-expanded \.production-actions>button\{[^}]*grid-template-columns:28px minmax\(0,1fr\)/,'expanded research/train cards reserve dedicated 28px icon track');
  assert.match(phoneCss,/#hud \.selection-panel\.selection-expanded \.production-actions>button strong\{[^}]*white-space:normal/,'expanded research/train titles wrap cleanly without truncation');

  // 3. Modals prevent Android font-boosting inflation, unify input/select heights & fills, and keep custom-launch 100% opaque
  const ifaceCss=fs.readFileSync(new URL('../src/interface.css',import.meta.url),'utf8');
  assert.match(ifaceCss,/text-size-adjust:100%/,'prevents mobile browser text inflation on modal captions');
  const menusCss=fs.readFileSync(new URL('../src/menus-overhaul.css',import.meta.url),'utf8');
  assert.match(menusCss,/#modal-root #lan-name[^}]*background-color:#11251c/s,'lan-name shares identical obsidian surface with select fields');
  assert.match(menusCss,/#modal-root \.modal select\{[^}]*appearance:none/,'select dropdowns use unified sizing instead of shrunken native bar');
  assert.match(menusCss,/#modal-root \.custom-dialog \.custom-launch\{[^}]*background:#12221b/,'custom-launch sticky footer is 100% solid opaque with zero bleed-through');

  // 4. Skirmish Hub keeps AI Personality options concise (no mid-word truncation) with dedicated description below
  const hubHtml=skirmishHubMarkup({mode:'skirmish',faction:'alder',aiPersonality:'balanced'});
  assert.match(hubHtml,/<option value="balanced" selected>Balanced Marshal<\/option>/,'AI personality dropdown shows concise name without overflowing description');
  assert.match(hubHtml,/id="ai-personality-description"/,'AI personality renders dedicated description element below dropdown');
});
