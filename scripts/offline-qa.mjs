import assert from 'node:assert/strict';
import fs from 'node:fs';
import {preview} from 'vite';
import {chromium} from 'playwright-core';

const offlinePort=Number(process.env.QA_OFFLINE_PORT)||4174;
const report={passed:false,checks:[],errors:[]};report.checks.push=function(...items){console.log(JSON.stringify(items));return Array.prototype.push.apply(this,items);};
let server=await preview({preview:{host:'127.0.0.1',port:offlinePort,strictPort:true}});
const base=server.resolvedUrls.local[0];
let browser;
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function entries(page){
  return page.evaluate(async()=>{
    const urls=[];
    for(const name of await caches.keys()){
      if(!name.startsWith('frontier-'))continue;
      const cache=await caches.open(name);
      urls.push(...(await cache.keys()).map(request=>new URL(request.url).pathname));
    }
    return [...new Set(urls)].sort();
  });
}
async function waitForCache(page,predicate,label){
  for(let attempt=0;attempt<40;attempt++){
    const cached=await entries(page);
    if(predicate(cached))return cached;
    await sleep(250);
  }
  throw new Error('Cache did not contain '+label);
}
try {
  browser=process.env.QA_BROWSER_ENDPOINT?await chromium.connectOverCDP(process.env.QA_BROWSER_ENDPOINT):await chromium.launch({channel:'msedge',headless:true,args:['--enable-webgl','--ignore-gpu-blocklist']});
  const context=await browser.newContext({viewport:{width:960,height:640}});
  const page=await context.newPage();
  page.setDefaultNavigationTimeout(90000);
  page.setDefaultTimeout(90000);
  page.on('requestfailed',r=>console.log('request-failed',new URL(r.url()).pathname,r.failure()?.errorText));
  page.on('pageerror',error=>report.errors.push(error.message));
  page.on('console',message=>{if(message.type()==='error'&&!message.location().url.endsWith('/version.json'))report.errors.push(message.text().slice(0,500));});
  await page.addInitScript(()=>{if(!localStorage.getItem('crowns-settings'))localStorage.setItem('crowns-settings',JSON.stringify({quality:'low',autoQuality:false,weather:'clear',music:false,volume:0}));});
  await page.goto(base,{waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>!!window.frontier?.view,null,{timeout:90000});
  let controlled=false;
  for(let attempt=0;attempt<120&&!controlled;attempt++){
    controlled=await page.evaluate(()=>!!navigator.serviceWorker.controller);
    if(!controlled)await sleep(500);
  }
  assert.equal(controlled,true,'the page must be controlled by the offline service worker');
  const lowCache=await waitForCache(page,urls=>urls.some(url=>/frontier-low-.*\.glb$/.test(url)),'the Low catalogue');
  const lowGlbs=lowCache.filter(url=>url.endsWith('.glb'));
  assert.equal(lowGlbs.filter(url=>/frontier-low-/.test(url)).length,1);
  assert.equal(lowGlbs.filter(url=>/frontier-trees-/.test(url)).length,1);
  assert.equal(lowGlbs.filter(url=>/frontier-bridge-/.test(url)).length,1);
  assert.equal(lowGlbs.filter(url=>/frontier-(near|balanced)-/.test(url)).length,0,'optional catalogues must stay out of install');
  const colorJpegs=lowCache.filter(url=>/_(?:color)-[^/]+\.jpg$/.test(url));
  const colorKtx2=lowCache.filter(url=>/_(?:color)-[^/]+\.ktx2$/.test(url));
  assert.equal(colorJpegs.length,7,'all seven Low color fallbacks must be precached');
  assert.equal(colorKtx2.length,7,'all seven Low color KTX2 maps must be precached');
  assert.equal(lowCache.filter(url=>/_(?:normal|arm)-[^/]+\.ktx2$/.test(url)).length,0,'optional KTX2 maps must stay out of install');
  assert.ok(lowCache.some(url=>/character-color-.*\.png$/.test(url)));
  report.checks.push({name:'Low install is staged',glbs:lowGlbs.map(url=>url.split('/').at(-1)),colorJpegs:colorJpegs.length,colorKtx2:colorKtx2.length,cacheEntries:lowCache.length});

  server.httpServer.closeAllConnections?.();await new Promise(resolve=>server.httpServer.close(resolve));console.log('origin stopped');
  await page.reload({waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>!!window.frontier?.view,null,{timeout:90000});
  await page.evaluate(()=>frontier.start({mode:'sandbox',map:'highlands',seed:512}));
  await page.waitForFunction(()=>frontier.playing&&!frontier.view.graphicsLoading&&!frontier.view.graphicsRebuilding,null,{timeout:180000});
  assert.equal(await page.evaluate(()=>frontier.playing),true);
  report.checks.push({name:'Low starts and plays offline'});

  server=await preview({preview:{host:'127.0.0.1',port:offlinePort,strictPort:true}});console.log('origin restored');
  await page.evaluate(()=>frontier.action('settings'));
  await page.locator('#quality').selectOption('high');
  await page.locator('[data-action=apply-settings]').click();
  await page.waitForFunction(()=>frontier.view.artDiagnostics?.detail==='high'&&frontier.view.surfaceQuality==='high'&&!frontier.view.graphicsLoading&&!frontier.view.graphicsRebuilding,null,{timeout:180000});
  let highCache=await waitForCache(page,urls=>urls.some(url=>/frontier-near-.*\.glb$/.test(url)),'the High catalogue');
  const ktx2Requests=await page.evaluate(()=>performance.getEntriesByType('resource').filter(entry=>entry.name.endsWith('.ktx2')).map(entry=>new URL(entry.name).pathname));
  if(ktx2Requests.length)highCache=await waitForCache(page,urls=>ktx2Requests.every(url=>urls.includes(url)),'all requested KTX2 maps');
  const cachedKtx2=highCache.filter(url=>url.endsWith('.ktx2'));
  assert.ok(cachedKtx2.length>0,'the High KTX2 maps must be runtime cached');
  assert.equal(highCache.filter(url=>/frontier-balanced-.*\.glb$/.test(url)).length,0,'unused Balanced catalogue must remain unbundled');
  report.checks.push({name:'High additions are cached after first use',near:highCache.find(url=>/frontier-near-.*\.glb$/.test(url)),ktx2:cachedKtx2.length});

  server.httpServer.closeAllConnections?.();await new Promise(resolve=>server.httpServer.close(resolve));console.log('origin stopped');
  await page.reload({waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>!!window.frontier?.view,null,{timeout:90000});
  await page.evaluate(()=>frontier.start({mode:'sandbox',map:'highlands',seed:512}));
  await page.waitForFunction(()=>frontier.playing&&frontier.view.artDiagnostics?.detail==='high'&&!frontier.view.graphicsLoading&&!frontier.view.graphicsRebuilding,null,{timeout:180000});
  assert.equal(await page.evaluate(()=>frontier.playing),true);
  report.checks.push({name:'High starts and plays offline after first use'});
  assert.deepEqual(report.errors,[]);
  report.passed=true;
  console.log(JSON.stringify(report,null,2));
} catch(error){
  report.failure=error.message;
  console.log(JSON.stringify(report,null,2));
  throw error;
} finally {
  try{if(browser)await browser.close();}finally{
    if(server.httpServer.listening){server.httpServer.closeAllConnections?.();await new Promise(resolve=>server.httpServer.close(resolve));}
    fs.mkdirSync('artifacts',{recursive:true});fs.writeFileSync('artifacts/offline-production-qa.json',JSON.stringify(report,null,2));
  }
}
