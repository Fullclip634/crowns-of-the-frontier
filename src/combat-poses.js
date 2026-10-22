import {UNITS} from './data.js';
import {releaseDelay} from './combat-timing.js';

// Keep drawing/releasing a bow distinct from melee swings. The same cooldown
// state animates local and observed network units, without per-bone messages.
export function combatJointAngle(entity,joint,offset=0){
  const definition=UNITS[entity.type];if(!definition||entity.moving||!definition.damage||!['ranged','infantry','cavalry','spear','worker'].includes(definition.role))return null;
  const aiming=definition.role==='ranged'&&entity.order?.type==='attack';if(!entity.cooldown&&!aiming)return null;
  const interval=definition.cooldown||1.2,age=Math.max(0,interval-(entity.cooldown||0)+offset),phase=Math.max(0,Math.min(1,age/interval));
  if(definition.role==='ranged'){
    const delay=releaseDelay(entity),draw=age<=delay?Math.min(1,age/delay):Math.max(0,1-(age-delay)/.16);
    const reload=Math.sin(Math.PI*Math.max(0,Math.min(1,(age-delay)/(interval-delay))));
    if(joint.type==='arm')return joint.side<0?-1.25+reload*.28:-.65-draw*.23+reload*.18;
    if(joint.type==='forearm')return joint.side<0?-.06+reload*.08:-.25-draw*.65+reload*.12;
    if(joint.type==='torso')return -.018+draw*.028;
    if(joint.type==='head')return -.045;
    return null;
  }
  const recovery=Math.min(1,age/.28),windup=Math.max(0,(phase-.68)/.32),strike=1-recovery;
  if(joint.type==='arm')return joint.side<0?-.42:definition.role==='spear'?-.98+recovery*.35-windup*.25:-.85*strike-.45*recovery-1.22*windup;
  if(joint.type==='forearm')return joint.side<0?-.30:-.20-.15*recovery-.35*windup;
  if(joint.type==='workerTool')return 2.45*strike+1.8*recovery-.7*windup;
  if(joint.type==='torso')return .035+.14*strike-.055*windup;
  if(joint.type==='head')return -.035;
  return null;
}
