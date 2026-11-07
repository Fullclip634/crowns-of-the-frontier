import {BUILDINGS} from './data.js';

// Fortified Wall is an AoE II style Castle-Age *upgrade*, not a placeable tier.
// The Stone Wall remains the base tier (1,400 HP, Feudal Age, 22 stone).
export const FORTIFIED_WALL_TECH='fortifiedWall';
export const FORTIFIED_WALL_HP=4000;
export const FORTIFIED_GATE_HP=4000;
export const FORTIFIED_WALL_ARMOR=4;
export const FORTIFIED_GATE_ARMOR=4;

const UPGRADED_HP=Object.freeze({wall:FORTIFIED_WALL_HP,gate:FORTIFIED_GATE_HP});
const UPGRADED_ARMOR=Object.freeze({wall:FORTIFIED_WALL_ARMOR,gate:FORTIFIED_GATE_ARMOR});

// Older saves and lightweight test fixtures may omit the tech table entirely.
export function hasFortifiedWalls(sim,owner){
  return (sim?.players?.[owner]?.tech?.[FORTIFIED_WALL_TECH]||0)>0;
}

export function isFortifiable(entity){
  return !!entity&&entity.kind==='building'&&Object.hasOwn(UPGRADED_HP,entity.type);
}

export function isFortified(sim,entity){
  return isFortifiable(entity)&&hasFortifiedWalls(sim,entity.owner);
}

export function wallTier(sim,entity){
  return isFortified(sim,entity)?'fortified':'stone';
}

// Base HP before faction / Masonry multipliers. A fully upgraded Alder wall is
// 4000 * 1.2 * (1 + 3 * .3) = 9120, still below the Wonder's 5000 *base* HP.
export function wallBaseHP(sim,entity){
  if(!entity||entity.kind!=='building')return 0;
  const base=BUILDINGS[entity.type]?.hp||0;
  return isFortified(sim,entity)?UPGRADED_HP[entity.type]:base;
}

// Buildings use a flat 1 armor (5 against ranged). Fortified masonry adds a
// real, measurable reduction on top of the larger health pool.
export function wallArmorBonus(sim,target){
  return isFortified(sim,target)?UPGRADED_ARMOR[target.type]:0;
}

// Shared connector geometry keeps exactly two InstancedMesh batches. Tier is
// expressed through per-instance colour, height and depth only.
export const WALL_TIER_STYLE=Object.freeze({
  stone:Object.freeze({height:3.55,depth:1.47,capHeight:.85,capY:3.65,bodyY:1.67,foundationDepth:2.12,color:0xffffff,foundationColor:0xffffff,roughness:1}),
  fortified:Object.freeze({height:4.45,depth:1.86,capHeight:1.18,capY:4.48,bodyY:2.08,foundationDepth:2.42,color:0xa9b0bd,foundationColor:0xc6cede,roughness:.94}),
});

export function wallTierStyle(tier){
  return WALL_TIER_STYLE[tier]||WALL_TIER_STYLE.stone;
}
