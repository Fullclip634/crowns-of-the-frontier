import {UNITS} from './data.js';

/**
 * Playable Auto-Casting Hero Generals (1 sculpted Blender champion per civilization!)
 * + Super-Powered World Wonders (permanent kingdom-wide blessings + enemy alerts).
 *
 * Hero skills are SMART AUTO-CAST by default (zero babysitting needed on phones or desktop!),
 * with optional manual trigger & auto-cast toggle whenever the player selects their Hero.
 */

export const HERO_BY_FACTION=Object.freeze({
  alder:'hero_alder',
  sun:'hero_sun',
  raven:'hero_raven',
  iron:'hero_iron',
  jade:'hero_jade',
});

export const HERO_DEFS=Object.freeze({
  hero_alder:{
    faction:'alder',
    title:'Marshal Rowan',
    roleTitle:'Royal Vanguard General',
    color:0x52c4d6,
    skills:[
      {id:'rally',name:'War Horn Rally',cooldown:24,desc:'Automatically blows the royal horn in combat: +30% attack, +3 armor & +75 heal to nearby allied soldiers for 10s.'},
      {id:'shieldwall',name:'Aegis Bastion',cooldown:30,desc:'Projects a golden shield aura reducing incoming damage for nearby allies and healing nearby damaged walls.'},
    ],
  },
  hero_sun:{
    faction:'sun',
    title:'Sun Sovereign',
    roleTitle:'Emir of the Golden Dawn',
    color:0xf2c14e,
    skills:[
      {id:'solarblessing',name:'Solar Blessing',cooldown:24,desc:'Heals nearby allies for +95 HP and grants +25% attack speed for 10s.'},
      {id:'arrowstorm',name:'Sunfire Volley',cooldown:28,desc:'Unleashes a golden barrage striking up to 6 nearby enemies for heavy burning damage.'},
    ],
  },
  hero_raven:{
    faction:'raven',
    title:'Shadow Khan',
    roleTitle:'Highland Warlord',
    color:0xd86f86,
    skills:[
      {id:'bloodlust',name:'Warband Charge',cooldown:22,desc:'Frenzies nearby allies: +35% attack damage and +25% movement speed for 9s.'},
      {id:'whirlwind',name:'Storm of Axes',cooldown:26,desc:'Cleaves every enemy around the Khan in a sweeping crimson shockwave.'},
    ],
  },
  hero_iron:{
    faction:'iron',
    title:'Forgemaster Borin',
    roleTitle:'Lord of the Anvil',
    color:0xe57a44,
    skills:[
      {id:'earthshaker',name:'Earthshaker Slam',cooldown:24,desc:'Smashes the ground with molten runes, shattering enemy armor, structures, and surrounding infantry.'},
      {id:'anvilfortify',name:'Ironclad Forge',cooldown:28,desc:'Grants +5 armor to nearby allies and repairs nearby friendly siege engines & structures.'},
    ],
  },
  hero_jade:{
    faction:'jade',
    title:'Dragon Marshal',
    roleTitle:'Imperial Jade Commander',
    color:0x32c48d,
    skills:[
      {id:'dragonbanner',name:'Dragon Banner',cooldown:24,desc:'Raises the Imperial Standard: +30% attack & rapid firing speed to all nearby allies for 10s.'},
      {id:'fireworkbarrage',name:'Imperial Firestorm',cooldown:26,desc:'Launches explosive black-powder shells blasting clustered enemies and fortifications.'},
    ],
  },
});

export const WONDER_POWERS=Object.freeze({
  alder:{
    name:'Cathedral of the Dawn',
    short:'Global Regen + Wall Armor',
    desc:'All living friendly units regenerate +6 HP/s anywhere on the map; walls & keeps gain +4 armor.',
    color:'#66cec0',
  },
  sun:{
    name:'Golden Sun Spire',
    short:'+18 Gold/s · +12 Food/s · Fast Train',
    desc:'Generates +18 Gold and +12 Food every second and accelerates unit training by +25%.',
    color:'#e8be5a',
  },
  raven:{
    name:'Obsidian War Obelisk',
    short:'+22% Attack · +14% Speed',
    desc:'All friendly warriors deal +22% attack damage and march +14% faster.',
    color:'#d97c93',
  },
  iron:{
    name:'Colossus of the Forge',
    short:'+35% Siege Power · +35% Heavy HP',
    desc:'Siege engines and heavy units deal +35% building damage and repair automatically.',
    color:'#e27c4b',
  },
  jade:{
    name:'Heavenly Dragon Pagoda',
    short:'+25% Fire Rate · Imperial Rally',
    desc:'All ranged, gunpowder & siege units fire +25% faster and nearby troops radiate golden vitality.',
    color:'#38cc94',
  },
});

