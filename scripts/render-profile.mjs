import {chromium} from '@playwright/test';
import fs from 'node:fs';

const quality=process.env.BENCH_QUALITY||'low',base=process.env.QA_URL||'http://localhost:4174/';
const save=JSON.parse(fs.readFileSync(process.env.PROFILE_SAVE||'artifacts/blender-custom-battle-save.json','utf8'));
const browser=await chromium.launch({channel:'msedge',headless:true,args:['--enable-webgl','--ignore-gpu-blocklist']});
try{
  const page=await browser.newPage({viewport:{width:1280,height:720}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.addInitScript(quality=>localStorage.setItem('crowns-settings',JSON.stringify({quality,frameRate:'60',autoQuality:false,weather:'clear',volume:0,music:false})),quality);
  await page.goto(base,{waitUntil:'domcontentloaded'});await page.waitForFunction(()=>window.frontier?.view,null,{timeout:90000});
  await page.evaluate(save=>{frontier.start(save.options,save);frontier.sim.players[0].controller='human';const army=frontier.sim.owned(0,'unit').filter(e=>e.type!=='villager'),at=army.find(e=>e.order?.type==='attack')||army[0];if(at)frontier.view.focus(at.x,at.z);frontier.view.zoom=65;frontier.view.updateCamera();},save);
  await page.waitForTimeout(1000);
  const profiler=await page.context().newCDPSession(page);await profiler.send('Profiler.enable');await profiler.send('Profiler.setSamplingInterval',{interval:1000});await profiler.send('Profiler.start');
  await page.waitForTimeout(4000);const {profile}=await profiler.send('Profiler.stop');await profiler.detach();
  const nodes=new Map(profile.nodes.map(n=>[n.id,n])),times=new Map();
  for(let i=0;i<(profile.samples?.length||0);i++){const id=profile.samples[i];times.set(id,(times.get(id)||0)+(profile.timeDeltas[i]||0)/1000);}
  const self=[...times].map(([id,milliseconds])=>{const f=nodes.get(id).callFrame;return {function:f.functionName||'(anonymous)',url:f.url,line:f.lineNumber+1,milliseconds};}).sort((a,b)=>b.milliseconds-a.milliseconds);
  const result={quality,viewport:{width:1280,height:720},sampleMilliseconds:(profile.endTime-profile.startTime)/1000,headless:true,physicalPhone:false,self:self.slice(0,35),errors};
  fs.writeFileSync('artifacts/render-profile.json',JSON.stringify(result,null,2));console.log(JSON.stringify({...result,self:self.slice(0,16)}));
}finally{await browser.close();}
