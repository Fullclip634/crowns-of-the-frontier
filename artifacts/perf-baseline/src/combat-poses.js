import {UNITS} from './data.js';

// Keep drawing/releasing a bow distinct from melee swings. The same cooldown
// state animates local and observed network units, without per-bone messages.
export function combatJointAngle(entity,joint){
  const definition=UNITS[entity.type];if(!definition||entity.moving||!definition.damage||!['ranged','infantry','cavalry','spear'].includes(definition.role))return null;
  const aiming=definition.role==='ranged'&&entity.order?.type==='attack';if(!entity.cooldown&&!aiming)return null;
  const interval=definition.cooldown||1.2,phase=Math.max(0,Math.min(1,1-(entity.cooldown||0)/interval));
  if(definition.role==='ranged'){
    const draw=Math.min(1,phase/.75);
    if(joint.type==='arm')return joint.side<0?-1.25:-.65-draw*.23;
    if(joint.type==='forearm')return joint.side<0?-.06:-.25-draw*.65;
    if(joint.type==='torso')return -.018+draw*.028;
    if(joint.type==='head')return -.045;
    return null;
  }
  const recovery=Math.min(1,phase/.45),windup=Math.max(0,(phase-.72)/.28),strike=(1-recovery);
  if(joint.type==='arm')return joint.side<0?-.13:definition.role==='spear'?-.85+recovery*.3-windup*.15:.45*strike-.2*recovery-.55*windup;
  if(joint.type==='forearm')return joint.side<0?-.15:-.12-.2*windup;
  if(joint.type==='torso')return .025+.055*strike;
  if(joint.type==='head')return -.035;
  return null;
}
