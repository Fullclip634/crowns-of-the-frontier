// Real browser and server connection checks; phone-sized emulation is not a physical-device test.
import assert from 'node:assert/strict';
import path from 'node:path';
import WebSocket from 'ws';
import {chromium} from 'playwright-core';
import {createGameServer} from '../server/http-app.js';

const {server,rooms}=createGameServer({root:path.resolve('dist')}),errors=[],checks=[];let browser,guest;
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function until(predicate,message){const deadline=Date.now()+15000;while(!predicate()){assert.ok(Date.now()<deadline,message);await pause(30);}}
try{
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));browser=process.env.QA_BROWSER_ENDPOINT?await chromium.connectOverCDP(process.env.QA_BROWSER_ENDPOINT):await chromium.launch({channel:'msedge',headless:true});
  for(const profile of [{name:'desktop',width:1280,height:800},{name:'phone',width:844,height:390,touch:true}]){
    console.log('Checking reconnect: '+profile.name);const context=await browser.newContext({viewport:{width:profile.width,height:profile.height},isMobile:!!profile.touch,hasTouch:!!profile.touch,serviceWorkers:'block'}),page=await context.newPage();page.setDefaultTimeout(90000);let beginnings=0,closures=0;
    page.on('pageerror',error=>errors.push(error.message));page.on('websocket',socket=>{socket.on('close',()=>closures++);socket.on('framereceived',frame=>{try{if(JSON.parse(String(frame.payload)).type==='begin')beginnings++;}catch{}});});
    await page.addInitScript(()=>{localStorage.clear();sessionStorage.clear();localStorage.setItem('crowns-settings',JSON.stringify({quality:'low',autoQuality:false,music:false,volume:0}));const Native=window.WebSocket;window.qaSockets=[];window.qaOffline=false;window.WebSocket=class extends Native{constructor(...args){if(window.qaOffline)throw new Error('Simulated connection outage');super(...args);window.qaSockets.push(this);}};});
    const base=`http://127.0.0.1:${server.address().port}`;await page.goto(base+'/?renderer=webgl',{waitUntil:'domcontentloaded'});await page.waitForFunction(()=>window.frontier?.view&&!frontier.view.graphicsLoading);
    await page.evaluate(()=>frontier.action('lan'));await page.locator('[data-action=lan-host]').click();await page.waitForSelector('#room-code');const code=(await page.locator('#room-code').textContent()).trim();
    guest=new WebSocket(base.replace('http:','ws:')+'/socket');await new Promise((resolve,reject)=>{guest.once('open',resolve);guest.once('error',reject);});
    const joined=new Promise(resolve=>{const receive=raw=>{const packet=JSON.parse(raw);if(packet.type==='session'){guest.off('message',receive);resolve(packet);}};guest.on('message',receive);});guest.send(JSON.stringify({type:'join',name:'Guest',faction:'raven',code}));const guestSession=await joined;
    await page.waitForFunction(()=>!document.querySelector('[data-action=lan-start]')?.disabled);await page.locator('[data-action=lan-start]').click();await page.waitForFunction(()=>frontier.playing&&frontier.sim.options.multiplayer);await until(()=>beginnings===1,'initial match snapshot');
    const room=rooms.rooms.get(code);room.sim.tick=()=>{};await page.evaluate(async()=>{window.qaOffline=true;const socket=window.qaSockets.findLast(socket=>socket.readyState===WebSocket.OPEN),closed=new Promise(resolve=>socket.addEventListener('close',resolve,{once:true}));socket.close();await closed;});await until(()=>!room.players[0].ws,'host disconnected');await until(()=>closures>0,'browser received the closed connection');
    assert.equal(await page.evaluate(()=>frontier.sim.train(frontier.sim.owned(0,'building','towncenter')[0].id,'villager')),false,'offline orders are not presented as sent');
    assert.equal(await page.evaluate(()=>{const sim=frontier.sim,before=sim.players[0].formation;frontier.select([sim.owned(0,'unit','scout')[0].id]);document.querySelector('[data-formation="line"]').click();return sim.players[0].formation===before;}),true,'offline formation choices do not change the displayed state');
    assert.equal(await page.evaluate(()=>{const worker=frontier.sim.owned(0,'unit','villager')[0],before=JSON.stringify(worker.order);frontier.select([worker.id]);frontier.action('auto-work');return JSON.stringify(worker.order)===before;}),true,'offline auto-gather does not erase the worker’s displayed order');
    await page.evaluate(()=>frontier.action('pause'));assert.equal(await page.locator('[data-action=lan-resume]').isVisible(),true);await page.evaluate(()=>window.qaOffline=false);await page.locator('[data-action=lan-resume]').click();
    await until(()=>beginnings>=2&&room.players[0].ws,'manual reconnect returns a fresh snapshot');await page.waitForFunction(()=>frontier.playing&&!frontier.paused);
    guest.terminate();await until(()=>!room.players[1].ws,'guest disconnected');await page.waitForFunction(()=>document.querySelector('#alert-line')?.textContent.includes('WAITING'));
    assert.equal(await page.evaluate(()=>frontier.sim.train(frontier.sim.owned(0,'building','towncenter')[0].id,'villager')),false,'orders are not reported as sent while another commander is reconnecting');
    guest=new WebSocket(base.replace('http:','ws:')+'/socket');await new Promise((resolve,reject)=>{guest.once('open',resolve);guest.once('error',reject);});guest.send(JSON.stringify({type:'resume',code,token:guestSession.token}));await until(()=>room.players[1].ws,'guest resumed');await page.waitForFunction(()=>!document.querySelector('#alert-line')?.textContent.includes('WAITING'));
    await page.evaluate(async()=>{window.qaOffline=true;const socket=window.qaSockets.findLast(socket=>socket.readyState===WebSocket.OPEN),closed=new Promise(resolve=>socket.addEventListener('close',resolve,{once:true}));socket.close();await closed;});await until(()=>!room.players[0].ws,'host disconnected again');room.players[0].disconnected=Date.now()-120001;await until(()=>room.players[0].conceded,'reservation expired');await page.evaluate(()=>window.qaOffline=false);
    await page.waitForFunction(()=>!frontier.playing&&document.querySelector('#toasts')?.textContent.includes('session has ended'),null,{timeout:30000});
    checks.push({profile:profile.name,manualReconnect:true,offlineOrderRejected:true,waitingOrderRejected:true,expiredSessionExits:true});guest.terminate();guest=null;await context.close();
  }
  assert.deepEqual(errors,[]);console.log(JSON.stringify({passed:true,checks}));
}finally{guest?.terminate();await browser?.close().catch(()=>{});rooms.close();server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
