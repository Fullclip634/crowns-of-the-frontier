import {AGES,FACTIONS,MAPS,MISSIONS,MODES} from './data.js';

const AUTO_KEY='crowns-save';
const META_KEY='crowns-save-meta';
export const SAVE_SLOTS=Object.freeze([
  {id:'auto',key:AUTO_KEY,label:'Auto-Save'},
  {id:'slot1',key:'crowns-save-slot1',label:'Kingdom Slot I'},
  {id:'slot2',key:'crowns-save-slot2',label:'Kingdom Slot II'},
  {id:'slot3',key:'crowns-save-slot3',label:'Kingdom Slot III'},
]);

function slotSpec(slotId='auto'){
  return SAVE_SLOTS.find(s=>s.id===slotId)||SAVE_SLOTS[0];
}

function readMetaMap(storage){
  try{
    const raw=(storage??globalThis.localStorage).getItem(META_KEY);
    const parsed=raw?JSON.parse(raw):null;
    return parsed&&typeof parsed==='object'?parsed:{};
  }catch{return {};}
}

function writeMetaMap(map,storage){
  try{(storage??globalThis.localStorage).setItem(META_KEY,JSON.stringify(map));}catch{}
}

function summarizeSnapshot(data,slotId,customLabel=''){
  if(!data||data.options?.multiplayer)return null;
  const p=data.players?.[0]||{};
  const mode=data.options?.mode||'skirmish';
  const modeDef=MODES.find(m=>m.id===mode)||MISSIONS.find(m=>m.id===mode);
  const faction=p.faction||data.options?.faction||'alder';
  const map=data.options?.map||'highlands';
  const age=Math.max(0,Math.min(3,p.age||0));
  return {
    slotId,
    label:customLabel||slotSpec(slotId).label,
    mode,
    modeName:modeDef?.name||'Skirmish',
    chapter:modeDef?.chapter||null,
    faction,
    factionName:FACTIONS[faction]?.name||'The Alder Kingdom',
    map,
    mapName:MAPS[map]?.name||'Emerald Highlands',
    age,
    ageName:AGES[age]||AGES[0],
    time:Number.isFinite(data.time)?data.time:0,
    savedAt:Date.now(),
  };
}

// A room snapshot contains only one commander's visible state. Its provenance
// survives disconnect/leave; connection activity alone cannot make it local.
export function readLocalSave(storage){
  return readSaveSlot('auto',storage);
}

export function writeLocalSave(sim,{storage,networkActive=false}={}){
  return writeSaveSlot('auto',sim,{storage,networkActive});
}

export function readSaveSlot(slotId='auto',storage){
  try{
    const spec=slotSpec(slotId);
    const data=JSON.parse((storage??globalThis.localStorage).getItem(spec.key));
    return data&&!data.options?.multiplayer?data:null;
  }catch{return null;}
}

export function writeSaveSlot(slotId='auto',sim,{label='',storage,networkActive=false}={}){
  if(networkActive||sim?.options?.multiplayer)return 'network';
  if(!sim)return 'unavailable';
  const spec=slotSpec(slotId);
  try{
    const serialized=sim.serialize();
    const store=storage??globalThis.localStorage;
    store.setItem(spec.key,JSON.stringify(serialized));
    const meta=readMetaMap(store);
    meta[spec.id]=summarizeSnapshot(serialized,spec.id,label);
    writeMetaMap(meta,store);
    return 'saved';
  }catch{return 'storage';}
}

export function deleteSaveSlot(slotId,storage){
  const spec=slotSpec(slotId);
  try{
    const store=storage??globalThis.localStorage;
    store.removeItem(spec.key);
    const meta=readMetaMap(store);
    delete meta[spec.id];
    writeMetaMap(meta,store);
    return true;
  }catch{return false;}
}

export function listSaveSlots(storage){
  const store=storage??globalThis.localStorage;
  const meta=readMetaMap(store);
  return SAVE_SLOTS.map(spec=>{
    let info=meta[spec.id]||null;
    const exists=Boolean((()=>{try{return store.getItem(spec.key);}catch{return null;}})());
    if(exists&&!info){
      // Backfill summary once for saves written before metadata indexing
      const snap=readSaveSlot(spec.id,store);
      if(snap){
        info=summarizeSnapshot(snap,spec.id,spec.label);
        meta[spec.id]=info;
        writeMetaMap(meta,store);
      }
    }
    if(!exists)return {slotId:spec.id,label:spec.label,exists:false};
    return {slotId:spec.id,label:info?.label||spec.label,exists:true,...info};
  });
}

export function latestSaveSummary(storage){
  const slots=listSaveSlots(storage).filter(s=>s.exists);
  if(!slots.length)return null;
  slots.sort((a,b)=>(b.savedAt||0)-(a.savedAt||0));
  return slots[0];
}
