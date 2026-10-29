import {garrisonCount} from '../src/garrison.js';
import {workingTarget,foodWorkStyle} from '../src/work-activity.js';
const privateFields=new Set(['order','orders','path','rally','shelterWork','queue','workStyle','landing','loadingSince']);

// Rendered opponents need appearance/activity, not their future route, AI job,
// passenger IDs or orders. Own entities retain their command data.
export function entityPerspective(sim,side,entity){
 if(entity.owner<0||entity.owner===side)return {...entity,path:[],orders:[]};
 const object={};
 for(const key of Object.keys(entity)){
  if(privateFields.has(key)||key==='garrison'&&entity.garrison||key==='passengers'&&entity.passengers||key.startsWith('navy')||/^ai[A-Z]/.test(key)||key.startsWith('path'))continue;
  object[key]=entity[key];
 }
 object.path=[];object.orders=[];object.queue=[];
 if(entity.kind==='unit'&&['gather','build','repair'].includes(entity.order?.type)){const target=workingTarget(sim,entity);object.activity=entity.order.type;object.working=!!target;const style=entity.order.type==='gather'?foodWorkStyle(target):null;if(style)object.workStyle=style;}
 if(entity.garrison)object.garrisonCount=garrisonCount(sim,entity);
 if(entity.passengers)object.passengerCount=entity.passengers.length;
 return object;
}