export function isHeroUnit(entity){
  return Boolean(entity&&entity.kind==='unit'&&HERO_DEFS[entity.type]);
}

export function heroTypeForFaction(faction='alder'){
  return HERO_BY_FACTION[faction]||'hero_alder';
}

export function wonderPowerFor(sim,owner){
  const p=sim?.players?.[owner];
  if(!p||p.defeated)return null;
  const hasWonder=sim.owned(owner,'building','wonder').some(b=>b.hp>0&&b.progress>=1);
  if(!hasWonder)return null;
  return {faction:p.faction||'alder',...(WONDER_POWERS[p.faction]||WONDER_POWERS.alder)};
}

/** Spawns a faction's Hero General near their Keep or Town Center (at most 1 alive per kingdom). */
export function spawnHeroGeneral(sim,owner){
  const p=sim.players?.[owner];
  if(!p||p.defeated||p.dormant)return null;
  const hType=heroTypeForFaction(p.faction);
  if(sim.owned(owner,'unit').some(u=>u.hp>0&&HERO_DEFS[u.type]))return null;
  const anchor=sim.owned(owner,'building','keep')[0]||sim.owned(owner,'building','towncenter')[0]||(p.start?{x:p.start.x,z:p.start.z,r:4}:null);
  if(!anchor)return null;
  for(let i=0;i<16;i++){
    const a=i*.65,dist=(anchor.r||4)+3.5+Math.floor(i/8)*2.5;
    const x=anchor.x+Math.cos(a)*dist,z=anchor.z+Math.sin(a)*dist;
    if(Math.abs(x)>sim.halfWorld-4||Math.abs(z)>sim.halfWorld-4||sim.isWater(x,z))continue;
    if(sim.barriers?.some(b=>Math.hypot(b.x-x,b.z-z)<b.r+1.8))continue;
    const u=sim.addUnit(hType,owner,x,z);
    if(u){
      const def=HERO_DEFS[hType];
      u.displayName=def.title;
      u.heroLevel=1;
      u.heroXp=0;
      u.autoCast=true;
      u.skillCooldowns=[0,0];
      return u;
    }
  }
  return null;
}

/** Awards Hero XP from combat kills and promotes up to Level 5 with growing power! */
export function awardHeroExperience(sim,killer,victim){
  if(!killer||!victim||killer.owner<0)return;
  // Direct kill OR any nearby friendly hero within 16m learns from the battle
  const heroes=sim.owned(killer.owner,'unit').filter(u=>u.hp>0&&HERO_DEFS[u.type]);
  for(const hero of heroes){
    const direct=hero.id===killer.id;
    const near=Math.hypot(hero.x-victim.x,hero.z-victim.z)<18;
    if(!direct&&!near)continue;
    const xpGain=(victim.kind==='building'?35:UNITS[victim.type]?.role==='siege'?28:14)*(direct?1.4:0.65);
    hero.heroXp=(hero.heroXp||0)+xpGain;
    hero.heroLevel=hero.heroLevel||1;
    const nextThreshold=hero.heroLevel*90;
    if(hero.heroLevel<5&&hero.heroXp>=nextThreshold){
      hero.heroXp-=nextThreshold;
      hero.heroLevel++;
      hero.maxHp=Math.round(hero.maxHp*1.16);
      hero.hp=Math.min(hero.maxHp,hero.hp+Math.round(hero.maxHp*.35));
      sim.emit('hero-levelup',{entity:hero,owner:hero.owner,level:hero.heroLevel,title:HERO_DEFS[hero.type].title});
    }
  }
}

