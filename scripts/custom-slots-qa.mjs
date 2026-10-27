// Exercise the actual production setup and launch in desktop and touch-sized views.
import assert from 'node:assert/strict';
import path from 'node:path';
import {chromium} from 'playwright-core';
import {createGameServer} from '../server/http-app.js';

const {server,rooms}=createGameServer({root:path.resolve('dist')}),errors=[],checks=[];let browser;
try{
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  browser=process.env.QA_BROWSER_ENDPOINT?await chromium.connectOverCDP(process.env.QA_BROWSER_ENDPOINT):await chromium.launch({channel:'msedge',headless:true});
  for(const profile of [{name:'desktop',width:1280,height:800,role:3},{name:'phone',width:844,height:390,role:0,touch:true}]){
    console.log('Checking custom slots: '+profile.name);
    const context=await browser.newContext({viewport:{width:profile.width,height:profile.height},isMobile:!!profile.touch,hasTouch:!!profile.touch,serviceWorkers:'block'}),page=await context.newPage();page.setDefaultTimeout(90000);
    page.on('pageerror',error=>errors.push(error.message));
    await page.addInitScript(()=>{localStorage.clear();localStorage.setItem('crowns-settings',JSON.stringify({quality:'low',autoQuality:false,music:false,volume:0}));});
    await page.goto(`http://127.0.0.1:${server.address().port}/?renderer=webgl`,{waitUntil:'domcontentloaded'});await page.waitForFunction(()=>window.frontier?.view&&!frontier.view.graphicsLoading);
    await page.locator('[data-action=custom-battle]').first().click();await page.locator('#custom-player-slot').selectOption('0');
    await page.locator('#custom-type-0').selectOption('closed');
    assert.equal(await page.evaluate(()=>document.activeElement.id),'custom-type-0','updating the setup preserves keyboard focus');
    assert.match(await page.locator('#battle-summary').textContent(),/3 kingdoms/);assert.equal(await page.locator('[data-play-slot="1"]').isDisabled(),true);assert.equal(await page.locator('#custom-player-slot option[value="1"]').count(),0);
    await page.locator('#custom-type-0').selectOption('ai');
    assert.match(await page.locator('#battle-summary').textContent(),/4 kingdoms/);assert.equal(await page.locator('[data-play-slot="1"]').isEnabled(),true);assert.equal(await page.locator('#custom-player-slot option[value="1"]').count(),1);
    await page.locator('#custom-type-1').selectOption('closed');assert.match(await page.locator('#battle-summary').textContent(),/3 kingdoms/);assert.equal(await page.locator('[data-play-slot="2"]').isDisabled(),true);assert.equal(await page.locator('#custom-player-slot option[value="2"]').count(),0);
    await page.locator('#custom-type-1').selectOption('ai');assert.equal(await page.locator('[data-play-slot="2"]').isEnabled(),true);assert.equal(await page.locator('#custom-player-slot option[value="2"]').count(),1);
    await page.locator('#custom-type-0').selectOption('closed');
    if(profile.role)await page.locator(`[data-play-slot="${profile.role}"]`).click();
    assert.equal(await page.locator('#custom-player-slot').inputValue(),String(profile.role));assert.match(await page.locator('#battle-summary').textContent(),/3 kingdoms/);
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,'setup fits the viewport');
    await page.locator('[data-action=custom-start]').click();await page.waitForFunction(()=>frontier.playing&&frontier.sim?.options.mode==='custom');
    const result=await page.evaluate(()=>({role:frontier.sim.options.playerSlot,spectator:frontier.sim.options.spectator,slots:frontier.sim.options.slots.map(slot=>({number:slot.slotNumber,controller:slot.controller})),players:frontier.sim.players.length}));
    assert.equal(result.role,profile.role);assert.equal(result.spectator,profile.role===0);assert.equal(result.players,3);assert.deepEqual(result.slots.map(slot=>slot.number),profile.role?[3,2,4]:[2,3,4]);
    assert.equal(result.slots.filter(slot=>slot.controller==='human').length,profile.role?1:0);checks.push({profile:profile.name,...result});await context.close();
  }
  assert.deepEqual(errors,[]);console.log(JSON.stringify({passed:true,checks}));
}finally{await browser?.close().catch(()=>{});rooms.close();server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
