import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const base=process.env.QA_URL||'http://localhost:5173/';
const browser=await chromium.launch({channel:'msedge',headless:true,args:['--enable-webgl','--ignore-gpu-blocklist']});
const errors=[],reports=[];fs.mkdirSync('artifacts',{recursive:true});
async function start(page){
  page.on('pageerror',e=>errors.push(e.message));
  await page.goto(base,{waitUntil:'networkidle'});
  await page.getByRole('button',{name:'Begin your reign'}).click();
  await page.getByRole('button',{name:'Enter the frontier'}).click();
  await page.waitForFunction(()=>frontier.playing&&frontier.view.contactShadows?.count>0);
}
try{
  const page=await browser.newPage({viewport:{width:1440,height:900}});await start(page);
  const initial=await page.evaluate(()=>({perspective:frontier.view.camera.isPerspectiveCamera,tilt:frontier.view.tilt,shadows:frontier.view.contactShadows.count,relief:!!frontier.view.materials.stone.bumpMap,roofSeparate:frontier.view.roofMaterials[0]!==frontier.view.teamMaterials[0]}));
  assert.ok(initial.perspective&&initial.relief&&initial.roofSeparate);assert.ok(initial.shadows>0);assert.ok(Math.abs(initial.tilt-32*Math.PI/180)<.001);
  await page.waitForTimeout(600);await page.screenshot({path:'artifacts/3d-desktop-game.png'});
  const angle=await page.evaluate(()=>frontier.view.angle);
  await page.getByRole('button',{name:'Rotate camera left',exact:true}).click();assert.ok(await page.evaluate(a=>frontier.view.angle>a,angle));
  await page.getByRole('button',{name:'Rotate camera right',exact:true}).click();assert.ok(await page.evaluate(a=>Math.abs(frontier.view.angle-a)<.001,angle));
  await page.locator('[data-action=camera-view]').click();assert.ok(await page.evaluate(()=>Math.abs(frontier.view.tilt-20*Math.PI/180)<.001));
  await page.getByRole('button',{name:'Zoom in',exact:true}).click();
  await page.waitForTimeout(200);await page.screenshot({path:'artifacts/3d-close-view.png'});
  await page.locator('[data-action=camera-view]').click();assert.ok(await page.evaluate(()=>Math.abs(frontier.view.tilt-56*Math.PI/180)<.001));
  await page.keyboard.press('v');assert.equal(await page.locator('#camera-view-label').textContent(),'Perspective');
  // Picking must follow the rotated perspective, rather than relying on old screen positions.
  const pick=await page.evaluate(()=>{const v=frontier.view;for(const e of frontier.sim.owned(0,'unit','villager')){const p=v.target.clone().set(e.x,frontier.view.entityHeight(e)+1.3,e.z).project(v.camera),x=(p.x+1)*innerWidth/2,y=(1-p.y)*innerHeight/2;if(v.pick(x,y)?.id===e.id)return{x,y};}return null;});
  assert.ok(pick);await page.mouse.click(pick.x,pick.y);assert.match(await page.locator('#selection-panel').textContent(),/Villager/);
  await page.locator('[data-action=pause]').first().click();await page.getByRole('button',{name:'Settings',exact:true}).click();
  await page.locator('#camera-preset').selectOption('tactical');await page.getByRole('button',{name:'Apply settings'}).click();
  assert.equal(await page.locator('#camera-view-label').textContent(),'Overview');
  await page.reload({waitUntil:'networkidle'});assert.equal(await page.evaluate(()=>frontier.view.settings.cameraPreset),'tactical');
  reports.push({desktop:initial,cameraButtons:true,picking:true,settingsPersist:true});await page.close();

  const phone=await browser.newPage({viewport:{width:844,height:390},isMobile:true,hasTouch:true,deviceScaleFactor:2});await start(phone);
  await phone.getByRole('button',{name:'Rotate camera left',exact:true}).tap();
  await phone.locator('[data-action=camera-view]').tap();
  const before=await phone.evaluate(()=>({angle:frontier.view.angle,zoom:frontier.view.zoom}));
  const cdp=await phone.context().newCDPSession(phone);
  await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:370,y:150,id:1},{x:470,y:150,id:2}]});
  await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:390,y:120,id:1},{x:450,y:180,id:2}]});
  await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
  const after=await phone.evaluate(()=>({angle:frontier.view.angle,zoom:frontier.view.zoom}));assert.ok(Math.abs(after.angle-before.angle)>.2);assert.ok(Math.abs(after.zoom-before.zoom)>.1);
  await phone.locator('[data-action=camera-view]').tap();await phone.locator('[data-action=camera-view]').tap();
  assert.equal(await phone.locator('#camera-view-label').textContent(),'Perspective');
  await phone.evaluate(()=>{frontier.view.setCameraPreset('balanced',true);frontier.view.angle=Math.PI/4;frontier.view.updateCamera();frontier.view.quality('low');frontier.view.settings.autoQuality=false;});
  await phone.waitForTimeout(250);
  const low=await phone.evaluate(()=>({shadows:frontier.view.contactShadows.count,dynamicShadows:frontier.view.renderer.shadowMap.enabled,calls:frontier.view.renderer.info.render.calls,triangles:frontier.view.renderer.info.render.triangles,overflow:document.documentElement.scrollWidth>innerWidth}));
  assert.ok(low.shadows>0);assert.equal(low.dynamicShadows,false);assert.equal(low.overflow,false);
  await phone.screenshot({path:'artifacts/3d-phone-performance.png'});
  reports.push({phone:low,touchRotate:true,touchZoom:true});await phone.close();
  assert.deepEqual(errors,[]);console.log(JSON.stringify({reports,errors},null,2));
}finally{await browser.close();}
