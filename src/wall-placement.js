import {AGES,BUILDINGS} from './data.js';
import {wallLinePoints} from './walls.js';

const finite=point=>point&&Number.isFinite(point.x)&&Number.isFinite(point.z),copy=point=>({x:point.x,z:point.z}),distance=(a,b)=>Math.hypot(a.x-b.x,a.z-b.z);
function nearbyWall(sim,point,owner){return sim.owned(owner,'building','wall').filter(wall=>wall.hp>0&&distance(wall,point)<1.8).sort((a,b)=>distance(a,point)-distance(b,point)||a.id-b.id)[0];}
function nearbyTree(sim,point){return sim.entities.filter(tree=>tree.hp>0&&tree.kind==='resource'&&tree.type==='wood'&&!tree.water&&distance(tree,point)<=tree.r+1.1).sort((a,b)=>distance(a,point)-distance(b,point)||a.id-b.id)[0];}
function treeContact(tree,toward){const d=distance(tree,toward);if(d<1e-8)return null;const offset=tree.r+1.325;return {x:tree.x+(toward.x-tree.x)/d*offset,z:tree.z+(toward.z-tree.z)/d*offset};}

// A tap on the visible canopy projects beyond the trunk on sloped cameras.
// Resolve the picked tree to its real ground position at pointer down/up;
// continuous dragging keeps the cheaper ground projection.
export function wallPointerPoint(view,x,y){
  const target=view.pick(x,y);if(target?.kind==='resource'&&target.type==='wood'&&target.hp>0&&!target.water)return {x:target.x,z:target.z};
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

export function wallPlacementPlan(sim,draft,workerIds,owner=0){
  const empty={segments:[],count:0,cost:{},canBuild:false,message:draft.panning?'Drag to move the map. Choose Place wall to continue.':'Tap a start, then an end. Or drag a wall line.',from:null,to:null};
  if(!finite(draft.start)||!finite(draft.end))return empty;
  const originalStart=nearbyWall(sim,draft.start,owner),originalEnd=nearbyWall(sim,draft.end,owner),startTree=originalStart?null:nearbyTree(sim,draft.start),endTree=originalEnd?null:nearbyTree(sim,draft.end),reverse=startTree?false:endTree?true:!originalStart&&!!originalEnd;
  const existingStart=reverse?originalEnd:originalStart,existingEnd=reverse?originalStart:originalEnd;
  const anchorStart=reverse?endTree:startTree,anchorEnd=reverse?startTree:endTree,rawFrom=existingStart||(reverse?draft.end:draft.start),rawEnd=existingEnd||(reverse?draft.start:draft.end);
  const from=copy(anchorStart?treeContact(anchorStart,rawEnd)||rawFrom:rawFrom),end=copy(anchorEnd?treeContact(anchorEnd,rawFrom)||rawEnd:rawEnd),exact=!!anchorStart&&!!(anchorEnd||existingEnd);
  const points=wallLinePoints(from,end,exact).slice(existingStart?1:0),costEach=sim.cost(BUILDINGS.wall.cost,owner,'building'),budget={...sim.players[owner].resources},cost={},segments=[];
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
  const message=draft.panning?empty.message:!workers.length?'Select a villager to build these walls.':sim.players[owner].age<BUILDINGS.wall.age?`Advance to the ${AGES[BUILDINGS.wall.age]} to build stone walls.`:!count&&exact?'These ends cannot be joined with full wall sections. Choose a different tree or wall.':!count?'Tap another end point to extend this wall.':blocked?`${blocked} blocked ${blocked===1?'section':'sections'}. Move the end point or choose Reset.`:unaffordable?'Not enough resources for this line. Shorten it or gather more stone.':anchorStart||anchorEnd?`${count} walls ready, joined to ${anchorStart&&anchorEnd?'both trees':'the tree'}. Choose Build wall.`:count===1?'One wall ready. Tap an end point for a longer line.':`${count} connected walls ready. Choose Build wall.`;
  return {segments,count,cost,canBuild,message,from,to:exact?end:buildTo,reverse,blocked,unaffordable,start:copy(draft.start),end:copy(draft.end)};
}
