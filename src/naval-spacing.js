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

// Compute the canonical water-facing direction of a dock by averaging all open-water
// probe rays around it, matching orientDockPier so visuals and ship clearance agree.
export function dockWaterAngle(sim,dock){
  if(!sim||!dock)return 0;
  let sx=0,sz=0,hits=0;
  for(let i=0;i<16;i++){
    const a=i*Math.PI/8;
    if(sim.isWater(dock.x+Math.cos(a)*9,dock.z+Math.sin(a)*9)){
      sx+=Math.cos(a);sz+=Math.sin(a);hits++;
    }
  }
  if(hits>0&&Math.hypot(sx,sz)>1e-4)return Math.atan2(sz,sx);
  for(let i=0;i<16;i++){
    const a=i*Math.PI/8;
    if(sim.isWater(dock.x+Math.cos(a)*7,dock.z+Math.sin(a)*7))return a;
  }
  return 0;
}

// Physical pier center along the dock's water-facing jetty (matches compact 4.5m wharf pier).
export const DOCK_PIER_OFFSET=3.1;
export const DOCK_PIER_RADIUS=1.75;

export function dockPierCenter(sim,dock){
  const angle=dockWaterAngle(sim,dock);
  return {x:dock.x+Math.cos(angle)*DOCK_PIER_OFFSET,z:dock.z+Math.sin(angle)*DOCK_PIER_OFFSET,angle};
}

// Pick an open water berth in the dock's connected water region so newly trained
// ships never stack onto the exact same spawn pixel or clip into the pier.
export function navalSpawnPoint(sim,building,unitType='galley',ignoreUnit=null){
  const grid=sim.grid(building.owner,true),size=sim.gridSize,half=sim.halfWorld,limit=half-3;
  const pier=dockPierCenter(sim,building);
  let anchor=null,anchorScore=Infinity,anchorId=-1;
  for(let x=-16;x<=16;x+=2)for(let z=-16;z<=16;z+=2){
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
  const dockClear=Math.max(building.r,3.4)+clearance*1.05;
  const pierClear=DOCK_PIER_RADIUS+clearance*1.15;

  let bestClearPier=null,bestClearPierScore=Infinity;
  let bestClear=null,bestClearScore=Infinity;
  let bestCrowded=null,bestCrowdedOverlap=Infinity,bestCrowdedScore=Infinity;

  const visited=new Set();
  for(let x=-20;x<=20;x+=2)for(let z=-20;z<=20;z+=2){
    const cell=sim.cell(building.x+x,building.z+z),id=cell.z*size+cell.x;
    if(visited.has(id))continue;
    visited.add(id);
    if(grid[id]||(region&&labels[id]!==region))continue;
    const wx=cell.x*2-half+1,wz=cell.z*2-half+1;
    if(Math.abs(wx)>limit||Math.abs(wz)>limit||!sim.isWater(wx,wz))continue;
    const dockDist=Math.hypot(wx-building.x,wz-building.z);
    if(dockDist<building.r+1)continue;
    const pierDist=Math.hypot(wx-pier.x,wz-pier.z);

    let overlap=0;
    for(const other of ships){
      const min=clearance+shipClearance(other);
      const d=Math.hypot(wx-other.x,wz-other.z);
      if(d<min)overlap=Math.max(overlap,min-d);
    }
    if(overlap===0){
      if(dockDist>=dockClear&&pierDist>=pierClear&&dockDist<bestClearPierScore){
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
// clip through each other's hulls or pile into a dock wharf or pier while staying on water.
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
    if(b.hp>0&&b.kind==='building'&&b.type==='dock')docks.push({dock:b,pier:dockPierCenter(sim,b)});
  }
  if(ships.length<2&&!docks.length)return;

  const pushX=new Float64Array(ships.length),pushZ=new Float64Array(ships.length);
  const dockPushed=new Uint8Array(ships.length);
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
      const {dock,pier}=docks[k];
      const coreMin=Math.max(dock.r,3.4)+ra*1.02;
      const dx=a.x-dock.x,dz=a.z-dock.z,d2=dx*dx+dz*dz;
      if(d2<coreMin*coreMin){
        const d=Math.sqrt(d2),nx=d>1e-4?dx/d:Math.cos(pier.angle),nz=d>1e-4?dz/d:Math.sin(pier.angle);
        const overlap=coreMin-d;
        pushX[i]+=nx*overlap*.95;pushZ[i]+=nz*overlap*.95;dockPushed[i]=1;
      }
      const pierMin=DOCK_PIER_RADIUS+ra*1.12;
      const pdx=a.x-pier.x,pdz=a.z-pier.z,pd2=pdx*pdx+pdz*pdz;
      if(pd2<pierMin*pierMin){
        const pd=Math.sqrt(pd2),nx=pd>1e-4?pdx/pd:Math.cos(pier.angle),nz=pd>1e-4?pdz/pd:Math.sin(pier.angle);
        const overlap=pierMin-pd;
        pushX[i]+=nx*overlap*.95;pushZ[i]+=nz*overlap*.95;dockPushed[i]=1;
      }
    }
  }

  for(let i=0;i<ships.length;i++){
    const px=pushX[i],pz=pushZ[i],len=Math.hypot(px,pz);
    if(len<1e-4)continue;
    const maxStep=(dockPushed[i]?5.6:3.6)*dt;
    const ship=ships[i],scale=len>maxStep?maxStep/len:1,dx=px*scale,dz=pz*scale;
    const grid=sim.grid(ship.owner,true);
    if(canOccupyWater(sim,grid,ship.x+dx,ship.z+dz)){
      ship.x+=dx;ship.z+=dz;
    }else if(Math.abs(dx)>1e-4&&canOccupyWater(sim,grid,ship.x+dx,ship.z)){
      ship.x+=dx;
    }else if(Math.abs(dz)>1e-4&&canOccupyWater(sim,grid,ship.x,ship.z+dz)){
      ship.z+=dz;
    }else if(dockPushed[i]&&sim.isWater(ship.x+dx,ship.z+dz)){
      // Allow a ship already trapped inside a blocked dock-pier cell to escape into open water.
      ship.x+=dx;ship.z+=dz;
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
