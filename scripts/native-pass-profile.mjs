import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {chromium} from 'playwright-core';
const output=process.env.QA_OUTPUT||'artifacts/native-pass-profile.json',file=process.env.PROFILE_SAVE||'.tools/battle-stages/crowded.json',fixture=fs.readFileSync(file,'utf8'),save=JSON.parse(fixture),quality=process.env.PROFILE_QUALITY||'medium';
const browser=await chromium.connectOverCDP(process.env.QA_BROWSER_ENDPOINT),report={startedAt:new Date().toISOString(),harnessSHA256:crypto.createHash('sha256').update(fs.readFileSync(new URL(import.meta.url))).digest('hex'),fixture:{file,sha256:crypto.createHash('sha256').update(fixture).digest('hex'),seconds:save.time},quality,headless:true,physicalPhone:false,diagnosticOnly:true,qualification:{foregroundTestFlags:process.env.QA_TEST_FOREGROUND==='1',forcedHardwareEligibility:process.env.QA_FORCE_HARDWARE_ELIGIBILITY==='1',disableFrameRateLimit:process.env.QA_TEST_NO_VSYNC==='1'},errors:[],samples:[]};
const guard=setTimeout(()=>browser.close().catch(()=>{}),300000);fs.mkdirSync(path.dirname(output),{recursive:true});
try{
 const browserCDP=await browser.newBrowserCDPSession();report.hardware=(await browserCDP.send('SystemInfo.getInfo')).gpu.devices.map(device=>({vendor:device.vendorString,device:device.deviceString,driver:device.driverVersion}));await browserCDP.detach();
 const context=await browser.newContext({viewport:{width:1280,height:720},serviceWorkers:'block'}),page=await context.newPage();page.setDefaultTimeout(120000);
 page.on('pageerror',error=>report.errors.push(error.stack));page.on('console',message=>{if(message.type()==='error'||message.type()==='warning'&&!/powerPreference option|Service Worker registration blocked|warning X4122:/.test(message.text()))report.errors.push(message.text());});
 await page.addInitScript(quality=>localStorage.setItem('crowns-settings',JSON.stringify({quality,autoQuality:false,frameRate:'60',fog:true,weather:'clear',lighting:'day',music:false,volume:0})),quality);
 const url=new URL(process.env.QA_URL);url.searchParams.set('renderer','webgpu');await page.goto(url.href,{waitUntil:'commit'});await page.bringToFront();await page.waitForFunction(()=>window.frontier?.view);
 const cdp=await context.newCDPSession(page);await cdp.send('Emulation.setFocusEmulationEnabled',{enabled:true});report.browser=await cdp.send('Browser.getVersion');await cdp.detach();
 report.buildId=await page.locator('meta[name="frontier-build"]').getAttribute('content');
 console.log('Preparing paused battlefield');
 report.setup=await page.evaluate(async save=>{
  frontier.start(save.options,save);frontier.action('pause');const v=frontier.view,s=frontier.sim,renderer=v.renderer;
  if(!renderer.backend?.isWebGPUBackend)throw new Error('Native WebGPU required');
  const visible=s.entities.filter(e=>e.hp>0&&e.kind==='unit'&&!e.embarked&&(e.owner===0||s.isVisible(e.x,e.z))),army=visible.filter(e=>!['villager','fishingboat','monk'].includes(e.type));
  const focus=(army.length?army:visible).map(e=>({entity:e,score:visible.reduce((n,other)=>n+(Math.hypot(e.x-other.x,e.z-other.z)<35?1:0),0)})).sort((a,b)=>b.score-a.score||a.entity.id-b.entity.id)[0]?.entity||s.players[0].start;
  v.focus(focus.x,focus.z);v.zoom=65;v.angle=Math.PI/4;v.updateCamera();frontier.select([]);
  // Let the application's normal submissions finish setup before taking over.
  // Counting actual field draws also exercises its ordinary two-frame budget.
  const fieldRender=renderer.render;let prewarmFrames=0;
  renderer.render=function(scene,camera,...args){const result=fieldRender.call(this,scene,camera,...args);if(scene===v.scene&&camera===v.camera)prewarmFrames++;return result;};
  try{await new Promise((resolve,reject)=>{const started=performance.now(),timer=setInterval(()=>{if(prewarmFrames>=20){clearInterval(timer);resolve();}else if(performance.now()-started>90000){clearInterval(timer);reject(new Error('The normal game did not submit 20 paused battlefield frames within 90 seconds. '+JSON.stringify({prewarmFrames,hidden:document.hidden,clock:v.clock,flight:v.renderFlight,loading:v.graphicsLoading,rebuilding:v.graphicsRebuilding,fatal:v.graphicsFatal})));}},50);});}finally{renderer.render=fieldRender;}
  const render=v.render.bind(v);v.render=()=>false;renderer.info.autoReset=false;v.clock=.4;v.localMotion.clear();v.localBlend=1;
  // Saved render coordinates can lag authoritative positions. Normalize those
  // derived fields before comparing an explicitly paused diagnostic fixture.
  for(const entity of s.entities){entity.renderX=entity.x;entity.renderZ=entity.z;}
  const meter=window.passMeter={render,passes:[],contexts:[],queueWrites:[],census:{},submitted:0,baseRatio:renderer.getPixelRatio(),snapshot:JSON.stringify(s.serialize()),clock:v.clock};
  const backend=renderer.backend,begin=backend.beginRender,stamp=backend.initTimestampQuery,write=backend.device.queue.writeTexture,draw=backend.draw;
  backend.draw=function(object,...args){if(object.context.camera===v.camera&&object.object.isMesh){const mesh=object.object,geometry=object.geometry,kind=mesh.userData.rigidRig?'troops':mesh.userData.treeIds?'forest':mesh.userData.model3d?.kind||mesh.parent?.userData.model3d?.kind||'other',count=mesh.isInstancedMesh?mesh.count:1,entry=meter.census[kind]??={draws:0,triangles:0,vertexRecords:0};entry.draws++;entry.triangles+=(geometry.index?.count||geometry.attributes.position.count)*count/3;entry.vertexRecords+=geometry.attributes.position.count*count;}return draw.call(this,object,...args);};
  backend.beginRender=function(renderContext){const previous=meter.context;meter.context={id:renderContext.id,width:renderContext.width,height:renderContext.height,samples:renderContext.sampleCount,fullscreen:renderContext.fullscreenPass,color:renderContext.color,depth:renderContext.depth,target:renderContext.renderTarget?.texture?.name||null,camera:renderContext.camera===v.camera?'battlefield':renderContext.camera===v.sun.shadow.camera?'shadow':'other'};try{return begin.call(this,renderContext);}finally{meter.context=previous;}};
  backend.initTimestampQuery=function(type,uid,descriptor){meter.passes.push({uid,type,label:descriptor.label,...meter.context});return stamp.call(this,type,uid,descriptor);};
  backend.device.queue.writeTexture=function(destination,data,layout,size){meter.queueWrites.push({sourceBytes:data.byteLength,size:Array.isArray(size)?[...size]:{...size},layout:{...layout}});return write.call(this,destination,data,layout,size);};
  const supported=renderer.hasFeature('timestamp-query');backend.trackTimestamp=supported;
  const adapter=backend.device.adapterInfo;return {paused:frontier.paused,seconds:s.time,focus:{x:focus.x,z:focus.z},units:s.entities.filter(e=>e.kind==='unit'&&e.hp>0).length,visibleUnits:visible.length,prewarmFrames,timestampSupported:supported,adapter:adapter&&{vendor:adapter.vendor,architecture:adapter.architecture,device:adapter.device,description:adapter.description},ratio:renderer.getPixelRatio(),samples:renderer.samples,outputBufferType:renderer.outputBufferType};
 },save);assert.ok(report.setup.paused&&report.setup.timestampSupported);
 console.log('Normal rendering warmup complete '+JSON.stringify(report.setup));
 // This diagnostic takes over rendering before its first measured frame. Flush
 // setup uploads explicitly rather than waiting with all game submissions held.
 await page.evaluate(async()=>{const queue=frontier.view.renderer.backend.device.queue;queue.submit([]);let timer;try{await Promise.race([queue.onSubmittedWorkDone(),new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error('Native setup uploads did not complete within 30 seconds.')),30000);})]);}finally{clearTimeout(timer);}});report.startupUploadsFlushed=true;
 const variants=JSON.parse(process.env.PROFILE_VARIANTS||'["animated","shadow-held","half-resolution","steady"]');
 for(const name of variants){
  console.log('Profiling native pass '+name);
  const rows=await page.evaluate(async name=>{
   const v=frontier.view,r=v.renderer,m=passMeter,q=r.backend.device.queue,rows=[];r.setPixelRatio(name==='half-resolution'?m.baseRatio*.5:m.baseRatio);
   for(let i=0;i<20;i++){
    await q.onSubmittedWorkDone();m.passes=[];m.queueWrites=[];m.census={};r.info.reset();const dt=name==='steady'?0:1/30;
    if(name==='shadow-held'&&v.shadowSampling){v.shadowSampling.at=v.clock+dt;r.shadowMap.needsUpdate=false;v.sun.shadow.needsUpdate=false;}
    const start=performance.now(),drawn=m.render(dt,false),cpu=performance.now()-start,info={...r.info.render};if(drawn===false)throw new Error('Manual diagnostic frame held');
    const queueStart=performance.now();await q.onSubmittedWorkDone();const queueWait=performance.now()-queueStart;
    const total=await r.resolveTimestampsAsync('render'),pool=r.backend.timestampQueryPool.render,timestamps=Array.from(pool.timestamps,([uid,milliseconds])=>({...m.passes.find(pass=>pass.uid===uid),uid,milliseconds}));
    if(i>=8)rows.push({cpuMilliseconds:cpu,queueWaitMilliseconds:queueWait,gpuMilliseconds:total,passes:timestamps,render:info,census:m.census,units:{...v.unitRenderDiagnostics},writes:m.queueWrites,drawingBuffer:{width:r.domElement.width,height:r.domElement.height},shadowRefreshes:v.shadowDiagnostics?.updates});
   }
   return rows;
  },name);
  const stats=values=>{const sorted=values.toSorted((a,b)=>a-b);return {samples:sorted.length,median:sorted[Math.floor(sorted.length*.5)],p95:sorted[Math.floor(sorted.length*.95)],min:sorted[0],max:sorted.at(-1)};};
  const sample={name,rows,cpu:stats(rows.map(row=>row.cpuMilliseconds)),queueWait:stats(rows.map(row=>row.queueWaitMilliseconds)),gpu:stats(rows.map(row=>row.gpuMilliseconds))};report.samples.push(sample);
  assert.ok(rows.every(row=>row.passes.length>0&&row.passes.every(pass=>pass.camera)&&row.gpuMilliseconds>0&&row.render.drawCalls>0&&row.units.drawn>0));console.log(JSON.stringify({name,cpu:sample.cpu,gpu:sample.gpu,queueWait:sample.queueWait,example:rows[0]}));
 }
 report.unchanged=await page.evaluate(()=>{const before=JSON.parse(passMeter.snapshot),after=JSON.parse(JSON.stringify(frontier.sim.serialize())),differences=[];const visit=(a,b,path='')=>{if(a===b||differences.length>=20)return;if(!a||!b||typeof a!=='object'||typeof b!=='object'){differences.push({path,before:a,after:b});return;}for(const key of new Set([...Object.keys(a),...Object.keys(b)]))visit(a[key],b[key],path+'.'+key);};visit(before,after);return {state:passMeter.snapshot===JSON.stringify(after),differences,quality:frontier.view.settings.quality,frameRate:frontier.view.settings.frameRate,fatal:frontier.view.graphicsFatal||null};});console.log('State '+JSON.stringify(report.unchanged));assert.ok(report.unchanged.state);assert.equal(report.unchanged.quality,quality);assert.equal(report.unchanged.frameRate,'60');assert.equal(report.unchanged.fatal,null);assert.deepEqual(report.errors,[]);
 report.geometry=await page.evaluate(()=>{const meshes=[];frontier.view.scene.traverse(object=>{if(!object.isMesh)return;const geometry=object.geometry,buffers=new Set();for(const attribute of Object.values(geometry.attributes))if(!attribute.isInstancedBufferAttribute)buffers.add(attribute.data?.array||attribute.array);meshes.push({id:geometry.id,name:object.name,kind:object.userData.model3d?.kind||object.parent?.userData.model3d?.kind||(object.userData.rigidRig?'rigid':'other'),type:object.userData.model3d?.type||object.parent?.userData.model3d?.type,positionCount:geometry.attributes.position?.count,indexCount:geometry.index?.count,indexBytes:geometry.index?.array.byteLength||0,vertexBytes:Array.from(buffers).reduce((n,array)=>n+array.byteLength,0),instances:object.isInstancedMesh?object.count:1,visible:object.visible,reuse:geometry.userData.exactVertexReuse});});return meshes;});
 await page.evaluate(()=>{let node=frontier.view.renderer.domElement;while(node.parentElement){for(const sibling of node.parentElement.children)if(sibling!==node&&sibling instanceof HTMLElement)sibling.style.visibility='hidden';node=node.parentElement;}});await page.screenshot({path:path.join(path.dirname(output),'battlefield.png')});
 report.passed=true;await context.close();
}catch(error){report.failure=error.stack;throw error;}
finally{clearTimeout(guard);fs.writeFileSync(output,JSON.stringify(report,null,2)+'\n');await browser.close();}
