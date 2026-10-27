import {UNITS} from './data.js';
import {constructionHalfSize} from './construction-contact.js';
import {wallConnections,wallTreeConnections} from './walls.js';

const wallCache=new WeakMap();
const workGridCache=new WeakMap();
function wallsNear(sim,target){
  let cache=wallCache.get(sim);if(!cache||cache.entities!==sim.entities||cache.revision!==sim.revision){
    cache={entities:sim.entities,revision:sim.revision,walls:sim.entities.filter(e=>e.hp>0&&e.kind==='building'&&['wall','gate'].includes(e.type)),links:[...wallConnections(sim.entities),...wallTreeConnections(sim.entities)],nearby:new WeakMap()};wallCache.set(sim,cache);
  }
  if(cache.nearby.has(target))return cache.nearby.get(target);
  const radius=target.r+12;
  const result={walls:cache.walls.filter(e=>e!==target&&Math.hypot(e.x-target.x,e.z-target.z)<radius),links:cache.links.filter(link=>Math.hypot(link.a.x-target.x,link.a.z-target.z)<radius||Math.hypot(link.b.x-target.x,link.b.z-target.z)<radius)};cache.nearby.set(target,result);return result;
}
function pointSegmentDistance(p,a,b){const dx=b.x-a.x,dz=b.z-a.z,squared=dx*dx+dz*dz,t=squared?Math.max(0,Math.min(1,((p.x-a.x)*dx+(p.z-a.z)*dz)/squared)):0;return Math.hypot(p.x-a.x-t*dx,p.z-a.z-t*dz);}
function segmentDistance(a,b,c,d){
  const cross=(p,q,r)=>(q.x-p.x)*(r.z-p.z)-(q.z-p.z)*(r.x-p.x),ab1=cross(a,b,c),ab2=cross(a,b,d),cd1=cross(c,d,a),cd2=cross(c,d,b);
  if(((ab1<=0&&ab2>=0)||(ab1>=0&&ab2<=0))&&((cd1<=0&&cd2>=0)||(cd1>=0&&cd2<=0))&&Math.max(Math.min(a.x,b.x),Math.min(c.x,d.x))<=Math.min(Math.max(a.x,b.x),Math.max(c.x,d.x))&&Math.max(Math.min(a.z,b.z),Math.min(c.z,d.z))<=Math.min(Math.max(a.z,b.z),Math.max(c.z,d.z)))return 0;
  return Math.min(pointSegmentDistance(a,c,d),pointSegmentDistance(b,c,d),pointSegmentDistance(c,a,b),pointSegmentDistance(d,a,b));
}

