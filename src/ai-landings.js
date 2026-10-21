import {UNITS} from './data.js';
const distance=(a,b)=>Math.hypot(a.x-b.x,a.z-b.z);
export const coastalLanding=(sign,z)=>({x:Math.sin(z*.03)*2+sign*20,z});
export const coastalApproach=(sign,z)=>({x:Math.sin(z*.03)*2+sign*12,z});

// Unseen beaches remain scouting candidates. Only observed obstacles can reject
// a landing; enemy troop and fortification scores come from the AI's own intel.
export function chooseLandingShore(sim,owner,ship,sign,goalZ,visible,known,{retry=false}={}){
  const offsets=retry?[18,-18,30,-30,48,-48,72,-72]:[0,36,-36,60,-60];
  const others=sim.owned(owner,'unit','transport').filter(other=>other!==ship&&other.landing?.sign===sign);
  const candidates=offsets.map(offset=>goalZ+offset).filter(z=>Math.abs(z)<sim.halfWorld-10).filter(z=>{
    const point=coastalLanding(sign,z);if(!sim.canSee(owner,point))return true;
    const cell=sim.cell(point.x,point.z);return !sim.grid(owner)[cell.z*sim.gridSize+cell.x];
  });
  const score=z=>{
    const point=coastalLanding(sign,z);
    const danger=visible.filter(e=>!e.embarked&&e.kind==='unit'&&UNITS[e.type]?.damage>0).reduce((n,e)=>n+Math.max(0,(UNITS[e.type].range||0)+16-distance(e,point))*(UNITS[e.type].naval?3:1),0)
      +known.filter(e=>['dock','tower','keep'].includes(e.type)).reduce((n,e)=>n+Math.max(0,32-Math.abs(e.z-z)),0);
    return danger+Math.abs(z-goalZ)*.08+(retry?distance(ship,coastalApproach(sign,z))*.2:0)+others.reduce((n,other)=>n+Math.max(0,12-Math.abs((other.landing.shoreZ??other.landing.z)-z))*4,0);
  };
  return candidates.sort((a,b)=>score(a)-score(b)||Math.abs(a-goalZ)-Math.abs(b-goalZ))[0]??null;
}
