import {MISSIONS} from './data.js';
import {bridgeSpans} from './bridge-layout.js';

// Determines whether a match requires optional faction or bridge GLB packs so
// startup does not unconditionally download and hold unused meshes in RAM.
export function matchNeedsIronhold(options,sim=null){
  if(sim?.players?.some(player=>player?.faction==='iron'))return true;
  if(!options)return false;
  if(options.faction==='iron'||options.enemyFaction==='iron')return true;
  if(Array.isArray(options.slots)&&options.slots.some(slot=>slot?.enabled!==false&&slot?.faction==='iron'))return true;
  const mission=MISSIONS.find(m=>m.id===options.mode);
  if(mission&&(mission.actFour||mission.actFive||mission.faction==='iron'||mission.enemyFaction==='iron'))return true;
  return false;
}

export function matchMapId(options,sim=null){
  const explicit=sim?.options?.map||options?.map;
  if(explicit)return explicit;
  const mode=sim?.options?.mode||options?.mode;
  return MISSIONS.find(m=>m.id===mode)?.map||null;
}

export function matchNeedsBridge(mapOrOptions,sim=null){
  const map=typeof mapOrOptions==='string'?mapOrOptions:matchMapId(mapOrOptions,sim);
  return Boolean(map&&bridgeSpans(map).length>0);
}

export async function ensureMatchArtwork({
  options=null,
  sim=null,
  hasIronhold=()=>true,
  loadIronhold=()=>Promise.resolve(null),
  hasBridge=()=>true,
  loadBridge=()=>Promise.resolve(null),
}={}){
  const map=matchMapId(options,sim);
  const tasks=[];
  if(matchNeedsBridge(map)&&!hasBridge()){
    tasks.push(Promise.resolve().then(()=>loadBridge()));
  }
  if(matchNeedsIronhold(options||sim?.options,sim)&&!hasIronhold()){
    tasks.push(Promise.resolve().then(()=>loadIronhold()).catch(error=>{
      console.warn('Ironhold artwork could not load:',error?.message||error);
      return null;
    }));
  }
  if(!tasks.length)return false;
  await Promise.all(tasks);
  return true;
}
