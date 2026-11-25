import {BUILDINGS,UNITS} from './data.js';
import {mechanicalUnit} from './maintenance.js';

export const DECAL_COLORS=Object.freeze({
  move:0x7cf0bc,
  attack:0xff5a52,
  gather:0xf4c55b,
  patrol:0x5ec6ff,
  guard:0x7ab8ff,
  repair:0xf0c975,
  heal:0x7ef5a2,
  rally:0xe8c776,
  flare:0xffe066,
  danger:0xff4b4b,
});

export const MINIMAP_FILTERS=Object.freeze([
  {id:'all',label:'All',title:'Standard minimap (terrain, resources, buildings, units)'},
  {id:'combat',label:'War',title:'Combat view (emphasize armies, fortifications & alerts)'},
  {id:'economy',label:'Eco',title:'Economy view (emphasize resources, villagers & trade)'},
]);

const HIGH_VALUE_BUILDINGS=new Set(['towncenter','keep','bombard','wonder','market','blacksmith','monastery','dock']);
const RALLY_BUILDINGS=new Set(Object.values(UNITS).flatMap(u=>u.at||[]));
const ECON_BUILDINGS=new Set(['towncenter','mill','camp','mine','market','dock','farm','house']);
const MILITARY_BUILDINGS=new Set(['barracks','range','stable','workshop','tower','bombard','keep','wall','gate','monastery','towncenter']);

/** High-value completed buildings require a 2-click confirm to prevent accidental deletion. */
export function needsDemolishConfirm(entity){
  return !!(entity&&entity.kind==='building'&&entity.progress>=1&&HIGH_VALUE_BUILDINGS.has(entity.type));
}

/** Resolve desktop semantic cursor mode from active selection, hover target, and modal command state. */
export function resolveCursorState(sim,selectedEntities=[],target=null,modes={}){
  if(modes.pingMode)return 'ping';
  if(modes.buildType)return 'build';
  if(modes.unloadMode)return 'embark';
  if(modes.attackMove)return 'attack';
  if(modes.tacticalMode==='patrol')return 'patrol';
  if(modes.tacticalMode==='guard')return 'guard';

  const mine=selectedEntities.filter(e=>e&&e.owner===0&&e.hp>0);
  if(!mine.length)return 'default';
  const units=mine.filter(e=>e.kind==='unit');
  if(!units.length){
    return mine.some(e=>e.kind==='building'&&RALLY_BUILDINGS.has(e.type))?'rally':'default';
  }
  if(!target||target.hp<=0)return 'default';

  const hasWorkers=units.some(e=>e.type==='villager');
  const hasBoats=units.some(e=>e.type==='fishingboat');
  const hasMonks=units.some(e=>e.type==='monk');
  const hasLand=units.some(e=>!UNITS[e.type]?.naval);
  const hasMilitary=units.some(e=>e.type!=='villager'&&e.type!=='fishingboat'&&e.type!=='cart');

  if(target.owner>=0&&target.owner!==0&&sim?.hostile?.(0,target.owner)){
    return hasMilitary||hasWorkers?'attack':'default';
  }
  if(target.kind==='resource'){
    if(target.water)return hasBoats?'gather':'default';
    return hasWorkers?'gather':'default';
  }
  if(target.owner===0&&target.kind==='building'){
    if(target.type==='farm'&&hasWorkers)return 'gather';
    if(hasWorkers&&(target.progress<1||target.hp<target.maxHp))return 'repair';
    if(target.type==='towncenter'||target.type==='keep'||target.type==='tower'||target.type==='bombard'){
      return hasWorkers?'embark':'default';
    }
  }
  if(target.owner===0&&target.kind==='unit'){
    if(target.type==='transport'&&hasLand)return 'embark';
    if(hasWorkers&&mechanicalUnit(target)&&target.hp<target.maxHp)return 'repair';
    if(hasMonks&&!mechanicalUnit(target)&&target.hp<target.maxHp&&!UNITS[target.type]?.naval)return 'heal';
  }
  return 'default';
}

