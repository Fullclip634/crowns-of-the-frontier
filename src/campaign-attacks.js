import {UNITS} from './data.js';
import {bridgeNavigationGrid} from './bridge-navigation.js';
import {findPath,navigationRegions} from './navigation.js';
import {canAttackFrom} from './ai-siege.js';

const distance=(a,b)=>Math.hypot(a.x-b.x,a.z-b.z);
const cellIndex=(sim,point)=>{const cell=sim.cell(point.x,point.z);return cell.z*sim.gridSize+cell.x;};

export function legacyCampaignReplay(sim){
  return sim.options.replay&&!sim.options.campaignSimulation;
}

function attackTarget(sim,unit){
  const buildings=sim.owned(0,'building');
  const capital=buildings.find(building=>building.type==='towncenter');
  const sovereign=capital?null:sim.owned(0,'unit','king')[0];
  const objective=capital||sovereign;
  if(objective&&canAttackFrom(sim,unit,objective))return objective;
  const candidates=buildings.filter(building=>building!==capital&&building.type!=='farm');
  const priority=building=>building.type==='gate'?0:building.type==='wall'?1:2;
  candidates.sort((a,b)=>priority(a)-priority(b)||distance(a,unit)-distance(b,unit)||a.id-b.id);
  return candidates.find(building=>canAttackFrom(sim,unit,building))||
    sim.owned(0,'unit').sort((a,b)=>distance(a,unit)-distance(b,unit)).find(target=>canAttackFrom(sim,unit,target));
}

function giveAttackOrder(sim,unit,target){
  if(!target)return;
  sim.command([unit.id],{type:'attack',target:target.id});
}

function landSites(sim,origin,reach){
  const a=sim.cell(origin.x-reach,origin.z-reach),b=sim.cell(origin.x+reach,origin.z+reach),limit=sim.halfWorld-3;
  const points=[];
  for(let z=a.z;z<=b.z;z++)for(let x=a.x;x<=b.x;x++){
    const point={x:x*2-sim.halfWorld+1,z:z*2-sim.halfWorld+1,index:z*sim.gridSize+x};
    if(Math.abs(point.x)<=limit&&Math.abs(point.z)<=limit&&!sim.isWater(point.x,point.z))points.push(point);
  }
  return points.sort((a,b)=>distance(a,origin)-distance(b,origin));
}

// Use the same movement grid as the deployed troops, including the clearance
// that rams need on crossings. Move a raid up its actual route to stage it
// outside the fort, so a timed attack reaches the fight before the hold ends.
export function deployCampaignTroops(sim,owner,types,origin,{attack=false,frontline=false,existingUnit=null}={}){
  const placed=[],terrain=sim.grid(owner),limit=sim.halfWorld-3;
  let preferred=origin,launchSite=null;
  const makeProbe=type=>({kind:'unit',type,owner,r:UNITS[type].radius??(type==='ram'||type==='trebuchet'?1.35:type==='catapult'?1.1:.65)});
  if(frontline&&types.length){
    const probe=makeProbe(types[0]),grid=bridgeNavigationGrid(sim,probe,terrain);
    const start=landSites(sim,origin,16).find(point=>!grid[point.index]);
    if(start){
      launchSite=start;
      Object.assign(probe,start);
      const target=attackTarget(sim,probe);
      const route=target?findPath(sim,probe,target,target.r+10):[];
      preferred=route.find(point=>distance(point,target)<=32&&distance(point,target)>=22)||origin;
    }
  }
  const nearby=landSites(sim,preferred,18);
  const choices=preferred===origin?nearby:[...nearby,...landSites(sim,origin,18)];
  const occupied=sim.entities.filter(e=>e!==existingUnit&&e.hp>0&&e.kind==='unit'&&!e.embarked&&
    (distance(e,preferred)<=29||distance(e,origin)<=29));
  const home=sim.owned(owner,'building','towncenter')[0],navalPorts=types.some(type=>UNITS[type].naval)?sim.owned(owner,'building','dock'):[];
  const desired=frontline?launchSite:home&&sim.spawnPoint(home);
  const attackPlans=new Map();
  for(const type of types){
    let point,target;
    if(UNITS[type].naval){
      const port=navalPorts.find(dock=>dock.progress>=1);
      point=port&&sim.spawnPoint(port,true,type);
    }else{
      const probe=makeProbe(type),grid=bridgeNavigationGrid(sim,probe,terrain),regions=navigationRegions(sim,grid);
      const desiredRegion=desired?regions[cellIndex(sim,desired)]:0;
      for(const candidate of choices){
        const region=regions[candidate.index];
        if(!region||desiredRegion&&desiredRegion!==region||
          occupied.some(unit=>distance(unit,candidate)<(unit.r+probe.r)*.89))continue;
        if(attack){
          const key=type+':'+region;
          if(!attackPlans.has(key))attackPlans.set(key,attackTarget(sim,{...probe,x:candidate.x,z:candidate.z})||null);
          target=attackPlans.get(key);
          if(!target)continue;
        }
        point=candidate;
        break;
      }
    }
    if(!point||Math.abs(point.x)>limit||Math.abs(point.z)>limit)continue;
    const unit=existingUnit||sim.addUnit(type,owner,point.x,point.z);
    if(existingUnit){unit.x=point.x;unit.z=point.z;sim.sightCache=null;}
    occupied.push(unit);
    placed.push(unit);
    if(attack){
      unit.campaignAttack=true;
      if(target)giveAttackOrder(sim,unit,target);
    }
  }
  return placed;
}

export function tickCampaignAttacks(sim,recoverWaveUnit=null){
  const continuingWaves=(sim.mission?.survival||sim.options.mode==='survival')&&sim.wave>0;
  for(const unit of sim.entities){
    if(unit.kind!=='unit'||unit.hp<=0||unit.embarked||!(unit.campaignAttack||continuingWaves&&unit.owner===1)||
      !sim.hostile(unit.owner,0)||!UNITS[unit.type].damage||UNITS[unit.type].naval)continue;
    const fromOlderWave=!unit.campaignAttack;
    if(unit.order?.type==='attack'&&sim.get(unit.order.target)&&unit.pathStatus!=='blocked')continue;
    if(sim.time<(unit.campaignAttackRetry??0))continue;
    unit.campaignAttackRetry=sim.time+3;
    const grid=bridgeNavigationGrid(sim,unit,sim.grid(unit.owner));
    if(grid[cellIndex(sim,unit)]){
      // An older save may have placed the wave directly on a tree or cliff.
      const point=landSites(sim,unit,8).find(point=>!grid[point.index]&&
        !sim.entities.some(e=>e.kind==='unit'&&e.hp>0&&!e.embarked&&distance(e,point)<(e.r+unit.r)*.9));
      if(point){unit.x=point.x;unit.z=point.z;}
    }
    const target=attackTarget(sim,unit);
    if(target){unit.campaignAttack=true;giveAttackOrder(sim,unit,target);}
    else if(fromOlderWave&&recoverWaveUnit)recoverWaveUnit(sim,unit);
  }
}
