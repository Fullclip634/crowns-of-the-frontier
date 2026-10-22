import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {chromium} from 'playwright-core';

const output=process.env.QA_OUTPUT||'artifacts/battle-performance.json',duration=Number(process.env.BENCH_MS)||10000;
const file=process.env.PROFILE_SAVE||'.tools/battle-stages/crowded.json',save=JSON.parse(fs.readFileSync(file,'utf8'));
const cases=JSON.parse(process.env.BENCH_CASES||'[{"quality":"low","backend":"webgl"},{"quality":"medium","backend":"webgl"},{"quality":"high","backend":"webgl"}]');
assert.ok(duration>=3000&&duration<=60000);assert.ok(cases.every(c=>['low','medium','high'].includes(c.quality)&&['webgl','webgpu'].includes(c.backend)));
fs.mkdirSync(path.dirname(output),{recursive:true});
const browser=process.env.QA_BROWSER_ENDPOINT?await chromium.connectOverCDP(process.env.QA_BROWSER_ENDPOINT):await chromium.launch({channel:'msedge',headless:true,args:['--use-gl=angle','--use-angle=d3d11']});
const report={startedAt:new Date().toISOString(),configuration:{sampleMilliseconds:duration,warmupSubmittedFrames:Number(process.env.BENCH_WARM_FRAMES)||10,queryDiagnostics:process.env.BENCH_GL_DIAG==='1',focusEmulation:true,foregroundTestFlags:process.env.QA_TEST_FOREGROUND==='1'},fixture:{file,seconds:save.time,map:save.options.map,world:save.worldSize||save.options.worldSize,populationLimit:save.options.populationLimit},headless:true,physicalPhone:false,samples:[],errors:[]};
const guard=setTimeout(()=>browser.close().catch(()=>{}),900000);
try{
 const browserCDP=await browser.newBrowserCDPSession(),system=await browserCDP.send('SystemInfo.getInfo');report.hardware={gpu:system.gpu.devices.map(d=>({vendor:d.vendorString,device:d.deviceString,driver:d.driverVersion})),browser:await browserCDP.send('Browser.getVersion')};await browserCDP.detach();
 for(const item of cases){
  console.log('Measuring battle '+JSON.stringify(item));
  const targetFPS=item.phone?30:60,viewport=item.phone?{width:640,height:360}:{width:1280,height:720};
  const context=await browser.newContext({viewport,hasTouch:!!item.phone,isMobile:!!item.phone,serviceWorkers:'block'}),page=await context.newPage();page.setDefaultTimeout(240000);
  page.on('pageerror',e=>report.errors.push({item,error:e.stack}));page.on('console',m=>{if(m.type()==='error'||m.type()==='warning'&&!/powerPreference option|Service Worker registration blocked|warning X4122:/.test(m.text()))report.errors.push({item,type:m.type(),error:m.text()});});
   await page.addInitScript(({quality,targetFPS,autoQuality})=>localStorage.setItem('crowns-settings',JSON.stringify({quality,autoQuality,frameRate:String(targetFPS),fog:true,weather:'clear',lighting:'day',music:false,volume:0})),{quality:item.quality,targetFPS,autoQuality:!!item.autoQuality});
   const url=new URL(process.env.QA_URL||'http://localhost:4173/');url.searchParams.set('renderer',item.backend);await page.goto(url.href,{waitUntil:'commit',timeout:90000});console.log('Document committed; waiting for the game');await page.bringToFront();await page.waitForFunction(()=>window.frontier?.view);
   const focusCDP=await context.newCDPSession(page);await focusCDP.send('Emulation.setFocusEmulationEnabled',{enabled:true});await focusCDP.detach();
   assert.equal(await page.evaluate(()=>document.documentElement.dataset.renderer),item.backend);report.buildId??=await page.locator('meta[name="frontier-build"]').getAttribute('content');
  const setup=await page.evaluate(save=>{
   frontier.start(save.options,save);const s=frontier.sim,v=frontier.view;s.players[0].controller='human';
   const visible=s.entities.filter(e=>e.hp>0&&e.kind==='unit'&&!e.embarked&&(e.owner===0||s.isVisible(e.x,e.z))),army=visible.filter(e=>!['villager','fishingboat','monk'].includes(e.type));
   const focus=(army.length?army:visible).map(e=>({entity:e,score:visible.reduce((n,other)=>n+(Math.hypot(e.x-other.x,e.z-other.z)<35?1:0),0)})).sort((a,b)=>b.score-a.score||a.entity.id-b.entity.id)[0]?.entity||s.players[0].start;
   v.focus(focus.x,focus.z);v.zoom=65;v.angle=Math.PI/4;v.updateCamera();frontier.select([]);
   const renderer=v.renderer,draw=renderer.render,render=v.render,tick=s.tick;
    window.battleMeter={attempts:0,held:0,rafTicks:0,submitted:[],renderCPU:[],submittedCPU:[],tickCPU:[],sim:s,api:{},slowQueries:[],glPrograms:new Map(),pipelineLayouts:[]};const meter=battleMeter,pulse=()=>{meter.rafTicks++;requestAnimationFrame(pulse);};requestAnimationFrame(pulse);
   if(renderer.isWebGPURenderer){const device=renderer.backend.device;battleMeter.vertexBufferLimit=device.limits.maxVertexBuffers;for(const name of ['createRenderPipeline','createRenderPipelineAsync']){const original=device[name];device[name]=function(descriptor,...args){const buffers=(descriptor.vertex.buffers||[]).filter(Boolean);battleMeter.pipelineLayouts.push({label:descriptor.label,buffers:buffers.length,attributes:buffers.reduce((n,b)=>n+b.attributes.length,0)});return original.call(this,descriptor,...args);};}}
   if(!renderer.isWebGPURenderer){const gl=renderer.getContext(),debug=gl.getExtension('WEBGL_debug_renderer_info');battleMeter.adapter=debug?gl.getParameter(debug.UNMASKED_RENDERER_WEBGL):gl.getParameter(gl.RENDERER);}
   renderer.render=function(scene,camera,...args){if(scene===v.scene&&camera===v.camera)battleMeter.submitted.push(performance.now());return draw.call(this,scene,camera,...args);};
   v.render=function(...args){const start=performance.now(),before=battleMeter.submitted.length,result=render.apply(this,args),elapsed=performance.now()-start;battleMeter.attempts++;if(result===false)battleMeter.held++;battleMeter.renderCPU.push(elapsed);if(battleMeter.submitted.length>before)battleMeter.submittedCPU.push(elapsed);return result;};
   s.tick=function(...args){const start=performance.now();try{return tick.apply(this,args);}finally{battleMeter.tickCPU.push(performance.now()-start);}};
   return {focus:{x:focus.x,z:focus.z},visibleUnits:visible.length,world:s.worldSize,players:s.players.length,units:s.entities.filter(e=>e.kind==='unit'&&e.hp>0).length};
  },save);
  if(process.env.BENCH_GL_DIAG==='1')await page.evaluate(()=>{
   const renderer=frontier.view.renderer;if(renderer.isWebGPURenderer)return;const gl=renderer.getContext();
   for(const name of ['getProgramInfoLog','getShaderInfoLog','getProgramParameter','getUniformLocation','getAttribLocation','checkFramebufferStatus','texImage2D','texSubImage2D','bufferData','bufferSubData']){
    const original=gl[name];gl[name]=function(...args){const before=performance.now();try{return original.apply(this,args);}finally{const elapsed=performance.now()-before,metric=battleMeter.api[name]??={calls:0,milliseconds:0,max:0};metric.calls++;metric.milliseconds+=elapsed;metric.max=Math.max(metric.max,elapsed);if(name==='getProgramInfoLog')battleMeter.glPrograms.set(args[0],(battleMeter.glPrograms.get(args[0])||0)+1);if(elapsed>20&&battleMeter.slowQueries.length<12)battleMeter.slowQueries.push({name,milliseconds:elapsed,stack:new Error().stack});}};
   }
  });
   const warmup={...item,states:[]};(report.warmups??=[]).push(warmup);let observing=false;
   const observe=async()=>{if(observing)return;observing=true;try{warmup.states.push(await page.evaluate(()=>({at:performance.now(),hidden:document.hidden,paused:frontier.paused,seconds:frontier.sim.time,ended:frontier.sim.ended,attempts:battleMeter.attempts,held:battleMeter.held,submitted:battleMeter.submitted.length,flight:frontier.view.renderFlight&&{...frontier.view.renderFlight},loading:frontier.view.graphicsLoading,rebuilding:frontier.view.graphicsRebuilding,fatal:frontier.view.graphicsFatal,heap:performance.memory?.usedJSHeapSize,backend:document.documentElement.dataset.renderer,pipelines:battleMeter.pipelineLayouts.length})));console.log('Warmup '+JSON.stringify(warmup.states.at(-1)));}catch(error){warmup.observationFailure=error.message;}finally{observing=false;}};
   const warmupTimer=setInterval(observe,10000);try{await page.waitForFunction(count=>battleMeter.submitted.length>=count,Number(process.env.BENCH_WARM_FRAMES)||10,{timeout:120000});}finally{clearInterval(warmupTimer);}console.log('Sampling '+item.quality);
  const layouts=await page.evaluate(()=>({limit:battleMeter.vertexBufferLimit,layouts:battleMeter.pipelineLayouts}));(report.pipelineLayouts??=[]).push({...item,...layouts});assert.ok(!layouts.limit||layouts.layouts.every(layout=>layout.buffers<=layouts.limit),'A shader pipeline exceeds the device vertex-buffer limit.');assert.equal(report.errors.filter(e=>e.item===item).length,0,'Rendering must be valid before the measurement window.');
  const sample=await page.evaluate(async duration=>{
   const s=frontier.sim,v=frontier.view,m=battleMeter;m.attempts=0;m.held=0;m.submitted=[];m.renderCPU=[];m.submittedCPU=[];m.tickCPU=[];m.api={};m.slowQueries=[];m.glPrograms.clear();
   const start=performance.now(),time=s.time;await new Promise(resolve=>setTimeout(resolve,duration));const elapsed=performance.now()-start;
   const stats=values=>{const sorted=[...values].sort((a,b)=>a-b);return {samples:sorted.length,median:sorted[Math.floor(sorted.length*.5)]??0,p95:sorted[Math.floor(sorted.length*.95)]??0,p99:sorted[Math.floor(sorted.length*.99)]??0,max:sorted.at(-1)??0};};
   const intervals=m.submitted.slice(1).map((at,i)=>at-m.submitted[i]),advanced=s.time-time;
   return {quality:v.settings.quality,documentHidden:document.hidden,targetFPS:Number(v.settings.frameRate),submittedFrames:m.submitted.length,submittedFPS:m.submitted.length*1000/elapsed,attempts:m.attempts,held:m.held,window:{requestedMilliseconds:duration,elapsedMilliseconds:elapsed},simulation:{advancedSeconds:advanced,wallSeconds:elapsed/1000,speedRatio:advanced/(elapsed/1000),ticks:stats(m.tickCPU),ended:s.ended},frameIntervals:stats(intervals),renderAttemptCPU:stats(m.renderCPU),submittedRenderCPU:stats(m.submittedCPU),adapter:m.adapter,apiQueries:m.api,slowQueries:m.slowQueries,pipelineLayouts:{limit:m.vertexBufferLimit,layouts:m.pipelineLayouts},queriedPrograms:(v.renderer.info.programs||[]).filter(p=>m.glPrograms.has(p.program)).map(p=>({name:p.name,cacheKey:p.cacheKey?.slice(-240),calls:m.glPrograms.get(p.program)})),drawingBuffer:{width:v.renderer.domElement.width,height:v.renderer.domElement.height,pixelRatio:v.renderer.getPixelRatio()},units:{...v.unitRenderDiagnostics},shadows:{...v.shadowDiagnostics},surfaces:v.surfaceDiagnostics,render:{...v.renderer.info.render},memory:{...v.renderer.info.memory},shaderErrors:(v.renderer.info.programs||[]).filter(p=>p.diagnostics?.runnable===false).length};
  },duration);
   Object.assign(sample,{backend:item.backend,requestedQuality:item.quality,emulatedTouch:!!item.phone,viewport,setup,...await page.evaluate(()=>({autoQuality:frontier.view.settings.autoQuality,graphicsPressure:frontier.view.graphicsPressure,actualRenderQuality:frontier.view.renderQuality}))});sample.validationErrors=report.errors.filter(e=>e.item===item).length;sample.validLayout=!sample.pipelineLayouts.limit||sample.pipelineLayouts.layouts.every(layout=>layout.buffers<=sample.pipelineLayouts.limit);sample.validWindow=sample.validLayout&&!sample.validationErrors&&!sample.documentHidden&&!sample.simulation.ended&&sample.window.elapsedMilliseconds<duration*1.5&&sample.submittedFrames>=20;sample.targetMet=sample.validWindow&&sample.submittedFPS>=sample.targetFPS*.97&&sample.simulation.speedRatio>=.95;report.samples.push(sample);
   await page.screenshot({path:path.join(path.dirname(output),`battle-${item.backend}-${item.quality}${item.phone?'-phone':''}${item.autoQuality?'-auto':''}.png`)});
  if(process.env.BENCH_PROFILE==='1'){
   console.log('CPU profile '+item.quality);const cdp=await context.newCDPSession(page);await cdp.send('Profiler.enable');await cdp.send('Profiler.setSamplingInterval',{interval:1000});await cdp.send('Profiler.start');await new Promise(resolve=>setTimeout(resolve,4000));const {profile}=await cdp.send('Profiler.stop');await cdp.detach();
   const nodes=new Map(profile.nodes.map(n=>[n.id,n])),cost=new Map();for(let i=0;i<(profile.samples?.length||0);i++)cost.set(profile.samples[i],(cost.get(profile.samples[i])||0)+(profile.timeDeltas[i]||0)/1000);
   sample.cpuProfile={milliseconds:(profile.endTime-profile.startTime)/1000,self:[...cost].map(([id,milliseconds])=>({...nodes.get(id).callFrame,milliseconds})).sort((a,b)=>b.milliseconds-a.milliseconds).slice(0,45)};
   fs.writeFileSync(path.join(path.dirname(output),`battle-${item.backend}-${item.quality}.cpuprofile`),JSON.stringify(profile));
  }
   if(!item.autoQuality)assert.equal(sample.quality,item.quality);assert.equal(sample.autoQuality,!!item.autoQuality);assert.equal(sample.shaderErrors,0);assert.ok(sample.submittedFrames>0);await context.close();console.log(JSON.stringify({quality:sample.quality,autoQuality:sample.autoQuality,fps:sample.submittedFPS,simulation:sample.simulation.speedRatio,renderCPU:sample.renderAttemptCPU,units:sample.units,valid:sample.validWindow}));
 }
 assert.deepEqual(report.errors,[]);report.measured=true;
}catch(error){report.failure=error.stack;throw error;}
finally{clearTimeout(guard);fs.writeFileSync(output,JSON.stringify(report,null,2)+'\n');await browser.close();}
console.log(JSON.stringify({measured:true,output}));
