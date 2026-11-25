import {UNITS,BUILDINGS,TECHS,AGE_COSTS,DIFFICULTIES,availableTo} from './data.js';
import {customOpening,alliedSupport,customAttackTarget} from './allied-ai.js';
import {rememberDeposits,economicDanger,manageExpansion,fortifySettlements,staffSettlements,settlementThreats,protectWorkers,replaceTownCentre} from './ai-settlements.js';
import {orderSiegeAssault} from './ai-siege.js';
import {adaptAssault} from './ai-assault.js';
import {manageArchipelagoNavy} from './ai-waterways.js';
import {chooseLandingShore,coastalApproach} from './ai-landings.js';
import {closestCandidates} from './closest-candidates.js';
import {gatheringRange,gatheringPathRange} from './work-ranges.js';
import {buildingPlacementGrid,findPath} from './navigation.js';
import {fortifyKingdomWalls,fortificationReserved} from './ai-fortifications.js';
import {healableUnit,mechanicalUnit} from './maintenance.js';
import {applyPersonalityProfile} from './ai-personalities.js';
const distance=(a,b)=>Math.hypot(a.x-b.x,a.z-b.z);
const WOUNDED_HP=.28,SIEGE_WOUNDED_HP=.5,RECOVERY_RELEASE_SECONDS=60,RECOVERY_RELEASE_HP=.4;
const isWounded=unit=>unit.hp<unit.maxHp*(mechanicalUnit(unit)?SIEGE_WOUNDED_HP:WOUNDED_HP);
export const AI_PROFILES={
  story:{workers:20,raid:8,retreat:.9,memory:70},normal:{workers:30,raid:10,retreat:.7,memory:100},
  hard:{workers:40,raid:13,retreat:.6,memory:130},brutal:{workers:48,raid:16,retreat:.5,memory:160},
};
const freshState=()=>({known:{},phase:'opening',scoutIndex:0,lastOrders:-20,lastRebalance:-20,decision:0});
const stateFor=(sim,owner)=>(sim.options.mode==='custom'||sim.players.length>2)?((sim.aiStates??={})[owner]??={...freshState(),nextAttack:DIFFICULTIES[sim.difficulty(owner)].attack}):(sim.commanderAI??=freshState());
const military=unit=>unit.kind==='unit'&&!unit.embarked&&!['worker','fisher','quest'].includes(UNITS[unit.type].role)&&!['king','scout','transport'].includes(unit.type);
const power=unit=>UNITS[unit.type].damage*(unit.hp/unit.maxHp)*(UNITS[unit.type].role==='siege'?.65:1);
const countQueued=(sim,type,owner=1)=>sim.owned(owner,'building').reduce((n,b)=>n+b.queue.filter(q=>q.kind==='unit'&&q.type===type).length,0);

function pointSegmentDistance(point,start,end){
  const dx=end.x-start.x,dz=end.z-start.z,length=dx*dx+dz*dz,t=length?Math.max(0,Math.min(1,((point.x-start.x)*dx+(point.z-start.z)*dz)/length)):0;
  return Math.hypot(point.x-start.x-dx*t,point.z-start.z-dz*t);
}

export function constructionPreservesArmyRoutes(sim,type,x,z,owner,excludedUnitId=null){
  const definition=BUILDINGS[type];if(!definition||type==='farm'||type==='gate')return true;
  const point={x,z},clearance=definition.r+1.65;
  const armies=sim.entities.filter(unit=>unit.hp>0&&unit.kind==='unit'&&!unit.embarked&&!UNITS[unit.type].naval&&military(unit)&&sim.allied(owner,unit.owner)&&unit.id!==excludedUnitId);
  const impacted=[];
  for(const unit of armies){
    if(distance(unit,point)<definition.r+(unit.r||.65)+.12)return false;
    const order=unit.order;if(!order||!['move','attackmove','patrol'].includes(order.type)||!Number.isFinite(order.x)||!Number.isFinite(order.z))continue;
    const route=[{x:unit.x,z:unit.z},...(unit.path||[])];let hit=distance(unit,point)<clearance+8;
    for(let i=1;!hit&&i<route.length;i++)hit=pointSegmentDistance(point,route[i-1],route[i])<clearance;
    if(hit)impacted.push({unit,destination:{x:order.x,z:order.z}});
  }
  if(!impacted.length)return true;
  const grid=buildingPlacementGrid(sim,type,x,z,owner);
  for(const {unit,destination} of impacted){
    const oldStatus=unit.pathStatus;findPath(sim,unit,destination,1.4);const previouslyReachable=unit.pathStatus==='ready';
    if(previouslyReachable){findPath(sim,unit,destination,1.4,grid);const remainsReachable=unit.pathStatus==='ready';unit.pathStatus=oldStatus;if(!remainsReachable)return false;}
    else unit.pathStatus=oldStatus;
  }
  return true;
}

const BLOCKED_RETRY_SECONDS=30,BLOCKED_TARGET_TOLERANCE=12;
export function shouldRetryBlockedOrder(sim,unit,x,z){
  if(unit.pathStatus!=='blocked')return true;
  if(!Number.isFinite(unit.blockedAt)||sim.time-unit.blockedAt>=BLOCKED_RETRY_SECONDS)return true;
  return Math.hypot((unit.pathTargetX??Infinity)-x,(unit.pathTargetZ??Infinity)-z)>BLOCKED_TARGET_TOLERANCE;
}

// Formation slots may sit well away from the objective. Preserve current orders
// using the shared rally point so a refresh does not rebuild everyone’s route.
function advanceArmy(sim, fighters, point, phase) {
  const objective={x:point.x,z:point.z,phase};
  const moving=fighters.filter(unit=>{
    const previous=unit.order?.type==='attackmove'&&unit.order.commanderObjective;
    return unit.pathStatus==='blocked'||!previous||previous.phase!==phase||distance(previous,objective)>6;
  });
  if(moving.length)sim.command(moving.map(unit=>unit.id),{type:'attackmove',x:objective.x,z:objective.z,commanderObjective:objective});
}

