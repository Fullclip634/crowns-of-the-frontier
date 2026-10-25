import {UNITS} from './data.js';
export const HUMAN_STRIDE=2.05;

// Rendering-only gait history follows travelled distance, not a fixed wall clock.
// This keeps faster upgrades, slow siege and interpolated network motion coherent.
export class UnitLocomotion{
  constructor(){this.states=new Map();}
  clear(){this.states.clear();}
  get(id){return this.states.get(id);}
  update(e,x,z,dt){
    let state=this.states.get(e.id);const definition=UNITS[e.type]||{},cavalry=definition.role==='cavalry',period=cavalry?3.4:HUMAN_STRIDE;
    if(!state){state={x,z,phase:(e.id*.7)%(Math.PI*2),wheel:0,blend:0,bob:0};this.states.set(e.id,state);return state;}
    const elapsed=Math.max(0,dt),distance=Math.hypot(x-state.x,z-state.z),teleported=distance>Math.max(3,(definition.speed||4)*elapsed*4);
    state.x=x;state.z=z;
    if(!teleported){state.phase=(state.phase+distance*Math.PI*2/period)%(Math.PI*2);state.wheel=(state.wheel+distance/.5)%(Math.PI*2);}
    const moving=!teleported&&!!e.moving&&distance>.0001,blend=1-Math.exp(-elapsed*14);state.blend+=(Number(moving)-state.blend)*blend;
    if(teleported)state.blend=0;
    state.bob=definition.naval||definition.role==='siege'||e.type==='cart'?0:(1-Math.cos(state.phase*2))*(cavalry?.027:.018)*state.blend;
    return state;
  }
  prune(sim){for(const id of this.states.keys())if(!sim.get(id))this.states.delete(id);}
}
