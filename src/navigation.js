import {blockWallConnections} from './walls.js';
import {BUILDINGS} from './data.js';
const NEIGHBORS=[[1,0],[-1,0],[0,1],[0,-1],[1,1],[1,-1],[-1,1],[-1,-1]];
const MAX_BUILDING_RADIUS=Math.max(...Object.values(BUILDINGS).map(definition=>definition.r||0));
const constructionGrids=new WeakMap();

function containingBuildings(sim,unit){
  const buckets=sim.entityBuckets,cellSize=sim.entitySpatial?.cellSize||8,reach=MAX_BUILDING_RADIUS+.9,candidates=[];
  if(buckets){
    for(let x=Math.floor((unit.x-reach)/cellSize);x<=Math.floor((unit.x+reach)/cellSize);x++)for(let z=Math.floor((unit.z-reach)/cellSize);z<=Math.floor((unit.z+reach)/cellSize);z++)for(const entity of buckets.get(x)?.get(z)||[])if(entity.kind==='building')candidates.push(entity);
  }else candidates.push(...sim.entities);
  return candidates.filter(entity=>entity.hp>0&&entity.kind==='building'&&!['farm','wall','gate'].includes(entity.type)&&Math.hypot(entity.x-unit.x,entity.z-unit.z)<entity.r+.9);
}

// A foundation can cover a unit already standing there. Let that unit leave
// the containing ordinary buildings, without opening them for other troops.
export function unitNavigationGrid(sim,unit,normalOverride=null){
  const naval=!!sim.unitDefinition(unit).naval,normal=normalOverride||sim.grid(unit.owner,naval),cell=sim.cell(unit.x,unit.z),size=sim.gridSize;
  if(naval)return normal;
  const containing=containingBuildings(sim,unit);
  if(!containing.length)return normal;
  const buildings=sim.entities.filter(e=>e.hp>0&&e.kind==='building'&&e.type!=='farm'&&!(e.type==='gate'&&sim.allied(e.owner,unit.owner)));
  const key=`escape:${sim.players[unit.owner].team??unit.owner}:${containing.map(e=>e.id).join(',')}`,cache=normalOverride?null:(sim.unitEscapeGrids??=new Map());
  const stored=cache?.get(key);if(stored?.source===normal)return stored.data;
  const ignored=new Set(containing),others=buildings.filter(e=>!ignored.has(e)),data=normal.slice(),base=sim.grids.landBase.data;
  for(const building of containing){
    const a=sim.cell(building.x-building.r-.3,building.z-building.r-.3),b=sim.cell(building.x+building.r+.3,building.z+building.r+.3);
    for(let z=a.z;z<=b.z;z++)for(let x=a.x;x<=b.x;x++){
      const wx=x*2-sim.halfWorld+1,wz=z*2-sim.halfWorld+1,id=z*size+x;
      if(!normal[id]||Math.hypot(wx-building.x,wz-building.z)>=building.r+.9||base[id])continue;
      data[id]=others.some(e=>Math.hypot(wx-e.x,wz-e.z)<e.r+.9)?1:0;
    }
  }
  blockWallConnections(sim,data);data.navigationKey=key;
  if(cache){cache.delete(key);cache.set(key,{source:normal,data});while(cache.size>16)cache.delete(cache.keys().next().value);}
  return data;
}

// Build a temporary movement grid for AI placement checks without modifying
// the live simulation revision or invalidating every unit's cached route.
export function buildingPlacementGrid(sim,type,x,z,owner){
  const definition=BUILDINGS[type],grid=sim.grid(owner).slice();if(!definition||type==='farm'||type==='gate')return grid;
  const size=sim.gridSize,a=sim.cell(x-definition.r-.3,z-definition.r-.3),b=sim.cell(x+definition.r+.3,z+definition.r+.3);
  for(let cz=a.z;cz<=b.z;cz++)for(let cx=a.x;cx<=b.x;cx++)if(Math.hypot(cx*2-sim.halfWorld+1-x,cz*2-sim.halfWorld+1-z)<definition.r+.9)grid[cz*size+cx]=1;
  return grid;
}