function customNavy(sim,owner,visible,known,army,tc){
  const dock=sim.owned(owner,'building','dock').find(b=>b.progress>=1);
  if(dock&&dock.queue.length<2){const count=type=>sim.count(owner,'unit',type)+countQueued(sim,type,owner),warships=count('galley')+count('warship'),transports=count('transport'),type=transports<1?'transport':warships<2?(sim.players[owner].age>=3?'warship':'galley'):count('fishingboat')<3?'fishingboat':transports<2&&army.length>20?'transport':warships<6?(sim.players[owner].age>=3?'warship':'galley'):null;if(type)sim.train(dock.id,type);}
  const opponents=sim.players.map((p,i)=>({...p,owner:i})).filter(p=>sim.hostile(owner,p.owner)).sort((a,b)=>distance(a.start,tc)-distance(b.start,tc));
  const enemy=opponents[0];if(!enemy)return;
  const target=visible.filter(e=>UNITS[e.type]?.naval&&UNITS[e.type].damage).sort((a,b)=>distance(a,tc)-distance(b,tc))[0]||known.filter(e=>e.type==='dock').sort((a,b)=>distance(a,tc)-distance(b,tc))[0],mid=z=>Math.sin(z*.03)*2;
  const state=stateFor(sim,owner),opening=customOpening(sim,owner,AI_PROFILES[sim.difficulty(owner)]),ships=sim.owned(owner,'unit').filter(e=>UNITS[e.type].naval&&UNITS[e.type].damage);
  const capped=sim.population(owner)+sim.reservedPopulation(owner)>=sim.capacity(owner),stalledFleet=capped&&sim.time>=opening.earliest+60&&army.filter(e=>UNITS[e.type].damage>0).length>=opening.army;
  const launch=sim.time>=opening.earliest&&sim.count(owner,'unit','villager')>=opening.workers&&ships.length>=(stalledFleet?1:Math.min(3,1+sim.players[owner].age));
  const home=dock||tc,defense=visible.filter(e=>UNITS[e.type]?.naval&&UNITS[e.type].damage&&distance(e,home)<38).sort((a,b)=>distance(a,home)-distance(b,home))[0];
  const aid=!defense?Object.values(sim.teamAlarms||{}).filter(alarm=>alarm.owner!==owner&&sim.allied(owner,alarm.owner)&&sim.time-alarm.at<30&&sim.get(alarm.base)?.type==='dock'&&distance(home,alarm)<240).sort((a,b)=>distance(home,a)-distance(home,b))[0]:null;
  const aidCount=aid?Math.min(3,Math.floor(ships.length/2)):0;
  if(aid)ships.sort((a,b)=>distance(a,aid)-distance(b,aid));
  const fleetOrders=new Map();
  for(const [i,ship] of ships.entries()){
    if(dock&&!defense&&ship.hp<ship.maxHp*.65){
      const repairSpot={x:mid(dock.z)+Math.sign(dock.x)*13,z:dock.z};
      if(!ship.order||ship.order.type!=='move'||distance(ship.order,repairSpot)>5)sim.command([ship.id],{type:'move',...repairSpot});
      continue;
    }
    const assignment=i<aidCount?aid.base:null;
    if(!fleetOrders.has(assignment))fleetOrders.set(assignment,{ships:[],refresh:false,order:{type:i<aidCount||launch||defense?'attackmove':'move',x:i<aidCount?mid(aid.z):defense?.x??(launch?target?.x??mid(enemy.start.z):mid(home.z)),z:i<aidCount?aid.z:defense?.z??(launch?target?.z??enemy.start.z:home.z)}});
    const group=fleetOrders.get(assignment);group.ships.push(ship);
    group.refresh||=!ship.order||sim.time-(ship.navyOrderAt||0)>18||(ship.navyAid??null)!==assignment||!!defense&&distance(ship.order,defense)>10;
  }
  for(const [assignment,group] of fleetOrders)if(group.refresh){for(const ship of group.ships){ship.navyOrderAt=sim.time;ship.navyAid=assignment;}sim.command(group.ships.map(ship=>ship.id),group.order);}
  if(aidCount&&sim.time-(state.lastNavySupport||-40)>30){state.lastNavySupport=sim.time;sim.emit('ally-support',{owner,ally:aid.owner,count:aidCount,x:aid.x,z:aid.z});}
  if(launch)state.navalFirstAttackAt??=sim.time;
  if(!launch&&!sim.owned(owner,'unit','transport').some(ship=>ship.landing||ship.passengers?.length||ship.loadingSince!==undefined))return;
  const homeSign=Math.sign(tc.x),stranded=army.filter(e=>!e.embarked&&Math.sign(e.x)!==homeSign),recover=stranded.length>=4&&!opponents.some(p=>Math.sign(p.start.x)!==homeSign);
  const sign=recover?-homeSign:homeSign,loadZ=recover?stranded.reduce((sum,e)=>sum+e.z,0)/stranded.length:tc.z,opposite=opponents.find(p=>Math.sign(p.start.x)!==sign);
  for(const ship of sim.owned(owner,'unit','transport')){
    ship.passengers??=[];
    if(ship.landing){const shoreZ=ship.landing.shoreZ??ship.landing.z,shore={x:mid(shoreZ)+ship.landing.sign*20,z:shoreZ};
      const passengers=[...ship.passengers];let unloaded=false;
      for(const offset of [0,6,-6,9,-9]){const z=shore.z+offset,x=mid(z)+ship.landing.sign*20,cell=sim.cell(x,z);if(distance(ship,{x,z})<=11&&!sim.grid(owner)[cell.z*sim.gridSize+cell.x]&&sim.unload(ship.id,x,z,owner)){unloaded=true;break;}}
      if(unloaded){for(const id of passengers){const unit=sim.get(id);if(unit?.owner===owner&&!unit.embarked&&military(unit))sim.command([id],{type:'attackmove',x:ship.landing.x,z:ship.landing.z});}if(!ship.passengers.length){ship.landing=null;ship.loadingSince=null;}}
      else{
        const approach=coastalApproach(ship.landing.sign,shoreZ);
        if(distance(ship,approach)<8||ship.pathStatus==='blocked'){
          ship.landing.blockedSince??=sim.time;
          if(sim.time-ship.landing.blockedSince>=12){const next=chooseLandingShore(sim,owner,ship,ship.landing.sign,shoreZ,visible,known,{retry:true});if(next!==null){ship.landing.shoreZ=next;delete ship.landing.blockedSince;sim.command([ship.id],{type:'move',...coastalApproach(ship.landing.sign,next)});continue;}}
        }else delete ship.landing.blockedSince;
        if(!ship.order)sim.command([ship.id],{type:'move',...approach});
      }
      continue;
    }
    if(!opposite){if(ship.passengers.length)ship.landing={x:tc.x,z:tc.z,sign:homeSign};continue;}
    const boarding=army.filter(e=>e.order?.type==='board'&&e.order.target===ship.id);
    const crew=army.filter(e=>!e.embarked&&Math.sign(e.x)===sign&&e.hp>e.maxHp*.5),goal=crew.length+ship.passengers.length>=8?8:4,boardingTime=Math.min(90,35+crew.reduce((longest,e)=>Math.max(longest,distance(e,ship)/UNITS[e.type].speed),0));
    if(ship.passengers.length>=goal||ship.passengers.length>0&&sim.time-(ship.loadingSince??sim.time)>boardingTime){
      for(const unit of boarding)sim.command([unit.id],{type:'move',x:tc.x+8,z:tc.z-6});
      const shoreZ=chooseLandingShore(sim,owner,ship,Math.sign(opposite.start.x),opposite.start.z,visible,known)??opposite.start.z;
      ship.landing={...opposite.start,shoreZ,sign:Math.sign(opposite.start.x)};sim.command([ship.id],{type:'move',x:mid(shoreZ)+ship.landing.sign*12,z:shoreZ});continue;
    }
    const load={x:mid(loadZ)+sign*12,z:loadZ};if(distance(ship,load)>5){if(ship.order?.type!=='move'||distance(ship.order,load)>5)sim.command([ship.id],{type:'move',...load});continue;}
    ship.loadingSince??=sim.time;
    const priority=e=>UNITS[e.type].role==='siege'?0:e.type==='monk'?1:UNITS[e.type].role==='infantry'||e.type==='knight'?2:3;
    for(const unit of crew.filter(e=>e.order?.type!=='board').sort((a,b)=>priority(a)-priority(b)||distance(a,ship)-distance(b,ship)).slice(0,Math.max(0,8-ship.passengers.length-boarding.length)))sim.command([unit.id],{type:'board',target:ship.id});
  }
}

