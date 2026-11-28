import {Simulation} from './simulation.js';
import {MatchReplayRecorder} from './replay.js';
import {SIMULATION_STEP} from './simulation-pacing.js';
import {serializeResourceMemory,wasFelledOutOfSight,markFelledOutOfSight} from './resource-vision.js';
import {triggerHeroSkill} from './heroes.js';
import {bridgeSpans,spanZ} from './bridge-layout.js';

export const WORKER_COMMANDS=Object.freeze([
  'build','buildWallLine','buildWallDraft','convertWallToGate','train','research',
  'cancelQueue','trade','donateResources','smartCommand','stop','unload','demolish',
  'assignWorker','patrol','guard','setStance','resign','townBell','returnToWork',
  'seekShelter','toggleHeroAutoCast','castHeroSkill',
]);

const FORWARDED_EVENTS=new Set([
  'notice','kingdom-defeated','remnants-revealed','ally-support','donation',
  'complete','trained','research','sound','alarm','raid','wave','capture',
  'attack','projectile-impact','death','heal','hero-skill','hero-levelup',
  'veteran','spoils','boiling-oil','wonder-started','wonder-completed',
  'campaign-stage','campaign-event','campaign-sidequest','campaign-checkpoint','end',
]);

const SAVE_META_INTERVAL=15;
const SHADOW_META=Symbol('simWorkerShadow');
const TRANSIENT_UNIT_KEYS=new Set([
  'path','repath','pathRevision','pathTargetX','pathTargetZ','pathTargetId',
  'pathRange','pathNavigationKey','stuckTime','wallConstructionSkipped',
  'lastCombatTargetId','renderX','renderZ','renderFromX','renderFromZ','snapshotAt',
]);

function buildingSignature(e){
  const q=e.queue;
  const qSig=q?.length?`${q.length}:${q[0].type}:${Math.round((q[0].remaining||0)*10)}`:'0';
  const r=e.rally;
  const rSig=r?`${r.x},${r.z},${r.target??''}`:'';
  const g=e.garrison?.length||0;
  const wl=e.wallLinks?.join(',')||'';
  return `${e.hp}|${e.maxHp}|${e.progress??1}|${e.owner}|${qSig}|${rSig}|${g}|${e.wallTier??''}|${e.wallAngle??0}|${wl}|${e.capturer??-1}`;
}

function clonePlain(value){
  if(value===null||value===undefined||typeof value!=='object')return value;
  if(Array.isArray(value))return value.map(clonePlain);
  const out={};
  for(const key in value)if(Object.hasOwn(value,key))out[key]=clonePlain(value[key]);
  return out;
}

function compactActor(entity){
  if(!entity||typeof entity!=='object')return entity;
  const out={
    id:entity.id,
    kind:entity.kind,
    type:entity.type,
    owner:entity.owner,
    x:entity.x,
    z:entity.z,
    r:entity.r,
    hp:entity.hp,
    maxHp:entity.maxHp,
  };
  if(entity.heading!==undefined)out.heading=entity.heading;
  if(entity.moving!==undefined)out.moving=entity.moving;
  if(entity.progress!==undefined)out.progress=entity.progress;
  if(entity.wallAngle!==undefined)out.wallAngle=entity.wallAngle;
  if(entity.wallTier!==undefined)out.wallTier=entity.wallTier;
  if(entity.demolished)out.demolished=true;
  if(entity.lastAttacker!==undefined)out.lastAttacker=entity.lastAttacker;
  if(entity.displayName!==undefined)out.displayName=entity.displayName;
  if(entity.vetRank!==undefined)out.vetRank=entity.vetRank;
  if(entity.heroLevel!==undefined)out.heroLevel=entity.heroLevel;
  if(entity.order!==undefined)out.order=entity.order?{...entity.order}:null;
  if(entity.carryType!==undefined)out.carryType=entity.carryType;
  if(entity.gatherType!==undefined)out.gatherType=entity.gatherType;
  if(entity.embarked!==undefined)out.embarked=entity.embarked;
  if(entity.water!==undefined)out.water=entity.water;
  if(entity.wildlife!==undefined)out.wildlife=entity.wildlife;
  return out;
}

