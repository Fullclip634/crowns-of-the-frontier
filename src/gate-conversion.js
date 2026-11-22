import {BUILDINGS} from './data.js';
import {wallBuildCost} from './fortified-walls.js';
import {wallEndpointTree} from './walls.js';

const GATE_WALL_CLEARANCE=BUILDINGS.wall.r+BUILDINGS.gate.r+.8;

function inferWallAngle(sim,wall){
  const neighbors=(wall.wallLinks||[]).map(id=>sim.get(id)).filter(other=>other?.hp>0&&other.kind==='building'&&(other.type==='wall'||other.type==='gate'));
  if(neighbors.length>=2){
    for(let i=0;i<neighbors.length;i++){
      for(let j=i+1;j<neighbors.length;j++){
        const a=neighbors[i],b=neighbors[j];
        const ax=wall.x-a.x,az=wall.z-a.z,al=Math.hypot(ax,az);
        const bx=b.x-wall.x,bz=b.z-wall.z,bl=Math.hypot(bx,bz);
        if(al>1e-6&&bl>1e-6&&(ax*bx+az*bz)/(al*bl)>.7)return -Math.atan2(b.z-a.z,b.x-a.x);
      }
    }
  }
  if(neighbors.length>=1){
    const nearest=neighbors.slice().sort((a,b)=>Math.hypot(a.x-wall.x,a.z-wall.z)-Math.hypot(b.x-wall.x,b.z-wall.z))[0];
    return -Math.atan2(nearest.z-wall.z,nearest.x-wall.x);
  }
  return Number.isFinite(wall.wallAngle)?wall.wallAngle:0;
}

// Allow placing a gate directly onto owned walls (completed or under
// construction), Age of Empires style: own walls never block a gate, the gate
// snaps and aligns to the wall line, credits replaced wall costs, and links
// seamlessly to surviving outer wall ends.
export function gatePlacementPlan(sim,x,z,owner=0){
  const buildings=typeof sim.candidatesFor==='function'?sim.candidatesFor('building'):sim.entities;
  const ownWalls=buildings.filter(e=>e.hp>0&&e.kind==='building'&&e.type==='wall'&&e.owner===owner);
  const evaluate=(cx,cz,preferredAngle)=>{
    const sections=ownWalls.filter(wall=>Math.hypot(wall.x-cx,wall.z-cz)<wall.r+BUILDINGS.gate.r+.8);
    const ids=new Set(sections.map(wall=>wall.id));
    const valid=sim.buildValid('gate',cx,cz,owner,ids);
    const outerMap=new Map();
    for(const wall of sections){
      for(const linkId of wall.wallLinks||[]){
        if(ids.has(linkId)||outerMap.has(linkId))continue;
        const other=sim.get(linkId);
        if(other?.hp>0&&other.kind==='building'&&other.type==='wall'&&other.owner===owner)outerMap.set(linkId,other);
      }
    }
    const rawOuter=[...outerMap.values()];
    let angle=preferredAngle;
    if(angle===undefined){
      const near=ownWalls
        .filter(wall=>!ids.has(wall.id)&&Math.hypot(wall.x-cx,wall.z-cz)<=6.5)
        .sort((a,b)=>Math.hypot(a.x-cx,a.z-cz)-Math.hypot(b.x-cx,b.z-cz)||a.id-b.id);
      if(rawOuter.length>=2)angle=-Math.atan2(rawOuter[1].z-rawOuter[0].z,rawOuter[1].x-rawOuter[0].x);
      else if(rawOuter.length===1)angle=-Math.atan2(rawOuter[0].z-cz,rawOuter[0].x-cx);
      else if(near.length>=2){
        const a=near[0],b=near.find(n=>{
          const ax=cx-a.x,az=cz-a.z,bx=n.x-cx,bz=n.z-cz,al=Math.hypot(ax,az),bl=Math.hypot(bx,bz);
          return al>1e-6&&bl>1e-6&&(ax*bx+az*bz)/(al*bl)>.7;
        });
        angle=b?-Math.atan2(b.z-a.z,b.x-a.x):-Math.atan2(a.z-cz,a.x-cx);
      }else if(near.length===1){
        angle=-Math.atan2(near[0].z-cz,near[0].x-cx);
      }
    }
    const ax=Math.cos(angle||0),az=-Math.sin(angle||0);
    const outer=rawOuter.filter(other=>{
      const dx=other.x-cx,dz=other.z-cz,d=Math.hypot(dx,dz);
      return d>1e-6&&d<=7.2&&Math.abs((dx*ax+dz*az)/d)>=.72;
    });
    const cost=sim.cost(wallBuildCost(sim,owner,'gate'),owner,'building');
    if(sections.length){
      const wallCost=sim.cost(wallBuildCost(sim,owner,'wall'),owner,'building');
      for(const [resource,amount]of Object.entries(wallCost)){
        if(resource in cost)cost[resource]=Math.max(0,cost[resource]-sections.length*amount);
      }
    }
    return {x:cx,z:cz,angle,sections,ids,outer,cost,valid};
  };
  const overlapping=ownWalls
    .filter(wall=>Math.hypot(wall.x-x,wall.z-z)<GATE_WALL_CLEARANCE)
    .sort((a,b)=>Math.hypot(a.x-x,a.z-z)-Math.hypot(b.x-x,b.z-z)||a.id-b.id);
  if(overlapping.length){
    const anchor=overlapping[0],anchorAngle=inferWallAngle(sim,anchor);
    const snapped=evaluate(anchor.x,anchor.z,anchorAngle);
    if(snapped.valid)return snapped;
    const direct=evaluate(x,z,anchorAngle);
    return direct.valid?direct:snapped;
  }
  return evaluate(x,z,undefined);
}

