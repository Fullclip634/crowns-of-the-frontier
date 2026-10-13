import fs from 'node:fs';
import {Simulation} from '../src/simulation.js';
import {UNITS} from '../src/data.js';

const sim=Simulation.restore(JSON.parse(fs.readFileSync(process.env.AUDIT_SAVE||'artifacts/blender-custom-battle-save.json','utf8'))),start=sim.time;
const before=sim.blockedMovement,records=[],counts={};let captured=false;
sim.blockedMovement=function(e,dt){
  if((e.stuckTime||0)+dt>=6){
    const order=e.order,target=this.get(order?.target),drop=order?.type==='gather'&&order.returning?this.nearestDrop(e,e.carryType||e.gatherType,!!UNITS[e.type].naval):null;
    const dest=drop||target||order,key=e.type+':'+order?.type;counts[key]=(counts[key]||0)+1;
    if(records.length<50&&dest&&Number.isFinite(dest.x)&&Number.isFinite(dest.z)){
      const status=e.pathStatus,route=this.pathTo(e,dest),freshStatus=e.pathStatus; e.pathStatus=status;
      records.push({time:this.time,id:e.id,owner:e.owner,type:e.type,order:{...order},position:{x:e.x,z:e.z},target:target&&{id:target.id,type:target.type,owner:target.owner,x:target.x,z:target.z,r:target.r},dest:{x:dest.x,z:dest.z},pathStatus:status,path:e.path.slice(0,5),freshStatus,routeLength:route.length,routeEnd:route.at(-1),destinationDistance:Math.hypot(e.x-dest.x,e.z-dest.z),carry:e.carry,carryType:e.carryType});
      if(!captured){fs.writeFileSync('artifacts/navigation-stall-save.json',JSON.stringify(this.serialize()));captured=true;}
    }
  }
  return before.call(this,e,dt);
};
while(sim.time-start<90&&!sim.ended)sim.tick(.1);
const result={start,end:sim.time,ended:sim.ended,counts,records};fs.writeFileSync('artifacts/navigation-audit.json',JSON.stringify(result,null,2));
console.log(JSON.stringify({start:result.start,end:result.end,counts,examples:records.slice(0,8)},null,2));
