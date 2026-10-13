import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const browser=await chromium.launch({channel:'msedge',headless:true,args:['--enable-webgl','--ignore-gpu-blocklist']});
const base=process.env.QA_URL||'http://localhost:4173/',errors=[],reports=[];fs.mkdirSync('artifacts',{recursive:true});
const position=page=>page.evaluate(()=>({x:frontier.view.target.x,z:frontier.view.target.z}));
const setup=async page=>{
  page.on('pageerror',e=>errors.push(e.message));
  await page.addInitScript(()=>localStorage.setItem('crowns-settings',JSON.stringify({music:false,volume:0,edgeScroll:false,quality:'medium',autoQuality:false})));
  await page.goto(base,{waitUntil:'networkidle'});await page.waitForFunction(()=>window.frontier?.view);
  await page.evaluate(()=>frontier.start({mode:'sandbox',map:'highlands',faction:'alder',difficulty:'normal',seed:512}));
  const rotate=page.locator('[data-action=dismiss-rotate]');if(await rotate.isVisible())await rotate.click();
};
try{
  const page=await browser.newPage({viewport:{width:1440,height:900}});await setup(page);
  const map=page.locator('#minimap');let rect=await map.boundingBox();assert.equal(rect.width,rect.height);
  for(const [fx,fz]of [[.03,.03],[.97,.03],[.97,.97],[.03,.97],[.5,.5]]){
    await page.mouse.click(rect.x+rect.width*fx,rect.y+rect.height*fz);const p=await position(page);
    assert.ok(Math.abs(p.x-Math.max(-72,Math.min(72,(fx-.5)*160)))<.01);assert.ok(Math.abs(p.z-Math.max(-72,Math.min(72,(fz-.5)*160)))<.01);
  }
  await page.mouse.move(rect.x+rect.width*.2,rect.y+rect.height*.3);await page.mouse.down();await page.mouse.move(rect.x+rect.width*.8,rect.y+rect.height*.7,{steps:8});await page.mouse.up();
  const dragged=await position(page);assert.ok(Math.abs(dragged.x-48)<.01&&Math.abs(dragged.z-32)<.01);reports.push({desktopSquare:true,corners:true,drag:true});
  for(const preset of ['balanced','cinematic','tactical'])for(const [x,z]of [[0,0],[-72,-72],[72,72]]){
    await page.evaluate(({preset,x,z})=>{frontier.view.setCameraPreset(preset,true);frontier.view.focus(x,z);frontier.view.angle=1.85;frontier.view.updateCamera();},{preset,x,z});
    await page.waitForTimeout(160);const box=await page.evaluate(()=>frontier.view.minimapCameraBox);
    assert.ok(box&&Object.values(box).every(n=>Number.isFinite(n)&&Math.abs(n)<=80.00001));assert.ok(box.minX<box.maxX&&box.minZ<box.maxZ);
  }
  reports.push({viewPresets:3,rectangleAtEdges:true,rotation:true});
  // Clicking scenery outside the square must leave a selected unit's orders unchanged.
  const outside=await page.evaluate(()=>{
    const v=frontier.view,s=frontier.sim,e=s.owned(0,'unit','villager')[0];s.stop([e.id]);frontier.select([e.id]);v.setCameraPreset('tactical',true);v.focus(67,67);v.zoom=95;v.updateCamera();
    const point=v.target.clone().set(100,v.landscape.surfaceHeightAt(100,100),100).project(v.camera);return {x:(point.x*.5+.5)*innerWidth,y:(-point.y*.5+.5)*innerHeight,id:e.id};
  });
  assert.equal(await page.evaluate(({x,y})=>frontier.view.groundPoint(x,y),outside),null);await page.mouse.click(outside.x,outside.y,{button:'right'});
  assert.equal(await page.evaluate(id=>frontier.sim.get(id).order,outside.id),null);
  rect=await map.boundingBox();await page.mouse.click(rect.x+rect.width*.99,rect.y+rect.height*.99,{button:'right'});
  const order=await page.evaluate(id=>frontier.sim.get(id).order,outside.id);assert.ok(order&&Math.abs(order.x)<=77&&Math.abs(order.z)<=77);reports.push({outsideOrdersBlocked:true,edgeOrdersReachable:true});
  await page.evaluate(()=>{frontier.view.setCameraPreset('balanced',true);frontier.view.focus(-37,30);frontier.view.angle=Math.PI/4;frontier.view.updateCamera();});await page.waitForTimeout(200);await page.screenshot({path:'artifacts/radar-gameplay.png'});
  await map.screenshot({path:'artifacts/radar-desktop.png'});
  // Shore geometry matches the 3D channel; water no longer paints over boats.
  await page.evaluate(()=>{frontier.start({mode:'tides',map:'coast',faction:'alder',difficulty:'normal',seed:512});frontier.view.settings.fog=false;frontier.view.focus(-37,30);frontier.sim.owned(0,'unit').forEach(e=>frontier.sim.stop([e.id]));});
  await page.waitForTimeout(250);
  const naval=await page.evaluate(()=>{const e=frontier.sim.owned(0,'unit','galley')[0],c=document.querySelector('#minimap'),x=Math.floor((e.x+80)/160*c.width),z=Math.floor((e.z+80)/160*c.height),pixels=c.getContext('2d').getImageData(x-2,z-2,5,5).data;let shipPixels=0;for(let i=0;i<pixels.length;i+=4)if(pixels[i]>150&&pixels[i+1]>190&&pixels[i+2]>180)shipPixels++;return {shipPixels,channels:frontier.view.waterMeshes.length};});
  assert.ok(naval.shipPixels>0);assert.equal(naval.channels,1);reports.push({shipsVisibleOnRadar:true});
  await page.close();
  for(const viewport of [{width:1100,height:768},{width:844,height:390},{width:390,height:844}]){
    const phone=await browser.newPage({viewport,isMobile:true,hasTouch:true});await setup(phone);const mini=phone.locator('#minimap'),r=await mini.boundingBox();assert.equal(r.width,r.height);assert.ok(r.x>=0&&r.y>=0&&r.x+r.width<=viewport.width&&r.y+r.height<=viewport.height);
    await phone.touchscreen.tap(r.x+r.width*.7,r.y+r.height*.3);const p=await position(phone),pixel=160/r.width;assert.ok(Math.abs(p.x-32)<=pixel&&Math.abs(p.z+32)<=pixel,JSON.stringify({viewport,p,radar:r}));
    const home=await phone.locator('.map-heading button').boundingBox();assert.ok(home.x+home.width<=r.x||home.x>=r.x+r.width||home.y+home.height<=r.y||home.y>=r.y+r.height,'Home control leaves the entire radar clickable');
    const cdp=await phone.context().newCDPSession(phone);await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:r.x+r.width*.3,y:r.y+r.height*.3,id:1}]});await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:r.x+r.width*.8,y:r.y+r.height*.8,id:1}]});await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
    const after=await position(phone);assert.ok(Math.abs(after.x-48)<1&&Math.abs(after.z-48)<1);assert.ok(await phone.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
    if(viewport.width===844){await phone.screenshot({path:'artifacts/radar-phone.png'});await mini.screenshot({path:'artifacts/radar-phone-detail.png'});}
    reports.push({viewport,square:true,touchTap:true,touchDrag:true,noOverflow:true});await phone.close();
  }
  assert.deepEqual(errors,[]);console.log(JSON.stringify({reports,errors},null,2));
}finally{await browser.close();}
