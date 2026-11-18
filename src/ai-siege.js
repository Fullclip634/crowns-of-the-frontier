import {UNITS,BUILDINGS} from './data.js';
import {unitNavigationGrid,constructionNavigationGrid,navigationRegions,findPath,clearSegment} from './navigation.js';
import {meleePositions,meleeWorkGrid,meleeWorldSegmentClear} from './melee-contact.js';
const distance=(a,b)=>Math.hypot(a.x-b.x,a.z-b.z);

// Use the same ground-contact rules as real melee movement. A private probe
// keeps tactical planning from changing the engine's current route or order.
function reachableContact(sim,engine,target){
  const probe={...engine,path:[],stuckTime:0},grid=unitNavigationGrid(sim,probe),work=constructionNavigationGrid(sim,target,engine.owner),labels=navigationRegions(sim,grid),from=sim.cell(engine.x,engine.z),start=from.z*sim.gridSize+from.x;
  for(const point of meleePositions(engine,target).sort((a,b)=>distance(engine,a)-distance(engine,b))){
    if(Math.abs(point.x)>sim.halfWorld-3||Math.abs(point.z)>sim.halfWorld-3||!meleeWorldSegmentClear(point,point,target,engine.r+.05,sim,engine))continue;
    const candidate=meleeWorkGrid(sim,probe,target,work,point);if(!candidate)continue;
    const cell=sim.cell(point.x,point.z),end=cell.z*sim.gridSize+cell.x;
    if(!grid[start]&&!grid[end]){if(labels[start]===labels[end])return true;continue;}
    const route=findPath(sim,probe,point);if(probe.pathStatus!=='ready')continue;
    const last=route.at(-1)||probe;if(meleeWorldSegmentClear(last,point,target,engine.r+.05,sim,engine)&&clearSegment(sim,candidate,last,point))return true;
  }
  return false;
}

function reachableFiringPosition(sim,engine,site){
  const range=UNITS[engine.type].range+site.r;
  if(distance(engine,site)<=range)return true;
  const probe={...engine,path:[]},route=findPath(sim,probe,site,range);
  return probe.pathStatus==='ready'&&distance(route.at(-1)||engine,site)<=range;
}

// Only current, visible targets may receive explicit attack orders. Infantry
// retains attack-move so it can screen siege and react to approaching soldiers.
export function orderSiegeAssault(sim,owner,fighters,visible,objective){
  const sites=visible.filter(e=>e.hp>0&&e.kind==='building'&&sim.hostile(owner,e.owner));
  const siege=fighters.filter(e=>UNITS[e.type].role==='siege'),assigned=new Set();let escorted=null;
  for(const engine of siege){
    const candidates=sites.filter(site=>distance(engine,site)<48||distance(site,objective)<24).sort((a,b)=>{
      const value=site=>distance(engine,site)-(site.progress>=1&&BUILDINGS[site.type].damage?18:0)
        -(site.type==='wall'||site.type==='gate'?8:0)-(site.id===engine.order?.target&&engine.order.type==='attack'?6:0)
        +(site.type==='farm'?12:0)+site.hp/site.maxHp*3;
      return value(a)-value(b)||a.id-b.id;
    });
    const canReach=UNITS[engine.type].range<=5?reachableContact:reachableFiringPosition;
    const target=candidates.find(site=>canReach(sim,engine,site));
    if(!target)continue;
    if(engine.order?.type!=='attack'||engine.order.target!==target.id)sim.command([engine.id],{type:'attack',target:target.id});
    assigned.add(engine.id);
    if(engine.type==='catapult')escorted??=engine;
  }
  if(escorted){
    const screen=fighters.filter(e=>['spear','infantry'].includes(UNITS[e.type].role)).sort((a,b)=>distance(a,escorted)-distance(b,escorted)).slice(0,Math.min(2,Math.floor(fighters.length/5)));
    const reassigned=screen.filter(unit=>unit.order?.type!=='guard'||unit.order.target!==escorted.id);
    if(reassigned.length)sim.guard(reassigned.map(e=>e.id),escorted.id,false,owner);
    for(const unit of screen)assigned.add(unit.id);
  }
  return assigned;
}