function sanitizeEvent(event){
  const out={};
  for(const key in event){
    if(!Object.hasOwn(event,key))continue;
    const value=event[key];
    if((key==='entity'||key==='target')&&value&&typeof value==='object'&&typeof value.id==='number')out[key]=compactActor(value);
    else if(typeof value==='function')continue;
    else out[key]=value;
  }
  return out;
}

function encodeDynamicEntity(entity){
  const out={};
  const isUnit=entity.kind==='unit';
  for(const key in entity){
    if(!Object.hasOwn(entity,key))continue;
    if(isUnit&&TRANSIENT_UNIT_KEYS.has(key))continue;
    if(!isUnit&&(key==='lastCombatTargetId'||key==='shelterSafeSince'||key==='lastAttackedAt'||key==='lastHelpAt'))continue;
    out[key]=entity[key];
  }
  if(isUnit)out.path=[];
  return out;
}

export function serializeCommandArgs(args,sim){
  return (args||[]).map(arg=>{
    if(Array.isArray(arg))return serializeCommandArgs(arg,sim);
    if(arg&&typeof arg==='object'&&typeof arg.id==='number'&&typeof arg.kind==='string'){
      if(arg.kind==='resource'&&sim?.get(arg.id)!==arg)return {__eid:arg.id,remembered:arg};
      return {__eid:arg.id};
    }
    return arg;
  });
}

export function hydrateCommandArgs(sim,args){
  return (args||[]).map(arg=>{
    if(Array.isArray(arg))return hydrateCommandArgs(sim,arg);
    if(arg&&typeof arg==='object'&&typeof arg.__eid==='number'){
      if(arg.remembered)return sim.resourceMemory?.get(arg.__eid)??arg.remembered;
      return sim.get(arg.__eid)||null;
    }
    return arg;
  });
}

export function applyAllyOrderToSim(sim,kind,viewTarget={x:0,z:0},{suppliesAllowed=true}={}){
  if(!sim||sim.options?.multiplayer)return {ok:false};
  const allies=(sim.players||[]).map((player,owner)=>({player,owner})).filter(({player,owner})=>owner>0&&sim.allied(0,owner)&&!player.defeated&&!player.dormant&&player.controller==='ai');
  if(!allies.length)return {ok:false};
  const p0=sim.owned(0,'building','towncenter')[0]||sim.owned(0,'unit')[0]||{x:0,z:0};
  if(kind==='supplies'){
    if(!suppliesAllowed)return {ok:false};
    let sent=false;
    for(const {player} of allies){
      const gifts=[['food',150],['wood',150],['gold',100],['stone',100]];
      for(const [res,amt] of gifts){
        if((player.resources?.[res]||0)>=amt+120){
          player.resources[res]-=amt;
          sim.players[0].resources[res]=(sim.players[0].resources[res]||0)+amt;
          sent=true;
        }
      }
      if(sent)return {ok:true};
    }
    return {ok:false};
  }
  let target={x:p0.x,z:p0.z};
  if(kind==='attack'){
    const enemies=(sim.players||[]).map((player,owner)=>({player,owner})).filter(({player,owner})=>owner>0&&sim.hostile(0,owner)&&!player.defeated&&!player.dormant);
    const enemyTargets=enemies.flatMap(e=>sim.owned(e.owner,'building').filter(b=>b.hp>0&&!['wall','gate','farm'].includes(b.type)))
      .sort((a,b)=>((a.type==='towncenter'||a.type==='keep')?-18:0)+Math.hypot(a.x-p0.x,a.z-p0.z)-(((b.type==='towncenter'||b.type==='keep')?-18:0)+Math.hypot(b.x-p0.x,b.z-p0.z)));
    target=enemyTargets[0]||(enemies[0]?.player?.start)||{x:viewTarget?.x||0,z:viewTarget?.z||0};
  }else if(kind==='defend'){
    const spans=bridgeSpans(sim.options?.map);
    if(sim.options?.map==='ironfall')target={x:-24,z:0};
    else if(spans.length)target={x:spans[0].center,z:spanZ(spans[0])};
    else target={x:viewTarget?.x||p0.x,z:viewTarget?.z||p0.z};
  }
  sim.allyDirective={type:kind,x:target.x,z:target.z,until:(sim.time||0)+75};
  for(const {owner} of allies){
    const fighters=sim.owned(owner,'unit').filter(u=>u.hp>0&&!u.embarked&&!['villager','fishingboat','cart','king','scout','monk'].includes(u.type));
    if(fighters.length){
      const slice=kind==='help'?fighters.slice(0,Math.max(4,Math.ceil(fighters.length*.6))):fighters.slice(0,Math.max(5,Math.ceil(fighters.length*.75)));
      sim.command(slice.map(u=>u.id),{type:'attackmove',x:target.x,z:target.z});
    }
  }
  return {ok:true,target};
}

