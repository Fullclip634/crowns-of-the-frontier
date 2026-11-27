import {AGES,BUILDINGS,FACTIONS,RESOURCE,UNITS} from './data.js';
import {GARRISONS,garrisonArrows,garrisonCount} from './garrison.js';
import {wallArmorBonus,wallDisplayName,wallTier} from './fortified-walls.js';
import {uiVectorIcon} from './ui-icons.js';

const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

export const SHRINE_CAPTURE_SECONDS=18;

const RESOURCE_LABELS=Object.freeze({
  wood:'Timber',
  gold:'Gold ore',
  stone:'Stone quarry',
  food:'Berry grove',
});

const ROLE_CALLOUTS=Object.freeze({
  spearman:'3× vs Cavalry',
  skirmisher:'2.2× vs Archers · Zero Gold',
  ram:'Bonus vs Buildings',
  catapult:'Castle Age Splash Siege · 4m Radius',
  trebuchet:'28m Fire Boulder Siege · 5.2m Splash',
  sentinel:'Heavy Shield Infantry',
  marksman:'2 Armor Piercing',
  outrider:'2× vs Villagers',
  ironbreaker:'3 Armor Piercing · 1.5× vs Buildings',
  chukonu:'Short-Range 3-Bolt Volley',
  firelancer:'Explosive Gunpowder Cone Splash',
  hero_alder:'Auto-Cast Hero · War Horn & Aegis',
  hero_sun:'Auto-Cast Hero · Solar Heal & Volley',
  hero_raven:'Auto-Cast Hero · Bloodlust & Axes',
  hero_iron:'Auto-Cast Hero · Earthshaker & Forge',
  hero_jade:'Auto-Cast Hero · Dragon Banner & Firestorm',
  monk:'Auto-Heals Living Allies',
  scout:'Wide Recon Vision',
  warship:'Bombards Fortifications',
  galley:'Anti-Ship Arrow Vessel',
  fishingboat:'Harvests Fish Shoals',
});

/** Determine visual affiliation category for portraits, bars, and rings. */
export function entityAffiliation(sim,e){
  if(!e)return 'neutral';
  if(e.kind==='resource')return 'resource';
  if(e.kind==='shrine'){
    if(e.owner===0)return 'mine';
    if(e.owner>=0&&sim?.hostile?.(0,e.owner))return 'enemy';
    if(e.owner>=0&&sim?.allied?.(0,e.owner))return 'ally';
    return 'shrine';
  }
  if(e.owner===0)return 'mine';
  if(e.owner>=0&&sim?.allied?.(0,e.owner))return 'ally';
  if(e.owner>=0)return 'enemy';
  return 'neutral';
}

export function entityDisplayName(sim,e){
  if(!e)return '';
  if(e.displayName)return e.displayName;
  if(e.water&&e.kind==='resource')return 'Fish shoal';
  if(e.kind==='resource')return RESOURCE_LABELS[e.type]||RESOURCE[e.type]||e.type;
  if(e.kind==='shrine')return 'Ancient shrine';
  if(e.kind==='building'&&(e.type==='wall'||e.type==='gate'))return wallDisplayName(sim,e);
  if(UNITS[e.type])return UNITS[e.type].name;
  if(BUILDINGS[e.type])return BUILDINGS[e.type].name;
  return e.type;
}

/** Normalized [0..1] progress ratio for the inspector & world bars. */
export function entityBarRatio(e){
  if(!e)return 0;
  if(e.kind==='resource'){
    const initial=Math.max(1,e.initialAmount||e.amount||1);
    return Math.max(0,Math.min(1,(e.amount||0)/initial));
  }
  if(e.kind==='shrine'){
    if(e.owner>=0)return 1;
    return Math.max(0,Math.min(1,(e.progress||0)/SHRINE_CAPTURE_SECONDS));
  }
  return Math.max(0,Math.min(1,(e.hp||0)/Math.max(1,e.maxHp||1)));
}

