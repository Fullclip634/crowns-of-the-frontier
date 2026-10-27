// Render real mounted models before/after; emulated phone views are not FPS evidence.
import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';
import {chromium} from 'playwright-core';import {createGameServer} from '../server/http-app.js';import {capturePaintedBattlefield} from './painted-battlefield-qa.mjs';
const phase=process.env.MOUNTED_PHASE||'after';assert.ok(['before','after'].includes(phase));const out=path.resolve('artifacts/mounted-footing-'+phase);fs.mkdirSync(out,{recursive:true});
const {server,rooms}=createGameServer({root:path.resolve(process.env.QA_GAME_DIST||'dist')});let browser,page;const report={phase,passed:false,checks:[],errors:[],scope:'Production rendering and emulated viewports; not physical-device FPS'};
try{
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));browser=process.env.QA_BROWSER_ENDPOINT?await chromium.connectOverCDP(process.env.QA_BROWSER_ENDPOINT):await chromium.launch({channel:'msedge',headless:true});
  for(const profile of [{name:'desktop',renderer:'webgpu',quality:'high',width:1000,height:700},{name:'balanced',renderer:'webgpu',quality:'medium',width:1000,height:700},{name:'phone',renderer:'webgl',quality:'low',width:568,height:320,touch:true}]){
    if(phase==='before'&&profile.name==='balanced')continue;console.log('Inspect mounted footing: '+profile.name+' '+phase);
    const context=await browser.newContext({viewport:{width:profile.width,height:profile.height},isMobile:!!profile.touch,hasTouch:!!profile.touch,serviceWorkers:'block'});page=await context.newPage();page.setDefaultTimeout(120000);
    page.on('pageerror',error=>report.errors.push(error.message));page.on('console',message=>{if(message.type()==='error')report.errors.push(message.text());});
    await page.addInitScript(quality=>localStorage.setItem('crowns-settings',JSON.stringify({quality,autoQuality:false,fog:false,weather:'clear',lighting:'day',music:false,volume:0,edgeScroll:false})),profile.quality);
    await page.goto(`http://127.0.0.1:${server.address().port}/?renderer=${profile.renderer}`,{waitUntil:'domcontentloaded'});await page.waitForFunction(()=>window.frontier?.view&&!frontier.view.graphicsLoading);
    const site=await page.evaluate(({phone})=>{
      const v=frontier.view;window.qaRender=v.render.bind(v);v.render=()=>false;frontier.start({mode:'sandbox',map:'highlands',seed:512});const s=frontier.sim,l=v.landscape;let best=Infinity,spot;
      for(let z=-48;z<=48;z+=4)for(let x=-48;x<=48;x+=4){const dx=(l.heightAt(x+.4,z)-l.heightAt(x-.4,z))/.8,dz=(l.heightAt(x,z+.4)-l.heightAt(x,z-.4))/.8,grade=Math.hypot(dx,dz),score=Math.abs(grade-.27)+Math.abs(dz)*.25;if(score<best&&grade>.23){best=score;spot={x,z,dx,dz,grade};}}
      s.tick=()=>{};s.entities=[];s.index=new Map();s.nextId=1;s.grids={};s.revision++;
      window.qaTroops=['scout','knight','outrider'].map((type,i)=>{const e=s.addUnit(type,0,spot.x+(i-1)*3,spot.z);e.heading=.15;return e;});s.visible.fill(1);s.explored.fill(1);v.attach(s);v.focus(spot.x,spot.z);v.zoom=phone?16:12;v.tilt=.5;v.angle=.9;v.updateCamera();
      window.qaGaits=new Map(qaTroops.map(e=>[e.id,{phase:0,blend:0,bob:0}]));v.locomotion.states=qaGaits;v.locomotion.update=e=>qaGaits.get(e.id);document.querySelector('#hud').style.visibility='hidden';document.querySelector('#modal-root').style.visibility='hidden';
      window.qaDraw=async()=>{await v.renderer.backend?.device?.queue?.onSubmittedWorkDone();v.clock=4;qaRender(.016,false);await v.renderer.backend?.device?.queue?.onSubmittedWorkDone();};return spot;
    },{phone:!!profile.touch});
    for(const cycle of ['idle',0,.25,.5,.75]){
      await page.evaluate(cycle=>{for(const e of qaTroops){e.moving=cycle!=='idle';const gait=qaGaits.get(e.id);gait.phase=cycle==='idle'?0:cycle*Math.PI*2;gait.blend=Number(e.moving);gait.bob=e.moving?(1-Math.cos(gait.phase*2))*.027:0;}},cycle);
      for(let i=0;i<4;i++)await page.evaluate(()=>qaDraw());const painted=await capturePaintedBattlefield(page,path.join(out,profile.name+'-'+cycle+'.png'),{manual:true});
      const state=await page.evaluate(()=>({renderer:document.documentElement.dataset.renderer,quality:frontier.view.renderQuality,fatal:frontier.view.graphicsFatal||null,error:frontier.view.graphicsError||null,units:qaTroops.map(e=>({id:e.id,type:e.type,rig:frontier.view.nodes.get(e.id)?.userData.model3d?.terrainHorse||false,pose:frontier.view.footPoses.get(e.id)?.kind||null,feet:frontier.view.footPoses.get(e.id)?.feet?.length||0})),diagnostics:frontier.view.footDiagnostics,render:frontier.view.unitRenderDiagnostics}));
      assert.equal(state.renderer,profile.renderer);assert.equal(state.quality,profile.quality);assert.equal(state.fatal,null);assert.equal(state.error,null);assert.equal(state.units.length,3);
      for(const unit of state.units){assert.equal(unit.rig,phase==='after');if(phase==='after'){assert.equal(unit.pose,'horse');assert.equal(unit.feet,4);}}
      report.checks.push({profile:profile.name,cycle,site,pixels:painted.pixels,...state});
    }
    await context.close();page=null;
  }
  assert.deepEqual(report.errors,[]);report.passed=true;
}catch(error){report.error=error.stack;process.exitCode=1;console.error(error.stack);try{await page?.screenshot({path:path.join(out,'failure.png'),timeout:10000});}catch{}}
finally{fs.writeFileSync(path.join(out,'report.json'),JSON.stringify(report,null,2));console.log(JSON.stringify({phase,passed:report.passed,checks:report.checks.length,error:report.error}));await browser?.close().catch(()=>{});rooms.close();server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