export function applyEnemyTauntToSim(sim,kind,preferredOwner=null){
  if(!sim||sim.options?.multiplayer||kind!=='bringit')return false;
  const enemies=(sim.players||[]).map((player,owner)=>({player,owner})).filter(({player,owner})=>owner>0&&sim.hostile(0,owner)&&!player.defeated&&!player.dormant);
  if(!enemies.length)return false;
  const matched=Number.isInteger(preferredOwner)?enemies.find(e=>e.owner===preferredOwner):null;
  const lead=matched||enemies[Math.floor((sim.time||0)/3)%enemies.length];
  sim.provokedWarlord={owner:lead.owner,until:(sim.time||0)+65};
  return true;
}

export function createWorkerSession({options=null,save=null,recordReplay=false,matchId=0}={}){
  const sim=save?Simulation.restore(save):new Simulation(options||{});
  const pendingEvents=[];
  sim.on(event=>{
    if(FORWARDED_EVENTS.has(event.type))pendingEvents.push(sanitizeEvent(event));
  });
  let recorder=null;
  if(recordReplay&&!save&&!sim.options.multiplayer&&!sim.options.replay){
    recorder=new MatchReplayRecorder();
    recorder.attach(sim,sim.options);
  }
  const resourceState=new Map();
  const resourceList=[];
  const structureState=new Map();
  for(const entity of sim.entities){
    if(entity.kind==='resource'){
      resourceList.push(entity);
      resourceState.set(entity.id,{hp:entity.hp,amount:entity.amount,x:entity.x,z:entity.z,angle:entity.angle});
    }else if(entity.kind==='building'||entity.kind==='shrine'){
      if(entity.hp>0||entity.kind==='shrine')structureState.set(entity.id,buildingSignature(entity));
    }
  }
  return {
    matchId,
    sim,
    recorder,
    replaySent:false,
    endedMetaSent:false,
    pendingEvents,
    resourceState,
    resourceList,
    structureState,
    knownEntityCount:sim.entities.length,
    lastFogRevision:sim.fogRevision,
    lastResourceRevision:sim.resourceRevision||0,
    lastCheckpointRef:sim.campaignCheckpoint||null,
    lastBarrierCount:sim.barriers?.length||0,
    lastPropCount:sim.battlefieldProps?.length||0,
    lastSaveMetaAt:sim.time||0,
  };
}

