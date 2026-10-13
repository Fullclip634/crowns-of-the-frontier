import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const browser=await chromium.launch({channel:'msedge',headless:true,args:['--enable-webgl','--ignore-gpu-blocklist']}),errors=[],reports=[];
const base=process.env.QA_URL||'http://localhost:4186/';fs.mkdirSync('artifacts',{recursive:true});
try{
  const page=await browser.newPage({viewport:{width:1440,height:900}});page.setDefaultTimeout(60000);page.on('pageerror',e=>errors.push(e.message));
  await page.goto(base,{waitUntil:'networkidle'});await page.waitForFunction(()=>!!frontier.view,{},{timeout:90000});await page.locator('.landing-header [data-action=settings]').click();
  assert.equal(await page.locator('[data-keybind]').count(),19);
  await page.locator('[data-keybind=attackmove]').focus();await page.keyboard.press('t');await page.locator('[data-keybind=guard]').focus();await page.keyboard.press('t');
  await page.locator('[data-action=apply-settings]').click();assert.ok(await page.locator('.binding-error').isVisible());
  await page.locator('[data-keybind=guard]').focus();await page.keyboard.press('g');await page.locator('#high-contrast').check();await page.locator('#reduced-motion').check();
  await page.locator('[data-action=apply-settings]').click();assert.ok(await page.evaluate(()=>document.documentElement.classList.contains('high-contrast')));
  await page.reload({waitUntil:'networkidle'});await page.waitForFunction(()=>!!frontier.view,{},{timeout:90000});assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('crowns-settings')).bindings.attackmove),'t');
  await page.evaluate(()=>{frontier.start({mode:'sandbox',seed:512});const s=frontier.sim,u=s.addUnit('spearman',0,0,20),ally=s.addUnit('ram',0,-6,20);frontier.select([u.id]);frontier.view.focus(0,20);frontier.testUnits={u:u.id,ally:ally.id};});
  await page.keyboard.press('t');assert.ok(await page.locator('#attackmove.active').isVisible());await page.keyboard.press('Escape');await page.keyboard.press('f');assert.equal(await page.locator('#attackmove.active').count(),0);
  await page.getByRole('button',{name:'Patrol',exact:true}).click();await page.waitForTimeout(200);
  const point=await page.evaluate(()=>{const v=frontier.view.target.clone().set(10,frontier.view.groundHeight(10,20),20).project(frontier.view.camera);return {x:(v.x+1)*innerWidth/2,y:(1-v.y)*innerHeight/2};});await page.mouse.click(point.x,point.y);
  await page.waitForFunction(()=>frontier.sim.get(frontier.testUnits.u).order?.type==='patrol');
  assert.equal(await page.evaluate(()=>!!frontier.view.orderLines),false);
  await page.evaluate(()=>frontier.sim.command([frontier.testUnits.u],{type:'move',x:0,z:35},true));await page.waitForFunction(()=>document.querySelector('.order-summary')?.textContent.includes('1 queued'));
  await page.getByRole('button',{name:'Guard',exact:true}).click();await page.waitForTimeout(200);
  const ally=await page.evaluate(()=>{const e=frontier.sim.get(frontier.testUnits.ally),v=frontier.view.target.clone().set(e.x,frontier.view.groundHeight(e.x,e.z)+1,e.z).project(frontier.view.camera);return {x:(v.x+1)*innerWidth/2,y:(1-v.y)*innerHeight/2};});await page.mouse.click(ally.x,ally.y);
  await page.waitForFunction(()=>frontier.sim.get(frontier.testUnits.u).order?.type==='guard');await page.screenshot({path:'artifacts/commander-desktop.png'});
  await page.evaluate(()=>frontier.save());await page.reload({waitUntil:'networkidle'});await page.locator('[data-action=resume]').click();assert.ok(await page.evaluate(()=>frontier.sim.owned(0,'unit').some(e=>e.order?.type==='guard')));
  await page.evaluate(()=>{frontier.sim.addBuilding('blacksmith',0,-15,30,true);frontier.action('codex');});await page.locator('[data-action=tech-tree]').click();
  assert.equal(await page.locator('.tree-age').count(),4);const food=await page.evaluate(()=>frontier.sim.players[0].resources.food);
  await page.locator('[data-tree-unit=sentinel]').click();assert.equal(await page.evaluate(()=>frontier.sim.players[0].resources.food),food-90);
  assert.ok(await page.evaluate(()=>frontier.sim.owned(0,'building','barracks').some(b=>b.queue.some(q=>q.type==='sentinel'))));
  await page.locator('[data-tree-tech=shieldDrill]').click();assert.ok(await page.locator('[data-tree-tech=shieldDrill]').isDisabled());assert.equal(await page.locator('[data-tree-tech=shieldDrill]').textContent(),'Research queued');
  await page.locator('[data-tree-faction=sun]').click();assert.ok(await page.locator('[data-tree-unit=marksman]').isDisabled());assert.equal(await page.locator('[data-tree-unit=sentinel]').count(),0);
  await page.locator('[data-tree-faction=alder]').click();await page.screenshot({path:'artifacts/technology-tree-desktop.png'});await page.locator('.modal-close').click();assert.equal(await page.evaluate(()=>frontier.paused),false);
  for(const [faction,type]of [['alder','sentinel'],['sun','marksman'],['raven','outrider']]){
    await page.evaluate(({faction,type})=>{frontier.start({mode:'sandbox',faction,seed:512});const u=frontier.sim.addUnit(type,0,0,25);frontier.sim.stop([u.id]);frontier.select([u.id]);frontier.action('inspect');frontier.signatureId=u.id;},{faction,type});
    await page.waitForFunction(type=>frontier.view.modelPortrait?.key?.includes(type)&&frontier.view.nodes.has(frontier.signatureId),type);
    assert.ok(await page.evaluate(()=>frontier.view.nodes.get(frontier.signatureId).userData.batch.parts.length>0));await page.screenshot({path:`artifacts/signature-${faction}.png`});
  }
  reports.push({desktop:true,remapping:true,conflicts:true,persistence:true,patrol:true,guard:true,movementLinesRemoved:true,saves:true,technologyTree:true,uniqueTraining:true,uniqueResearch:true,signatureModels:3});await page.close();
  const phone=await browser.newPage({viewport:{width:844,height:390},hasTouch:true,isMobile:true,deviceScaleFactor:2});phone.setDefaultTimeout(60000);phone.on('pageerror',e=>errors.push(e.message));
  await phone.goto(base,{waitUntil:'networkidle'});await phone.waitForFunction(()=>!!frontier.view,{},{timeout:90000});await phone.locator('.landing-header [data-action=settings]').tap();
  await phone.locator('[data-controls-reset]').tap();await phone.locator('[data-action=apply-settings]').tap();
  await phone.evaluate(()=>{frontier.start({mode:'sandbox',seed:512});const u=frontier.sim.addUnit('spearman',0,-20,32);frontier.select([u.id]);});
  await phone.getByRole('button',{name:'Patrol',exact:true}).tap();assert.equal(await phone.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  await phone.screenshot({path:'artifacts/commander-phone.png'});await phone.evaluate(()=>frontier.action('tech-tree'));assert.equal(await phone.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);await phone.screenshot({path:'artifacts/technology-tree-phone.png'});
  reports.push({phone:true,settings:true,patrol:true,technologyTree:true,noHorizontalOverflow:true});
  assert.deepEqual(errors,[]);fs.writeFileSync('artifacts/commander-qa.json',JSON.stringify({reports,errors},null,2));console.log(JSON.stringify({reports,errors},null,2));
}finally{await browser.close();}
