import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import assert from 'node:assert/strict';
import {chromium} from 'playwright-core';
const root=path.resolve(process.env.QA_GAME_DIST||'dist'),report={passed:false,checks:[],errors:[],renderer:'Software SwiftShader, Low quality; actual 3D effects and emulated touch, not physical-device FPS'};let browser;
const mime={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.svg':'image/svg+xml'};
const server=http.createServer((request,response)=>{const url=new URL(request.url,'http://localhost'),file=path.resolve(root,'.'+(url.pathname==='/'?'/index.html':decodeURIComponent(url.pathname)));if(!file.startsWith(root+path.sep)||!fs.existsSync(file)||!fs.statSync(file).isFile()){response.writeHead(404);response.end();return;}response.writeHead(200,{'Content-Type':mime[path.extname(file)]||'application/octet-stream','Cache-Control':'no-store'});fs.createReadStream(file).pipe(response);});
const stage=value=>{report.stage=value;console.log(value);};
const guard=setTimeout(()=>{report.guard='Seven-minute garrison browser limit';browser?.close().catch(()=>{});setTimeout(()=>process.exit(1),5000);},420000);

function fixture(type){
  frontier.start({mode:'sandbox',map:'highlands',seed:512});frontier.action('pause');document.querySelector('#modal-root').style.visibility='hidden';const sim=frontier.sim,tc=sim.owned(0,'building','towncenter')[0];sim.players[0].age=3;sim.visible.fill(1);
  let site=tc;if(type!=='towncenter')for(let z=tc.z-15;z<=tc.z+20&&site===tc;z+=3)for(let x=tc.x+12;x<tc.x+26;x+=3)if(sim.buildValid(type,x,z,0)){site=sim.addBuilding(type,0,x,z,true);break;}
  if(site.type!==type)throw new Error('No fixture site for '+type);
  const workers=sim.owned(0,'unit','villager').slice(0,6),tree=sim.entities.filter(e=>e.hp>0&&e.kind==='resource'&&e.type==='wood').sort((a,b)=>Math.hypot(a.x-site.x,a.z-site.z)-Math.hypot(b.x-site.x,b.z-site.z))[0];
  for(const [i,w] of workers.entries()){w.x=site.x+site.r+2+i*.04;w.z=site.z+i*.04;w.order={type:'gather',target:tree.id};w.orders=[];w.path=[];}workers[0].carry=9;workers[0].carryType='wood';sim.revision++;
  const view=frontier.view;view.attach(sim);view.focus(site.x,site.z);view.zoom=type==='keep'?38:32;view.angle=.7;view.tilt=.7;view.updateCamera();frontier.select([site.id]);window.qaGarrison={site:site.id,workers:workers.map(w=>w.id),tree:tree.id,type};return {site:site.id,tree:tree.id,workers:workers.length,population:sim.population(0),resources:{...sim.players[0].resources}};
}
function enter(){const s=frontier.sim;for(let i=0;i<100&&!qaGarrison.workers.every(id=>s.get(id).embarked);i++)s.tick(.1);return {inside:s.get(qaGarrison.site).garrison?.length,population:s.population(0),hidden:qaGarrison.workers.every(id=>s.get(id).embarked),cargo:s.get(qaGarrison.workers[0]).carry};}
async function frame(page){const before=await page.evaluate(()=>frontier.view.renderer.info.render.frame);await page.waitForFunction(frame=>frontier.view.renderer.info.render.frame>frame,before);}

try{
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));browser=await chromium.connectOverCDP(process.env.QA_BROWSER_ENDPOINT);
  for(const [type,phone] of [['towncenter',false],['keep',false],['tower',false],['keep',true]]){
    stage((phone?'phone-':'desktop-')+type);const page=await browser.newPage({viewport:phone?{width:640,height:360}:{width:960,height:640},isMobile:phone,hasTouch:phone,serviceWorkers:'block'});page.setDefaultTimeout(60000);page.on('pageerror',e=>report.errors.push(e.message));await page.addInitScript(()=>localStorage.setItem('crowns-settings',JSON.stringify({quality:'low',frameRate:'30',autoQuality:false,weather:'clear',lighting:'day',fog:false,volume:0,music:false})));await page.goto(`http://127.0.0.1:${server.address().port}/`,{waitUntil:'domcontentloaded',timeout:90000});await page.waitForFunction(()=>window.frontier?.view);report.buildId??=await page.locator('meta[name="frontier-build"]').getAttribute('content');const start=await page.evaluate(fixture,type);await frame(page);
    const bell=page.locator(`[data-town-bell="${start.site}"]`);assert.ok(await bell.isVisible());if(phone)await bell.tap();else await bell.click();const sheltered=await page.evaluate(enter);assert.equal(sheltered.inside,start.workers);assert.equal(sheltered.population,start.population);assert.ok(sheltered.hidden);assert.equal(sheltered.cargo,9);await frame(page);await page.waitForFunction(id=>!!document.querySelector(`[data-return-work="${id}"]`),start.site);
    const release=page.locator(`[data-return-work="${start.site}"]`);if(phone)await release.tap();else await release.click();const restored=await page.evaluate(()=>{const s=frontier.sim;return qaGarrison.workers.map(id=>{const u=s.get(id);return {embarked:u.embarked,order:u.order?.type,target:u.order?.target,carry:u.carry};});});assert.ok(restored.every(u=>!u.embarked&&u.order==='gather'&&u.target===start.tree));assert.equal(restored[0].carry,9);
    if(phone)await bell.tap();else await bell.click();await page.evaluate(enter);await frame(page);
    // The fixture was paused for deterministic simulation steps. Let the real
    // gameplay UI refresh from its normal running loop before checking labels.
    await page.evaluate(()=>frontier.action('pause'));
    await page.waitForFunction(()=>{const site=frontier.sim.get(qaGarrison.site),inside=site.garrison?.length||0,capacity=qaGarrison.type==='tower'?8:15;return inside>=6&&document.querySelector(`[data-town-bell="${site.id}"] small`)?.textContent.startsWith(`${inside}/${capacity} inside`)&&document.querySelector(`[data-return-work="${site.id}"] small`)?.textContent===`+${Math.ceil(inside/3)} defensive arrows`;});
    const labels=await page.evaluate(()=>({shelter:document.querySelector(`[data-town-bell="${qaGarrison.site}"] small`).textContent,arrows:document.querySelector(`[data-return-work="${qaGarrison.site}"] small`).textContent}));
    await page.evaluate(()=>frontier.action('pause'));
    const viewport=await page.evaluate(()=>({width:innerWidth,height:innerHeight,coarse:matchMedia('(pointer: coarse)').matches,touchPoints:navigator.maxTouchPoints,overflow:document.documentElement.scrollWidth>innerWidth}));assert.ok(!viewport.overflow);if(phone)assert.ok(viewport.coarse&&viewport.touchPoints>0);
    await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>{window.requestAnimationFrame=()=>0;resolve();})));
    const volley=await page.evaluate(()=>{const s=frontier.sim,v=frontier.view,site=s.get(qaGarrison.site),target=s.addUnit('knight',1,site.x+12,site.z+4);target.hp=target.maxHp=2000;const normal=s.attackDamage(site,target),before=target.hp;site.cooldown=0;s.hit(site,target);v.render(.04);return {damage:before-target.hp,baseDamage:normal,arrows:v.fx.filter(e=>e.kind==='arrow').map(e=>({from:e.from.toArray(),vertices:e.object.geometry.attributes.position.count})),occupants:site.garrison.length};});assert.ok(volley.damage>volley.baseDamage);assert.ok(volley.arrows.length>=3);assert.ok(new Set(volley.arrows.map(shot=>shot.from.join(':'))).size>=3);assert.ok(volley.arrows.every(shot=>shot.vertices>12));await page.screenshot({path:`artifacts/garrison-${phone?'phone-':''}${type}.png`});report.checks.push({type,phone,start,sheltered,returnJobsRestored:true,labels,volley,viewport});await page.close();
  }
  assert.deepEqual(report.errors,[]);report.passed=true;console.log(JSON.stringify({passed:true,buildId:report.buildId,checks:report.checks.length}));
}catch(error){report.failure=error.stack;process.exitCode=1;console.log(JSON.stringify({stage:report.stage,failure:error.message}));}
finally{clearTimeout(guard);fs.writeFileSync('artifacts/garrison-browser-qa.json',JSON.stringify(report,null,2));await browser?.close().catch(()=>{});await new Promise(resolve=>server.close(resolve));}
