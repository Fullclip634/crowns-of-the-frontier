import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {MeshoptDecoder} from 'three/addons/libs/meshopt_decoder.module.js';
import {FACTIONS,UNITS,TECHS,BUILDINGS} from '../src/data.js';
import {Simulation} from '../src/simulation.js';
import {HERO_DEFS,WONDER_POWERS,spawnHeroGeneral,triggerHeroSkill,wonderPowerFor,awardHeroExperience} from '../src/heroes.js';
import {registerJadeHeroesArtwork,jadeBuildingTemplate,jadeHeroesUnitTemplate,rubblePropTemplate} from '../src/jade-heroes-art.js';
import {registerBiomeArtwork,biomeCliffCapGeometry} from '../src/biome-art.js';
import {FACTION_SIGNATURES} from '../src/menus-ui.js';
import {technologyTreeMarkup} from '../src/technology-tree.js';
import {AudioEngine} from '../src/audio.js';

async function loadGlb(relPath){
  await MeshoptDecoder.ready;
  const buf=fs.readFileSync(path.resolve(relPath));
  const ab=buf.buffer.slice(buf.byteOffset,buf.byteOffset+buf.byteLength);
  return new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).parseAsync(ab,'');
}

test('Blender 4.5 LTS frontier-jade-heroes.glb contains all 38 Jade (Feudal/Castle/Imperial), Hero, Trebuchet & Rubble models',async()=>{
  const gltf=await loadGlb('src/assets3d/frontier-jade-heroes.glb');
  const reg=registerJadeHeroesArtwork(gltf.scene);
  assert.equal(reg.templates.size,38,'Expected all 38 Jade/Hero/Trebuchet/Rubble templates');
  assert.equal(jadeBuildingTemplate('towncenter',0),null,'Age 0 uses Dark Age frontier settlement');
  for(const b of ['towncenter','house','barracks','range','stable','blacksmith','market','mill','camp','mine','tower','dock']){
    assert.ok(jadeBuildingTemplate(b,1)?.feudal,`Missing Feudal Age Jade building template for ${b}`);
  }
  for(const b of ['towncenter','house','barracks','range','stable','workshop','blacksmith','market','monastery','mill','camp','mine','tower','keep','wonder','dock']){
    assert.ok(jadeBuildingTemplate(b,2),`Missing Castle Age Jade building template for ${b}`);
  }
  assert.ok(jadeBuildingTemplate('towncenter',3),'Missing Imperial Jade town center');
  for(const u of ['chukonu','firelancer','trebuchet','hero_alder','hero_sun','hero_raven','hero_iron','hero_jade']){
    assert.ok(jadeHeroesUnitTemplate(u),`Missing unit template for ${u}`);
  }
  assert.ok(rubblePropTemplate(),'Missing prop:rubble template');
});

test('Blender 4.5 LTS frontier-biome-art.glb includes grass/snow/arid cliff caps',async()=>{
  const gltf=await loadGlb('src/assets3d/frontier-biome-art.glb');
  registerBiomeArtwork(gltf.scene);
  for(const map of ['templelagoon','waterfallgorge','frostfallsiege','arid']){
    const geo=biomeCliffCapGeometry(map);
    assert.ok(geo&&geo.attributes.position.count>12,`Missing cliffcap geometry for ${map}`);
    geo.dispose();
  }
});