/** Triggers a Hero's skill (called either automatically by smart AI or manually by player tap). */
export function triggerHeroSkill(sim,hero,slot=0){
  if(!hero||hero.hp<=0)return false;
  const def=HERO_DEFS[hero.type];
  const skill=def?.skills?.[slot];
  if(!skill)return false;
  hero.skillCooldowns??=[0,0];
  if((hero.skillCooldowns[slot]||0)>0)return false;

  const lv=hero.heroLevel||1;
  const power=1+(lv-1)*.18;
  const radius=14;
  const until=sim.time+10;
  let affected=0;

  if(['rally','solarblessing','bloodlust','dragonbanner','shieldwall','anvilfortify'].includes(skill.id)){
    for(const u of sim.entities){
      if(u.hp<=0||u.embarked)continue;
      if(u.kind==='unit'&&sim.allied(hero.owner,u.owner)&&Math.hypot(u.x-hero.x,u.z-hero.z)<=radius){
        if(skill.id==='rally'){
          u.buffAttackUntil=Math.max(u.buffAttackUntil||0,until);
          u.buffArmorUntil=Math.max(u.buffArmorUntil||0,until);
          u.hp=Math.min(u.maxHp,u.hp+Math.round(75*power));
        }else if(skill.id==='solarblessing'){
          u.buffAttackUntil=Math.max(u.buffAttackUntil||0,until);
          u.buffHasteUntil=Math.max(u.buffHasteUntil||0,until);
          u.hp=Math.min(u.maxHp,u.hp+Math.round(95*power));
        }else if(skill.id==='bloodlust'){
          u.buffAttackUntil=Math.max(u.buffAttackUntil||0,until);
          u.buffSpeedUntil=Math.max(u.buffSpeedUntil||0,until);
        }else if(skill.id==='dragonbanner'){
          u.buffAttackUntil=Math.max(u.buffAttackUntil||0,until);
          u.buffHasteUntil=Math.max(u.buffHasteUntil||0,until);
        }else if(skill.id==='shieldwall'||skill.id==='anvilfortify'){
          u.buffArmorUntil=Math.max(u.buffArmorUntil||0,until);
          u.hp=Math.min(u.maxHp,u.hp+Math.round(55*power));
        }
        affected++;
      }else if((skill.id==='shieldwall'||skill.id==='anvilfortify')&&u.kind==='building'&&u.progress>=1&&sim.allied(hero.owner,u.owner)&&Math.hypot(u.x-hero.x,u.z-hero.z)<=radius+4){
        u.hp=Math.min(u.maxHp,u.hp+Math.round(180*power));
        affected++;
      }
    }
  }else{
    // Offensive shockwave / arrow storm / molten slam / imperial firework barrage!
    const targets=sim.entities
      .filter(e=>e.hp>0&&!e.embarked&&(e.kind==='unit'||e.kind==='building')&&sim.hostile(hero.owner,e.owner)&&Math.hypot(e.x-hero.x,e.z-hero.z)<=radius)
      .sort((a,b)=>Math.hypot(a.x-hero.x,a.z-hero.z)-Math.hypot(b.x-hero.x,b.z-hero.z))
      .slice(0,skill.id==='whirlwind'?8:6);
    if(!targets.length)return false;
    const dmg=Math.round((skill.id==='earthshaker'?58:skill.id==='fireworkbarrage'?52:46)*power);
    for(const t of targets){
      const mult=t.kind==='building'&&(skill.id==='earthshaker'||skill.id==='fireworkbarrage')?2.0:1.0;
      sim.hurt(t,Math.round(dmg*mult),hero);
      affected++;
    }
  }

  if(!affected)return false;
  hero.skillCooldowns[slot]=skill.cooldown;
  sim.emit('hero-skill',{
    entity:hero,owner:hero.owner,x:hero.x,z:hero.z,
    skillId:skill.id,skillName:skill.name,heroTitle:def.title,
    color:def.color,radius,offensive:['arrowstorm','whirlwind','earthshaker','fireworkbarrage'].includes(skill.id),
  });
  return true;
}

/**
 * Ticks Auto-Casting Hero Generals, Super-Powered World Wonders, and Boiling-Oil Gatehouses!
 * Runs smoothly on a lightweight cadence (0.5s check) with zero GC churn.
 */
