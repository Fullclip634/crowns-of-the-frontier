const key='crowns-save';

// A room snapshot contains only one commander's visible state. Its provenance
// survives disconnect/leave; connection activity alone cannot make it local.
export function readLocalSave(storage){
  try{const data=JSON.parse((storage??globalThis.localStorage).getItem(key));return data&&!data.options?.multiplayer?data:null;}catch{return null;}
}

export function writeLocalSave(sim,{storage,networkActive=false}={}){
  if(networkActive||sim?.options?.multiplayer)return 'network';
  if(!sim)return 'unavailable';
  try{(storage??globalThis.localStorage).setItem(key,JSON.stringify(sim.serialize()));return 'saved';}catch{return 'storage';}
}
