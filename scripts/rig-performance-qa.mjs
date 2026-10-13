import {chromium} from '@playwright/test';
import fs from 'node:fs';
import assert from 'node:assert/strict';

const save=JSON.parse(fs.readFileSync('artifacts/blender-custom-battle-save.json','utf8'));
const browser=await chromium.launch({channel:'msedge',headless:true,args:['--enable-webgl','--ignore-gpu-blocklist']});
const report={profile:'Frozen crowded battle, alternating render paths, development laptop',headless:true,physicalPhone:false,errors:[],samples:[],passed:false};
try{
  const page=await browser.newPage({viewport:{width:1280,height:720}});page.setDefaultTimeout(90000);
  page.on('pageerror',error=>report.errors.push(error.message));page.on('console',message=>{if(message.type()==='error')report.errors.push(message.text());});
  await page.addInitScript(()=>localStorage.setItem('crowns-settings',JSON.stringify({quality:'low',frameRate:'60',autoQuality:false,volume:0,music:false,weather:'clear'})));
  await page.goto(process.env.QA_URL||'http://localhost:4174/',{waitUntil:'domcontentloaded'});await page.waitForFunction(()=>window.frontier?.view);
  report.samples=await page.evaluate(async save=>{
    frontier.start(save.options,save);frontier.action('pause');document.querySelector('#modal-root').style.visibility='hidden';
    const v=frontier.view,s=frontier.sim,render=v.render,time=s.time;
    const army=s.owned(0,'unit').filter(entity=>entity.type!=='villager'),focus=army.find(entity=>entity.order?.type==='attack')||army[0],point={x:focus?.x||0,z:focus?.z||0};
    // Pause simulation and suppress the application's throttled pause render.
    // A separate RAF measures both paths at the same display cadence.
    v.render=()=>{};
    const run=duration=>new Promise(resolve=>{
      const times=[],start=performance.now();let last=start,frames=0;
      const frame=now=>{
        if(now-start>=duration&&frames){const elapsed=now-start;times.sort((a,b)=>a-b);resolve({frames,elapsed,renderedFPS:frames*1000/elapsed,submit:{median:times[Math.floor(times.length*.5)],p95:times[Math.floor(times.length*.95)],max:times.at(-1)},draws:v.renderer.info.render.calls,triangles:v.renderer.info.render.triangles,units:{...v.unitRenderDiagnostics},memory:{...v.renderer.info.memory}});return;}
        const before=performance.now();render.call(v,Math.min(.2,(now-last)/1000),false);times.push(performance.now()-before);last=now;frames++;requestAnimationFrame(frame);
      };requestAnimationFrame(frame);
    });
    const samples=[];
    try{for(const rigid of [false,true,true,false]){
      v.settings.rigidUnits=rigid;v.attach(s);v.clock=25;v.zoom=65;v.angle=Math.PI/4;v.focus(point.x,point.z);await run(1000);
      samples.push({rigid,...await run(3000),models:v.artDiagnostics.models,simulationTime:s.time,unitsAlive:s.entities.filter(entity=>entity.kind==='unit'&&entity.hp>0).length});
    }}finally{v.render=render;}
    if(s.time!==time)throw new Error('The controlled renderer comparison must not advance the battle.');return samples;
  },save);
  for(const sample of report.samples){assert.equal(sample.models,126);assert.equal(sample.unitsAlive,report.samples[0].unitsAlive);assert.equal(sample.triangles,report.samples[0].triangles);assert.ok(sample.frames>0);}
  const legacy=report.samples.filter(sample=>!sample.rigid),rigid=report.samples.filter(sample=>sample.rigid);
  const average=(samples,field)=>samples.reduce((sum,sample)=>sum+field(sample),0)/samples.length;
  report.comparison={legacy:{fps:average(legacy,sample=>sample.renderedFPS),submitMedian:average(legacy,sample=>sample.submit.median),draws:legacy[0].draws},rigid:{fps:average(rigid,sample=>sample.renderedFPS),submitMedian:average(rigid,sample=>sample.submit.median),draws:rigid[0].draws}};
  assert.ok(report.comparison.rigid.draws<report.comparison.legacy.draws);assert.deepEqual(report.errors,[]);report.passed=true;
  console.log(JSON.stringify({passed:report.passed,comparison:report.comparison,samples:report.samples.map(sample=>({rigid:sample.rigid,fps:sample.renderedFPS,submit:sample.submit,draws:sample.draws,triangles:sample.triangles,units:sample.units,memory:sample.memory}))},null,2));
}finally{fs.writeFileSync('artifacts/rig-performance-qa.json',JSON.stringify(report,null,2));await browser.close();}
