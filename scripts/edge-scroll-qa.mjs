import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
const browser=await chromium.launch({channel:'msedge',headless:true,args:['--enable-webgl','--ignore-gpu-blocklist']});
const base=process.env.QA_URL||'http://localhost:4173/',errors=[],reports=[];
const position=page=>page.evaluate(()=>({x:frontier.view.target.x,z:frontier.view.target.z,angle:frontier.view.angle}));
const settle=async page=>{await page.mouse.move(720,430);await page.evaluate(()=>frontier.view.focus(0,0));await page.waitForTimeout(80);};
const hold=async(page,x,y)=>{await page.mouse.move(x,y);await page.waitForTimeout(320);};
try{
  const page=await browser.newPage({viewport:{width:1440,height:900}});page.on('pageerror',e=>errors.push(e.message));
  await page.goto(base,{waitUntil:'networkidle'});await page.getByRole('button',{name:'Begin your reign'}).click();await page.getByRole('button',{name:'Enter the frontier'}).click();
  await page.waitForFunction(()=>frontier.playing&&!frontier.paused);
  for(const [name,x,y,horizontal,vertical]of [['right',1437,430,1,0],['left',3,430,-1,0],['top',720,3,0,-1],['bottom',720,897,0,1],['top-right',1437,3,1,-1],['top-left',3,3,-1,-1],['bottom-right',1437,897,1,1],['bottom-left',3,897,-1,1]]){
    await settle(page);const before=await position(page);await hold(page,x,y);const after=await position(page),dx=after.x-before.x,dz=after.z-before.z;
    const screenX=dx*Math.cos(before.angle)-dz*Math.sin(before.angle),screenY=dx*Math.sin(before.angle)+dz*Math.cos(before.angle);
    if(horizontal)assert.ok(screenX*horizontal>.05,`${name}: correct horizontal scrolling`);else assert.ok(Math.abs(screenX)<.03);
    if(vertical)assert.ok(screenY*vertical>.05,`${name}: correct vertical scrolling`);else assert.ok(Math.abs(screenY)<.03);
    assert.ok(await page.evaluate(()=>document.documentElement.style.getPropertyValue('--battlefield-cursor').includes('image/svg+xml')),'direction arrow is displayed');
    reports.push({direction:name,moved:true});
  }
  await settle(page);const centered=await position(page);await page.waitForTimeout(250);assert.deepEqual(await position(page),centered);
  await page.evaluate(()=>{frontier.view.angle=1.85;frontier.view.updateCamera();});const rotated=await position(page);await hold(page,1437,430);const afterRotate=await position(page);
  assert.ok((afterRotate.x-rotated.x)*Math.cos(rotated.angle)-(afterRotate.z-rotated.z)*Math.sin(rotated.angle)>.05);
  await settle(page);await page.mouse.move(1437,430);await page.mouse.down({button:'middle'});const beforeMiddle=await position(page);await page.waitForTimeout(250);assert.deepEqual(await position(page),beforeMiddle);await page.mouse.up({button:'middle'});
  await settle(page);await page.mouse.move(1437,430);await page.keyboard.down('ArrowLeft');const beforeKey=await position(page);await page.waitForTimeout(250);const afterKey=await position(page);await page.keyboard.up('ArrowLeft');
  assert.ok((afterKey.x-beforeKey.x)*Math.cos(beforeKey.angle)-(afterKey.z-beforeKey.z)*Math.sin(beforeKey.angle)<-.05,'keyboard pan overrides an opposite edge');
  await settle(page);await page.evaluate(()=>{frontier.select([frontier.sim.owned(0,'unit','villager')[0].id]);frontier.action('build');});await page.locator('[data-build=house]').click();
  await hold(page,1437,430);const ghost=await page.evaluate(()=>{const point=frontier.view.groundPoint(1437,430),g=frontier.view.ghost;return{visible:g.visible,error:Math.hypot(g.position.x-point.x,g.position.z-point.z)};});assert.ok(ghost.visible);assert.ok(ghost.error<.02,'construction preview follows the stationary cursor during scrolling');await page.keyboard.press('Escape');
  // Leaving the game, pausing, and hovering a button must stop automatic scrolling.
  await page.mouse.move(-5,430);await page.waitForTimeout(80);const outside=await position(page);await page.waitForTimeout(250);assert.deepEqual(await position(page),outside);
  await page.evaluate(()=>frontier.action('pause'));const paused=await position(page);await hold(page,1437,430);assert.deepEqual(await position(page),paused);await page.evaluate(()=>frontier.action('close'));
  const button=await page.locator('[data-action=speed]').boundingBox();await page.mouse.move(button.x+button.width/2,button.y+2);const overButton=await position(page);await page.waitForTimeout(250);assert.deepEqual(await position(page),overButton);
  await page.evaluate(()=>frontier.action('settings'));await page.locator('#edge-scroll').uncheck();await page.locator('#edge-scroll-speed').evaluate(e=>e.value='1.5');await page.getByRole('button',{name:'Apply settings'}).click();
  await settle(page);const disabled=await position(page);await hold(page,1437,430);assert.deepEqual(await position(page),disabled);
  assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('crowns-settings')).edgeScroll),false);
  await page.reload({waitUntil:'networkidle'});await page.getByRole('button',{name:'Begin your reign'}).click();await page.getByRole('button',{name:'Enter the frontier'}).click();
  await page.evaluate(()=>frontier.action('settings'));assert.equal(await page.locator('#edge-scroll').isChecked(),false);assert.equal(await page.locator('#edge-scroll-speed').inputValue(),'1.5');
  await page.locator('#edge-scroll').check();await page.getByRole('button',{name:'Apply settings'}).click();await settle(page);await hold(page,1437,430);assert.ok(Math.hypot((await position(page)).x,(await position(page)).z)>.05);
  reports.push({rotation:true,centerStops:true,viewportExitStops:true,pauseStops:true,controlsDoNotScroll:true,middleDragProtected:true,keyboardPriority:true,constructionPreviewFollows:true,settingsPersist:true});await page.close();
  const phone=await browser.newPage({viewport:{width:844,height:390},isMobile:true,hasTouch:true});phone.on('pageerror',e=>errors.push(e.message));await phone.goto(base,{waitUntil:'networkidle'});
  await phone.getByRole('button',{name:'Begin your reign'}).tap();await phone.getByRole('button',{name:'Enter the frontier'}).tap();
  const beforeTouch=await position(phone),cdp=await phone.context().newCDPSession(phone);
  await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:841,y:190,id:1}]});await phone.waitForTimeout(350);assert.deepEqual(await position(phone),beforeTouch);
  await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});reports.push({touchDoesNotTriggerEdgeScrolling:true});await phone.close();
  assert.deepEqual(errors,[]);console.log(JSON.stringify({reports,errors},null,2));
}finally{await browser.close();}
