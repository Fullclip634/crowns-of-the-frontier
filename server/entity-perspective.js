import {garrisonCount} from '../src/garrison.js';
import {workingTarget,foodWorkStyle} from '../src/work-activity.js';

// Rendered opponents need appearance/activity, not their future route, AI job,
// passenger IDs or orders. Own entities retain their command data.
export function entityPerspective(sim,side,entity){
 const object={...entity,path:[],orders:[]};
 if(entity.owner<0||entity.owner===side)return object;
 delete object.workStyle;
 if(entity.kind==='unit'&&['gather','build','repair'].includes(entity.order?.type)){const target=workingTarget(sim,entity);object.activity=entity.order.type;object.working=!!target;const style=foodWorkStyle(target);if(style)object.workStyle=style;}
 delete object.order;delete object.rally;delete object.shelterWork;object.queue=[];
 if(object.garrison){object.garrisonCount=garrisonCount(sim,entity);delete object.garrison;}
 if(object.passengers){object.passengerCount=object.passengers.length;delete object.passengers;}
 for(const key of Object.keys(object))if(key==='landing'||key==='loadingSince'||key.startsWith('navy')||/^ai[A-Z]/.test(key)||key.startsWith('path')&&key!=='path')delete object[key];
 return object;
}
