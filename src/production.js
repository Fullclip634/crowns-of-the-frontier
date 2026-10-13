import {UNITS,TECHS,availableTo} from './data.js';

export function productionBuildings(sim,ids=null){
  const selection=ids?new Set(ids):null;
  return sim.owned(0,'building').filter(b=>b.hp>0&&b.progress>=1&&(!selection||selection.has(b.id))&&(Object.values(UNITS).some(d=>d.at.includes(b.type))||Object.values(TECHS).some(d=>d.at.includes(b.type))));
}
export function trainingBuildings(sim,type,ids){return availableTo(UNITS[type],sim.players[0].faction)?productionBuildings(sim,ids).filter(b=>UNITS[type]?.at.includes(b.type)):[];}
export const queuedSeconds=building=>building.queue.reduce((sum,q)=>sum+q.remaining,0);

// Balance a batch against virtual queues, so remote commands also distribute
// correctly while waiting for the authoritative multiplayer snapshot.
export function trainAcrossBuildings(sim,type,ids,count=1){
  const buildings=trainingBuildings(sim,type,ids),definition=UNITS[type];if(!buildings.length||!definition)return 0;
  const seconds=new Map(buildings.map(b=>[b.id,queuedSeconds(b)])),lengths=new Map(buildings.map(b=>[b.id,b.queue.length]));
  const budget={...sim.players[0].resources};let slots=sim.capacity(0)-sim.population(0)-sim.reservedPopulation(0),trained=0;
  for(let i=0;i<Math.max(1,Math.min(5,count));i++){
    const available=buildings.filter(b=>lengths.get(b.id)<8).sort((a,b)=>seconds.get(a.id)-seconds.get(b.id)||a.id-b.id),building=available[0]||buildings[0];
    const affordable=Object.entries(definition.cost).every(([resource,cost])=>budget[resource]>=cost);
    if(!available.length||slots<=0||!affordable||sim.players[0].age<definition.age){if(!trained)sim.train(building.id,type);break;}
    if(!sim.train(building.id,type))break;
    trained++;slots--;lengths.set(building.id,lengths.get(building.id)+1);seconds.set(building.id,seconds.get(building.id)+definition.time);
    for(const [resource,cost]of Object.entries(definition.cost))budget[resource]-=cost;
  }
  return trained;
}
