import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import assert from 'node:assert/strict';
import WebSocket from 'ws';
import {chromium} from 'playwright-core';
import {attachRooms} from '../server/rooms.js';
import {battlePreset} from '../src/custom-battle.js';

const baseline=process.env.QA_EXPECT_SAVE_BUG==='1',root=path.resolve(process.env.QA_GAME_DIST||'dist');
const report={passed:false,baseline,stage:'server',checks:[],errors:[],renderer:'Software SwiftShader; save/menu checks, not physical-device performance'};
const reportFile=`artifacts/local-save-${baseline?'before':'browser-qa'}.json`,clients=[];
const types={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.svg':'image/svg+xml'};
const server=http.createServer((request,response)=>{const pathname=new URL(request.url,'http://localhost').pathname,file=path.resolve(root,'.'+(pathname==='/'?'/index.html':decodeURIComponent(pathname)));if(!file.startsWith(root+path.sep)||!fs.existsSync(file)||!fs.statSync(file).isFile()){response.writeHead(404);response.end();return;}response.writeHead(200,{'Content-Type':types[path.extname(file)]||'application/octet-stream','Cache-Control':'no-store'});fs.createReadStream(file).pipe(response);});
const service=attachRooms(server);let browser;
const stage=name=>{report.stage=name;console.log(name);};
const guard=setTimeout(()=>{report.failure='Save browser check exceeded six minutes';fs.writeFileSync(reportFile,JSON.stringify(report,null,2));for(const ws of clients)ws.terminate();service.close();browser?.close().finally(()=>process.exit(1));setTimeout(()=>process.exit(1),5000);},360000);
async function until(predicate){const deadline=Date.now()+30000;while(!predicate()&&Date.now()<deadline)await new Promise(resolve=>setTimeout(resolve,20));assert.ok(predicate(),'Expected room event within 30 seconds');}
async function hostRoom(){
  const ws=new WebSocket(`ws://127.0.0.1:${server.address().port}/socket`),messages=[];clients.push(ws);ws.on('message',bytes=>{const message=JSON.parse(bytes);if(message.type==='state')return;messages.push(message);if(messages.length>40)messages.shift();});await new Promise(resolve=>ws.once('open',resolve));
  const send=message=>ws.send(JSON.stringify(message)),next=async type=>{await until(()=>messages.some(message=>message.type===type));return messages.splice(messages.findIndex(message=>message.type===type),1)[0];};
  const slots=battlePreset('2v2');slots[1].controller='human';send({type:'create',name:'Host',options:{mode:'custom',map:'highlands',mapSize:'spacious',seed:512,slots}});const session=await next('session');return {send,next,room:service.rooms.get(session.code)};
}
try{
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));browser=process.env.QA_BROWSER_ENDPOINT?await chromium.connectOverCDP(process.env.QA_BROWSER_ENDPOINT):await chromium.launch({channel:'msedge',headless:true});const page=await browser.newPage({viewport:{width:960,height:640},serviceWorkers:'block'});page.setDefaultTimeout(90000);page.on('pageerror',error=>report.errors.push(error.message));
  await page.addInitScript(()=>localStorage.setItem('crowns-settings',JSON.stringify({quality:'low',frameRate:'30',autoQuality:false,music:false,volume:0,weather:'clear'})));
  stage('production-load');await page.goto(`http://127.0.0.1:${server.address().port}/`,{waitUntil:'domcontentloaded',timeout:90000});await page.waitForFunction(()=>window.frontier?.view);report.buildId=await page.locator('meta[name="frontier-build"]').getAttribute('content');
  // Keep this storage/network fixture cheap on a software GPU. The normal
  // game loop, Simulation, menus and WebSocket client remain in use.
  await page.evaluate(()=>{const view=frontier.view,draw=view.render.bind(view);let last=0;view.render=(...args)=>{const now=performance.now();if(now-last<1000)return;last=now;return draw(...args);};});
  stage('local-ai-save');await page.evaluate(()=>{frontier.start({mode:'custom',map:'highlands',mapSize:'spacious',seed:721,multiplayer:false});frontier.action('pause');frontier.sim.players[0].resources.gold=1234;frontier.sim.time=73;frontier.save();frontier.action('menu');});
  const original=await page.evaluate(()=>localStorage.getItem('crowns-save'));assert.equal(JSON.parse(original).options.multiplayer,false);assert.equal(JSON.parse(original).players[0].resources.gold,1234);
  async function joinRoom(){const host=await hostRoom();await page.evaluate(()=>frontier.action('lan'));await page.locator('#lan-name').fill('Guest');await page.locator('#lan-slot').selectOption('2');await page.locator('#lan-code').fill(host.room.code);await page.locator('[data-action=lan-join]').click();await page.locator('[data-action=lan-ready]').click();await until(()=>host.room.players.length===2&&host.room.players.every(p=>p.ready));host.send({type:'start'});await host.next('begin');host.room.sim.tick=()=>{};await page.waitForFunction(()=>frontier.playing&&frontier.sim.options.multiplayer&&frontier.sim.players[0].name==='Guest');return host;}
  stage('multiplayer-perspective');await joinRoom();const partial=await page.evaluate(()=>({multiplayer:frontier.sim.options.multiplayer,otherGold:frontier.sim.players[1].resources.gold,saveRefused:frontier.save()===false}));assert.ok(partial.multiplayer&&partial.otherGold===0&&partial.saveRefused);report.checks.push({partial});
  const networkSnapshot=await page.evaluate(()=>JSON.stringify(frontier.sim.serialize()));await page.evaluate(()=>frontier.action('pause'));const networkMenu=await page.locator('#modal-root').textContent();report.networkMenu={hasLocalSave:networkMenu.includes('Save kingdom'),hasSaveAndReturn:networkMenu.includes('Save & return')};
  stage('leave-room');await page.evaluate(()=>frontier.action('menu'));const observed=await page.evaluate(()=>({save:localStorage.getItem('crowns-save'),playing:frontier.playing,resumeVisible:!document.getElementById('resume').classList.contains('hidden')}));report.checks.push({localSavePreserved:observed.save===original,playing:observed.playing});
  if(baseline){assert.notEqual(observed.save,original);assert.equal(JSON.parse(observed.save).options.multiplayer,true);report.reproduced=true;report.corruptedSave={multiplayer:true,otherGold:JSON.parse(observed.save).players[1].resources.gold};console.log(JSON.stringify({reproduced:true,buildId:report.buildId}));}
  else{
    assert.equal(observed.save,original);assert.equal(observed.playing,false);assert.ok(observed.resumeVisible);assert.equal(report.networkMenu.hasLocalSave,false);assert.equal(report.networkMenu.hasSaveAndReturn,false);
    assert.equal(await page.evaluate(()=>frontier.save()),false);assert.equal(await page.evaluate(()=>localStorage.getItem('crowns-save')),original);
    stage('restore-local-ai');await page.evaluate(()=>{frontier.action('resume');frontier.action('pause');});const restored=await page.evaluate(()=>({multiplayer:frontier.sim.options.multiplayer,time:frontier.sim.time,gold:frontier.sim.players[0].resources.gold,aiStates:!!frontier.sim.aiStates,save:frontier.save()}));assert.ok(!restored.multiplayer&&restored.time>=73&&restored.gold===1234&&restored.aiStates&&restored.save);report.checks.push({restored});await page.evaluate(()=>frontier.action('menu'));
    stage('legacy-network-save');await page.evaluate(snapshot=>{localStorage.setItem('crowns-save',snapshot);frontier.action('menu');frontier.action('resume');},networkSnapshot);assert.equal(await page.evaluate(()=>frontier.playing),false);assert.equal(await page.locator('#resume').isVisible(),false);await page.evaluate(save=>localStorage.setItem('crowns-save',save),original);report.checks.push({legacyNetworkSaveHiddenAndNotResumed:true});
    stage('closed-room');const host=await joinRoom(),guest=host.room.players.find(p=>p.side===1);guest.ws.send(JSON.stringify({type:'closed',message:'This room has closed.'}));await page.waitForFunction(()=>!frontier.playing);assert.equal(await page.evaluate(()=>localStorage.getItem('crowns-save')),original);assert.equal(await page.locator('#chat-toggle').isVisible(),false);report.checks.push({closedRoomReturnsToMenuWithoutSaving:true});
    stage('phone-local-menu');await page.setViewportSize({width:640,height:360});await page.evaluate(()=>{frontier.action('resume');frontier.action('pause');});const localMenu=await page.locator('#modal-root').textContent();assert.ok(localMenu.includes('Save kingdom')&&localMenu.includes('Save & return to menu'));assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);await page.screenshot({path:'artifacts/local-save-phone-menu.png'});report.checks.push({localSaveControlsRetained:true,phoneLayout:'640x360; viewport check only'});
    assert.deepEqual(report.errors,[]);report.passed=true;console.log(JSON.stringify({passed:true,checks:report.checks.length,buildId:report.buildId}));
  }
}catch(error){report.failure=error.stack;process.exitCode=1;console.log(JSON.stringify({stage:report.stage,failure:error.message}));}
finally{clearTimeout(guard);fs.writeFileSync(reportFile,JSON.stringify(report,null,2));for(const ws of clients)ws.terminate();await browser?.close().catch(()=>{});service.close();await new Promise(resolve=>server.close(resolve));}