export function encodeWorkerDelta(session,{steps=0,tickMs=0,includeSaveMeta=false,forceFog=false,commandReply=false,stepReply=false,fullStructures=false}={}){
  const sim=session.sim;
  const units=[];
  const structureUpdates=[];
  const removedStructures=[];
  const liveStructures=new Set();
  const resourceUpdates=[];

  // Detect if any new resources were appended after session start (rare campaign events).
  if(sim.entities.length!==session.knownEntityCount){
    session.knownEntityCount=sim.entities.length;
    for(const entity of sim.entities){
      if(entity.kind==='resource'&&!session.resourceState.has(entity.id)){
        session.resourceList.push(entity);
        session.resourceState.set(entity.id,{hp:entity.hp,amount:entity.amount,x:entity.x,z:entity.z,angle:entity.angle});
        resourceUpdates.push({full:true,entity:{...entity}});
      }
    }
  }

  for(let i=0;i<session.resourceList.length;i++){
    const r=session.resourceList[i];
    const prev=session.resourceState.get(r.id);
    if(!prev)continue;
    if(r.wildlife){
      if(r.hp!==prev.hp||r.amount!==prev.amount||r.x!==prev.x||r.z!==prev.z||r.angle!==prev.angle){
        prev.hp=r.hp;prev.amount=r.amount;prev.x=r.x;prev.z=r.z;prev.angle=r.angle;
        resourceUpdates.push({id:r.id,hp:r.hp,amount:r.amount,x:r.x,z:r.z,angle:r.angle,wandering:r.wandering,wanderX:r.wanderX,wanderZ:r.wanderZ,grazeTimer:r.grazeTimer});
      }
    }else if(r.hp!==prev.hp||r.amount!==prev.amount){
      const felledUnseen=r.type==='wood'&&r.hp<=0&&prev.hp>0&&wasFelledOutOfSight(r);
      prev.hp=r.hp;prev.amount=r.amount;
      resourceUpdates.push(felledUnseen?{id:r.id,hp:r.hp,amount:r.amount,unseen:true}:{id:r.id,hp:r.hp,amount:r.amount});
    }
  }

  for(let i=0;i<sim.entities.length;i++){
    const e=sim.entities[i];
    if(e.kind==='resource')continue;
    if(e.kind==='unit'){
      if(e.hp>0)units.push(encodeDynamicEntity(e));
      continue;
    }
    if(e.hp<=0&&e.kind!=='shrine')continue;
    liveStructures.add(e.id);
    const sig=buildingSignature(e);
    if(fullStructures||session.structureState.get(e.id)!==sig){
      session.structureState.set(e.id,sig);
      structureUpdates.push(encodeDynamicEntity(e));
    }
  }
  for(const id of session.structureState.keys()){
    if(!liveStructures.has(id)){
      session.structureState.delete(id);
      removedStructures.push(id);
    }
  }

  const transfer=[];
  const fogChanged=forceFog||sim.fogRevision!==session.lastFogRevision;
  let visible=null,explored=null,fogRevision=undefined;
  if(fogChanged){
    session.lastFogRevision=sim.fogRevision;
    fogRevision=sim.fogRevision;
    visible=sim.visible.slice();
    explored=sim.explored.slice();
    transfer.push(visible.buffer,explored.buffer);
  }

  const resRev=sim.resourceRevision||0;
  let resourceRevision=undefined,resourceMemory=undefined;
  if(resRev!==session.lastResourceRevision){
    session.lastResourceRevision=resRev;
    resourceRevision=resRev;
    resourceMemory=serializeResourceMemory(sim).resourceMemory||null;
  }

  const checkpointChanged=sim.campaignCheckpoint!==session.lastCheckpointRef;
  if(checkpointChanged)session.lastCheckpointRef=sim.campaignCheckpoint;

  const justEnded=Boolean(sim.ended)&&!session.endedMetaSent;
  const needSaveMeta=includeSaveMeta||checkpointChanged||justEnded||((sim.time||0)-session.lastSaveMetaAt>=SAVE_META_INTERVAL);
  if(needSaveMeta){
    session.lastSaveMetaAt=sim.time||0;
    if(sim.ended)session.endedMetaSent=true;
  }

  const events=session.pendingEvents.length?session.pendingEvents.splice(0):[];
  let replayRecord=null;
  if(sim.ended&&session.recorder?.active&&!session.replaySent){
    session.replaySent=true;
    replayRecord=session.recorder.buildRecord(sim.ended);
    session.recorder.detach();
  }

  const packet={
    type:'delta',
    matchId:session.matchId,
    steps,
    tickMs,
    commandReply,
    stepReply,
    units,
    structureUpdates,
    removedStructures,
    resourceUpdates,
    players:sim.players,
    time:sim.time,
    revision:sim.revision,
    nextId:sim.nextId,
    rngState:sim.rng?.state,
    wave:sim.wave,
    nextWave:sim.nextWave,
    nextAttack:sim.nextAttack,
    hold:sim.hold,
    enemyHold:sim.enemyHold,
    wonderTime:sim.wonderTime?[...sim.wonderTime]:[0,0],
    wonderTargets:sim.wonderTargets?[...sim.wonderTargets]:null,
    stats:sim.stats,
    tutorialStep:sim.tutorialStep,
    tutorialFlags:sim.tutorialFlags,
    ended:sim.ended,
    revealedOwners:sim.revealedOwners||[],
    aiClock:sim.aiClock||0,
    fogClock:sim.fogClock||0,
    shelterClock:sim.shelterClock||0,
    campaignRelicVisionBonus:sim.campaignRelicVisionBonus||null,
    projectiles:sim.projectiles||[],
    nextProjectileId:sim.nextProjectileId||0,
    events,
  };

  if(fogChanged){packet.fogRevision=fogRevision;packet.visible=visible;packet.explored=explored;}
  if(resourceRevision!==undefined){packet.resourceRevision=resourceRevision;packet.resourceMemory=resourceMemory;}
  if(sim.campaignState!==undefined)packet.campaignState=sim.campaignState;
  if(checkpointChanged)packet.campaignCheckpoint=sim.campaignCheckpoint;
  if((sim.barriers?.length||0)!==session.lastBarrierCount){
    session.lastBarrierCount=sim.barriers?.length||0;
    packet.barriers=sim.barriers||[];
  }
  if((sim.battlefieldProps?.length||0)!==session.lastPropCount){
    session.lastPropCount=sim.battlefieldProps?.length||0;
    packet.battlefieldProps=sim.battlefieldProps||[];
  }
  if(needSaveMeta){
    packet.saveMeta={
      commanderAI:sim.commanderAI||null,
      aiStates:sim.aiStates||null,
      teamAlarms:sim.teamAlarms||{},
      intel:sim.intel||{},
    };
  }
  if(replayRecord)packet.replayRecord=replayRecord;

  return {packet,transfer};
}