// The last, geometry-checked construction step may enter a cell whose centre
// is covered only by the target's coarse radius. Every other obstacle remains.
export function constructionNavigationGrid(sim,target,owner){
  const normal=sim.grid(owner);let cache=constructionGrids.get(target);if(!cache){cache=new WeakMap();constructionGrids.set(target,cache);}const stored=cache.get(normal);if(stored)return stored;
  const data=normal.slice(),base=sim.grids.landBase.data,size=sim.gridSize,others=sim.entities.filter(e=>e!==target&&e.hp>0&&e.kind==='building'&&e.type!=='farm'&&!(e.type==='gate'&&sim.allied(e.owner,owner)));
  const a=sim.cell(target.x-target.r-2,target.z-target.r-2),b=sim.cell(target.x+target.r+2,target.z+target.r+2);
  for(let z=a.z;z<=b.z;z++)for(let x=a.x;x<=b.x;x++){
    const wx=x*2-sim.halfWorld+1,wz=z*2-sim.halfWorld+1,id=z*size+x;
    if(Math.hypot(wx-target.x,wz-target.z)>=target.r+.9)continue;
    data[id]=base[id]||others.some(e=>Math.hypot(wx-e.x,wz-e.z)<e.r+.9)?1:0;
  }
  blockWallConnections(sim,data);data.navigationKey='construction:'+target.id+':'+sim.revision;cache.set(normal,data);return data;
}

function crowdCosts(sim,unit){
  if((unit.stuckTime||0)<1.8)return null;
  const costs=new Map(),naval=!!sim.unitDefinition(unit).naval,nearby=[];
  if(sim.unitBuckets){const bx=Math.floor(unit.x/4),bz=Math.floor(unit.z/4);for(let x=bx-4;x<=bx+4;x++){const column=sim.unitBuckets.get(x);if(!column)continue;for(let z=bz-4;z<=bz+4;z++)for(const other of column.get(z)||[])nearby.push(other);}}
  else nearby.push(...sim.entities.filter(e=>e.kind==='unit'));
  for(const other of nearby){
    if(other===unit||other.hp<=0||other.embarked||!!sim.unitDefinition(other).naval!==naval||Math.hypot(other.x-unit.x,other.z-unit.z)>14)continue;
    const radius=(unit.r+other.r)*.8+.9,a=sim.cell(other.x-radius,other.z-radius),b=sim.cell(other.x+radius,other.z+radius);
    for(let z=a.z;z<=b.z;z++)for(let x=a.x;x<=b.x;x++){
      const distance=Math.hypot(x*2-sim.halfWorld+1-other.x,z*2-sim.halfWorld+1-other.z),id=z*sim.gridSize+x;
      if(distance<radius)costs.set(id,(costs.get(id)||0)+(radius-distance)*4);
    }
  }
  return costs.size?costs:null;
}

export class MinHeap {
  constructor(){this.items=[];}
  get size(){return this.items.length;}
  push(id,score){const item={id,score};let i=this.items.length;this.items.push(item);while(i>0){const parent=(i-1)>>1;if(this.items[parent].score<=score)break;this.items[i]=this.items[parent];i=parent;}this.items[i]=item;}
  pop(){if(!this.items.length)return null;const first=this.items[0],last=this.items.pop();if(this.items.length){let i=0;while(true){let child=i*2+1;if(child>=this.items.length)break;if(child+1<this.items.length&&this.items[child+1].score<this.items[child].score)child++;if(last.score<=this.items[child].score)break;this.items[i]=this.items[child];i=child;}this.items[i]=last;}return first.id;}
}

