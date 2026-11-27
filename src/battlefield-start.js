import {bridgeFootprint} from './bridge-layout.js';
import {fordAt} from './map-water.js';
import {navigationRegions} from './navigation.js';
import {bridgePointClear,bridgeUnitClearance} from './bridge-navigation.js';
import {gatheringPathRange} from './work-ranges.js';

export const BATTLEFIELD_LAYOUT_VERSION=4;

const near=(a,b,radius)=>(a.x-b.x)**2+(a.z-b.z)**2<radius**2;
const solidBuilding=e=>e.kind==='building'&&e.type!=='farm';
const solidResource=e=>e.kind==='resource'&&!e.water&&e.type!=='food';
const startingSupply=[['wood',300,300,1.1],['food',350,500,1.7],['gold',1800,2200,1.7],['stone',1800,2200,1.7]];

function cellIndex(sim,point){
  const cell=sim.cell(point.x,point.z);
  return cell.z*sim.gridSize+cell.x;
}

function settlementRegion(sim,grid,center){
  const labels=navigationRegions(sim,grid),counts=new Map();
  let best=0,most=0;
  for(let z=-12;z<=12;z+=2)for(let x=-12;x<=12;x+=2){
    if(x*x+z*z>144)continue;
    const label=labels[cellIndex(sim,{x:center.x+x,z:center.z+z})];
    if(!label)continue;
    const count=(counts.get(label)||0)+1;
    counts.set(label,count);
    if(count>most){best=label;most=count;}
  }
  return best;
}

export function dryFootprint(sim,point,radius){
  if(Math.abs(point.x)+radius>sim.halfWorld-2||Math.abs(point.z)+radius>sim.halfWorld-2||
    bridgeFootprint(sim.options.map,point.x,point.z,radius)||fordAt(sim.options.map,point.x,point.z,radius))return false;
  for(const x of [-radius,0,radius])for(const z of [-radius,0,radius])if(sim.isWater(point.x+x,point.z+z))return false;
  return true;
}

export function nearbyPoint(origin,maxRadius,step,accept){
  for(let radius=step;radius<=maxRadius;radius+=step){
    const count=Math.max(8,Math.ceil(2*Math.PI*radius/step));
    for(let i=0;i<count;i++){
      const angle=i*2*Math.PI/count,point={x:origin.x+Math.cos(angle)*radius,z:origin.z+Math.sin(angle)*radius};
      if(accept(point))return point;
    }
  }
  return null;
}

// The stock settlement templates are authored in world units. Resolve
// overlapping additions before resources and cliffs are planted around them.
export function spaceStartingBuildings(sim){
  const buildings=sim.entities.filter(e=>e.hp>0&&e.kind==='building');
  const fixed=e=>['towncenter','wall','gate','dock'].includes(e.type);
  const reserveFixed=sim.battlefieldLayout>=3;
  // Shore buildings and capitals have authored sites. Reserve them before
  // fitting the rest of a settlement, even if they were added later.
  const placed=reserveFixed?buildings.filter(fixed):[];
  for(const building of buildings){
    if(!fixed(building)){
      const clearOf=(point,obstacle)=>obstacle===building||!near(point,obstacle,building.r+obstacle.r+.55);
      if(!dryFootprint(sim,building,building.r)||placed.some(e=>!clearOf(building,e))){
        const point=nearbyPoint(building,22,1,candidate=>
          dryFootprint(sim,candidate,building.r)&&buildings.every(e=>clearOf(candidate,e)));
        if(point)Object.assign(building,point);
      }
    }
    if(!reserveFixed||!fixed(building))placed.push(building);
  }
}

function gateApproach(gate,point,pad){
  const angle=gate.wallAngle||0,dx=point.x-gate.x,dz=point.z-gate.z,c=Math.cos(angle),s=Math.sin(angle);
  return Math.abs(dx*c-dz*s)<2.65+pad&&Math.abs(dx*s+dz*c)<9+pad;
}

