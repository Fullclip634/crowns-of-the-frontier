import {retireDeadUnits} from './dead-unit-cleanup.js';
import {revealVisionCircle} from './vision-circle.js';
import {installFrontiers} from './frontiers.js';
import {findPath,clearSegment,unitNavigationGrid} from './navigation.js';
import {installTactics,formationSlot} from './tactics.js';
import {installCommanderAI} from './commander-ai.js';
import {installCampaigns} from './campaigns.js';
import {installCustomBattle,normalizeBattle,PLAYER_COLORS} from './custom-battle.js';
import {SpatialBuckets} from './spatial-buckets.js';
import {placementCollision,recordPlacementAppend} from './placement-obstacles.js';
import {connectWall,restoreWallLinks,blockWallConnections,wallLinePoints,wallEndpointTree} from './walls.js';
import {plantStartingForests,reservedStartingLand} from './starting-forests.js';
import {groupFieldForests} from './field-forests.js';
import {installGarrison} from './garrison.js';
import {installProjectileCombat} from './projectile-combat.js';
import {mechanicalUnit,healableUnit,repairableTarget,repairMechanical} from './maintenance.js';
import {gatheringRange,gatheringApproach,gatheringPathRange} from './work-ranges.js';
import {constructionFace,constructionHeading} from './construction-contact.js';
import {approachConstruction,approachMelee} from './construction-approach.js';
import {meleeBuildingAttack,meleeReach,meleeSurfaceDistance,meleeHeading} from './melee-contact.js';
import {bridgeFootprint,clearSavedBridgeResources,bridgeRoadHalfWidth} from './bridge-layout.js';
import {blockBridgeNavigation,bridgeStepClear,bridgeUnitClearance,restoreBridgeOccupants} from './bridge-navigation.js';
import {WORLD, UNITS, BUILDINGS, TECHS, AGE_COSTS, FACTIONS, DIFFICULTIES, MISSIONS, seededRandom,availableTo} from './data.js';

const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
export const distance=(a,b)=>Math.sqrt((a.x-b.x)**2+(a.z-b.z)**2);
const CELL=2, GRID=WORLD/CELL;

