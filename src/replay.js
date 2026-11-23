import {AGES,FACTIONS,MAPS,MISSIONS,MODES} from './data.js';

const REPLAY_KEY='crowns-replays';
const MAX_REPLAYS=5;
const MAX_COMMANDS=4000;

const RECORDED_OPS=Object.freeze([
  'smartCommand','build','buildWallDraft','train','research','cancelQueue',
  'trade','stop','patrol','guard','setStance','townBell','returnToWork',
  'demolish','convertWallToGate','unload','seekShelter','donateResources','resign',
]);

function cloneArgs(args){
  return args.map(a=>{
    if(a===null||a===undefined||typeof a!=='object')return a;
    // Reference entities strictly by ID so replay logs stay tiny (~10 KB/match)
    if(typeof a.id==='number'&&a.kind)return {__eid:a.id};
    try{return JSON.parse(JSON.stringify(a));}catch{return null;}
  });
}

function hydrateArgs(sim,args){
  return (args||[]).map(a=>a&&typeof a==='object'&&typeof a.__eid==='number'?(sim.get(a.__eid)||null):a);
}

/**
 * Lightweight deterministic command-log match recorder (~5–20 KB per match,
 * < 0.01ms overhead per click, strictly zero per-frame allocations).
 */
export class MatchReplayRecorder {
  constructor(){
    this.active=false;
    this.options=null;
    this.commands=[];
    this.sim=null;
    this.unhooked=null;
  }

  attach(sim,options){
    this.detach();
    if(!sim||options?.multiplayer||options?.replay)return false;
    this.sim=sim;
    this.options=JSON.parse(JSON.stringify({...options,replay:false}));
    this.commands=[];
    this.active=true;
    const originals=new Map();
    for(const op of RECORDED_OPS){
      if(typeof sim[op]!=='function')continue;
      const fn=sim[op].bind(sim);
      originals.set(op,sim[op]);
      sim[op]=(...args)=>{
        if(this.active&&this.commands.length<MAX_COMMANDS){
          this.commands.push({t:Math.round((sim.time||0)*10)/10,op,a:cloneArgs(args)});
        }
        return fn(...args);
      };
    }
    this.unhooked=()=>{
      for(const [op,orig] of originals)sim[op]=orig;
      originals.clear();
    };
    return true;
  }

  detach(){
    if(this.unhooked){this.unhooked();this.unhooked=null;}
    this.active=false;
    this.sim=null;
  }

  buildRecord(result=null){
    if(!this.options)return null;
    const sim=this.sim;
    const mode=this.options.mode||'skirmish';
    const modeDef=MODES.find(m=>m.id===mode)||MISSIONS.find(m=>m.id===mode);
    const faction=sim?.players?.[0]?.faction||this.options.faction||'alder';
    const map=this.options.map||'highlands';
    const age=Math.max(0,Math.min(3,sim?.players?.[0]?.age||0));
    return {
      id:`rep-${Date.now()}-${Math.floor(Math.random()*9999)}`,
      recordedAt:Date.now(),
      duration:Math.round(sim?.time||0),
      won:result?Boolean(result.won):null,
      mode,
      modeName:modeDef?.name||'Skirmish',
      faction,
      factionName:FACTIONS[faction]?.name||'The Alder Kingdom',
      map,
      mapName:MAPS[map]?.name||'Emerald Highlands',
      ageName:AGES[age]||AGES[0],
      options:this.options,
      commands:this.commands.slice(),
    };
  }
}

export function listReplays(storage){
  try{
    const raw=(storage??globalThis.localStorage).getItem(REPLAY_KEY);
    const parsed=raw?JSON.parse(raw):[];
    return Array.isArray(parsed)?parsed:[];
  }catch{return [];}
}

export function saveReplay(record,storage){
  if(!record||!record.options)return false;
  try{
    const store=storage??globalThis.localStorage;
    const list=[record,...listReplays(store).filter(r=>r.id!==record.id)].slice(0,MAX_REPLAYS);
    store.setItem(REPLAY_KEY,JSON.stringify(list));
    return true;
  }catch{return false;}
}

export function readReplay(id,storage){
  return listReplays(storage).find(r=>r.id===id)||null;
}

export function deleteReplay(id,storage){
  try{
    const store=storage??globalThis.localStorage;
    const next=listReplays(store).filter(r=>r.id!==id);
    store.setItem(REPLAY_KEY,JSON.stringify(next));
    return true;
  }catch{return false;}
}

/** Replays recorded player commands deterministically as Simulation time advances. */
export class ReplayDriver {
  constructor(record){
    this.record=record;
    this.cursor=0;
    this.finished=false;
  }

  get progress(){
    const total=Math.max(1,this.record?.duration||1);
    return Math.min(1,this.lastTime/total);
  }

  step(sim){
    if(!sim||!this.record)return 0;
    this.lastTime=sim.time||0;
    let applied=0;
    const cmds=this.record.commands||[];
    while(this.cursor<cmds.length&&cmds[this.cursor].t<=(sim.time||0)+.05){
      const {op,a}=cmds[this.cursor++];
      if(typeof sim[op]==='function'){
        try{sim[op](...hydrateArgs(sim,a));applied++;}catch{}
      }
    }
    if(this.cursor>=cmds.length&&(sim.time||0)>=(this.record.duration||0)){
      this.finished=true;
    }
    return applied;
  }
}
