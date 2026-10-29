const states=new WeakMap();
export const DEAD_UNIT_GRACE=30;
export const UNIT_CLEANUP_INTERVAL=10;

// Bodies and released projectiles have their own visual records. Keep a grace
// period, then retire dead unit records without changing IDs or battle totals.
export function retireDeadUnits(sim){
  let state=states.get(sim);
  if(!state||sim.time<state.lastSweep){state={lastSweep:sim.time,nextAt:sim.time,since:new WeakMap()};states.set(sim,state);}
  if(sim.time<state.nextAt)return 0;
  state.lastSweep=sim.time;state.nextAt=sim.time+UNIT_CLEANUP_INTERVAL;
  let kept=0,retired=0;
  for(const entity of sim.entities){
    if(entity.kind==='unit'&&entity.hp<=0){
      let since=state.since.get(entity);
      if(since===undefined){since=sim.time;state.since.set(entity,since);}
      if(sim.time-since>=DEAD_UNIT_GRACE){if(sim.index?.get(entity.id)===entity)sim.index.delete(entity.id);retired++;continue;}
    }else if(entity.kind==='unit')state.since.delete(entity);
    sim.entities[kept++]=entity;
  }
  if(retired)sim.entities.length=kept;
  return retired;
}
