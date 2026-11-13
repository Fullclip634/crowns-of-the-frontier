// Simulation-only scratch storage. Reuse numeric cells and their arrays while
// retaining entity order within each cell. Reset releases every entity reference.
export class SpatialBuckets{
  constructor(cellSize){this.cellSize=cellSize;this.columns=new Map();this.active=[];}
  reset(){for(const bucket of this.active){bucket.length=0;if(bucket.combat)bucket.combat.length=0;}this.active.length=0;}
  add(entity,combat=false){
    const x=Math.floor(entity.x/this.cellSize),z=Math.floor(entity.z/this.cellSize);
    let column=this.columns.get(x);if(!column){column=new Map();this.columns.set(x,column);}
    let bucket=column.get(z);if(!bucket){bucket=[];column.set(z,bucket);}
    if(!bucket.length)this.active.push(bucket);bucket.push(entity);if(combat)(bucket.combat??=[]).push(entity);
  }
}

// Visits every mobile unit whose bucket (cell size 4) overlaps the query disc.
// Falls back to the linear entity list in unit-test fixtures that skip sim.tick().
export function forEachNearbyUnit(sim,x,z,radius,visitor){
  if(sim.unitBuckets?.size){
    const minX=Math.floor((x-radius)/4),maxX=Math.floor((x+radius)/4);
    const minZ=Math.floor((z-radius)/4),maxZ=Math.floor((z+radius)/4);
    for(let bx=minX;bx<=maxX;bx++){
      const column=sim.unitBuckets.get(bx);
      if(!column)continue;
      for(let bz=minZ;bz<=maxZ;bz++){
        const bucket=column.get(bz);
        if(bucket)for(const unit of bucket)visitor(unit);
      }
    }
    return;
  }
  for(const entity of sim.entities)if(entity.kind==='unit')visitor(entity);
}
