import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import assert from 'node:assert/strict';
import {chromium} from 'playwright-core';
const root=path.resolve(process.env.QA_GAME_DIST||'dist'),report={passed:false,checks:[],errors:[],renderer:'SwiftShader software rendering; phone is emulated touch'};let browser;
const mime={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.svg':'image/svg+xml'};
const server=http.createServer((req,res)=>{const u=new URL(req.url,'http://localhost'),file=path.resolve(root,'.'+(u.pathname==='/'?'/index.html':decodeURIComponent(u.pathname)));if(!file.startsWith(root+path.sep)||!fs.existsSync(file)||!fs.statSync(file).isFile()){res.writeHead(404);res.end();return;}res.writeHead(200,{'Content-Type':mime[path.extname(file)]||'application/octet-stream','Cache-Control':'no-store'});fs.createReadStream(file).pipe(res);});
const guard=setTimeout(()=>browser?.close().catch(()=>{}),600000);
try{
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));browser=await chromium.connectOverCDP(process.env.QA_BROWSER_ENDPOINT);
 for(const phone of [false,true]){
  const quality=phone?'low':'high',next=phone?'high':'low';report.stage=phone?'phone':'desktop';console.log('Recovery '+report.stage);
  const page=await browser.newPage({viewport:phone?{width:640,height:360}:{width:960,height:640},isMobile:phone,hasTouch:phone,serviceWorkers:'block'});page.setDefaultTimeout(240000);page.on('pageerror',e=>report.errors.push(e.message));
  await page.addInitScript(quality=>localStorage.setItem('crowns-settings',JSON.stringify({quality,autoQuality:false,frameRate:'30',fog:false,volume:0,music:false,weather:'clear',lighting:'day'})),quality);
  await page.goto(`http://127.0.0.1:${server.address().port}/`,{waitUntil:'domcontentloaded',timeout:90000});await page.waitForFunction(()=>window.frontier?.view);report.buildId??=await page.locator('meta[name="frontier-build"]').getAttribute('content');
  await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>{window.qaNativeRAF=window.requestAnimationFrame.bind(window);window.requestAnimationFrame=callback=>{window.qaFrame=callback;return 0;};resolve();})));
  await page.evaluate(()=>{frontier.start({mode:'sandbox',map:'highlands',seed:512});frontier.action('pause');frontier.action('close');const v=frontier.view,s=frontier.sim;window.qaSim=s;v.focus(-40,36);v.zoom=32;v.angle=.3;v.updateCamera();v.render(0,false);window.qaBefore=JSON.stringify(s.serialize());window.qaCamera={target:v.target.toArray(),zoom:v.zoom,angle:v.angle,tilt:v.tilt};window.qaForest=v.buildForest;window.qaFailures=1;v.buildForest=function(...args){if(window.qaFailures-->0)throw new Error('QA partial forest replacement');return qaForest.apply(this,args);};frontier.action('settings');});
  await page.locator('#quality').selectOption(next);await page.locator('[data-action="apply-settings"]').click();
  await page.waitForFunction(()=>!frontier.view.graphicsLoading&&frontier.view.graphicsError);
  const restored=await page.evaluate(()=>{
    const v=frontier.view;v.render(0,false);
    return {sameMatch:frontier.sim===qaSim,sameState:JSON.stringify(frontier.sim.serialize())===qaBefore,quality:v.renderQuality,selected:v.settings.quality,savedPreference:JSON.parse(localStorage.getItem('crowns-settings')).quality,camera:{target:v.target.toArray(),zoom:v.zoom,angle:v.angle,tilt:v.tilt},error:v.graphicsError,valid:v.graphicsSceneValid,cache:v.artCacheDiagnostics,surface:v.surfaceDiagnostics,frame:v.renderer.info.render.frame,drawn:v.unitRenderDiagnostics.drawn,shadows:v.renderer.shadowMap.enabled,shadowSize:v.sun.shadow.mapSize.x,shaderErrors:v.renderer.info.programs.filter(p=>p.diagnostics?.runnable===false).length,beforeCamera:qaCamera};
  });
  assert.ok(restored.sameMatch&&restored.sameState&&restored.valid);assert.equal(restored.quality,quality);assert.equal(restored.selected,quality);assert.equal(restored.savedPreference,next);assert.deepEqual(restored.camera,restored.beforeCamera);assert.equal(restored.cache.retained,0);assert.equal(restored.cache.reservations,0);assert.ok(restored.drawn>0);assert.equal(restored.shadows,!phone);assert.equal(restored.shadowSize,phone?1024:2048);assert.equal(restored.shaderErrors,0);console.log('Partial failure restored '+JSON.stringify(restored));
  const fatal=await page.evaluate(async next=>{const v=frontier.view;window.qaFailures=Infinity;const applied=await v.quality(next),before=v.renderer.info.render.frame,time=frontier.sim.time;for(let i=0;i<12;i++)qaFrame(performance.now()+i*20);return {applied,fatal:!!v.graphicsFatal,valid:v.graphicsSceneValid,timeHeld:frontier.sim.time===time,frameHeld:v.renderer.info.render.frame===before,paused:frontier.paused,sameMatch:frontier.sim===qaSim,focused:document.activeElement?.dataset.action,autosaved:Object.keys(localStorage).filter(k=>k.includes('save')),viewport:{overflow:document.documentElement.scrollWidth>innerWidth,coarse:matchMedia('(pointer: coarse)').matches,touch:navigator.maxTouchPoints}};},next);
  assert.equal(fatal.applied,false);assert.ok(fatal.fatal&&!fatal.valid&&fatal.timeHeld&&fatal.frameHeld&&fatal.paused&&fatal.sameMatch);assert.equal(fatal.focused,'retry-battlefield');assert.ok(!fatal.viewport.overflow);if(phone)assert.ok(fatal.viewport.coarse&&fatal.viewport.touch>0);
  await page.keyboard.press('Escape');assert.ok(await page.locator('[data-action="retry-battlefield"]').isVisible());
  await page.evaluate(()=>{window.qaSetItem=Storage.prototype.setItem;Storage.prototype.setItem=function(key,value){if(key.includes('save'))throw new DOMException('QA full storage','QuotaExceededError');return qaSetItem.call(this,key,value);};});
  const beforeUrl=page.url();await page.locator('[data-action="reload-battlefield"]').click();assert.equal(page.url(),beforeUrl);assert.match(await page.locator('#graphics-recovery-note').innerText(),/could not be saved/);
  await page.screenshot({path:`artifacts/graphics-recovery-${phone?'phone':'desktop'}.png`});
  await page.evaluate(()=>{frontier.view.buildForest=qaForest;Storage.prototype.setItem=qaSetItem;});
  await page.locator('[data-action="retry-battlefield"]').click();await page.waitForFunction(()=>!frontier.view.graphicsLoading&&!frontier.view.graphicsFatal);
  const retry=await page.evaluate(()=>{const v=frontier.view;qaFrame(performance.now());v.render(0,false);return {sameMatch:frontier.sim===qaSim,valid:v.graphicsSceneValid,quality:v.renderQuality,fatal:v.graphicsFatal,paused:frontier.paused,modal:!!document.querySelector('[data-action="retry-battlefield"]'),cache:v.artCacheDiagnostics,frame:v.renderer.info.render.frame,drawn:v.unitRenderDiagnostics.drawn,shaderErrors:v.renderer.info.programs.filter(p=>p.diagnostics?.runnable===false).length};});
  assert.ok(retry.sameMatch&&retry.valid&&!retry.fatal&&!retry.modal&&!retry.paused);assert.equal(retry.quality,quality);assert.ok(retry.frame>restored.frame&&retry.drawn>0);assert.equal(retry.shaderErrors,0);assert.equal(retry.cache.retained,0);assert.equal(retry.cache.reservations,0);
  await page.screenshot({path:`artifacts/graphics-recovered-${phone?'phone':'desktop'}.png`});report.checks.push({phone,quality,restored,fatal,retry});console.log('Recovery complete '+JSON.stringify(retry));await page.close();
 }
 assert.deepEqual(report.errors,[]);report.passed=true;
}catch(error){report.failure=error.stack;process.exitCode=1;console.log(error.stack);}
finally{clearTimeout(guard);fs.writeFileSync('artifacts/graphics-recovery-qa.json',JSON.stringify(report,null,2));await browser?.close().catch(()=>{});await new Promise(resolve=>server.close(resolve));}
