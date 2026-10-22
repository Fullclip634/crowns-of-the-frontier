import {workerVisualTask} from './authored-assets.js';
import {workingTarget} from './work-activity.js';

const clamp=value=>Math.max(0,Math.min(1,value)),smooth=value=>{const t=clamp(value);return t*t*(3-2*t);};
const periods={wood:1.15,mine:1.35,build:.78,food:1.7,heal:1.8,carry:2.4};
// Slow preparation, a brief contact and a controlled return. Unlike a sine
// wave, the tool spends a distinct part of the cycle striking the surface.
const strokes={
  wood:[[0,-1.35,-.55,1.05,.07],[.40,-1.70,-.75,1.10,.03],[.55,-.82,-.22,2.45,.22],[.69,-.55,-.12,2.20,.24],[1,-1.35,-.55,1.05,.07]],
  mine:[[0,-1.30,-.55,1.18,.16],[.44,-1.75,-.85,1.35,.08],[.59,-.55,-.15,2.75,.38],[.72,-.38,-.10,2.50,.40],[1,-1.30,-.55,1.18,.16]],
  build:[[0,-.88,-.45,1.30,.08],[.40,-1.12,-.65,1.30,.05],[.58,-.68,-.12,2.20,.16],[.70,-.58,-.08,2.05,.17],[1,-.88,-.45,1.30,.08]],
  food:[[0,-.60,-.35,1.15,.34],[.38,-.83,-.48,1.35,.45],[.65,-.55,-.24,1.85,.46],[.82,-.38,-.35,1.30,.28],[1,-.60,-.35,1.15,.34]]
};

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
    let state=this.states.get(e.id);if(!state){state={task:null,blend:0,phase:0,active:false,grip:false};this.states.set(e.id,state);}
    const observed=!e.order&&['gather','build','repair'].includes(e.activity)&&e.working===true&&!e.moving&&!e.embarked&&e.hp>0&&!(e.cooldown>0);
    const working=observed||!!workTarget(view,e),healing=e.type==='monk'&&!e.moving&&!e.embarked&&e.hp>0&&e.cooldown>0;
    const carrying=e.type==='villager'&&e.carry>2&&!working&&(e.order?.returning||e.moving);
    const task=working?workerVisualTask(view,e):healing?'heal':carrying?'carry':null;
    if(task&&task!==state.task){state.task=task;state.blend=0;}
    const active=!!task,t=Math.max(0,dt),weight=1-Math.exp(-t*16);state.blend+=(Number(active)-state.blend)*weight;state.active=active;
    const clock=working&&(e.order?.type||e.activity)==='gather'&&Number.isFinite(e.work)?e.work:(view.sim?.time??view.clock??0);
    const offset=Math.max(0,Math.min(.2,(view.combatTime??view.sim?.time??0)-(view.sim?.time??0)));
    if(active)state.phase=((clock+offset)/(periods[task]||1)+e.id*.173)%1;
    if(!active&&state.blend<.0001){state.blend=0;state.task=null;}
    return state;
  }
  prune(sim){for(const id of this.states.keys())if(!sim.get(id))this.states.delete(id);}
}

export function actionJointRotation(state,joint,output){
  if(!state?.task||state.blend<=0)return false;
  output.x=output.y=output.z=0;const weight=state.blend,side=joint.side??1;
  if(state.task==='carry'){
    if(joint.type==='arm')output.x=side>0?-.45:-.75;
    else if(joint.type==='forearm')output.x=-.60;
    else if(joint.type==='workerTool')output.x=.20;
    else if(joint.type==='torso')output.x=.045;
    else return false;
  }else if(state.task==='heal'){
    const pulse=Math.sin(state.phase*Math.PI*2);
    if(joint.type==='arm')output.x=-.85+pulse*.08;
    else if(joint.type==='forearm')output.x=-.40+pulse*.10;
    else if(joint.type==='head')output.x=.06;
    else return false;
  }else{
    const keys=strokes[state.task];if(!keys)return false;let a=keys[0],b=keys.at(-1);
    for(let i=1;i<keys.length;i++)if(state.phase<=keys[i][0]){a=keys[i-1];b=keys[i];break;}
    const t=smooth((state.phase-a[0])/(b[0]-a[0])),at=index=>a[index]+(b[index]-a[index])*t;
    if(joint.type==='arm'){output.x=side>0?at(1):state.task==='food'?-.65:-.30;output.z=side>0?-.045:.045;}
    else if(joint.type==='forearm')output.x=side>0?at(2):state.task==='food'?-.42:-.30;
    else if(joint.type==='workerTool')output.x=at(3);
    else if(joint.type==='torso'){output.x=at(4);output.y=Math.sin(state.phase*Math.PI*2)*.035;}
    else if(joint.type==='head')output.x=.07+at(4)*.15;
    else if(joint.type==='knee')output.x=(state.task==='food'?.18:state.task==='mine'?.10:.03);
    else return false;
  }
  output.x*=weight;output.y*=weight;output.z*=weight;return true;
}
