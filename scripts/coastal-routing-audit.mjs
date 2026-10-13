import fs from 'node:fs';
import {Simulation} from '../src/simulation.js';
import {battlePreset} from '../src/custom-battle.js';
import {UNITS} from '../src/data.js';

const slots=battlePreset('4v4');for(const slot of slots)slot.difficulty='hard';
const sim=process.env.AUDIT_SAVE?Simulation.restore(JSON.parse(fs.readFileSync(process.env.AUDIT_SAVE,'utf8'))):new Simulation({mode:'custom',map:'coast',mapSize:'huge',seed:512,slots,resourceLevel:'standard',populationLimit:80});
sim.players[0].controller='ai'; // Only the offline diagnostic controls this slot.
const phase=process.argv[2]||'baseline',seconds=Number(process.env.AUDIT_SECONDS)||1400,start=sim.time,report={phase,map:'coast',seed:sim.options.seed,start,counts:{},examples:{},support:0,landings:0,blocked:0,passed:false};
const original=sim.blockedMovement;
sim.blockedMovement=function(entity,dt){
  if((entity.stuckTime||0)+dt>=6){
    const order=entity.order,target=this.get(order?.target),naval=!!UNITS[entity.type].naval,drop=order?.type==='gather'&&order.returning?this.nearestDrop(entity,entity.carryType||entity.gatherType,naval):null,destination=drop||target||order;
    if(destination&&Number.isFinite(destination.x)&&Number.isFinite(destination.z)){
      const oldStatus=entity.pathStatus,route=this.pathTo(entity,destination),freshStatus=entity.pathStatus;entity.pathStatus=oldStatus;
      const key=`${entity.type}/${order?.type}/${freshStatus}`,cell=this.cell(destination.x,destination.z),grid=this.grid(entity.owner,naval);
      report.counts[key]=(report.counts[key]||0)+1;report.examples[key]??=[];
      if(report.examples[key].length<8){
        const record={time:this.time,id:entity.id,owner:entity.owner,type:entity.type,position:{x:entity.x,z:entity.z},order:{...order},destination:{x:destination.x,z:destination.z},target:target&&{id:target.id,type:target.type,kind:target.kind,owner:target.owner,r:target.r},distance:Math.hypot(entity.x-destination.x,entity.z-destination.z),freshStatus,destinationBlocked:!!grid[cell.z*this.gridSize+cell.x],routeLength:route.length,routeEnd:route.at(-1),pathEnd:entity.path.at(-1),carry:entity.carry,carryType:entity.carryType};
        report.examples[key].push(record);
        if(!report.firstSave){report.firstSave='artifacts/coastal-routing-first-stall.json';fs.writeFileSync(report.firstSave,JSON.stringify(this.serialize()));}
      }
    }
  }
  return original.call(this,entity,dt);
};
sim.on(event=>{if(event.type==='order-blocked')report.blocked++;if(event.type==='ally-support')report.support++;if(event.type==='unload')report.landings++;});
let checkpoint=sim.time;
while(sim.time-start<seconds&&!sim.ended){
  sim.tick(.1);
  if(sim.time-checkpoint>=120){checkpoint=sim.time;console.log(JSON.stringify({time:Math.round(sim.time),blocked:report.blocked,landings:report.landings,defeated:sim.players.filter(player=>player.defeated).length}));}
}
report.end=sim.time;report.result=sim.ended;report.passed=sim.entities.every(entity=>Number.isFinite(entity.x)&&Number.isFinite(entity.z)&&Number.isFinite(entity.hp))&&sim.players.every(player=>Object.values(player.resources).every(amount=>Number.isFinite(amount)&&amount>=0));
fs.writeFileSync(`artifacts/coastal-routing-${phase}.json`,JSON.stringify(report,null,2));console.log(JSON.stringify({phase,start:report.start,end:report.end,result:report.result,blocked:report.blocked,support:report.support,landings:report.landings,counts:report.counts,passed:report.passed},null,2));
if(!report.passed)process.exitCode=1;
