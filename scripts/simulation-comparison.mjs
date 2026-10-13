import fs from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
import {Simulation} from '../src/simulation.js';

// Extract only the preceding release's src/*.js into artifacts/perf-baseline.
// Alternate runs in one process; neither simulation overlaps a browser job.
const baseline=process.env.BASELINE_SIMULATION||'artifacts/perf-baseline/src/simulation.js';
const {Simulation:Before}=await import(pathToFileURL(path.resolve(baseline)));
const fixture=fs.readFileSync(process.env.PROFILE_SAVE||'artifacts/blender-custom-battle-save.json','utf8');
const ticks=Number(process.env.PROFILE_TICKS)||200,rounds=Number(process.env.PROFILE_ROUNDS)||6;
const samples={before:[],after:[]};
function run(Type){
  const sim=Type.restore(JSON.parse(fixture)),times=[];let predicates=0;
  const nearest=sim.nearest;sim.nearest=function(e,predicate,...args){return nearest.call(this,e,t=>{predicates++;return predicate(t);},...args);};
  for(let i=0;i<ticks&&!sim.ended;i++){const at=performance.now();sim.tick(.1);times.push(performance.now()-at);}
  return {times,predicates,state:createHash('sha256').update(JSON.stringify(sim.serialize())).digest('hex'),ended:sim.ended,time:sim.time};
}
for(let warm=0;warm<2;warm++){run(Before);run(Simulation);}
for(let round=0;round<rounds;round++){
  const order=round%2?[['after',Simulation],['before',Before]]:[['before',Before],['after',Simulation]];
  const result={};for(const [key,Type]of order){result[key]=run(Type);samples[key].push(result[key]);}
  assert.equal(result.after.state,result.before.state,'the optimization must preserve deterministic battle state');
}
const summarize=runs=>{const times=runs.flatMap(run=>run.times).sort((a,b)=>a-b),totals=runs.map(run=>run.times.reduce((a,b)=>a+b,0));return {runs:runs.length,ticks:times.length,medianTickMilliseconds:times[Math.floor(times.length*.5)],p95TickMilliseconds:times[Math.floor(times.length*.95)],totalMillisecondsByRun:totals,predicateCallsPerRun:runs.map(run=>run.predicates),state:runs[0].state};};
const result={cpuOnly:true,renderedFPS:false,fixture:process.env.PROFILE_SAVE||'artifacts/blender-custom-battle-save.json',baseline,alternatingOrder:true,deterministicStateMatches:true,before:summarize(samples.before),after:summarize(samples.after)};
fs.writeFileSync('artifacts/simulation-comparison.json',JSON.stringify(result,null,2));console.log(JSON.stringify(result,null,2));