/** Resolve visual ground command decal type for an issued order. */
export function resolveCommandDecalKind(sim,selectedEntities=[],target=null,modes={}){
  if(modes.tacticalMode==='patrol')return 'patrol';
  if(modes.tacticalMode==='guard')return 'guard';
  if(modes.attackMove)return 'attack';
  const mine=selectedEntities.filter(e=>e&&e.owner===0&&e.hp>0);
  if(!mine.length)return 'move';
  const units=mine.filter(e=>e.kind==='unit');
  if(!units.length&&mine.some(e=>e.kind==='building'&&RALLY_BUILDINGS.has(e.type)))return 'rally';
  if(target){
    if(target.owner>=0&&target.owner!==0&&sim?.hostile?.(0,target.owner))return 'attack';
    if(target.kind==='resource'||(target.owner===0&&target.type==='farm'))return 'gather';
    if(target.owner===0&&target.kind==='building'&&(target.progress<1||target.hp<target.maxHp))return 'repair';
    if(target.owner===0&&target.kind==='unit'&&units.some(e=>e.type==='monk')&&target.hp<target.maxHp)return 'heal';
  }
  return 'move';
}

/** Decide whether a minimap entity is emphasized, muted, or hidden for the active filter. */
export function minimapFilterStyle(filter,entity){
  if(!filter||filter==='all')return 'normal';
  if(filter==='combat'){
    if(entity.kind==='resource')return 'hidden';
    if(entity.kind==='shrine')return 'normal';
    if(entity.kind==='unit')return (entity.type==='villager'||entity.type==='fishingboat'||entity.type==='cart')?'muted':'highlight';
    if(entity.kind==='building')return MILITARY_BUILDINGS.has(entity.type)?'highlight':'muted';
    return 'muted';
  }
  if(filter==='economy'){
    if(entity.kind==='resource'||entity.kind==='shrine')return 'highlight';
    if(entity.kind==='unit')return (entity.type==='villager'||entity.type==='fishingboat'||entity.type==='cart')?'highlight':'muted';
    if(entity.kind==='building')return ECON_BUILDINGS.has(entity.type)?'highlight':'muted';
    return 'muted';
  }
  return 'normal';
}

/**
 * Lightweight, anti-spam tactical alert & ping manager shared by the HUD banner,
 * Backspace alert-jump hotkey, Minimap ripples, and 3D flare beacons.
 */
export class TacticalAlerts {
  constructor(){
    this.history=[];
    this.ripples=[];
    this.cursor=0;
    this.lastDangerAt=-Infinity;
    this.lastFlareAt=-Infinity;
  }

  clear(){
    this.history.length=0;
    this.ripples.length=0;
    this.cursor=0;
    this.lastDangerAt=-Infinity;
    this.lastFlareAt=-Infinity;
  }

  record(x,z,kind='danger',label='',now=performance.now()){
    if(!Number.isFinite(x)||!Number.isFinite(z))return null;
    if(kind==='danger'){
      // Anti-spam: coalesce rapid combat alerts within 1.4s and 14m
      const recent=this.ripples.find(r=>r.kind==='danger'&&now-r.startedAt<1400&&Math.hypot(r.x-x,r.z-z)<14);
      if(recent)return recent;
      this.lastDangerAt=now;
    }else if(kind==='flare'){
      if(now-this.lastFlareAt<750)return null;
      this.lastFlareAt=now;
    }
    const entry={x,z,kind,label,at:now};
    this.history.unshift(entry);
    if(this.history.length>8)this.history.length=8;
    this.cursor=0;
    const ripple={x,z,kind,startedAt:now,duration:kind==='flare'?5200:4600};
    this.ripples.push(ripple);
    if(this.ripples.length>12)this.ripples.shift();
    return entry;
  }

  latest(kind=null){
    if(!kind)return this.history[0]||null;
    return this.history.find(item=>item.kind===kind)||null;
  }

  cycleNext(){
    if(!this.history.length)return null;
    const item=this.history[this.cursor%this.history.length];
    this.cursor=(this.cursor+1)%this.history.length;
    return item;
  }

  activeRipples(now=performance.now()){
    let write=0;
    for(let i=0;i<this.ripples.length;i++){
      const r=this.ripples[i];
      if(now-r.startedAt<r.duration)this.ripples[write++]=r;
    }
    this.ripples.length=write;
    return this.ripples;
  }
}
