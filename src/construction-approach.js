import {unitNavigationGrid,constructionNavigationGrid,clearSegment} from './navigation.js';
import {constructionPositions,constructionSegmentClear} from './construction-contact.js';

// A worker's approach is local navigation state, never a saved or networked
// command. Recompute on topology changes, restored entities or crowd blockage.
const approaches=new WeakMap();

export function approachConstruction(sim,worker,target,dt){
  let approach=approaches.get(worker);
  const key=[target.id,target.x,target.z,target.r,target.wallAngle||0,sim.revision].join(':');
  if(!approach||approach.key!==key||sim.time>=approach.retryAt&&(!approach.point||worker.stuckTime>1.8)){
    const grid=unitNavigationGrid(sim,worker),workGrid=constructionNavigationGrid(sim,target,worker.owner),limit=sim.halfWorld-3;
    const others=sim.entities.filter(e=>e!==worker&&e.hp>0&&e.kind==='unit'&&!e.embarked&&Math.hypot(e.x-target.x,e.z-target.z)<target.r+8),candidates=[];
    for(const point of constructionPositions(worker,target)){
      if(Math.abs(point.x)>limit||Math.abs(point.z)>limit)continue;
      const cell=sim.cell(point.x,point.z),id=cell.z*sim.gridSize+cell.x;if(workGrid[id])continue;
      let cost=Math.hypot(point.x-worker.x,point.z-worker.z);
      for(const other of others){const gap=(worker.r+other.r)*.9+.2,distance=Math.hypot(point.x-other.x,point.z-other.z);if(distance<gap)cost+=(gap-distance)*18;
        const reserved=approaches.get(other)?.point;if(reserved&&Math.hypot(point.x-reserved.x,point.z-reserved.z)<gap)cost+=8;
      }
      candidates.push({point,cost});
    }
    candidates.sort((a,b)=>a.cost-b.cost);let point=null,entry=null;
    for(const candidate of candidates){
      if(Math.hypot(worker.x-candidate.point.x,worker.z-candidate.point.z)<=3&&constructionSegmentClear(worker,candidate.point,target,worker.r+.05)&&clearSegment(sim,workGrid,worker,candidate.point)){point=candidate.point;entry={x:worker.x,z:worker.z};break;}
      const route=sim.pathTo(worker,candidate.point);if(worker.pathStatus!=='ready')continue;
      const last=route.at(-1)||worker,cell=sim.cell(candidate.point.x,candidate.point.z);
      if(!grid[cell.z*sim.gridSize+cell.x]){point=candidate.point;entry=point;break;}
      if(constructionSegmentClear(last,candidate.point,target,worker.r+.05)&&clearSegment(sim,workGrid,last,candidate.point)){point=candidate.point;entry={x:last.x,z:last.z};break;}
    }
    approach={key,point,entry,retryAt:sim.time+1.5,final:false};approaches.set(worker,approach);
    worker.path=[];worker.repath=0;
  }
  if(!approach.point){sim.blockedMovement(worker,dt);return false;}
  if(!approach.final&&Math.hypot(worker.x-approach.entry.x,worker.z-approach.entry.z)>.1)return sim.move(worker,approach.entry,dt,0,true);
  // The destination changes from the coarse entry to the exact work point.
  // Drop the previous path even though both points have no entity ID.
  if(!approach.final){approach.final=true;worker.path=[];worker.repath=0;}
  const grid=constructionNavigationGrid(sim,target,worker.owner),before={x:worker.x,z:worker.z,stuckTime:worker.stuckTime},moved=sim.move(worker,approach.point,dt,0,true,grid);
  if(!constructionSegmentClear(before,worker,target,worker.r+.05)){
    worker.x=before.x;worker.z=before.z;worker.stuckTime=before.stuckTime;worker.moving=false;sim.blockedMovement(worker,dt);return false;
  }
  return moved;
}