export function coastalArmyOrders(sim,owner,fighters,visible,known,phase,tc,state={}){
  const bases=sim.entities.filter(e=>e.hp>0&&e.type==='towncenter'&&sim.allied(owner,e.owner));
  for(const sign of [-1,1]){
    const group=fighters.filter(e=>Math.sign(e.x)===sign);if(!group.length)continue;const center={x:group.reduce((n,e)=>n+e.x,0)/group.length,z:group.reduce((n,e)=>n+e.z,0)/group.length};
    const nearby=(a,b)=>distance(a,center)-distance(b,center),threat=visible.filter(e=>e.kind==='unit'&&UNITS[e.type].damage>0&&Math.sign(e.x)===sign&&bases.some(base=>(base.owner===owner||distance(base,center)<45)&&distance(e,base)<30)).sort(nearby)[0];
    const buildings=known.filter(e=>e.kind==='building'&&Math.sign(e.x)===sign).sort(nearby),starts=sim.players.map((player,i)=>({...player.start,owner:i})).filter(point=>sim.hostile(owner,point.owner)&&Math.sign(point.x)===sign).sort(nearby);
    // A harbor is a useful landing target, but the army must move inland to the
    // capital instead of repeatedly attacking cheap replacement dock foundations.
    const capital=buildings.find(e=>e.type==='towncenter'),unscouted=starts.find(point=>!state.scoutedSpawns?.[point.owner]);
    let search=null;if(!capital&&!unscouted&&!buildings.length&&starts.length){const start=starts[Math.floor(sim.time/45)%starts.length],angle=Math.floor(sim.time/20)*2.39996323,radius=24+(Math.floor(sim.time/20)%3)*16;search={x:Math.max(-sim.halfWorld+8,Math.min(sim.halfWorld-8,start.x+Math.cos(angle)*radius)),z:Math.max(-sim.halfWorld+8,Math.min(sim.halfWorld-8,start.z+Math.sin(angle)*radius))};if(Math.sign(search.x)!==sign||sim.isWater(search.x,search.z))search={x:sign*24,z:search.z};}
    const target=threat||((phase==='attack'||Math.sign(tc.x)!==sign)&&(capital||unscouted||buildings[0]||search));
    if(target){
      const fronts=state.shoreAssaults??={},front=fronts[sign]??={};
      if(threat)delete front.assault;
      const objective=threat?target:adaptAssault(sim,front,target,group,visible,buildings,center);
      if(objective!==center)advanceArmy(sim,group,objective,threat?'defend':'attack');
      else sim.command(group.filter(unit=>unit.pathStatus==='blocked'||unit.order?.commanderObjective?.phase==='attack').map(unit=>unit.id),{type:'move',x:center.x,z:center.z});
    }
    else{if(state.shoreAssaults?.[sign])delete state.shoreAssaults[sign].assault;const base=bases.filter(e=>Math.sign(e.x)===sign).sort(nearby)[0],rally=base?{x:base.x+8,z:base.z-6}:{x:Math.sin(center.z*.03)*2+sign*22,z:center.z};sim.command(group.filter(unit=>distance(unit,rally)>12).map(unit=>unit.id),{type:'move',...rally});}
  }
}

export function rememberVisibleEnemies(sim,state,owner=1){
  state.scoutedSpawns??={};for(let i=0;i<sim.players.length;i++)if(sim.hostile(owner,i)&&sim.players[i].start&&sim.canSee(owner,{...sim.players[i].start,r:2}))state.scoutedSpawns[i]=true;
  const visible=sim.entities.filter(e=>e.hp>0&&!e.embarked&&sim.hostile(owner,e.owner)&&['unit','building'].includes(e.kind)&&sim.canSee(owner,e)),ids=new Set(visible.map(e=>e.id));
  for(const e of visible)state.known[e.id]={id:e.id,owner:e.owner,type:e.type,kind:e.kind,x:e.x,z:e.z,hp:e.hp,maxHp:e.maxHp,lastSeen:sim.time};
  for(const [id,memory]of Object.entries(state.known)){
    if(memory.owner!==undefined&&!sim.hostile(owner,memory.owner)||memory.kind==='unit'&&sim.time-memory.lastSeen>AI_PROFILES[sim.difficulty(owner)].memory||sim.canSee(owner,memory)&&!ids.has(Number(id)))delete state.known[id];
  }return visible;
}

function armyPlan(sim,state,owner){
  const player=sim.players[owner],army=sim.owned(owner,'unit').filter(military),known=Object.values(state.known),roles={};
  for(const enemy of known.filter(e=>e.kind==='unit')){const role=UNITS[enemy.type]?.role;roles[role]=(roles[role]||0)+1;}
  const wishes={spearman:2+(roles.cavalry||0)*2,archer:1+(roles.spear||0)*1.5,skirmisher:(roles.ranged||0)*1.6,swordsman:1+(roles.ranged||0),knight:1+(roles.ranged||0)*1.8,
    ram:known.some(e=>e.kind==='building')?Math.max(1,army.length/9):0,catapult:(known.some(e=>e.kind==='building')||(roles.ranged||0)>=3||(roles.infantry||0)>=4)?Math.max(1,army.length/10):0,trebuchet:known.some(e=>e.kind==='building')&&player.age>=3?Math.max(1.4,army.length/10):0,monk:Math.floor(army.length/8)};
  if(player.faction==='alder')wishes.swordsman+=2;if(player.faction==='raven')wishes.knight+=3;
  if(player.faction==='iron'){wishes.ram=Math.max(wishes.ram,1.6);wishes.catapult=Math.max(wishes.catapult,1.2);wishes.trebuchet=Math.max(wishes.trebuchet,1.6);}
  if(player.faction==='jade'){wishes.chukonu=3+(roles.infantry||0)+(roles.spear||0);wishes.firelancer=2.4+(roles.ranged||0)+(roles.siege||0);}
  wishes.sentinel=2+(roles.ranged||0);wishes.marksman=2+(roles.infantry||0);wishes.outrider=2+(roles.worker||0);wishes.ironbreaker=2+(roles.infantry||0)+(roles.siege||0);
  const heroKey=`hero_${player.faction}`;
  if(UNITS[heroKey]&&player.age>=2&&!sim.owned(owner,'unit').some(u=>UNITS[u.type]?.hero))wishes[heroKey]=4.5;
  const owned={},queued={};for(const unit of army)owned[unit.type]=(owned[unit.type]||0)+1;for(const site of sim.owned(owner,'building'))for(const item of site.queue)if(item.kind==='unit')queued[item.type]=(queued[item.type]||0)+1;
  return {wishes,owned,queued};
}
export function chooseArmyUnit(sim,building,state,owner=1,plan=null){
  const player=sim.players[owner];plan??=armyPlan(sim,state,owner);let best=null,score=0;
  for(const [type,definition]of Object.entries(UNITS)){
    if(!plan.wishes[type]||!availableTo(definition,player.faction)||definition.age>player.age||!definition.at.includes(building.type))continue;
    const owned=(plan.owned[type]||0)+(plan.queued[type]||0),next=plan.wishes[type]/(owned+1);
    const unitCost=sim.cost(definition.cost,owner,'unit',type);
    if(next>score&&sim.canAfford(unitCost,owner)){best=type;score=next;}
  }return best;
}

