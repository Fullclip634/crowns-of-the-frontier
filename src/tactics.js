import {UNITS} from './data.js';
import {VALID_STANCES} from './combat-targeting.js';
import {bridgeNavigationGrid,bridgePointClear,bridgeUnitClearance} from './bridge-navigation.js';
import {bridgeAt,bridgeRoadHalfWidth} from './bridge-layout.js';
import {shipClearance,navalPairClearance} from './naval-spacing.js';
const clamp=(sim,n)=>Math.max(-sim.halfWorld+3,Math.min(sim.halfWorld-3,n));

// Resolve formation slots on the unit's own movement surface. This keeps edge
// slots out of foundations and water without sending land troops across a sea.
export function formationSlot(sim,unit,desired,reserved=[]){
  const point={x:clamp(sim,desired.x),z:clamp(sim,desired.z)},size=sim.gridSize,half=sim.halfWorld,limit=half-3,naval=!!UNITS[unit.type].naval;
  const source=sim.grid(unit.owner,naval),grid=naval?source:bridgeNavigationGrid(sim,unit,source),cell=sim.cell(point.x,point.z);
  const map=sim.options?.map,radius=bridgeUnitClearance(unit);
  const available=(x,z)=>Math.abs(x)<=limit&&Math.abs(z)<=limit&&sim.isWater(x,z)===naval&&(naval||bridgePointClear(map,x,z,radius))&&!reserved.some(other=>{
    const dx=x-other.x,dz=z-other.z,gap=naval?Math.max(1.4,navalPairClearance(unit,other)*1.02):Math.max(1.4,(unit.r+(other.r||.65))*1.05);
    return dx*dx+dz*dz<gap*gap;
  });
  if(!grid[cell.z*size+cell.x]&&available(point.x,point.z))return point;
  let best=null,score=Infinity;
  const maxRing=naval?10:4;
  for(let r=1;r<=maxRing;r++){
    for(let z=Math.max(0,cell.z-r);z<=Math.min(size-1,cell.z+r);z++)for(let x=Math.max(0,cell.x-r);x<=Math.min(size-1,cell.x+r);x++){
      if((r>1&&Math.abs(x-cell.x)<r&&Math.abs(z-cell.z)<r)||grid[z*size+x])continue;
      const wx=x*2-half+1,wz=z*2-half+1;if(!available(wx,wz))continue;const s=Math.hypot(wx-point.x,wz-point.z)+Math.hypot(wx-unit.x,wz-unit.z)*.03;
      if(s<score){score=s;best={x:wx,z:wz};}
    }
    if(best&&r>=4)break;
  }return best||point;
}

function formationOrigin(unit,append){
  if(append){
    for(let i=unit.orders.length-1;i>=0;i--){
      const order=unit.orders[i];
      if(Number.isFinite(order.x)&&Number.isFinite(order.z))return order;
    }
    if(Number.isFinite(unit.order?.x)&&Number.isFinite(unit.order?.z))return unit.order;
  }
  return unit;
}

