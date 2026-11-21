import {AGES,BUILDINGS} from './data.js';
import {wallLinePoints,wallSupport} from './walls.js';

const finite=point=>point&&Number.isFinite(point.x)&&Number.isFinite(point.z);
const copy=point=>({x:point.x,z:point.z});
const distance=(a,b)=>Math.hypot(a.x-b.x,a.z-b.z);

function fortificationAt(walls,point){
  let closest=null,best=Infinity;
  for(const wall of walls){
    const dx=wall.x-point.x,dz=wall.z-point.z,d=dx*dx+dz*dz,r=wall.type==='gate'?wall.r+.5:1.8;
    if(d<r*r&&(d<best||d===best&&wall.id<closest.id)){closest=wall;best=d;}
  }
  return closest;
}
function supportAt(sim,point,owner,visible){
  return sim.entities.filter(entity=>wallSupport(entity,sim,owner)&&distance(entity,point)<=entity.r+1.1&&visible(entity))
    .sort((a,b)=>distance(a,point)-distance(b,point)||a.id-b.id)[0];
}
function supportContact(support,toward){
  const d=distance(support,toward);
  if(d<1e-8)return null;
  const offset=support.r+(support.type==='wood'?1.325:BUILDINGS.wall.r+.85);
  return {x:support.x+(toward.x-support.x)/d*offset,z:support.z+(toward.z-support.z)/d*offset};
}

export function wallPointerPoint(view,x,y){
  const target=view.pick(x,y);
  if(target?.hp>0&&(target.kind==='building'&&target.type!=='farm'&&(target.owner===0||view.sim?.allied(0,target.owner))||target.kind==='resource'&&!target.water&&['wood','stone','gold'].includes(target.type)))return copy(target);
  return view.groundPoint(x,y);
}

// A draft never spends resources or issues an order. Tap endpoints or drag;
// construction happens only through the separate Build action.
export class WallPlacement{
  constructor(){this.clear();}
  clear(){this.start=null;this.end=null;this.panning=false;this.version=(this.version||0)+1;}
  point(point){if(!finite(point)||this.panning)return false;if(!this.start)this.start=copy(point);this.end=copy(point);this.version++;return true;}
  drag(from,to){if(!finite(from)||!finite(to)||this.panning)return false;if(!this.start)this.start=copy(from);this.end=copy(to);this.version++;return true;}
  togglePan(){this.panning=!this.panning;this.version++;return this.panning;}
}

export function wallPlacementPlan(sim,draft,workerIds,owner=0,requireVisibility=false){
  const panMessage='Drag to move the map. Choose Place wall to continue.';
  const empty={segments:[],count:0,cost:{},canBuild:false,message:draft.panning?panMessage:'Tap a start, then an end. Or drag a wall line.',from:null,to:null};
  if(!finite(draft.start)||!finite(draft.end)||[draft.start,draft.end].some(p=>Math.abs(p.x)>sim.halfWorld||Math.abs(p.z)>sim.halfWorld))return empty;
  const visible=point=>requireVisibility?sim.canSee(owner,point):owner!==0||sim.isVisible(point.x,point.z);
  const walls=sim.entities.filter(entity=>entity.kind==='building'&&entity.hp>0&&entity.owner===owner&&['wall','gate'].includes(entity.type));
  const startWall=fortificationAt(walls,draft.start),endWall=fortificationAt(walls,draft.end);
  const startSupport=startWall?null:supportAt(sim,draft.start,owner,visible),endSupport=endWall?null:supportAt(sim,draft.end,owner,visible);
  const reverse=!startSupport&&(!!endSupport||!startWall&&!!endWall);
  const existingStart=reverse?endWall:startWall,existingEnd=reverse?startWall:endWall;
  const anchorStart=reverse?endSupport:startSupport,anchorEnd=reverse?startSupport:endSupport;
  const rawStart=existingStart||(reverse?draft.end:draft.start),rawEnd=existingEnd||(reverse?draft.start:draft.end);
  const startContact=anchorStart&&supportContact(anchorStart,rawEnd),endContact=anchorEnd&&supportContact(anchorEnd,rawStart);
  const from=copy(startContact||rawStart),end=copy(endContact||rawEnd);
  const anchored=!!anchorStart&&!!(anchorEnd||existingEnd),usableDirection=!anchorStart||startContact&&anchorStart.id!==anchorEnd?.id;
  const exactPoints=anchored&&usableDirection?wallLinePoints(from,end,true):[];
  const points=(usableDirection?(exactPoints.length?exactPoints:wallLinePoints(from,end)):[]).slice(existingStart?1:0);
  const costEach=sim.cost(BUILDINGS.wall.cost,owner,'building'),budget={...sim.players[owner].resources},cost={},segments=[];
  let blocked=0,unaffordable=0,reused=0,count=0,buildTo=null;
  for(let index=0;index<points.length;index++){
    const point=points[index],shown=visible(point),valid=shown&&sim.buildValid('wall',point.x,point.z,owner);
    if(!valid&&shown&&fortificationAt(walls,point)){
      if(index>=points.length-2&&existingEnd&&existingEnd.id!==existingStart?.id&&buildTo&&distance(point,existingEnd)<1.8&&distance(buildTo,existingEnd)<=3.35)break;
      reused++;
      segments.push({...point,existing:true});
      continue;
    }
    const affordable=valid&&Object.entries(costEach).every(([resource,amount])=>(budget[resource]||0)>=amount);
    if(affordable){
      for(const [resource,amount]of Object.entries(costEach)){cost[resource]=(cost[resource]||0)+amount;budget[resource]-=amount;}
      count++;
    }
    if(!valid)blocked++;
    else if(!affordable)unaffordable++;
    const supports=[];
    if(valid&&index===0&&anchorStart&&anchorStart.type!=='wood')supports.push(anchorStart.id);
    if(valid&&index===points.length-1&&anchorEnd&&anchorEnd.type!=='wood'&&distance(point,end)<.4)supports.push(anchorEnd.id);
    segments.push({...point,valid,affordable,supports});
    buildTo=copy(point);
  }
  const workers=workerIds.map(id=>sim.get(id)).filter(unit=>unit?.type==='villager'&&unit.owner===owner&&unit.hp>0&&!unit.embarked);
  const ageReady=sim.players[owner].age>=BUILDINGS.wall.age,canBuild=count>0&&workers.length>0&&ageReady&&!draft.panning;
  const skipped=[blocked&&`${blocked} blocked`,unaffordable&&`${unaffordable} beyond budget`,reused&&`${reused} already built`].filter(Boolean);
  const attachment=anchorStart?.type==='wood'&&anchorEnd?.type==='wood'&&exactPoints.length?' Joined to both trees.':'';
  const message=draft.panning?panMessage:!workers.length?'Select a villager to build these walls.':!ageReady?`Advance to the ${AGES[BUILDINGS.wall.age]} to build stone walls.`
    :skipped.length?`${count?count+' ready. ':''}${skipped.join(' · ')}.`:!count?'Choose another end point to extend the wall.':`${count} ${count===1?'section':'sections'} ready.${attachment}`;
  return {segments,count,cost,canBuild,message,from,to:exactPoints.length?end:buildTo,angle:-Math.atan2(end.z-from.z,end.x-from.x),reverse,blocked,unaffordable,reused,start:copy(draft.start),end:copy(draft.end)};
}
