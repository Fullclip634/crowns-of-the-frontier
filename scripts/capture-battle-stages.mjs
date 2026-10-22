import fs from 'node:fs';
import path from 'node:path';
import {Simulation} from '../src/simulation.js';
import {battlePreset} from '../src/custom-battle.js';

const directory=process.env.BENCH_STAGE_OUTPUT||'.tools/battle-stages',seed=Number(process.env.BENCH_SEED)||512;
fs.mkdirSync(directory,{recursive:true});
const slots=battlePreset('4v4');for(const slot of slots)slot.difficulty='hard';
const sim=new Simulation({mode:'custom',map:process.env.BENCH_MAP||'highlands',mapSize:'huge',seed,slots,resourceLevel:'standard',populationLimit:160});
// Only this offline diagnostic controls the human slot. No economy or damage
// is synthesized; the checkpoints come from ordinary recruitment and combat.
sim.players[0].controller='ai';
const checkpoints=[120,420,720],report={seed,options:sim.options,checkpoints:[]};let next=0,lastReport=0;
while(next<checkpoints.length&&!sim.ended){
  sim.tick(.1);
  if(sim.time+1e-6>=checkpoints[next]){
    const stage=['early','crowded','late'][next],file=path.join(directory,stage+'.json');
    fs.writeFileSync(file,JSON.stringify(sim.serialize()));
    report.checkpoints.push({stage,file,seconds:sim.time,units:sim.entities.filter(e=>e.kind==='unit'&&e.hp>0).length,buildings:sim.entities.filter(e=>e.kind==='building'&&e.hp>0).length,defeated:sim.players.filter(p=>p.defeated).length});next++;
  }
  if(sim.time-lastReport>=60){lastReport=sim.time;console.log(JSON.stringify({seconds:Math.round(sim.time),units:sim.population(0),totalUnits:sim.players.reduce((n,_,owner)=>n+sim.population(owner),0),defeated:sim.players.filter(p=>p.defeated).length}));}
}
report.ended=sim.ended;report.complete=next===checkpoints.length;
fs.writeFileSync(path.join(directory,'stages.json'),JSON.stringify(report,null,2)+'\n');
if(!report.complete)throw Error('This seeded battle ended before all requested checkpoints; keep the partial evidence and choose another seed.');
console.log(JSON.stringify(report.checkpoints));
