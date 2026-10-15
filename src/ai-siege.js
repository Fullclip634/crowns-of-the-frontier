import {UNITS,BUILDINGS} from './data.js';
const distance=(a,b)=>Math.hypot(a.x-b.x,a.z-b.z);

// Only current, visible targets may receive explicit attack orders. Infantry
// retains attack-move so it can screen siege and react to approaching soldiers.
export function orderSiegeAssault(sim,owner,fighters,visible,objective){
  const sites=visible.filter(e=>e.kind==='building'&&sim.hostile(owner,e.owner));
  const siege=fighters.filter(e=>UNITS[e.type].role==='siege');let escorted=null;
  for(const engine of siege){
    const target=sites.filter(site=>distance(engine,site)<48||distance(site,objective)<24).sort((a,b)=>{
      const value=site=>distance(engine,site)-(BUILDINGS[site.type].damage?18:0)-(site.type==='wall'||site.type==='gate'?8:0)+site.hp/site.maxHp*3;
      return value(a)-value(b)||a.id-b.id;
    })[0];
    if(!target)continue;
    sim.command([engine.id],{type:'attack',target:target.id});if(engine.type==='catapult')escorted??=engine;
  }
  if(escorted){
    const screen=fighters.filter(e=>['spear','infantry'].includes(UNITS[e.type].role)).sort((a,b)=>distance(a,escorted)-distance(b,escorted)).slice(0,Math.min(2,Math.floor(fighters.length/5)));
    if(screen.length)sim.guard(screen.map(e=>e.id),escorted.id,false,owner);
  }
}
