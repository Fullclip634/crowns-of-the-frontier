import {dryFootprint,nearbyPoint} from './battlefield-start.js';
import {deployCampaignTroops} from './campaign-attacks.js';
import {navigationRegions} from './navigation.js';
import {chooseLandingShore,coastalApproach,coastalLanding} from './ai-landings.js';

const distance=(a,b)=>Math.hypot(a.x-b.x,a.z-b.z);
const cellIndex=(sim,point)=>{const {x,z}=sim.cell(point.x,point.z);return z*sim.gridSize+x;};

export function usesSkirmishRules(sim){
  return !sim.mission&&!sim.options.multiplayer&&(!sim.options.replay||sim.options.skirmishSimulation===1);
}

function survivalApproaches(sim){
  const base=sim.owned(0,'building','towncenter')[0];
  if(!base)return [];
  const border=sim.halfWorld-10;
  const point=(x,z)=>({x:Math.max(-border,Math.min(border,x)),z:Math.max(-border,Math.min(border,z))});
  const gates=sim.owned(0,'building','gate').sort((a,b)=>distance(a,base)-distance(b,base)).slice(0,6);
  const approaches=gates.map(gate=>{
    const reach=Math.max(1,distance(gate,base));
    return point(gate.x+24*(gate.x-base.x)/reach,gate.z+24*(gate.z-base.z)/reach);
  });
  for(const [x,z] of [[0,-56],[56,0],[0,56],[-56,0]])approaches.push(point(base.x+x,base.z+z));
  return approaches;
}

export function deploySurvivalWave(sim,types,origins){
  let remaining=types,count=0;
  for(const origin of [...origins,...survivalApproaches(sim)]){
    const placed=deployCampaignTroops(sim,1,remaining,origin,{attack:true,frontline:true});
    count+=placed.length;
    if(count===types.length)break;
    if(!placed.length)continue;
    const deployed=new Map();
    for(const unit of placed)deployed.set(unit.type,(deployed.get(unit.type)||0)+1);
    remaining=remaining.filter(type=>{
      const amount=deployed.get(type)||0;
      if(amount)deployed.set(type,amount-1);
      return amount===0;
    });
  }
  return count;
}

export function recoverSurvivalAttacker(sim,unit){
  for(const origin of survivalApproaches(sim)){
    if(deployCampaignTroops(sim,unit.owner,[unit.type],origin,{attack:true,frontline:true,existingUnit:unit}).length)return;
  }
}

export function orderCoastalTransport(sim,ship,army,capital,visible,known,objective){
  const owner=ship.owner,homeSign=Math.sign(capital.x),enemySign=-homeSign;
  const load=coastalApproach(homeSign,capital.z);
  const move=point=>{
    if(ship.order?.type!=='move'||distance(ship.order,point)>3)sim.command([ship.id],{type:'move',...point});
  };
  ship.passengers??=[];
  if(ship.landing){
    const landing=ship.landing,approach=coastalApproach(enemySign,landing.shoreZ);
    const passengers=[...ship.passengers],grid=sim.grid(owner);
    for(const offset of [0,6,-6,9,-9]){
      const shore=coastalLanding(enemySign,landing.shoreZ+offset);
      if(distance(ship,shore)>11||grid[cellIndex(sim,shore)]||!sim.unload(ship.id,shore.x,shore.z,owner))continue;
      for(const id of passengers){
        const unit=sim.get(id);
        if(unit&&!unit.embarked)sim.command([id],{type:'attackmove',x:landing.x,z:landing.z});
      }
      if(!ship.passengers.length){ship.landing=null;ship.loadingSince=null;move(load);}
      return;
    }
    if(distance(ship,approach)>8&&ship.pathStatus!=='blocked'){move(approach);return;}
    landing.blockedSince??=sim.time;
    if(sim.time-landing.blockedSince<12)return;
    landing.shoreZ=chooseLandingShore(sim,owner,ship,enemySign,landing.shoreZ,visible,known,{retry:true})??landing.shoreZ;
    landing.blockedSince=sim.time;
    move(coastalApproach(enemySign,landing.shoreZ));
    return;
  }
  const boarding=army.filter(unit=>unit.order?.type==='board'&&unit.order.target===ship.id);
  const loadTime=sim.time-(ship.loadingSince??sim.time);
  const ready=ship.passengers.length>=4&&(!boarding.length||ship.passengers.length>=8||loadTime>18);
  if(ready||(ship.passengers.length>0&&loadTime>40)){
    for(const unit of boarding)sim.command([unit.id],{type:'move',x:capital.x,z:capital.z+9});
    const shoreZ=chooseLandingShore(sim,owner,ship,enemySign,objective.z,visible,known)??objective.z;
    ship.landing={x:objective.x,z:objective.z,shoreZ,sign:enemySign};
    move(coastalApproach(enemySign,shoreZ));
    return;
  }
  if(distance(ship,load)>5){move(load);return;}
  ship.loadingSince??=sim.time;
  const crew=army.filter(unit=>Math.sign(unit.x)===homeSign&&unit.hp>unit.maxHp*.5&&
    unit.order?.type!=='board'&&distance(unit,capital)<52);
  crew.sort((a,b)=>distance(a,ship)-distance(b,ship)||a.id-b.id);
  for(const unit of crew.slice(0,Math.max(0,8-ship.passengers.length-boarding.length)))sim.command([unit.id],{type:'board',target:ship.id});
}

export function placeSkirmishShrines(sim,{repairOnly=false}={}){
  const shrines=sim.entities.filter(e=>e.hp>0&&e.kind==='shrine');
  const moving=repairOnly?shrines.filter(shrine=>!dryFootprint(sim,shrine,shrine.r)):shrines;
  if(!moving.length)return;
  const access=[0,1].map(owner=>{
    const capital=sim.owned(owner,'building','towncenter')[0];
    const start=capital&&sim.spawnPoint(capital);
    const grid=sim.grid(owner),regions=navigationRegions(sim,grid);
    return {grid,regions,home:start?regions[cellIndex(sim,start)]:0};
  });
  const active=access.filter(route=>route.home);
  for(const shrine of moving){
    const valid=point=>dryFootprint(sim,point,shrine.r)&&
      access.every(route=>!route.grid[cellIndex(sim,point)])&&
      shrines.every(other=>other===shrine||distance(other,point)>=16);
    const reachable=(point,route)=>route.regions[cellIndex(sim,point)]===route.home;
    const shared=point=>valid(point)&&active.every(route=>reachable(point,route));
    if(shared(shrine))continue;
    // The coast has two land regions. Pick a dry shore that an army can
    // reach, with the other kingdom able to approach by transport.
    const connected=point=>valid(point)&&(!active.length||active.some(route=>reachable(point,route)));
    if(sim.options.map==='coast'&&connected(shrine))continue;
    const point=(sim.options.map!=='coast'&&nearbyPoint(shrine,40,2,shared))||
      (connected(shrine)?shrine:nearbyPoint(shrine,56,2,connected));
    if(point&&point!==shrine){shrine.x=point.x;shrine.z=point.z;}
  }
}