// A gate's floor may be open while a nearby workshop or keep covers the
// road. Give that building a nearby site on the same side of the wall.
export function openStartingGateLanes(sim){
  if(sim.battlefieldLayout<2)return;
  const gates=sim.entities.filter(e=>e.hp>0&&e.type==='gate');
  if(!gates.length)return;
  const obstacles=sim.entities.filter(e=>e.hp>0&&(e.kind==='building'||solidResource(e))).concat(sim.barriers);
  let moved=false;
  for(const building of obstacles){
    if(!solidBuilding(building)||['towncenter','wall','gate','dock'].includes(building.type))continue;
    const gate=gates.find(e=>e.owner===building.owner&&gateApproach(e,building,building.r+.6));
    if(!gate)continue;
    const angle=gate.wallAngle||0,s=Math.sin(angle),c=Math.cos(angle);
    const side=point=>Math.sign((point.x-gate.x)*s+(point.z-gate.z)*c);
    const originalSide=side(building);
    const point=nearbyPoint(building,16,1,candidate=>
      side(candidate)===originalSide&&dryFootprint(sim,candidate,building.r)&&
      gates.every(e=>!gateApproach(e,candidate,building.r+.6))&&
      obstacles.every(e=>e===building||!near(candidate,e,building.r+e.r+.65)));
    if(point){Object.assign(building,point);moved=true;}
  }
  if(moved){sim.revision++;sim.grids={};sim.sightCache=null;}
}

// Relocate veins covered by a starting building or a gate approach.
// Deposits near a gate stay on their original side.
export function clearStartingDeposits(sim){
  const living=sim.entities.filter(e=>e.hp>0);
  const gates=living.filter(e=>e.type==='gate');
  const buildings=living.filter(e=>solidBuilding(e)&&!['wall','gate'].includes(e.type));
  const obstacles=living.filter(e=>e.kind!=='unit'&&!e.water).concat(sim.barriers);
  let changed=false;
  for(const resource of living){
    if(!solidResource(resource))continue;
    const gate=gates.find(e=>gateApproach(e,resource,resource.r+.7));
    if(!gate&&!buildings.some(e=>near(e,resource,e.r+resource.r-.2)))continue;
    if(resource.type==='wood'){
      resource.hp=0;changed=true;continue;
    }
    const angle=gate?.wallAngle||0,s=Math.sin(angle),c=Math.cos(angle);
    const side=point=>gate?Math.sign((point.x-gate.x)*s+(point.z-gate.z)*c):0;
    const from=side(resource);
    const point=nearbyPoint(resource,sim.battlefieldLayout>=4?18:12,1,point=>
      side(point)===from&&dryFootprint(sim,point,resource.r)&&
      gates.every(e=>!gateApproach(e,point,resource.r+.7))&&
      obstacles.every(e=>e===resource||e.hp===0||!near(e,point,e.r+resource.r+.45)));
    if(point){Object.assign(resource,point);changed=true;}
  }
  if(changed){sim.revision++;sim.grids={};}
}

function supplyApproach(sim,grid,region,resource,placing=false){
  const reach=gatheringPathRange({r:.65},resource),size=sim.gridSize,half=sim.halfWorld;
  const first=sim.cell(resource.x-reach,resource.z-reach),last=sim.cell(resource.x+reach,resource.z+reach);
  const blocked=placing&&solidResource(resource)?cellIndex(sim,resource):-1;
  for(let z=first.z;z<=last.z;z++)for(let x=first.x;x<=last.x;x++){
    const i=z*size+x,dx=x*2-half+1-resource.x,dz=z*2-half+1-resource.z,distance=dx*dx+dz*dz;
    if(i!==blocked&&grid.pathRegions[i]===region&&distance<=reach*reach&&
      (blocked===-1||distance>=(resource.r+.1)**2))return true;
  }
  return false;
}

