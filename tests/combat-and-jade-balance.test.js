import assert from 'node:assert/strict';
import test from 'node:test';
import {BUILDINGS,FACTIONS,TECHS,UNITS} from '../src/data.js';
import {inspectorStatsMarkup,unitAttackValue} from '../src/entity-inspector.js';
import {Simulation} from '../src/simulation.js';

function cleanSim(faction='alder',seed=701){
  const sim=new Simulation({mode:'sandbox',faction,map:'highlands',seed});
  for(const e of sim.entities)if(e.kind!=='resource')e.hp=0;
  sim.index=null;
  sim.revision++;
  sim.tickAI=()=>{};
  sim.visible.fill(1);
  return sim;
}

test('Giant Trebuchet honors buildingBonus against fortifications without leaking anti-building bonus into unit splash',()=>{
  const sim=cleanSim('alder',702);
  sim.players[0].age=3;
  sim.players[1].age=3;
  const treb=sim.addUnit('trebuchet',0,0,0);
  const ram=sim.addUnit('ram',0,0,4);
  const castle=sim.addBuilding('keep',1,22,0,true);
  const guard=sim.addUnit('knight',1,23.5,1.5);
  guard.stance='hold';
  treb.stance='hold';
  ram.stance='hold';

  const trebCastleDmg=sim.attackDamage(treb,castle);
  const trebUnitDmg=sim.attackDamage(treb,guard);
  const ramCastleDmg=sim.attackDamage(ram,castle);
  const trebDps=trebCastleDmg/UNITS.trebuchet.cooldown;
  const ramDps=ramCastleDmg/(UNITS.ram.cooldown||1.2);

  // 76 * 1.36 * 3 * 2.2 - 1 = 681.176 -> ~162.2 DPS vs Ram's ~128.4 DPS
  assert.ok(trebCastleDmg>650&&trebCastleDmg<710,`expected trebuchet building hit ~681, got ${trebCastleDmg}`);
  assert.ok(trebDps>ramDps,`Imperial Trebuchet (${trebDps.toFixed(1)} DPS) must out-DPS Battering Ram (${ramDps.toFixed(1)} DPS) vs Castles`);
  assert.ok(trebCastleDmg>trebUnitDmg*6,'trebuchet buildingBonus applies specifically to buildings');

  // Firing at a building should splash nearby soldiers at unit scale (~62), not anti-building scale (~408)
  const guardBefore=guard.hp;
  sim.tickUnit=()=>{};
  sim.tickBuilding=()=>{};
  sim.hit(treb,castle);
  for(let i=0;i<30;i++)sim.tick(.1);
  const splashTaken=guardBefore-guard.hp;
  assert.ok(splashTaken>25&&splashTaken<120,`unit splash beside target building must stay at unit scale, got ${splashTaken}`);
});

test('Forged Weapons buffs land melee only and never buffs siege engines or warships',()=>{
  const sim=cleanSim('alder',703);
  sim.players[0].age=3;
  const swordsman=sim.addUnit('swordsman',0,0,0);
  const knight=sim.addUnit('knight',0,0,2);
  const ram=sim.addUnit('ram',0,0,4);
  const catapult=sim.addUnit('catapult',0,0,6);
  const trebuchet=sim.addUnit('trebuchet',0,0,8);
  const warship=sim.addUnit('warship',0,0,10);
  const target=sim.addBuilding('keep',1,20,0,true);
  const enemyUnit=sim.addUnit('swordsman',1,16,0);

  const before={
    swordDmg:sim.attackDamage(swordsman,enemyUnit),
    swordAtk:unitAttackValue(sim,swordsman),
    knightDmg:sim.attackDamage(knight,enemyUnit),
    knightAtk:unitAttackValue(sim,knight),
    ramDmg:sim.attackDamage(ram,target),
    ramAtk:unitAttackValue(sim,ram),
    catDmg:sim.attackDamage(catapult,target),
    catAtk:unitAttackValue(sim,catapult),
    trebDmg:sim.attackDamage(trebuchet,target),
    trebAtk:unitAttackValue(sim,trebuchet),
    shipDmg:sim.attackDamage(warship,target),
    shipAtk:unitAttackValue(sim,warship),
  };

  sim.players[0].tech.attack=3;

  assert.ok(sim.attackDamage(swordsman,enemyUnit)>before.swordDmg*1.4,'Forged Weapons buffs swordsman damage');
  assert.ok(unitAttackValue(sim,swordsman)>before.swordAtk*1.4,'HUD ATK reflects Forged Weapons on swordsman');
  assert.ok(sim.attackDamage(knight,enemyUnit)>before.knightDmg*1.4,'Forged Weapons buffs knight damage');
  assert.ok(unitAttackValue(sim,knight)>before.knightAtk*1.4,'HUD ATK reflects Forged Weapons on knight');

  assert.equal(sim.attackDamage(ram,target),before.ramDmg,'Forged Weapons must not buff battering ram');
  assert.equal(unitAttackValue(sim,ram),before.ramAtk,'HUD ATK for ram ignores Forged Weapons');
  assert.equal(sim.attackDamage(catapult,target),before.catDmg,'Forged Weapons must not buff mangonel');
  assert.equal(unitAttackValue(sim,catapult),before.catAtk,'HUD ATK for mangonel ignores Forged Weapons');
  assert.equal(sim.attackDamage(trebuchet,target),before.trebDmg,'Forged Weapons must not buff trebuchet');
  assert.equal(unitAttackValue(sim,trebuchet),before.trebAtk,'HUD ATK for trebuchet ignores Forged Weapons');
  assert.equal(sim.attackDamage(warship,target),before.shipDmg,'Forged Weapons must not buff siege galleon');
  assert.equal(unitAttackValue(sim,warship),before.shipAtk,'HUD ATK for siege galleon ignores Forged Weapons');
});

