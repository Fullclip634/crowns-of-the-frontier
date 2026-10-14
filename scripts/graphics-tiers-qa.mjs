import {chromium} from '@playwright/test';
import fs from 'node:fs';
import assert from 'node:assert/strict';
const requested=process.env.GRAPHICS_QUALITY;if(requested&&!['low','medium','high'].includes(requested))throw new Error('Invalid GRAPHICS_QUALITY');const qualities=requested?[requested]:['low','medium','high'];
const report={checks:[],errors:[],warnings:[],passed:false,physicalPhone:false,touchCapableViewports:true};let browser,page,stage='browser launch';
const reportPath=`artifacts/graphics-tiers${requested?'-'+requested:''}-qa.json`;
let watchdog,aborting=false,stageAt=Date.now();report.stageTimes=[];
const abort=message=>{if(aborting)return;aborting=true;report.failure=message;report.stage=stage;report.scope=qualities;fs.writeFileSync(reportPath,JSON.stringify(report,null,2));console.error(message);browser?.close().catch(()=>{});setTimeout(()=>process.exit(1),10000);};
const markStage=value=>{const now=Date.now();report.stageTimes.push({stage,ms:now-stageAt});stage=value;stageAt=now;clearTimeout(watchdog);watchdog=setTimeout(()=>abort(`Verification stalled for five minutes at ${stage}`),300000);};
markStage(stage);const overallWatchdog=setTimeout(()=>abort(`Graphics verification exceeded fifteen minutes at ${stage}`),900000);
try{
  browser=await chromium.launch({channel:'msedge',headless:true,args:['--enable-webgl','--ignore-gpu-blocklist']});markStage('production navigation');
  page=await browser.newPage({viewport:{width:1280,height:720},hasTouch:true});page.setDefaultTimeout(180000);page.setDefaultNavigationTimeout(90000);
  page.on('pageerror',e=>report.errors.push(e.message));page.on('console',m=>{if(m.type()==='error')report.errors.push(m.text());else if(m.type()==='warning')report.warnings.push(m.text());else if(m.type()==='log'&&m.text().startsWith('QA stage:'))console.log(m.text());});
  await page.addInitScript(quality=>{if(!localStorage.getItem('crowns-settings'))localStorage.setItem('crowns-settings',JSON.stringify({quality,autoQuality:false,weather:'clear',music:false,volume:0}));},requested||'low');
  await page.goto(process.env.QA_URL||'http://127.0.0.1:4173/',{waitUntil:'domcontentloaded'});await page.bringToFront();await page.waitForFunction(()=>window.frontier?.view);console.log('Production game ready');
  markStage('sandbox setup');await page.evaluate(()=>{
    const v=frontier.view,attach=v.attach;
    v.attach=function(...args){console.log('QA stage: world attach begin');const result=attach.apply(this,args);console.log('QA stage: world attach complete');return result;};
    try{console.log('QA stage: start battle');frontier.start({mode:'sandbox',map:'highlands',seed:512});console.log('QA stage: battle started');}finally{v.attach=attach;}
    frontier.sim.players[0].age=3;console.log('QA stage: pause battle');frontier.action('pause');console.log('QA stage: battle paused');document.querySelector('#modal-root').style.visibility='hidden';v.focus(-37,30);v.zoom=35;v.tilt=.62;v.updateCamera();console.log('QA stage: camera ready');
  });
  for(const quality of qualities){
    markStage(quality+' settings');console.log('Checking graphics '+quality);
    await page.evaluate(()=>{document.querySelector('#modal-root').style.visibility='';frontier.action('settings');});
    await page.locator('#quality').selectOption(quality);await page.locator('[data-action=apply-settings]').click();
    console.log(quality+' setting applied');
    await page.waitForFunction(q=>frontier.view.artDiagnostics?.detail===q&&frontier.view.surfaceQuality===q&&frontier.view.renderQuality===q&&!frontier.view.graphicsLoading,quality);
    console.log(quality+' catalogue ready');
    markStage(quality+' renderer');const beginning=await page.evaluate(()=>{
      const v=frontier.view,s=frontier.sim;for(let i=0;i<100;i++)v.adapt(.5);
      const tc=s.owned(0,'building','towncenter')[0];v.render(.016,false);const node=v.nodes.get(tc.id);let buildingTriangles=0,buildingSolidTriangles=0;node.traverse(p=>{if(!p.isMesh||p===node.userData.ring)return;const g=p.geometry,pos=g.attributes.position,count=g.index?.count??pos.count;buildingTriangles+=count/3;for(let i=0;i<count;i+=3){const at=k=>{const n=g.index?g.index.getX(i+k):i+k;return [pos.getX(n),pos.getY(n),pos.getZ(n)];},a=at(0),b=at(1),c=at(2),u=b.map((n,k)=>n-a[k]),w=c.map((n,k)=>n-a[k]),area=(u[1]*w[2]-u[2]*w[1])**2+(u[2]*w[0]-u[0]*w[2])**2+(u[0]*w[1]-u[1]*w[0])**2;if(area>1e-16)buildingSolidTriangles++;}});
      let finite=true;v.objects.traverse(p=>{if(!p.matrixWorld.elements.every(Number.isFinite))finite=false;});
      return {quality:v.settings.quality,appliedQuality:v.renderQuality,automatic:v.settings.autoQuality,scale:v.dynamicScale,art:v.artDiagnostics,artCache:v.artCacheDiagnostics,surfaces:v.surfaceDiagnostics,buildingTriangles,buildingSolidTriangles,finite,memory:{...v.renderer.info.memory},saved:JSON.parse(localStorage.getItem('crowns-settings')),at:performance.now(),clock:v.clock,frames:v.renderer.info.render.frame,shadowUpdates:v.shadowDiagnostics?.updates||0};
    });
    console.log(quality+' initial renderer checked');await page.waitForTimeout(1500);
    const check=await page.evaluate(b=>{const v=frontier.view;return {...b,documentHidden:document.hidden,naturalFrames:{frames:v.renderer.info.render.frame-b.frames,elapsed:performance.now()-b.at,renderClock:v.clock-b.clock},shadows:{enabled:v.renderer.shadowMap.enabled,hasMap:!!v.sun.shadow.map,updates:(v.shadowDiagnostics?.updates||0)-b.shadowUpdates,diagnostics:v.shadowDiagnostics}};},beginning);
    assert.equal(check.quality,quality);assert.equal(check.automatic,false);assert.equal(check.scale,1);assert.equal(check.art.models,126);assert.ok(check.finite);assert.equal(check.saved.quality,quality);
    assert.equal(check.documentHidden,false);assert.ok(check.naturalFrames.frames>0);assert.equal(check.shadows.enabled,quality!=='low');if(quality==='low')assert.equal(check.shadows.updates,0);else {assert.ok(check.shadows.hasMap);assert.ok(check.shadows.updates>0&&check.shadows.updates<=Math.ceil(check.naturalFrames.renderClock*(quality==='high'?30:20))+2);}
    await page.screenshot({path:`artifacts/graphics-${quality}-desktop.png`});
    console.log(quality+' desktop captured');
    await page.setViewportSize({width:640,height:360});await page.evaluate(()=>frontier.select([frontier.sim.owned(0,'unit','villager')[0].id]));
    const phone=await page.evaluate(()=>({coarsePointer:matchMedia('(pointer: coarse)').matches,overflow:document.documentElement.scrollWidth>innerWidth,deselect:(()=>{const r=document.querySelector('#deselect-control').getBoundingClientRect();return {width:r.width,height:r.height};})()}));assert.equal(phone.coarsePointer,true);assert.equal(phone.overflow,false);assert.ok(phone.deselect.width>=44&&phone.deselect.height>=44);
    await page.screenshot({path:`artifacts/graphics-${quality}-phone.png`});await page.setViewportSize({width:1280,height:720});await page.evaluate(()=>frontier.select([]));report.checks.push({...check,phone});
  }
  if(!requested){assert.equal(report.checks[1].buildingSolidTriangles,report.checks[2].buildingSolidTriangles,'Balanced retains the visible High capital geometry');assert.ok(report.checks[1].buildingSolidTriangles>report.checks[0].buildingSolidTriangles);}
  markStage('manual preference reload');const finalQuality=qualities.at(-1);await page.reload({waitUntil:'domcontentloaded'});await page.waitForFunction(()=>window.frontier?.view);assert.equal(await page.evaluate(()=>frontier.view.settings.quality),finalQuality);assert.equal(await page.evaluate(()=>frontier.view.settings.autoQuality),false);
  await page.evaluate(()=>frontier.action('settings'));assert.equal(await page.locator('#quality').inputValue(),finalQuality);await page.locator('#quality').selectOption('auto');await page.locator('[data-action=apply-settings]').click();assert.equal(await page.evaluate(()=>frontier.view.settings.autoQuality),true);
  report.manualReload=true;report.automaticChoice=true;assert.deepEqual(report.errors,[]);report.passed=true;console.log(JSON.stringify(report,null,2));
}catch(error){report.failure??=error.message;report.stage=stage;let timer;try{report.failureState=await Promise.race([page.evaluate(()=>({quality:frontier.view.settings.quality,appliedQuality:frontier.view.renderQuality,loading:frontier.view.graphicsLoading,error:frontier.view.graphicsError,art:frontier.view.artDiagnostics,cache:frontier.view.artCacheDiagnostics,surfaceQuality:frontier.view.surfaceQuality,resources:performance.getEntriesByType('resource').filter(r=>r.name.includes('.glb')).map(r=>({url:r.name,duration:r.duration,size:r.transferSize}))})),new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error('Diagnostic timed out')),3000);})]);}catch{}finally{clearTimeout(timer);}throw error;}finally{report.scope=qualities;report.stageTimes.push({stage,ms:Date.now()-stageAt});fs.writeFileSync(reportPath,JSON.stringify(report,null,2));clearTimeout(watchdog);clearTimeout(overallWatchdog);if(browser)await browser.close();}
