import {UNITS,BUILDINGS} from './data.js';

export const mechanicalUnit=target=>target?.kind==='unit'&&!!(UNITS[target.type]?.naval||UNITS[target.type]?.role==='siege');
export const healableUnit=target=>target?.kind==='unit'&&target.hp>0&&!target.embarked&&!mechanicalUnit(target);
export const repairableTarget=target=>target?.hp>0&&!target.embarked&&(mechanicalUnit(target)||target.kind==='building'&&BUILDINGS[target.type]&&target.progress>=1);

// Mechanical repairs restore the same health per worker as building repairs.
// A full repair uses 35% of the unit's training resources, paid by the worker's
// owner. Clamp the final tick so a nearly complete repair cannot overcharge.
export function repairMechanical(sim,worker,target,dt){
  const amount=Math.min(target.maxHp-target.hp,Math.max(0,dt)*23);if(!(amount>0))return false;
  const cost=Object.fromEntries(Object.entries(UNITS[target.type].cost).map(([resource,n])=>[resource,n*.35*amount/target.maxHp]));
  if(!sim.spend(cost,worker.owner))return false;target.hp=Math.min(target.maxHp,target.hp+amount);return true;
}
