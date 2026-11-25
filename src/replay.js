import {AGES,FACTIONS,MAPS,MISSIONS,MODES} from './data.js';
import {SIMULATION_STEP} from './simulation-pacing.js';

const REPLAY_KEY='crowns-replays';
const MAX_REPLAYS=5;
const MAX_COMMANDS=4000;
export const REPLAY_VERSION=1;

const RECORDED_OPS=[
  'smartCommand','build','buildWallDraft','train','research','cancelQueue',
  'trade','stop','patrol','guard','setStance','townBell','returnToWork',
  'demolish','convertWallToGate','unload','seekShelter','donateResources','resign',
];

function cloneArg(sim,arg){
  if(Array.isArray(arg))return arg.map(item=>cloneArg(sim,item));
  if(!arg||typeof arg!=='object')return arg;
  // Remembered resources may outlive the live entity visible to Simulation.get.
  if(typeof arg.id==='number'&&arg.kind&&sim.get(arg.id)===arg)return {__eid:arg.id};
  return JSON.parse(JSON.stringify(arg));
}

function hydrateArg(sim,arg){
  if(Array.isArray(arg))return arg.map(item=>hydrateArg(sim,item));
  return arg&&typeof arg==='object'&&typeof arg.__eid==='number'?(sim.get(arg.__eid)||null):arg;
}

function replayTick(sim){
  return Math.round((sim.time||0)/SIMULATION_STEP);
}

export class MatchReplayRecorder {
  constructor(){
    this.active=false;
    this.options=null;
    this.commands=[];
    this.sim=null;
    this.unhooked=null;
    this.depth=0;
    this.incomplete=false;
  }

  attach(sim,options){
    this.detach();
    if(!sim||options?.multiplayer||options?.replay)return false;
    this.sim=sim;
    this.options=JSON.parse(JSON.stringify({...options,replay:false}));
    this.commands=[];
    this.incomplete=false;
    this.active=true;
    const originals=new Map();

    // Commands issued by AI during a simulation tick are regenerated during
    // playback. Nested calls are replayed by their outer command.
    const tick=sim.tick;
    originals.set('tick',tick);
    sim.tick=dt=>{
      this.depth++;
      try{
        return tick.call(sim,dt);
      }finally{
        this.depth--;
      }
    };
    for(const op of RECORDED_OPS){
      if(typeof sim[op]!=='function')continue;
      const fn=sim[op];
      originals.set(op,fn);
      sim[op]=(...args)=>{
        this.note(op,...args);
        this.depth++;
        try{
          return fn.apply(sim,args);
        }finally{
          this.depth--;
        }
      };
    }
    this.unhooked=()=>{
      for(const [op,orig] of originals)sim[op]=orig;
    };
    return true;
  }

  note(op,...args){
    if(!this.active||this.depth||this.incomplete)return;
    if(this.commands.length>=MAX_COMMANDS){
      this.incomplete=true;
      return;
    }
    try{
      this.commands.push({tick:replayTick(this.sim),op,a:args.map(arg=>cloneArg(this.sim,arg))});
    }catch{
      this.incomplete=true;
    }
  }

  detach(){
    if(this.unhooked){this.unhooked();this.unhooked=null;}
    this.active=false;
    this.sim=null;
  }

  buildRecord(result=null){
    if(!this.active||this.incomplete)return null;
    const sim=this.sim;
    const mode=this.options.mode||'skirmish';
    const modeDef=MODES.find(m=>m.id===mode)||MISSIONS.find(m=>m.id===mode);
    const faction=sim.players?.[0]?.faction||this.options.faction||'alder';
    const map=this.options.map||'highlands';
    const age=Math.max(0,Math.min(3,sim.players?.[0]?.age||0));
    return {
      id:`rep-${Date.now()}-${Math.floor(Math.random()*9999)}`,
      recordedAt:Date.now(),
      version:REPLAY_VERSION,
      endTick:replayTick(sim),
      duration:Math.round(sim.time||0),
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

export class ReplayDriver {
  constructor(record,actions={}){
    this.record=record;
    this.actions=actions;
    this.cursor=0;
    this.finished=false;
    this.failed=false;
    this.lastTime=0;
  }

  get progress(){
    const total=this.record?.endTick==null?this.record?.duration:this.record.endTick*SIMULATION_STEP;
    return this.finished&&!this.failed?1:Math.min(1,this.lastTime/Math.max(SIMULATION_STEP,total||0));
  }

  step(sim){
    if(!sim||!this.record||this.finished)return 0;
    this.lastTime=sim.time||0;
    let applied=0;
    const cmds=this.record.commands||[];
    const tick=replayTick(sim);
    const versioned=this.record.version===REPLAY_VERSION;
    while(this.cursor<cmds.length&&(versioned?cmds[this.cursor].tick<=tick:cmds[this.cursor].t<=this.lastTime+.05)){
      const {op,a}=cmds[this.cursor++];
      try{
        const args=(a||[]).map(arg=>hydrateArg(sim,arg));
        if(RECORDED_OPS.includes(op)&&typeof sim[op]==='function'){
          sim[op](...args);
          applied++;
        }else if(versioned){
          if(!Object.hasOwn(this.actions,op)){
            this.failed=this.finished=true;
            return applied;
          }
          this.actions[op](...args);
          applied++;
        }
      }catch{
        if(versioned){
          this.failed=this.finished=true;
          return applied;
        }
      }
    }
    if(this.cursor>=cmds.length&&(versioned?tick>=this.record.endTick:this.lastTime>=(this.record.duration||0))){
      this.finished=true;
    }
    return applied;
  }
}
