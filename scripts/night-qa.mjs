import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const report={checks:[],errors:[],passed:false};
const browser=await chromium.launch({channel:'msedge',headless:true,args:['--enable-webgl','--ignore-gpu-blocklist']});
try{
  const page=await browser.newPage({viewport:{width:1280,height:720}});page.setDefaultTimeout(90000);
  page.on('pageerror',error=>report.errors.push(error.message));page.on('console',message=>{if(message.type()==='error')report.errors.push(message.text());});
  await page.addInitScript(()=>{if(!localStorage.getItem('crowns-settings'))localStorage.setItem('crowns-settings',JSON.stringify({quality:'low',autoQuality:false,weather:'clear',lighting:'day',music:false,volume:0}));});
  await page.goto(process.env.QA_URL||'http://localhost:4174/',{waitUntil:'domcontentloaded'});await page.waitForFunction(()=>window.frontier?.view);
  await page.evaluate(()=>{frontier.start({mode:'sandbox',map:'highlands',seed:512});frontier.action('settings');});
  await page.locator('#lighting-mode').selectOption('night');await page.locator('[data-action=apply-settings]').click();
  await page.waitForFunction(()=>frontier.view.lightingState?.night>.99);
  assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('crowns-settings')).lighting),'night');
  await page.evaluate(()=>frontier.action('settings'));assert.equal(await page.locator('#lighting-mode').inputValue(),'night');await page.evaluate(()=>frontier.action('close'));
  for(const quality of ['low','high']){
    await page.evaluate(quality=>frontier.view.quality(quality),quality);await page.waitForFunction(quality=>frontier.view.artDiagnostics.detail===quality&&frontier.view.surfaceQuality===quality,quality);
    const check=await page.evaluate(()=>{
      frontier.start({mode:'sandbox',map:'highlands',seed:512});frontier.action('pause');document.querySelector('#modal-root').style.visibility='hidden';
      const s=frontier.sim,v=frontier.view,home=s.owned(0,'building','towncenter')[0];v.focus(home.x,home.z);v.zoom=35;v.updateCamera();document.querySelector('#toasts').innerHTML='';
      const sample=()=>{v.render(.2,false);const gl=v.renderer.getContext(),bytes=new Uint8Array(256*128*4);gl.readPixels(gl.drawingBufferWidth/2-128,gl.drawingBufferHeight/2-64,256,128,gl.RGBA,gl.UNSIGNED_BYTE,bytes);let sum=0;for(let i=0;i<bytes.length;i+=4)sum+=(bytes[i]+bytes[i+1]+bytes[i+2])/3;return sum/(256*128);};
      v.settings.lighting='day';v.weather.daylight.amount=0;const day=sample();v.settings.lighting='night';v.weather.daylight.amount=1;const night=sample();
      let glowingVertices=0;v.objects.traverse(mesh=>{const attribute=mesh.geometry?.getAttribute('structureNightGlow');if(attribute)for(const value of attribute.array)if(value>0)glowingVertices++;});
      return {quality:v.settings.quality,models:v.artDiagnostics.models,state:v.lightingState,dayBrightness:day,nightBrightness:night,glowingVertices,moonIntensity:v.sun.intensity,ambientIntensity:v.hemi.intensity,windowUniform:v.materials.structurePalette.frontierUniforms.night.value};
    });
    report.checks.push(check);assert.equal(check.models,126);assert.equal(check.state.label,'Night');assert.ok(check.glowingVertices>0);assert.equal(check.windowUniform,1);assert.ok(check.nightBrightness<check.dayBrightness*.94&&check.nightBrightness>check.dayBrightness*.15,'night looks different but leaves the battlefield readable');
    await page.screenshot({path:`artifacts/night-${quality}.png`});
    const weather=await page.evaluate(()=>{const v=frontier.view;v.settings.weather='storm';for(let i=0;i<20;i++)v.render(.2,false);return {mode:v.lightingState.mode,night:v.lightingState.night,weather:v.weatherState.type,rain:v.weatherDiagnostics.rain};});
    assert.equal(weather.weather,'storm');assert.ok(weather.rain>0&&weather.night>.99);report.checks.push({nightWeather:weather});
    await page.evaluate(()=>{frontier.view.settings.weather='clear';frontier.view.settings.lighting='night';document.querySelector('#modal-root').style.visibility='';frontier.action('close');});
  }
  await page.reload({waitUntil:'domcontentloaded'});await page.waitForFunction(()=>window.frontier?.view);assert.equal(await page.evaluate(()=>frontier.view.settings.lighting),'night');
  await page.evaluate(()=>frontier.action('settings'));assert.equal(await page.locator('#lighting-mode').inputValue(),'night');report.checks.push({savedNightSurvivesReload:true});
  const phone=await browser.newPage({viewport:{width:640,height:360},isMobile:true,hasTouch:true});phone.on('pageerror',error=>report.errors.push(error.message));phone.on('console',message=>{if(message.type()==='error')report.errors.push(message.text());});
  await phone.addInitScript(()=>localStorage.setItem('crowns-settings',JSON.stringify({quality:'low',autoQuality:false,weather:'clear',lighting:'day',music:false,volume:0})));
  await phone.goto(process.env.QA_URL||'http://localhost:4174/',{waitUntil:'domcontentloaded'});await phone.waitForFunction(()=>window.frontier?.view);
  await phone.evaluate(()=>{frontier.start({mode:'custom',map:'coast',mapSize:'huge',seed:2026});frontier.action('settings');});await phone.locator('#lighting-mode').selectOption('night');await phone.locator('[data-action=apply-settings]').tap();await phone.waitForFunction(()=>frontier.view.lightingState?.night>.99);
  assert.equal(await phone.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);await phone.locator('[data-action=command-options]').tap();await phone.locator('.phone-command[data-action=home]').tap();
  await phone.evaluate(()=>{document.querySelector('#toasts').innerHTML='';frontier.action('pause');document.querySelector('#modal-root').style.visibility='hidden';});await phone.screenshot({path:'artifacts/night-phone.png'});await phone.close();
  report.checks.push({landscapePhoneNight:true,homeCommand:true,noHorizontalOverflow:true});
  assert.deepEqual(report.errors,[]);report.passed=true;console.log(JSON.stringify(report,null,2));
}finally{fs.writeFileSync('artifacts/night-qa.json',JSON.stringify(report,null,2));await browser.close();}
