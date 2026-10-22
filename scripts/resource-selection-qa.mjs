import fs from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
const root=path.resolve(process.env.RESOURCE_SOURCE_ROOT||'src'),{Simulation}=await import(pathToFileURL(path.join(root,'simulation.js'))),{battlePreset}=await import(pathToFileURL(path.join(root,'custom-battle.js')));
const ticks=Number(process.env.RESOURCE_TICKS)||200,output=process.env.QA_OUTPUT||'artifacts/resource-selection.json',reference=process.env.RESOURCE_REFERENCE?JSON.parse(fs.readFileSync(process.env.RESOURCE_REFERENCE,'utf8')):null;
const hash=value=>crypto.createHash('sha256').update(value).digest('hex'),stats=values=>{const sorted=values.toSorted((a,b)=>a-b);return {samples:sorted.length,total:sorted.reduce((a,b)=>a+b,0),median:sorted[Math.floor(sorted.length*.5)]||0,p95:sorted[Math.floor(sorted.length*.95)]||0,max:sorted.at(-1)||0};};
const fixtures=['early','crowded','late'].map(stage=>({name:stage,file:'.tools/battle-stages/'+stage+'.json'}));
fixtures.push({name:'coastal-allies',map:'coast',seed:512},{name:'coastal-rivals',map:'coast',seed:2241,preset:'ffa8'},{name:'classic-rivals',map:'highlands',seed:746,classic:true});
const report={createdAt:new Date().toISOString(),node:process.version,harnessSHA256:hash(fs.readFileSync(new URL(import.meta.url))),ticksRequested:ticks,reference:process.env.RESOURCE_REFERENCE||null,sourceSHA256:Object.fromEntries(['commander-ai.js','ai-settlements.js','closest-candidates.js','simulation.js'].map(file=>[file,fs.existsSync(path.join(root,file))?hash(fs.readFileSync(path.join(root,file))):null])),cases:[]};
try{
 for(const item of fixtures){
  let sim,fixtureSHA256;if(item.file){const text=fs.readFileSync(item.file,'utf8');fixtureSHA256=hash(text);sim=Simulation.restore(JSON.parse(text));}
  else{const slots=battlePreset(item.preset||'4v4');for(const slot of slots)slot.difficulty='hard';sim=new Simulation({mode:item.classic?'skirmish':'custom',map:item.map,mapSize:'huge',seed:item.seed,slots,difficulty:'hard',populationLimit:160});sim.players[0].controller=item.classic?'human':'ai';}
  const before=sim.assignWorker,workerTimes=[],tickTimes=[],checkpoints=[],digest=crypto.createHash('sha256');let workerCalls=0;
  sim.assignWorker=function(...args){const start=performance.now();try{return before.apply(this,args);}finally{workerCalls++;workerTimes.push(performance.now()-start);}};
  for(let i=0;i<ticks&&!sim.ended;i++){
   const start=performance.now();sim.tick(.1);tickTimes.push(performance.now()-start);
   const snapshot=JSON.stringify({state:sim.serialize(),events:sim.events});digest.update(snapshot);
   if((i+1)%20===0)checkpoints.push({tick:i+1,sha256:hash(snapshot)});
  }
  const result={name:item.name,fixtureSHA256,seed:sim.options.seed,map:sim.options.map,players:sim.players.length,ticks:tickTimes.length,seconds:sim.time,digest:digest.digest('hex'),checkpoints,workerCalls,tickMilliseconds:stats(tickTimes),workerMilliseconds:stats(workerTimes),livingUnits:sim.entities.filter(e=>e.kind==='unit'&&e.hp>0).length,ended:sim.ended};report.cases.push(result);
  if(reference){const old=reference.cases.find(previous=>previous.name===result.name);assert.ok(old);for(const key of ['fixtureSHA256','ticks','seconds','digest','checkpoints','workerCalls','livingUnits','ended'])assert.deepEqual(result[key],old[key],item.name+' differs: '+key);result.identicalReplay=true;}
  console.log(JSON.stringify({case:item.name,ticks:result.ticks,workerCalls,workerMilliseconds:result.workerMilliseconds.total,totalMilliseconds:result.tickMilliseconds.total,identicalReplay:result.identicalReplay}));
 }
 report.passed=true;
}catch(error){report.failure=error.stack;throw error;}
finally{fs.mkdirSync(path.dirname(output),{recursive:true});fs.writeFileSync(output,JSON.stringify(report,null,2)+'\n');}
