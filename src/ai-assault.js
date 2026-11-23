import {UNITS} from './data.js';

const distance=(a,b)=>Math.hypot(a.x-b.x,a.z-b.z);

// Track one attack and one failed front. Both survive saves, and only
// observed damage and the army's own movement can reset the stall timer.
export function adaptAssault(sim,state,target,fighters,visible,known,town){
  if(state.assaultAvoid&&sim.time>=state.assaultAvoid.until)delete state.assaultAvoid;
  const current=state.assault;
  if(current){
    const marching=fighters.filter(unit=>unit.order?.commanderObjective?.phase==='attack'&&distance(unit.order.commanderObjective,current)<3);
    const targetNow=visible.find(entity=>entity.id===current.id&&entity.kind==='building');
    const nearest=marching.reduce((best,unit)=>Math.min(best,distance(unit,current)),Infinity);
    if(targetNow&&targetNow.hp<current.hp-1||nearest<current.nearest-6){
      current.at=sim.time;
      current.nearest=Math.min(current.nearest,nearest);
    }
    if(targetNow)current.hp=Math.min(current.hp,targetNow.hp);
    const blocked=marching.filter(unit=>unit.pathStatus==='blocked').length;
    const wait=blocked>=Math.max(2,Math.ceil(marching.length/2))?24:48;
    if(marching.length>=3&&sim.time-current.at>=wait){
      state.assaultAvoid={x:current.x,z:current.z,until:sim.time+65};
      delete state.assault;
    }
  }
  const avoided=state.assaultAvoid;
  if(avoided&&distance(avoided,target)<22){
    const army=fighters.filter(unit=>UNITS[unit.type]?.damage>0&&!unit.embarked);
    const lead=army.reduce((best,unit)=>!best||distance(unit,target)<distance(best,target)?unit:best,null)||town;
    const nonWalls=known.filter(site=>site.kind==='building'&&site.type!=='wall'&&site.type!=='gate'&&distance(avoided,site)>=22&&distance(lead,site)<100);
    const pool=nonWalls.length?nonWalls:known.filter(site=>site.kind==='building'&&distance(avoided,site)>=22&&distance(lead,site)<100);
    target=pool.sort((a,b)=>distance(lead,a)-distance(lead,b)||a.id-b.id)[0]||town;
  }
  if(target===town)return town;
  if(!state.assault||distance(state.assault,target)>=3){
    const observed=visible.find(entity=>entity.id===target.id);
    state.assault={x:target.x,z:target.z,id:target.id,at:sim.time,nearest:sim.halfWorld*4,hp:observed?.hp??Number.MAX_SAFE_INTEGER};
  }
  return target;
}
