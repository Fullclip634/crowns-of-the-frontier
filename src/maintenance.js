import {UNITS,BUILDINGS} from './data.js';

export const mechanicalUnit=target=>target?.kind==='unit'&&!!(UNITS[target.type]?.naval||UNITS[target.type]?.role==='siege');
export const healableUnit=target=>target?.kind==='unit'&&target.hp>0&&!target.embarked&&!mechanicalUnit(target);
export const repairableTarget=target=>target?.hp>0&&!target.embarked&&(mechanicalUnit(target)||target.kind==='building'&&BUILDINGS[target.type]&&target.progress>=1);

export const EXTRA_BUILDER_EFFICIENCY=1/3;
export const multiBuilderRate=count=>count>0?1+(count-1)*EXTRA_BUILDER_EFFICIENCY:0;

// Standard AoE diminishing returns for multi-villager construction and building
// repairs: the first active worker contributes 100% speed and every additional
// worker on the same building in the same simulation step adds +1/3 speed,
// summing exactly to 1 + (N - 1) / 3. Kept in a WeakMap so save schemas stay clean.
const buildingWorkTurns=new WeakMap();
export function peekBuildingWorkFactor(sim,worker,target,kind){
  const state=buildingWorkTurns.get(target);
  if(!state||state.time!==sim.time||state.kind!==kind||state.workers.has(worker.id))return 1;
  return EXTRA_BUILDER_EFFICIENCY;
}
export function recordBuildingWork(sim,worker,target,kind){
  let state=buildingWorkTurns.get(target);
  if(!state){state={time:NaN,kind:'',workers:new Set()};buildingWorkTurns.set(target,state);}
  if(state.time!==sim.time||state.kind!==kind||state.workers.has(worker.id)){
    state.time=sim.time;state.kind=kind;state.workers.clear();state.workers.add(worker.id);
    return 1;
  }
  state.workers.add(worker.id);
  return EXTRA_BUILDER_EFFICIENCY;
}

// Mechanical repairs restore the same health per worker as building repairs.
// A full repair uses 35% of the unit's training resources, paid by the worker's
// owner. Clamp the final tick so a nearly complete repair cannot overcharge.
export function repairMechanical(sim,worker,target,dt){
  const amount=Math.min(target.maxHp-target.hp,Math.max(0,dt)*23);if(!(amount>0))return false;
  const cost=Object.fromEntries(Object.entries(UNITS[target.type].cost).map(([resource,n])=>[resource,n*.35*amount/target.maxHp]));
  if(!sim.spend(cost,worker.owner))return false;target.hp=Math.min(target.maxHp,target.hp+amount);return true;
}