test('Bodkin Arrows buffs land ranged only and does not double-dip on Galleys alongside Seamanship',()=>{
  const sim=cleanSim('alder',704);
  sim.players[0].age=3;
  const archer=sim.addUnit('archer',0,0,0);
  const galley=sim.addUnit('galley',0,0,4);
  const enemy=sim.addUnit('spearman',1,14,0);

  const archerBaseDmg=sim.attackDamage(archer,enemy);
  const archerBaseAtk=unitAttackValue(sim,archer);
  const galleyBaseDmg=sim.attackDamage(galley,enemy);
  const galleyBaseAtk=unitAttackValue(sim,galley);

  sim.players[0].tech.ranged=3;

  assert.ok(sim.attackDamage(archer,enemy)>archerBaseDmg*1.5,'Bodkin Arrows Lv3 boosts land archers');
  assert.ok(unitAttackValue(sim,archer)>archerBaseAtk*1.5,'HUD ATK reflects Bodkin Arrows on land archers');
  assert.match(inspectorStatsMarkup(sim,archer),/RNG<b>14m<\/b>/,'Land archer gains +3m range from Bodkin Arrows Lv3');

  assert.equal(sim.attackDamage(galley,enemy),galleyBaseDmg,'Galley damage must not double-dip Bodkin Arrows');
  assert.equal(unitAttackValue(sim,galley),galleyBaseAtk,'Galley HUD ATK must not double-dip Bodkin Arrows');
  assert.match(inspectorStatsMarkup(sim,galley),/RNG<b>19m<\/b>/,'Galley range stays at 19m without Bodkin Arrows');

  // Seamanship still properly scales naval warships & galleys
  sim.players[0].tech.seamanship=2;
  assert.ok(sim.attackDamage(galley,enemy)>galleyBaseDmg*1.35,'Seamanship Lv2 boosts Galley damage by +40%');
  assert.ok(unitAttackValue(sim,galley)>galleyBaseAtk*1.35,'HUD ATK reflects Seamanship on Galley');
});

test('Mangonel range sits below Watchtowers, Bombard Towers, Castles, and Giant Trebuchets',()=>{
  assert.equal(UNITS.catapult.range,19);
  assert.ok(UNITS.catapult.range>BUILDINGS.towncenter.range,'Mangonel outranges Town Centers');
  assert.ok(UNITS.catapult.range>UNITS.marksman.range,'Mangonel outranges base Marksmen');
  assert.ok(UNITS.catapult.range<BUILDINGS.tower.range,'Mangonel no longer outranges Watchtowers');
  assert.ok(UNITS.catapult.range<BUILDINGS.bombard.range,'Mangonel stays below Bombard Towers');
  assert.ok(UNITS.catapult.range<BUILDINGS.keep.range,'Mangonel stays below Castles');
  assert.ok(UNITS.catapult.range<UNITS.trebuchet.range,'Imperial Giant Trebuchet clearly outranges Castle Mangonel');
});

