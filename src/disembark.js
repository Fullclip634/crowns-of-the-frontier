import {UNITS} from './data.js';
import {clearSegment} from './navigation.js';
import {wallConnections} from './walls.js';

const distance=(a,b)=>Math.hypot(a.x-b.x,a.z-b.z);
// The siege artwork extends beyond its movement collision circle. Reserve its
// swept model envelope at release without changing combat or navigation radii.
export const landingClearance=unit=>Math.max(unit.r,{ram:2.7,catapult:3.3}[unit.type]||unit.r);
export const landingGroundClearance=unit=>Math.max(unit.r,['ram','catapult'].includes(unit.type)?2.1:unit.r);
const segmentDistance=(point,a,b)=>{
  const dx=b.x-a.x,dz=b.z-a.z,length=dx*dx+dz*dz;
  const t=length?Math.max(0,Math.min(1,((point.x-a.x)*dx+(point.z-a.z)*dz)/length)):0;
  return Math.hypot(point.x-a.x-t*dx,point.z-a.z-t*dz);
};

// Plan before changing passengers. Every released troop reserves real room;
// a crowded beach can accept part of the cargo without stacking the rest.
export function disembarkSlots(sim,ship,point,passengers){
  if(!passengers.length)return [];
  const size=sim.gridSize,half=sim.halfWorld,sea=sim.grid(ship.owner,true),approaches=new Map();
  const approachFor=grid=>{
    if(!approaches.has(grid)){
      const approach=grid.slice();for(let i=0;i<approach.length;i++)if(!sea[i])approach[i]=0;
      approaches.set(grid,approach);
    }
    return approaches.get(grid);
  };
  const nearby=sim.entities.filter(e=>e.hp>0&&!e.embarked&&distance(e,point)<16);
  const standing=nearby.filter(e=>e.kind==='unit'&&!UNITS[e.type].naval).map(e=>({x:e.x,z:e.z,r:landingClearance(e)}));
  const obstacles=nearby.filter(e=>e.kind==='building'&&e.type!=='farm'||e.kind==='resource'&&!e.water&&['wood','gold','stone'].includes(e.type));
  const joins=wallConnections(sim.entities).filter(({collisionStart:a,collisionEnd:b})=>segmentDistance(point,a,b)<14);
  const low=sim.cell(point.x-8,point.z-8),high=sim.cell(point.x+8,point.z+8),candidates=[{...point}];
  for(let z=low.z;z<=high.z;z++)for(let x=low.x;x<=high.x;x++){
    const p={x:x*2-half+1,z:z*2-half+1};
    if(distance(p,point)<=8&&distance(p,ship)<=11)candidates.push(p);
  }
  candidates.sort((a,b)=>distance(a,point)-distance(b,point)||distance(a,ship)-distance(b,ship)||a.z-b.z||a.x-b.x);
  const reserved=[...standing],result=[];
  for(const unit of [...passengers].sort((a,b)=>landingClearance(b)-landingClearance(a)||a.id-b.id)){
    const radius=landingClearance(unit),groundRadius=landingGroundClearance(unit);
    const grid=sim.grid(unit.owner),approach=approachFor(grid),cell=sim.cell(point.x,point.z);
    if(grid[cell.z*size+cell.x]||!clearSegment(sim,approach,ship,point))continue;
    const spot=candidates.find(p=>{
      if(Math.abs(p.x)>half-groundRadius-2||Math.abs(p.z)>half-groundRadius-2||distance(p,ship)>11)return false;
      const cell=sim.cell(p.x,p.z);
      if(grid[cell.z*size+cell.x]||!clearSegment(sim,approach,ship,p)||!clearSegment(sim,grid,point,p))return false;
      if(reserved.some(other=>distance(p,other)<radius+other.r+.15))return false;
      if(obstacles.some(other=>!(other.type==='gate'&&sim.allied(unit.owner,other.owner))&&distance(p,other)<radius+other.r+.1))return false;
      if(joins.some(({collisionStart:a,collisionEnd:b})=>segmentDistance(p,a,b)<radius+.85))return false;
      for(let i=0;i<16;i++)if(sim.isWater(p.x+Math.cos(i*Math.PI/8)*(groundRadius+.05),p.z+Math.sin(i*Math.PI/8)*(groundRadius+.05)))return false;
      return true;
    });
    if(spot){result.push({unit,point:spot});reserved.push({...spot,r:radius});}
  }
  return result;
}
