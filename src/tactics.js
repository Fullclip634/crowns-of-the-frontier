import {UNITS} from './data.js';
import {bridgeNavigationGrid,bridgePointClear,bridgeUnitClearance} from './bridge-navigation.js';
const clamp=(sim,n)=>Math.max(-sim.halfWorld+3,Math.min(sim.halfWorld-3,n));

// Resolve formation slots on the unit's own movement surface. This keeps edge
// slots out of foundations and water without sending land troops across a sea.
export function formationSlot(sim,unit,point,reserved=[]){
  const size=sim.gridSize,half=sim.halfWorld,naval=!!UNITS[unit.type].naval,source=sim.grid(unit.owner,naval),grid=naval?source:bridgeNavigationGrid(sim,unit,source),cell=sim.cell(point.x,point.z);
  const available=(x,z)=>(naval||bridgePointClear(sim.options?.map,x,z,bridgeUnitClearance(unit)))&&!reserved.some(other=>Math.hypot(x-other.x,z-other.z)<Math.max(1.4,(unit.r+(other.r||.65))*1.05));
  if(!grid[cell.z*size+cell.x]&&available(point.x,point.z))return {x:clamp(sim,point.x),z:clamp(sim,point.z)};
  let best=null,score=Infinity;
  for(let r=1;r<=4;r++)for(let z=Math.max(0,cell.z-r);z<=Math.min(size-1,cell.z+r);z++)for(let x=Math.max(0,cell.x-r);x<=Math.min(size-1,cell.x+r);x++){
    if(grid[z*size+x])continue;const wx=x*2-half+1,wz=z*2-half+1;if(!available(wx,wz))continue;const s=Math.hypot(wx-point.x,wz-point.z)+Math.hypot(wx-unit.x,wz-unit.z)*.03;
    if(s<score){score=s;best={x:wx,z:wz};}
  }return best||{x:clamp(sim,point.x),z:clamp(sim,point.z)};
}

export function installTactics(Simulation){
  const p=Simulation.prototype;
  p.patrol=function(ids,x,z,append=false,owner=0){
    if(!Number.isFinite(x)||!Number.isFinite(z))return false;
    const units=ids.map(id=>this.get(id)).filter(e=>e?.owner===owner&&e.kind==='unit'&&!e.embarked&&!['worker','fisher'].includes(UNITS[e.type].role));
    for(const e of units){const target=formationSlot(this,e,{x,z});this.command([e.id],{type:'patrol',...target,originX:e.x,originZ:e.z},append);}
    return units.length>0;
  };
  p.guard=function(ids,targetId,append=false,owner=0){
    const target=this.get(targetId);if(!target||!this.allied(target.owner,owner)||!['unit','building'].includes(target.kind))return false;
    const units=ids.map(id=>this.get(id)).filter(e=>e?.owner===owner&&e.kind==='unit'&&e!==target&&!e.embarked&&!['worker','fisher'].includes(UNITS[e.type].role));
    units.forEach((e,i)=>this.command([e.id],{type:'guard',target:target.id,offsetX:Math.cos(i*2.4)*(target.r+3),offsetZ:Math.sin(i*2.4)*(target.r+3)},append));
    return units.length>0;
  };
  p.setStance=function(ids,stance,owner=0){
    if(!['hold','aggressive'].includes(stance))return false;
    const units=ids.map(id=>this.get(id)).filter(e=>e?.owner===owner&&e.kind==='unit');
    for(const e of units){e.stance=stance;if(stance==='hold'){e.order=null;e.orders=[];e.path=[];e.pathStatus='idle';e.stuckTime=0;}}
    return units.length>0;
  };
}
