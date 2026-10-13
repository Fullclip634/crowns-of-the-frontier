import {UNITS} from './data.js';

// Keep rendering poses outside the authoritative simulation/save data. The
// fixed 10 Hz simulation can then move smoothly between ticks at any frame rate.
export class LocalMotion{
  constructor(){this.previous=new Map();this.point={x:0,z:0};this.clear();}
  clear(){this.previous.clear();this.time=-1;this.sequence=0;}
  capture(sim){
    const sequence=++this.sequence;
    for(const e of sim.entities)if(e.kind==='unit'&&e.hp>0){
      let pose=this.previous.get(e.id);if(!pose){pose={};this.previous.set(e.id,pose);}
      pose.x=e.x;pose.z=e.z;pose.sequence=sequence;
    }
    for(const [id,pose]of this.previous)if(pose.sequence!==sequence)this.previous.delete(id);
  }
  commit(sim){this.time=sim.time;}
  sample(e,blend,time){
    const previous=this.previous.get(e.id);if(!previous||this.time!==time)return e;
    const limit=Math.max(2,(UNITS[e.type]?.speed||4)*.5),dx=e.x-previous.x,dz=e.z-previous.z;
    if(dx*dx+dz*dz>limit*limit)return e; // Spawn/unload/teleport should appear at its real destination.
    const t=Math.max(0,Math.min(1,blend));this.point.x=previous.x+dx*t;this.point.z=previous.z+dz*t;return this.point;
  }
}

export function smoothHeading(node,target,dt){
  if(!node.userData.headingReady){node.userData.headingReady=true;return target||0;}
  const previous=node.rotation.y,delta=Math.atan2(Math.sin((target||0)-previous),Math.cos((target||0)-previous));
  return previous+delta*(1-Math.exp(-Math.max(0,dt)*14));
}

// Figures, cargo and related visuals sample the same frame position. The
// authoritative simulation coordinates remain untouched.
export function renderPosition(view,entity){
  const point=view.renderPoint??={x:0,z:0};
  if(entity.snapshotAt===undefined){const local=entity.kind==='unit'?view.localMotion?.sample(entity,view.localBlend??1,view.sim.time)||entity:entity;point.x=local.x;point.z=local.z;}
  else{
    const now=view.renderFrameAt??performance.now(),t=Math.max(0,Math.min(1,(now-entity.snapshotAt)/200));
    point.x=entity.renderFromX===undefined?entity.x:entity.renderFromX+(entity.x-entity.renderFromX)*t;
    point.z=entity.renderFromZ===undefined?entity.z:entity.renderFromZ+(entity.z-entity.renderFromZ)*t;
  }
  return point;
}
