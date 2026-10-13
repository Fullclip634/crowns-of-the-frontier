import fs from 'node:fs';
import {Simulation} from '../src/simulation.js';
import {battlePreset} from '../src/custom-battle.js';
const slots=battlePreset('4v4');for(const slot of slots)slot.difficulty='hard';
const sim=process.env.BENCH_RESUME?Simulation.restore(JSON.parse(fs.readFileSync(process.env.BENCH_RESUME,'utf8'))):new Simulation({mode:'custom',map:process.env.BENCH_MAP||'highlands',mapSize:'huge',seed:512,slots,resourceLevel:'standard',populationLimit:80});
// An AI controls the human slot only in this offline diagnostic, making it possible
// to observe a complete economy-to-siege match without synthetic damage or income.
sim.players[0].controller='ai';const seconds=Number(process.env.BENCH_SECONDS)||1200,samples=[],start=performance.now(),blocked={};let lastReport=0;
const support=[];sim.on(event=>{if(event.type==='order-blocked')blocked[event.entity.owner]=(blocked[event.entity.owner]||0)+1;if(event.type==='ally-support')support.push({time:sim.time,owner:event.owner,ally:event.ally,count:event.count});});
const summary=()=>sim.players.map((p,owner)=>({owner,age:p.age,defeated:p.defeated,units:sim.population(owner),buildings:sim.owned(owner,'building').length,resources:Object.fromEntries(Object.entries(p.resources).map(([key,value])=>[key,Math.round(value)])),phase:sim.aiStates[owner]?.phase,stats:p.battleStats}));
while(sim.time<seconds&&!sim.ended){const before=performance.now();sim.tick(.1);samples.push(performance.now()-before);if(sim.time-lastReport>=60){lastReport=sim.time;console.log(JSON.stringify({time:Math.round(sim.time),elapsed:Math.round((performance.now()-start)/1000),ages:sim.players.map(p=>p.age),units:sim.players.map((p,i)=>sim.population(i)),dead:sim.players.filter(p=>p.defeated).length}));if(process.env.BENCH_SAVE)fs.writeFileSync(process.env.BENCH_SAVE,JSON.stringify(sim.serialize()));}}
samples.sort((a,b)=>a-b);const at=percent=>samples[Math.min(samples.length-1,Math.floor(samples.length*percent))];
const result={seed:512,map:sim.options.map,aiPace:sim.options.aiPace,simulatedSeconds:sim.time,ended:sim.ended,elapsedSeconds:(performance.now()-start)/1000,tickMilliseconds:{median:at(.5),p95:at(.95),p99:at(.99),max:samples.at(-1)},firstOffensives:sim.players.map((p,owner)=>({owner,land:sim.aiStates[owner]?.firstAttackAt,naval:sim.aiStates[owner]?.navalFirstAttackAt})),support,blocked,kingdoms:summary()};
fs.mkdirSync('artifacts',{recursive:true});fs.writeFileSync(`artifacts/battle-benchmark-${sim.options.map}.json`,JSON.stringify(result,null,2));console.log(JSON.stringify(result,null,2));
