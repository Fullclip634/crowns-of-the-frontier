import {terrainNoise} from './terrain-fields.js';
import {seededRandom} from './data.js';
import {biomeProfile,NEW_BIOME_MAPS} from './terrain-biomes.js';

// One height field drives the rendered mesh, picking, foundations, roads and
// tactical combat. Keeping it free of THREE lets the headless simulation use
// the same terrain the player sees.
export function terrainPhase(seed){return seededRandom(seed+751)()*Math.PI*2;}

// Broad forms plus smooth mesa terraces. This is both the render base and the
// tactical elevation, so a visible plateau is a real combat advantage.
export function broadRelief(map,x,z,phase){
  const profile=biomeProfile(map),frequency=map==='canyon'?.85:1,xx=x*frequency,zz=z*frequency,seed=Math.floor(phase*1048576);
  const broad=terrainNoise(xx*.014+phase*2,zz*.014-phase,seed)*3.45;
  const shoulders=terrainNoise(xx*.032+zz*.012+7,zz*.029-xx*.01-5,seed^0x51d2)*.72;
  let h=.8+profile.strength*(broad+shoulders);
  if(profile.cliffs>0){
    const shape=terrainNoise(xx*.019+13,zz*.017-9,seed^0x2b71);
    const terrace=Math.tanh(shape*3.1);
    h+=profile.cliffs*(terrace*3.1);
  }
  return h;
}

export function terrainRelief(map,x,z,phase){
  const seed=Math.floor(phase*1048576),frequency=map==='canyon'?.85:1,xx=x*frequency,zz=z*frequency;
  // Fine detail stays wider than Low's largest cells; it never decides combat.
  const detail=terrainNoise(xx*.045-zz*.014-9,zz*.043+xx*.015+13,seed^0x713a)*.09;
  const scree=biomeProfile(map).cliffs>0?terrainNoise(xx*.061-4,zz*.058+21,seed^0x71a3)*.32*biomeProfile(map).cliffs:0;
  return broadRelief(map,x,z,phase)+biomeProfile(map).strength*detail+scree;
}

export function tacticalHeight(map,seed,x,z,phase=terrainPhase(seed)){return broadRelief(map,x,z,phase);}

// Elevation gameplay belongs to the new cliff/mesa biomes. The seven legacy
// maps keep their published, regression-tested combat, fog and speed numbers.
export const HIGH_GROUND_THRESHOLD=1.1;
export function tacticalTerrainEnabled(map){return NEW_BIOME_MAPS.includes(map);}

// Age of Empires style high-ground advantage, bounded so it can never become
// an exploit: attacking downhill adds up to +25%, attacking uphill loses up to
// -15%. Siege gets half the effect so walls remain breachable.
export function highGroundMultiplier(attackerHeight,targetHeight,{siege=false}={}){
  const delta=attackerHeight-targetHeight,scale=siege?.5:1;
  if(delta>HIGH_GROUND_THRESHOLD)return 1+Math.min(.25,(delta-HIGH_GROUND_THRESHOLD)*.035)*scale;
  if(delta<-HIGH_GROUND_THRESHOLD)return 1-Math.min(.15,(-delta-HIGH_GROUND_THRESHOLD)*.025)*scale;
  return 1;
}

export function elevationVisionBonus(attackerHeight,referenceHeight){
  return attackerHeight-referenceHeight>HIGH_GROUND_THRESHOLD?2:0;
}
export function slopeAt(map,seed,x,z,phase=terrainPhase(seed)){
  const step=.75;
  const dx=tacticalHeight(map,seed,x+step,z,phase)-tacticalHeight(map,seed,x-step,z,phase);
  const dz=tacticalHeight(map,seed,x,z+step,phase)-tacticalHeight(map,seed,x,z-step,phase);
  return Math.hypot(dx,dz)/(2*step);
}
export function slopeSpeedFactor(slope){
  return 1-Math.min(.35,Math.max(0,slope-.35)*.22);
}
