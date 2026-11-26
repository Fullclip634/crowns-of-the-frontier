import {UNITS} from './data.js';
import {releaseDelay} from './combat-timing.js';
import {archeryJointRotation} from './archery-pose.js';

const clamp01=v=>Math.max(0,Math.min(1,v));
const smooth01=v=>{const t=clamp01(v);return t*t*(3-2*t);};

// Dedicated multi-axis combat poses for newly articulated specialty units and
// Hero Generals so javelins throw overhand, repeating crossbows pump bursts,
// fire-lances couch & recoil, and twin-axe/warhammer champions strike cleanly.
function specialtyCombatRotation(entity,joint,offset,output){
  const definition=UNITS[entity.type];
  if(!definition||entity.moving||!definition.damage)return false;
  const aiming=definition.role==='ranged'&&entity.order?.type==='attack';
  if(!entity.cooldown&&!aiming)return false;
  const interval=definition.cooldown||1.2;
  const age=Math.max(0,interval-(entity.cooldown||0)+offset);
  const phase=clamp01(age/interval);
  const delay=releaseDelay(entity);
  output.x=output.y=output.z=0;

  if(entity.type==='skirmisher'){
    // Athletic overhand javelin throw: coil torso + lift right arm high overhead via Z abduction,
    // snap forward through release, brace left round buckler shield upright & dead-forward, then reach back to quiver.
    const cock=age<=delay?smooth01(age/Math.max(.08,delay)):1-smooth01((age-delay)/.14);
    const follow=age>delay?Math.sin(Math.PI*clamp01((age-delay)/.34)):0;
    const reload=age>delay+.30?Math.sin(Math.PI*clamp01((age-delay-.30)/Math.max(.2,interval-delay-.30))):0;
    if(joint.type==='torso'){
      output.y=-.48*cock+.44*follow-.16*reload;
      output.x=-.08*cock+.16*follow;
      return true;
    }
    if(joint.type==='head'){
      output.y=.48*cock-.44*follow+.16*reload;
      output.x=-.04;
      return true;
    }
    if(joint.type==='arm'){
      if(joint.side<0){output.x=-.62-.10*cock+.08*follow;output.y=.30;output.z=-.12;return true;}
      output.x=-.42*cock-1.35*follow-.38*reload;
      output.z=2.35*cock+.35*follow+.65*reload;
      return true;
    }
    if(joint.type==='forearm'){
      // Counter-pitch left forearm so the round buckler stays upright facing enemy archers!
      if(joint.side<0){output.x=.52;return true;}
      output.z=.32*cock+.10*follow;
      output.x=-.15*cock+.42*follow-.45*reload;
      return true;
    }
    return false;
  }

  if(entity.type==='chukonu'){
    // Level repeating-crossbow firing stance with crisp 3-bolt rapid lever recoil!
    const aimBlend=age<=delay?smooth01(age/Math.max(.08,delay)):1-smooth01((age-delay-.55)/Math.max(.2,interval-delay-.55));
    const burstWindow=age>delay?clamp01((age-delay)/.48):0;
    const recoil=burstWindow>0&&burstWindow<1?Math.sin(burstWindow*Math.PI*3)*.13:0;
    if(joint.type==='torso'){output.y=.22*aimBlend;output.x=-.04*recoil;return true;}
    if(joint.type==='head'){output.y=-.22*aimBlend;output.x=-.05;return true;}
    if(joint.type==='arm'){
      if(joint.side<0){output.x=-1.00*aimBlend-.10;output.y=.42*aimBlend;return true;}
      output.x=-1.04*aimBlend-.08+recoil;output.y=-.14*aimBlend;
      return true;
    }
    if(joint.type==='forearm'){
      if(joint.side<0){output.x=.56*aimBlend;output.y=.34*aimBlend;return true;}
      output.x=.90*aimBlend-recoil*.6;
      return true;
    }
    return false;
  }

  if(entity.type==='firelancer'){
    // Couched gunpowder fire-lance forward thrust & explosive blast recoil
    const recovery=clamp01(age/.30),windup=Math.max(0,(phase-.64)/.36),strike=1-recovery;
    const kick=Math.sin(Math.PI*clamp01(age/.24))*.22;
    if(joint.type==='torso'){output.x=.14+.12*strike-.08*windup-.06*kick;output.y=-.18*windup+.22*strike;return true;}
    if(joint.type==='head'){output.y=.18*windup-.22*strike;output.x=-.04;return true;}
    if(joint.type==='arm'){
      if(joint.side<0){output.x=-.55;return true;}
      output.x=-.78-.42*strike+.25*windup+kick;
      return true;
    }
    if(joint.type==='forearm'){
      if(joint.side<0){output.x=-.25;return true;}
      output.x=.64+.20*strike-.18*windup;
      return true;
    }
    return false;
  }

  if(entity.type==='hero_raven'){
    // Shadow Khan — ferocious alternating twin war-axe cleave high & wide so both axes flash clearly!
    const recovery=clamp01(age/.30),windup=Math.max(0,(phase-.62)/.38),strike=1-recovery;
    const alt=Math.sin(phase*Math.PI*2);
    if(joint.type==='torso'){output.y=.32*strike-.28*windup;output.x=.10*strike-.06*windup;return true;}
    if(joint.type==='head'){output.y=-.26*strike+.22*windup;return true;}
    if(joint.type==='arm'){
      if(joint.side>0){output.x=-.35*strike-.35*recovery-1.15*windup;output.z=.65*windup-.10*strike;return true;}
      output.x=-1.10*strike-.40*recovery-.45*windup+.18*alt;output.z=-.55*strike;return true;
    }
    if(joint.type==='forearm'){
      output.x=joint.side>0?-.16-.25*windup:-.28*strike-.18;
      return true;
    }
    return false;
  }

  if(entity.type==='hero_iron'||entity.type==='ironbreaker'){
    // Heavy overhead breaching warhammer cleave & upright grounded tower-shield brace
    const recovery=clamp01(age/.32),windup=Math.max(0,(phase-.60)/.40),strike=1-recovery;
    if(joint.type==='torso'){output.x=.06+.22*strike-.10*windup;output.y=-.24*windup+.28*strike;return true;}
    if(joint.type==='head'){output.y=.22*windup-.26*strike;output.x=-.04;return true;}
    if(joint.type==='arm'){
      if(joint.side<0){output.x=-.58-.12*strike;output.y=.26;return true;}
      output.x=-.35*strike-.42*recovery-1.35*windup;output.z=.52*windup-.08*strike;return true;
    }
    if(joint.type==='forearm'){
      if(joint.side<0){output.x=.42;return true;}
      output.x=-.14-.32*windup;return true;
    }
    return false;
  }

  if(entity.type==='hero_alder'||entity.type==='hero_sun'||entity.type==='hero_jade'){
    // Sweeping heroic mounted cavalry cleave high & wide so royal greatsword / scimitar / guandao gleam!
    const recovery=clamp01(age/.28),windup=Math.max(0,(phase-.64)/.36),strike=1-recovery;
    if(joint.type==='torso'){output.x=.08+.16*strike-.08*windup;output.y=-.30*windup+.34*strike;return true;}
    if(joint.type==='head'){output.y=.26*windup-.30*strike;output.x=-.04;return true;}
    if(joint.type==='arm'){
      if(joint.side<0){output.x=-.56;output.y=.22;return true;}
      output.x=-.38*strike-.38*recovery-1.18*windup;output.z=.62*windup-.12*strike;return true;
    }
    if(joint.type==='forearm'){
      if(joint.side<0){output.x=.40;return true;}
      output.x=-.16-.25*windup;return true;
    }
    return false;
  }

  return false;
}

export function combatJointRotation(entity,joint,offset,output){
  if(archeryJointRotation(entity,joint,offset,output))return true;
  if(specialtyCombatRotation(entity,joint,offset,output))return true;
  const angle=combatJointAngle(entity,joint,offset);if(angle===null)return false;output.x=angle;output.y=output.z=0;return true;
}

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
