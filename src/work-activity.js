// Cosmetic work eligibility shared with network perspectives. This reveals no
// target ID, route or future order to another commander.
import {gatheringRange} from './work-ranges.js';
export function workingTarget(sim,e){
  if(e.type!=='villager'||e.moving||e.cooldown>0||e.order?.returning||e.embarked||e.hp<=0)return null;
  const order=e.order;if(!['gather','build','repair'].includes(order?.type))return null;
  const target=sim?.get?.(order.target);if(!target||target.hp<=0)return null;
  const range=order.type==='gather'?gatheringRange(e,target):(target.r||0)+3;
  if(Math.hypot(e.x-target.x,e.z-target.z)>range+.05)return null;
  if(order.type==='gather'&&!(target.kind==='resource'&&target.amount>0||target.type==='farm'&&target.progress>=1))return null;
  if(order.type!=='gather'&&(target.progress>=1||order.type==='repair')&&target.hp>=target.maxHp)return null;
  return target;
}