function ensureShadowState(shadow){
  let meta=shadow[SHADOW_META];
  if(meta&&meta.entitiesRef===shadow.entities)return meta;
  // Partition shadow.entities in-place once:
  // [0..resourceCount) static resources, [resourceCount..structureEnd) buildings/shrines, [structureEnd..end) units.
  const resources=[],structures=[],units=[],unitIds=new Set();
  const structureMap=new Map();
  const index=shadow.index instanceof Map?shadow.index:new Map();
  index.clear();
  for(let i=0;i<shadow.entities.length;i++){
    const e=shadow.entities[i];
    index.set(e.id,e);
    if(e.kind==='resource')resources.push(e);
    else if(e.kind==='unit'){units.push(e);unitIds.add(e.id);}
    else{structures.push(e);structureMap.set(e.id,e);}
  }
  shadow.entities.length=0;
  for(let i=0;i<resources.length;i++)shadow.entities.push(resources[i]);
  for(let i=0;i<structures.length;i++)shadow.entities.push(structures[i]);
  for(let i=0;i<units.length;i++)shadow.entities.push(units[i]);
  shadow.index=index;
  meta={entitiesRef:shadow.entities,resourceCount:resources.length,structureMap,unitIds};
  shadow[SHADOW_META]=meta;
  return meta;
}

