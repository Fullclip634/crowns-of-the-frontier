import {normalizeBattle} from './custom-battle.js';

// The selected kingdom is not necessarily slot 1. Open a friend slot only
// when no *other* enabled kingdom already has a human controller.
export function customHostOptions(draft){
  if(draft.spectator)throw new Error('Choose a kingdom before hosting multiplayer.');
  const slots=draft.slots.map(slot=>({...slot})),ownIndex=Number(draft.playerSlot||1)-1;
  if(!slots.some((slot,index)=>index!==ownIndex&&slot.enabled!==false&&slot.controller==='human')){
    const next=slots.findIndex((slot,index)=>index!==ownIndex&&slot.enabled!==false);
    if(next<0)throw new Error('Enable another kingdom before hosting multiplayer.');
    slots[next].controller='human';
  }
  return normalizeBattle({...draft,slots,multiplayer:true});
}
