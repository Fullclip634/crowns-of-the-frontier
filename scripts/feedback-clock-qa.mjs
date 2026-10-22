import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {chromium} from 'playwright-core';
const output=process.env.QA_OUTPUT||'artifacts/feedback-clock-validation.json';fs.mkdirSync(path.dirname(output),{recursive:true});
const browser=process.env.QA_BROWSER_ENDPOINT?await chromium.connectOverCDP(process.env.QA_BROWSER_ENDPOINT):await chromium.launch({channel:'msedge',headless:true});
const cases=JSON.parse(process.env.QA_FEEDBACK_CASES||'[{"quality":"high","backend":"webgl"},{"quality":"medium","backend":"webgpu","largeRoom":true},{"quality":"low","backend":"webgl","phone":true},{"quality":"low","backend":"webgpu","largeRoom":true},{"quality":"high","backend":"webgpu","largeRoom":true}]');
const report={startedAt:new Date().toISOString(),configuration:{focusEmulation:true,foregroundTestFlags:process.env.QA_TEST_FOREGROUND==='1'},cases:[],errors:[]},expectPool=process.env.QA_EXPECT_POOL!=='0',expectPacing=process.env.QA_EXPECT_PACING!=='0';
const guard=setTimeout(()=>browser.close().catch(()=>{}),900000);
async function bounded(promise,label){let timer;try{return await Promise.race([promise,new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error(label+' exceeded 90 seconds')),90000);})]);}finally{clearTimeout(timer);}}
try{
 for(const item of cases){
  console.log('Feedback and clock '+JSON.stringify(item));const context=await browser.newContext({viewport:item.phone?{width:640,height:360}:{width:960,height:640},hasTouch:!!item.phone,isMobile:!!item.phone,serviceWorkers:'block'}),page=await context.newPage();page.setDefaultTimeout(240000);
  page.on('pageerror',e=>report.errors.push({item,error:e.stack}));page.on('console',m=>{if(m.type()==='error'||m.type()==='warning'&&!/powerPreference option|Service Worker registration blocked|warning X4122:/.test(m.text()))report.errors.push({item,type:m.type(),error:m.text()});});
  await page.addInitScript(quality=>localStorage.setItem('crowns-settings',JSON.stringify({quality,autoQuality:false,frameRate:'60',fog:false,weather:'clear',lighting:'day',music:false,volume:0})),item.quality);
   const url=new URL(process.env.QA_URL||'http://localhost:4173/');url.searchParams.set('renderer',item.backend);await page.goto(url.href,{waitUntil:'commit',timeout:90000});console.log('Document committed; waiting for the game');await page.waitForFunction(()=>window.frontier?.view);assert.equal(await page.evaluate(()=>document.documentElement.dataset.renderer),item.backend);report.buildId??=await page.locator('meta[name="frontier-build"]').getAttribute('content');
   await page.bringToFront();const focusCDP=await context.newCDPSession(page);await focusCDP.send('Emulation.setFocusEmulationEnabled',{enabled:true});await focusCDP.detach();
   await page.evaluate(largeRoom=>{
   const v=frontier.view,draw=v.render.bind(v);v.render=()=>false;
   window.qaDraw=async dt=>{const queue=v.renderer.backend?.device?.queue;if(queue)await queue.onSubmittedWorkDone();draw(dt,false);if(queue)await queue.onSubmittedWorkDone();};
   const options=largeRoom?{mode:'custom',seed:512,map:'highlands',mapSize:'huge',populationLimit:160,slots:Array.from({length:8},(_,i)=>({enabled:true,controller:i?'ai':'human',team:i<4?1:2,faction:['alder','sun','raven'][i%3],difficulty:'hard'}))}:{mode:'sandbox',seed:512};
   frontier.start(options);frontier.action('pause');document.querySelector('#modal-root').style.visibility='hidden';const s=frontier.sim;
   s.entities=s.entities.filter(e=>Math.hypot(e.x,e.z-20)>25);s.index=null;s.revision++;const monk=s.addUnit('monk',0,-2,20),target=s.addUnit('spearman',0,2,20);window.qaActors={monk:monk.id,target:target.id};s.visible.fill(1);v.attach(s);v.focus(0,20);v.zoom=24;v.angle=.65;v.updateCamera();
   window.qaFeedback={logs:0,pipelines:0,healDraws:0,uploads:0,disposedGeometries:0,burstArray:null};
   if(!v.renderer.isWebGPURenderer){const gl=v.renderer.getContext(),log=gl.getProgramInfoLog,draw=v.renderer.renderBufferDirect;gl.getProgramInfoLog=function(...args){qaFeedback.logs++;return log.apply(this,args);};v.renderer.renderBufferDirect=function(...args){if(args[4]===qaFeedback.heal)qaFeedback.healDraws++;return draw.apply(this,args);};for(const name of ['bufferData','bufferSubData']){const original=gl[name];gl[name]=function(...args){const data=args[name==='bufferData'?1:2];if(data?.buffer===qaFeedback.burstArray?.buffer)qaFeedback.uploads++;return original.apply(this,args);};}}
   if(v.renderer.isWebGPURenderer){const device=v.renderer.backend.device;for(const name of ['createRenderPipeline','createRenderPipelineAsync']){const original=device[name];device[name]=function(...args){qaFeedback.pipelines++;return original.apply(this,args);};}}
   window.qaFeedbackCycle=async()=>{
    v.effect({type:'projectile-impact',entity:s.get(qaActors.monk),target:s.get(qaActors.target),siege:true});v.effect({type:'heal',entity:s.get(qaActors.monk),target:s.get(qaActors.target)});
    const burst=v.fx.find(f=>f.particles),heal=v.fx.find(f=>f.heal);qaFeedback.burstArray=burst.object.instanceMatrix.array;qaFeedback.heal=heal.object;heal.object.geometry.addEventListener('dispose',()=>qaFeedback.disposedGeometries++);burst.object.geometry.addEventListener('dispose',()=>qaFeedback.disposedGeometries++);
    const before={logs:qaFeedback.logs,pipelines:qaFeedback.pipelines,draws:qaFeedback.healDraws,uploads:qaFeedback.uploads};await qaDraw(.1);const first=Array.from(burst.object.instanceMatrix.array);await qaDraw(.1);const moved=first.some((value,i)=>Math.abs(value-burst.object.instanceMatrix.array[i])>1e-6);
    const sample={burst:burst.object.uuid,heal:heal.object.uuid,moved,uploads:qaFeedback.uploads-before.uploads,healDraws:qaFeedback.healDraws-before.draws,singlePass:heal.object.material.forceSinglePass,side:heal.object.material.side,geometry:burst.object.geometry.uuid,healGeometry:heal.object.geometry.uuid,burstPBR:!!(burst.object.material.isMeshStandardMaterial||burst.object.material.isMeshStandardNodeMaterial)};
    for(let i=0;i<9;i++)await qaDraw(.1);sample.logs=qaFeedback.logs-before.logs;sample.pipelines=qaFeedback.pipelines-before.pipelines;sample.remaining=v.fx.length;return sample;
   };
  },!!item.largeRoom);
   console.log('Rendering controlled warmup');await bounded(page.evaluate(async()=>{for(let i=0;i<4;i++)await qaDraw(.1);}), 'Controlled warmup');
   const check={...item,cycles:[]};report.cases.push(check);for(let i=0;i<5;i++){check.cycles.push(await bounded(page.evaluate(()=>qaFeedbackCycle()),'Feedback cycle '+i));fs.writeFileSync(output,JSON.stringify(report,null,2)+'\n');}
  check.pooled=await page.evaluate(()=>!!frontier.view.impactEffects);check.retained=await page.evaluate(()=>frontier.view.impactEffects?.retained.size||0);
  check.geometryDisposals=await page.evaluate(()=>qaFeedback.disposedGeometries);
  check.nativeLayout=await page.evaluate(()=>{const v=frontier.view;return {deviceLimit:v.renderer.backend?.device?.limits.maxVertexBuffers,rigs:[...v.unitBatches.values()].flatMap(batch=>batch.parts.filter(part=>part.userData.rigidRig).map(part=>({capacity:part.instanceMatrix.count,layout:part.geometry.userData.nativeVertexLayout})))}});
  if(item.largeRoom&&expectPool){assert.ok(check.nativeLayout.rigs.some(r=>r.capacity===1280));assert.ok(check.nativeLayout.rigs.every(r=>r.layout?.staticBuffersAfter===1));}
  for(const cycle of check.cycles){assert.ok(cycle.moved);assert.ok(cycle.burstPBR);assert.equal(cycle.remaining,0);assert.equal(cycle.singlePass,false);if(item.backend==='webgl'){assert.ok(cycle.uploads>=2);assert.equal(cycle.healDraws,4);}}
  if(expectPool){assert.ok(check.pooled);assert.equal(check.retained,2);assert.ok(check.cycles.every(c=>c.burst===check.cycles[0].burst&&c.heal===check.cycles[0].heal&&c.geometry===check.cycles[0].geometry&&c.healGeometry===check.cycles[0].healGeometry));assert.equal(check.geometryDisposals,0);assert.ok(check.cycles.slice(1).every(c=>c.logs===0&&c.pipelines===0));}
  await page.evaluate(async()=>{frontier.view.effect({type:'projectile-impact',entity:frontier.sim.get(qaActors.monk),target:frontier.sim.get(qaActors.target),siege:true});frontier.view.effect({type:'heal',entity:frontier.sim.get(qaActors.monk),target:frontier.sim.get(qaActors.target)});await qaDraw(.15);});await page.screenshot({path:path.join(path.dirname(output),`feedback-${item.backend}-${item.quality}.png`)});
  check.clock=await page.evaluate(async()=>{
   const callbacks=[],raf=window.requestAnimationFrame,now=performance.now.bind(performance);window.requestAnimationFrame=callback=>{callbacks.push(callback);return callbacks.length;};await new Promise(resolve=>raf(()=>raf(resolve)));
   let at=now(),hidden=false;performance.now=()=>at;Object.defineProperty(document,'hidden',{configurable:true,get:()=>hidden});
   const step=milliseconds=>{at+=milliseconds;for(const callback of callbacks.splice(0))callback(at);};
   try{
    frontier.start({mode:'sandbox',seed:512});document.dispatchEvent(new Event('visibilitychange'));const start=frontier.sim.time;for(let i=0;i<8;i++)step(125);const foreground=frontier.sim.time-start;
    frontier.action('pause');const pausedAt=frontier.sim.time;for(let i=0;i<40;i++)step(125);const paused=frontier.sim.time-pausedAt;frontier.action('close');step(125);const resumed=frontier.sim.time-pausedAt;
    hidden=true;document.dispatchEvent(new Event('visibilitychange'));const hiddenAt=frontier.sim.time;for(let i=0;i<8;i++)step(1000);const background=frontier.sim.time-hiddenAt;
    hidden=false;document.dispatchEvent(new Event('visibilitychange'));step(16);const returnAdvance=frontier.sim.time-hiddenAt;
    const saved=JSON.parse(JSON.stringify(frontier.sim.serialize()));frontier.start(saved.options,saved);document.dispatchEvent(new Event('visibilitychange'));const restoredAt=frontier.sim.time;for(let i=0;i<8;i++)step(125);
    return {foreground,paused,resumed,background,returnAdvance,restoredAdvance:frontier.sim.time-restoredAt,quality:frontier.view.settings.quality,overflow:document.documentElement.scrollWidth>innerWidth};
   }finally{performance.now=now;delete document.hidden;window.requestAnimationFrame=raf;document.dispatchEvent(new Event('visibilitychange'));for(const callback of callbacks.splice(0))raf(callback);}
  });
  assert.equal(check.clock.paused,0);assert.ok(check.clock.resumed>0);if(expectPacing){assert.ok(Math.abs(check.clock.foreground-1)<1e-6);assert.equal(check.clock.background,0);assert.equal(check.clock.returnAdvance,0);assert.ok(Math.abs(check.clock.restoredAdvance-1)<1e-6);}assert.equal(check.clock.quality,item.quality);assert.equal(check.clock.overflow,false);
   check.shaderErrors=await page.evaluate(()=>(frontier.view.renderer.info.programs||[]).filter(p=>p.diagnostics?.runnable===false).length);assert.equal(check.shaderErrors,0);await context.close();fs.writeFileSync(output,JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({passed:true,item,clock:check.clock,repeatShaderQueries:check.cycles.slice(1).reduce((n,c)=>n+c.logs,0)}));
 }
 assert.deepEqual(report.errors,[]);report.passed=true;
}catch(error){report.failure=error.stack;throw error;}
finally{clearTimeout(guard);fs.writeFileSync(output,JSON.stringify(report,null,2)+'\n');let timer;try{await Promise.race([browser.close(),new Promise(resolve=>{timer=setTimeout(resolve,10000);})]);}finally{clearTimeout(timer);}}
