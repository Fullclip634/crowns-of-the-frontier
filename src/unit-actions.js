import {workerVisualTask} from './authored-assets.js';
import {workingTarget,foodWorkStyle} from './work-activity.js';
import {baseActionJointRotation} from './action-poses.js';
import {workJointRotation} from './work-pose.js';

const periods={wood:1.15,mine:1.35,build:.78,food:1.7,heal:1.8,carry:2.4};
export function workTarget(view,e){
  return workingTarget(view.sim,e);
}

export class UnitActions{
  constructor(){this.states=new Map();}
  clear(){this.states.clear();}
  get(id){return this.states.get(id);}
  update(view,e,dt){
    // Soldiers use combat poses and locomotion directly. Avoid retaining and
    // updating a work-state object for every soldier in a large battlefield.
    if(e.type!=='villager'&&e.type!=='monk'){this.states.delete(e.id);return null;}
    let state=this.states.get(e.id);if(!state){state={task:null,style:null,blend:0,phase:0,active:false,grip:false};this.states.set(e.id,state);}
    const observed=!e.order&&['gather','build','repair'].includes(e.activity)&&e.working===true&&!e.moving&&!e.embarked&&e.hp>0&&!(e.cooldown>0);
    const target=observed?null:workTarget(view,e),working=observed||!!target,healing=e.type==='monk'&&!e.moving&&!e.embarked&&e.hp>0&&e.cooldown>0;
    const carrying=e.type==='villager'&&e.carry>2&&!working&&(e.order?.returning||e.moving);
    const task=working?workerVisualTask(view,e):healing?'heal':carrying?'carry':null;
    const style=task==='food'?(observed?e.workStyle==='forage'?'forage':'harvest':foodWorkStyle(target)||'harvest'):null;
    if(task&&(task!==state.task||style!==state.style)){state.task=task;state.style=style;state.blend=0;}
    const active=!!task,t=Math.max(0,dt),weight=1-Math.exp(-t*16);state.blend+=(Number(active)-state.blend)*weight;state.active=active;
    const clock=working&&(e.order?.type||e.activity)==='gather'&&Number.isFinite(e.work)?e.work:(view.sim?.time??view.clock??0);
    const offset=Math.max(0,Math.min(.2,(view.combatTime??view.sim?.time??0)-(view.sim?.time??0)));
    if(active)state.phase=((clock+offset)/(style==='forage'?1.85:periods[task]||1)+e.id*.173)%1;
    if(!active&&state.blend<.0001){state.blend=0;state.task=null;state.style=null;}
    return state;
  }
  prune(sim){for(const id of this.states.keys())if(!sim.get(id))this.states.delete(id);}
}

export function actionJointRotation(state,joint,output){
  if(!baseActionJointRotation(state,joint,output))return false;
  workJointRotation(state,joint,output);return true;
}
