import {UNITS,BUILDINGS,TECHS,AGE_COSTS,DIFFICULTIES,availableTo} from './data.js';
import {customOpening,alliedSupport} from './allied-ai.js';
import {rememberDeposits,economicDanger,manageExpansion,fortifySettlements,staffSettlements,settlementThreats,protectWorkers} from './ai-settlements.js';
import {orderSiegeAssault} from './ai-siege.js';
import {chooseLandingShore,coastalApproach} from './ai-landings.js';
import {closestCandidates} from './closest-candidates.js';
const distance=(a,b)=>Math.hypot(a.x-b.x,a.z-b.z);
export const AI_PROFILES={
  story:{workers:20,raid:8,retreat:.9,memory:70},normal:{workers:30,raid:10,retreat:.7,memory:100},
  hard:{workers:40,raid:13,retreat:.6,memory:130},brutal:{workers:48,raid:16,retreat:.5,memory:160},
};
const freshState=()=>({known:{},phase:'opening',scoutIndex:0,lastOrders:-20,lastRebalance:-20,decision:0});
const stateFor=(sim,owner)=>sim.options.mode==='custom'?(sim.aiStates[owner]??={...freshState(),nextAttack:DIFFICULTIES[sim.difficulty(owner)].attack}):(sim.commanderAI??=freshState());
const military=unit=>unit.kind==='unit'&&!unit.embarked&&!['worker','fisher','quest'].includes(UNITS[unit.type].role)&&!['king','scout','transport'].includes(unit.type);
const power=unit=>UNITS[unit.type].damage*(unit.hp/unit.maxHp)*(UNITS[unit.type].role==='siege'?.65:1);
const countQueued=(sim,type,owner=1)=>sim.owned(owner,'building').reduce((n,b)=>n+b.queue.filter(q=>q.kind==='unit'&&q.type===type).length,0);