test('Jade Empire civilization, Repeating Crossbowman, Fire Lancer & Imperial Gunpowder work end-to-end',()=>{
  assert.ok(FACTIONS.jade,'Jade Empire must be registered in FACTIONS');
  assert.ok(FACTION_SIGNATURES.jade,'Jade Empire must have a signature card');
  assert.ok(UNITS.chukonu&&UNITS.firelancer,'Jade unique units must exist');
  assert.ok(TECHS.imperialGunpowder,'Jade unique tech must exist');

  const sim=new Simulation({mode:'skirmish',faction:'jade',map:'highlands',seed:77});
  sim.players[0].age=3;
  sim.players[0].resources={food:4000,wood:4000,gold:4000,stone:4000};
  const chukonu=sim.addUnit('chukonu',0,0,0);
  const enemy=sim.addUnit('spearman',1,6,0);
  const events=[];
  sim.on(e=>events.push(e));
  sim.hit(chukonu,enemy);
  for(let i=0;i<15;i++)sim.tick(.1);
  const bursts=events.filter(e=>e.type==='attack'&&e.entity?.type==='chukonu');
  assert.ok(bursts.length>=3,'Repeating crossbowman fired bursts');
  assert.equal(bursts.filter(e=>e.projectile===bursts[0].projectile).length,3,'Each repeating crossbowman volley releases 3 bolts');

  const lancer=sim.addUnit('firelancer',0,20,0);
  const f1=sim.addUnit('archer',1,21.5,0);
  const f2=sim.addUnit('archer',1,22.2,1.2);
  sim.tick(.05);
  const hpBefore=f2.hp;
  lancer.cooldown=0;
  sim.hit(lancer,f1);
  assert.ok(f2.hp<hpBefore,'Fire lancer explosive cone splashes nearby hostile enemies');

  const baseDmg=sim.attackDamage(lancer,f1);
  sim.players[0].tech.imperialGunpowder=1;
  const boostedDmg=sim.attackDamage(lancer,f1);
  assert.ok(boostedDmg>baseDmg,'Imperial gunpowder boosts Fire Lancer damage');

  const html=technologyTreeMarkup(sim,'jade');
  assert.ok(html.includes('The Jade Empire')&&html.includes('Heavenly Dragon Pagoda'));
});

test('Auto-Casting Hero Generals cast automatically in combat, level up, and enforce maxAlive=1 revival',()=>{
  const sim=new Simulation({mode:'skirmish',faction:'alder',map:'highlands',seed:88});
  sim.players[0].age=2;
  sim.players[0].resources={food:4000,wood:4000,gold:4000,stone:4000};
  const tc=sim.owned(0,'building','towncenter')[0];
  assert.equal(sim.train(tc.id,'hero_alder'),true,'Should summon Hero General from TC in Castle Age');
  assert.equal(sim.train(tc.id,'hero_alder'),false,'Cannot queue a 2nd Hero while one is already queued');
  tc.queue.length=0;

  const hero=spawnHeroGeneral(sim,0);
  assert.ok(hero&&hero.autoCast===true,'Hero starts with smart Auto-Cast ON by default');
  assert.equal(sim.train(tc.id,'hero_alder'),false,'Cannot train a 2nd Hero while Hero is alive');

  // Place nearby wounded allies + nearby enemies and verify automatic casting!
  const ally1=sim.addUnit('swordsman',0,hero.x+2,hero.z);
  const ally2=sim.addUnit('swordsman',0,hero.x-2,hero.z);
  ally1.hp=40;
  const foe1=sim.addUnit('spearman',1,hero.x+4,hero.z);
  const foe2=sim.addUnit('spearman',1,hero.x+5,hero.z);
  const skillEvents=[];
  sim.on(e=>{if(e.type==='hero-skill'||e.type==='hero-levelup')skillEvents.push(e);});
  for(let i=0;i<10;i++)sim.tick(.1);
  assert.ok(skillEvents.some(e=>e.type==='hero-skill'&&e.entity.id===hero.id),'Hero must auto-cast skill in combat without user clicks');
  assert.ok(ally1.hp>40,'Marshal Rowan auto-cast War Horn Rally must heal nearby allies');

  // Verify leveling up via combat kills
  const oldMaxHp=hero.maxHp;
  for(let k=0;k<8;k++)awardHeroExperience(sim,hero,foe1);
  assert.ok(hero.heroLevel>=2&&hero.maxHp>oldMaxHp,'Hero should level up and gain max HP from kills');

  // Verify manual cast when off cooldown + revival if fallen
  hero.skillCooldowns=[0,0];
  assert.equal(triggerHeroSkill(sim,hero,1),true,'Manual skill slot 1 should trigger cleanly');
  hero.hp=0;
  assert.equal(sim.train(tc.id,'hero_alder'),true,'Fallen Hero can be revived at Castle or Town Center');
});

