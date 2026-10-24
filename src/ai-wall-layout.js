import {WALL_SPACING} from './walls.js';
import {BUILDINGS,UNITS} from './data.js';
import {bridgeFootprint} from './bridge-layout.js';

export const naturalWallAnchor=(sim,piece)=>piece.anchorIds?.some(id=>{const e=sim.get(id);return e?.kind==='resource'&&!e.water&&['wood','gold','stone'].includes(e.type)&&e.amount>0;})||false;

// Search buildable wall positions around each side of the settlement. Natural
// obstacles may close a boundary, but never stand in for a future paid wall.
export function* adaptivePerimeterLayouts(sim,plan,owner){
  const front=plan.pieces[0],angle=plan.angle,normal={x:Math.sin(angle),z:Math.cos(angle)},tangent={x:normal.z,z:-normal.x},cache=new Map();
  const base=sim.get(plan.base),depth=(front.x-base.x)*normal.x+(front.z-base.z)*normal.z,coreRow=depth/WALL_SPACING+2;
  const occupants=sim.entities.filter(e=>e.hp>0&&e.kind==='unit'&&!e.embarked&&!UNITS[e.type].naval&&sim.allied(owner,e.owner)&&Math.hypot(e.x-front.x,e.z-front.z)<48);
  const point=(x,y)=>{
    const key=x+':'+y;if(cache.has(key))return cache.get(key);
    const p={type:'wall',x:front.x+tangent.x*x*WALL_SPACING-normal.x*y*WALL_SPACING,z:front.z+tangent.z*x*WALL_SPACING-normal.z*y*WALL_SPACING,angle};
    const previous=plan.pieces.find(piece=>Math.hypot(piece.x-p.x,piece.z-p.z)<.01);
    if(previous){Object.assign(p,previous);cache.set(key,p);return p;}
    if(occupants.some(unit=>Math.hypot(unit.x-p.x,unit.z-p.z)<BUILDINGS.wall.r+unit.r+.12)){cache.set(key,null);return null;}
    if(!sim.canSee(owner,p)){cache.set(key,null);return null;}
    if(!sim.buildValid('wall',p.x,p.z,owner)){
      const limit=sim.halfWorld-BUILDINGS.wall.r-2;
      if(Math.abs(p.x)>limit||Math.abs(p.z)>limit||bridgeFootprint(sim.options.map,p.x,p.z,BUILDINGS.wall.r)||[-1,0,1].some(dx=>[-1,0,1].some(dz=>sim.isWater(p.x+dx*BUILDINGS.wall.r,p.z+dz*BUILDINGS.wall.r)))){cache.set(key,null);return null;}
      const obstacles=sim.entities.filter(e=>e.hp>0&&(e.kind==='building'||e.kind==='resource'&&!e.water&&['wood','gold','stone'].includes(e.type))&&Math.hypot(e.x-p.x,e.z-p.z)<e.r+BUILDINGS.wall.r+.8);
      if(!obstacles.length||obstacles.some(e=>e.kind!=='resource')){cache.set(key,null);return null;}
      p.anchorIds=obstacles.map(e=>e.id);
    }
    cache.set(key,p);return p;
  };
  const route=(side,back,backAcross,allowNatural)=>{
    const row=plan.pieces.filter(piece=>piece.type==='wall').map(piece=>({piece,across:((piece.x-front.x)*tangent.x+(piece.z-front.z)*tangent.z)/WALL_SPACING})).filter(p=>Math.sign(p.across)===side).sort((a,b)=>Math.abs(b.across)-Math.abs(a.across))[0];
    if(!row)return null;const start={x:Math.round(row.across),y:0},end={x:backAcross+side*2,y:back},key=p=>p.x+':'+p.y,goal=key(end),open=[{...start,cost:0,score:0}],cost=new Map([[key(start),0]]),parents=new Map(),closed=new Set();
    while(open.length){
      let best=0;for(let i=1;i<open.length;i++)if(open[i].score<open[best].score)best=i;
      const current=open.splice(best,1)[0],id=key(current);if(closed.has(id))continue;closed.add(id);
      if(id===goal){const result=[];let at=current;while(at){result.push(point(at.x,at.y));at=parents.get(key(at));}return result.reverse();}
      for(const [dx,dy]of [[0,1],[side,0],[-side,0],[0,-1]]){
        const next={x:current.x+dx,y:current.y+dy},nextId=key(next);
        const center=backAcross*Math.max(0,Math.min(1,(next.y-coreRow)/(back-coreRow)));
        if((next.x-center)*side<2-.000001||Math.abs(next.x)>18||next.y< -4||next.y>back+4||closed.has(nextId))continue;
        if(Math.abs(next.x-backAcross)<2&&Math.abs(next.y-back)<=4)continue;
        const site=point(next.x,next.y);if(!site||!allowNatural&&site.anchorIds)continue;
        const nextCost=current.cost+(naturalWallAnchor(sim,site)?.6:1)+Math.abs(next.x)*.01;if(nextCost>=(cost.get(nextId)??Infinity))continue;
        cost.set(nextId,nextCost);parents.set(nextId,current);open.push({...next,cost:nextCost,score:nextCost+(Math.abs(next.x-end.x)+Math.abs(next.y-end.y))*.6});
      }
    }
    return null;
  };
  for(const allowNatural of [false,true])for(const back of [12,14,16,18,20,22])for(const backAcross of [0,-3,3,-6,6]){
    if(depth-back*WALL_SPACING>-9)continue;
    const gate={type:'gate',x:front.x+tangent.x*backAcross*WALL_SPACING-normal.x*back*WALL_SPACING,z:front.z+tangent.z*backAcross*WALL_SPACING-normal.z*back*WALL_SPACING,angle};
    if(!sim.canSee(owner,gate)||!sim.buildValid('gate',gate.x,gate.z,owner))continue;
    const left=route(-1,back,backAcross,allowNatural),right=route(1,back,backAcross,allowNatural);if(!left||!right)continue;
    const pieces=plan.pieces.map(piece=>({...piece}));pieces.push(gate);
    for(const flank of [left,right])for(let i=1;i<flank.length;i++){
      const p={...flank[i]},next=flank[i+1]||p,previous=flank[i-1];p.angle=-Math.atan2(next.z-previous.z,next.x-previous.x);
      if(!pieces.some(piece=>Math.hypot(piece.x-p.x,piece.z-p.z)<.01))pieces.push(p);
    }
    yield {...plan,layout:'perimeter',pieces};
  }
}

