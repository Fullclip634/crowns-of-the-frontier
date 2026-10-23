import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import WebSocket from 'ws';
import {chromium} from 'playwright-core';
import {createGameServer} from '../server/http-app.js';
import {battlePreset} from '../src/custom-battle.js';

// A rendered production client plus a real legacy WebSocket host, isolated from
// public rooms. Viewport emulation is not a physical-phone performance result.
const root=path.resolve(process.env.QA_GAME_DIST||'dist'),out=path.resolve(process.env.QA_VISIBILITY_OUTPUT||'artifacts/visibility-multiplayer');fs.mkdirSync(out,{recursive:true});
const {server,rooms:service,readiness}=createGameServer({root});assert.ok(readiness.ready,readiness.failures.join(', '));
const errors=[],report={passed:false,scope:'Production browser with emulated landscape phone and desktop sizes; local WebSocket match, not hosted capacity or physical-device FPS evidence',checks:[]};let browser,page,host;
const guard=setTimeout(()=>{console.error('Visibility browser QA exceeded eight minutes');process.exit(1);},480000);
class Inbox {constructor(ws){this.items=[];this.waiters=[];ws.on('message',raw=>{const packet=JSON.parse(raw),index=this.waiters.findIndex(waiter=>waiter.type===packet.type);if(index<0){if(packet.type!=='state')this.items.push(packet);}else{const [waiter]=this.waiters.splice(index,1);clearTimeout(waiter.timer);waiter.resolve(packet);}});}next(type){const index=this.items.findIndex(packet=>packet.type===type);if(index>=0)return Promise.resolve(this.items.splice(index,1)[0]);return new Promise((resolve,reject)=>{const waiter={type,resolve,timer:setTimeout(()=>reject(new Error('Missing '+type)),15000)};this.waiters.push(waiter);});}}
try{
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const base=`http://127.0.0.1:${server.address().port}/`;
  report.health=await (await fetch(base+'health')).json();assert.equal(report.health.ok,true);
  host=new WebSocket(base.replace('http:','ws:')+'socket');const inbox=new Inbox(host);await new Promise((resolve,reject)=>{host.once('open',resolve);host.once('error',reject);});
  const slots=battlePreset('4v4');slots[1].controller='human';host.send(JSON.stringify({type:'create',name:'Legacy host',options:{mode:'custom',map:'highlands',mapSize:'huge',startAge:1,seed:512,slots}}));
  const session=await inbox.next('session');
  browser=process.env.QA_BROWSER_ENDPOINT?await chromium.connectOverCDP(process.env.QA_BROWSER_ENDPOINT):await chromium.launch({channel:'chrome',headless:true,args:['--enable-webgl','--ignore-gpu-blocklist']});
  page=await browser.newPage({viewport:{width:844,height:390},isMobile:true,hasTouch:true,serviceWorkers:'block'});page.setDefaultTimeout(150000);page.on('pageerror',error=>errors.push(error.message));
  await page.addInitScript(()=>{
    localStorage.setItem('crowns-settings',JSON.stringify({quality:'low',frameRate:'30',autoQuality:false,volume:0,music:false,weather:'clear',fog:true}));
    window.__fogQA={dropNext:false,dropped:0,resyncs:0,deltaPackets:0};const NativeSocket=window.WebSocket;
    window.WebSocket=class extends NativeSocket {
      constructor(...args){super(...args);window.__fogQA.socket=this;}
      send(raw){if(JSON.parse(raw).type==='visibility-resync')window.__fogQA.resyncs++;super.send(raw);}
      addEventListener(type,listener,options){if(type!=='message')return super.addEventListener(type,listener,options);super.addEventListener(type,event=>{const packet=JSON.parse(event.data);if(packet.type==='state'&&packet.state.visibilityDelta){window.__fogQA.deltaPackets++;if(window.__fogQA.dropNext){window.__fogQA.dropNext=false;window.__fogQA.dropped++;return;}}listener.call(this,event);},options);}
    };
  });
  await page.goto(base+'?renderer=webgl',{waitUntil:'domcontentloaded'});await page.waitForFunction(()=>window.frontier?.view&&!frontier.view.graphicsLoading);
  report.buildId=await page.locator('meta[name="frontier-build"]').getAttribute('content');report.browser=await page.evaluate(()=>navigator.userAgent);
  assert.equal(report.health.release.buildId,report.buildId);
  await page.evaluate(()=>frontier.action('lan'));await page.locator('#lan-name').fill('Phone commander');await page.locator('#lan-code').fill(session.code);await page.locator('#lan-slot').selectOption('2');await page.locator('[data-action=lan-join]').tap();await page.waitForSelector('#room-code');await page.locator('[data-action=lan-ready]').tap();
  while(!(await inbox.next('lobby')).canStart){}host.send(JSON.stringify({type:'start'}));await inbox.next('begin');const room=service.rooms.get(session.code),sim=room.sim;sim.tick=()=>{};
  await page.waitForFunction(()=>frontier.playing&&frontier.sim.players[0].name==='Phone commander'&&window.__fogQA.deltaPackets>2);
  assert.equal(room.players[1].protocol,2);assert.equal(room.players[0].protocol,1);assert.equal(sim.players.length,8);
  assert.deepEqual(await page.evaluate(()=>[...frontier.sim.visible]),[...room.visibility[1].visible]);
  assert.deepEqual(await page.evaluate(()=>[...frontier.sim.explored]),[...room.visibility[1].explored]);
  report.checks.push('Huge eight-kingdom production client applies negotiated deltas alongside a legacy host');
  console.log('Browser joined and applied fog deltas; checking allied scouting.');
  const scout=sim.owned(0,'unit','scout')[0],enemy=sim.owned(4,'unit','scout')[0];scout.x=0;scout.z=0;enemy.x=2;enemy.z=0;sim.revision++;sim.updateFog();
  await page.waitForFunction(id=>frontier.sim.entities.some(entity=>entity.id===id),enemy.id);const cell=sim.cell(0,0),index=cell.z*sim.gridSize+cell.x;
  assert.equal(await page.evaluate(index=>frontier.sim.visible[index],index),1);
  scout.x=sim.players[0].start.x;scout.z=sim.players[0].start.z;sim.revision++;sim.updateFog();await page.waitForFunction(id=>!frontier.sim.entities.some(entity=>entity.id===id),enemy.id);
  assert.equal(await page.evaluate(index=>frontier.sim.visible[index],index),0);assert.equal(await page.evaluate(index=>frontier.sim.explored[index],index),1);report.checks.push('Allied scout reveals then hides an enemy while retaining explored terrain');
  const resource=sim.entities.find(e=>e.kind==='resource'&&room.visibility[1].visible[sim.cell(e.x,e.z).z*sim.gridSize+sim.cell(e.x,e.z).x]);assert.ok(resource);
  await page.evaluate(()=>window.__fogQA.dropNext=true);resource.amount-=83;
  await page.waitForFunction(()=>window.__fogQA.dropped===1&&window.__fogQA.resyncs===1);
  await page.waitForFunction(({id,amount})=>frontier.sim.get(id)?.amount===amount,{id:resource.id,amount:Math.ceil(resource.amount)});
  await page.waitForFunction(()=>window.__fogQA.deltaPackets>5);assert.deepEqual(await page.evaluate(()=>[...frontier.sim.visible]),[...room.visibility[1].visible]);report.checks.push('Actual browser detects an omitted state, requests one resync and restores resource amounts');
  console.log('Browser recovered the missing update; checking paid production and reconnect.');
  const tc=sim.owned(1,'building','towncenter')[0];await page.evaluate(id=>frontier.select([id]),tc.id);await page.locator('[data-train=villager]').tap();await page.waitForFunction(id=>frontier.sim.get(id)?.queue.some(item=>item.type==='villager'),tc.id);
  await page.reload({waitUntil:'domcontentloaded'});await page.waitForFunction(()=>window.frontier?.view&&!frontier.view.graphicsLoading);await page.evaluate(()=>frontier.action('lan'));await page.locator('[data-action=lan-resume]').tap();
  await page.waitForFunction(()=>frontier.playing&&frontier.sim.players[0].name==='Phone commander'&&window.__fogQA.deltaPackets>1);assert.equal(await page.evaluate(id=>frontier.sim.get(id).queue.filter(item=>item.type==='villager').length,tc.id),1);
  assert.deepEqual(await page.evaluate(()=>[...frontier.sim.explored]),[...room.visibility[1].explored]);report.checks.push('Reload/rejoin installs a fresh full baseline and preserves paid training');
  report.viewports=[];
  for(const viewport of [{width:844,height:390},{width:568,height:320},{width:1366,height:768}]){
    await page.setViewportSize(viewport);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);assert.equal(await page.evaluate(()=>frontier.view.graphicsFatal||null),null);
    const frame=await page.evaluate(()=>frontier.view.renderer.info.render.frame);await page.waitForFunction(frame=>frontier.view.renderer.info.render.frame>frame,frame);await page.screenshot({path:path.join(out,`${viewport.width}x${viewport.height}.png`)});report.viewports.push({...viewport,overflow:false,fatal:null,screenshot:`${viewport.width}x${viewport.height}.png`});
  }
  report.runtime=await page.evaluate(()=>({backend:frontier.view.renderer.backend?.isWebGPUBackend?'webgpu':'webgl',quality:frontier.view.renderQuality,fatal:frontier.view.graphicsFatal||null,deltaPackets:window.__fogQA.deltaPackets,programFailures:frontier.view.renderer.info.programs?.filter(program=>program.diagnostics?.runnable===false).length||0}));
  assert.equal(report.runtime.programFailures,0);assert.deepEqual(errors,[]);report.passed=true;
}catch(error){report.error=error.stack;console.error(error.stack);process.exitCode=1;}
finally{clearTimeout(guard);report.errors=errors;fs.writeFileSync(path.join(out,'report.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report));host?.terminate();await browser?.close().catch(()=>{});service.close();await new Promise(resolve=>server.close(resolve));}