/** Live primary meter text shown beneath the inspector bar. */
export function entityStatusText(sim,e){
  if(!e)return '';
  if(e.kind==='resource'){
    const current=Math.max(0,Math.round(e.amount||0));
    const initial=Math.max(current,Math.round(e.initialAmount||current));
    const unitLabel=e.water?'Food':(RESOURCE[e.type]||e.type);
    const visible=sim?.isVisible?.(e.x,e.z);
    return visible?`${current} / ${initial} ${unitLabel}`:`${current} / ${initial} ${unitLabel} · last seen`;
  }
  if(e.kind==='shrine'){
    if(e.owner>=0){
      const label=e.owner===0?'Controlled by You':sim?.allied?.(0,e.owner)?`Controlled by ${sim.players[e.owner]?.name||'Ally'}`:`Controlled by ${sim.players[e.owner]?.name||'Enemy'}`;
      return `${label} · +Gold`;
    }
    const pct=Math.round(entityBarRatio(e)*100);
    return pct>0?`Capturing ${pct}% (${Math.max(0,Math.ceil(SHRINE_CAPTURE_SECONDS-(e.progress||0)))}s left)`:'Neutral · Stand military within 7m';
  }
  const hp=Math.round(e.hp||0),max=Math.round(e.maxHp||1);
  if(e.kind==='building'&&e.progress<1)return `${hp} / ${max} HP · Building ${Math.floor(e.progress*100)}%`;
  return `${hp} / ${max} HP`;
}

/** Count active friendly villagers/boats currently harvesting a resource or farm. */
export function activeHarvesterCount(sim,site){
  if(!sim||!site)return 0;
  let count=0;
  const units=typeof sim.candidatesFor==='function'?sim.candidatesFor('unit'):(sim.entities||[]);
  for(const u of units){
    if(u.hp>0&&u.owner===0&&!u.embarked&&u.order?.type==='gather'&&u.order.target===site.id)count++;
  }
  return count;
}

/** Compute upgraded attack power for any unit (friendly, allied, or enemy). */
export function unitAttackValue(sim,e){
  const d=UNITS[e.type];
  if(!d||!d.damage)return 0;
  const p=sim?.players?.[e.owner]||{age:0,faction:'alder',tech:{}};
  const tech=p.tech||{};
  const faction=FACTIONS[p.faction]||FACTIONS.alder;
  const rangedLand=d.role==='ranged'&&!d.naval;
  const meleeLand=!d.naval&&d.role!=='ranged'&&d.role!=='siege';
  return Math.round(
    d.damage
    *(1+(p.age||0)*.12)
    *(rangedLand?1+(tech.ranged||0)*.2:meleeLand?1+(tech.attack||0)*.2:1)
    *(d.naval?1+(tech.seamanship||0)*.2:1)
    *(d.role==='cavalry'?(faction.cavalry||1):1)
    *(d.role==='siege'?(1+(tech.siegecraft||0)*.15):1)
    *((tech.imperialGunpowder||0)>0&&['firelancer','chukonu','trebuchet'].includes(e.type)?1.2:1)
    *(e.heroLevel>1?1+(e.heroLevel-1)*.16:1)
    *(!d.hero&&e.vetRank?1+e.vetRank*.10:1)
  );
}

/** Compute effective movement speed for any unit. */
export function unitSpeedValue(sim,e){
  const d=UNITS[e.type];
  if(!d)return '0';
  const p=sim?.players?.[e.owner]||{faction:'alder',tech:{}};
  const tech=p.tech||{};
  const cav=d.role==='cavalry'?(1+(tech.husbandry||0)*.2)*(p.faction==='raven'?1.15:1)*(1+(tech.raidingParties||0)*.1):1;
  const naval=d.naval?(1+(tech.seamanship||0)*.15):1;
  const siege=d.role==='siege'?(1+(tech.siegecraft||0)*.15):1;
  const worker=d.role==='worker'?(1+(tech.wheelbarrow||0)*.15):1;
  const healer=d.role==='healer'?(1+(tech.sanctuary||0)*.25):1;
  return (d.speed*cav*naval*siege*worker*healer).toFixed(1).replace(/\.0$/,'');
}

