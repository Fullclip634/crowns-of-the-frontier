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
  await page.goto(base.href,{waitUntil:'domcontentloaded'});await page.waitForFunction(()=>window.frontier?.view);
  report.reopen=await page.evaluate(()=>({renderer:document.documentElement.dataset.renderer,loads:Number(sessionStorage.getItem('qa-loads')),query:new URL(location.href).searchParams.get('renderer')}));
  assert.deepEqual(report.reopen,{renderer:'webgl',loads:3,query:null});
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
  await page.locator('[data-action="reload-battlefield"]').click();await page.waitForURL(url=>url.searchParams.get('renderer')==='webgl');await page.waitForFunction(()=>window.frontier?.view);
  await page.locator('[data-action="resume"]').click();await page.waitForFunction(()=>frontier.playing);
  report.resumed=await page.evaluate(()=>({renderer:document.documentElement.dataset.renderer,seed:frontier.sim.options.seed,fatal:frontier.view.graphicsFatal||null}));
  assert.deepEqual(report.resumed,{renderer:'webgl',seed:713,fatal:null});
  const expected=text=>/powerPreference option|QA injected native startup failure|QA injected in-match failure/.test(text)||text==='THREE.WebGLRenderer: KHR_parallel_shader_compile extension not supported.'
    ||text.startsWith('THREE.WebGLProgram: Program Info Log:')&&text.includes('warning X4122:')&&!text.includes('error ');
  assert.deepEqual(report.messages.filter(message=>message.type==='pageerror'||!expected(message.text)),[]);
  report.passed=true;await context.close();
}catch(error){report.failure=error.stack;process.exitCode=1;}
finally{fs.writeFileSync(output,JSON.stringify(report,null,2)+'\n');await browser.close();}
console.log(JSON.stringify({passed:report.passed,output,failure:report.failure}));