export function applyWorkerDelta(shadow,packet,{view=null,onEvent=null,paletteColors=null}={}){
  if(!shadow||!packet)return {removedCount:0,fogChanged:false,ended:false};
  const meta=ensureShadowState(shadow);
  const prevRevision=shadow.revision;
  const index=shadow.index;

  if(packet.steps>0&&view?.localMotion)view.localMotion.capture(shadow);

  // Apply dirty resource updates in-place (keeps all untouched static trees intact!).
  const resUpdates=packet.resourceUpdates;
  if(resUpdates&&resUpdates.length){
    for(let i=0;i<resUpdates.length;i++){
      const u=resUpdates[i];
      if(u.full&&u.entity){
        if(!index.has(u.entity.id)){
          shadow.entities.splice(meta.resourceCount,0,u.entity);
          meta.resourceCount++;
          index.set(u.entity.id,u.entity);
        }
        continue;
      }
      const site=index.get(u.id);
      if(!site||site.kind!=='resource')continue;
      site.amount=u.amount;
      site.hp=u.hp;
      if(u.x!==undefined){
        site.x=u.x;site.z=u.z;site.angle=u.angle;
        site.wandering=u.wandering;site.wanderX=u.wanderX;site.wanderZ=u.wanderZ;site.grazeTimer=u.grazeTimer;
      }
      if(u.unseen)markFelledOutOfSight(site);
    }
  }

  let removedCount=0;
  const removedStructs=packet.removedStructures;
  if(removedStructs&&removedStructs.length){
    for(let i=0;i<removedStructs.length;i++){
      const id=removedStructs[i];
      if(meta.structureMap.delete(id)){
        index.delete(id);
        removedCount++;
      }
    }
  }
  const structUpdates=packet.structureUpdates;
  if(structUpdates&&structUpdates.length){
    for(let i=0;i<structUpdates.length;i++){
      const s=structUpdates[i];
      meta.structureMap.set(s.id,s);
      index.set(s.id,s);
    }
  }

  // Rebuild only the non-resource tail (structures + units) on the SAME shadow.entities array.
  shadow.entities.length=meta.resourceCount;
  for(const s of meta.structureMap.values())shadow.entities.push(s);

  const nextUnitIds=new Set();
  const incomingUnits=packet.units||[];
  for(let i=0;i<incomingUnits.length;i++){
    const e=incomingUnits[i];
    const old=index.get(e.id);
    if(old&&old.renderX!==undefined){e.renderX=old.renderX;e.renderZ=old.renderZ;}
    shadow.entities.push(e);
    index.set(e.id,e);
    nextUnitIds.add(e.id);
  }
  for(const id of meta.unitIds){
    if(!nextUnitIds.has(id)){index.delete(id);removedCount++;}
  }
  meta.unitIds=nextUnitIds;

  // Apply players (preserving active colorblind palette if set on main thread).
  shadow.players=packet.players;
  if(Array.isArray(paletteColors)){
    for(let i=0;i<shadow.players.length;i++){
      if(shadow.players[i]&&paletteColors[i]!==undefined)shadow.players[i].color=paletteColors[i];
    }
  }

  shadow.time=packet.time;
  shadow.revision=packet.revision;
  shadow.nextId=packet.nextId;
  if(packet.rngState!==undefined&&shadow.rng)shadow.rng.state=packet.rngState;
  shadow.wave=packet.wave;
  shadow.nextWave=packet.nextWave;
  shadow.nextAttack=packet.nextAttack;
  shadow.hold=packet.hold;
  shadow.enemyHold=packet.enemyHold;
  shadow.wonderTime=packet.wonderTime;
  if(packet.wonderTargets!==null&&packet.wonderTargets!==undefined)shadow.wonderTargets=packet.wonderTargets;
  shadow.stats=packet.stats;
  shadow.tutorialStep=packet.tutorialStep;
  shadow.tutorialFlags=packet.tutorialFlags;
  shadow.ended=packet.ended;
  shadow.revealedOwners=packet.revealedOwners;
  shadow.aiClock=packet.aiClock;
  shadow.fogClock=packet.fogClock;
  shadow.shelterClock=packet.shelterClock;
  if(packet.campaignRelicVisionBonus!==null&&packet.campaignRelicVisionBonus!==undefined)shadow.campaignRelicVisionBonus=packet.campaignRelicVisionBonus;
  shadow.projectiles=packet.projectiles||[];
  shadow.nextProjectileId=packet.nextProjectileId||0;

  if(packet.campaignState!==undefined)shadow.campaignState=packet.campaignState;
  if(packet.campaignCheckpoint!==undefined)shadow.campaignCheckpoint=packet.campaignCheckpoint;
  if(packet.barriers!==undefined)shadow.barriers=packet.barriers;
  if(packet.battlefieldProps!==undefined)shadow.battlefieldProps=packet.battlefieldProps;
  if(packet.saveMeta){
    shadow.commanderAI=packet.saveMeta.commanderAI;
    shadow.aiStates=packet.saveMeta.aiStates;
    shadow.teamAlarms=packet.saveMeta.teamAlarms;
    shadow.intel=packet.saveMeta.intel;
  }

  const fogChanged=Boolean(packet.visible&&packet.explored);
  if(fogChanged){
    shadow.visible=packet.visible;
    shadow.explored=packet.explored;
    shadow.fogRevision=packet.fogRevision;
  }

  if(packet.resourceRevision!==undefined){
    shadow.resourceRevision=packet.resourceRevision;
    if(Array.isArray(packet.resourceMemory)&&packet.resourceMemory.length){
      const memory=new Map();
      for(const entry of packet.resourceMemory){
        if(!Array.isArray(entry))continue;
        const [id,hp,amount]=entry;
        const base=index.get(id);
        if(base)memory.set(id,{...base,hp,amount});
      }
      shadow.resourceMemory=memory.size?memory:undefined;
    }else{
      shadow.resourceMemory=undefined;
    }
  }

  if(shadow.revision!==prevRevision){
    shadow.grids={};
    shadow.sightCache=null;
  }
  shadow.ownedCandidates=null;

  if(packet.steps>0&&view?.localMotion)view.localMotion.commit(shadow);
  if(removedCount>0&&view?.pruneMissing)view.pruneMissing(index);

  if(onEvent&&packet.events?.length){
    for(let i=0;i<packet.events.length;i++)onEvent(packet.events[i]);
  }

  return {removedCount,fogChanged,ended:Boolean(packet.ended)};
}

