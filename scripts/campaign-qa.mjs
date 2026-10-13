import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const browser=await chromium.launch({channel:'msedge',headless:true,args:['--enable-webgl','--ignore-gpu-blocklist']}),errors=[],reports=[];
const base=process.env.QA_URL||'http://localhost:4187/';fs.mkdirSync('artifacts',{recursive:true});
try{
  const page=await browser.newPage({viewport:{width:1440,height:900}});page.setDefaultTimeout(60000);page.on('pageerror',e=>errors.push(e.message));await page.goto(base,{waitUntil:'networkidle'});
  await page.waitForFunction(()=>!!frontier.view,{},{timeout:90000});await page.evaluate(()=>frontier.start({mode:'campaign2',difficulty:'story'}));
  await page.locator('[data-action=quest-unit]').click();assert.ok(await page.locator('#selection-panel').textContent().then(t=>t.includes('Bridge caravan')));
  await page.locator('[data-action=journal]').click();assert.ok(await page.locator('.campaign-journal').textContent().then(t=>t.includes('eastern garrison')));await page.locator('.modal-close').click();assert.equal(await page.evaluate(()=>frontier.paused),false);
  await page.locator('[data-action=mission-goal]').click();assert.ok(await page.evaluate(()=>Math.abs(frontier.view.target.x-20)<.01));
  await page.evaluate(()=>{const s=frontier.sim;s.tickAI=()=>{};const cart=s.get(s.campaignState.cartId);s.guard(s.owned(0,'unit').filter(e=>['spearman','archer'].includes(e.type)).map(e=>e.id),cart.id);s.command([cart.id],{type:'move',x:20,z:-8});for(let i=0;i<1000;i++)s.tick(.1);frontier.select([cart.id]);frontier.action('inspect');});
  await page.waitForFunction(()=>frontier.sim.campaignState.stage>=1&&document.querySelector('#model-portrait canvas'));await page.screenshot({path:'artifacts/campaign-escort-desktop.png'});
  await page.evaluate(()=>{const s=frontier.sim,cart=s.get(s.campaignState.cartId);s.hurt(cart,cart.hp+1,s.owned(1,'unit')[0]);for(let i=0;i<10;i++)s.tick(.1);});
  await page.getByRole('button',{name:'Restore campaign checkpoint',exact:true}).click();assert.equal(await page.evaluate(()=>frontier.sim.ended),null);assert.ok(await page.evaluate(()=>!!frontier.sim.get(frontier.sim.campaignState.cartId)));
  await page.evaluate(()=>frontier.save());await page.reload({waitUntil:'networkidle'});await page.locator('[data-action=resume]').click();assert.ok(await page.locator('[data-action=journal]').isVisible());
  reports.push({desktop:true,escort:true,journal:true,goalNavigation:true,cartModel:true,checkpointRecovery:true,saveResume:true});await page.close();
  const phone=await browser.newPage({viewport:{width:844,height:390},hasTouch:true,isMobile:true,deviceScaleFactor:2});phone.setDefaultTimeout(60000);phone.on('pageerror',e=>errors.push(e.message));await phone.goto(base,{waitUntil:'networkidle'});await phone.waitForFunction(()=>!!frontier.view,{},{timeout:90000});
  await phone.evaluate(()=>frontier.start({mode:'campaign2',difficulty:'story'}));await phone.locator('[data-action=objectives-expand]').tap();await phone.locator('[data-action=quest-unit]').tap();assert.equal(await phone.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  await phone.screenshot({path:'artifacts/campaign-escort-phone.png'});await phone.locator('[data-action=journal]').tap();assert.ok(await phone.locator('.campaign-journal').isVisible());await phone.locator('.modal-close').tap();
  await phone.evaluate(()=>{const s=frontier.sim,cart=s.get(s.campaignState.cartId);s.hurt(cart,cart.hp+1,s.owned(1,'unit')[0]);for(let i=0;i<10;i++)s.tick(.1);});
  assert.ok(await phone.getByRole('button',{name:'Restore campaign checkpoint',exact:true}).evaluate(button=>{const r=button.getBoundingClientRect();return r.top>=0&&r.bottom<=innerHeight;}));await phone.screenshot({path:'artifacts/campaign-loss-phone.png'});
  await phone.getByRole('button',{name:'Restore campaign checkpoint',exact:true}).tap();assert.equal(await phone.evaluate(()=>frontier.sim.ended),null);
  await phone.evaluate(()=>frontier.action('pause'));await phone.getByRole('button',{name:'Restore campaign checkpoint',exact:true}).tap();assert.equal(await phone.evaluate(()=>frontier.paused),false);
  reports.push({phone:true,escortControls:true,journal:true,checkpoint:true,noHorizontalOverflow:true});assert.deepEqual(errors,[]);fs.writeFileSync('artifacts/campaign-qa.json',JSON.stringify({reports,errors},null,2));console.log(JSON.stringify({reports,errors},null,2));
}finally{await browser.close();}
