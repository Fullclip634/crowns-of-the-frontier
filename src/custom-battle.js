import {WORLD,FACTIONS,DIFFICULTIES,UNITS,BUILDINGS,seededRandom} from './data.js';
import {AI_PACES,recordBaseAlarm} from './allied-ai.js';
import {plantStartingForests,reservedStartingLand} from './starting-forests.js';
import {groupFieldForests} from './field-forests.js';

export const POPULATION_LIMITS=Object.freeze([20,40,60,80,120,160]);

export const BATTLE_SIZES={spacious:{name:'Spacious',size:240,desc:'2.25× standard area'},large:{name:'Large',size:320,desc:'4× standard area'},huge:{name:'Huge',size:400,desc:'6.25× standard area'},vast:{name:'Vast',size:480,desc:'9× standard area'},epic:{name:'Epic',size:560,desc:'12.25× standard area'}};
export const PLAYER_COLORS=[0x48abc2,0xe07566,0xe6c064,0x73b67b,0xb98ed2,0x66cec0,0xe69b58,0xc3cdd5];
export const VICTORY_RULES={annihilation:{name:'Destroy all buildings',desc:'A kingdom is eliminated when its last building falls, including walls and foundations. Its remaining army surrenders. Your alliance wins when every opposing kingdom is eliminated.'},capital:{name:'Capital conquest',desc:'Destroy every town center belonging to each opposing kingdom. Losing the last town center eliminates that kingdom.'},conquest:{name:'Total conquest',desc:'Destroy all opposing buildings and units. Surviving villagers can rebuild. Your alliance must eliminate every opposing kingdom.'}};

export function battlePreset(preset='2v2'){
  const n=preset==='4v4'||preset==='ffa8'?8:preset==='3v3'?6:4,split=preset==='1v3'?1:n/2;
  return Array.from({length:8},(_,i)=>({enabled:i<n,name:i===0?'Your kingdom':`Kingdom ${i+1}`,faction:['alder','sun','raven'][i%3],team:preset.startsWith('ffa')?i+1:i<split?1:2,difficulty:'normal'}));
}
export function normalizeBattle(options){
  const raw=Array.isArray(options.slots)?options.slots:battlePreset(),source=raw.slice(0,8).map((slot,i)=>({...slot,slotNumber:slot.slotNumber||i+1}));
  const spectator=!options.multiplayer&&(options.spectator===true||Number(options.playerSlot)===0),requested=Number(options.playerSlot),chosen=spectator?-1:requested>0?source.findIndex(slot=>slot.slotNumber===requested):source.findIndex(slot=>slot.enabled!==false);
  if(!spectator&&(chosen<0||source[chosen].enabled===false))throw new Error('Choose an enabled kingdom to play.');
  if(chosen>0)source.unshift(...source.splice(chosen,1));
  const slots=source.filter(slot=>slot.enabled!==false).map((slot,i)=>({
    name:String(slot.name||(i===0?'Your kingdom':`Kingdom ${i+1}`)).trim().slice(0,24)||`Kingdom ${i+1}`,
    faction:FACTIONS[slot.faction]?slot.faction:'alder',team:Math.max(1,Math.min(8,Math.floor(Number(slot.team)||i+1))),difficulty:DIFFICULTIES[slot.difficulty]?slot.difficulty:'normal',enabled:true,slotNumber:slot.slotNumber,color:PLAYER_COLORS[slot.slotNumber-1]??PLAYER_COLORS[i],controller:spectator?'ai':i===0||options.multiplayer&&slot.controller==='human'?'human':'ai',
  }));
  if(slots.length<2)throw new Error('Enable at least one opposing kingdom.');
  if(slots.every(slot=>slot.team===slots[0].team))throw new Error('Place at least one kingdom on a different team.');
  const mapSize=BATTLE_SIZES[options.mapSize]?options.mapSize:'vast';
  return {...options,mode:'custom',slots,playerSlot:spectator?0:slots[0].slotNumber,spectator,mapSize,worldSize:BATTLE_SIZES[mapSize].size,faction:slots[0].faction,difficulty:'normal',victory:VICTORY_RULES[options.victory]?options.victory:'annihilation',aiPace:Object.hasOwn(AI_PACES,options.aiPace)?options.aiPace:'balanced',startAge:Math.max(options.map==='coast'?1:0,Math.min(3,Math.floor(Number(options.startAge)||0))),resourceLevel:options.resourceLevel==='rich'?'rich':'standard',populationLimit:POPULATION_LIMITS.includes(Number(options.populationLimit))?Number(options.populationLimit):80,shareVision:options.shareVision!==false,revealRemnants:options.revealRemnants!==false,multiplayer:!!options.multiplayer};
}
export function battleSpawns(slots,worldSize){
  const ordered=slots.map((slot,i)=>({team:slot.team,slotNumber:slot.slotNumber||i+1,i})).sort((a,b)=>a.team-b.team||a.slotNumber-b.slotNumber),anchor=ordered.reduce((best,slot,index)=>slot.slotNumber<ordered[best].slotNumber?index:best,0),r=worldSize*.34,result=[];
  ordered.forEach((slot,index)=>{const angle=Math.PI*.75+(index-anchor)*Math.PI*2/slots.length;let x=Math.cos(angle)*r,z=Math.sin(angle)*r;if(Math.abs(x)<38)x=x<0?-38:38;result[slot.i]={x,z};});return result;
}
const emptyStats=()=>({gathered:0,kills:0,lost:0,built:0,trained:0});

