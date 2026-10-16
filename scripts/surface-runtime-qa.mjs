import fs from 'node:fs';
import assert from 'node:assert/strict';
const channel=process.env.QA_BROWSER||'msedge';assert.ok(['msedge','chrome','headless-tcp'].includes(channel),'QA_BROWSER must select an installed supported browser');
const phase=process.env.QA_SURFACE_PHASE||'all';assert.ok(['all','fallback'].includes(phase),'QA_SURFACE_PHASE must be all or fallback');
const reportFile=phase==='all'?'artifacts/surface-runtime-qa.json':'artifacts/surface-runtime-fallback-qa.json';
const report={passed:false,channel,phase,scope:phase==='all'?'Repeated preset transitions, reload and JPEG recovery':'Low-profile reload and JPEG recovery only; does not pass the full transition sequence',checks:[],errors:[],warnings:[],stages:[],trace:[],stage:'browser launch',physicalPhone:false};let browser,page;
const requests=new Map(),aborted=new Set(),started=Date.now();
const stage=name=>{report.stage=name;report.stages.push({name,elapsedMs:Date.now()-started});console.log(name);};
const bounded=async(task,label,ms=120000)=>{let timer;try{return await Promise.race([task,new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error(label+' exceeded '+ms+' ms')),ms);})]);}finally{clearTimeout(timer);}};
const snapshot=()=>page.evaluate(()=>{const v=window.frontier?.view;return v?{selected:v.settings.quality,applied:v.renderQuality,loading:v.graphicsLoading,error:v.graphicsError,art:v.artDiagnostics,cache:v.artCacheDiagnostics,surface:v.surfaceDiagnostics,memory:{...v.renderer.info.memory},portrait:v.modelPortrait?.key,materials:Object.fromEntries(Object.entries(v.materials).map(([key,m])=>[key,{normal:m.normalMap?.uuid,roughness:m.roughnessMap?.uuid}]))}:null;});
const guard=setTimeout(()=>{report.failure='Runtime verification exceeded fifteen minutes';fs.writeFileSync(reportFile,JSON.stringify(report,null,2));browser?.close().catch(()=>{});setTimeout(()=>process.exit(1),5000);},900000);
try{
  stage('browser API import');const {chromium}=await bounded(import('playwright-core'),'browser API import',30000);
  stage('browser launch');
  if(channel==='headless-tcp'){const {launchTcpBrowser}=await import('../.tools/browser-tcp.mjs'),launched=await launchTcpBrowser();browser=launched.browser;report.launch={pid:launched.pid,port:launched.port,mode:'loopback CDP'};}
  else browser=await chromium.launch({channel,headless:true,timeout:30000,args:['--enable-webgl','--ignore-gpu-blocklist']});
  const browserSession=await browser.newBrowserCDPSession();
  try{report.gpu=(await bounded(browserSession.send('SystemInfo.getInfo'),'GPU diagnostics',15000)).gpu;}catch(error){report.gpuDiagnosticFailure=error.message;}finally{await browserSession.detach();}
  const viewport=process.env.QA_SURFACE_COMPACT==='1'?{width:800,height:480}:{width:1280,height:720};report.viewport=viewport;
  page=await browser.newPage({viewport,hasTouch:true,serviceWorkers:'block'});page.setDefaultNavigationTimeout(90000);page.setDefaultTimeout(120000);
  const trace=message=>{report.trace.push({message,elapsedMs:Date.now()-started});console.log(message);};
  const listen=page=>{page.on('pageerror',e=>report.errors.push({message:e.message}));page.on('console',m=>{if(m.type()==='error')report.errors.push({message:m.text(),url:m.location().url});if(m.type()==='warning')report.warnings.push(m.text());if(m.text().startsWith('QA graphics:')||m.text().startsWith('QA artwork:'))trace(m.text());});page.on('request',r=>requests.set(r,{url:r.url(),startedMs:Date.now()-started}));for(const event of ['requestfinished','requestfailed'])page.on(event,r=>requests.delete(r));page.on('worker',worker=>{trace('decoder worker opened');worker.on('close',()=>trace('decoder worker closed'));});page.on('crash',()=>{report.crashed=true;});};listen(page);
  await page.addInitScript(()=>new PerformanceObserver(list=>{for(const entry of list.getEntries())if(entry.name.startsWith('frontier:artwork:'))console.log('QA artwork: '+entry.name+' '+entry.startTime.toFixed(1));}).observe({type:'mark',buffered:true}));
  await page.addInitScript(()=>{window.qaGraphicsCanvases=[];const get=HTMLCanvasElement.prototype.getContext;HTMLCanvasElement.prototype.getContext=function(type,...args){const context=get.call(this,type,...args);if(context&&/^webgl2?$/.test(type)&&!qaGraphicsCanvases.includes(this))qaGraphicsCanvases.push(this);return context;};});
  await page.addInitScript(()=>localStorage.setItem('crowns-settings',JSON.stringify({quality:'low',autoQuality:false,music:false,volume:0,weather:'clear'})));
  stage('production load');await page.goto(process.env.QA_URL||'http://127.0.0.1:4173/',{waitUntil:'domcontentloaded'});await page.waitForFunction(()=>window.frontier?.view);
  report.buildId=await page.locator('meta[name="frontier-build"]').getAttribute('content');
  assert.equal(report.buildId,process.env.QA_BUILD_ID||JSON.parse(fs.readFileSync('dist/version.json','utf8')).buildId);
  report.startupContexts=await page.evaluate(()=>qaGraphicsCanvases.length);assert.equal(report.startupContexts,1,'Capability detection must reuse the battlefield graphics context');
  await page.evaluate(()=>{frontier.start({mode:'sandbox',map:'highlands',seed:512});frontier.action('pause');document.querySelector('#modal-root').style.visibility='hidden';frontier.select([frontier.sim.owned(0,'building','towncenter')[0].id]);});
  await page.evaluate(()=>{const v=frontier.view,attach=v.attach;v.attach=function(...args){console.log('QA graphics: rebuilding '+this.settings.quality);const result=attach.apply(this,args);console.log('QA graphics: rebuilt '+this.settings.quality);return result;};const original=window.fetch;window.fetch=async(...args)=>{const response=await original(...args);if(String(args[0]).endsWith('.glb')){console.log('QA graphics: fetched '+args[0]);const arrayBuffer=response.arrayBuffer;response.arrayBuffer=async()=>{const bytes=await arrayBuffer.call(response);console.log('QA graphics: binary ready '+bytes.byteLength);return bytes;};}return response;};});
  const sequence=phase==='all'?['high','medium','low','high','low']:[];
  for(const [index,quality]of sequence.entries()){
    stage(quality+' prepare');const injectWarmupFailure=index===3;
    await page.evaluate(({quality,injectWarmupFailure})=>{window.qaQualityDone=false;if(injectWarmupFailure){window.qaCompileAsync=frontier.view.renderer.compileAsync;frontier.view.renderer.compileAsync=()=>Promise.reject(new Error('QA optional warmup failure'));}window.qaQualityReady=frontier.view.quality(quality).finally(()=>window.qaQualityDone=true);},{quality,injectWarmupFailure});
    await page.waitForFunction(()=>qaQualityDone||!document.querySelector('#graphics-status').classList.contains('hidden'));
    const progress=await page.evaluate(()=>({visible:!document.querySelector('#graphics-status').classList.contains('hidden'),busy:document.querySelector('#world').getAttribute('aria-busy')}));
    const applied=await bounded(page.evaluate(()=>qaQualityReady),quality+' quality preparation',180000);assert.equal(applied,true);
    if(injectWarmupFailure)await page.evaluate(()=>{frontier.view.renderer.compileAsync=qaCompileAsync;});
    stage(quality+' residency');
    await bounded(page.waitForFunction(q=>frontier.view.renderQuality===q&&!frontier.view.graphicsLoading&&frontier.view.surfaceDiagnostics.loaded===({high:21,medium:17,low:7})[q],quality),quality+' residency');
    // Verify the game's own frame loop after applying the profile.
    // An extra direct render inside page.evaluate competes with that loop.
    stage(quality+' real frame');const appliedFrame=await bounded(page.evaluate(()=>frontier.view.renderer.info.render.frame),quality+' frame counter');
    await bounded(page.waitForFunction(frame=>frontier.view.renderer.info.render.frame>frame,appliedFrame),quality+' game frame');
    const check=await bounded(page.evaluate(()=>{const v=frontier.view,finitePoses=[...v.unitBatches.values()].every(batch=>batch.parts.every(part=>{const rig=part.userData.rigidRig,data=rig?.data||part.instanceMatrix.array,count=part.count*(rig?rig.joints.length:1)*16;for(let i=0;i<count;i++)if(!Number.isFinite(data[i]))return false;return true;}));return {quality:v.settings.quality,applied:v.renderQuality,sceneFrame:v.renderer.info.render.frame,warmupHeld:!!v.graphicsRebuilding,warmupReferences:v.graphicsProgramReleases?.length||0,units:v.unitRenderDiagnostics,finitePoses,art:v.artDiagnostics,cache:v.artCacheDiagnostics,surface:v.surfaceDiagnostics,normalCompressed:!!v.materials.stone.normalMap?.isCompressedTexture,normalPresent:!!v.materials.stone.normalMap,memory:{...v.renderer.info.memory},heap:performance.memory?{used:performance.memory.usedJSHeapSize,total:performance.memory.totalJSHeapSize}:null,shadows:v.renderer.shadowMap.enabled};}),quality+' rendered scene');assert.ok(check.sceneFrame>appliedFrame);assert.equal(check.warmupHeld,false);assert.equal(check.warmupReferences,0);assert.equal(check.finitePoses,true);assert.ok(check.units.drawn>0);
    assert.equal(check.surface.compressed,{high:14,medium:10,low:7}[quality]);assert.equal(check.surface.codecFallbacks,0);assert.equal(check.surface.codecPending,0);assert.equal(check.normalCompressed,false);assert.equal(check.normalPresent,quality!=='low');assert.equal(check.art.models,126);assert.equal(check.shadows,quality!=='low');report.checks.push(check);
    report.checks.at(-1).progress=progress;report.checks.at(-1).warmupError=await page.evaluate(()=>frontier.view.graphicsWarmupError||null);
    if(injectWarmupFailure)assert.equal(report.checks.at(-1).warmupError,'QA optional warmup failure');
    assert.equal(await page.evaluate(()=>frontier.view.renderer.info.programs.filter(p=>p.diagnostics?.runnable===false).length),0);
    // Keep one final image per profile; repeated switches still run every
    // live-frame/residency assertion without duplicate GPU readbacks.
    if(!sequence.slice(index+1).includes(quality)){stage(quality+' screenshot');await page.screenshot({path:`artifacts/surfaces-${quality}.png`});}
  }
  await page.setViewportSize({width:640,height:360});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);await page.screenshot({path:'artifacts/surfaces-phone.png'});
  stage('compressed preference reload');await page.reload({waitUntil:'domcontentloaded'});await page.waitForFunction(()=>window.frontier?.view);assert.equal(await page.evaluate(()=>frontier.view.surfaceDiagnostics.compressed),7);
  await page.close();stage('JPEG recovery');page=await browser.newPage({viewport:{width:640,height:360},hasTouch:true,serviceWorkers:'block'});listen(page);
  page.setDefaultNavigationTimeout(90000);page.setDefaultTimeout(120000);await page.route('**/*.ktx2',route=>{aborted.add(route.request().url());return route.abort();});
  await page.addInitScript(()=>localStorage.setItem('crowns-settings',JSON.stringify({quality:'low',autoQuality:false,music:false,volume:0,weather:'clear'})));
  await page.goto(process.env.QA_URL||'http://127.0.0.1:4173/',{waitUntil:'domcontentloaded'});await page.waitForFunction(()=>window.frontier?.view);
  const fallback=await page.evaluate(()=>({surfaces:frontier.view.surfaceDiagnostics,models:frontier.view.artDiagnostics.models}));assert.equal(fallback.surfaces.compressed,0);assert.equal(fallback.surfaces.loaded,7);assert.equal(fallback.surfaces.codecFallbacks,7);assert.equal(fallback.models,126);report.fallback=fallback;
  stage('JPEG recovery rendered coast');await page.evaluate(()=>{frontier.start({mode:'sandbox',map:'coast',seed:512});frontier.action('pause');document.getElementById('modal-root').style.visibility='hidden';});
  const fallbackFrame=await page.evaluate(()=>frontier.view.renderer.info.render.frame);await bounded(page.waitForFunction(frame=>frontier.view.renderer.info.render.frame>frame,fallbackFrame),'JPEG recovery live frame');
  report.fallbackGameplay=await page.evaluate(()=>({playing:frontier.playing,map:frontier.sim.options.map,sceneFrame:frontier.view.renderer.info.render.frame,drawCalls:frontier.view.renderer.info.render.calls,unitsDrawn:frontier.view.unitRenderDiagnostics?.drawn||0,surfaces:frontier.view.surfaceDiagnostics}));
  assert.ok(report.fallbackGameplay.playing&&report.fallbackGameplay.map==='coast'&&report.fallbackGameplay.sceneFrame>fallbackFrame&&report.fallbackGameplay.drawCalls>0&&report.fallbackGameplay.unitsDrawn>0);await page.screenshot({path:'artifacts/surfaces-jpeg-recovery-coast.png'});
  // Aborted KTX requests intentionally produce browser network log entries.
  report.unexpectedErrors=report.errors.filter(error=>!(error.message.includes('net::ERR_FAILED')&&aborted.has(error.url)));assert.deepEqual(report.unexpectedErrors,[]);report.passed=true;console.log(JSON.stringify({passed:true,profiles:report.checks.map(c=>({quality:c.quality,loaded:c.surface.loaded,compressed:c.surface.compressed,payload:c.surface.compressedMipBytes})),fallback},null,2));
}catch(error){report.failure??=error.message;report.pendingRequests=[...requests.values()];try{report.failureState=await bounded(snapshot(),'failure snapshot',5000);}catch(e){report.snapshotFailure=e.message;}throw error;}
finally{clearTimeout(guard);fs.writeFileSync(reportFile,JSON.stringify(report,null,2));if(browser)try{await bounded(browser.close(),'browser close',15000);}catch(error){report.cleanupFailure=error.message;fs.writeFileSync(reportFile,JSON.stringify(report,null,2));process.exitCode=1;setTimeout(()=>process.exit(1),1000);}}
