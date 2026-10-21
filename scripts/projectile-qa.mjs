import {chromium} from 'playwright-core';
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
const output=process.env.QA_OUTPUT||'artifacts/projectile-visual-qa.json';fs.mkdirSync(path.dirname(output),{recursive:true});
const browser=process.env.QA_BROWSER_ENDPOINT?await chromium.connectOverCDP(process.env.QA_BROWSER_ENDPOINT):await chromium.launch({channel:'msedge',headless:true});
const report={startedAt:new Date().toISOString(),cases:[],errors:[]};
const cases=process.env.QA_PROJECTILE_CASES?JSON.parse(process.env.QA_PROJECTILE_CASES):[{backend:'webgl',quality:'high'},{backend:'webgpu',quality:'medium'},{backend:'webgl',quality:'low',phone:true}];
const guard=setTimeout(()=>{browser.close().catch(()=>{});},900000);
try{
 for(const item of cases){
  console.log('Projectile scene '+JSON.stringify(item));
  const context=await browser.newContext({viewport:item.phone?{width:640,height:360}:{width:960,height:640},hasTouch:!!item.phone,isMobile:!!item.phone,serviceWorkers:'block'}),page=await context.newPage();page.setDefaultTimeout(240000);
  page.on('pageerror',e=>report.errors.push({item,error:e.stack}));page.on('console',m=>{if(m.type()==='error'||m.type()==='warning'&&!/powerPreference option|Service Worker registration blocked|warning X4122:/.test(m.text()))report.errors.push({item,type:m.type(),error:m.text()});});
  await page.addInitScript(quality=>localStorage.setItem('crowns-settings',JSON.stringify({quality,autoQuality:false,frameRate:'30',fog:false,weather:'clear',lighting:'day',music:false,volume:0})),item.quality);
  const url=new URL(process.env.QA_URL||'http://localhost:4173/');url.searchParams.set('renderer',item.backend);await page.goto(url.href,{waitUntil:'domcontentloaded',timeout:90000});await page.waitForFunction(()=>window.frontier?.view);
  assert.equal(await page.evaluate(()=>document.documentElement.dataset.renderer),item.backend);
  report.buildId??=await page.locator('meta[name="frontier-build"]').getAttribute('content');
  await page.evaluate(()=>{
   const v=frontier.view,draw=v.render.bind(v);v.render=()=>false;window.qaEvents=[];window.qaSounds=[];
   frontier.audio.combat=(entity,target,kind)=>{qaSounds.push({kind,x:entity.x,z:entity.z,time:frontier.sim.time});return false;};
   window.qaDraw=async(dt=0)=>{const queue=v.renderer.backend?.device?.queue;if(queue)await queue.onSubmittedWorkDone();v.combatTime=frontier.sim.time;draw(dt,false);if(queue)await queue.onSubmittedWorkDone();};
   window.qaObserve=()=>{const s=frontier.sim;s.tickAI=()=>{};s.tickCustomAI=()=>{};s.on(e=>{if(['attack','projectile-impact'].includes(e.type))qaEvents.push({type:e.type,time:s.time,projectile:e.projectile,pendingImpact:e.pendingImpact});});};
   window.qaSetup=async(type='archer',naval=false,victory=false)=>{
    const options=victory?{mode:'custom',map:'highlands',mapSize:'spacious',seed:512,slots:[{enabled:true,team:1},{enabled:true,team:2}]}:{mode:'sandbox',map:naval?'coast':'highlands',seed:512};
    frontier.start(options);frontier.action('pause');document.querySelector('#modal-root').style.visibility='hidden';
    const s=frontier.sim;s.entities=s.entities.filter(e=>e.kind==='resource'&&(Math.abs(e.x)>25||e.z<0||e.z>65));s.index=null;s.revision++;s.grids={};
    const source=s.addUnit(type,0,0,18),target=victory?s.addBuilding('house',1,0,40,true):s.addUnit(naval?'galley':'knight',1,0,type==='archer'?27:40);
    if(victory){target.hp=2;s.addBuilding('house',0,-15,22,true);}else{s.addBuilding('house',0,-16,25,true);s.addBuilding('house',1,16,35,true);}
    source.stance=target.stance='hold';source.order={type:'attack',target:target.id};
    const nearby=type==='archer'||victory?null:s.addUnit(naval?'galley':'spearman',1,1.5,40),ally=type==='archer'||victory?null:s.addUnit(naval?'galley':'spearman',0,3,40);
    const tick=s.tickUnit.bind(s);s.tickUnit=(e,dt)=>{if(e===source||e===target&&e.order?.type==='move')return tick(e,dt);};
    qaEvents.length=0;qaSounds.length=0;qaObserve();s.visible.fill(1);v.attach(s);v.focus(0,type==='archer'?22:29);v.zoom=type==='archer'?24:32;v.tilt=.55;v.angle=.65;v.updateCamera();frontier.select([source.id]);
    window.qaIds={source:source.id,target:target.id,nearby:nearby?.id,ally:ally?.id};window.qaHP={target:target.hp,nearby:nearby?.hp,ally:ally?.hp};s.hit(source,target);await qaDraw();
    return {ids:qaIds,hp:qaHP};
   };
   window.qaAdvance=async(time)=>{const s=frontier.sim;while(s.time<time-1e-7&&!s.ended){const dt=Math.min(.05,time-s.time);s.tick(dt);await qaDraw(dt);}};
   window.qaState=()=>{const s=frontier.sim,v=frontier.view,flights=v.fx.filter(f=>f.authoritative);return {time:s.time,hp:s.entities.find(e=>e.id===qaIds.target)?.hp,pending:(s.projectiles||[]).map(p=>({id:p.id,stage:p.stage,releasedAt:p.releasedAt,impactAt:p.impactAt})),flights:flights.map(f=>({age:f.time,from:f.from.toArray(),to:f.to.toArray(),position:f.object.position.toArray(),finite:f.object.position.toArray().every(Number.isFinite)})),drawn:v.unitRenderDiagnostics.drawn,finiteRig:[...v.unitBatches.values()].flatMap(b=>b.parts).every(p=>!p.userData.rigidRig||p.userData.rigidRig.data.every(Number.isFinite)),shaderErrors:(v.renderer.info.programs||[]).filter(p=>p.diagnostics?.runnable===false).length,events:[...qaEvents],sounds:[...qaSounds]};};
  });
  const check={...item};report.cases.push(check);
  console.log('Arrow windup');const start=await page.evaluate(()=>qaSetup());await page.evaluate(()=>qaAdvance(.1));check.windup=await page.evaluate(()=>qaState());assert.equal(check.windup.hp,start.hp.target);assert.equal(check.windup.flights.length,0);
  await page.evaluate(()=>qaAdvance(.2));check.release=await page.evaluate(()=>qaState());assert.equal(check.release.hp,start.hp.target);assert.equal(check.release.flights.length,1);assert.ok(check.release.flights[0].age>0);
  const prefix=path.join(path.dirname(output),`projectile-${item.backend}-${item.quality}`);await page.screenshot({path:prefix+'-arrow.png'});
  console.log('Arrow save recovery');check.resume=await page.evaluate(async()=>{
   const before=qaState(),save=JSON.parse(JSON.stringify(frontier.sim.serialize()));frontier.start(save.options,save);frontier.action('pause');document.querySelector('#modal-root').style.visibility='hidden';qaObserve();frontier.view.focus(0,22);frontier.view.zoom=24;frontier.view.tilt=.55;frontier.view.angle=.65;frontier.view.updateCamera();await qaDraw();return {before,after:qaState()};
  });assert.equal(check.resume.after.flights.length,1);assert.equal(check.resume.after.flights[0].age,check.resume.before.flights[0].age);
  await page.evaluate(()=>qaAdvance(.5));check.impact=await page.evaluate(()=>qaState());assert.ok(check.impact.hp<start.hp.target);assert.equal(check.impact.events.filter(e=>e.type==='projectile-impact').length,1);assert.equal(check.impact.events.filter(e=>e.type==='attack').length,1);assert.equal(check.impact.sounds.filter(e=>e.kind==='arrow').length,1);assert.ok(check.impact.sounds.some(e=>e.kind==='metal'&&e.x===0&&e.z===27));
  console.log('Stop control');await page.evaluate(async()=>{await qaSetup();await qaAdvance(.05);frontier.action('stop');await qaAdvance(.8);});check.stopped=await page.evaluate(()=>qaState());assert.equal(check.stopped.hp,start.hp.target);assert.equal(check.stopped.events.length,0);assert.equal(check.stopped.pending.length,0);
  console.log('Siege dodge');await page.evaluate(async()=>{await qaSetup('catapult');await qaAdvance(.4);});check.siegeRelease=await page.evaluate(()=>qaState());assert.equal(check.siegeRelease.flights.length,1);
  await page.evaluate(()=>frontier.sim.command([qaIds.target],{type:'move',x:-15,z:40}));await page.evaluate(()=>qaAdvance(.6));await page.screenshot({path:prefix+'-siege.png'});
  await page.evaluate(()=>qaAdvance(1.2));check.siegeImpact=await page.evaluate(()=>({state:qaState(),targetX:frontier.sim.get(qaIds.target).x,hp:qaHP,nearby:frontier.sim.get(qaIds.nearby)?.hp,ally:frontier.sim.get(qaIds.ally)?.hp}));
  assert.equal(check.siegeImpact.state.hp,check.siegeImpact.hp.target);assert.ok(check.siegeImpact.targetX<-4);assert.ok(check.siegeImpact.nearby<check.siegeImpact.hp.nearby);assert.equal(check.siegeImpact.ally,check.siegeImpact.hp.ally);
  if(item.phone){
   console.log('Phone naval combat');await page.evaluate(async()=>{await qaSetup('warship',true);await qaAdvance(.3);});check.navalRelease=await page.evaluate(()=>qaState());assert.equal(check.navalRelease.flights.length,1);assert.equal(check.navalRelease.hp,await page.evaluate(()=>qaHP.target));
   await page.evaluate(()=>qaAdvance(1.1));check.navalImpact=await page.evaluate(()=>({state:qaState(),hp:qaHP,nearby:frontier.sim.get(qaIds.nearby)?.hp,ally:frontier.sim.get(qaIds.ally)?.hp,water:frontier.view.waterDiagnostics}));assert.ok(check.navalImpact.state.hp<check.navalImpact.hp.target);assert.ok(check.navalImpact.nearby<check.navalImpact.hp.nearby);assert.equal(check.navalImpact.ally,check.navalImpact.hp.ally);assert.ok(check.navalImpact.water.meshes>0);
   await page.screenshot({path:prefix+'-naval.png'});
  }
  console.log('Projectile victory');await page.evaluate(async()=>{await qaSetup('catapult',false,true);await qaAdvance(.4);});check.beforeVictory=await page.evaluate(()=>({ended:frontier.sim.ended,hp:qaState().hp}));assert.equal(check.beforeVictory.ended,null);assert.equal(check.beforeVictory.hp,2);
  await page.evaluate(()=>qaAdvance(2));check.victory=await page.evaluate(()=>{document.querySelector('#modal-root').style.visibility='';return {ended:frontier.sim.ended,title:document.querySelector('#modal-root h2')?.textContent,enemyDefeated:frontier.sim.players[1].defeated,overflow:document.documentElement.scrollWidth>innerWidth};});assert.ok(check.victory.ended?.won&&check.victory.enemyDefeated&&!check.victory.overflow);assert.match(check.victory.title,/victory/i);
  for(const state of [check.windup,check.release,check.impact,check.stopped,check.siegeRelease,check.siegeImpact.state])assert.ok(state.finiteRig&&state.shaderErrors===0&&state.flights.every(f=>f.finite));
  console.log('Passed '+JSON.stringify(item));await context.close();
 }
 assert.deepEqual(report.errors,[]);report.passed=true;
}catch(error){report.failure=error.stack;process.exitCode=1;console.log(error.stack);}
finally{clearTimeout(guard);fs.writeFileSync(output,JSON.stringify(report,null,2));await browser.close();}
console.log(JSON.stringify({passed:report.passed,output}));