/** Render sculpted attribute chips for ANY selected entity (unit, building, resource, shrine). */
export function inspectorStatsMarkup(sim,e){
  if(!e)return '';
  const chips=[];
  const add=(icon,label,val,title,cls='')=>chips.push(`<span class="${cls}" title="${esc(title)}">${uiVectorIcon(icon)}${label}<b>${esc(val)}</b></span>`);

  if(e.kind==='unit'){
    const d=UNITS[e.type];
    if(!d)return '';
    const p=sim?.players?.[e.owner]||{age:0,tech:{}};
    const atk=unitAttackValue(sim,e);
    const arm=typeof sim?.unitArmor==='function'?sim.unitArmor(e):(d.armor||0);
    const rng=d.range?(d.range+(d.role==='ranged'&&!d.naval?(p.tech?.ranged||0):0)):0;
    if(atk>0)add('swords','ATK',atk,'Attack damage');
    else if(e.type==='monk')add('church','HEAL',`${Math.round(12*(1+(p.tech?.sanctuary||0)*.4))}/s`,'Healing rate');
    else if(e.type==='transport')add('anchor','LOAD',`${e.passengers?.length||0}/${d.capacity||8}`,'Embarked troops');
    add('shield','ARM',arm,'Armor rating');
    if(rng>0)add('target','RNG',`${rng}m`,'Action range');
    add('wind','SPD',unitSpeedValue(sim,e),'Movement speed');
    add('spyglass','VIS',`${typeof sim?.unitVision==='function'?sim.unitVision(e):(d.vision||15)}m`,'Line of sight');
    if(e.owner===0&&e.type!=='villager'&&e.type!=='fishingboat'&&e.type!=='cart'){
      const stanceIcon=e.stance==='hold'?'shield-check':e.stance==='defensive'?'shield':'swords';
      const stanceLabel=e.stance==='hold'?'Hold':e.stance==='defensive'?'Defensive':'Engage';
      add(stanceIcon,'STANCE',stanceLabel,'Current combat stance','stat-stance');
    }
    if(e.vetRank>0){
      const vetNames=['','★ Veteran','★★ Elite','★★★ Champion'];
      chips.push(`<span class="stat-tag stat-veteran vet-tier-${e.vetRank}" title="${e.kills||0} confirmed kills · +${e.vetRank*10}% ATK & HP">${vetNames[e.vetRank]} (${e.kills||0})</span>`);
    }
    const callout=ROLE_CALLOUTS[e.type];
    if(callout)chips.push(`<span class="stat-tag" title="Unit specialty">${esc(callout)}</span>`);
    return `<div class="unit-attributes">${chips.join('')}</div>`;
  }

  if(e.kind==='building'){
    const d=BUILDINGS[e.type];
    if(!d)return '';
    const p=sim?.players?.[e.owner]||{age:0,tech:{}};
    const fort=p.tech?.fortification||0;
    const isMineOrAlly=e.owner===0||sim?.allied?.(0,e.owner);
    const arm=1+wallArmorBonus(sim,e);
    if(d.damage&&e.progress>=1){
      const dmg=Math.round(d.damage*(1+fort*.15));
      const arrows=isMineOrAlly&&GARRISONS[e.type]?garrisonArrows(sim,e):0;
      const volley=(d.volley||1)+arrows;
      const rng=d.range+(['tower','keep','bombard'].includes(e.type)?(p.tech?.arrowslits||0)*2:0);
      add('swords','ATK',volley>1?`${dmg}×${volley}`:dmg,'Building attack & arrows per volley');
      add('target','RNG',`${rng}m`,'Defensive firing range');
    }
    add('shield','ARM',arm,'Building armor (higher against arrows)');
    if(GARRISONS[e.type]){
      const cap=GARRISONS[e.type].capacity;
      const val=isMineOrAlly?`${garrisonCount(sim,e)}/${cap}`:`Cap ${cap}`;
      add('castle','GARR',val,'Villager shelter capacity');
    }
    if(d.cap)add('users-round','POP',`+${d.cap}`,'Population capacity provided');
    if(d.vision)add('spyglass','VIS',`${d.vision}m`,'Sight radius');
    if(e.type==='farm'){
      const farmers=isMineOrAlly?activeHarvesterCount(sim,e):0;
      add('wheat','FOOD','Renewable','Renewable food source');
      if(isMineOrAlly)add('user-round','WORKERS',farmers,'Villagers currently farming');
    }
    if(d.drop?.length){
      const drops=d.drop.length>=4?'All':d.drop.map(r=>r[0].toUpperCase()+r.slice(1)).join('·');
      add('landmark','DROP',drops,'Accepted resource drop-off');
    }
    if(e.type==='wall'||e.type==='gate'){
      const tier=wallTier(sim,e);
      const label=tier==='palisade'?'Wooden Palisade':tier==='fortified'?'Fortified Stone':'Stone Masonry';
      chips.push(`<span class="stat-tag">${label}</span>`);
    }else if(Number.isFinite(p.age)){
      chips.push(`<span class="stat-tag">${esc(AGES[p.age]||AGES[0])}</span>`);
    }
    return `<div class="unit-attributes">${chips.join('')}</div>`;
  }

  if(e.kind==='resource'){
    const icon=e.water?'fish':e.type;
    const typeName=e.water?'Food':(RESOURCE[e.type]||e.type);
    add(icon,'TYPE',typeName,'Resource yielded');
    add(e.water?'sailboat':'user-round','GATHER',e.water?'Fishing boat':'Villager','Unit required to harvest');
    if(sim?.isVisible?.(e.x,e.z)){
      const working=activeHarvesterCount(sim,e);
      add('pickaxe','ACTIVE',working,'Your units currently gathering here');
    }else{
      chips.push('<span class="stat-tag">Explored Fog</span>');
    }
    return `<div class="unit-attributes">${chips.join('')}</div>`;
  }

  if(e.kind==='shrine'){
    add('coins','YIELD','Gold','Generates steady gold while controlled');
    add('target','ZONE','7m','Capture perimeter radius');
    const state=e.owner===0?'Yours':e.owner>=0?(sim?.allied?.(0,e.owner)?'Allied':'Enemy'):'Neutral';
    add('landmark','CTRL',state,'Current shrine control');
    return `<div class="unit-attributes">${chips.join('')}</div>`;
  }

  return '';
}

/** Eyebrow header string showing affiliation, faction/owner, and age. */
export function inspectorEyebrow(sim,e,listLength=1,buildingGroup=false){
  if(listLength>1)return `${listLength} ${buildingGroup?'BUILDINGS':'UNITS'} SELECTED`;
  if(!e)return 'THE FRONTIER';
  if(e.kind==='resource')return e.water?'COASTAL FISHERY':'NATURAL RESOURCE';
  if(e.kind==='shrine')return 'ANCIENT SHRINE';
  if(e.owner===0){
    const p=sim?.players?.[0];
    return `${FACTIONS[p?.faction]?.name||'YOUR KINGDOM'} · ${AGES[p?.age||0]}`;
  }
  if(e.owner>=0){
    const p=sim?.players?.[e.owner];
    const name=p?.name||FACTIONS[p?.faction]?.name||`Kingdom ${e.owner+1}`;
    const rel=sim?.allied?.(0,e.owner)?'ALLY':'ENEMY';
    return `${name} · ${rel} · ${AGES[p?.age||0]}`;
  }
  return 'THE FRONTIER';
}