test('Jade Empire keeps only its two signature passives and balanced Repeating Crossbowman / Fire Lancer roles',()=>{
  const jade=FACTIONS.jade;
  assert.equal(jade.rangedRate,1.15,'Jade retains +15% ranged attack speed');
  assert.equal(jade.buildingHP,1,'Jade no longer has hidden building HP bonus');
  assert.equal(jade.gather,1,'Jade no longer has hidden economy gather bonus');
  assert.equal(jade.cavalry,1,'Jade no longer has hidden cavalry damage bonus');
  assert.equal(jade.cost,1,'Jade no longer has hidden building discount');

  // Repeating Crossbowman: short-range anti-light-infantry specialist, outranged by Archer & Marksman
  assert.ok(UNITS.chukonu.range<UNITS.archer.range,'Repeating crossbowman has shorter range than generic Archer');
  assert.ok(UNITS.chukonu.range<UNITS.marksman.range,'Repeating crossbowman is outranged by Sunward Marksman');
  assert.equal(UNITS.chukonu.burstCount,3,'Repeating crossbowman retains 3-bolt burst identity');

  // Compare Imperial Age DPS vs heavy armored Imperial Knight (9 armor)
  const sim=cleanSim('jade',705);
  sim.players[0].age=3;
  sim.players[0].tech={...sim.players[0].tech,ranged:3,attack:3,armor:3,imperialGunpowder:1};
  sim.players[1].age=3;
  sim.players[1].tech={...sim.players[1].tech,ranged:3,attack:3,armor:3};
  const chukonu=sim.addUnit('chukonu',0,0,0);
  const lancer=sim.addUnit('firelancer',0,0,2);
  const enemyKnight=sim.addUnit('knight',1,8,0);
  const enemySpear=sim.addUnit('spearman',1,8,2);

  const bolt1Knight=sim.attackDamage(chukonu,enemyKnight);
  const cknVolleyKnight=bolt1Knight+2*Math.max(1,bolt1Knight*.85);
  const cknCd=UNITS.chukonu.cooldown/FACTIONS.jade.rangedRate;
  const cknDpsKnight=cknVolleyKnight/cknCd;

  const bolt1Spear=sim.attackDamage(chukonu,enemySpear);
  const cknVolleySpear=bolt1Spear+2*Math.max(1,bolt1Spear*.85);
  const cknDpsSpear=cknVolleySpear/cknCd;

  assert.ok(cknDpsKnight<13,`Imperial Repeating Crossbowman DPS vs Imperial Knight must be bounded (<13), got ${cknDpsKnight.toFixed(2)}`);
  assert.ok(cknDpsSpear>cknDpsKnight*2,'Repeating Crossbowman still excels against lightly armored spearmen');

  // Fire Lancer: expensive glass-cannon shock cavalry, weaker 1v1 against standard Knights & Spearmen
  const knightCost=UNITS.knight.cost.food+UNITS.knight.cost.gold;
  const lancerCost=UNITS.firelancer.cost.food+UNITS.firelancer.cost.gold;
  assert.ok(lancerCost>knightCost,'Fire Lancer costs more than a generic Knight');
  assert.ok(UNITS.firelancer.hp<UNITS.knight.hp,'Fire Lancer has less HP than a generic Knight');
  assert.ok(UNITS.firelancer.armor<UNITS.knight.armor,'Fire Lancer has less armor than a generic Knight');

  const lancerDpsVsKnight=sim.attackDamage(lancer,enemyKnight)/UNITS.firelancer.cooldown;
  const knightDpsVsLancer=sim.attackDamage(enemyKnight,lancer)/(UNITS.knight.cooldown||1.2);
  const ttkKnight=enemyKnight.maxHp/lancerDpsVsKnight;
  const ttkLancer=lancer.maxHp/knightDpsVsLancer;
  assert.ok(ttkLancer<ttkKnight,`Standard Imperial Knight must beat Imperial Fire Lancer 1v1 (${ttkLancer.toFixed(2)}s vs ${ttkKnight.toFixed(2)}s)`);

  // Imperial Gunpowder (+20%) reflected in both combat damage and HUD inspector ATK
  const simNoGun=cleanSim('jade',706);
  simNoGun.players[0].age=3;
  const flPlain=simNoGun.addUnit('firelancer',0,0,0);
  const dummy=simNoGun.addUnit('archer',1,4,0);
  const dmgPlain=simNoGun.attackDamage(flPlain,dummy);
  const atkPlain=unitAttackValue(simNoGun,flPlain);
  simNoGun.players[0].tech.imperialGunpowder=1;
  const dmgGun=simNoGun.attackDamage(flPlain,dummy);
  const atkGun=unitAttackValue(simNoGun,flPlain);
  assert.ok(Math.abs(dmgGun/dmgPlain-1.2)<.03,`Imperial Gunpowder should add +20% damage, ratio=${(dmgGun/dmgPlain).toFixed(3)}`);
  assert.ok(atkGun>atkPlain,'HUD ATK reflects Imperial Gunpowder boost');
  assert.match(TECHS.imperialGunpowder.desc,/\+20%/);
});
