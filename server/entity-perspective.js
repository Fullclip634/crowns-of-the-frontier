import {garrisonCount} from '../src/garrison.js';

// Rendered opponents need appearance/activity, not their future route, AI job,
// passenger IDs or orders. Own entities retain their command data.
export function entityPerspective(sim,side,entity){
 const object={...entity,path:[],orders:[]};
 if(entity.owner<0||entity.owner===side)return object;
 if(entity.kind==='unit'&&['gather','build','repair'].includes(entity.order?.type))object.activity=entity.order.type;
 delete object.order;delete object.rally;delete object.shelterWork;object.queue=[];
 if(object.garrison){object.garrisonCount=garrisonCount(sim,entity);delete object.garrison;}
 if(object.passengers){object.passengerCount=object.passengers.length;delete object.passengers;}
 for(const key of Object.keys(object))if(key==='landing'||key==='loadingSince'||key.startsWith('navy')||/^ai[A-Z]/.test(key)||key.startsWith('path')&&key!=='path')delete object[key];
 return object;
}