// Retain the paid front and extend it into a closed core defense. Every corner
// is a real wall section; rear traffic gets its own gate instead of a gap.
export function perimeterLayout(plan,widthSteps,depthSteps){
  const front=plan.pieces[0],angle=plan.angle,normal={x:Math.sin(angle),z:Math.cos(angle)},tangent={x:normal.z,z:-normal.x},pieces=[];
  const add=(type,across,back,wallAngle=angle)=>{
    const point={type,x:front.x+tangent.x*across-normal.x*back,z:front.z+tangent.z*across-normal.z*back,angle:wallAngle};
    const previous=plan.pieces.find(piece=>piece.type===type&&Math.hypot(piece.x-point.x,piece.z-point.z)<.01);
    if(previous)Object.assign(point,previous);pieces.push(point);
  };
  for(const back of [0,depthSteps*WALL_SPACING]){
    add('gate',0,back);
    for(const sign of [-1,1])for(let i=2;i<=widthSteps;i++)add('wall',sign*i*WALL_SPACING,back);
  }
  for(const sign of [-1,1])for(let i=1;i<depthSteps;i++)add('wall',sign*widthSteps*WALL_SPACING,i*WALL_SPACING,angle+Math.PI/2);
  return {...plan,layout:'perimeter',pieces};
}
