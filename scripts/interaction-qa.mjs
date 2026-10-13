import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const browser=await chromium.launch({channel:'msedge',headless:true,args:['--enable-webgl','--ignore-gpu-blocklist']});
const errors=[],reports=[];
fs.mkdirSync('artifacts',{recursive:true});
const base=process.env.QA_URL||'http://localhost:5173/';
const projection=(page,x,z,y=0)=>page.evaluate(({x,z,y})=>{const v=frontier.view.target.clone().set(x,frontier.view.groundHeight(x,z)+y,z).project(frontier.view.camera);return{x:(v.x+1)*innerWidth/2,y:(1-v.y)*innerHeight/2};},{x,z,y});
const advance=(page,seconds)=>page.evaluate(seconds=>{for(let i=0;i<seconds*10;i++)frontier.sim.tick(.1);},seconds);
try {
  const page=await browser.newPage({viewport:{width:1366,height:900}});page.on('pageerror',e=>errors.push(e.message));
  await page.goto(base,{waitUntil:'networkidle'});await page.getByRole('button',{name:'Begin your reign'}).click();await page.locator('#map').selectOption('winter');await page.getByRole('button',{name:'Enter the frontier'}).click();
  await page.waitForFunction(()=>frontier.playing&&!frontier.paused);
  const pick=await page.evaluate(()=>{for(const e of frontier.sim.owned(0,'unit','villager')){const v=frontier.view.target.clone().set(e.x,frontier.view.entityHeight(e)+1.3,e.z).project(frontier.view.camera),x=(v.x+1)*innerWidth/2,y=(1-v.y)*innerHeight/2;if(frontier.view.pick(x,y)?.id===e.id)return{x,y,id:e.id};}return null;});
  assert.ok(pick,'instanced villagers are pickable');await page.mouse.click(pick.x,pick.y);assert.ok(await page.locator('#selection-panel').textContent().then(t=>t.includes('Villager')));
  await page.locator('.command-buttons [data-action=build]').click();await page.locator('[data-build=house]').click();await page.evaluate(()=>frontier.view.focus(-36,49));const land=await projection(page,-36,49);await page.mouse.click(land.x,land.y);
  assert.equal(await page.evaluate(()=>frontier.sim.owned(0,'building','house').length),3);await advance(page,50);assert.equal(await page.evaluate(()=>frontier.sim.owned(0,'building','house').at(-1).progress),1);
  await page.evaluate(()=>frontier.select([frontier.sim.owned(0,'building','barracks')[0].id]));await page.locator('[data-train=spearman]').click();await advance(page,20);
  assert.ok(await page.evaluate(()=>frontier.sim.owned(0,'unit','spearman').length>=1));await page.evaluate(()=>frontier.action('army'));await page.locator('[data-formation=line]').click();assert.equal(await page.evaluate(()=>frontier.sim.players[0].formation),'line');
  await page.locator('[data-stance=hold]').click();assert.ok(await page.evaluate(()=>frontier.sim.owned(0,'unit').filter(e=>e.type!=='villager').every(e=>e.stance==='hold')));
  const tc=await page.evaluate(()=>frontier.sim.owned(0,'building','towncenter')[0].id);await page.evaluate(id=>frontier.select([id]),tc);await page.locator('[data-research=age]').click();await advance(page,60);assert.equal(await page.evaluate(()=>frontier.sim.players[0].age),1);
  await page.evaluate(()=>frontier.save());const saved=await page.evaluate(()=>JSON.parse(localStorage.getItem('crowns-save')));assert.ok(saved.entities.length>0);await page.reload({waitUntil:'networkidle'});await page.locator('[data-action=resume]').click();assert.equal(await page.evaluate(()=>frontier.sim.players[0].age),1);
  // Stress scene: 160 friendly units with multiple troop types and active 3D combat effects.
  await page.evaluate(()=>{frontier.start({mode:'sandbox',map:'rivers',faction:'alder',difficulty:'normal',seed:561});const s=frontier.sim;const types=['spearman','archer','knight','ram','catapult','monk'];for(let i=0;i<140;i++){const e=s.addUnit(types[i%types.length],0,-36+i%14*2.3,14+Math.floor(i/14)*2.1);if(i%6===0)e.hp=e.maxHp*.6;}const castle=s.addBuilding('keep',1,-11,10,true);castle.hp=castle.maxHp*.3;s.addUnit('spearman',1,-14,13);const army=s.owned(0,'unit').filter(e=>e.type!=='villager');s.command(army.map(e=>e.id),{type:'attackmove',x:-10,z:10});frontier.view.focus(-23,19);frontier.view.zoom=62;frontier.view.updateCamera();});
  await page.waitForTimeout(2500);await page.screenshot({path:'artifacts/stress-battle.png'});
  reports.push(await page.evaluate(()=>({desktop:true,units:frontier.sim.population(0),calls:frontier.view.renderer.info.render.calls,triangles:frontier.view.renderer.info.render.triangles,effects:frontier.view.fx.length,scale:frontier.view.dynamicScale})));
  await page.close();
  const phone=await browser.newPage({viewport:{width:844,height:390},isMobile:true,hasTouch:true,deviceScaleFactor:2});phone.on('pageerror',e=>errors.push(e.message));
  await phone.goto(base,{waitUntil:'networkidle'});await phone.getByRole('button',{name:'Begin your reign'}).tap();await phone.getByRole('button',{name:'Enter the frontier'}).tap();await phone.waitForFunction(()=>frontier.playing);
  await phone.evaluate(()=>{const v=frontier.sim.owned(0,'unit','villager')[0];frontier.select([v.id]);frontier.view.focus(-36,49);});let destination=await projection(phone,-36,49);await phone.touchscreen.tap(destination.x,destination.y);assert.equal(await phone.evaluate(()=>frontier.sim.owned(0,'unit','villager')[0].order.type),'move');
  await phone.locator('.command-buttons [data-action=build]').tap();await phone.locator('[data-build=house]').tap();await phone.touchscreen.tap(destination.x,destination.y);assert.equal(await phone.evaluate(()=>frontier.sim.owned(0,'building','house').length),3);
  await phone.setViewportSize({width:390,height:844});await phone.waitForTimeout(250);assert.equal(await phone.locator('#rotate-hint').isVisible(),true);await phone.locator('[data-action=dismiss-rotate]').tap();await phone.screenshot({path:'artifacts/portrait-fallback.png'});assert.equal(await phone.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  reports.push({phone:true,touchMovement:true,touchConstruction:true,portraitFallback:true});
  assert.deepEqual(errors,[]);console.log(JSON.stringify({reports,errors},null,2));
} finally {await browser.close();}
