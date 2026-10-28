import {SpatialBuckets} from './spatial-buckets.js';

// Placement uses static objects, not the unit index captured at tick start:
// another commander may have placed a new foundation during this same tick.
const indices=new WeakMap();
function addObstacle(index,entity){
  if(entity.kind!=='building'&&entity.kind!=='resource')return;
  index.buckets.add(entity);index.radius=Math.max(index.radius,entity.r||0);
}

export function recordPlacementAppend(sim,entity,previousRevision){
  const index=indices.get(sim);
  if(!index||index.entities!==sim.entities||index.length!==sim.entities.length-1||index.revision!==previousRevision)return;
  addObstacle(index,entity);index.length=sim.entities.length;index.revision=sim.revision;
}

function obstacleIndex(sim){
  let index=indices.get(sim);
  if(!index){index={buckets:new SpatialBuckets(8)};indices.set(sim,index);}
  if(index.entities!==sim.entities||index.length!==sim.entities.length||index.revision!==sim.revision){
    index.buckets.reset();index.radius=0;
    for(const entity of sim.entities)addObstacle(index,entity);
    index.entities=sim.entities;index.length=sim.entities.length;index.revision=sim.revision;
  }
  return index;
}

export function placementCollision(sim,type,x,z,radius){
  x=Number(x);z=Number(z);
  const index=obstacleIndex(sim),reach=radius+index.radius+.8,columns=index.buckets.columns;
  const lowX=Math.floor((x-reach)/8),highX=Math.floor((x+reach)/8),lowZ=Math.floor((z-reach)/8),highZ=Math.floor((z+reach)/8);
  for(let bx=lowX;bx<=highX;bx++){
    const column=columns.get(bx);if(!column)continue;
    for(let bz=lowZ;bz<=highZ;bz++)for(const entity of column.get(bz)||[]){
      if(entity.hp<=0||entity.kind==='resource'&&(entity.water||!['wood','gold','stone'].includes(entity.type)))continue;
      const clearance=type==='wall'&&entity.kind==='resource'&&entity.type==='wood'?entity.r+.8:entity.r+radius+(type==='wall'&&entity.type==='wall'?-.3:.8);
      const dx=entity.x-x,dz=entity.z-z;if(Math.sqrt(dx*dx+dz*dz)<clearance)return true;
    }
  }
  return false;
}