export class Simulation {
  constructor(options={}) {
    this.options={mode:'skirmish',faction:'alder',difficulty:'normal',map:'highlands',seed:2026,...options};
    if(this.options.mode==='custom')this.options=normalizeBattle(this.options);
    this.worldSize=this.options.mode==='custom'?this.options.worldSize:WORLD;this.halfWorld=this.worldSize/2;this.gridSize=this.worldSize/CELL;
    this.rng=seededRandom(this.options.seed);this.entities=[];this.nextId=1;this.time=0;this.revision=0;
    this.listeners=[];this.events=[];this.ended=null;this.wave=0;this.nextWave=90;this.hold=0;this.enemyHold=0;this.wonderTime=[0,0];
    this.stats={gathered:0,kills:0,lost:0,built:0,trained:0};this.tutorialStep=0;this.tutorialFlags={};this.grids={};
    this.explored=new Uint8Array(this.gridSize*this.gridSize);this.visible=new Uint8Array(this.gridSize*this.gridSize);this.fogClock=0;this.aiClock=0;this.nextAttack=DIFFICULTIES[this.options.difficulty].attack;
    this.mission=MISSIONS.find(m=>m.id===this.options.mode);if(this.mission?.map)this.options.map=this.mission.map;
    this.players=this.options.mode==='custom'?this.options.slots.map(slot=>({...this.makePlayer(slot.faction),...slot})):[this.makePlayer(this.options.faction),this.makePlayer(this.options.faction==='raven'?'sun':'raven')];
    this.initialize();
  }
  makePlayer(faction){return {faction,resources:{food:550,wood:550,gold:250,stone:250},age:0,formation:'square',tech:Object.fromEntries(Object.keys(TECHS).map(type=>[type,0])),agePending:false};}
  on(fn){this.listeners.push(fn);}
  emit(type,data={}){const event={type,...data};this.events.push(event);for(const fn of this.listeners)fn(event);}
  get(id){return this.entities.find(e=>e.id===id&&e.hp>0);}
  owned(owner,kind,type){
    let candidates=this.entities;
    if(kind==='unit'||kind==='building'){
      let cache=this.ownedCandidates;
      if(!cache||cache.entities!==this.entities||cache.length!==this.entities.length||cache.time!==this.time||cache.revision!==this.revision){
        cache={entities:this.entities,length:this.entities.length,time:this.time,revision:this.revision,unit:[],building:[]};
        for(const e of this.entities)if(e.kind==='unit'||e.kind==='building')cache[e.kind].push(e);
        this.ownedCandidates=cache;
      }
      candidates=cache[kind];
    }
    // Keep life, ownership and type live; callers receive their own array.
    const result=[];for(const e of candidates)if(e.hp>0&&e.owner===owner&&(!kind||e.kind===kind)&&(!type||e.type===type))result.push(e);return result;
  }
  faction(owner){return FACTIONS[this.players[owner].faction];}
  allied(a,b){return a>=0&&b>=0&&!!this.players[a]&&!!this.players[b]&&(this.players[a].team??a)===(this.players[b].team??b);}
  hostile(a,b){return a>=0&&b>=0&&!!this.players[a]&&!!this.players[b]&&!this.allied(a,b)&&!this.players[b].defeated;}
  difficulty(owner=1){return this.players[owner]?.difficulty||this.options.difficulty;}
  startClearing(x,z){
    if(bridgeFootprint(this.options.map,x,z,8))return true;
    const custom=this.options.mode==='custom';if(custom?this.players.some(player=>player.start&&Math.hypot(x-player.start.x,z-player.start.z-16)<11):Math.min(Math.hypot(x+36,z-49),Math.hypot(x-36,z+49))<12)return true;
    if(this.options.map!=='coast')return false;
    return custom?this.players.some(player=>player.start&&Math.hypot(x-Math.sin(player.start.z*.03)*2-Math.sign(player.start.x)*20,z-player.start.z)<8):Math.min(Math.hypot(x+19,z-25),Math.hypot(x-19,z+25))<8;
  }
  initialize(){
    const m=this.options.mode,mission=this.mission, peaceful=m==='sandbox'||m==='tutorial', survival=m==='survival'||mission?.survival;
    this.players.forEach(p=>p.age=m==='regicide'?2:mission?.age||0);
    if(m==='regicide')this.players.forEach(p=>p.resources={food:1000,wood:1000,gold:650,stone:650});
    if(m==='sandbox'){this.players[0].resources={food:6000,wood:6000,gold:6000,stone:6000};this.players[0].age=3;}
    if(survival){this.players[0].resources={food:1000,wood:1100,gold:600,stone:800};this.players[0].age=Math.max(1,this.players[0].age);}
    this.addBuilding('towncenter',0,-39,30,true);
    this.addBuilding('house',0,-48,20,true);this.addBuilding('house',0,-30,40,true);
    this.addBuilding('mill',0,-49,36,true);
    this.addBuilding('barracks',0,-27,24,true);
    const startWorkers=mission?.age?12:8;
    for(let i=0;i<startWorkers;i++)this.addUnit('villager',0,-43+(i%4)*2.4,43+Math.floor(i/4)*2.4);
    this.addUnit('scout',0,-27,33);
    if(m==='regicide')this.addUnit('king',0,-39,21);
    if(survival||mission?.age){for(let i=0;i<8;i++)this.addUnit(i%3?'spearman':'archer',0,-23+i%4*2,34+Math.floor(i/4)*2);this.addBuilding('range',0,-47,10,true);}
    if(!peaceful&&!survival){
      this.addBuilding('towncenter',1,40,-34,true);this.addBuilding('house',1,51,-26,true);this.addBuilding('house',1,29,-43,true);this.addBuilding('barracks',1,28,-24,true);this.addBuilding('mill',1,49,-44,true);
      for(let i=0;i<(mission?.age?12:8);i++)this.addUnit('villager',1,33+i%4*2,-43-Math.floor(i/4)*2);
      const count=mission?.enemies??5;
      if(m==='regicide')this.addUnit('king',1,40,-43);
      for(let i=0;i<count;i++)this.addUnit(this.players[1].age>=2&&i%4===0?'knight':this.players[1].age>=1&&i%3===0?'archer':'spearman',1,25+i%6*2,-35-Math.floor(i/6)*2);
      if(mission?.age>=1)this.addBuilding('range',1,52,-12,true);
      if(mission?.age>=2){this.addBuilding('stable',1,37,-13,true);this.addBuilding('blacksmith',1,58,-38,true);}
      if(mission?.fortress){
        this.addBuilding('keep',1,35,-49,true);this.addBuilding('tower',1,18,-20,true);this.addBuilding('tower',1,53,-4,true);
        for(let x=15;x<=62;x+=3)if(Math.abs(x-36)>4)this.addBuilding('wall',1,x,-5,true);
        this.addBuilding('gate',1,36,-5,true);
      }
    }
    // Mirrored resources give both starting settlements the same opportunities.
    const clusters=[[-57,15,'wood',20],[-13,49,'wood',22],[-53,51,'food',7],[-24,15,'gold',5],[-57,30,'stone',5],[-58,-32,'wood',25],[-25,-40,'gold',7],[-16,-16,'stone',6],[-14,13,'food',7],[-65,64,'wood',18]];
    for(const [x,z,type,count]of clusters)for(const sign of [1,-1])for(let i=0;i<count;i++){
      const nx=clamp(x*sign+(this.rng()-.5)*(type==='wood'?18:7),-75,75),nz=clamp(z*sign+(this.rng()-.5)*(type==='wood'?18:7),-75,75);
      if(type==='wood'&&reservedStartingLand(this,nx,nz))continue;
      if(this.entities.some(e=>e.kind==='building'&&distance(e,{x:nx,z:nz})<e.r+3)||this.isWater(nx,nz)||this.startClearing(nx,nz))continue;
      this.addNaturalResource(type,nx,nz,type==='wood'?220:type==='food'?350:1800);
    }
    for(let i=0;i<28;i++){const x=(this.rng()-.5)*145,z=(this.rng()-.5)*145;if(!this.isWater(x,z)&&!reservedStartingLand(this,x,z)&&!this.startClearing(x,z)&&!this.entities.some(e=>e.kind==='building'&&distance(e,{x,z})<e.r+5))this.addNaturalResource('wood',x,z,240);}
    if(this.options.map==='winter')for(let i=0;i<85;i++){const x=(this.rng()-.5)*145,z=(this.rng()-.5)*145;if(!reservedStartingLand(this,x,z)&&!this.startClearing(x,z)&&!this.entities.some(e=>e.kind==='building'&&distance(e,{x,z})<e.r+6))this.addNaturalResource('wood',x,z,260);}
    if(this.options.map==='canyon')for(let i=0;i<18;i++){const x=(this.rng()-.5)*28,z=(this.rng()-.5)*65;this.addNaturalResource(i%2?'stone':'gold',x,z,2200);}
    if(m==='dominion'||mission?.dominion){for(const [x,z]of [[-26,-23],[3,1],[28,25]])this.addShrine(x,z);}
    plantStartingForests(this);
    groupFieldForests(this);
    this.assignEconomy(0);this.assignEconomy(1);this.updateFog();
  }
  addResource(type,x,z,amount){const previousRevision=this.revision,e={id:this.nextId++,kind:'resource',type,x,z,hp:1,maxHp:1,amount,initialAmount:amount,r:type==='wood'?1.1:1.7,owner:-1};this.entities.push(e);if(['wood','gold','stone'].includes(type))this.revision++;recordPlacementAppend(this,e,previousRevision);return e;}
  addNaturalResource(type,x,z,baseAmount){return this.addResource(type,x,z,baseAmount*2);}
  addShrine(x,z){const e={id:this.nextId++,kind:'shrine',type:'shrine',x,z,hp:1,maxHp:1,r:3,owner:-1,progress:0,capturer:-1};this.entities.push(e);return e;}
  maxHP(e){const p=this.players[e.owner],f=this.faction(e.owner),d=e.kind==='unit'?UNITS[e.type]:BUILDINGS[e.type];return d.hp*(e.kind==='building'?f.buildingHP*(1+p.tech.fortification*.3):(1+p.age*.13)*(1+p.tech.armor*.15)*(d.role==='infantry'||d.role==='spear'?f.infantryHP:1));}
  addBuilding(type,owner,x,z,complete=false){const d=BUILDINGS[type],previousRevision=this.revision;const e={id:this.nextId++,kind:'building',type,owner,x,z,r:d.r,hp:1,maxHp:1,progress:complete?1:0,queue:[],rally:null,cooldown:0};e.maxHp=this.maxHP(e);e.hp=complete?e.maxHp:e.maxHp*.12;this.entities.push(e);connectWall(e,this.entities);this.revision++;recordPlacementAppend(this,e,previousRevision);this.emit('spawn',{entity:e});return e;}
  addUnit(type,owner,x,z){const previousRevision=this.revision,e={id:this.nextId++,kind:'unit',type,owner,x,z,r:UNITS[type].radius??(type==='ram'?1.35:type==='catapult'?1.1:.65),hp:1,maxHp:1,order:null,orders:[],path:[],cooldown:0,carry:0,carryType:null,repath:0,stance:type==='king'?'hold':'aggressive',work:0};e.maxHp=this.maxHP(e);e.hp=e.maxHp;this.entities.push(e);recordPlacementAppend(this,e,previousRevision);this.emit('spawn',{entity:e});return e;}
  population(owner){return this.owned(owner,'unit').length;}
  capacity(owner){return Math.min(this.options.populationLimit||160,this.owned(owner,'building').filter(e=>e.progress>=1).reduce((n,e)=>n+(BUILDINGS[e.type].cap||0),0));}
  reservedPopulation(owner){return this.owned(owner,'building').reduce((n,e)=>n+e.queue.filter(q=>q.kind==='unit').length,0);}
  cost(cost,owner=0,kind=''){const factor=kind==='building'?this.faction(owner).cost:1;return Object.fromEntries(Object.entries(cost).map(([r,n])=>[r,Math.ceil(n*factor)]));}
  canAfford(cost,owner=0){return Object.entries(cost).every(([r,n])=>this.players[owner].resources[r]>=n);}
  spend(cost,owner){if(!this.canAfford(cost,owner))return false;for(const[r,n]of Object.entries(cost))this.players[owner].resources[r]-=n;return true;}
  fail(message,owner=0){this.emit('notice',{message,owner,tone:'warning'});return false;}
  buildValid(type,x,z,owner=0){const d=BUILDINGS[type];if(!d||Math.abs(x)>this.halfWorld-d.r-2||Math.abs(z)>this.halfWorld-d.r-2||this.isWater(x,z)||bridgeFootprint(this.options.map,x,z,d.r))return false;
    const edge=d.r;for(const dx of [-edge,0,edge])for(const dz of [-edge,0,edge])if(this.isWater(x+dx,z+dz))return false;
    if(owner===0&&!this.isVisible(x,z))return false;
    return !placementCollision(this,type,x,z,d.r);
  }
  build(type,x,z,workerIds,owner=0,append=false){const d=BUILDINGS[type];if(!d||this.players[owner].age<d.age)return this.fail('Advance to the required age first.',owner);
    const workers=workerIds.map(id=>this.get(id)).filter(e=>e?.owner===owner&&e.type==='villager'&&!e.embarked);if(!workers.length)return this.fail('Select a villager to construct buildings.',owner);
    if(!this.buildValid(type,x,z,owner))return this.fail('Choose open, visible land for this building.',owner);
    if(!this.spend(this.cost(d.cost,owner,'building'),owner))return this.fail('Not enough resources.',owner);
    const e=this.addBuilding(type,owner,x,z);this.command(workers.map(w=>w.id),{type:'build',target:e.id},append);this.tutorialFlags.build=true;return e;
  }
  buildWallLine(from,to,workerIds,owner=0,requireVisibility=false){
    if(!from||!to||![from.x,from.z,to.x,to.z].every(Number.isFinite)||[from.x,from.z,to.x,to.z].some(n=>Math.abs(n)>this.halfWorld))return[];
    const existing=this.owned(owner,'building','wall').filter(e=>distance(e,from)<1.8).sort((a,b)=>distance(a,from)-distance(b,from))[0],start=existing||from,built=[];
    const endWall=this.owned(owner,'building','wall').filter(e=>e!==existing&&distance(e,to)<1.8).sort((a,b)=>distance(a,to)-distance(b,to))[0];
    const exact=!!wallEndpointTree(this,start)&&!!(wallEndpointTree(this,to)||endWall),points=wallLinePoints(start,to,exact);
    for(let i=existing?1:0;i<points.length;i++){const point=points[i];if(requireVisibility&&!this.canSee(owner,point)){this.fail('Construct walls within your visible territory.',owner);break;}
      if(endWall&&distance(point,endWall)<1.8&&built.length&&distance(built.at(-1),endWall)<=3.35)break;
      const wall=this.build('wall',point.x,point.z,workerIds,owner,built.length>0);if(!wall)break;wall.wallRun=existing?.wallRun||built[0]?.id||wall.id;wall.wallIndex=(existing?.wallIndex||0)+built.length+1;built.push(wall);
    }return built;
  }
  train(buildingId,type){const b=this.get(buildingId),d=UNITS[type];if(!b||b.kind!=='building'||b.progress<1||!d||!d.at.includes(b.type))return false;
    const owner=b.owner,p=this.players[owner];if(p.age<d.age)return this.fail('This troop requires a later age.',owner);
    if(!availableTo(d,p.faction))return this.fail('This troop belongs to another civilization.',owner);
    const capacity=this.capacity(owner);
    if(this.population(owner)+this.reservedPopulation(owner)>=capacity)return this.fail(capacity>=(this.options.populationLimit||160)?`Population limit reached (${this.options.populationLimit||160} per kingdom).`:'Housing capacity reached. Build another house.',owner);
    if(b.queue.length>=8)return this.fail('Training queue is full.',owner);
    if(!this.spend(d.cost,owner))return this.fail('Not enough resources.',owner);
    b.queue.push({kind:'unit',type,remaining:d.time,total:d.time,cost:{...d.cost}});return true;
  }
  research(buildingId,type){const b=this.get(buildingId);if(!b||b.kind!=='building'||b.progress<1)return false;const p=this.players[b.owner];
    if(type==='age'){
      if(b.type!=='towncenter'||p.age>=3||p.agePending)return false;
      const cost=AGE_COSTS[p.age];if(!this.spend(cost,b.owner))return this.fail('Not enough food and gold to advance.',b.owner);
      p.agePending=true;b.queue.push({kind:'age',type,remaining:55+p.age*20,total:55+p.age*20,cost:{...cost}});return true;
    }
    const d=TECHS[type];if(!availableTo(d,p.faction)||!d.at.includes(b.type)||p.age<d.age||p.tech[type]>=Math.min(d.max,p.age+1))return false;
    if(this.owned(b.owner,'building').some(e=>e.queue.some(q=>q.kind==='tech'&&q.type===type)))return this.fail('This technology is already being researched.',b.owner);
    const cost=Object.fromEntries(Object.entries(d.cost).map(([r,n])=>[r,n*(p.tech[type]+1)]));if(!this.spend(cost,b.owner))return this.fail('Not enough resources for research.',b.owner);
    b.queue.push({kind:'tech',type,remaining:d.time,total:d.time,cost});return true;
  }
  cancelQueue(buildingId,index,owner=0){const b=this.get(buildingId);if(!b||b.owner!==owner)return;const[q]=b.queue.splice(index,1);if(q){for(const[r,n]of Object.entries(q.cost))this.players[owner].resources[r]+=n;if(q.kind==='age')this.players[owner].agePending=false;}}
  demolish(buildingId,owner=0){const b=this.get(buildingId);if(!b||b.owner!==owner||b.kind!=='building')return false;
    if(b.type==='towncenter'&&this.owned(owner,'building','towncenter').length===1)return this.fail('Your last town center must stand.',owner);
    while(b.queue.length)this.cancelQueue(b.id,0,owner);const rate=b.progress<1?.7:.2;for(const [r,n]of Object.entries(this.cost(BUILDINGS[b.type].cost,owner,'building')))this.players[owner].resources[r]+=Math.floor(n*rate);b.demolished=true;b.hp=0;this.revision++;this.emit('death',{entity:b});return true;
  }
  trade(resource,buy,owner=0){if(!['food','wood','stone'].includes(resource))return false;if(!this.owned(owner,'building','market').some(b=>b.progress>=1))return this.fail('Build a market to trade resources.',owner);const p=this.players[owner];const cost=buy?{gold:130}:{[resource]:100};if(!this.spend(cost,owner))return this.fail('Not enough resources for this trade.',owner);p.resources[buy?resource:'gold']+=(buy?100:70)+(p.tech.caravanLedger?(buy?10:20):0);this.emit('sound',{name:'coin',owner});return true;}
  command(ids,order,append=false){const units=ids.map(id=>this.get(id)).filter(e=>e?.kind==='unit'),reserved=new Map();units.forEach((e,i)=>{
      const o={...order};if(o.type==='build'&&e.type==='villager'&&this.get(o.target)?.type==='wall')o.wallConstruction=true;if(!append)e.wallConstructionSkipped=[];if((o.type==='move'||o.type==='attackmove')&&units.length>1){const formation=this.players[e.owner].formation,width=formation==='line'?Math.min(12,units.length):formation==='column'?2:Math.ceil(Math.sqrt(units.length)),rows=Math.ceil(units.length/width);o.x=clamp(o.x+(i%width-(width-1)/2)*2,-this.halfWorld+3,this.halfWorld-3);o.z=clamp(o.z+(Math.floor(i/width)-(rows-1)/2)*2,-this.halfWorld+3,this.halfWorld-3);}
      if(['move','attackmove'].includes(o.type)){const surface=e.owner+':'+!!UNITS[e.type].naval;if(!reserved.has(surface))reserved.set(surface,[]);const slots=reserved.get(surface);Object.assign(o,formationSlot(this,e,o,slots));slots.push({x:o.x,z:o.z,r:e.r});}
      if(append&&e.order){if(e.orders.length<32)e.orders.push(o);}else{e.order=o;e.orders=[];e.path=[];e.repath=0;e.stuckTime=0;e.pathStatus='pending';if(['attack','attackmove','patrol','guard'].includes(o.type))e.stance='aggressive';}
    });if(units.some(e=>e.owner===0)){if(units.some(e=>e.type!=='villager')&&['move','attackmove','attack'].includes(order.type))this.tutorialFlags.command=true;this.emit('order',{order});}
  }
  smartCommand(ids,target,x,z,append=false,attackMove=false,owner=0){const owned=ids.map(id=>this.get(id)).filter(e=>e?.owner===owner);const units=owned.filter(e=>e.kind==='unit');
    for(const b of owned.filter(e=>e.kind==='building')){b.rally={x,z,target:target?.kind==='resource'?target.id:null};}
    if(!target){if(units.length)this.command(units.map(e=>e.id),{type:attackMove?'attackmove':'move',x,z},append);return;}
    for(const unit of units){let order={type:attackMove?'attackmove':'move',x,z};
      if(this.hostile(owner,target?.owner)&&target.kind!=='resource')order={type:'attack',target:target.id};
      else if(unit.type==='villager'&&target?.kind==='resource')order={type:'gather',target:target.id};
      else if(unit.type==='villager'&&target?.kind==='building'&&this.allied(owner,target.owner)){order=target.owner===owner&&target.progress<1?{type:'build',target:target.id}:target.type==='farm'&&target.owner===owner?{type:'gather',target:target.id}:target.progress>=1?{type:'repair',target:target.id}:order;}
      else if(unit.type==='villager'&&mechanicalUnit(target)&&this.allied(owner,target.owner)&&target.hp<target.maxHp)order={type:'repair',target:target.id};
      else if(unit.type==='monk'&&this.allied(owner,target?.owner)&&healableUnit(target))order={type:'heal',target:target.id};
      this.command([unit.id],order,append);
    }
  }
  stop(ids){for(const id of ids){const e=this.get(id);if(e?.kind==='unit'){e.order=null;e.orders=[];e.path=[];e.wallConstructionSkipped=[];e.stance='hold';e.pathStatus='idle';e.stuckTime=0;}}}
  isWater(x,z){if(Math.abs(z)<=bridgeRoadHalfWidth-.6)return false;if(this.options.map==='valley')return Math.abs(x-Math.sin(z*.045)*4)<5;if(this.options.map==='rivers')return [-19,19].some(center=>Math.abs(x-center-Math.sin(z*.045)*3)<4);return false;}
  cell(x,z){return {x:clamp(Math.floor((x+this.halfWorld)/CELL),0,this.gridSize-1),z:clamp(Math.floor((z+this.halfWorld)/CELL),0,this.gridSize-1)};}
  grid(owner){if(this.grids[owner]?.revision===this.revision)return this.grids[owner].data;
    const size=this.gridSize,teamKey='team-'+(this.players[owner].team??owner);if(this.grids[teamKey]?.revision===this.revision){this.grids[owner]=this.grids[teamKey];return this.grids[owner].data;}
    if(this.grids.landBase?.revision!==this.revision){const base=new Uint8Array(size*size);for(let z=0;z<size;z++)for(let x=0;x<size;x++)if(this.isWater(x*CELL-this.halfWorld+1,z*CELL-this.halfWorld+1))base[z*size+x]=1;
      for(const e of this.entities)if(e.hp>0&&e.kind==='resource'&&!e.water&&['wood','gold','stone'].includes(e.type)){const a=this.cell(e.x-e.r-.2,e.z-e.r-.2),b=this.cell(e.x+e.r+.2,e.z+e.r+.2),center=this.cell(e.x,e.z);base[center.z*size+center.x]=1;for(let z=a.z;z<=b.z;z++)for(let x=a.x;x<=b.x;x++)if(Math.hypot(x*CELL-this.halfWorld+1-e.x,z*CELL-this.halfWorld+1-e.z)<e.r+.1)base[z*size+x]=1;}
      blockBridgeNavigation(this,base);this.grids.landBase={revision:this.revision,data:base};
    }
    const data=this.grids.landBase.data.slice();
    for(const e of this.entities)if(e.hp>0&&e.kind==='building'&&e.type!=='farm'&&!(e.type==='gate'&&this.allied(e.owner,owner))){
      const a=this.cell(e.x-e.r-.3,e.z-e.r-.3),b=this.cell(e.x+e.r+.3,e.z+e.r+.3);
      for(let z=a.z;z<=b.z;z++)for(let x=a.x;x<=b.x;x++)if(Math.hypot(x*CELL-this.halfWorld+1-e.x,z*CELL-this.halfWorld+1-e.z)<e.r+.9)data[z*size+x]=1;
    }
    blockWallConnections(this,data);this.grids[owner]=this.grids[teamKey]={revision:this.revision,data};return data;
  }
  unitDefinition(e){return UNITS[e.type];}
  pathTo(e,dest,range=0){return findPath(this,e,dest,range);}
  move(e,dest,dt,stop=0,precise=false,normalOverride=null){if(distance(e,dest)<=Math.max(stop,precise?.05:.65)){e.stuckTime=0;return true;}e.repath-=dt;
    const grid=unitNavigationGrid(this,e,normalOverride),navigationKey=grid.navigationKey||'',targetId=dest.id??null,rangeChanged=(e.pathRange??0)!==stop,targetChanged=e.pathTargetId!==targetId;let navigationChanged=(e.pathNavigationKey||'')!==navigationKey;
    if(e.path.length&&(e.pathRevision!==this.revision||navigationChanged)){let previous=e,clear=true;for(const point of e.path){if(!clearSegment(this,grid,previous,point)){clear=false;break;}previous=point;}if(clear){e.pathRevision=this.revision;e.pathNavigationKey=navigationKey;navigationChanged=false;}}
    if(!e.path.length&&e.pathStatus==='blocked'&&e.pathRevision===this.revision&&e.repath>0&&!navigationChanged&&!rangeChanged&&!targetChanged){this.blockedMovement(e,dt);return false;}
    if(!e.path.length||e.pathRevision!==this.revision||navigationChanged||rangeChanged||targetChanged||e.repath<=0&&Math.hypot(dest.x-(e.pathTargetX??Infinity),dest.z-(e.pathTargetZ??Infinity))>2){e.path=normalOverride?findPath(this,e,dest,stop,normalOverride):this.pathTo(e,dest,stop);e.repath=1.5;e.pathRevision=this.revision;e.pathNavigationKey=navigationKey;e.pathTargetX=dest.x;e.pathTargetZ=dest.z;e.pathTargetId=targetId;e.pathRange=stop;}
    let point=e.path[0];if(!point){this.blockedMovement(e,dt);return false;}let dx=point.x-e.x,dz=point.z-e.z,len=Math.hypot(dx,dz);
    if(len<(e.path.length>1?.5:.05)){e.path.shift();point=e.path[0];if(!point){if(distance(e,dest)<=Math.max(stop,precise?.05:1.5)){e.stuckTime=0;return true;}this.blockedMovement(e,dt);return false;}dx=point.x-e.x;dz=point.z-e.z;len=Math.hypot(dx,dz);}
    const d=UNITS[e.type],p=this.players[e.owner];const speed=d.speed*(d.role==='cavalry'?(1+p.tech.husbandry*.2)*(this.players[e.owner].faction==='raven'?1.15:1)*(1+(p.tech.raidingParties||0)*.1):1);const step=Math.min(len,speed*(d.naval?1+(p.tech.seamanship||0)*.15:1)*dt);
    let nx=e.x+dx/len*step,nz=e.z+dz/len*step;
    const bx=Math.floor(e.x/4),bz=Math.floor(e.z/4);
    for(let ox=-1;ox<=1;ox++){const column=this.unitBuckets?.get(bx+ox);if(!column)continue;for(let oz=-1;oz<=1;oz++){
      const neighbors=column.get(bz+oz);if(!neighbors)continue;
      for(const other of neighbors){if(other===e||other.embarked||!!UNITS[other.type].naval!==!!d.naval)continue;const sx=nx-other.x,sz=nz-other.z,min=(e.r+other.r)*.8;if(sx*sx+sz*sz>=min*min)continue;const sep=Math.hypot(sx,sz);if(sep<min&&sep>.01){nx+=sx/sep*(min-sep)*.2;nz+=sz/sep*(min-sep)*.2;}}
    }}
    const c=this.cell(nx,nz),current=this.cell(e.x,e.z),oldX=e.x,oldZ=e.z,radius=bridgeUnitClearance(e),map=this.options.map;
    if((!grid[c.z*this.gridSize+c.x]||grid[current.z*this.gridSize+current.x])&&(d.naval||bridgeStepClear(map,e.x,e.z,nx,nz,radius))){e.x=clamp(nx,-this.halfWorld+3,this.halfWorld-3);e.z=clamp(nz,-this.halfWorld+3,this.halfWorld-3);}else{
      const horizontal=this.cell(nx,e.z),vertical=this.cell(e.x,nz);
      if(!grid[horizontal.z*this.gridSize+horizontal.x]&&(d.naval||bridgeStepClear(map,e.x,e.z,nx,e.z,radius)))e.x=clamp(nx,-this.halfWorld+3,this.halfWorld-3);else if(!grid[vertical.z*this.gridSize+vertical.x]&&(d.naval||bridgeStepClear(map,e.x,e.z,e.x,nz,radius)))e.z=clamp(nz,-this.halfWorld+3,this.halfWorld-3);else{e.path=[];e.repath=0;}
    }
    e.moving=Math.hypot(e.x-oldX,e.z-oldZ)>.015;if(e.moving)e.stuckTime=0;else this.blockedMovement(e,dt);
    e.heading=Math.atan2(dx,dz);return distance(e,dest)<=Math.max(stop,precise?.05:1.5);
  }
  blockedMovement(e,dt){e.stuckTime=(e.stuckTime||0)+dt;if(e.stuckTime>2&&e.pathStatus!=='blocked'){e.path=[];e.repath=0;}
    if(e.stuckTime<6)return;e.pathStatus='blocked';e.blockedAt=this.time;e.stuckTime=0;
    if(e.owner===0&&this.time-(this.lastBlockedNotice??-10)>4){this.lastBlockedNotice=this.time;this.emit('notice',{owner:0,message:'A unit cannot reach its destination. Choose another route or open the obstruction.',tone:'warning'});}
    this.emit('order-blocked',{entity:e});const target=this.get(e.order?.target);if(e.order?.type==='build'&&e.type==='villager'&&target?.type==='wall')this.finishWallOrder(e,target,true);else this.finishOrder(e);
  }
  nearest(e,predicate,max=Infinity,combatOnly=false){let best=null,d=max;const consider=target=>{
      if(target.hp<=0||target===e||combatOnly&&target.kind!=='unit'&&target.kind!=='building'||!predicate(target))return;
      // Reject distant candidates before the square root. A small margin keeps
      // rounding at the boundary subject to the original strict comparison.
      const dx=e.x-target.x,dz=e.z-target.z,reach=d+target.r+1e-9;
      if(reach<0||dx*dx+dz*dz>reach*reach)return;
      const len=Math.hypot(dx,dz)-target.r;if(len<d){d=len;best=target;}
    };
    if(Number.isFinite(max)&&this.entityBuckets){const range=max+(this.maxEntityRadius||8)+2;for(let x=Math.floor((e.x-range)/8);x<=Math.floor((e.x+range)/8);x++){const column=this.entityBuckets.get(x);if(!column)continue;for(let z=Math.floor((e.z-range)/8);z<=Math.floor((e.z+range)/8);z++){const bucket=column.get(z),candidates=combatOnly?bucket?.combat:bucket;if(candidates)for(const target of candidates)consider(target);}}}else for(const target of this.entities)consider(target);return best;}
  nearestDrop(e,resource,naval=false){
    if(this.dropCache?.revision!==this.revision||this.dropCache.entities!==this.entities){
      const sites=new Map();for(const b of this.entities)if(b.hp>0&&b.kind==='building'&&b.progress>=1&&BUILDINGS[b.type].drop){if(!sites.has(b.owner))sites.set(b.owner,[]);sites.get(b.owner).push(b);}
      this.dropCache={revision:this.revision,entities:this.entities,sites};
    }
    let best=null,nearest=Infinity;for(const b of this.dropCache.sites.get(e.owner)||[]){if(b.hp<=0||b.progress<1||!BUILDINGS[b.type].drop.includes(resource)||naval&&b.type!=='dock')continue;const d=distance(e,b)-b.r;if(d<nearest){nearest=d;best=b;}}return best;
  }
  attackDamage(e,target){const d=e.kind==='unit'?UNITS[e.type]:BUILDINGS[e.type],p=this.players[e.owner],role=d.role;let n=d.damage||0;if(d.naval)n*=1+(p.tech.seamanship||0)*.2;
    if(e.kind==='building')n*=1+p.tech.fortification*.15;
    else{n*=1+p.age*.12;n*=1+(role==='ranged'?p.tech.ranged:p.tech.attack)*.2;if(role==='cavalry')n*=this.faction(e.owner).cavalry;}
    const other=target.kind==='unit'?UNITS[target.type]:null;if(role==='spear'&&other?.role==='cavalry')n*=3;if(role==='ranged'&&other?.role==='spear')n*=1.5;if(role==='cavalry'&&other?.role==='ranged')n*=1.7;if(role==='siege')n*=target.kind==='building'?3: e.type==='ram'?.22:1;
    if(target.kind==='building'&&role!=='siege')n*=.65;
    if(other?.role==='worker')n*=d.workerBonus||1;
    const armor=target.kind==='unit'?this.unitArmor(target):role==='ranged'?5:1;return Math.max(1,n-Math.max(0,armor-(d.penetration||0)));
  }
  unitArmor(e){const d=UNITS[e.type],p=this.players[e.owner];return (d.armor||0)+p.tech.armor*2+(['infantry','spear'].includes(d.role)?(p.tech.shieldDrill||0)*2:0);}
  hurt(target,amount,attacker){if(target.hp<=0||attacker?.owner>=0&&target.owner>=0&&!this.hostile(attacker.owner,target.owner))return;target.hp-=amount;if(target.owner===0&&this.time-(this.lastAlarm||-20)>12){this.lastAlarm=this.time;this.emit('alarm',{x:target.x,z:target.z});}
    if(target.hp<=0){target.hp=0;this.revision++;if(attacker?.owner===0)this.stats.kills++;if(target.owner===0)this.stats.lost++;if(target.kind==='unit'&&attacker?.kind==='unit'&&attacker.owner!==target.owner&&UNITS[attacker.type].role==='cavalry'&&this.players[attacker.owner].tech.raidingParties)this.players[attacker.owner].resources.gold+=3;this.emit('death',{entity:target});for(const q of target.queue||[])if(q.kind==='age')this.players[target.owner].agePending=false;}}
  hit(e,target){if(e.cooldown>0||!this.hostile(e.owner,target.owner))return;e.heading=Math.atan2(target.x-e.x,target.z-e.z);const amount=this.attackDamage(e,target);this.hurt(target,amount,e);e.cooldown=e.kind==='building'?1.6:UNITS[e.type].cooldown||1.2;
    if(['catapult','warship'].includes(e.type))for(const nearby of this.entities)if(nearby.hp>0&&this.hostile(e.owner,nearby.owner)&&nearby!==target&&nearby.kind==='unit'&&distance(nearby,target)<4)this.hurt(nearby,amount*.6,e);
    this.emit('attack',{entity:e,target,damage:amount});
  }
  finishOrder(e){e.order=e.orders.shift()||null;e.path=[];e.repath=0;}
  finishWallOrder(e,previous,blocked=false){
    if(blocked){e.wallConstructionSkipped??=[];if(!e.wallConstructionSkipped.includes(previous.id))e.wallConstructionSkipped.push(previous.id);}
    this.finishOrder(e);if(e.order)return;
    const skipped=new Set(e.wallConstructionSkipped||[]),run=previous?.wallRun;
    const walls=this.owned(e.owner,'building','wall').filter(wall=>wall.progress<1&&!skipped.has(wall.id)).sort((a,b)=>{
      const sameA=!!run&&a.wallRun===run,sameB=!!run&&b.wallRun===run;if(sameA!==sameB)return sameA?-1:1;
      return (sameA?(a.wallIndex||0)-(b.wallIndex||0):distance(e,a)-distance(e,b))||a.id-b.id;
    });
    for(const wall of walls){let route=[];if(distance(e,wall)>wall.r+3){route=this.pathTo(e,wall);if(e.pathStatus==='blocked'||!route.length||distance(route.at(-1),wall)>wall.r+3){e.wallConstructionSkipped??=[];e.wallConstructionSkipped.push(wall.id);continue;}}
      e.order={type:'build',target:wall.id,wallConstruction:true};e.path=route;e.pathStatus='ready';e.stuckTime=0;e.repath=1.5;e.pathRevision=this.revision;e.pathTargetX=wall.x;e.pathTargetZ=wall.z;e.pathTargetId=wall.id;e.pathRange=0;return;
    }
    if(!walls.length)e.pathStatus='idle';
  }
  tickUnit(e,dt){e.moving=false;e.cooldown=Math.max(0,e.cooldown-dt);const d=UNITS[e.type],order=e.order;if(order?.type==='attack'&&!d.damage){this.finishOrder(e);return;}
    if(d.role==='healer'){
      const target=order?.type==='heal'?this.get(order.target):this.nearest(e,t=>this.allied(t.owner,e.owner)&&healableUnit(t)&&t.hp<t.maxHp,12,true);
      if(healableUnit(target)&&this.allied(e.owner,target.owner)&&target.hp<target.maxHp){if(distance(e,target)>d.range+target.r)this.move(e,target,dt,d.range);else if(e.cooldown<=0){target.hp=Math.min(target.maxHp,target.hp+12);e.cooldown=1;this.emit('heal',{entity:e,target});}return;}
    }
    let combat=null;
    if(order?.type==='attack'){const target=this.get(order.target);if(target&&this.hostile(e.owner,target.owner))combat=target;}
    else if(d.damage&&d.role!=='worker'&&(!order||['attackmove','patrol','guard'].includes(order.type)))combat=this.nearest(e,t=>this.hostile(e.owner,t.owner)&&!t.embarked&&['unit','building'].includes(t.kind)&&(d.naval||!UNITS[t.type]?.naval||d.range>=5||distance(e,t)<=d.range+t.r)&&(!order||order.type!=='guard'||distance(t,this.get(order.target)||e)<18),e.stance==='hold'?d.range:Math.max(d.range+(d.role==='ranged'?this.players[e.owner].tech.ranged:0),d.role==='siege'?27:13),true);
    if(combat&&meleeBuildingAttack(e,combat)){
      const gap=meleeSurfaceDistance(e,combat);
      if(gap>meleeReach(e)||gap<0){if(e.stance!=='hold'||order?.type==='attack')approachMelee(this,e,combat,dt);}
      else{e.heading=meleeHeading(e,combat);this.hit(e,combat);}return;
    }
    if(combat){const range=Math.max(d.range+(d.role==='ranged'?this.players[e.owner].tech.ranged:0)+combat.r,combat.kind==='building'?combat.r+3:0);
      if(distance(e,combat)>range){if(e.stance!=='hold'||order?.type==='attack')this.move(e,combat,dt,range);}else{e.heading=Math.atan2(combat.x-e.x,combat.z-e.z);this.hit(e,combat);}return;
    }
    if(!order)return;
    if(order.type==='attack'||order.type==='heal'){this.finishOrder(e);return;}
    if(order.type==='move'||order.type==='attackmove'){const precise=order.type==='move'&&order.aiFortification===true;if(this.move(e,order,dt,precise?0:1.4,precise))this.finishOrder(e);return;}
    if(order.type==='patrol'){if(this.move(e,order,dt,1.4)){if(e.orders.length)this.finishOrder(e);else{[order.x,order.originX]=[order.originX,order.x];[order.z,order.originZ]=[order.originZ,order.z];e.path=[];e.repath=0;}}return;}
    if(order.type==='guard'){const ally=this.get(order.target);if(!ally||!this.allied(ally.owner,e.owner)){this.finishOrder(e);return;}const point=formationSlot(this,e,{x:ally.x+(order.offsetX||0),z:ally.z+(order.offsetZ||0)});if(distance(e,point)>3)this.move(e,point,dt,2);return;}
    let target=this.get(order.target);if(!target&&order.type==='gather'&&e.carry>0){order.returning=true;target={kind:'resource',type:e.carryType};}if(!target){
      if(order.type==='gather'){
        if(e.orders.length){this.finishOrder(e);return;}
        if(this.players[e.owner].controller==='ai'||e.owner>0&&this.players[e.owner].controller!=='human'){this.assignWorker(e);return;}
        const sources=this.entities.filter(t=>t.hp>0&&(t.kind==='resource'&&!t.water&&t.type===(e.gatherType||'wood')&&t.amount>0||t.type==='farm'&&e.gatherType==='food'&&t.owner===e.owner&&t.progress>=1)).sort((a,b)=>distance(e,a)-distance(e,b));
        for(const resource of sources){const range=gatheringPathRange(e,resource),route=this.pathTo(e,resource,range);if(e.pathStatus==='blocked'||!route.length||distance(route.at(-1),resource)>gatheringRange(e,resource))continue;
          e.order={type:'gather',target:resource.id};e.path=route;e.repath=1.5;e.pathRevision=this.revision;e.pathTargetX=resource.x;e.pathTargetZ=resource.z;e.pathTargetId=resource.id;e.pathRange=range;return;
        }
      }
      if(order.type==='build'&&e.type==='villager'&&(order.wallConstruction||this.entities.some(wall=>wall.id===order.target&&wall.type==='wall'&&wall.owner===e.owner)))this.finishWallOrder(e,this.entities.find(wall=>wall.id===order.target));else this.finishOrder(e);return;
    }
    if(order.type==='build'||order.type==='repair'){
      if(e.type!=='villager'||(order.type==='build'?target.kind!=='building'||target.owner!==e.owner:!repairableTarget(target)||!this.allied(target.owner,e.owner))){this.finishOrder(e);return;}
      if(target.progress>=1&&target.hp>=target.maxHp){if(order.type==='build'&&target.type==='wall')this.finishWallOrder(e,target);else this.finishOrder(e);if(!e.order&&target.type==='farm')e.order={type:'gather',target:target.id};return;}
      const face=target.kind==='building'?constructionFace(e,target):-1;
      if(target.kind==='building'){if(face<0){approachConstruction(this,e,target,dt);return;}e.heading=constructionHeading(target,face);}
      else{if(distance(e,target)>target.r+3){this.move(e,target,dt,target.r+2.7);return;}e.heading=Math.atan2(target.x-e.x,target.z-e.z);}
      if(target.progress<1){const delta=dt/BUILDINGS[target.type].time;target.progress=Math.min(1,target.progress+delta);target.hp=Math.min(target.maxHp,target.hp+target.maxHp*.88*delta);
        if(target.progress>=1){target.hp=target.maxHp;if(target.owner===0){this.stats.built++;this.tutorialFlags[target.type]=true;this.emit('complete',{entity:target});}this.revision++;}}
      else if(target.hp<target.maxHp){if(mechanicalUnit(target)){if(!repairMechanical(this,e,target,dt))this.finishOrder(e);}else{const resource=['wall','tower','keep','gate','wonder'].includes(target.type)?'stone':'wood';const cost=dt*.6;if(this.players[e.owner].resources[resource]>=cost){this.players[e.owner].resources[resource]-=cost;target.hp=Math.min(target.maxHp,target.hp+dt*23);}else this.finishOrder(e);}}
      else{if(order.type==='build'&&target.type==='wall')this.finishWallOrder(e,target);else this.finishOrder(e);if(!e.order&&target.type==='farm')e.order={type:'gather',target:target.id};
      }return;
    }
    if(order.type==='gather'){
      if(e.type!=='villager')return this.finishOrder(e);const type=target.kind==='resource'?target.type:target.type==='farm'?'food':null;if(!type)return this.finishOrder(e);e.gatherType=type;
      const capacity=18;if(e.carryType&&e.carryType!==type&&e.carry>0)order.returning=true;
      if(e.carry>=capacity||order.returning){order.returning=true;const drop=this.nearestDrop(e,e.carryType||type);
        if(!drop)return;if(distance(e,drop)>drop.r+2.6){this.move(e,drop,dt,drop.r+2.3);return;}
        e.heading=Math.atan2(drop.x-e.x,drop.z-e.z);
        this.players[e.owner].resources[e.carryType||type]+=e.carry;this.emit('gathered',{owner:e.owner,amount:e.carry,resource:e.carryType||type});if(e.owner===0){this.stats.gathered+=e.carry;this.tutorialFlags.gather=true;}e.carry=0;e.carryType=null;order.returning=false;e.path=[];e.repath=0;return;
      }
      if(distance(e,target)>gatheringRange(e,target)){this.move(e,target,dt,gatheringApproach(e,target));return;}
      e.heading=Math.atan2(target.x-e.x,target.z-e.z);
      const rate=(type==='food'?3.1:type==='wood'?2.9:2.6)*this.faction(e.owner).gather*(1+this.players[e.owner].tech.economy*.25),n=Math.min(dt*rate,capacity-e.carry,target.amount??Infinity);e.carry+=n;e.carryType=type;e.work+=dt;
      if(target.amount!==undefined){target.amount-=n;if(target.amount<=0){target.hp=0;this.revision++;this.emit('depleted',{entity:target});if(e.carry>0)order.returning=true;}}
    }
  }
  tickBuilding(e,dt){if(e.progress<1)return;e.cooldown=Math.max(0,e.cooldown-dt);const d=BUILDINGS[e.type];
    if(d.damage&&e.cooldown<=0){const enemy=this.nearest(e,t=>this.hostile(e.owner,t.owner)&&!t.embarked&&(t.kind==='unit'||t.kind==='building'),d.range,true);if(enemy)this.hit(e,enemy);}
    const q=e.queue[0];if(!q)return;if(q.kind==='unit'&&this.population(e.owner)>=this.capacity(e.owner))return;q.remaining-=dt;
    if(q.remaining<=0){e.queue.shift();const p=this.players[e.owner];
      if(q.kind==='unit'){const unit=this.addUnit(q.type,e.owner,e.x,e.z+e.r+3);const free=this.pathTo(unit,{x:e.x+e.r+5,z:e.z+e.r+5})[0];if(free){unit.x=free.x;unit.z=free.z;}if(e.rally){unit.order={type:unit.type==='villager'&&e.rally.target?'gather':'move',...e.rally};}if(e.owner===0){this.stats.trained++;this.emit('trained',{entity:unit});}else if(unit.type==='villager')this.assignWorker(unit);}
      else{if(q.kind==='age'){p.age++;p.agePending=false;}else p.tech[q.type]++;for(const target of this.owned(e.owner).filter(t=>t.kind==='unit'||t.kind==='building')){const ratio=target.hp/target.maxHp;target.maxHp=this.maxHP(target);target.hp=target.maxHp*ratio;}this.emit('research',{tech:q.type,age:p.age,owner:e.owner});}
    }
  }
  assignWorker(e){const types=['food','wood','gold','stone'],counts={food:0,wood:0,gold:0,stone:0};for(const worker of this.owned(e.owner,'unit','villager'))if(worker.gatherType in counts)counts[worker.gatherType]++;let type=types.reduce((a,b)=>(counts[a]/(a==='wood'?4:a==='food'?4:a==='gold'?1.5:1))<(counts[b]/(b==='wood'?4:b==='food'?4:b==='gold'?1.5:1))?a:b);
    let resource=this.nearest(e,t=>t.kind==='resource'&&!t.water&&t.type===type&&t.amount>0);if(!resource)resource=this.nearest(e,t=>t.type==='farm'&&t.owner===e.owner&&t.progress>=1);if(resource){e.gatherType=resource.type==='farm'?'food':resource.type;e.order={type:'gather',target:resource.id};e.path=[];}}
  assignEconomy(owner){for(const e of this.owned(owner,'unit','villager'))if(!e.order)this.assignWorker(e);}
  aiBuild(type,owner=1){const tc=this.owned(owner,'building','towncenter')[0];if(!tc)return false;const worker=this.owned(owner,'unit','villager').find(w=>!['build','repair'].includes(w.order?.type));if(!worker)return false;
    for(let i=0;i<24;i++){const angle=this.rng()*Math.PI*2,r=12+this.rng()*23,x=clamp(tc.x+Math.cos(angle)*r,-71,71),z=clamp(tc.z+Math.sin(angle)*r,-71,71);if(this.buildValid(type,x,z,owner))return this.build(type,x,z,[worker.id],owner);}return false;
  }
  tickAI(){const m=this.options.mode;if(this.options.multiplayer||['sandbox','tutorial','survival'].includes(m)||this.mission?.survival)return;const owner=1,p=this.players[1],difficulty=DIFFICULTIES[this.options.difficulty],tc=this.owned(1,'building','towncenter')[0];if(!tc)return;
    this.assignEconomy(1);const workers=this.owned(1,'unit','villager');
    if(workers.length<22&&!tc.queue.some(q=>q.kind==='unit'))this.train(tc.id,'villager');
    if(this.capacity(1)-this.population(1)-this.reservedPopulation(1)<5&&!this.owned(1,'building','house').some(b=>b.progress<1))this.aiBuild('house');
    if(p.age<3&&!p.agePending&&workers.length>=10&&this.canAfford(AGE_COSTS[p.age],1))this.research(tc.id,'age');
    const priorities=['barracks',...(p.age>=1?['range','stable','blacksmith','market']:[]),...(p.age>=2?['workshop','tower','monastery']:[])];
    for(const type of priorities)if(!this.owned(1,'building',type).length&&this.canAfford(BUILDINGS[type].cost,1)){this.aiBuild(type);break;}
    if(p.resources.food<150&&this.owned(1,'building','farm').length<5)this.aiBuild('farm');
    for(const b of this.owned(1,'building').filter(e=>e.progress>=1&&e.queue.length<2)){
      const choices=Object.entries(UNITS).filter(([type,d])=>type!=='villager'&&type!=='scout'&&d.age<=p.age&&d.at.includes(b.type));
      if(choices.length){const [type]=choices[Math.floor(this.rng()*choices.length)];this.train(b.id,type);}
      if(b.type==='blacksmith'){for(const tech of ['attack','armor','ranged'])if(p.tech[tech]<p.age&&!b.queue.length)this.research(b.id,tech);}
    }
    const soldiers=this.owned(1,'unit').filter(e=>e.type!=='villager'&&e.type!=='fishingboat'&&e.type!=='king'&&!e.embarked);
    if(this.time>=this.nextAttack&&soldiers.length>=4){const target=this.options.mode==='regicide'?this.owned(0,'unit','king')[0]:this.owned(0,'building','towncenter')[0];if(target){this.command(soldiers.map(e=>e.id),{type:'attackmove',x:target.x,z:target.z});this.nextAttack=this.time+Math.max(35,70*difficulty.ai);this.emit('raid',{});}}
    const king=this.owned(1,'unit','king')[0];if(king&&king.hp<king.maxHp*.6&&tc)king.order={type:'move',x:tc.x+8,z:tc.z-7};
    if((m==='dominion'||this.mission?.dominion)&&this.time>65){const free=soldiers.filter(e=>!e.order||e.order.type!=='attack');for(const shrine of this.entities.filter(e=>e.kind==='shrine'&&e.owner!==1)){const group=free.splice(0,3);this.command(group.map(e=>e.id),{type:'attackmove',x:shrine.x,z:shrine.z});}}
    if(m==='wonder'&&p.age===3&&this.time>700&&!this.owned(1,'building','wonder').length&&this.canAfford(BUILDINGS.wonder.cost,1))this.aiBuild('wonder');
  }
  spawnWave(){this.wave++;const d=DIFFICULTIES[this.options.difficulty],count=Math.round((5+this.wave*2.5)*d.wave),sides=[{x:58,z:55},{x:-58,z:-55},{x:60,z:-50}],base=sides[(this.wave-1)%sides.length];
    this.players[1].age=Math.min(3,Math.floor(this.wave/3));for(let i=0;i<count;i++){
      let type=i%3===0?'archer':'spearman';if(this.wave>=3&&i%4===0)type='knight';if(this.wave>=5&&i%8===0)type='ram';if(this.wave>=8&&i%10===0)type='catapult';
      const unit=this.addUnit(type,1,base.x+i%6*1.8,base.z+Math.floor(i/6)*1.8);const tc=this.owned(0,'building','towncenter')[0];if(tc)unit.order={type:'attackmove',x:tc.x,z:tc.z};
    }this.nextWave=this.time+95;this.emit('wave',{wave:this.wave,count});
    // Supply caravans reward surviving a wave without removing the need for an economy.
    if(this.wave>1)for(const key of ['food','wood','gold'])this.players[0].resources[key]+=80+this.wave*15;
  }
  tickShrines(dt){for(const s of this.entities.filter(e=>e.kind==='shrine')){const troops=[0,1].map(owner=>this.owned(owner,'unit').filter(e=>e.type!=='villager'&&distance(s,e)<7).length);const side=troops[0]>0&&troops[1]===0?0:troops[1]>0&&troops[0]===0?1:-1;
      if(side>=0&&s.owner!==side){if(s.capturer!==side){s.capturer=side;s.progress=0;}s.progress+=dt;if(s.progress>=18){s.owner=side;s.progress=0;this.emit('capture',{owner:side});}}else if(side<0)s.progress=Math.max(0,s.progress-dt*.5);
      if(s.owner>=0)this.players[s.owner].resources.gold+=dt*.55;
    }
    const shrines=this.entities.filter(e=>e.kind==='shrine');if(shrines.length){this.hold=shrines.every(e=>e.owner===0)?this.hold+dt:0;this.enemyHold=shrines.every(e=>e.owner===1)?this.enemyHold+dt:0;if(this.hold>=180)this.end(true,'The sacred valley is yours.');if(this.enemyHold>=180)this.end(false,'The rival kingdom united the sacred valley.');}
  }
  isVisible(x,z){const c=this.cell(x,z);return !!this.visible[c.z*this.gridSize+c.x];}
  isExplored(x,z){const c=this.cell(x,z);return !!this.explored[c.z*this.gridSize+c.x];}
  updateFog(){this.visible.fill(0);for(const owner of this.revealedOwners||[])for(const e of this.owned(owner,'building')){const c=this.cell(e.x,e.z),r=Math.ceil(e.r/2)+2;for(let z=Math.max(0,c.z-r);z<=Math.min(this.gridSize-1,c.z+r);z++)for(let x=Math.max(0,c.x-r);x<=Math.min(this.gridSize-1,c.x+r);x++){this.visible[z*this.gridSize+x]=1;this.explored[z*this.gridSize+x]=1;}}for(const e of this.entities.filter(e=>e.hp>0&&(e.owner===0||this.options.mode==='custom'&&this.options.shareVision&&this.allied(0,e.owner))&&!e.embarked&&(e.kind==='unit'||e.kind==='building'&&e.progress>0))){const r=e.kind==='unit'?UNITS[e.type].vision:BUILDINGS[e.type].vision||18,c=this.cell(e.x,e.z),rc=Math.ceil(r/2);revealVisionCircle(this.visible,this.explored,this.gridSize,c.x,c.z,rc);}
    for(const s of this.entities.filter(e=>e.kind==='shrine'&&e.owner===0)){const c=this.cell(s.x,s.z);for(let z=Math.max(0,c.z-9);z<=Math.min(this.gridSize-1,c.z+9);z++)for(let x=Math.max(0,c.x-9);x<=Math.min(this.gridSize-1,c.x+9);x++){this.visible[z*this.gridSize+x]=1;this.explored[z*this.gridSize+x]=1;}}
  }
  tutorialObjectives(){return [
    {text:'Gather 100 resources. Your villagers are already working.',done:this.stats.gathered>=100},
    {text:'Select villagers, open Build, and construct a house.',done:this.tutorialFlags.house},
    {text:'Select the barracks and train 3 spearmen.',done:this.owned(0,'unit','spearman').length>=3},
    {text:'Right-click the ground to command your troops.',done:this.tutorialFlags.command},
    {text:'Select the town center and advance to the Feudal Age.',done:this.players[0].age>=1},
  ];}
  end(won,reason){if(this.ended)return;this.ended={won,reason};this.emit('end',this.ended);}
  checkVictory(){if(this.options.mode==='sandbox')return;
    if(this.options.mode==='regicide'){if(!this.owned(0,'unit','king').length)this.end(false,'Your sovereign has fallen.');else if(!this.owned(1,'unit','king').length)this.end(true,'The rival sovereign is defeated. Your crown endures.');return;}
    if(!this.owned(0,'building','towncenter').length)return this.end(false,'Your last town center has fallen.');
    if(this.options.mode==='tutorial'){if(this.tutorialObjectives().every(o=>o.done))this.end(true,'Your first settlement is thriving. You are ready to rule.');return;}
    const survival=this.options.mode==='survival'||this.mission?.survival;if(survival){const max=this.mission?.waves||10;if(this.wave>=max&&!this.owned(1,'unit').length&&(!this.mission||this.owned(0,'building','keep').some(b=>b.progress>=1)))this.end(true,'Your kingdom endured every assault.');return;}
    if(!this.owned(1,'building','towncenter').length){if(this.options.mode==='campaign1'&&(!this.owned(0,'building','barracks').length||this.owned(0,'unit').filter(e=>e.type!=='villager'&&e.type!=='scout').length<6))return;if(this.options.mode==='campaign2'&&this.players[0].age<2)return;this.end(true,'The rival capital has fallen. The frontier is yours.');}
  }
  tick(dt){if(this.ended)return;this.time+=dt;
    const entities=this.entitySpatial??=new SpatialBuckets(8),units=this.unitSpatial??=new SpatialBuckets(4);entities.reset();units.reset();this.entityBuckets=entities.columns;this.unitBuckets=units.columns;this.maxEntityRadius=0;
    for(const e of this.entities)if(e.hp>0){entities.add(e,e.kind==='unit'||e.kind==='building');this.maxEntityRadius=Math.max(this.maxEntityRadius,e.r||0);if(e.kind==='unit'&&!e.embarked)units.add(e);}
    for(const e of [...this.entities])if(e.hp>0){if(e.kind==='unit')this.tickUnit(e,dt);else if(e.kind==='building')this.tickBuilding(e,dt);}
    this.tickProjectiles();
    this.aiClock+=dt;if(this.options.mode==='custom')this.tickCustomAI(dt);else if(this.aiClock>=3*DIFFICULTIES[this.options.difficulty].ai){this.aiClock=0;this.tickAI();}
    const survival=this.options.mode==='survival'||this.mission?.survival;if(survival&&this.time>=this.nextWave&&this.wave<(this.mission?.waves||10))this.spawnWave();
    this.tickShrines(dt);
    if(this.options.mode==='wonder'){for(let owner=0;owner<2;owner++){if(this.owned(owner,'building','wonder').some(e=>e.progress>=1))this.wonderTime[owner]+=dt;else this.wonderTime[owner]=0;if(this.wonderTime[owner]>=240)this.end(owner===0,owner===0?'Your monument will stand for a thousand years.':'The rival monument secured their legacy.');}}
    this.fogClock+=dt;if(this.fogClock>.5){this.updateFog();this.fogClock=0;}this.checkVictory();
    retireDeadUnits(this);
    // Bound event history; observers receive events immediately.
    if(this.events.length>200)this.events.splice(0,100);
  }
  serialize(){return {version:1,bridgeRoadHalfWidth,rngState:this.rng.state,options:this.options,entities:this.entities,players:this.players,nextId:this.nextId,time:this.time,wave:this.wave,nextWave:this.nextWave,nextAttack:this.nextAttack,hold:this.hold,enemyHold:this.enemyHold,wonderTime:this.wonderTime,stats:this.stats,tutorialFlags:this.tutorialFlags,explored:Array.from(this.explored),ended:this.ended};}
  static restore(data){if(data.version!==1||!Array.isArray(data.entities)||!data.players)throw new Error('Unsupported save file');const s=new Simulation(data.options);for(const key of ['entities','players','nextId','time','wave','nextWave','nextAttack','hold','enemyHold','wonderTime','stats','tutorialFlags','ended'])s[key]=data[key];restoreWallLinks(s.entities);if(data.rngState!==undefined)s.rng.state=data.rngState;s.explored=Uint8Array.from(data.explored);s.revision++;s.grids={};clearSavedBridgeResources(s);restoreBridgeOccupants(s,data.bridgeRoadHalfWidth);s.updateFog();return s;}
}

installFrontiers(Simulation);
installTactics(Simulation);
installCommanderAI(Simulation);
installCampaigns(Simulation);
installCustomBattle(Simulation);
installGarrison(Simulation);
installProjectileCombat(Simulation);
