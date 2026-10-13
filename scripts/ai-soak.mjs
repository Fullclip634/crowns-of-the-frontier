import {Simulation} from '../src/simulation.js';
import {UNITS} from '../src/data.js';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const reports=[],cases=[['highlands','normal',512],['valley','hard',4302],['rivers','normal',8642],['coast','hard',4306]];
for(const [map,difficulty,seed]of cases){const s=new Simulation({map,difficulty,seed,mode:map==='coast'?'tides':'skirmish'}),times=[];let peak=0,blocked=0,landings=0;
  s.on(e=>{if(e.type==='order-blocked')blocked++;if(e.type==='unload')landings++;});
  for(let i=0;i<12000&&!s.ended;i++){const t=performance.now();s.tick(.1);times.push(performance.now()-t);peak=Math.max(peak,s.population(0)+s.population(1));
    for(const p of s.players)assert.ok(Object.values(p.resources).every(n=>Number.isFinite(n)&&n>=0));
    assert.ok(s.entities.every(e=>Number.isFinite(e.x)&&Number.isFinite(e.z)&&Number.isFinite(e.hp)));
  }
  times.sort((a,b)=>a-b);reports.push({map,difficulty,seed,simulatedSeconds:Math.round(s.time),result:s.ended,aiAge:s.players[1].age,aiWorkers:s.owned(1,'unit','villager').length,
    aiArmy:s.owned(1,'unit').filter(e=>UNITS[e.type].damage>0&&e.type!=='villager').length,aiPhase:s.commanderAI?.phase,peakPopulation:peak,blockedOrders:blocked,landings,
    simulationTickP95ms:Number(times[Math.floor(times.length*.95)].toFixed(3)),simulationTickMaxMs:Number(times.at(-1).toFixed(3))});
  console.log(JSON.stringify(reports.at(-1)));
}
fs.mkdirSync('artifacts',{recursive:true});fs.writeFileSync('artifacts/ai-soak.json',JSON.stringify({note:'Passive-player simulation checks; CPU timings are not rendering FPS or real-device benchmarks.',reports},null,2));
