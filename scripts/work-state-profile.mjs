import fs from 'node:fs';
import {performance} from 'node:perf_hooks';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {UnitActions} from '../src/unit-actions.js';

const units=Array.from({length:1280},(_,i)=>({id:i+1,type:['archer','knight','spearman','swordsman'][i%4],kind:'unit',hp:100,moving:true})),view={clock:1,sim:{time:1,get:()=>null}},times=[];let retained;
if(process.env.WORK_STATE_BASELINE){
  const {UnitActions:Before}=await import(pathToFileURL(path.resolve(process.env.WORK_STATE_BASELINE)).href),samples={before:[],after:[]},states={};
  const run=(Type,key)=>{const actions=new Type(),start=performance.now();for(let frame=0;frame<600;frame++)for(const unit of units)actions.update(view,unit,1/60);states[key]=actions.states.size;return performance.now()-start;};
  for(let warm=0;warm<2;warm++){run(Before,'before');run(UnitActions,'after');}
  for(let round=0;round<8;round++)for(const [key,Type]of round%2?[['after',UnitActions],['before',Before]]:[['before',Before],['after',UnitActions]])samples[key].push(run(Type,key));
  const summarize=key=>{const values=samples[key].slice().sort((a,b)=>a-b);return {medianMilliseconds:(values[3]+values[4])/2,retainedActionStates:states[key],runs:samples[key]};},report={updatesPerRun:units.length*600,units:units.length,frames:600,alternatingOrder:true,before:summarize('before'),after:summarize('after'),scope:'Isolated action-state update cost; not game FPS'},file=process.argv[2]||'artifacts/work-state-profile.json';
  fs.writeFileSync(file,JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({file,...report}));process.exit(0);
}
for(let run=0;run<7;run++){const actions=new UnitActions(),start=performance.now();for(let frame=0;frame<600;frame++)for(const unit of units)actions.update(view,unit,1/60);times.push(performance.now()-start);retained=actions.states.size;}
times.sort((a,b)=>a-b);const report={updatesPerRun:units.length*600,units:units.length,frames:600,medianMilliseconds:times[3],retainedActionStates:retained,scope:'Isolated action-state update cost; not game FPS'},file=process.argv[2]||'artifacts/work-state-profile.json';fs.writeFileSync(file,JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({file,...report}));