// Contact is measured against the visible building footprint, including the
// narrower wall and gate bodies, rather than a generous center-to-center radius.
export function meleeFootprint(target){
  if(target.type==='wall')return {x:1.425,z:.725};
  if(target.type==='gate')return {x:2.76,z:.85};
  const half=constructionHalfSize(target);return {x:half,z:half};
}
function local(point,target){const angle=target.wallAngle||0,c=Math.cos(angle),s=Math.sin(angle),dx=point.x-target.x,dz=point.z-target.z;return {x:c*dx-s*dz,z:s*dx+c*dz,c,s};}
export function meleeBuildingAttack(unit,target){const def=UNITS[unit.type];return unit.kind==='unit'&&target.kind==='building'&&!!def?.damage&&!def.naval&&def.range<=5;}
export function meleeReach(unit){const def=UNITS[unit.type];return Math.max((unit.r||.65)+.15,Math.min(unit.type==='ram'?2.1:1.65,Math.max(1.2,(def?.range||2)*.65)));}
export function meleeSurfaceDistance(unit,target){
  const p=local(unit,target),half=meleeFootprint(target),x=Math.abs(p.x)-half.x,z=Math.abs(p.z)-half.z;
  return Math.hypot(Math.max(0,x),Math.max(0,z))+Math.min(0,Math.max(x,z));
}
export function meleeHeading(unit,target){
  const p=local(unit,target),half=meleeFootprint(target),x=Math.max(-half.x,Math.min(half.x,p.x)),z=Math.max(-half.z,Math.min(half.z,p.z));
  return Math.atan2(target.x+p.c*x+p.s*z-unit.x,target.z-p.s*x+p.c*z-unit.z);
}
export function meleePositions(unit,target){
  const p=local(unit,target),half=meleeFootprint(target),offset=Math.min(meleeReach(unit)-.08,Math.max(1.08,(unit.r||.65)+.25)),points=[];
  for(let face=0;face<4;face++){
    const horizontal=face<2,limit=Math.max(.1,(horizontal?half.z:half.x)-.2),nearest=Math.max(-limit,Math.min(limit,horizontal?p.z:p.x));
    for(const along of [nearest,0,-limit,limit]){
      const normal=(face===0||face===2?1:-1)*((horizontal?half.x:half.z)+offset),x=horizontal?normal:along,z=horizontal?along:normal;
      if(points.some(point=>Math.hypot(point.lx-x,point.lz-z)<.05))continue;
      points.push({x:target.x+p.c*x+p.s*z,z:target.z-p.s*x+p.c*z,lx:x,lz:z});
    }
  }return points;
}
export function meleeSegmentClear(from,to,target,margin=0){
  const a=local(from,target),b=local(to,target),half=meleeFootprint(target),dx=b.x-a.x,dz=b.z-a.z;let enter=0,exit=1;
  for(const [origin,delta,bound]of [[a.x,dx,half.x+margin],[a.z,dz,half.z+margin]]){
    if(Math.abs(delta)<1e-9){if(Math.abs(origin)>=bound)return true;continue;}
    const first=(-bound-origin)/delta,second=(bound-origin)/delta;enter=Math.max(enter,Math.min(first,second));exit=Math.min(exit,Math.max(first,second));if(enter>exit)return true;
  }
  return exit<0||enter>1;
}

// Near a connected wall, a coarse two-unit cell can be marked blocked even
// though the attack point is outside the masonry. Check the actual swept body
// against neighboring walls and joints before opening that one cell.
export function meleeWorldSegmentClear(from,to,target,margin,sim,unit){
  if(!meleeSegmentClear(from,to,target,margin))return false;
  if(target.type!=='wall'&&target.type!=='gate')return true;
  const nearby=wallsNear(sim,target);
  for(const wall of nearby.walls)if(!(wall.type==='gate'&&sim.allied(unit.owner,wall.owner))&&!meleeSegmentClear(from,to,wall,margin))return false;
  for(const link of nearby.links){
    if(segmentDistance(from,to,link.collisionStart,link.collisionEnd)<.85+margin)return false;
  }
  return true;
}

export function meleeWorkGrid(sim,unit,target,grid,point){
  const cell=sim.cell(point.x,point.z),index=cell.z*sim.gridSize+cell.x;if(!grid[index])return grid;
  if(!['wall','gate'].includes(target.type)||sim.grids.landBase.data[index]||!meleeWorldSegmentClear(point,point,target,unit.r+.05,sim,unit))return null;
  const x=cell.x*2-sim.halfWorld+1,z=cell.z*2-sim.halfWorld+1;
  if(sim.entities.some(e=>e!==target&&e.hp>0&&e.kind==='building'&&!['wall','gate','farm'].includes(e.type)&&Math.hypot(e.x-x,e.z-z)<e.r+.9))return null;
  let cache=workGridCache.get(grid);if(!cache){cache=new Map();workGridCache.set(grid,cache);}if(cache.has(index))return cache.get(index);
  const copy=grid.slice();copy[index]=0;copy.bridgeClearance=grid.bridgeClearance;copy.navigationKey=(grid.navigationKey||'')+':melee:'+target.id+':'+index;cache.set(index,copy);
  while(cache.size>16)cache.delete(cache.keys().next().value);return copy;
}