// Add a local reserve only when the finished landscape leaves the capital
// without a worker-accessible supply. Keep the original economy where it works.
export function ensureStartingSupplies(sim){
  const obstacles=sim.entities.filter(e=>e.hp>0&&!e.water).concat(sim.barriers);
  const capitals=obstacles.filter(e=>e.type==='towncenter');
  const gates=obstacles.filter(e=>e.type==='gate');
  const positionIndex=owner=>sim.battlefieldLayout>=2&&sim.options.mode==='custom'
    ? sim.options.slots[owner].slotNumber-1 : owner;
  if(sim.battlefieldLayout>=2)capitals.sort((a,b)=>positionIndex(a.owner)-positionIndex(b.owner));
  for(const capital of capitals){
    // The hostile grid keeps the gates shut. Reserves for a fortified
    // settlement must be accessible from the protected side.
    const fortified=gates.some(gate=>gate.owner===capital.owner&&near(gate,capital,52));
    const rival=fortified?sim.players.findIndex((_,owner)=>sim.hostile(capital.owner,owner)):-1;
    const grid=sim.grid(rival<0?capital.owner:rival),region=settlementRegion(sim,grid,capital);
    if(!region)continue;
    const supplied=new Set();
    for(const e of obstacles){
      if(e.kind==='resource'&&e.amount>0&&!supplied.has(e.type)&&near(capital,e,42)&&supplyApproach(sim,grid,region,e)){
        supplied.add(e.type);
      }
    }
    const radii=sim.battlefieldLayout>=2?[24,21,27,18,30,15,34,38,12,10,8]:[24,21,27,18,30,15,34,38];
    for(const [type,standardAmount,customAmount,r] of startingSupply){
      if(supplied.has(type))continue;
      let location=null;
      for(const radius of radii){
        for(let i=0;i<32;i++){
          const angle=(i+positionIndex(capital.owner)*.5)*Math.PI/16;
          const point={kind:'resource',type,r,x:capital.x+Math.cos(angle)*radius,z:capital.z+Math.sin(angle)*radius};
          // Keep open beaches for transports and ship-to-shore troops.
          const shoreRoom=r+5;
          if(!dryFootprint(sim,point,r)||sim.startClearing(point.x,point.z)||
            [[shoreRoom,0],[-shoreRoom,0],[0,shoreRoom],[0,-shoreRoom]].some(([x,z])=>sim.isWater(point.x+x,point.z+z))||
            grid.pathRegions[cellIndex(sim,point)]!==region||
            gates.some(gate=>gateApproach(gate,point,r+.7))||
            obstacles.some(e=>near(e,point,e.r+r+1))||
            !supplyApproach(sim,grid,region,point,true))continue;
          location=point;
          break;
        }
        if(location)break;
      }
      if(location){
        const amount=sim.options.mode==='custom'?customAmount:standardAmount;
        const deposit=sim.addNaturalResource(type,location.x,location.z,amount);
        if(type==='wood')deposit.startForest=capital.owner;
        else deposit.startDeposit=capital.owner;
        obstacles.push(deposit);
      }
    }
  }
}

// Place each opening land unit on a reachable tile with room for its model.
// Preserve authored coordinates for units with a clear starting position.
export function clearStartingUnitPositions(sim){
  const living=sim.entities.filter(e=>e.hp>0);
  const obstacles=living.filter(e=>solidBuilding(e)||solidResource(e)).concat(sim.barriers);
  const units=living.filter(e=>e.kind==='unit'&&!e.embarked&&!sim.unitDefinition(e).naval);
  const half=sim.halfWorld;
  const regionByOwner=new Map();
  let moved=false;
  for(const unit of units){
    const grid=sim.grid(unit.owner),radius=bridgeUnitClearance(unit);
    const clear=point=>Math.abs(point.x)<=half-3&&Math.abs(point.z)<=half-3&&
      !sim.isWater(point.x,point.z)&&!grid[cellIndex(sim,point)]&&bridgePointClear(sim.options.map,point.x,point.z,radius)&&
      !obstacles.some(e=>!(e.type==='gate'&&sim.allied(e.owner,unit.owner))&&near(e,point,e.r+unit.r*.6));
    // Prefer the opening army's side when the unit was authored on an
    // obstacle near its capital. Remote escorts and garrisons stay local.
    const start=sim.players[unit.owner]?.start;
    const space=clear(unit)&&!units.some(other=>other.id<unit.id&&near(unit,other,(unit.r+other.r)*.68));
    if(space&&sim.battlefieldLayout<2)continue;
    let region=0;
    if(start&&near(unit,start,28)){
      if(!regionByOwner.has(unit.owner))regionByOwner.set(unit.owner,settlementRegion(sim,grid,start));
      region=regionByOwner.get(unit.owner);
    }
    if(space&&(!region||region===grid.pathRegions[cellIndex(sim,unit)]))continue;
    const available=point=>clear(point)&&!units.some(other=>other!==unit&&near(point,other,(unit.r+other.r)*.85));
    const sameRegion=point=>grid.pathRegions[cellIndex(sim,point)]===region&&available(point);
    const point=(region&&nearbyPoint(unit,16,1,sameRegion))||nearbyPoint(unit,24,1,available);
    if(point){Object.assign(unit,point);moved=true;}
  }
  if(moved)sim.sightCache=null;
  return moved;
}