test('Giant Trebuchet, Boiling-Oil Gatehouses & Flaming Arrows operate accurately',()=>{
  const sim=new Simulation({mode:'skirmish',faction:'iron',map:'highlands',seed:99});
  sim.players[0].age=3;
  sim.players[0].resources={food:4000,wood:4000,gold:4000,stone:4000};
  const treb=sim.addUnit('trebuchet',0,0,0);
  const enemyTower=sim.addBuilding('tower',1,22,0,true);
  const enemyGuard=sim.addUnit('spearman',1,23.5,1.5);
  const guardHpBefore=enemyGuard.hp;
  const impacts=[];
  sim.on(e=>{if(e.type==='projectile-impact'||e.type==='boiling-oil')impacts.push(e);});
  sim.hit(treb,enemyTower);
  for(let i=0;i<30;i++)sim.tick(.1);
  assert.ok(impacts.some(e=>e.type==='projectile-impact'&&e.fireball===true),'Trebuchet fires blazing fireball boulder');
  assert.ok(enemyGuard.hp<guardHpBefore,'Trebuchet 5.2m splash damages units beside target tower');

  // Flaming Arrows (+30% vs buildings & siege)
  const archer=sim.addUnit('archer',0,10,10);
  const ram=sim.addUnit('ram',1,16,10);
  const normalDmg=sim.attackDamage(archer,ram);
  sim.players[0].tech.fireArrows=1;
  const fireDmg=sim.attackDamage(archer,ram);
  assert.ok(fireDmg>normalDmg,'Flaming arrows increase damage vs siege engines');

  // Boiling-Oil Gatehouse
  const gate=sim.addBuilding('gate',0,-20,-20,true);
  const attacker=sim.addUnit('swordsman',1,-20,-17);
  const attHp=attacker.hp;
  sim.players[0].tech.boilingOil=1;
  for(let i=0;i<30;i++)sim.tick(.1);
  assert.ok(attacker.hp<attHp,'Boiling oil gatehouse scorches nearby hostile attackers');
  assert.ok(impacts.some(e=>e.type==='boiling-oil'),'Boiling oil emits visual/audio event');
});

test('All 5 World Wonders grant live kingdom-wide Super-Powers and announce alerts',()=>{
  for(const faction of Object.keys(FACTIONS)){
    assert.ok(WONDER_POWERS[faction],`Missing Wonder Super-Power for ${faction}`);
    const sim=new Simulation({mode:'skirmish',faction,map:'highlands',seed:123});
    sim.players[0].age=3;
    const events=[];
    sim.on(e=>events.push(e));
    const w=sim.addBuilding('wonder',0,-15,15,false);
    sim.tick(1.1);
    assert.ok(events.some(e=>e.type==='wonder-started'),'Starting a Wonder announces wonder-started');
    w.progress=1;w.hp=w.maxHp;
    const goldBefore=sim.players[0].resources.gold;
    const u=sim.addUnit('swordsman',0,-12,15);
    u.hp=Math.max(10,u.maxHp-40);
    const uHpBefore=u.hp;
    sim.tick(1.1);
    assert.ok(events.some(e=>e.type==='wonder-completed'),'Finishing a Wonder announces wonder-completed');
    assert.ok(wonderPowerFor(sim,0)?.faction===faction,'wonderPowerFor resolves completed Wonder');
    if(faction==='sun')assert.ok(sim.players[0].resources.gold>goldBefore,'Sun Wonder generates passive gold');
    if(faction==='alder'||faction==='jade')assert.ok(u.hp>uHpBefore,`${faction} Wonder regenerates unit HP`);
  }
});

test('Dynamic Siege Music escalates peace -> tension -> battle -> climax cleanly',()=>{
  const engine=new AudioEngine({volume:.7,music:true});
  assert.equal(engine.scoreStage(),'peace');
  engine.noteCombatActivity(.25);
  assert.equal(engine.scoreStage(),'tension');
  engine.noteCombatActivity(.25);
  assert.equal(engine.scoreStage(),'battle');
  engine.noteCombatActivity(.35);
  assert.equal(engine.scoreStage(),'climax');
});