function nowMs(){
  return typeof performance!=='undefined'&&typeof performance.now==='function'?performance.now():Date.now();
}

export function handleWorkerMessage(session,message,post){
  if(!message||typeof message!=='object')return session;

  if(message.type==='init'){
    const next=createWorkerSession({
      options:message.options,
      save:message.save,
      recordReplay:Boolean(message.recordReplay),
      matchId:message.matchId||0,
    });
    if(Array.isArray(message.paletteColors)){
      for(let i=0;i<next.sim.players.length;i++){
        if(next.sim.players[i]&&message.paletteColors[i]!==undefined)next.sim.players[i].color=message.paletteColors[i];
      }
    }
    post({type:'inited',matchId:next.matchId});
    return next;
  }

  if(message.type==='stop'){
    session?.recorder?.detach();
    return null;
  }

  if(!session|| (message.matchId!==undefined&&message.matchId!==session.matchId))return session;
  const sim=session.sim;

  if(message.type==='palette'){
    if(Array.isArray(message.colors)){
      for(let i=0;i<sim.players.length;i++){
        if(sim.players[i]&&message.colors[i]!==undefined)sim.players[i].color=message.colors[i];
      }
    }
    return session;
  }

  if(message.type==='save'){
    post({type:'save',matchId:session.matchId,requestId:message.requestId,snapshot:sim.serialize()});
    return session;
  }

  if(message.type==='cmd'){
    const method=message.method;
    if(WORKER_COMMANDS.includes(method)&&typeof sim[method]==='function'&&!sim.ended){
      const args=hydrateCommandArgs(sim,message.args);
      if(method==='toggleHeroAutoCast'&&session.recorder?.active)session.recorder.note('heroAutoCast',args[0]);
      if(method==='castHeroSkill'&&session.recorder?.active)session.recorder.note('heroSkill',args[0],args[1]);
      const result=sim[method](...args);
      if(message.reply){
        const {packet,transfer}=encodeWorkerDelta(session,{commandReply:true});
        if(method==='convertWallToGate'&&result?.id!==undefined){
          packet.gateConversion={wallId:args[0],gateId:result.id};
        }
        post(packet,transfer);
      }
    }
    return session;
  }

  if(message.type==='custom'){
    if(!sim.ended){
      const op=message.op,args=message.args||[];
      if(op==='formation'&&sim.players?.[0]){
        session.recorder?.note('formation',args[0]);
        sim.players[0].formation=args[0];
      }else if(op==='autoWork'){
        session.recorder?.note('autoWork',args[0]);
        const worker=sim.get(args[0]);
        if(worker){worker.order=null;sim.assignWorker(worker);}
      }else if(op==='allyOrder'){
        session.recorder?.note('allyOrder',args[0],args[1],args[2]);
        applyAllyOrderToSim(sim,args[0],{x:args[1]||0,z:args[2]||0});
      }else if(op==='enemyTaunt'){
        session.recorder?.note('enemyTaunt',args[0]);
        applyEnemyTauntToSim(sim,args[0],args[1]);
      }else if(op==='heroAutoCast'){
        session.recorder?.note('heroAutoCast',args[0]);
        sim.toggleHeroAutoCast(args[0]);
      }else if(op==='heroSkill'){
        session.recorder?.note('heroSkill',args[0],args[1]);
        const hero=sim.get(args[0]);
        if(hero)triggerHeroSkill(sim,hero,args[1]);
      }else if(op==='setController'){
        const owner=Number(args[0]);
        if(sim.players?.[owner])sim.players[owner].controller=args[1];
      }
      if(message.reply){
        const {packet,transfer}=encodeWorkerDelta(session,{commandReply:true});
        post(packet,transfer);
      }
    }
    return session;
  }

  if(message.type==='step'){
    const count=Math.max(1,Math.min(6,Math.floor(Number(message.steps)||1)));
    const t0=nowMs();
    let executed=0;
    for(let i=0;i<count;i++){
      if(sim.ended)break;
      sim.tick(SIMULATION_STEP);
      executed++;
    }
    const tickMs=nowMs()-t0;
    const {packet,transfer}=encodeWorkerDelta(session,{steps:executed,tickMs,stepReply:true});
    post(packet,transfer);
    return session;
  }

  if(message.type==='fastForward'){
    const targetTime=Number(message.targetTime)||0;
    if(message.aiPlayer0&&sim.players?.[0])sim.players[0].controller='ai';
    const t0=nowMs();
    let executed=0;
    const maxSteps=Math.min(20000,Math.max(0,Math.ceil((targetTime-(sim.time||0))/SIMULATION_STEP)+5));
    while(sim.time<targetTime&&!sim.ended&&executed<maxSteps){
      sim.tick(SIMULATION_STEP);
      executed++;
    }
    // Discard noisy intermediate fast-forward combat/gather events so UI doesn't replay 4,000 sounds.
    session.pendingEvents.length=0;
    const elapsedMs=nowMs()-t0;
    const {packet,transfer}=encodeWorkerDelta(session,{steps:executed,tickMs:elapsedMs,includeSaveMeta:true,forceFog:true,commandReply:true,fullStructures:true});
    packet.fastForwardId=message.fastForwardId;
    post(packet,transfer);
    return session;
  }

  return session;
}

export {clonePlain};
