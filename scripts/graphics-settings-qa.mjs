import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const browser=await chromium.launch({channel:'msedge',headless:true,args:['--enable-webgl','--ignore-gpu-blocklist']});
const report={checks:[],errors:[],passed:false};
try{
  const page=await browser.newPage({viewport:{width:1024,height:720}});page.setDefaultTimeout(90000);
  page.on('pageerror',error=>report.errors.push(error.message));page.on('console',message=>{if(message.type()==='error')report.errors.push(message.text());});
  await page.addInitScript(()=>{if(!localStorage.getItem('crowns-settings'))localStorage.setItem('crowns-settings',JSON.stringify({quality:'low',autoQuality:true,music:false,volume:0,weather:'clear'}));});
  await page.goto(process.env.QA_URL||'http://localhost:4174/',{waitUntil:'domcontentloaded'});await page.waitForFunction(()=>window.frontier?.view);
  await page.evaluate(()=>{frontier.start({mode:'sandbox',map:'highlands',seed:512});frontier.action('settings');});
  assert.equal(await page.locator('#quality').inputValue(),'auto');
  await page.locator('#quality').selectOption('high');await page.locator('[data-action=apply-settings]').click();
  await page.waitForFunction(()=>frontier.view.artDiagnostics.detail==='high'&&frontier.view.surfaceQuality==='high');
  const manual=await page.evaluate(()=>{const view=frontier.view;for(let frame=0;frame<100;frame++)view.adapt(.5);return {quality:view.settings.quality,automatic:view.settings.autoQuality,scale:view.dynamicScale,shadows:view.renderer.shadowMap.enabled,saved:JSON.parse(localStorage.getItem('crowns-settings'))};});
  assert.equal(manual.quality,'high');assert.equal(manual.automatic,false);assert.equal(manual.shadows,true);assert.equal(manual.scale,1);assert.equal(manual.saved.quality,'high');assert.equal(manual.saved.autoQuality,false);report.checks.push({name:'Manual High survives forced frame pressure and is saved',quality:manual.quality,automatic:manual.automatic});
  await page.evaluate(()=>frontier.action('settings'));assert.equal(await page.locator('#quality').inputValue(),'high');
  await page.setViewportSize({width:640,height:360});
  const phone=await page.evaluate(()=>({horizontalOverflow:document.documentElement.scrollWidth>innerWidth,selectHeight:document.querySelector('#quality').getBoundingClientRect().height,description:document.querySelector('#graphics-quality-help').textContent}));
  assert.equal(phone.horizontalOverflow,false);assert.ok(phone.selectHeight>=44);report.checks.push({name:'Landscape settings fit 640 x 360',...phone});
  await page.screenshot({path:'artifacts/graphics-settings-landscape.png'});
  await page.reload({waitUntil:'domcontentloaded'});await page.waitForFunction(()=>window.frontier?.view);
  assert.equal(await page.evaluate(()=>frontier.view.settings.quality),'high');assert.equal(await page.evaluate(()=>frontier.view.settings.autoQuality),false);report.checks.push({name:'Manual High persists after reload'});
  await page.evaluate(()=>frontier.action('settings'));assert.equal(await page.locator('#quality').inputValue(),'high');
  await page.locator('#quality').selectOption('auto');await page.locator('[data-action=apply-settings]').click();
  assert.equal(await page.evaluate(()=>frontier.view.settings.autoQuality),true);
  await page.evaluate(()=>frontier.action('settings'));assert.equal(await page.locator('#quality').inputValue(),'auto');report.checks.push({name:'Automatic adjustment is a separate explicit choice'});
  assert.deepEqual(report.errors,[]);report.passed=true;console.log(JSON.stringify(report,null,2));
}finally{fs.writeFileSync('artifacts/graphics-settings-qa.json',JSON.stringify(report,null,2));await browser.close();}
