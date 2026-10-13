import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
fs.mkdirSync('artifacts',{recursive:true});
const browser=await chromium.launch({channel:'msedge',headless:true,args:['--enable-webgl','--ignore-gpu-blocklist']});
const base=process.env.QA_URL||'http://localhost:4180/',errors=[];
try {
  const host=await browser.newPage({viewport:{width:1440,height:900}});host.on('pageerror',e=>errors.push(e.message));
  await host.goto(base,{waitUntil:'networkidle'});await host.waitForFunction(()=>!!frontier.view);await host.screenshot({path:'artifacts/v2-menu.png'});
  await host.getByRole('button',{name:'Masters of the tide'}).click();await host.getByRole('button',{name:'Enter the frontier'}).click();await host.waitForTimeout(900);
  await host.evaluate(()=>{const ship=frontier.sim.owned(0,'unit','transport')[0];frontier.select([ship.id]);frontier.view.focus(-12,30);});await host.screenshot({path:'artifacts/v2-naval.png'});
  assert.ok(await host.locator('[data-action=unload]').isVisible());assert.ok(await host.evaluate(()=>frontier.sim.owned(0,'building','dock').length===1));
  await host.evaluate(()=>frontier.action('menu'));await host.locator('[data-action=lan]').click();await host.locator('#lan-name').fill('Alder commander');await host.locator('#lan-map').selectOption('highlands');await host.locator('[data-action=lan-host]').click();
  const code=await host.locator('#room-code').textContent();
  const phone=await browser.newPage({viewport:{width:844,height:390},hasTouch:true,isMobile:true,deviceScaleFactor:2});phone.on('pageerror',e=>errors.push(e.message));await phone.goto(base,{waitUntil:'networkidle'});await phone.locator('[data-action=lan]').tap();await phone.locator('#lan-name').fill('Raven commander');await phone.locator('#lan-faction').selectOption('raven');await phone.locator('#lan-code').fill(code);await phone.locator('[data-action=lan-join]').tap();
  await host.locator('[data-action=lan-start]').click();await host.waitForFunction(()=>frontier.playing);await phone.waitForFunction(()=>frontier.playing);await phone.waitForTimeout(500);
  const begin=await Promise.all([host,phone].map(page=>page.evaluate(()=>({time:frontier.sim.time,pop:frontier.sim.population(0),tc:frontier.sim.owned(0,'building','towncenter')[0].x,faction:frontier.sim.players[0].faction,hidden:frontier.sim.entities.filter(e=>e.owner===1&&e.kind==='unit'&&e.hp>0).length}))));
  assert.equal(begin[0].pop,begin[1].pop);assert.equal(begin[0].tc,-begin[1].tc);assert.equal(begin[1].faction,'raven');assert.equal(begin[1].hidden,0);
  await phone.evaluate(()=>frontier.select([frontier.sim.owned(0,'building','barracks')[0].id]));await phone.locator('[data-train=spearman]').tap();await phone.waitForFunction(()=>frontier.sim.owned(0,'building','barracks')[0].queue.some(q=>q.type==='spearman'));
  await host.screenshot({path:'artifacts/v2-lan-host.png'});await phone.screenshot({path:'artifacts/v2-lan-phone.png'});
  await phone.reload({waitUntil:'networkidle'});await phone.locator('[data-action=lan]').tap();await phone.locator('[data-action=lan-resume]').tap();await phone.waitForFunction(()=>frontier.playing);assert.equal(await phone.evaluate(()=>frontier.sim.players[0].faction),'raven');
  const result=await phone.evaluate(()=>({time:frontier.sim.time,queue:frontier.sim.owned(0,'building','barracks')[0].queue.map(q=>q.type),calls:frontier.view.renderer.info.render.calls}));
  assert.deepEqual(errors,[]);console.log(JSON.stringify({room:code,begin,reconnected:result,errors},null,2));
} finally {await browser.close();}
