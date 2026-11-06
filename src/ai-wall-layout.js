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
  for(const back of [12,14,16,18,20,22])for(const backAcross of [0,-3,3,-6,6]){
    if(depth-back*WALL_SPACING>-9)continue;
    const gate={type:'gate',x:front.x+tangent.x*backAcross*WALL_SPACING-normal.x*back*WALL_SPACING,z:front.z+tangent.z*backAcross*WALL_SPACING-normal.z*back*WALL_SPACING,angle};
    if(!sim.canSee(owner,gate)||!sim.buildValid('gate',gate.x,gate.z,owner))continue;
    // Natural obstacles are only useful at the end of a paid front. A tree
    // replacing an interior section leaves a two-section gap, so route around
    // it and keep the perimeter fully paid and connected.
    const left=route(-1,back,backAcross,false),right=route(1,back,backAcross,false);if(!left||!right)continue;
    const across=piece=>(piece.x-front.x)*tangent.x+(piece.z-front.z)*tangent.z;
    const pieces=[],push=piece=>{if(piece&&!pieces.some(existing=>Math.hypot(existing.x-piece.x,existing.z-piece.z)<.01))pieces.push({...piece});};
    const frontGate=plan.pieces.find(piece=>piece.type==='gate')||plan.pieces[0],frontWalls=plan.pieces.filter(piece=>piece.type==='wall');
    push(frontGate);
    for(const piece of frontWalls.filter(piece=>across(piece)>0).sort((a,b)=>across(a)-across(b)))push(piece);
    for(const piece of right.slice(1))push(piece);
    push(gate);
    for(const piece of left.slice(1).reverse())push(piece);
    for(const piece of frontWalls.filter(piece=>across(piece)<0).sort((a,b)=>Math.abs(across(b))-Math.abs(across(a))))push(piece);
    for(let index=0;index<pieces.length;index++){const piece=pieces[index];if(piece.type==='gate')continue;const next=pieces[(index+1)%pieces.length],dx=next.x-piece.x,dz=next.z-piece.z;if(Math.hypot(dx,dz)>1e-6)piece.angle=-Math.atan2(dz,dx);}
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
  // Emit the ring in walking order. Construction then starts at the front
  // gate and proceeds around the perimeter instead of planting the rear gate
  // before the walls that must meet it.
  add('gate',0,0);
  for(let i=2;i<=widthSteps;i++)add('wall',i*WALL_SPACING,0);
  for(let i=1;i<depthSteps;i++)add('wall',widthSteps*WALL_SPACING,i*WALL_SPACING,angle+Math.PI/2);
  for(let i=widthSteps;i>=2;i--)add('wall',i*WALL_SPACING,depthSteps*WALL_SPACING);
  add('gate',0,depthSteps*WALL_SPACING);
  for(let i=2;i<=widthSteps;i++)add('wall',-i*WALL_SPACING,depthSteps*WALL_SPACING);
  for(let i=depthSteps-1;i>=1;i--)add('wall',-widthSteps*WALL_SPACING,i*WALL_SPACING,angle+Math.PI/2);
  for(let i=widthSteps;i>=2;i--)add('wall',-i*WALL_SPACING,0);
  return {...plan,layout:'perimeter',pieces};
}