function customNavy(sim,owner,visible,known,army,tc){
  const dock=sim.owned(owner,'building','dock').find(b=>b.progress>=1);
  if(dock&&dock.queue.length<2){const count=type=>sim.owned(owner,'unit',type).length+countQueued(sim,type,owner),warships=count('galley')+count('warship'),transports=count('transport'),type=transports<1?'transport':warships<2?(sim.players[owner].age>=3?'warship':'galley'):count('fishingboat')<3?'fishingboat':transports<2&&army.length>20?'transport':warships<6?(sim.players[owner].age>=3?'warship':'galley'):null;if(type)sim.train(dock.id,type);}
  const opponents=sim.players.map((p,i)=>({...p,owner:i})).filter(p=>sim.hostile(owner,p.owner)).sort((a,b)=>distance(a.start,tc)-distance(b.start,tc));
  const enemy=opponents[0];if(!enemy)return;
  const target=visible.filter(e=>UNITS[e.type]?.naval&&UNITS[e.type].damage).sort((a,b)=>distance(a,tc)-distance(b,tc))[0]||known.filter(e=>e.type==='dock').sort((a,b)=>distance(a,tc)-distance(b,tc))[0],mid=z=>Math.sin(z*.03)*2;
  const state=stateFor(sim,owner),opening=customOpening(sim,owner,AI_PROFILES[sim.difficulty(owner)]),ships=sim.owned(owner,'unit').filter(e=>UNITS[e.type].naval&&UNITS[e.type].damage);
  const capped=sim.population(owner)+sim.reservedPopulation(owner)>=sim.capacity(owner),stalledFleet=capped&&sim.time>=opening.earliest+60&&army.filter(e=>UNITS[e.type].damage>0).length>=opening.army;
  const launch=sim.time>=opening.earliest&&sim.owned(owner,'unit','villager').length>=opening.workers&&ships.length>=(stalledFleet?1:Math.min(3,1+sim.players[owner].age));
  const home=dock||tc,defense=visible.filter(e=>UNITS[e.type]?.naval&&UNITS[e.type].damage&&distance(e,home)<38).sort((a,b)=>distance(a,home)-distance(b,home))[0];
  const aid=!defense?Object.values(sim.teamAlarms||{}).filter(alarm=>alarm.owner!==owner&&sim.allied(owner,alarm.owner)&&sim.time-alarm.at<30&&sim.get(alarm.base)?.type==='dock'&&distance(home,alarm)<240).sort((a,b)=>distance(home,a)-distance(home,b))[0]:null;
  const aidCount=aid?Math.min(3,Math.floor(ships.length/2)):0;
  if(aid)ships.sort((a,b)=>distance(a,aid)-distance(b,aid));
  const fleetOrders=new Map();
  for(const [i,ship] of ships.entries()){
    const assignment=i<aidCount?aid.base:null;
    if(!fleetOrders.has(assignment))fleetOrders.set(assignment,{ships:[],refresh:false,order:{type:i<aidCount||launch||defense?'attackmove':'move',x:i<aidCount?mid(aid.z):defense?.x??(launch?target?.x??mid(enemy.start.z):mid(home.z)),z:i<aidCount?aid.z:defense?.z??(launch?target?.z??enemy.start.z:home.z)}});
    const group=fleetOrders.get(assignment);group.ships.push(ship);
    group.refresh||=!ship.order||sim.time-(ship.navyOrderAt||0)>18||(ship.navyAid??null)!==assignment||!!defense&&distance(ship.order,defense)>8;
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
    if(target)sim.command(group.map(e=>e.id),{type:'attackmove',x:target.x,z:target.z});
    else{const base=bases.filter(e=>Math.sign(e.x)===sign).sort(nearby)[0],rally=base?{x:base.x+8,z:base.z-6}:{x:Math.sin(center.z*.03)*2+sign*22,z:center.z};sim.command(group.filter(unit=>distance(unit,rally)>12).map(unit=>unit.id),{type:'move',...rally});}
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
  const wishes={spearman:2+(roles.cavalry||0)*2,archer:1+(roles.spear||0)*1.5,swordsman:1+(roles.ranged||0),knight:1+(roles.ranged||0)*1.8,
    ram:known.some(e=>e.kind==='building')?Math.max(1,army.length/9):0,catapult:known.some(e=>e.kind==='building')?Math.max(1,army.length/12):0,monk:Math.floor(army.length/8)};
  if(player.faction==='alder')wishes.swordsman+=2;if(player.faction==='raven')wishes.knight+=3;
  wishes.sentinel=2+(roles.ranged||0);wishes.marksman=2+(roles.infantry||0);wishes.outrider=2+(roles.worker||0);
  const owned={},queued={};for(const unit of army)owned[unit.type]=(owned[unit.type]||0)+1;for(const site of sim.owned(owner,'building'))for(const item of site.queue)if(item.kind==='unit')queued[item.type]=(queued[item.type]||0)+1;
  return {wishes,owned,queued};
}
export function chooseArmyUnit(sim,building,state,owner=1,plan=null){
  const player=sim.players[owner];plan??=armyPlan(sim,state,owner);let best=null,score=0;
  for(const [type,definition]of Object.entries(UNITS)){
    if(!plan.wishes[type]||!availableTo(definition,player.faction)||definition.age>player.age||!definition.at.includes(building.type))continue;
    const owned=(plan.owned[type]||0)+(plan.queued[type]||0),next=plan.wishes[type]/(owned+1);
    if(next>score&&sim.canAfford(definition.cost,owner)){best=type;score=next;}
  }return best;
}

export function installCommanderAI(Simulation){
  const p=Simulation.prototype,assignWorker=p.assignWorker,serialize=p.serialize,restore=Simulation.restore;
  p.assignWorker=function(e){
    if(this.players[e.owner].controller==='human'||e.owner===0&&this.players[0].controller!=='ai'||e.type!=='villager')return assignWorker.call(this,e);const owner=e.owner;
    if(e.aiFleeing>this.time){e.order=null;e.path=[];return;}delete e.aiFleeing;
    const player=this.players[owner],workers=this.owned(owner,'unit','villager'),weights={food:player.age<3?.43:.36,wood:.32,gold:player.age<1?.15:.24,stone:.08};
    const counts=Object.fromEntries(Object.keys(weights).map(type=>[type,workers.filter(v=>v!==e&&v.order?.type==='gather'&&v.gatherType===type).length]));
    const state=stateFor(this,owner),memory=Object.values(state.known||{}),types=Object.keys(weights).sort((a,b)=>counts[a]/weights[a]-counts[b]/weights[b]);
    for(const type of types){const sources=closestCandidates(this.entities,5,
      t=>t.hp>0&&(t.kind==='resource'&&!t.water&&t.type===type&&t.amount>0||type==='food'&&t.type==='farm'&&t.owner===owner&&t.progress>=1)&&!economicDanger(state,t,0,memory),
      source=>distance(e,source));
      for(const source of sources){const route=this.pathTo(e,source);if(e.pathStatus==='blocked'||source.kind==='resource'&&route.length&&distance(route.at(-1),source)>source.r+e.r+1.1)continue;
        e.gatherType=type;e.order={type:'gather',target:source.id};e.orders=[];e.path=route;e.repath=1.5;e.pathRevision=this.revision;e.pathTargetX=source.x;e.pathTargetZ=source.z;e.pathTargetId=source.id;e.pathRange=0;return;
      }
    }e.order=null;e.path=[];
  };
  p.commanderBuild=function(type,near=null,owner=1){
    const player=this.players[owner],definition=BUILDINGS[type],tc=this.owned(owner,'building','towncenter')[0];
    if(!tc||!definition||player.age<definition.age||!this.canAfford(this.cost(definition.cost,owner,'building'),owner))return false;
    const worker=closestCandidates(this.owned(owner,'unit','villager'),1,w=>!w.embarked&&!['build','repair','garrison'].includes(w.order?.type)&&!w.aiFleeing&&!w.order?.aiExpansion,w=>distance(w,near||tc))[0];if(!worker)return false;
    for(let i=0;i<32;i++){const angle=i*2.39996323,base=near||tc,r=near?4+Math.floor(i/8)*3:12+Math.floor(i/8)*7,point={x:base.x+Math.cos(angle)*r,z:base.z+Math.sin(angle)*r};
      if(!this.buildValid(type,point.x,point.z,owner))continue;this.pathTo(worker,point);if(worker.pathStatus==='blocked')continue;
      return this.build(type,point.x,point.z,[worker.id],owner);
    }return false;
  };
  p.tickAI=function(owner=1){
    if(this.options.multiplayer&&this.options.mode!=='custom'||['sandbox','tutorial','survival'].includes(this.options.mode)||this.mission?.survival)return;
    const tc=this.owned(owner,'building','towncenter')[0];if(!tc)return;
    const state=stateFor(this,owner),profile=AI_PROFILES[this.difficulty(owner)],player=this.players[owner],visible=rememberVisibleEnemies(this,state,owner);state.decision++;const nextAttack=this.options.mode==='custom'?state.nextAttack:this.nextAttack;
    if(this.owned(owner,'building','market').some(site=>site.progress>=1)){
      if(player.resources.wood<180&&player.resources.gold>=130)this.trade('wood',true,owner);
      else if(player.resources.wood<180&&player.resources.gold<130&&player.resources.food>=900)this.trade('food',false,owner);
      else if(player.resources.food<120&&player.resources.gold>=130)this.trade('food',true,owner);
      else if(player.resources.gold<150&&player.resources.food>=900)this.trade('food',false,owner);
    }
    this.assignEconomy(owner);const workers=this.owned(owner,'unit','villager'),buildings=this.owned(owner,'building'),army=this.owned(owner,'unit').filter(military),landArmy=army.filter(e=>!UNITS[e.type].naval),towns=buildings.filter(b=>b.type==='towncenter'),baseThreats=settlementThreats(this,owner,visible,buildings);
    if(this.options.mode==='custom'&&this.time-(state.lastDeposits??-20)>=10){rememberDeposits(this,state,owner);state.lastDeposits=this.time;}
    protectWorkers(this,state,owner,workers,buildings,visible);
    staffSettlements(this,state,owner,workers,buildings);
    manageExpansion(this,state,owner,workers,baseThreats);
    if(this.options.map==='coast'&&!buildings.some(site=>site.type==='dock')){const z=player.start?.z??tc.z;this.commanderBuild('dock',{x:Math.sin(z*.03)*2+Math.sign(tc.x)*20,z},owner);}
    const ageCost=AGE_COSTS[player.age];
    state.budget={savingAge:!!(ageCost&&!player.agePending&&workers.length>=12&&player.resources.food>=ageCost.food*.45),workerGoal:Math.min(profile.workers+Math.max(0,towns.length-1)*6,18+player.age*8,Math.floor((this.options.populationLimit||160)*.5))};
    if(this.capacity(owner)<(this.options.populationLimit||160)&&this.capacity(owner)-this.population(owner)-this.reservedPopulation(owner)<6&&!buildings.some(b=>b.type==='house'&&b.progress<1))this.commanderBuild('house',null,owner);
    for(const town of towns.filter(b=>b.progress>=1))if(workers.length+countQueued(this,'villager',owner)<state.budget.workerGoal&&town.queue.length<2)this.train(town.id,'villager');
    if(this.time>12&&!this.owned(owner,'unit','scout').length&&!countQueued(this,'scout',owner)&&tc.queue.length<3)this.train(tc.id,'scout');
    if(ageCost&&!player.agePending&&workers.length>=12&&this.canAfford(ageCost,owner))this.research(tc.id,'age');
    // Build actual drop-offs near the sources workers use, then diversify paid production.
    for(const [type,resource]of [['camp','wood'],['mine','gold'],['mine','stone']]){
      const active=workers.find(w=>w.gatherType===resource&&w.order?.type==='gather'),source=active&&this.get(active.order.target);
      if(source&&!buildings.some(b=>BUILDINGS[b.type].drop?.includes(resource)&&distance(b,source)<16)){if(this.commanderBuild(type,source,owner))break;}
    }
    const naturalFood=this.entities.filter(e=>e.hp>0&&e.kind==='resource'&&e.type==='food'&&!e.water&&towns.some(base=>distance(e,base)<45)).reduce((n,e)=>n+e.amount,0);
    if((naturalFood<1200||player.resources.food<100&&this.time>90)&&buildings.filter(b=>b.type==='farm').length<Math.max(4,workers.length/3)&&!buildings.some(b=>b.type==='farm'&&b.progress<1)){
      const base=towns.filter(b=>b.progress>=1).sort((a,b)=>buildings.filter(f=>f.type==='farm'&&distance(f,a)<30).length-buildings.filter(f=>f.type==='farm'&&distance(f,b)<30).length)[0];this.commanderBuild('farm',base,owner);
    }
    fortifySettlements(this,state,owner,workers,buildings,baseThreats);
    const priorities=['barracks',...(player.age>=1?['range','stable','blacksmith','market']:[]),...(player.age>=2?['workshop','monastery']:[])];
    for(const type of priorities)if(!buildings.some(b=>b.type===type)){if(this.commanderBuild(type,null,owner))break;}
    if(this.time-state.lastRebalance>15){state.lastRebalance=this.time;for(const worker of workers.filter(w=>w.order?.type==='gather'&&!w.carry&&!w.aiFleeing).slice(0,2))this.assignWorker(worker);}
    const plan=armyPlan(this,state,owner);
    for(const b of buildings.filter(b=>b.progress>=1&&b.queue.length<2)){
      const type=chooseArmyUnit(this,b,state,owner,plan);if(!type)continue;
      if(this.options.mode==='custom'&&this.options.map==='coast'){const navy=this.owned(owner,'unit').filter(e=>UNITS[e.type].naval).length+buildings.reduce((n,site)=>n+site.queue.filter(q=>q.kind==='unit'&&UNITS[q.type]?.naval).length,0),reserve=Math.max(0,9-navy);if(this.population(owner)+this.reservedPopulation(owner)+(UNITS[type].pop||1)>this.capacity(owner)-reserve)continue;}
      const reserve=state.budget.savingAge?{food:Math.min(ageCost.food*.35,player.resources.food),gold:Math.min(ageCost.gold*.35,player.resources.gold)}:{};
      if(state.expansion)for(const [resource,amount] of Object.entries(this.cost(BUILDINGS.towncenter.cost,owner,'building')))reserve[resource]=Math.max(reserve[resource]||0,amount);
      if(Object.entries(UNITS[type].cost).every(([r,cost])=>player.resources[r]-cost>=(reserve[r]||0))&&this.train(b.id,type))plan.queued[type]=(plan.queued[type]||0)+1;
    }
    if(!state.budget.savingAge)for(const tech of ['shieldDrill','caravanLedger','raidingParties','economy','attack','armor','ranged','husbandry','fortification']){
      if(!availableTo(TECHS[tech],player.faction))continue;
      if(player.tech[tech]>=Math.min(TECHS[tech].max,player.age+1))continue;
      const site=buildings.find(b=>b.progress>=1&&!b.queue.length&&TECHS[tech].at.includes(b.type));if(site&&this.canAfford(Object.fromEntries(Object.entries(TECHS[tech].cost).map(([r,c])=>[r,c*(player.tech[tech]+1)])),owner)){this.research(site.id,tech);break;}
    }
    for(const building of buildings.filter(b=>b.progress>=1&&b.hp<b.maxHp*.65)){
      if(workers.some(w=>w.order?.type==='repair'&&w.order.target===building.id))continue;
      const worker=workers.find(w=>!w.embarked&&!['build','repair','garrison'].includes(w.order?.type)&&!w.aiFleeing&&!w.order?.aiExpansion);if(worker)this.command([worker.id],{type:'repair',target:building.id});break;
    }
    const scout=this.owned(owner,'unit','scout')[0],waypoints=this.options.mode==='custom'?this.spawnPositions.flatMap((point,i)=>{
      if(!this.hostile(owner,i)||this.options.map==='coast'&&Math.sign(point.x)!==Math.sign(tc.x))return [];
      if(!state.scoutedSpawns?.[i])return [[point.x,point.z]];
      return [0,1,2,3,4,5].map(n=>{const angle=n*Math.PI/3,radius=n%2?45:28;return [point.x+Math.cos(angle)*radius,point.z+Math.sin(angle)*radius];}).filter(([x,z])=>Math.abs(x)<this.halfWorld-8&&Math.abs(z)<this.halfWorld-8&&!this.isWater(x,z)&&(this.options.map!=='coast'||Math.sign(x)===Math.sign(tc.x)));
    }):this.options.map==='coast'?[[22,35],[20,65],[22,-60]]:[[0,0],[-18,12],[-42,32],[-62,55],[-60,-30],[10,55]];
    if(!waypoints.length)waypoints.push([tc.x+8,tc.z+12]);
    if(scout&&(!scout.order||distance(scout,scout.order)<5)){
      const point=scout.hp<scout.maxHp*.35?{x:tc.x+8,z:tc.z-6}:{x:waypoints[state.scoutIndex%waypoints.length][0],z:waypoints[state.scoutIndex%waypoints.length][1]};
      this.command([scout.id],{type:'move',...point});state.scoutIndex++;
    }
    const protectedBases=this.options.mode==='custom'?this.entities.filter(e=>e.hp>0&&e.type==='towncenter'&&this.allied(owner,e.owner)):[tc];
    const defendedBases=this.options.mode==='custom'?protectedBases.filter(base=>base.owner===owner):protectedBases;
    const threats=baseThreats,fieldEnemies=visible.filter(e=>e.kind==='unit'&&military(e)&&(defendedBases.some(base=>distance(e,base)<60)||landArmy.some(unit=>distance(e,unit)<25)));
    const ownPower=landArmy.reduce((n,e)=>n+power(e),0),enemyPower=fieldEnemies.reduce((n,e)=>n+power(e),0),wounded=landArmy.filter(e=>e.hp<e.maxHp*.28);
    const retreats=new Map();
    for(const unit of wounded){let retreat=this.options.mode!=='custom'&&this.options.map==='coast'&&unit.x<0?{x:-23,z:35}:{x:tc.x+8,z:tc.z-6};if(this.options.mode==='custom'&&this.options.map==='coast'){const base=protectedBases.filter(e=>Math.sign(e.x)===Math.sign(unit.x)&&distance(e,unit)<75).sort((a,b)=>distance(a,unit)-distance(b,unit))[0];retreat=base?{x:base.x+8,z:base.z-6}:{x:Math.sin(unit.z*.03)*2+Math.sign(unit.x)*22,z:unit.z+Math.sign(tc.z-unit.z)*9};}
      if(!unit.order&&unit.aiResting&&distance(unit,retreat)<12)continue;
      unit.aiResting=true;
      if(unit.order?.type==='move'&&unit.order.aiRetreat&&distance(unit.order,retreat)<=12)continue;
      const key=retreat.x.toFixed(1)+':'+retreat.z.toFixed(1);if(!retreats.has(key))retreats.set(key,{point:retreat,units:[]});retreats.get(key).units.push(unit.id);
    }
    for(const retreat of retreats.values())this.command(retreat.units,{type:'move',...retreat.point,aiRetreat:true});
    const healthy=landArmy.filter(e=>!wounded.includes(e)&&e.order?.type!=='board'),support=alliedSupport(this,owner,state,healthy,visible,tc,threats),ready=healthy.filter(e=>!support.has(e.id)),knownBuildings=Object.values(state.known).filter(e=>e.kind==='building');
    const opening=this.options.mode==='custom'?customOpening(this,owner,profile):null,offensiveReady=!opening||this.time>=opening.earliest&&player.age>=opening.age&&workers.length>=opening.workers;
    let phase='muster',target={x:tc.x-12,z:tc.z+9};
    if(threats.length){phase='defend';target=threats.sort((a,b)=>distance(a,tc)-distance(b,tc))[0];}
    else if(enemyPower>0&&ownPower<enemyPower*profile.retreat&&ready.some(e=>distance(e,tc)>30)){phase='regroup';}
    else if(state.phase==='attack'&&ready.filter(e=>UNITS[e.type].damage>0).length>=Math.max(3,Math.floor(profile.raid/2))||offensiveReady&&this.time>=nextAttack&&ready.filter(e=>UNITS[e.type].damage>0).length>=(opening?.army??Math.min(profile.raid,6+player.age*3))){
      phase='attack';target=knownBuildings.sort((a,b)=>(a.type==='towncenter'?-20:0)+distance(a,tc)-(b.type==='towncenter'?-20:0)-distance(b,tc))[0]||(this.options.mode==='custom'?this.spawnPositions.find((point,i)=>this.hostile(owner,i)):{x:0,z:0});
    }
    if(this.options.map==='coast')this.commanderNavy(state,visible,knownBuildings,landArmy.filter(e=>!support.has(e.id)),tc,owner);
    if(this.time-state.lastOrders>=8||state.phase!==phase){state.lastOrders=this.time;state.phase=phase;
      const fighters=ready.filter(e=>UNITS[e.type].damage>0&&e.order?.type!=='board'&&(this.options.mode==='custom'||this.options.map!=='coast'||(phase==='defend'?e.x>0:e.x<0)));
      if(this.options.mode==='custom'&&this.options.map==='coast')coastalArmyOrders(this,owner,fighters,visible,knownBuildings,phase,tc,state);
      else if(phase==='attack'||phase==='defend'){
        const guardCount=this.options.mode==='custom'&&phase==='attack'?Math.min(6,Math.max(2,Math.floor(fighters.length*.15))):0;
        const guards=guardCount?fighters.filter(e=>UNITS[e.type].role!=='siege').sort((a,b)=>distance(a,tc)-distance(b,tc)).slice(0,guardCount):[],ids=new Set(guards.map(e=>e.id));
        const assault=fighters.filter(e=>!ids.has(e.id));this.command(assault.map(e=>e.id),{type:'attackmove',x:target.x,z:target.z});
        if(phase==='attack')orderSiegeAssault(this,owner,assault,visible,target);
        if(guards.length)this.command(guards.map(e=>e.id),{type:'attackmove',x:tc.x+8,z:tc.z-6});state.homeGuard=guards.map(e=>e.id);
      }
      else if(this.options.mode!=='custom'&&this.options.map==='coast'){
        for(const sign of [-1,1]){const rally=sign<0?{x:-24,z:30}:target;this.command(fighters.filter(unit=>Math.sign(unit.x)===sign&&distance(unit,rally)>12).map(unit=>unit.id),{type:'move',...rally});}
      }else this.command(fighters.filter(unit=>distance(unit,target)>12).map(unit=>unit.id),{type:'move',x:target.x,z:target.z});
      const siege=fighters.find(e=>UNITS[e.type].role==='siege'),escort=siege||fighters[0];if(escort)for(const healer of ready.filter(e=>e.type==='monk'&&e.order?.type!=='board'&&(this.options.map!=='coast'||e.x*escort.x>0)))this.guard([healer.id],escort.id,false,owner);
      state.target={x:target.x,z:target.z,lastSeen:target.lastSeen??this.time};
      if(phase==='attack')state.firstAttackAt??=this.time;
    }
    if(phase==='attack'&&this.time>=nextAttack+55){if(this.options.mode==='custom')state.nextAttack=this.time+30;else this.nextAttack=this.time+30;}
    const king=this.owned(owner,'unit','king')[0];if(king&&king.hp<king.maxHp*.8)this.command([king.id],{type:'move',x:tc.x+8,z:tc.z-8});
    if((this.options.mode==='dominion'||this.mission?.dominion)&&phase!=='defend'&&this.time>70){
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