function startingDeposits(sim,base,owner){
  const rng=seededRandom(sim.options.seed+1337),clusters=[[-16,18,'food',7],[15,-18,'gold',5],[-23,2,'stone',5]];
  for(const [dx,dz,type,count]of clusters){
    const spread=type==='food'?7:5,offsets=Array.from({length:count},()=>({x:(rng()-.5)*spread,z:(rng()-.5)*spread}));
    const initial=Math.atan2(dz,sim.options.map==='coast'?Math.sign(base.x)*Math.abs(dx):dx);
    for(let attempt=0;attempt<96;attempt++){
      const angle=initial+(attempt%24)*Math.PI/12,radius=[23,26,20,28][Math.floor(attempt/24)];
      const points=offsets.map(offset=>({x:base.x+Math.cos(angle)*radius+offset.x,z:base.z+Math.sin(angle)*radius+offset.z}));
      if(points.some(point=>Math.abs(point.x)>sim.halfWorld-5||Math.abs(point.z)>sim.halfWorld-5||sim.isWater(point.x,point.z)||sim.entities.some(e=>e.hp>0&&(
        e.kind==='building'&&Math.hypot(e.x-point.x,e.z-point.z)<e.r+3 ||
        type!=='food'&&e.kind==='unit'&&Math.hypot(e.x-point.x,e.z-point.z)<e.r+2 ||
        e.kind==='resource'&&Math.hypot(e.x-point.x,e.z-point.z)<e.r+2
      ))))continue;
      for(const point of points){const deposit=sim.addNaturalResource(type,point.x,point.z,type==='food'?500:2200);deposit.startDeposit=owner;}
      break;
    }
  }
}

function initializeBattle(sim){
  sim.aiStates={};sim.spawnPositions=battleSpawns(sim.options.slots,sim.worldSize);sim.revealedOwners=[];
  const kingdoms=sim.players.map((player,owner)=>({player,owner})).sort((a,b)=>sim.options.slots[a.owner].slotNumber-sim.options.slots[b.owner].slotNumber);
  sim.players.forEach((player,owner)=>{player.start=sim.spawnPositions[owner];});
  kingdoms.forEach(({player,owner})=>{
    player.start=sim.spawnPositions[owner];player.battleStats=emptyStats();player.age=sim.options.startAge;player.aiClock=-owner*.25;player.defeated=false;
    player.resources=sim.options.resourceLevel==='rich'?{food:1600,wood:1600,gold:900,stone:900}:{food:550,wood:650,gold:250,stone:300};
    const {x,z}=player.start;
    sim.addBuilding('towncenter',owner,x,z,true);sim.addBuilding('house',owner,x-10,z-8,true);sim.addBuilding('house',owner,x+10,z+8,true);sim.addBuilding('mill',owner,x-11,z+10,true);sim.addBuilding('barracks',owner,x+13,z-9,true);
    for(let i=0;i<8;i++)sim.addUnit('villager',owner,x-6+i%4*2.5,z+14+Math.floor(i/4)*2.5);
    sim.addUnit('scout',owner,x+12,z+9);
    if(player.age>=1)for(let i=0;i<6;i++)sim.addUnit(i%3?'spearman':'archer',owner,x+20+i%3*2,z+4+Math.floor(i/3)*2);
    if(player.age>=1)sim.addBuilding('range',owner,x+1,z-14,true);
    if(player.age>=2){sim.addBuilding('stable',owner,x-15,z-1,true);sim.addBuilding('blacksmith',owner,x+19,z+15,true);}
  });
  if(sim.options.map==='coast')kingdoms.forEach(({player,owner})=>{const z=player.start.z,sign=Math.sign(player.start.x),mid=Math.sin(z*.03)*2;
    sim.addBuilding('dock',owner,mid+sign*20,z,true);sim.addUnit('fishingboat',owner,mid+sign*8,z+5);sim.addUnit('galley',owner,mid+sign*8,z-6);sim.addUnit('transport',owner,mid+sign*8,z+14);
  });
  kingdoms.forEach(({player,owner})=>{
    // Each settlement receives the same seeded local deposits, independent of difficulty.
    startingDeposits(sim,player.start,owner);
  });
  const scattered=Math.round(250*sim.worldSize/WORLD)+(sim.options.map==='winter'?160:0);
  for(let i=0;i<scattered;i++){
    const x=(sim.rng()-.5)*(sim.worldSize-16),z=(sim.rng()-.5)*(sim.worldSize-16);
    if(sim.isWater(x,z)||reservedStartingLand(sim,x,z)||sim.startClearing(x,z)||sim.entities.some(e=>e.kind==='building'&&Math.hypot(e.x-x,e.z-z)<e.r+6))continue;
    sim.addNaturalResource(i%19===0?'gold':i%23===0?'stone':'wood',x,z,i%19===0||i%23===0?2400:300);
  }
  plantStartingForests(sim);
  groupFieldForests(sim);
  if(sim.options.map==='coast'){
    for(let i=0;i<Math.round(sim.worldSize/10);i++){const z=-sim.halfWorld+12+i*10,x=Math.sin(z*.03)*2+(sim.rng()-.5)*12,fish=sim.addNaturalResource('food',x,z,2600);fish.water=true;fish.r=2.1;}
  }
  for(let owner=0;owner<sim.players.length;owner++)sim.assignEconomy(owner);
  for(const unit of sim.entities.filter(e=>e.type==='fishingboat'))sim.assignWorker(unit);
  sim.updateFog();
}

