import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {chromium} from 'playwright-core';
import {capturePaintedBattlefield} from './painted-battlefield-qa.mjs';

const output=process.env.QA_OUTPUT||'artifacts/startup-compatibility-browser/validation.json';
fs.mkdirSync(path.dirname(output),{recursive:true});
const browser=await chromium.connectOverCDP(process.env.QA_BROWSER_ENDPOINT),report={startedAt:new Date().toISOString(),browser:browser.version(),harness:process.env.QA_TCP_BROWSER,gpuBlocklistOverride:true,softwareRendering:process.env.QA_TCP_BROWSER==='shell',limitations:'Emulated phone layout and injected native failure; not a physical Infinix test or an FPS benchmark.',messages:[]};
try{
  const context=await browser.newContext({viewport:{width:568,height:320},hasTouch:true,isMobile:true,serviceWorkers:'allow'}),page=await context.newPage();page.setDefaultTimeout(180000);
  page.on('pageerror',error=>report.messages.push({type:'pageerror',text:error.stack}));
  page.on('console',message=>{if(['error','warning'].includes(message.type()))report.messages.push({type:message.type(),text:message.text()});});
  await page.addInitScript(()=>{
    localStorage.setItem('crowns-settings',JSON.stringify({quality:'low',autoQuality:false,frameRate:'30',fog:false,weather:'clear',lighting:'day',volume:0,music:false}));
    sessionStorage.setItem('qa-loads',String(Number(sessionStorage.getItem('qa-loads')||0)+1));
  });
  const base=new URL(process.env.QA_URL);await page.goto(base.href,{waitUntil:'domcontentloaded'});await page.waitForFunction(()=>window.frontier?.view);
  report.buildId=await page.locator('meta[name="frontier-build"]').getAttribute('content');
  assert.equal(await page.evaluate(()=>document.documentElement.dataset.renderer),'webgpu','exercise a real initialized native renderer before injecting its failure');
  console.log('Injecting native startup failure');
  await page.evaluate(()=>frontier.view.renderer.onError({type:'GPUValidationError',message:'QA injected native startup failure'}));
  await page.waitForURL(url=>url.searchParams.get('renderer')==='webgl');await page.waitForFunction(()=>window.frontier?.view);
  report.startup=await page.evaluate(()=>({renderer:document.documentElement.dataset.renderer,loads:Number(sessionStorage.getItem('qa-loads')),fatal:frontier.view.graphicsFatal||null,dialog:!!document.querySelector('[data-action="reload-battlefield"]'),quality:frontier.view.settings.quality}));
  assert.deepEqual(report.startup,{renderer:'webgl',loads:2,fatal:null,dialog:false,quality:'low'});
  if(process.env.QA_GRAPHICS_REPORTS==='1'){
    await page.evaluate(()=>frontier.action('settings'));assert.equal(await page.locator('#graphics-report').isVisible(),false);assert.equal(await page.locator('.graphics-support').getAttribute('open'),null);
    await page.screenshot({path:path.join(path.dirname(output),'graphics-settings-568x320.png')});
    await page.locator('.graphics-support > summary').click();assert.equal(await page.locator('#graphics-report').isVisible(),false);
    await page.screenshot({path:path.join(path.dirname(output),'graphics-help-568x320.png')});
    report.diagnostics=JSON.parse(await page.locator('#graphics-report').inputValue());
    assert.equal(report.diagnostics.current.active,'webgl');assert.equal(report.diagnostics.lastFailure.active,'webgpu');assert.equal(report.diagnostics.lastFailure.phase,'landing');assert.equal(report.diagnostics.lastFailure.failure.message,'QA injected native startup failure');
    await page.evaluate(()=>Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:async text=>{window.qaCopiedReport=text;}}}));
    await page.locator('[data-action="copy-graphics-report"]').click();assert.deepEqual(JSON.parse(await page.evaluate(()=>qaCopiedReport)),report.diagnostics);assert.equal(await page.locator('#graphics-report').isVisible(),false);
    await page.locator('.graphics-report-details > summary').click();assert.equal(await page.locator('#graphics-report').isVisible(),true);await page.locator('.graphics-report-details > summary').click();assert.equal(await page.locator('#graphics-report').isVisible(),false);report.compactHelp={hiddenInSettings:true,hiddenInHelp:true,hiddenAfterCopy:true,explicitViewAndClose:true};
    await page.evaluate(()=>Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:async()=>{throw Error('QA denied clipboard');}}}));
    await page.locator('[data-action="copy-graphics-report"]').click();report.manualCopy=await page.locator('#graphics-report').evaluate(field=>({selected:field.selectionEnd-field.selectionStart,length:field.value.length,selectable:getComputedStyle(field).userSelect,overflow:document.documentElement.scrollWidth>innerWidth}));
    assert.equal(report.manualCopy.selected,report.manualCopy.length);assert.equal(report.manualCopy.selectable,'text');assert.equal(report.manualCopy.overflow,false);assert.equal(await page.locator('#graphics-report').isVisible(),true);report.compactHelp.revealedForManualCopy=true;
    await page.screenshot({path:path.join(path.dirname(output),'graphics-support-568x320.png')});await page.evaluate(()=>frontier.action('close'));
  }
  await page.goto(base.href,{waitUntil:'domcontentloaded'});await page.waitForFunction(()=>window.frontier?.view);
  report.reopen=await page.evaluate(()=>({renderer:document.documentElement.dataset.renderer,loads:Number(sessionStorage.getItem('qa-loads')),query:new URL(location.href).searchParams.get('renderer')}));
  assert.deepEqual(report.reopen,{renderer:'webgl',loads:3,query:null});
  if(process.env.QA_GRAPHICS_REPORTS==='1'){
    await page.evaluate(()=>frontier.action('settings'));const retained=JSON.parse(await page.locator('#graphics-report').inputValue());assert.equal(retained.lastFailure.failure.message,'QA injected native startup failure');await page.evaluate(()=>frontier.action('close'));report.failureRetainedAfterReopen=true;
  }
  await page.evaluate(()=>frontier.start({mode:'sandbox',map:'highlands',seed:512}));
  report.smallPhone=(await capturePaintedBattlefield(page,path.join(path.dirname(output),'compatible-568x320.png'))).pixels;
  await page.setViewportSize({width:740,height:360});report.phone=(await capturePaintedBattlefield(page,path.join(path.dirname(output),'compatible-740x360.png'))).pixels;
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
  // An explicit retry stays available. A fault after starting a match must
  // preserve the current game and require its existing save/reload action.
  const retry=new URL(base);retry.searchParams.set('renderer','webgpu');await page.goto(retry.href,{waitUntil:'domcontentloaded'});await page.waitForFunction(()=>window.frontier?.view);
  assert.equal(await page.evaluate(()=>document.documentElement.dataset.renderer),'webgpu');
  await page.evaluate(()=>{frontier.start({mode:'sandbox',map:'highlands',seed:713});frontier.view.renderer.onError({type:'GPUValidationError',message:'QA injected in-match failure'});});
  await page.locator('[data-action="reload-battlefield"]').waitFor();
  report.matchHeld=await page.evaluate(()=>({native:new URL(location.href).searchParams.get('renderer')==='webgpu',playing:frontier.playing,paused:frontier.paused,loads:Number(sessionStorage.getItem('qa-loads')),seed:frontier.sim.options.seed}));
  assert.deepEqual(report.matchHeld,{native:true,playing:true,paused:true,loads:4,seed:713});
  if(process.env.QA_GRAPHICS_REPORTS==='1'){const failure=JSON.parse(await page.locator('#graphics-report').inputValue()).lastFailure;assert.equal(failure.phase,'battle');assert.equal(failure.failure.message,'QA injected in-match failure');report.battleFailureReported=true;}
  await page.locator('[data-action="reload-battlefield"]').click();await page.waitForURL(url=>url.searchParams.get('renderer')==='webgl');await page.waitForFunction(()=>window.frontier?.view);
  await page.locator('[data-action="resume"]').click();await page.waitForFunction(()=>frontier.playing);
  report.resumed=await page.evaluate(()=>({renderer:document.documentElement.dataset.renderer,seed:frontier.sim.options.seed,fatal:frontier.view.graphicsFatal||null}));
  assert.deepEqual(report.resumed,{renderer:'webgl',seed:713,fatal:null});
  if(process.env.QA_GRAPHICS_REPORTS==='1'){
    await page.evaluate(()=>frontier.action('settings'));const summary=page.locator('.graphics-support > summary');await summary.focus();await page.keyboard.press('Space');assert.equal(await page.locator('.graphics-support').getAttribute('open'),'');
    const details=page.locator('.graphics-report-details > summary');await details.focus();await page.keyboard.press('Space');assert.equal(await page.locator('#graphics-report').isVisible(),true);await page.keyboard.press('Space');assert.equal(await page.locator('#graphics-report').isVisible(),false);report.inMatchHelpKeyboard=true;await page.evaluate(()=>frontier.action('close'));
  }
  if(process.env.QA_GRAPHICS_REPORTS==='1'){
    await page.close();const unsupported=await context.newPage();report.unsupportedMessages=[];
    unsupported.on('pageerror',error=>report.unsupportedMessages.push({type:'pageerror',text:error.stack}));unsupported.on('console',message=>{if(['warning','error'].includes(message.type()))report.unsupportedMessages.push({type:message.type(),text:message.text()});});
    await unsupported.addInitScript(()=>{Object.defineProperty(Navigator.prototype,'gpu',{get:()=>undefined,configurable:true});const get=HTMLCanvasElement.prototype.getContext;HTMLCanvasElement.prototype.getContext=function(type,...args){return ['webgl2','webgl','experimental-webgl'].includes(type)?null:get.call(this,type,...args);};});
    await unsupported.goto(base.href,{waitUntil:'domcontentloaded'});await unsupported.waitForFunction(()=>window.frontier&&!frontier.view);await unsupported.locator('.graphics-support > summary').click();assert.equal(await unsupported.locator('#graphics-report').isVisible(),false);
    const captured=JSON.parse(await unsupported.locator('#graphics-report').inputValue());assert.equal(captured.lastFailure.phase,'initialization');assert.match(captured.lastFailure.failure.message,/WebGL context/);
    await unsupported.evaluate(()=>Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:async text=>{window.qaCopiedReport=text;}}}));await unsupported.locator('[data-action="copy-graphics-report"]').click();assert.deepEqual(JSON.parse(await unsupported.evaluate(()=>qaCopiedReport)),captured);
    assert.deepEqual(report.unsupportedMessages.filter(message=>message.type==='pageerror'),[]);report.unsupportedReportCopy=true;assert.equal(await unsupported.locator('#graphics-report').isVisible(),false);report.compactHelp.hiddenDuringUnsupportedCopy=true;
    await unsupported.screenshot({path:path.join(path.dirname(output),'graphics-unavailable-report-568x320.png')});
  }
  const expected=text=>/powerPreference option|QA injected native startup failure|QA injected in-match failure/.test(text)||text==='THREE.WebGLRenderer: KHR_parallel_shader_compile extension not supported.'
    ||text.startsWith('THREE.WebGLProgram: Program Info Log:')&&text.includes('warning X4122:')&&!text.includes('error ');
  assert.deepEqual(report.messages.filter(message=>message.type==='pageerror'||!expected(message.text)),[]);
  await context.close();if(process.env.QA_OBJECTIVES==='1'){const {verifyObjectivePanel}=await import('./objective-panel-qa.mjs');report.objectives=await verifyObjectivePanel(browser,base,output);}report.passed=true;
}catch(error){report.failure=error.stack;process.exitCode=1;}
finally{fs.writeFileSync(output,JSON.stringify(report,null,2)+'\n');await browser.close();}
console.log(JSON.stringify({passed:report.passed,output,failure:report.failure}));