// Visit every crossed cell, including both neighbors at a diagonal corner.
// A clear straight segment avoids running A* for open ground and short trips.
export function clearSegment(sim,grid,from,to){
  const size=sim.gridSize,half=sim.halfWorld,start=sim.cell(from.x,from.z),end=sim.cell(to.x,to.z);
  let x=start.x,z=start.z;const dx=to.x-from.x,dz=to.z-from.z,sx=Math.sign(dx),sz=Math.sign(dz),tx=dx?2/Math.abs(dx):Infinity,tz=dz?2/Math.abs(dz):Infinity;
  let nextX=dx?((x+(sx>0?1:0))*2-half-from.x)/dx:Infinity,nextZ=dz?((z+(sz>0?1:0))*2-half-from.z)/dz:Infinity;
  const open=(xx,zz)=>xx>=0&&zz>=0&&xx<size&&zz<size&&!grid[zz*size+xx];if(!open(x,z))return false;
  for(let n=0;n<size*2+2;n++){
    if(x===end.x&&z===end.z)return true;
    if(Math.abs(nextX-nextZ)<1e-9){if(!open(x+sx,z)||!open(x,z+sz))return false;x+=sx;z+=sz;nextX+=tx;nextZ+=tz;}
    else if(nextX<nextZ){x+=sx;nextX+=tx;}else{z+=sz;nextZ+=tz;}
    if(!open(x,z))return false;
  }return false;
}

export function navigationRegions(sim,grid){
  if(grid.pathRegions)return grid.pathRegions;const size=sim.gridSize,labels=new Uint16Array(grid.length),queue=sim.regionQueue?.length===grid.length?sim.regionQueue:(sim.regionQueue=new Uint32Array(grid.length));let region=0;
  for(let first=0;first<grid.length;first++)if(!grid[first]&&!labels[first]){region++;let read=0,write=1;queue[0]=first;labels[first]=region;
    while(read<write){const id=queue[read++],x=id%size,z=Math.floor(id/size);for(const next of [x>0?id-1:-1,x<size-1?id+1:-1,z>0?id-size:-1,z<size-1?id+size:-1])if(next>=0&&!grid[next]&&!labels[next]){labels[next]=region;queue[write++]=next;}}
  }grid.pathRegions=labels;return labels;
}

function finishResourceApproach(sim,grid,unit,target,range,route){
  if(target.kind!=='resource'||!['wood','gold','stone'].includes(target.type)||!(range>0)||unit.pathStatus!=='ready')return route;
  const last=route.at(-1)||unit,distance=Math.hypot(last.x-target.x,last.z-target.z);if(distance<=range+.000001||distance>range+1.5)return route;
  const point={x:target.x+(last.x-target.x)*range/distance,z:target.z+(last.z-target.z)*range/distance},limit=sim.halfWorld-3;
  // A coarse cell center can sit just outside tool reach. Finish within that
  // navigable space; never shorten the route through a resource or a wall.
  if(Math.abs(point.x)<=limit&&Math.abs(point.z)<=limit&&clearSegment(sim,grid,last,point))route.push(point);return route;
}