export function installCustomBattle(Simulation){
  const p=Simulation.prototype,initialize=p.initialize,tickAI=p.tickAI,checkVictory=p.checkVictory,updateFog=p.updateFog,serialize=p.serialize,restore=Simulation.restore,hurt=p.hurt,emit=p.emit;
  p.donateResources=function(from,to,type,amount){
    if(this.options.mode!=='custom'||this.ended||!Number.isInteger(from)||!Number.isInteger(to)||from===to||!['food','wood','gold','stone'].includes(type)||!Number.isSafeInteger(amount)||amount<1||amount>1000000)return false;
    const sender=this.players[from],recipient=this.players[to];
    if(!sender||!recipient||sender.defeated||recipient.defeated||!this.allied(from,to)||!Number.isFinite(sender.resources[type])||sender.resources[type]<amount||!Number.isFinite(recipient.resources[type]))return false;
    sender.resources[type]-=amount;recipient.resources[type]+=amount;
    this.emit('donation',{from,to,resource:type,amount});return true;
  };
  p.initialize=function(){if(this.options.mode==='custom')initializeBattle(this);else initialize.call(this);};
  p.tickAI=function(){if(this.options.mode!=='custom')return tickAI.call(this);for(let owner=1;owner<this.players.length;owner++)if(!this.players[owner].defeated)tickAI.call(this,owner);};
  p.tickCustomAI=function(dt){for(let owner=0;owner<this.players.length;owner++){
    const player=this.players[owner];if(player.defeated||player.controller==='human')continue;player.aiClock+=dt;const interval=3*DIFFICULTIES[player.difficulty].ai;if(player.aiClock<interval)continue;player.aiClock-=interval;
    const tc=this.owned(owner,'building','towncenter')[0];
    if(!tc){const worker=this.owned(owner,'unit','villager').find(e=>e.order?.type!=='build');if(worker&&!this.owned(owner,'building','towncenter').length)for(let i=0;i<16;i++){const angle=i*2.4,r=12+Math.floor(i/4)*6,x=player.start.x+Math.cos(angle)*r,z=player.start.z+Math.sin(angle)*r;if(this.buildValid('towncenter',x,z,owner)){this.build('towncenter',x,z,[worker.id],owner);break;}}this.assignEconomy(owner);continue;}
    tickAI.call(this,owner);
  }};
  p.updateFog=function(){updateFog.call(this);if(this.options.mode==='custom'&&this.options.spectator){this.visible.fill(1);this.explored.fill(1);}};
  p.eliminateKingdom=function(owner,reason){
    const player=this.players[owner];if(!player||player.defeated)return;player.defeated=true;
    for(const e of this.owned(owner).filter(e=>e.kind==='unit'||e.kind==='building')){e.hp=0;if(e.queue)e.queue=[];player.battleStats.lost++;this.emit('death',{entity:e});}
    this.revision++;this.emit('kingdom-defeated',{owner,name:player.name,reason});this.updateFog();
  };
  p.resign=function(owner=0){if(this.options.mode!=='custom'||this.ended)return false;this.eliminateKingdom(owner,'Resigned');this.checkVictory();return true;};
  p.checkVictory=function(){
    if(this.options.mode!=='custom')return checkVictory.call(this);
    const kingdoms=this.players.map(()=>({buildings:[],units:0}));
    for(const e of this.entities)if(e.hp>0&&e.owner>=0){if(e.kind==='building')kingdoms[e.owner].buildings.push(e);else if(e.kind==='unit')kingdoms[e.owner].units++;}
    for(let owner=0;owner<this.players.length;owner++){
      const player=this.players[owner];if(player.defeated)continue;
      const {buildings,units}=kingdoms[owner];
      if(this.options.victory==='capital'?!buildings.some(e=>e.type==='towncenter'):this.options.victory==='conquest'?!buildings.length&&!units:!buildings.length)this.eliminateKingdom(owner,'Victory condition reached');
      if(this.options.revealRemnants&&!player.defeated&&!buildings.some(e=>e.type==='towncenter')&&buildings.length<=5&&!this.revealedOwners.includes(owner)){
        this.revealedOwners.push(owner);this.emit('remnants-revealed',{owner,name:player.name});this.updateFog();
      }
    }
    const team=this.players[0].team,allies=this.players.filter(player=>player.team===team&&!player.defeated),enemies=this.players.filter(player=>player.team!==team&&!player.defeated);
    if(this.options.multiplayer||this.options.spectator){const teams=[...new Set(this.players.filter(player=>!player.defeated).map(player=>player.team))];if(teams.length<=1){const won=teams[0]===team&&!this.options.spectator,reason=teams.length?'The last surviving alliance controls the battlefield.':'Every kingdom has been eliminated.';this.ended={won,reason,winningTeam:teams[0]??null,...(this.options.spectator?{spectator:true}:{})};this.emit('end',this.ended);}return;}
    if(!allies.length)this.end(false,'Every kingdom in your alliance has been eliminated.');else if(!enemies.length)this.end(true,'Your alliance has eliminated every opposing kingdom.');
  };
  p.hurt=function(target,amount,attacker){const before=target.hp,alive=before>0;hurt.call(this,target,amount,attacker);recordBaseAlarm(this,target,attacker,Math.max(0,before-target.hp));if(this.options.mode==='custom'&&alive&&target.hp<=0){if(target.owner>=0)this.players[target.owner].battleStats.lost++;if(attacker?.owner>=0)this.players[attacker.owner].battleStats.kills++;}};
  p.emit=function(type,data={}){if(this.options.mode==='custom'){
    const owner=data.owner??data.entity?.owner,stats=this.players?.[owner]?.battleStats;
    if(stats){if(type==='gathered')stats.gathered+=data.amount;if(type==='trained'||type==='stat-trained')stats.trained++;if(type==='complete'||type==='stat-complete')stats.built++;}
  }return emit.call(this,type,data);};
  p.serialize=function(){return {...serialize.call(this),aiStates:this.aiStates||null,teamAlarms:this.teamAlarms||{},revealedOwners:this.revealedOwners||[]};};
  Simulation.restore=function(data){const sim=restore.call(this,data);sim.aiStates=data.aiStates?JSON.parse(JSON.stringify(data.aiStates)):sim.options.mode==='custom'?{}:null;sim.teamAlarms=JSON.parse(JSON.stringify(data.teamAlarms||{}));sim.revealedOwners=data.revealedOwners||[];if(sim.options.mode==='custom'){if(!data.options.aiPace)sim.options.aiPace='aggressive';sim.players.forEach(player=>{player.battleStats??=emptyStats();player.aiClock??=0;});}sim.updateFog();return sim;};
}

export function visibilityFor(sim,owner,explored,observer=false){
  const size=sim.gridSize,visible=new Uint8Array(size*size);
  if(observer){visible.fill(1);explored.fill(1);return visible;}
  const reveal=(e,r)=>{const c=sim.cell(e.x,e.z),rc=Math.ceil(r/2);for(let z=Math.max(0,c.z-rc);z<=Math.min(size-1,c.z+rc);z++)for(let x=Math.max(0,c.x-rc);x<=Math.min(size-1,c.x+rc);x++)if((x-c.x)**2+(z-c.z)**2<=rc*rc){visible[z*size+x]=1;explored[z*size+x]=1;}};
  for(const e of sim.entities)if(e.hp>0&&!e.embarked&&(e.owner===owner||sim.options.mode==='custom'&&sim.options.shareVision&&sim.allied(owner,e.owner))){if(e.kind==='unit')reveal(e,UNITS[e.type].vision);else if(e.kind==='building'&&e.progress>0)reveal(e,BUILDINGS[e.type].vision||18);else if(e.kind==='shrine')reveal(e,18);}
  for(const side of sim.revealedOwners||[])for(const e of sim.owned(side,'building'))reveal(e,e.r+4);
  return visible;
}