const BUILDING_REPAIR_THRESHOLD=.92,ALLIED_REPAIR_THRESHOLD=.75,MECHANICAL_REPAIR_THRESHOLD=.9;
function buildingRepairPriority(b){
  if(b.type==='towncenter'||b.type==='wonder')return 0;
  if(b.type==='keep'||b.type==='bombard')return 1;
  if(b.type==='tower'||b.type==='gate'||b.type==='wall')return 2;
  if(['barracks','range','stable','workshop','dock'].includes(b.type))return 3;
  return 4;
}
function canAffordRepair(sim,owner,target){
  const resources=sim.players[owner]?.resources;if(!resources)return false;
  if(mechanicalUnit(target)){
    const step=Math.min(target.maxHp-target.hp,2.3);if(!(step>0))return false;
    return Object.entries(UNITS[target.type].cost||{}).every(([r,n])=>(resources[r]||0)>=n*.35*step/target.maxHp);
  }
  const resource=['wall','tower','bombard','keep','gate','wonder'].includes(target.type)?'stone':'wood';
  return (resources[resource]||0)>=.6;
}
function canReachRepairTarget(sim,worker,target){
  if(distance(worker,target)<=target.r+3)return true;
  if(distance(worker,target)>42)return false;
  const probe={...worker,stuckTime:0},route=findPath(sim,probe,target,target.r+2.7);
  if(probe.pathStatus==='blocked')return false;
  const end=route.at(-1)||worker;
  return distance(end,target)<=target.r+3.2;
}
export function manageRepairs(sim,owner,workers,buildings,visible,tc){
  const free=target=>{
    const pool=workers.filter(w=>!w.embarked&&!['build','repair','garrison'].includes(w.order?.type)&&!w.aiFleeing&&!w.order?.aiExpansion&&!w.order?.aiFortification).sort((a,b)=>distance(a,target)-distance(b,target));
    if(!UNITS[target.type]?.naval)return pool[0]||null;
    return pool.find(w=>canReachRepairTarget(sim,w,target))||null;
  };
  const damagedMechanical=sim.owned(owner,'unit').filter(unit=>unit.hp>0&&!unit.embarked&&mechanicalUnit(unit)&&unit.hp<unit.maxHp*MECHANICAL_REPAIR_THRESHOLD).sort((a,b)=>a.hp/a.maxHp-b.hp/b.maxHp||a.id-b.id);
  let siegeRepairs=workers.filter(worker=>worker.order?.type==='repair'&&mechanicalUnit(sim.get(worker.order.target))).length;
  for(const target of damagedMechanical){
    if(siegeRepairs>=2)break;
    if(workers.some(worker=>worker.order?.type==='repair'&&worker.order.target===target.id))continue;
    if(!canAffordRepair(sim,owner,target))continue;
    if(visible.some(enemy=>enemy.kind==='unit'&&sim.hostile(owner,enemy.owner)&&distance(enemy,target)<18))continue;
    const worker=free(target);
    if(!worker)continue;
    sim.command([worker.id],{type:'repair',target:target.id});siegeRepairs++;
  }
  const ownDamaged=buildings.filter(b=>b.progress>=1&&b.hp<b.maxHp*BUILDING_REPAIR_THRESHOLD);
  const alliedDamaged=tc?sim.entities.filter(b=>b.hp>0&&b.kind==='building'&&b.owner!==owner&&sim.allied(owner,b.owner)&&b.progress>=1&&b.hp<b.maxHp*ALLIED_REPAIR_THRESHOLD&&['towncenter','keep','bombard','tower','gate','wonder'].includes(b.type)&&distance(b,tc)<42):[];
  const repairBuildings=[...ownDamaged,...alliedDamaged].sort((a,b)=>Number(a.owner!==owner)-Number(b.owner!==owner)||buildingRepairPriority(a)-buildingRepairPriority(b)||a.hp/a.maxHp-b.hp/b.maxHp||a.id-b.id);
  let buildingRepairs=workers.filter(w=>w.order?.type==='repair'&&sim.get(w.order.target)?.kind==='building').length;
  const maxBuildingRepairs=workers.length>=8?3:workers.length>=5?2:1;
  for(const building of repairBuildings){
    if(buildingRepairs>=maxBuildingRepairs)break;
    if(!canAffordRepair(sim,owner,building))continue;
    const citadel=['towncenter','keep','wonder'].includes(building.type);
    if(!citadel&&visible.some(enemy=>enemy.kind==='unit'&&sim.hostile(owner,enemy.owner)&&distance(enemy,building)<8))continue;
    const wanted=citadel&&building.hp<building.maxHp*.5&&workers.length>=8?2:1;
    let assigned=workers.filter(w=>w.order?.type==='repair'&&w.order.target===building.id).length;
    while(assigned<wanted&&buildingRepairs<maxBuildingRepairs){
      const worker=free(building);if(!worker)break;
      sim.command([worker.id],{type:'repair',target:building.id});assigned++;buildingRepairs++;
    }
  }
}

export function dynamicEconomyWeights(player){
  const res=player?.resources||{food:0,wood:0,gold:0,stone:0};
  const age=player?.age||0;
  const base={food:age<3?.43:.36,wood:.32,gold:age<1?.15:.24,stone:.08};
  const food=res.food||0,wood=res.wood||0,gold=res.gold||0,stone=res.stone||0;
  const coreMin=Math.min(food,wood,age>=1?gold:wood);
  const mult={food:1,wood:1,gold:1,stone:1};
  // Boost critically low resources so the AI never starves on timber or gold.
  if(wood<250)mult.wood=2.4;else if(wood<550)mult.wood=1.55;
  if(food<220)mult.food=2.0;else if(food<450)mult.food=1.35;
  if(age>=1&&gold<220)mult.gold=1.8;else if(age>=1&&gold<450)mult.gold=1.3;
  if(age>=2&&stone<260)mult.stone=1.75;else if(age>=2&&stone<550)mult.stone=1.25;
  // Throttle heavily stockpiled resources when another core resource is scarce.
  for(const r of ['food','wood','gold','stone']){
    const amt=res[r]||0;
    const compare=r==='stone'?Math.min(food,wood):coreMin;
    if(amt>6000&&amt>Math.max(400,compare*4))mult[r]*=.06;
    else if(amt>2500&&amt>Math.max(300,compare*2.8))mult[r]*=.18;
    else if(amt>1400&&amt>Math.max(250,compare*2.0))mult[r]*=.42;
  }
  const raw={food:base.food*mult.food,wood:base.wood*mult.wood,gold:base.gold*mult.gold,stone:base.stone*mult.stone};
  const sum=raw.food+raw.wood+raw.gold+raw.stone||1;
  return {food:raw.food/sum,wood:raw.wood/sum,gold:raw.gold/sum,stone:raw.stone/sum};
}

function assignGatherTypes(sim,e,owner,state,memory,types){
  for(const type of types){
    const sources=closestCandidates(sim.entities,5,
      t=>t.hp>0&&(t.kind==='resource'&&!t.water&&t.type===type&&t.amount>0||type==='food'&&t.type==='farm'&&t.owner===owner&&t.progress>=1)&&!economicDanger(state,t,0,memory),
      source=>distance(e,source));
    for(const source of sources){
      const range=gatheringPathRange(e,source),route=sim.pathTo(e,source,range);
      if(e.pathStatus==='blocked'||source.kind==='resource'&&route.length&&distance(route.at(-1),source)>gatheringRange(e,source))continue;
      e.gatherType=type;e.order={type:'gather',target:source.id};e.orders=[];e.path=route;e.repath=1.5;e.pathRevision=sim.revision;e.pathTargetX=source.x;e.pathTargetZ=source.z;e.pathTargetId=source.id;e.pathRange=range;
      return true;
    }
  }
  return false;
}

export function rebalanceEconomy(sim,state,owner,workers){
  const player=sim.players[owner];
  if(!player)return 0;
  const gatherers=workers.filter(w=>!w.embarked&&!w.aiFleeing&&w.order?.type==='gather'&&!w.order.aiExpansion&&!w.order.aiFortification);
  if(gatherers.length<3)return 0;
  const weights=dynamicEconomyWeights(player),types=['food','wood','gold','stone'];
  const counts=Object.fromEntries(types.map(t=>[t,0]));
  for(const w of gatherers)if(w.gatherType in counts)counts[w.gatherType]++;
  const desired=Object.fromEntries(types.map(t=>[t,gatherers.length*weights[t]]));
  const deficits=types.filter(t=>counts[t]<Math.floor(desired[t])||(t!=='stone'&&(player.resources[t]||0)<300&&counts[t]<Math.ceil(desired[t]))).sort((a,b)=>(desired[b]-counts[b])-(desired[a]-counts[a]));
  if(!deficits.length)return 0;
  const surpluses=types.filter(t=>counts[t]>Math.ceil(desired[t])||(counts[t]>1&&(player.resources[t]||0)>2500&&desired[t]<counts[t]-.5)).sort((a,b)=>(player.resources[b]||0)-(player.resources[a]||0)||(counts[b]-desired[b])-(counts[a]-desired[a]));
  if(!surpluses.length)return 0;
  const memory=Object.values(state.known||{});
  let moved=0;
  for(const from of surpluses){
    const excess=Math.max(1,Math.floor(counts[from]-desired[from]));
    const pool=gatherers.filter(w=>w.gatherType===from&&(w.carry||0)<14).sort((a,b)=>(a.carry||0)-(b.carry||0));
    for(const worker of pool.slice(0,Math.min(excess,4-moved))){
      if(moved>=4)break;
      const targetOrder=deficits.filter(t=>counts[t]<Math.ceil(desired[t])).sort((a,b)=>(desired[b]-counts[b])-(desired[a]-counts[a]));
      if(!targetOrder.length)break;
      if(assignGatherTypes(sim,worker,owner,state,memory,targetOrder)){
        counts[from]--;counts[worker.gatherType]++;moved++;
      }
    }
    if(moved>=4)break;
  }
  return moved;
}

