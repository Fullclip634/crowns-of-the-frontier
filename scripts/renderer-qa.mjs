import {chromium} from 'playwright-core';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const output=process.env.QA_OUTPUT||'artifacts/renderer-qa.json';
fs.mkdirSync(path.dirname(output),{recursive:true});
const browser=process.env.QA_BROWSER_ENDPOINT
  ?await chromium.connectOverCDP(process.env.QA_BROWSER_ENDPOINT)
  :await chromium.launch({channel:process.env.QA_BROWSER_CHANNEL||'msedge',headless:true});
const report={startedAt:new Date().toISOString(),checks:[],messages:[]};
const knownWarning=text=>/powerPreference option|WebGPU could not start; using WebGL 2:|WebGPURenderer: WebGPU is not available, running under WebGL2 backend\./.test(text)
  ||text.startsWith('THREE.WebGLProgram: Program Info Log:')&&text.includes('warning X4122:')&&!text.includes('error ');
try{
  for(const mode of (process.env.QA_RENDERERS||'webgl,webgpu,fallback').split(',')){
    assert.ok(['webgl','webgpu','fallback','default','default-fallback','default-no-adapter'].includes(mode));
    console.log('Renderer check '+mode);
    const context=await browser.newContext({viewport:{width:800,height:500},hasTouch:true,serviceWorkers:'allow'});
    const page=await context.newPage();page.setDefaultTimeout(240000);page.setDefaultNavigationTimeout(90000);
    const nodeRequests=[];page.on('request',request=>{if(/\/render-nodes-[^/]+\.js(?:\?|$)/.test(request.url()))nodeRequests.push(request.url());});
    page.on('pageerror',error=>report.messages.push({mode,type:'pageerror',text:error.stack}));
    page.on('console',message=>{if(['warning','error'].includes(message.type()))report.messages.push({mode,type:message.type(),text:message.text()});});
    if(['fallback','default-fallback'].includes(mode))await page.addInitScript(()=>Object.defineProperty(Navigator.prototype,'gpu',{get:()=>undefined,configurable:true}));
    if(mode==='default-no-adapter')await page.addInitScript(()=>{window.qaAdapterRequests=0;Object.defineProperty(Navigator.prototype,'gpu',{get:()=>({requestAdapter:async()=>{window.qaAdapterRequests++;return null;}}),configurable:true});});
    await page.addInitScript(()=>localStorage.setItem('crowns-settings',JSON.stringify({quality:'low',autoQuality:false,frameRate:'30',fog:false,weather:'clear',lighting:'day',volume:0,music:false})));
    const url=new URL(process.env.QA_URL||'http://localhost:4173/');if(mode.startsWith('default'))url.searchParams.delete('renderer');else url.searchParams.set('renderer',mode==='fallback'?'webgpu':mode);
    await page.goto(url.href,{waitUntil:'domcontentloaded'});await page.waitForFunction(()=>window.frontier?.view);
    report.buildId??=await page.locator('meta[name="frontier-build"]').getAttribute('content');
    const expected=['webgpu','default'].includes(mode)?'webgpu':'webgl';assert.equal(await page.evaluate(()=>document.documentElement.dataset.renderer),expected);
    const check={mode,expected,url:page.url(),queryRenderer:await page.evaluate(()=>new URLSearchParams(location.search).get('renderer')),nativeModuleRequests:nodeRequests.length,qualities:[]};report.checks.push(check);
    if(mode==='default-no-adapter')assert.equal(check.nativeModuleRequests,0,'Rejected adapters must reach compatibility graphics before loading the node engine.');
    if(mode.startsWith('default'))assert.equal(check.queryRenderer,null);
    if(mode==='default-no-adapter'){check.adapterRequests=await page.evaluate(()=>qaAdapterRequests);assert.ok(check.adapterRequests>0);}
    await page.evaluate(()=>frontier.action('settings'));check.status=await page.locator('#renderer-status').innerText();assert.match(check.status,expected==='webgpu'?/WebGPU is active/:/WebGL 2/);if(mode.startsWith('default-'))assert.match(check.status,/WebGPU could not start/);await page.evaluate(()=>frontier.action('close'));
    await page.evaluate(async()=>{
      frontier.start({mode:'sandbox',map:'rivers',seed:512});frontier.action('pause');document.querySelector('#modal-root').style.visibility='hidden';
      const v=frontier.view,s=frontier.sim;window.qaRender=v.render.bind(v);v.render=()=>false;
      window.qaDraw=async()=>{const queue=v.renderer.backend?.device?.queue;if(queue)await queue.onSubmittedWorkDone();qaRender(.05,false);if(queue)await queue.onSubmittedWorkDone();};
      s.entities=s.entities.filter(e=>e.kind==='resource');s.visible.fill(1);
      s.addUnit('ram',0,-10,10);s.addUnit('catapult',0,-4,10);s.addUnit('archer',0,-7,13);s.addUnit('archer',1,-1,12);
      s.addBuilding('house',0,-14,19).progress=1;s.addBuilding('towncenter',1,6,15).progress=1;
      v.attach(s);v.focus(-3,10);v.zoom=30;v.tilt=.6;v.angle=.65;v.updateCamera();await qaDraw();
    });
    for(const quality of ['high','medium','low']){
      const result=await page.evaluate(async quality=>{
        const v=frontier.view,s=frontier.sim,before=JSON.stringify(s.serialize());v.render=qaRender;
        const applied=await v.quality(quality);await new Promise(resolve=>setTimeout(resolve,500));v.render=()=>false;await qaDraw();
        return {quality,applied,actual:v.renderQuality,sameMatch:s===frontier.sim&&JSON.stringify(s.serialize())===before,valid:v.graphicsSceneValid,fatal:v.graphicsFatal,flight:v.renderFlight&&{...v.renderFlight},surfaces:v.surfaceDiagnostics,drawn:v.unitRenderDiagnostics.drawn,indexedUnits:[...v.unitBatches].flatMap(([type,batch])=>batch.parts.filter(part=>part.userData.rigidRig).map(part=>({type,vertices:part.geometry.attributes.position.count,indices:part.geometry.index?.count||0})))};
      },quality);check.qualities.push(result);console.log(JSON.stringify(result));
      assert.ok(result.applied&&result.actual===quality&&result.sameMatch&&result.valid&&!result.fatal&&result.drawn===4);
      assert.ok(result.indexedUnits.length>0&&result.indexedUnits.every(part=>part.indices>0));
      await page.screenshot({path:path.join(path.dirname(output),`renderer-${mode}-${quality}.png`)});
    }
    check.features=await page.evaluate(async()=>{
      const v=frontier.view,s=frontier.sim,e=s.addBuilding('house',0,-13,8);e.progress=.25;await qaDraw();
      const n=v.nodes.get(e.id),construction=!!n.userData.construction,clipping=n.userData.construction?.group?.isClippingGroup||!!n.userData.construction?.materials?.length;
      e.progress=1;await qaDraw();const completed=!n.userData.construction;
      v.showGhost('house',-15,13,false);await qaDraw();const ghost=[];v.ghost.traverse(m=>{if(m.isMesh)ghost.push({alpha:m.material.opacity,color:m.material.color.getHex()});});v.hideGhost();
      v.settings.weather='storm';v.settings.lighting='night';v.weather.strength=v.weather.cloudiness=v.weather.daylight.amount=1;
      frontier.select([s.entities.find(e=>e.owner===0&&e.type==='archer').id]);await qaDraw();document.querySelector('.selection-details')?.click();await qaDraw();await v.modelPortrait?.initializing;await qaDraw();
      return {construction,clipping,completed,ghost,weather:v.weatherDiagnostics,lighting:v.lightingState,portrait:{ready:v.modelPortrait?.ready,disabled:v.portraitDisabled||false,width:v.modelPortrait?.width}};
    });
    const f=check.features;assert.ok(f.construction&&f.clipping&&f.completed&&f.weather.rain>0&&f.lighting.night>.9&&f.portrait.ready&&!f.portrait.disabled&&f.portrait.width>0);assert.ok(f.ghost.every(m=>m.color===0xee816a&&m.alpha===.38));
    await page.setViewportSize({width:740,height:360});await page.evaluate(()=>qaDraw());
    check.phone=await page.evaluate(()=>({width:innerWidth,scroll:document.documentElement.scrollWidth,canvas:frontier.view.renderer.domElement.getBoundingClientRect().toJSON()}));assert.ok(check.phone.scroll<=check.phone.width&&check.phone.canvas.width>=check.phone.width-1);
    const image=path.join(path.dirname(output),'renderer-'+mode+'-landscape.png');await page.screenshot({path:image});
    if(['webgpu','default'].includes(mode)&&process.env.QA_OFFLINE==='1'){
      await page.waitForFunction(()=>!!navigator.serviceWorker.controller);
      check.offline=await page.evaluate(async()=>{const cache=await caches.open((await caches.keys()).find(k=>k.startsWith('frontier-'))),files=(await cache.keys()).map(r=>r.url);return {nodeChunk:files.some(f=>/render-nodes-.*\.js$/.test(f)),catalogues:files.filter(f=>f.endsWith('.glb')).length};});
      assert.ok(check.offline.nodeChunk&&check.offline.catalogues===3);
      await context.setOffline(true);await page.reload({waitUntil:'load'});await page.waitForFunction(()=>window.frontier?.view);assert.equal(await page.evaluate(()=>document.documentElement.dataset.renderer),'webgpu');
      await page.evaluate(()=>frontier.start({mode:'sandbox',map:'highlands',seed:512}));assert.equal(await page.evaluate(()=>frontier.playing),true);check.offline.reload=true;check.offline.gameplay=true;
    }
    await context.close();
  }
  const unexpected=report.messages.filter(m=>m.type!=='warning'||!knownWarning(m.text));assert.deepEqual(unexpected,[]);report.passed=true;
}catch(error){report.failure=error.stack;process.exitCode=1;}
finally{fs.mkdirSync(path.dirname(output),{recursive:true});fs.writeFileSync(output,JSON.stringify(report,null,2));await browser.close();}
console.log(JSON.stringify({passed:report.passed,output,failure:report.failure}));