export function gateConversionPlan(sim,id,owner=0){
  const center=sim.get(id);
  const usable=wall=>wall?.type==='wall'&&wall.owner===owner&&wall.hp>0&&wall.progress>=1&&!wall.wallSupports?.length;
  if(!usable(center)||sim.players[owner].age<BUILDINGS.gate.age)return null;
  const neighbors=wall=>(wall.wallLinks||[]).map(id=>sim.get(id)).filter(other=>other?.hp>0);
  const sides=neighbors(center);
  if(sides.length!==2||!sides.every(usable))return null;
  const [left,right]=sides,dx=right.x-left.x,dz=right.z-left.z,span=Math.hypot(dx,dz);
  if(!span)return null;
  const axis={x:dx/span,z:dz/span};
  const straight=(a,b,direction)=>{
    const x=b.x-a.x,z=b.z-a.z,length=Math.hypot(x,z);
    return length>=2.65&&length<=3.36&&direction*(axis.x*x+axis.z*z)>=length*.99;
  };
  if(!straight(center,left,-1)||!straight(center,right,1))return null;
  const sections=[left,center,right],ids=new Set(sections.map(wall=>wall.id)),outer=[];
  for(const [end,direction] of [[left,-1],[right,1]]){
    const beyond=neighbors(end).filter(wall=>!ids.has(wall.id));
    if(beyond.length>1||beyond.some(wall=>wall.owner!==owner||wall.type!=='wall'||!straight(end,wall,direction)))return null;
    if(!beyond.length&&wallEndpointTree(sim,end))return null;
    outer.push(...beyond);
  }
  if(!sim.buildValid('gate',center.x,center.z,owner,ids))return null;
  const cost=sim.cost(wallBuildCost(sim,owner,'gate'),owner,'building');
  const wallCost=sim.cost(wallBuildCost(sim,owner,'wall'),owner,'building');
  for(const [resource,amount]of Object.entries(wallCost)){
    if(resource in cost)cost[resource]=Math.max(0,cost[resource]-sections.length*amount);
  }
  return {center,sections,ids,outer,cost,angle:-Math.atan2(dz,dx)};
}