export function manageFarming(sim,owner,workers,buildings,towns){
  const player=sim.players[owner],farmDef=BUILDINGS.farm;
  if(!player||!farmDef||player.age<farmDef.age)return false;
  const dropSites=buildings.filter(b=>b.progress>=1&&(b.type==='towncenter'||b.type==='mill'));
  if(!dropSites.length)return false;
  const naturalFood=sim.entities.filter(e=>e.hp>0&&e.kind==='resource'&&e.type==='food'&&!e.water&&e.amount>0&&dropSites.some(base=>distance(e,base)<52)).reduce((n,e)=>n+e.amount,0);
  const farms=buildings.filter(b=>b.type==='farm'),completedFarms=farms.filter(b=>b.progress>=1),buildingFarms=farms.length-completedFarms.length;
  // When no fruits remain, keep food workers actively harvesting completed farms —
  // unless food is already heavily stockpiled while timber is needed elsewhere.
  if(naturalFood<=0&&completedFarms.length&&(player.resources.food||0)<1200){
    const targetFarmers=Math.min(completedFarms.length,Math.max(2,Math.ceil(workers.length*.35)));
    let farmers=workers.filter(w=>w.order?.type==='gather'&&w.gatherType==='food').length;
    if(farmers<targetFarmers){
      const busyFarmIds=new Set(workers.filter(w=>w.order?.type==='gather').map(w=>w.order.target));
      const openFarms=completedFarms.filter(f=>!busyFarmIds.has(f.id));
      const protectWood=(player.resources.wood||0)<400&&(player.resources.food||0)>=350;
      const candidates=workers.filter(w=>!w.embarked&&!w.aiFleeing&&!w.carry&&(!w.order||(w.order.type==='gather'&&w.gatherType!=='food'&&(!protectWood||w.gatherType!=='wood')&&!w.order.aiExpansion&&!w.order.aiFortification)));
      for(const farm of openFarms){
        if(farmers>=targetFarmers)break;
        const worker=closestCandidates(candidates,1,w=>w.order?.target!==farm.id,w=>distance(w,farm))[0];
        if(!worker)break;
        candidates.splice(candidates.indexOf(worker),1);
        worker.gatherType='food';
        sim.command([worker.id],{type:'gather',target:farm.id});
        farmers++;
      }
    }
  }
  if((player.resources.food||0)>=2000&&(player.resources.wood||0)<550)return false;
  const farmGoal=naturalFood<=0?Math.max(5,Math.ceil(workers.length*.42)):(naturalFood<1200||(player.resources.food<120&&sim.time>75))?Math.max(4,Math.ceil(workers.length*.34)):0;
  if(!farmGoal||farms.length>=farmGoal)return false;
  const maxConcurrent=naturalFood<=0&&completedFarms.length<2?2:1;
  if(buildingFarms>=maxConcurrent)return false;
  if(!sim.canAfford(sim.cost(farmDef.cost,owner,'building'),owner))return false;
  const orderedDrops=[...dropSites].sort((a,b)=>farms.filter(f=>distance(f,a)<26).length-farms.filter(f=>distance(f,b)<26).length||Number(a.type!=='mill')-Number(b.type!=='mill')||a.id-b.id);
  const limit=sim.halfWorld-6;
  const fortifications=buildings.filter(b=>b.type==='wall'||b.type==='gate');
  for(const site of orderedDrops){
    const worker=closestCandidates(workers,1,w=>!w.embarked&&!['build','repair','garrison'].includes(w.order?.type)&&!w.aiFleeing&&!w.order?.aiExpansion&&!w.order?.aiFortification,w=>distance(w,site))[0];
    if(!worker)return false;
    for(let i=0;i<48;i++){
      const angle=i*2.39996323,r=8.5+Math.floor(i/8)*3;
      const point={x:Math.max(-limit,Math.min(limit,site.x+Math.cos(angle)*r)),z:Math.max(-limit,Math.min(limit,site.z+Math.sin(angle)*r))};
      if(!sim.buildValid('farm',point.x,point.z,owner)||fortificationReserved(sim,'farm',point.x,point.z,owner))continue;
      if(fortifications.some(w=>distance(w,point)<w.r+farmDef.r+1.25))continue;
      sim.pathTo(worker,point);
      if(worker.pathStatus==='blocked')continue;
      if(sim.build('farm',point.x,point.z,[worker.id],owner))return true;
    }
  }
  return false;
}

