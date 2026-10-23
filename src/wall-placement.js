import {AGES,BUILDINGS} from './data.js';
import {wallLinePoints} from './walls.js';

const finite=point=>point&&Number.isFinite(point.x)&&Number.isFinite(point.z),copy=point=>({x:point.x,z:point.z}),distance=(a,b)=>Math.hypot(a.x-b.x,a.z-b.z);
function nearbyWall(sim,point,owner){return sim.owned(owner,'building','wall').filter(wall=>wall.hp>0&&distance(wall,point)<1.8).sort((a,b)=>distance(a,point)-distance(b,point)||a.id-b.id)[0];}

// A draft never spends resources or issues an order. Tap endpoints or drag;
// construction happens only through the separate Build action.
export class WallPlacement{
  constructor(){this.clear();}
  clear(){this.start=null;this.end=null;this.panning=false;this.version=(this.version||0)+1;}
  point(point){if(!finite(point)||this.panning)return false;if(!this.start)this.start=copy(point);this.end=copy(point);this.version++;return true;}
  drag(from,to){if(!finite(from)||!finite(to)||this.panning)return false;if(!this.start)this.start=copy(from);this.end=copy(to);this.version++;return true;}
  togglePan(){this.panning=!this.panning;this.version++;return this.panning;}
}

export function wallPlacementPlan(sim,draft,workerIds,owner=0){
  const empty={segments:[],count:0,cost:{},canBuild:false,message:draft.panning?'Drag to move the map. Choose Place wall to continue.':'Tap a start, then an end. Or drag a wall line.',from:null,to:null};
  if(!finite(draft.start)||!finite(draft.end))return empty;
  const originalStart=nearbyWall(sim,draft.start,owner),originalEnd=nearbyWall(sim,draft.end,owner),reverse=!originalStart&&!!originalEnd;
  const existingStart=reverse?originalEnd:originalStart,existingEnd=reverse?originalStart:originalEnd;
  const from=copy(existingStart||(reverse?draft.end:draft.start)),end=copy(existingEnd||(reverse?draft.start:draft.end)),points=wallLinePoints(from,end).slice(existingStart?1:0),costEach=sim.cost(BUILDINGS.wall.cost,owner,'building'),budget={...sim.players[owner].resources},cost={},segments=[];
  let blocked=0,unaffordable=0,buildTo=null;
  for(let index=0;index<points.length;index++){
    const point=points[index],valid=sim.buildValid('wall',point.x,point.z,owner);
    // An existing end wall needs no duplicate foundation. Ask the established
    // simulation to stop at the last new piece, which connects to that end.
    if(!valid&&existingEnd&&existingEnd.id!==existingStart?.id&&index>=points.length-2&&buildTo&&distance(point,existingEnd)<1.8&&distance(buildTo,existingEnd)<=3.35)break;
    const affordable=Object.entries(costEach).every(([resource,amount])=>(budget[resource]||0)>=amount);
    for(const [resource,amount]of Object.entries(costEach)){cost[resource]=(cost[resource]||0)+amount;budget[resource]=(budget[resource]||0)-amount;}
    blocked+=Number(!valid);unaffordable+=Number(!affordable);segments.push({...point,valid,affordable});buildTo=copy(point);
  }
  const workers=workerIds.map(id=>sim.get(id)).filter(unit=>unit?.type==='villager'&&unit.owner===owner&&unit.hp>0&&!unit.embarked),count=segments.length;
  const canBuild=!!count&&!blocked&&!unaffordable&&workers.length>0&&sim.players[owner].age>=BUILDINGS.wall.age&&!draft.panning;
  const message=draft.panning?empty.message:!workers.length?'Select a villager to build these walls.':sim.players[owner].age<BUILDINGS.wall.age?`Advance to the ${AGES[BUILDINGS.wall.age]} to build stone walls.`:!count?'Tap another end point to extend this wall.':blocked?`${blocked} blocked ${blocked===1?'section':'sections'}. Move the end point or choose Reset.`:unaffordable?'Not enough resources for this line. Shorten it or gather more stone.':count===1?'One wall ready. Tap an end point for a longer line.':`${count} connected walls ready. Choose Build wall.`;
  return {segments,count,cost,canBuild,message,from,to:buildTo,reverse,blocked,unaffordable,start:copy(draft.start),end:copy(draft.end)};
}
