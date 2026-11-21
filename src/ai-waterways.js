import {BUILDINGS,UNITS} from './data.js';
import {landBank,waterChannels} from './map-water.js';
import {navigationRegions} from './navigation.js';

const distance=(a,b)=>Math.hypot(a.x-b.x,a.z-b.z);
const channelX=(channel,z)=>channel.center+Math.sin(z*channel.frequency)*channel.bend;
const cellId=(sim,point)=>{const cell=sim.cell(point.x,point.z);return cell.z*sim.gridSize+cell.x;};

// Ship navigation has separate regions above and below the bridges. A boat
// must never be sent to fish or fight in another channel or across a bridge.
export function waterwayRegion(sim,point,owner=point.owner){
  const grid=sim.grid(owner,true);
  return navigationRegions(sim,grid)[cellId(sim,point)];
}

export function seedArchipelagoFish(sim){
  for(const channel of waterChannels(sim.options.map))for(let z=-sim.halfWorld+12;z<sim.halfWorld-8;z+=18){
    const x=channelX(channel,z);
    if(!sim.isWater(x,z))continue;
    const fish=sim.addNaturalResource('food',x,z,1800);
    fish.water=true;
    fish.r=2.1;
  }
}

function harborCandidates(sim,town){
  const bank=landBank(sim.options.map,town.x,town.z),channels=waterChannels(sim.options.map);
  return [bank-1,bank].flatMap(index=>{
    const channel=channels[index];
    if(!channel)return [];
    const sign=index<bank?1:-1;
    return [0,-14,14,-28,28].map(offset=>{
      const z=town.z+offset;
      return {x:channelX(channel,z)+sign*(channel.width+5),z};
    }).filter(point=>Math.abs(point.z)<sim.halfWorld-8);
  }).sort((a,b)=>distance(a,town)-distance(b,town));
}

export function manageArchipelagoNavy(sim,owner,state,town,visible,known){
  if(sim.players[owner].age<1)return;
  const docks=sim.owned(owner,'building','dock'),dock=docks.find(site=>site.progress>=1);
  if(!docks.length&&sim.time>=(state.nextHarborSearch??0)&&sim.canAfford(sim.cost(BUILDINGS.dock.cost,owner,'building'),owner)){
    state.nextHarborSearch=sim.time+18;
    const candidates=harborCandidates(sim,town);
    const site=candidates.filter(point=>sim.canSee(owner,point)).slice(0,3).find(point=>sim.commanderBuild('dock',point,owner,true));
    if(!site){
      const scout=sim.owned(owner,'unit','scout').find(unit=>unit.hp>=unit.maxHp*.6);
      const point=candidates.find(point=>!sim.canSee(owner,point)&&!sim.isWater(point.x,point.z));
      if(scout&&point&&(!scout.order||distance(scout.order,point)>4))sim.command([scout.id],{type:'move',...point,commanderHarbor:true});
    }
  }
  if(!dock)return;
  if(sim.time<(state.nextFleetDecision??0))return;
  state.nextFleetDecision=sim.time+8;
  const port=sim.spawnPoint(dock,true);
  if(!port)return;
  const grid=sim.grid(owner,true),regions=navigationRegions(sim,grid),region=regions[cellId(sim,port)];
  if(!region)return;
  const units=sim.owned(owner,'unit').filter(unit=>UNITS[unit.type]?.naval&&regions[cellId(sim,unit)]===region);
  const count=type=>units.filter(unit=>unit.type===type).length+dock.queue.filter(entry=>entry.type===type).length;
  const nearbyFish=sim.entities.some(entity=>entity.kind==='resource'&&entity.water&&entity.amount>0&&regions[cellId(sim,entity)]===region);
  const enemies=visible.filter(entity=>entity.kind==='unit'&&UNITS[entity.type]?.naval&&regions[cellId(sim,entity)]===region)
    .sort((a,b)=>distance(a,port)-distance(b,port));
  const threat=enemies.find(unit=>UNITS[unit.type].damage>0&&distance(unit,port)<40);
  const ships=units.filter(unit=>UNITS[unit.type].damage>0);
  if(dock.queue.length<2){
    const fleet=count('galley')+count('warship'),fishers=count('fishingboat');
    const type=nearbyFish&&!threat&&fishers<2?'fishingboat':fleet<4?'galley':null;
    if(type){
      const heavy=type==='galley'&&fleet>=2&&sim.players[owner].age>=3&&sim.canAfford(UNITS.warship.cost,owner);
      sim.train(dock.id,heavy?'warship':type);
    }
  }
  const channel=waterChannels(sim.options.map).find(lane=>Math.abs(channelX(lane,port.z)-port.x)<lane.width+2);
  const raidSites=channel?known.filter(site=>site.type==='dock'&&distance(port,site)<100).map(site=>({site,approach:{x:channelX(channel,site.z),z:site.z}}))
    .filter(({site,approach})=>distance(site,approach)<channel.width+8&&regions[cellId(sim,approach)]===region)
    .sort((a,b)=>distance(port,a.approach)-distance(port,b.approach)):[];
  for(const ship of ships){
    const wounded=ship.hp<ship.maxHp*.55&&!threat,target=wounded?null:threat||enemies[0];
    if(target){
      if(ship.order?.type!=='attack'||ship.order.target!==target.id)sim.command([ship.id],{type:'attack',target:target.id});
      continue;
    }
    const raid=!wounded&&raidSites.find(({site,approach})=>distance(site,approach)<UNITS[ship.type].range+BUILDINGS.dock.r);
    const point=raid?.approach||port;
    if(ship.order?.type!=='attackmove'||distance(ship.order,point)>4)sim.command([ship.id],{type:'attackmove',...point});
  }
}