export function installCommanderAI(Simulation){
  const p=Simulation.prototype,assignWorker=p.assignWorker,serialize=p.serialize,restore=Simulation.restore;
  p.assignWorker=function(e){
    if(this.players[e.owner].controller==='human'||e.owner===0&&this.players[0].controller!=='ai'||e.type!=='villager')return assignWorker.call(this,e);const owner=e.owner;
    if(e.aiFleeing>this.time){e.order=null;e.path=[];return;}delete e.aiFleeing;
    const player=this.players[owner],workers=this.owned(owner,'unit','villager'),weights=dynamicEconomyWeights(player);
    const counts=Object.fromEntries(Object.keys(weights).map(type=>[type,workers.filter(v=>v!==e&&v.order?.type==='gather'&&v.gatherType===type).length]));
    const state=stateFor(this,owner),memory=Object.values(state.known||{}),types=Object.keys(weights).sort((a,b)=>counts[a]/weights[a]-counts[b]/weights[b]);
    if(!assignGatherTypes(this,e,owner,state,memory,types)){e.order=null;e.path=[];}
  };
  p.commanderBuild=function(type,near=null,owner=1,requireVisibility=false){
    const player=this.players[owner],definition=BUILDINGS[type],towns=this.owned(owner,'building','towncenter'),tc=towns[0];
    if(!tc||!definition||player.age<definition.age||!this.canAfford(this.cost(definition.cost,owner,'building'),owner))return false;
    const villagers=this.owned(owner,'unit','villager');
    const bases=near?[near]:[tc,...towns.slice(1).filter(b=>b.progress>=1)];
    for(const base of bases){
      const worker=closestCandidates(villagers,1,w=>!w.embarked&&!['build','repair','garrison'].includes(w.order?.type)&&!w.aiFleeing&&!w.order?.aiExpansion&&!w.order?.aiFortification,w=>distance(w,base))[0];
      if(!worker)continue;
      for(let i=0;i<32;i++){const angle=i*2.39996323,r=near?4+Math.floor(i/8)*3:12+Math.floor(i/8)*7,point={x:base.x+Math.cos(angle)*r,z:base.z+Math.sin(angle)*r};
        if(requireVisibility&&!this.canSee(owner,point)||!this.buildValid(type,point.x,point.z,owner)||fortificationReserved(this,type,point.x,point.z,owner)||!constructionPreservesArmyRoutes(this,type,point.x,point.z,owner,worker.id))continue;this.pathTo(worker,point);if(worker.pathStatus==='blocked')continue;
        return this.build(type,point.x,point.z,[worker.id],owner);
      }
    }return false;
  };
  p.tickAI=function(owner=1){
    if(this.options.multiplayer&&this.options.mode!=='custom'||['sandbox','tutorial','survival'].includes(this.options.mode)||this.mission?.survival)return;
    const state=stateFor(this,owner),player=this.players[owner],profile=applyPersonalityProfile(AI_PROFILES[this.difficulty(owner)],player?.aiPersonality||this.options.aiPersonality);
    const capital=this.owned(owner,'building','towncenter')[0];
    if(!capital){
      // Recover a razed capital instead of idling. The remembered home keeps the
      // replacement near the original settlement rather than wherever the last
      // surviving villager happens to stand.
      replaceTownCentre(this,owner,state);this.assignEconomy(owner);return;
    }
    state.home??={x:capital.x,z:capital.z};
    const tc=capital,visible=rememberVisibleEnemies(this,state,owner);state.decision++;const nextAttack=this.options.mode==='custom'?state.nextAttack:this.nextAttack;
    if(this.owned(owner,'building','market').some(site=>site.progress>=1)){
      if(player.resources.wood<320&&player.resources.gold>=130)this.trade('wood',true,owner);
      else if(player.resources.wood<320&&player.resources.gold<130&&player.resources.food>=900)this.trade('food',false,owner);
      else if(player.resources.food<120&&player.resources.gold>=130)this.trade('food',true,owner);
      else if(player.resources.gold<150&&player.resources.food>=900)this.trade('food',false,owner);
    }
    this.assignEconomy(owner);const workers=this.owned(owner,'unit','villager'),buildings=this.owned(owner,'building'),army=this.owned(owner,'unit').filter(military),landArmy=army.filter(e=>!UNITS[e.type].naval),towns=buildings.filter(b=>b.type==='towncenter'),baseThreats=settlementThreats(this,owner,visible,buildings);
    if(this.options.mode==='custom'&&this.time-(state.lastDeposits??-20)>=10){rememberDeposits(this,state,owner);state.lastDeposits=this.time;}
    protectWorkers(this,state,owner,workers,buildings,visible);
    staffSettlements(this,state,owner,workers,buildings);
    manageRepairs(this,owner,workers,buildings,visible,tc);
    manageExpansion(this,state,owner,workers,baseThreats);
    if(this.options.map==='coast'&&!buildings.some(site=>site.type==='dock')){const z=player.start?.z??tc.z;this.commanderBuild('dock',{x:Math.sin(z*.03)*2+Math.sign(tc.x)*20,z},owner);}
    const ageCost=AGE_COSTS[player.age];
    const populationLimit=this.options.populationLimit||160,ageWorkerThreshold=Math.min(12,Math.max(8,Math.floor(populationLimit*.4)));
    state.budget={savingAge:!!(ageCost&&!player.agePending&&workers.length>=ageWorkerThreshold&&player.resources.food>=ageCost.food*.45),workerGoal:Math.min(profile.workers+Math.max(0,towns.length-1)*6,18+player.age*8,Math.floor(populationLimit*.5))};
    if(this.capacity(owner)<(this.options.populationLimit||160)&&this.capacity(owner)-this.population(owner)-this.reservedPopulation(owner)<6&&!buildings.some(b=>b.type==='house'&&b.progress<1))this.commanderBuild('house',null,owner);
    // Prioritize farm transition before optional camps or military expansion once berries run low or dry.
    manageFarming(this,owner,workers,buildings,towns);
    for(const town of towns.filter(b=>b.progress>=1))if(workers.length+countQueued(this,'villager',owner)<state.budget.workerGoal&&town.queue.length<2)this.train(town.id,'villager');
    if(this.time>12&&!this.count(owner,'unit','scout')&&!countQueued(this,'scout',owner)&&tc.queue.length<3)this.train(tc.id,'scout');
    if(ageCost&&!player.agePending&&workers.length>=ageWorkerThreshold&&this.canAfford(ageCost,owner))this.research(tc.id,'age');
    // Build actual drop-offs near the sources workers use, then diversify paid production.
    for(const [type,resource]of [['camp','wood'],['mine','gold'],['mine','stone']]){
      const active=workers.find(w=>w.gatherType===resource&&w.order?.type==='gather'),source=active&&this.get(active.order.target);
      if(source&&!buildings.some(b=>BUILDINGS[b.type].drop?.includes(resource)&&distance(b,source)<16)){if(this.commanderBuild(type,source,owner))break;}
    }
    fortifySettlements(this,state,owner,workers,buildings,baseThreats);
    fortifyKingdomWalls(this,state,owner,workers,this.owned(owner,'building'),baseThreats);
    // One barracks forever capped the AI at roughly half a human's production.
    // Production buildings now scale with the age; economy buildings stay single.
    // Every settlement already starts with a mill, and farms are placed next to
    // a town centre, so a second mill only competed for early timber.
    const priorities=['barracks',...(player.age>=1?['range','stable','blacksmith','market']:[]),...(player.age>=2?['workshop','monastery']:[])];
    const productionCap=type=>type==='barracks'?1+Math.min(2,player.age):['range','stable'].includes(type)?1+Math.min(1,Math.max(0,player.age-1)):1;
    // Extra production only when the economy can actually carry it. Spending the
    // timber a settlement needs for camps and farms on a second barracks starved
    // expansion, which is a worse opponent than a slow one.
    const surplus=!state.budget.savingAge&&workers.length>=16&&player.resources.wood>=260;
    for(const type of priorities){const limit=surplus?productionCap(type):1;if(buildings.filter(b=>b.type===type).length<limit){if(this.commanderBuild(type,null,owner))break;}}
    if(this.time-state.lastRebalance>10){state.lastRebalance=this.time;rebalanceEconomy(this,state,owner,workers);}
    const plan=armyPlan(this,state,owner);
    for(const b of buildings.filter(b=>b.progress>=1&&b.queue.length<2)){
      const type=chooseArmyUnit(this,b,state,owner,plan);if(!type)continue;
      if(this.options.mode==='custom'&&this.options.map==='coast'){const navy=this.owned(owner,'unit').filter(e=>UNITS[e.type].naval).length+buildings.reduce((n,site)=>n+site.queue.filter(q=>q.kind==='unit'&&UNITS[q.type]?.naval).length,0),fleetGoal=Math.min(9,Math.max(4,Math.floor((this.options.populationLimit||160)*.25))),reserve=Math.max(0,fleetGoal-navy);if(this.population(owner)+this.reservedPopulation(owner)+(UNITS[type].pop||1)>this.capacity(owner)-reserve)continue;}
      const reserve=state.budget.savingAge?{food:Math.min(ageCost.food*.35,player.resources.food),gold:Math.min(ageCost.gold*.35,player.resources.gold)}:{};
      if(state.expansion)for(const [resource,amount] of Object.entries(this.cost(BUILDINGS.towncenter.cost,owner,'building')))reserve[resource]=Math.max(reserve[resource]||0,amount);
      const unitCost=this.cost(UNITS[type].cost,owner,'unit',type);
      if(Object.entries(unitCost).every(([r,cost])=>player.resources[r]-cost>=(reserve[r]||0))&&this.train(b.id,type))plan.queued[type]=(plan.queued[type]||0)+1;
    }
    if(!state.budget.savingAge)for(const tech of ['shieldDrill','caravanLedger','raidingParties','siegecraft','imperialGunpowder','conscription','arrowslits','fireArrows','boilingOil','wheelbarrow','sanctuary','economy','attack','armor','ranged','husbandry','fortification','fortifiedWall']){
      if(!availableTo(TECHS[tech],player.faction))continue;
      // A tech that cannot be researched yet must not consume the single
      // research slot for this tick and starve the affordable upgrades.
      if(player.age<TECHS[tech].age)continue;
      if(player.tech[tech]>=Math.min(TECHS[tech].max,player.age+1))continue;
      // Fortifying an empty kingdom is wasted spending; only upgrade a real perimeter.
      if(tech==='fortifiedWall'&&!buildings.some(b=>b.type==='wall'||b.type==='gate'))continue;
      const site=buildings.find(b=>b.progress>=1&&!b.queue.length&&TECHS[tech].at.includes(b.type));if(site&&this.canAfford(Object.fromEntries(Object.entries(TECHS[tech].cost).map(([r,c])=>[r,c*(player.tech[tech]+1)])),owner)){this.research(site.id,tech);break;}
    }
    const multiKingdom=this.options.mode==='custom'||this.players.length>2;
    const scout=this.owned(owner,'unit','scout')[0],waypoints=multiKingdom?this.spawnPositions.flatMap((point,i)=>{
      if(!this.hostile(owner,i)||this.options.map==='coast'&&Math.sign(point.x)!==Math.sign(tc.x))return [];
      if(!state.scoutedSpawns?.[i])return [[point.x,point.z]];
      return [0,1,2,3,4,5].map(n=>{const angle=n*Math.PI/3,radius=n%2?45:28;return [point.x+Math.cos(angle)*radius,point.z+Math.sin(angle)*radius];}).filter(([x,z])=>Math.abs(x)<this.halfWorld-8&&Math.abs(z)<this.halfWorld-8&&!this.isWater(x,z)&&(this.options.map!=='coast'||Math.sign(x)===Math.sign(tc.x)));
    }):this.options.map==='coast'?[[22,35],[20,65],[22,-60]]:[[0,0],[-18,12],[-42,32],[-62,55],[-60,-30],[10,55]];
    if(!waypoints.length)waypoints.push([tc.x+8,tc.z+12]);
    if(scout&&(!scout.order||distance(scout,scout.order)<5)){
      const point=scout.hp<scout.maxHp*.35?{x:tc.x+8,z:tc.z-6}:{x:waypoints[state.scoutIndex%waypoints.length][0],z:waypoints[state.scoutIndex%waypoints.length][1]};
      this.command([scout.id],{type:'move',...point});state.scoutIndex++;
    }
    const protectedBases=multiKingdom?this.entities.filter(e=>e.hp>0&&e.type==='towncenter'&&this.allied(owner,e.owner)):[tc];
    const defendedBases=multiKingdom?protectedBases.filter(base=>base.owner===owner):protectedBases;
    const threats=baseThreats,fieldEnemies=visible.filter(e=>e.kind==='unit'&&military(e)&&(defendedBases.some(base=>distance(e,base)<60)||landArmy.some(unit=>distance(e,unit)<25)));
    const ownPower=landArmy.reduce((n,e)=>n+power(e),0),enemyPower=fieldEnemies.reduce((n,e)=>n+power(e),0),recovering=landArmy.filter(isWounded);
    for(const unit of landArmy){
      if(unit.aiResting&&!isWounded(unit)){delete unit.aiResting;delete unit.aiRestingSince;delete unit.aiRecoveryReleased;}
      else if(unit.aiResting&&this.time-(unit.aiRestingSince??this.time)>=RECOVERY_RELEASE_SECONDS&&(unit.hp>=unit.maxHp*RECOVERY_RELEASE_HP||threats.length)){delete unit.aiResting;delete unit.aiRestingSince;unit.aiRecoveryReleased=true;}
      if(unit.aiRecoveryReleased&&unit.hp>=unit.maxHp*.6)delete unit.aiRecoveryReleased;
    }
    const wounded=recovering.filter(unit=>!unit.aiRecoveryReleased);
    const retreats=new Map();
    for(const unit of wounded){let retreat=this.options.mode!=='custom'&&this.options.map==='coast'&&unit.x<0?{x:-23,z:35}:{x:tc.x+8,z:tc.z-6};if(this.options.mode==='custom'&&this.options.map==='coast'){const base=protectedBases.filter(e=>Math.sign(e.x)===Math.sign(unit.x)&&distance(e,unit)<75).sort((a,b)=>distance(a,unit)-distance(b,unit))[0];      retreat=base?{x:base.x+8,z:base.z-6}:{x:Math.sin(unit.z*.03)*2+Math.sign(unit.x)*22,z:unit.z+Math.sign(tc.z-unit.z)*9};}
      if(!shouldRetryBlockedOrder(this,unit,retreat.x,retreat.z))continue;
      if(!unit.order&&unit.aiResting&&distance(unit,retreat)<12)continue;
      unit.aiResting=true;unit.aiRestingSince??=this.time;
      if(unit.order?.type==='move'&&unit.order.aiRetreat&&distance(unit.order,retreat)<=12)continue;
      const key=retreat.x.toFixed(1)+':'+retreat.z.toFixed(1);if(!retreats.has(key))retreats.set(key,{point:retreat,units:[]});retreats.get(key).units.push(unit.id);
    }
    for(const retreat of retreats.values())this.command(retreat.units,{type:'move',...retreat.point,aiRetreat:true});
    const recoveryTargets=landArmy.filter(unit=>healableUnit(unit)&&unit.hp<unit.maxHp*.65&&(wounded.includes(unit)||protectedBases.some(base=>distance(base,unit)<30))).sort((a,b)=>a.hp/a.maxHp-b.hp/b.maxHp||a.id-b.id),recoveryHealers=new Set();
    for(const healer of this.owned(owner,'unit','monk').filter(unit=>!unit.embarked&&!isWounded(unit)&&unit.order?.type!=='board')){
      const current=healer.order?.type==='heal'?this.get(healer.order.target):null;
      if(healableUnit(current)&&this.allied(owner,current.owner)&&current.hp<current.maxHp){recoveryHealers.add(healer.id);const index=recoveryTargets.indexOf(current);if(index>=0)recoveryTargets.splice(index,1);continue;}
      if(!recoveryTargets.length)break;
      const index=recoveryTargets.findIndex(target=>this.options.map!=='coast'||Math.sign(target.x)===Math.sign(healer.x));if(index<0)continue;
      const [target]=recoveryTargets.splice(index,1);this.command([healer.id],{type:'heal',target:target.id});recoveryHealers.add(healer.id);
    }
    const healthy=landArmy.filter(e=>!wounded.includes(e)&&e.order?.type!=='board'),support=alliedSupport(this,owner,state,healthy.filter(e=>!recoveryHealers.has(e.id)),visible,tc,threats),ready=healthy.filter(e=>!support.has(e.id)&&!recoveryHealers.has(e.id)),knownBuildings=Object.values(state.known).filter(e=>e.kind==='building');
    const opening=this.options.mode==='custom'?customOpening(this,owner,profile):null,offensiveReady=!opening||this.time>=opening.earliest&&player.age>=opening.age&&workers.length>=opening.workers;
    let phase='muster',target={x:tc.x-12,z:tc.z+9};
    const directive=owner>0&&this.allied(0,owner)&&this.allyDirective&&this.time<(this.allyDirective.until||0)?this.allyDirective:null;
    const provoked=this.provokedWarlord&&this.provokedWarlord.owner===owner&&this.time<(this.provokedWarlord.until||0);
    if(threats.length){phase='defend';target=threats.sort((a,b)=>distance(a,tc)-distance(b,tc))[0];}
    else if(directive&&(directive.type==='defend'||directive.type==='help')&&ready.filter(e=>UNITS[e.type].damage>0).length>=2){
      phase='defend';target={x:directive.x,z:directive.z};
    }
    else if(directive&&directive.type==='attack'&&ready.filter(e=>UNITS[e.type].damage>0).length>=3){
      phase='attack';target={x:directive.x,z:directive.z};
    }
    else if(enemyPower>0&&ownPower<enemyPower*profile.retreat&&ready.some(e=>distance(e,tc)>30)){phase='regroup';}
    else if(provoked&&ready.filter(e=>UNITS[e.type].damage>0).length>=4){
      phase='attack';target=multiKingdom?customAttackTarget(this,owner,state,tc,knownBuildings):(this.players[0]?.start||{x:0,z:0});
    }
    else if(state.phase==='attack'&&ready.filter(e=>UNITS[e.type].damage>0).length>=Math.max(3,Math.floor(profile.raid/2))||offensiveReady&&this.time>=nextAttack&&ready.filter(e=>UNITS[e.type].damage>0).length>=(opening?.army??Math.min(profile.raid,6+player.age*3))){
      const realKnown=knownBuildings.filter(b=>b.type!=='wall'&&b.type!=='gate');
      const raidSites=realKnown.length?realKnown:knownBuildings;
      phase='attack';target=multiKingdom?customAttackTarget(this,owner,state,tc,knownBuildings):raidSites.sort((a,b)=>(a.type==='towncenter'?-20:0)+distance(a,tc)-(b.type==='towncenter'?-20:0)-distance(b,tc))[0]||{x:0,z:0};
    }
    if(this.options.map==='coast')this.commanderNavy(state,visible,knownBuildings,landArmy.filter(e=>!support.has(e.id)),tc,owner);
    else if(this.options.map==='archipelago')manageArchipelagoNavy(this,owner,state,tc,visible,knownBuildings);
    if(this.time-state.lastOrders>=8||state.phase!==phase){state.lastOrders=this.time;state.phase=phase;
      const fighters=ready.filter(e=>UNITS[e.type].damage>0&&e.order?.type!=='board'&&(this.options.mode==='custom'||this.options.map!=='coast'||(phase==='defend'?e.x>0:e.x<0)));
      if(phase!=='attack')delete state.assault;
      if(this.options.mode==='custom'&&this.options.map==='coast')coastalArmyOrders(this,owner,fighters,visible,knownBuildings,phase,tc,state);
      else if(phase==='attack'||phase==='defend'){
        if(phase==='attack')target=adaptAssault(this,state,target,fighters,visible,knownBuildings,tc);
        const guardCount=this.options.mode==='custom'&&phase==='attack'?Math.min(6,Math.max(2,Math.floor(fighters.length*.15))):0;
        const guards=guardCount?fighters.filter(e=>UNITS[e.type].role!=='siege'&&shouldRetryBlockedOrder(this,e,tc.x+8,tc.z-6)).sort((a,b)=>distance(a,tc)-distance(b,tc)).slice(0,guardCount):[],ids=new Set(guards.map(e=>e.id));
        const assault=fighters.filter(e=>!ids.has(e.id)&&shouldRetryBlockedOrder(this,e,target.x,target.z));
        const assigned=phase==='attack'?orderSiegeAssault(this,owner,assault,visible,target):new Set();
        advanceArmy(this,assault.filter(e=>!assigned.has(e.id)),target,phase);
        advanceArmy(this,guards,{x:tc.x+8,z:tc.z-6},'home-guard');state.homeGuard=guards.map(e=>e.id);
      }
      else if(this.options.mode!=='custom'&&this.options.map==='coast'){
        for(const sign of [-1,1]){const rally=sign<0?{x:-24,z:30}:target;this.command(fighters.filter(unit=>Math.sign(unit.x)===sign&&distance(unit,rally)>12&&shouldRetryBlockedOrder(this,unit,rally.x,rally.z)).map(unit=>unit.id),{type:'move',...rally});}
      }else this.command(fighters.filter(unit=>distance(unit,target)>12&&shouldRetryBlockedOrder(this,unit,target.x,target.z)).map(unit=>unit.id),{type:'move',x:target.x,z:target.z});
      const siege=fighters.find(e=>UNITS[e.type].role==='siege'),escort=siege||fighters[0];if(escort)for(const healer of ready.filter(e=>e.type==='monk'&&e.order?.type!=='board'&&(this.options.map!=='coast'||e.x*escort.x>0)))this.guard([healer.id],escort.id,false,owner);
      state.target={x:target.x,z:target.z,lastSeen:target.lastSeen??this.time};
      if(phase==='attack')state.firstAttackAt??=this.time;
    }
    if(phase==='attack'&&this.time>=nextAttack+55){if(multiKingdom)state.nextAttack=this.time+30;else this.nextAttack=this.time+30;}
    const king=this.owned(owner,'unit','king')[0];if(king&&king.hp<king.maxHp*.8)this.command([king.id],{type:'move',x:tc.x+8,z:tc.z-8});
    if((this.options.mode==='dominion'||this.options.mode==='koth'||this.mission?.dominion)&&phase!=='defend'&&this.time>70){
      const shrines=this.entities.filter(e=>e.kind==='shrine'&&!this.allied(owner,e.owner));for(let i=0;i<shrines.length;i++){const group=ready.filter(e=>UNITS[e.type].damage>0).slice(i*3,i*3+3);
        for(const unit of group)if(unit.order?.type!=='attackmove'||distance(unit.order,shrines[i])>6)this.command([unit.id],{type:'attackmove',x:shrines[i].x,z:shrines[i].z});}
    }
    if(this.options.mode==='wonder'&&player.age===3&&this.time>600&&!buildings.some(b=>b.type==='wonder'))this.commanderBuild('wonder',null,owner);
  };
  p.commanderNavy=function(state,visible,known,landArmy,tc,owner=1){
    if(this.options.mode==='custom')return customNavy(this,owner,visible,known,landArmy,tc);
    const dock=this.owned(owner,'building','dock').find(b=>b.progress>=1);if(!dock)return;
    const fishing=this.owned(owner,'unit','fishingboat');if(dock.queue.length<2){const type=fishing.length+countQueued(this,'fishingboat',owner)<4?'fishingboat':!this.owned(owner,'unit','transport').length&&!countQueued(this,'transport',owner)?'transport':this.players[owner].age>=3?'warship':'galley';this.train(dock.id,type);}
    const ships=this.owned(owner,'unit').filter(e=>UNITS[e.type].naval&&UNITS[e.type].damage),target=visible.find(e=>e.kind==='unit'&&UNITS[e.type].naval)||known.find(e=>e.type==='dock');
    for(const ship of ships){if(target){if(ship.order?.type!=='attackmove'||distance(ship.order,target)>6)this.command([ship.id],{type:'attackmove',x:target.x,z:target.z});}
      else if(!ship.order)this.patrol([ship.id],-6,28,false,1);}
    for(const ship of this.owned(owner,'unit','transport')){ship.passengers??=[];
      const boarding=landArmy.filter(e=>e.order?.type==='board'&&e.order.target===ship.id);
      if(ship.passengers.length>=4&&(!boarding.length||ship.passengers.length>=8||this.time-(ship.loadingSince||this.time)>18)){
        for(const unit of boarding)this.command([unit.id],{type:'move',x:22,z:-24});
        if(ship.order?.type!=='move'||ship.order.x>0)this.command([ship.id],{type:'move',x:-10,z:30});continue;
      }
      if(ship.order?.type==='move'&&ship.order.x<0)continue;
      if(!ship.passengers.length&&ship.x<0){ship.loadingSince=null;this.command([ship.id],{type:'move',x:10,z:-24});continue;}
      if(ship.x>0&&ship.z<-10){ship.loadingSince??=this.time;for(const unit of landArmy.filter(e=>e.x>0&&e.hp>e.maxHp*.5&&e.order?.type!=='board'&&distance(e,tc)<40).slice(0,8-ship.passengers.length-boarding.length))this.command([unit.id],{type:'board',target:ship.id});}
    }
  };
  p.serialize=function(){return {...serialize.call(this),commanderAI:this.commanderAI||null,aiClock:this.aiClock,fogClock:this.fogClock};};
  Simulation.restore=function(data){const sim=restore.call(this,data);sim.commanderAI=data.commanderAI?JSON.parse(JSON.stringify(data.commanderAI)):null;sim.aiClock=data.aiClock??0;sim.fogClock=data.fogClock??0;return sim;};
}
