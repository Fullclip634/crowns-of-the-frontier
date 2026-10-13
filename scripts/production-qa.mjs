import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {UNITS} from '../src/data.js';
const browser=await chromium.launch({channel:'msedge',headless:true,args:['--enable-webgl','--ignore-gpu-blocklist']});
const base=process.env.QA_URL||'http://localhost:4173/',errors=[],reports=[];fs.mkdirSync('artifacts',{recursive:true});
const setup=async page=>{
  page.on('pageerror',e=>errors.push(e.message));await page.addInitScript(()=>localStorage.setItem('crowns-settings',JSON.stringify({music:false,volume:0,quality:'medium',autoQuality:false})));
  await page.goto(base,{waitUntil:'networkidle'});await page.waitForFunction(()=>window.frontier?.view);
  return page.evaluate(()=>{frontier.start({mode:'sandbox',map:'highlands',faction:'alder',difficulty:'normal',seed:512});const s=frontier.sim,a=s.owned(0,'building','barracks')[0],b=s.addBuilding('barracks',0,-15,25,true);s.addBuilding('barracks',1,30,-30,true);s.addBuilding('barracks',0,-15,40);s.owned(0,'unit').forEach(e=>s.stop([e.id]));s.players[0].resources={food:10000,wood:10000,gold:10000,stone:10000};frontier.select([a.id,b.id]);return [a.id,b.id];});
};
const queues=(page,ids)=>page.evaluate(ids=>ids.map(id=>frontier.sim.get(id).queue.length),ids);
try{
  const page=await browser.newPage({viewport:{width:1440,height:900}}),ids=await setup(page);
  await page.locator('#selection-panel [data-train=spearman][data-batch="5"]').click();assert.deepEqual(await queues(page,ids),[3,2]);
  assert.ok(await page.locator('#selection-panel').innerText().then(text=>text.includes('BUILDINGS SELECTED')));assert.equal(await page.locator('#selection-panel .tactics').count(),0);
  await page.locator('#selection-panel [data-train=spearman]:not([data-batch])').click({modifiers:['Shift']});assert.deepEqual(await queues(page,ids),[5,5]);
  await page.keyboard.press('p');await page.locator('#production-panel').waitFor({state:'visible'});assert.equal(await page.locator('#production-panel .production-card').count(),4);
  assert.equal(await page.locator('#production-panel .production-items button').count(),10);assert.equal(await page.locator('#production-count').textContent(),'10');
  const food=await page.evaluate(()=>frontier.sim.players[0].resources.food);await page.locator(`#production-panel [data-building="${ids[0]}"][data-cancel-queue="0"]`).click();assert.deepEqual(await queues(page,ids),[4,5]);
  assert.equal(await page.evaluate(()=>frontier.sim.players[0].resources.food),food+UNITS.spearman.cost.food);
  const before=await page.evaluate(()=>frontier.view.target.toArray());await page.locator('#production-panel .production-heading').hover();await page.waitForTimeout(180);assert.deepEqual(await page.evaluate(()=>frontier.view.target.toArray()),before);
  await page.locator('[data-production-select]').first().click();assert.ok(await page.locator('#selection-panel').innerText().then(text=>text.includes('Barracks')));
  await page.locator('[data-production-group=barracks]').click();assert.equal(await page.locator('#selection-panel .unit-tokens span').textContent(),'2');
  await page.screenshot({path:'artifacts/production-desktop.png'});await page.keyboard.press('Escape');assert.ok(await page.locator('#production-panel').isHidden());assert.equal(await page.evaluate(()=>frontier.paused),false);
  // Single-building controls and age/research queues remain available.
  await page.evaluate(()=>frontier.select([frontier.sim.owned(0,'building','towncenter')[0].id]));await page.locator('[data-train=villager]').click({modifiers:['Shift']});assert.equal(await page.evaluate(()=>frontier.sim.owned(0,'building','towncenter')[0].queue.length),5);
  await page.evaluate(()=>{const tc=frontier.sim.owned(0,'building','towncenter')[0];window.stableTrain=document.querySelector('#selection-panel [data-train=villager]');window.firstQueueWidth=document.querySelector('.training-queue i').style.width;tc.hp-=100;window.expectedHealth=Math.round(tc.hp);});await page.waitForTimeout(1400);assert.ok(await page.evaluate(()=>document.querySelector('#selection-panel [data-train=villager]')===stableTrain),'health/timer updates retain the actual touch button');assert.ok(await page.locator('[data-live-health]').textContent().then(text=>text.includes(String(Number(text.split(' ')[0])))&&text.includes('HP')));assert.ok(await page.evaluate(()=>document.querySelector('[data-live-health]').textContent.startsWith(String(expectedHealth))));assert.ok(await page.evaluate(()=>document.querySelector('.training-queue i').style.width!==firstQueueWidth));
  await page.evaluate(()=>{const s=frontier.sim;s.players[0].age=0;frontier.select([s.owned(0,'building','towncenter')[0].id]);});await page.locator('[data-research=age]').click();await page.keyboard.press('p');assert.equal(await page.locator('#production-panel button[aria-label="Cancel Feudal Age and refund its cost"]').count(),1);
  reports.push({desktop:true,balancedBatches:true,shiftBatch:true,overview:true,queueCount:true,refund:true,buildingSelection:true,escape:true,researchVisible:true,stableButtonsDuringLiveUpdates:true,liveHealthAndQueueProgress:true});await page.close();
  const phone=await browser.newPage({viewport:{width:844,height:390},isMobile:true,hasTouch:true});const phoneIds=await setup(phone);
  await phone.locator('#selection-panel [data-train=spearman][data-batch="5"]').tap();assert.deepEqual(await queues(phone,phoneIds),[3,2]);
  await phone.locator('#production-toggle').tap();await phone.locator('#production-panel').waitFor({state:'visible'});
  const r=await phone.locator('#production-panel').boundingBox();assert.ok(r.x>=0&&r.y>=0&&r.x+r.width<=844&&r.y+r.height<=390);
  const scroll=await phone.locator('.production-list').evaluate(e=>{e.scrollTop=e.scrollHeight;return e.scrollTop;});assert.ok(scroll>0);await phone.waitForTimeout(1300);assert.ok(Math.abs(await phone.locator('.production-list').evaluate(e=>e.scrollTop)-scroll)<2,'queue updates preserve touch scrolling');
  await phone.screenshot({path:'artifacts/production-phone.png'});await phone.locator('[data-production-group=barracks]').tap();assert.ok(await phone.locator('#production-panel').isHidden());
  await phone.locator('#selection-panel [data-train=spearman][data-batch="5"]').tap();assert.deepEqual(await queues(phone,phoneIds),[5,5]);assert.ok(await phone.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  await phone.locator('#production-toggle').tap();await phone.locator('.production-items button').first().tap();assert.equal((await queues(phone,phoneIds)).reduce((a,b)=>a+b,0),9);
  reports.push({landscapePhone:true,touchBatch:true,touchOverview:true,touchSelect:true,touchCancel:true,scrollPreserved:true,noOverflow:true});await phone.close();
  assert.deepEqual(errors,[]);console.log(JSON.stringify({reports,errors},null,2));
}finally{await browser.close();}
