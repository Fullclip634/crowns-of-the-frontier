import {BUILDINGS} from './data.js';

// Three-tier AoE II style wall & gate progression:
//   - Age 1 (Frontier) & Age 2 (Feudal): Wooden Palisade Walls & Palisade Gates (wood-only, low HP)
//   - Age 3 (Castle Age):                Stone Walls & Gatehouses (automatic upgrade from palisade, warm brown stone)
//   - Age 4 (Imperial Age tech):         Fortified Walls & Gatehouses (4,000 base HP, +4 armor, silver ashlar stone)
export const PALISADE_WALL_HP=400;
export const PALISADE_GATE_HP=550;
export const PALISADE_WALL_COST=Object.freeze({wood:8});
export const PALISADE_GATE_COST=Object.freeze({wood:35});
export const PALISADE_WALL_TIME=8;
export const PALISADE_GATE_TIME=14;

export const FORTIFIED_WALL_TECH='fortifiedWall';
export const FORTIFIED_WALL_HP=4000;
export const FORTIFIED_GATE_HP=4000;
export const FORTIFIED_WALL_ARMOR=4;
export const FORTIFIED_GATE_ARMOR=4;

const PALISADE_HP=Object.freeze({wall:PALISADE_WALL_HP,gate:PALISADE_GATE_HP});
const PALISADE_COST=Object.freeze({wall:PALISADE_WALL_COST,gate:PALISADE_GATE_COST});
const PALISADE_TIME=Object.freeze({wall:PALISADE_WALL_TIME,gate:PALISADE_GATE_TIME});
const UPGRADED_HP=Object.freeze({wall:FORTIFIED_WALL_HP,gate:FORTIFIED_GATE_HP});
const UPGRADED_ARMOR=Object.freeze({wall:FORTIFIED_WALL_ARMOR,gate:FORTIFIED_GATE_ARMOR});

// Older saves and lightweight test fixtures may omit the tech table or age.
export function hasFortifiedWalls(sim,owner){
  return (sim?.players?.[owner]?.tech?.[FORTIFIED_WALL_TECH]||0)>0;
}

export function isPalisadeAge(sim,owner){
  const age=sim?.players?.[owner]?.age;
  return typeof age==='number'&&age<2;
}

export function isFortifiable(entity){
  return !!entity&&entity.kind==='building'&&Object.hasOwn(UPGRADED_HP,entity.type);
}

export function isFortified(sim,entity){
  return isFortifiable(entity)&&hasFortifiedWalls(sim,entity.owner);
}

export function wallTierForOwner(sim,owner){
  if(hasFortifiedWalls(sim,owner))return 'fortified';
  if(isPalisadeAge(sim,owner))return 'palisade';
  return 'stone';
}

export function wallTier(sim,entity){
  if(!isFortifiable(entity))return 'stone';
  return wallTierForOwner(sim,entity.owner);
}

export function wallBuildCost(sim,owner,type){
  if(Object.hasOwn(PALISADE_COST,type)&&wallTierForOwner(sim,owner)==='palisade')return PALISADE_COST[type];
  return BUILDINGS[type]?.cost||{};
}

export function wallBuildTime(sim,owner,type){
  if(Object.hasOwn(PALISADE_TIME,type)&&wallTierForOwner(sim,owner)==='palisade')return PALISADE_TIME[type];
  return BUILDINGS[type]?.time||1;
}

export function wallDisplayName(sim,entityOrType,owner=0){
  const type=typeof entityOrType==='string'?entityOrType:entityOrType?.type;
  const who=typeof entityOrType==='string'?owner:(entityOrType?.owner??owner);
  if(!Object.hasOwn(UPGRADED_HP,type))return BUILDINGS[type]?.name||type;
  const tier=wallTierForOwner(sim,who);
  if(tier==='palisade')return type==='wall'?'Palisade wall':'Palisade gate';
  if(tier==='fortified')return type==='wall'?'Fortified wall':'Fortified gatehouse';
  return BUILDINGS[type].name;
}

// Base HP before faction / Masonry multipliers. A fully upgraded Alder wall is
// 4000 * 1.2 * (1 + 3 * .3) = 9120, still below the Wonder's 5000 *base* HP.
export function wallBaseHP(sim,entity){
  if(!entity||entity.kind!=='building')return 0;
  if(!isFortifiable(entity))return BUILDINGS[entity.type]?.hp||0;
  const tier=wallTier(sim,entity);
  if(tier==='fortified')return UPGRADED_HP[entity.type];
  if(tier==='palisade')return PALISADE_HP[entity.type];
  return BUILDINGS[entity.type]?.hp||0;
}

// Buildings use a flat 1 armor (5 against ranged). Fortified masonry adds a
// real, measurable reduction on top of the larger health pool.
export function wallArmorBonus(sim,target){
  return isFortified(sim,target)?UPGRADED_ARMOR[target.type]:0;
}

// Connector silhouette and tint per wall tier.
export const WALL_TIER_STYLE=Object.freeze({
  palisade:Object.freeze({height:3.18,depth:.66,capHeight:.34,capY:3.20,bodyY:1.59,foundationDepth:.90,color:0xb0a089,foundationColor:0x8c7e6a,roughness:.95}),
  stone:Object.freeze({height:3.55,depth:1.47,capHeight:.85,capY:3.65,bodyY:1.67,foundationDepth:2.12,color:0xffffff,foundationColor:0xffffff,roughness:1}),
  fortified:Object.freeze({height:4.45,depth:1.86,capHeight:1.18,capY:4.48,bodyY:2.08,foundationDepth:2.42,color:0xa9b0bd,foundationColor:0xc6cede,roughness:.94}),
});

export function wallTierStyle(tier){
  return WALL_TIER_STYLE[tier]||WALL_TIER_STYLE.stone;
}
