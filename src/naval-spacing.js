import {UNITS} from './data.js';
import {navigationRegions} from './navigation.js';

// Hull clearance radii derived from authored 3D ship dimensions while remaining
// navigable across coastal seas (28m), archipelago straits (16m), and rivers (8-10m).
export const SHIP_CLEARANCE=Object.freeze({
  fishingboat:1.95,
  transport:2.25,
  galley:2.45,
  warship:2.8,
});

export function shipClearance(entityOrType){
  const type=typeof entityOrType==='string'?entityOrType:entityOrType?.type;
  return SHIP_CLEARANCE[type]??(typeof entityOrType==='object'&&entityOrType?.r?entityOrType.r:2);
}

export function navalPairClearance(a,b){
  return shipClearance(a)+shipClearance(b);
}

export function separationUnitVector(a,b){
  const dx=a.x-b.x,dz=a.z-b.z,dist=Math.hypot(dx,dz);
  if(dist>.01)return {x:dx/dist,z:dz/dist,dist};
  const low=Math.min(a.id||0,b.id||0),high=Math.max(a.id||0,b.id||0);
  const angle=((low*73+high*151)%12)*(Math.PI/6);
  const sign=(a.id||0)<=(b.id||0)?1:-1;
  return {x:Math.cos(angle)*sign,z:Math.sin(angle)*sign,dist};
}

export function canOccupyWater(sim,grid,x,z){
  const limit=sim.halfWorld-3;
  if(!Number.isFinite(x)||!Number.isFinite(z)||Math.abs(x)>limit||Math.abs(z)>limit)return false;
  if(!sim.isWater(x,z))return false;
  const cell=sim.cell(x,z);
  return !grid[cell.z*sim.gridSize+cell.x];
}

// Pick an open water berth in the dock's connected water region so newly trained
// ships never stack onto the exact same spawn pixel or clip into the pier.
export function navalSpawnPoint(sim,building,unitType='galley',ignoreUnit=null){
  const grid=sim.grid(building.owner,true),size=sim.gridSize,half=sim.halfWorld,limit=half-3;
  let anchor=null,anchorScore=Infinity,anchorId=-1;
  for(let x=-14;x<=14;x+=2)for(let z=-14;z<=14;z+=2){
    const cell=sim.cell(building.x+x,building.z+z),wx=cell.x*2-half+1,wz=cell.z*2-half+1;
    const dist=Math.hypot(wx-building.x,wz-building.z),id=cell.z*size+cell.x;
    if(dist<building.r+1||Math.abs(wx)>limit||Math.abs(wz)>limit||grid[id]||!sim.isWater(wx,wz))continue;
    if(dist<anchorScore){anchor={x:wx,z:wz};anchorScore=dist;anchorId=id;}
  }
  if(!anchor)return null;

  const labels=navigationRegions(sim,grid),region=labels[anchorId];
  const ships=(typeof sim.candidatesFor==='function'?sim.candidatesFor('unit'):sim.entities)
    .filter(e=>e.hp>0&&e.kind==='unit'&&!e.embarked&&e!==ignoreUnit&&UNITS[e.type]?.naval);
  const clearance=shipClearance(unitType);
  const pierClearance=building.r+clearance*.85;

  let bestClearPier=null,bestClearPierScore=Infinity;
  let bestClear=null,bestClearScore=Infinity;
  let bestCrowded=null,bestCrowdedOverlap=Infinity,bestCrowdedScore=Infinity;

  const visited=new Set();
  for(let x=-18;x<=18;x+=2)for(let z=-18;z<=18;z+=2){
    const cell=sim.cell(building.x+x,building.z+z),id=cell.z*size+cell.x;
    if(visited.has(id))continue;
    visited.add(id);
    if(grid[id]||(region&&labels[id]!==region))continue;
    const wx=cell.x*2-half+1,wz=cell.z*2-half+1;
    if(Math.abs(wx)>limit||Math.abs(wz)>limit||!sim.isWater(wx,wz))continue;
    const dockDist=Math.hypot(wx-building.x,wz-building.z);
    if(dockDist<building.r+1)continue;

    let overlap=0;
    for(const other of ships){
      const min=clearance+shipClearance(other);
      const d=Math.hypot(wx-other.x,wz-other.z);
      if(d<min)overlap=Math.max(overlap,min-d);
    }
    if(overlap===0){
      if(dockDist>=pierClearance&&dockDist<bestClearPierScore){
        bestClearPier={x:wx,z:wz};bestClearPierScore=dockDist;
      }
      if(dockDist<bestClearScore){
        bestClear={x:wx,z:wz};bestClearScore=dockDist;
      }
    }else if(overlap<bestCrowdedOverlap-.05||(Math.abs(overlap-bestCrowdedOverlap)<=.05&&dockDist<bestCrowdedScore)){
      bestCrowded={x:wx,z:wz};bestCrowdedOverlap=overlap;bestCrowdedScore=dockDist;
    }
  }
  return bestClearPier||bestClear||bestCrowded||anchor;
}