export function tickHeroesAndWonders(sim,dt){
  // 1. Tick Hero cooldowns & Smart Auto-Cast (ON by default — zero manual clicking needed!)
  sim._heroScanClock=(sim._heroScanClock||0)+dt;
  const doScan=sim._heroScanClock>=.5;
  if(doScan)sim._heroScanClock=0;

  for(const e of sim.entities){
    if(e.hp<=0||!HERO_DEFS[e.type])continue;
    e.skillCooldowns??=[0,0];
    e.skillCooldowns[0]=Math.max(0,(e.skillCooldowns[0]||0)-dt);
    e.skillCooldowns[1]=Math.max(0,(e.skillCooldowns[1]||0)-dt);
    // Heroes slowly regenerate out of combat
    if(sim.time-(e.lastDamaged??-99)>5&&e.hp<e.maxHp){
      e.hp=Math.min(e.maxHp,e.hp+6*dt);
    }
    if(!doScan||e.autoCast===false||e.embarked)continue;
    // Smart auto-cast trigger: detect nearby active enemies or injured friendly squad
    let nearEnemies=0,nearAllies=0,injuredAllies=0;
    for(const other of sim.entities){
      if(other.hp<=0||other.embarked)continue;
      const d=Math.hypot(other.x-e.x,other.z-e.z);
      if(d>13.5)continue;
      if((other.kind==='unit'||other.kind==='building')&&sim.hostile(e.owner,other.owner))nearEnemies++;
      else if(other.kind==='unit'&&sim.allied(e.owner,other.owner)){
        nearAllies++;
        if(other.hp<other.maxHp*.82)injuredAllies++;
      }
    }
    if(nearEnemies>=2){
      if((e.skillCooldowns[0]||0)<=0&&(nearAllies>=2||injuredAllies>=1||HERO_DEFS[e.type].skills[0].id==='earthshaker')){
        triggerHeroSkill(sim,e,0);
      }else if((e.skillCooldowns[1]||0)<=0&&(nearEnemies>=2||injuredAllies>=2)){
        triggerHeroSkill(sim,e,1);
      }
    }
  }

  // 2. Super-Powered World Wonders (runs every 1.0s)
  sim._wonderClock=(sim._wonderClock||0)+dt;
  if(sim._wonderClock>=1.0){
    const step=sim._wonderClock;
    sim._wonderClock=0;
    sim._announcedWonders??={};
    for(let owner=0;owner<sim.players.length;owner++){
      const pl=sim.players[owner];
      if(!pl||pl.defeated)continue;
      const wonders=sim.owned(owner,'building','wonder').filter(b=>b.hp>0);
      if(!wonders.length)continue;
      const w=wonders[0];
      if(w.progress<1&&!sim._announcedWonders[`start:${owner}:${w.id}`]){
        sim._announcedWonders[`start:${owner}:${w.id}`]=true;
        const wp=WONDER_POWERS[pl.faction]||WONDER_POWERS.alder;
        sim.emit('wonder-started',{owner,name:pl.name,faction:pl.faction,wonderName:wp.name,x:w.x,z:w.z});
      }
      if(w.progress>=1){
        if(!sim._announcedWonders[`done:${owner}:${w.id}`]){
          sim._announcedWonders[`done:${owner}:${w.id}`]=true;
          const wp=WONDER_POWERS[pl.faction]||WONDER_POWERS.alder;
          sim.emit('wonder-completed',{owner,name:pl.name,faction:pl.faction,wonderName:wp.name,power:wp.short,x:w.x,z:w.z});
        }
        // Apply live continuous Wonder Super-Powers!
        if(pl.faction==='sun'){
          pl.resources.gold+=18*step;
          pl.resources.food+=12*step;
        }else if(pl.faction==='alder'){
          for(const u of sim.owned(owner,'unit')){
            if(u.hp>0&&u.hp<u.maxHp&&!['ram','catapult','trebuchet','galley','warship','transport','fishingboat'].includes(u.type)){
              u.hp=Math.min(u.maxHp,u.hp+6*step);
            }
          }
        }else if(pl.faction==='iron'){
          for(const u of sim.owned(owner,'unit')){
            if(u.hp>0&&u.hp<u.maxHp&&['ram','catapult','trebuchet','ironbreaker'].includes(u.type)){
              u.hp=Math.min(u.maxHp,u.hp+12*step);
            }
          }
        }else if(pl.faction==='jade'){
          for(const u of sim.owned(owner,'unit')){
            if(u.hp>0&&u.hp<u.maxHp&&Math.hypot(u.x-w.x,u.z-w.z)<32){
              u.hp=Math.min(u.maxHp,u.hp+8*step);
            }
          }
        }
      }
    }
  }

  // 3. Boiling-Oil Gatehouses (Castle Age tech `boilingOil` pours molten oil on hostile attackers at the gate!)
  sim._oilClock=(sim._oilClock||0)+dt;
  if(sim._oilClock>=2.2){
    sim._oilClock=0;
    for(const gate of sim.entities){
      if(gate.hp<=0||gate.kind!=='building'||gate.type!=='gate'||gate.progress<1)continue;
      const pl=sim.players?.[gate.owner];
      if(!pl||!(pl.tech?.boilingOil>0))continue;
      const attackers=sim.entities.filter(u=>u.hp>0&&u.kind==='unit'&&!u.embarked&&sim.hostile(gate.owner,u.owner)&&Math.hypot(u.x-gate.x,u.z-gate.z)<=5.6);
      if(!attackers.length)continue;
      for(const foe of attackers){
        sim.hurt(foe,UNITS[foe.type]?.role==='siege'?36:24,gate);
      }
      sim.emit('boiling-oil',{owner:gate.owner,x:gate.x,z:gate.z,count:attackers.length});
    }
  }
}
