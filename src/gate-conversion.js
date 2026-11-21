import {BUILDINGS} from './data.js';
import {wallEndpointTree} from './walls.js';

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
  const cost=sim.cost(BUILDINGS.gate.cost,owner,'building');
  cost.stone=Math.max(0,cost.stone-sections.length*sim.cost(BUILDINGS.wall.cost,owner,'building').stone);
  return {center,sections,ids,outer,cost,angle:-Math.atan2(dz,dx)};
}