export function findPath(sim,e,dest,range=0,normalOverride=null){
  const grid=unitNavigationGrid(sim,e,normalOverride),size=sim.gridSize||80,half=sim.halfWorld||80;
  const nearest=(cell,point,labels=null,region=0)=>{if(!grid[cell.z*size+cell.x]&&(!labels||labels[cell.z*size+cell.x]===region))return cell;let best=null,score=Infinity;
    for(let radius=1;radius<12;radius++){for(let z=Math.max(0,cell.z-radius);z<=Math.min(size-1,cell.z+radius);z++)for(let x=Math.max(0,cell.x-radius);x<=Math.min(size-1,cell.x+radius);x++)if(!grid[z*size+x]&&(!labels||labels[z*size+x]===region)){const wx=x*2-half+1,wz=z*2-half+1,n=Math.hypot(wx-point.x,wz-point.z)+Math.hypot(wx-e.x,wz-e.z)*.005;if(n<score){score=n;best={x,z};}}if(best&&score<radius*2)return best;}return best;};
  const requested=sim.cell(dest.x,dest.z),exact=!grid[requested.z*size+requested.x],a=nearest(sim.cell(e.x,e.z),e);let b=nearest(requested,dest);if(!a||!b){e.pathStatus='blocked';return[];}
  const traffic=crowdCosts(sim,e);
  const start=a.z*size+a.x,area=range>0&&Number.isFinite(dest.r);let end=b.z*size+b.x;
  if(!area&&start===end){e.pathStatus='ready';return finishResourceApproach(sim,grid,e,dest,range,[exact?{x:dest.x,z:dest.z}:{x:b.x*2-half+1,z:b.z*2-half+1}]);}
  if(!traffic&&exact&&clearSegment(sim,grid,e,dest)){e.pathStatus='ready';return[{x:dest.x,z:dest.z}];}
  const labels=navigationRegions(sim,grid);let goals=null;
  // A mine, drop site or combat target can be approached from multiple sides.
  // Choose a reachable cell within working range instead of forcing every unit
  // through the same nearest cell. Crowd penalties remain soft traversal costs.
  if(area){goals=new Set();const low=sim.cell(dest.x-range,dest.z-range),high=sim.cell(dest.x+range,dest.z+range);
    for(let z=low.z;z<=high.z;z++)for(let x=low.x;x<=high.x;x++){const id=z*size+x,wx=x*2-half+1,wz=z*2-half+1;
      if(!grid[id]&&labels[id]===labels[start]&&Math.abs(wx)<=half-3&&Math.abs(wz)<=half-3&&Math.hypot(wx-dest.x,wz-dest.z)<=range)goals.add(id);
    }if(!goals.size)goals=null;
  }
  if(!goals&&start===end){e.pathStatus='ready';return finishResourceApproach(sim,grid,e,dest,range,[exact?{x:dest.x,z:dest.z}:{x:b.x*2-half+1,z:b.z*2-half+1}]);}
  if(!goals&&labels[start]!==labels[end]){if(!exact)b=nearest(requested,dest,labels,labels[start]);if(exact||!b){e.pathStatus='blocked';return[];}end=b.z*size+b.x;}
  const scratch=sim.pathScratch?.size===size?sim.pathScratch:(sim.pathScratch={size,came:new Int32Array(size*size),cost:new Float32Array(size*size),closed:new Uint8Array(size*size)});
  const came=scratch.came.fill(-1),cost=scratch.cost.fill(Infinity),closed=scratch.closed.fill(0),open=new MinHeap();
  const h=goals?id=>Math.max(0,Math.hypot(id%size*2-half+1-dest.x,Math.floor(id/size)*2-half+1-dest.z)-range)/2:id=>Math.hypot(id%size-b.x,Math.floor(id/size)-b.z);cost[start]=0;let closest=start,closestH=h(start),found=-1,goalCost=Infinity,iterations=0;open.push(start,closestH);
  while(open.size&&iterations++<size*size*2){if(found>=0&&open.items[0].score>=goalCost)break;const current=open.pop();if(closed[current])continue;const remaining=h(current);if(remaining<closestH){closest=current;closestH=remaining;}
    if(goals?goals.has(current):current===end){const score=cost[current]+(goals&&current===start?traffic?.get(start)||0:0);if(score<goalCost){found=current;goalCost=score;}if(current!==start||!traffic?.get(start))break;}
    closed[current]=1;const x=current%size,z=Math.floor(current/size);
    for(const [dx,dz]of NEIGHBORS){const nx=x+dx,nz=z+dz,id=nz*size+nx;if(nx<0||nz<0||nx>=size||nz>=size||grid[id]||closed[id]||dx&&dz&&(grid[z*size+nx]||grid[nz*size+x]))continue;const n=cost[current]+(dx&&dz?1.414:1)+(traffic?.get(id)||0);if(n<cost[id]){cost[id]=n;came[id]=current;open.push(id,n+h(id));}}
  }
  e.pathStatus=found<0?'blocked':'ready';const result=[];let id=found<0?closest:found;while(id!==start&&id>=0){result.push({x:id%size*2-half+1,z:Math.floor(id/size)*2-half+1});id=came[id];}result.reverse();if(found===start&&goals)result.push({x:a.x*2-half+1,z:a.z*2-half+1});if(found>=0&&exact&&!goals&&result.length)result[result.length-1]={x:dest.x,z:dest.z};return finishResourceApproach(sim,grid,e,dest,range,result);
}