function formationSlots(sim,units,order,append){
  const formation=sim.players[units[0].owner].formation;
  let width=formation==='line'?Math.min(12,units.length):formation==='column'?2:Math.ceil(Math.sqrt(units.length));
  const navalGroup=!!UNITS[units[0].type].naval;
  const bridge=!navalGroup&&bridgeAt(sim.options.map,order.x,order.z);
  let centerX=0,centerZ=0,largestRadius=0,clearance=0;
  const origins=units.map(unit=>{
    const origin=formationOrigin(unit,append);
    centerX+=origin.x;centerZ+=origin.z;largestRadius=Math.max(largestRadius,navalGroup?shipClearance(unit):unit.r);
    if(bridge)clearance=Math.max(clearance,bridgeUnitClearance(unit));
    return origin;
  });
  const dx=order.x-centerX/units.length,dz=order.z-centerZ/units.length,length=Math.hypot(dx,dz);
  const forwardX=bridge?(dx<0?-1:1):length>.001?dx/length:0,forwardZ=bridge?0:length>.001?dz/length:1;
  const spacing=navalGroup?Math.max(2.2,largestRadius*2+.35):Math.max(2.2,largestRadius*2+.55),front=[],rear=[];
  const bridgeWidth=bridge?bridgeRoadHalfWidth-clearance-.3:0;
  if(bridge)width=Math.min(width,Math.floor(bridgeWidth*2/spacing)+1);
  units.forEach((unit,i)=>{
    const {x,z}=origins[i],def=UNITS[unit.type],position={unit,depth:x*forwardX+z*forwardZ,side:x*forwardZ-z*forwardX};
    const support=order.type==='attackmove'&&(unit.type==='king'||!def.damage||(!def.naval&&def.range>5));
    (support?rear:front).push(position);
  });

  const rows=[];
  for(const rank of [front,rear]){
    rank.sort((a,b)=>b.depth-a.depth||a.side-b.side||a.unit.id-b.unit.id);
    for(let i=0;i<rank.length;i+=width)rows.push(rank.slice(i,i+width).sort((a,b)=>a.side-b.side||a.unit.id-b.unit.id));
  }
  const seats=[];
  for(let row=0;row<rows.length;row++){
    const depth=((rows.length-1)/2-row)*spacing;
    rows[row].forEach(({unit},i)=>{
      const side=(i-(rows[row].length-1)/2)*spacing;
      seats.push({unit,x:depth*forwardX+side*forwardZ,z:depth*forwardZ-side*forwardX});
    });
  }
  // Slide the formation inward as a block near an edge. Clipping each slot
  // independently would collapse outer ranks onto the same point.
  function fit(axis){
    const limit=bridge&&axis==='z'?bridgeWidth:sim.halfWorld-3;
    const offsets=seats.map(seat=>seat[axis]),min=-limit-Math.min(...offsets),max=limit-Math.max(...offsets);
    return min<=max?Math.max(min,Math.min(max,order[axis])):clamp(sim,order[axis]);
  }
  const x=fit('x'),z=fit('z');
  return seats.map(seat=>({unit:seat.unit,x:x+seat.x,z:z+seat.z}));
}

export function formationDestinations(sim,units,order,append){
  const groups=new Map(),destinations=new Map();
  for(const unit of units){
    if(append&&unit.order&&unit.orders.length>=32)continue;
    const key=unit.owner+':'+!!UNITS[unit.type].naval;
    if(!groups.has(key))groups.set(key,[]);
    groups.get(key).push(unit);
  }
  for(const group of groups.values()){
    const reserved=[],seats=group.length>1?formationSlots(sim,group,order,append):[{unit:group[0],x:order.x,z:order.z}];
    for(const {unit,x,z} of seats){
      const slot=formationSlot(sim,unit,{x,z},reserved);
      reserved.push({...slot,type:unit.type,r:unit.r});
      destinations.set(unit,group.length>1?{...slot,formation:true}:slot);
    }
  }
  return destinations;
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
    if(!VALID_STANCES.includes(stance))return false;
    const units=ids.map(id=>this.get(id)).filter(e=>e?.owner===owner&&e.kind==='unit');
    for(const e of units){
      e.stance=stance;
      delete e.helpTargetId;delete e.helpUntil;
      if(stance==='hold'){
        e.order=null;e.orders=[];e.path=[];e.pathStatus='idle';e.stuckTime=0;
        delete e.guardX;delete e.guardZ;
      }else if(stance==='defensive'){
        if(e.order&&['move','attackmove'].includes(e.order.type)&&Number.isFinite(e.order.x)&&Number.isFinite(e.order.z)){
          e.guardX=e.order.x;e.guardZ=e.order.z;
        }else{
          e.guardX=e.x;e.guardZ=e.z;
          if(e.order?.type==='attack'){e.order=null;e.path=[];e.pathStatus='idle';e.stuckTime=0;}
        }
      }else{
        delete e.guardX;delete e.guardZ;
      }
    }
    return units.length>0;
  };
}