// Smoothly settle idle, firing, fishing, and docked ships apart so fleets never
// clip through each other's hulls or pile into a dock while staying strictly on water.
export function resolveNavalSpacing(sim,dt){
  if(!(dt>0))return;
  const units=typeof sim.candidatesFor==='function'?sim.candidatesFor('unit'):sim.entities;
  const ships=[];
  for(let i=0;i<units.length;i++){
    const e=units[i];
    if(e.hp>0&&e.kind==='unit'&&!e.embarked&&UNITS[e.type]?.naval)ships.push(e);
  }
  if(!ships.length)return;

  const buildings=typeof sim.candidatesFor==='function'?sim.candidatesFor('building'):sim.entities;
  const docks=[];
  for(let i=0;i<buildings.length;i++){
    const b=buildings[i];
    if(b.hp>0&&b.kind==='building'&&b.type==='dock'&&b.progress>=1)docks.push(b);
  }
  if(ships.length<2&&!docks.length)return;

  const pushX=new Float64Array(ships.length),pushZ=new Float64Array(ships.length);
  for(let i=0;i<ships.length;i++){
    const a=ships[i],ra=shipClearance(a);
    for(let j=i+1;j<ships.length;j++){
      const b=ships[j],min=ra+shipClearance(b);
      const dx=a.x-b.x,dz=a.z-b.z;
      if(dx*dx+dz*dz>=min*min)continue;
      const vec=separationUnitVector(a,b),overlap=min-vec.dist,half=overlap*.5;
      pushX[i]+=vec.x*half;pushZ[i]+=vec.z*half;
      pushX[j]-=vec.x*half;pushZ[j]-=vec.z*half;
    }
    for(let k=0;k<docks.length;k++){
      const dock=docks[k],min=dock.r+ra*.65;
      const dx=a.x-dock.x,dz=a.z-dock.z,d2=dx*dx+dz*dz;
      if(d2>=min*min||d2<1e-6)continue;
      const d=Math.sqrt(d2),overlap=min-d;
      pushX[i]+=dx/d*overlap*.6;pushZ[i]+=dz/d*overlap*.6;
    }
  }

  const maxStep=3.6*dt;
  for(let i=0;i<ships.length;i++){
    const px=pushX[i],pz=pushZ[i],len=Math.hypot(px,pz);
    if(len<1e-4)continue;
    const ship=ships[i],scale=len>maxStep?maxStep/len:1,dx=px*scale,dz=pz*scale;
    const grid=sim.grid(ship.owner,true);
    if(canOccupyWater(sim,grid,ship.x+dx,ship.z+dz)){
      ship.x+=dx;ship.z+=dz;
    }else if(Math.abs(dx)>1e-4&&canOccupyWater(sim,grid,ship.x+dx,ship.z)){
      ship.x+=dx;
    }else if(Math.abs(dz)>1e-4&&canOccupyWater(sim,grid,ship.x,ship.z+dz)){
      ship.z+=dz;
    }
  }
}

// Prevent a ship with a non-formation move order from endlessly ramming a parked
// ally that already occupies the target water coordinate.
export function navalDestinationOccupied(sim,unit,dest){
  const units=typeof sim.candidatesFor==='function'?sim.candidatesFor('unit'):sim.entities;
  const distToDest=Math.hypot(unit.x-dest.x,unit.z-dest.z);
  for(let i=0;i<units.length;i++){
    const other=units[i];
    if(other===unit||other.hp<=0||other.kind!=='unit'||other.embarked||!UNITS[other.type]?.naval||other.moving)continue;
    if(!sim.allied(unit.owner,other.owner))continue;
    const min=navalPairClearance(unit,other);
    if(distToDest>min+1.4)continue;
    if(Math.hypot(other.x-dest.x,other.z-dest.z)<shipClearance(other)*.9&&Math.hypot(unit.x-other.x,unit.z-other.z)<=min+1.1)return true;
  }
  return false;
}
