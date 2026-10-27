// Rendered production checks; mobile viewport emulation is not a phone FPS test.
import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';
import {chromium} from 'playwright-core';import {createGameServer} from '../server/http-app.js';
import {capturePaintedBattlefield} from './painted-battlefield-qa.mjs';
const out=path.resolve('artifacts/defense-water-final');fs.mkdirSync(out,{recursive:true});
const {server,rooms}=createGameServer({root:path.resolve(process.env.QA_GAME_DIST||'dist')});let browser,page;
const report={passed:false,checks:[],errors:[],scope:'Production rendering and emulated viewports; not physical-device FPS'};
async function compare(page,first,second){
  return page.evaluate(async ([a,b])=>{
    const decode=async value=>{const image=new Image();image.src='data:image/png;base64,'+value;await image.decode();const canvas=document.createElement('canvas');canvas.width=image.naturalWidth;canvas.height=image.naturalHeight;const context=canvas.getContext('2d',{willReadFrequently:true});context.drawImage(image,0,0);return context.getImageData(0,0,canvas.width,canvas.height).data;};
    const x=await decode(a),y=await decode(b);let changed=0,difference=0;for(let i=0;i<x.length;i+=4){const delta=Math.abs(x[i]-y[i])+Math.abs(x[i+1]-y[i+1])+Math.abs(x[i+2]-y[i+2]);if(delta>3)changed++;difference+=delta;}return {changed,difference,pixels:x.length/4};
  },[first.toString('base64'),second.toString('base64')]);
}
try{
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));browser=process.env.QA_BROWSER_ENDPOINT?await chromium.connectOverCDP(process.env.QA_BROWSER_ENDPOINT):await chromium.launch({channel:'msedge',headless:true});
  for(const profile of [{name:'desktop',renderer:'webgpu',quality:'high',width:960,height:640},{name:'phone',renderer:'webgl',quality:'low',width:568,height:320,touch:true}]){
    console.log('Inspect water and defenses: '+profile.name);
    const context=await browser.newContext({viewport:{width:profile.width,height:profile.height},isMobile:!!profile.touch,hasTouch:!!profile.touch,serviceWorkers:'block'});page=await context.newPage();page.setDefaultTimeout(120000);
    page.on('pageerror',error=>report.errors.push(error.message));page.on('console',message=>{if(message.type()==='error')report.errors.push(message.text());});
    await page.addInitScript(quality=>localStorage.setItem('crowns-settings',JSON.stringify({quality,autoQuality:false,fog:false,weather:'clear',lighting:'day',music:false,volume:0,edgeScroll:false})),profile.quality);
    await page.goto(`http://127.0.0.1:${server.address().port}/?renderer=${profile.renderer}`,{waitUntil:'domcontentloaded'});await page.waitForFunction(()=>window.frontier?.view&&!frontier.view.graphicsLoading);
    await page.evaluate(()=>{
      const v=frontier.view;window.qaRender=v.render.bind(v);v.render=()=>false;frontier.start({mode:'sandbox',map:'valley',seed:512});frontier.sim.tick=()=>{};frontier.action('pause');
      document.querySelector('#modal-root').style.visibility='hidden';document.querySelector('#hud').style.visibility='hidden';v.settings.fog=false;v.objects.visible=false;
      for(const child of v.terrain.children)if(child!==v.groundSurface&&!v.waterMeshes.includes(child))child.visible=false;
      v.focus(0,28);v.zoom=27;v.angle=.85;v.tilt=.6;v.updateCamera();window.qaDraw=async()=>{await v.renderer.backend?.device?.queue?.onSubmittedWorkDone();qaRender(0,false);await v.renderer.backend?.device?.queue?.onSubmittedWorkDone();};
    });
    const capture=async(time,still)=>{
      await page.evaluate(({time,still})=>{frontier.view.clock=time;frontier.view.settings.reducedMotion=still;},{time,still});for(let i=0;i<4;i++)await page.evaluate(()=>qaDraw());
      return page.screenshot({clip:{x:Math.floor(profile.width*.15),y:Math.floor(profile.height*.2),width:Math.floor(profile.width*.7),height:Math.floor(profile.height*.6)}});
    };
    const first=await capture(0,false),second=await capture(2.3,false),motion=await compare(page,first,second);assert.ok(motion.changed>40&&motion.difference>200,JSON.stringify(motion));
    const stillA=await capture(0,true),stillB=await capture(2.3,true),still=await compare(page,stillA,stillB);assert.equal(still.difference,0,'reduced motion freezes the water');
    const water=await page.evaluate(()=>({renderer:document.documentElement.dataset.renderer,quality:frontier.view.renderQuality,time:frontier.view.materials.water.frontierWaveTime.value,uploads:frontier.view.waterDiagnostics.geometryUploadsPerFrame,fatal:frontier.view.graphicsFatal||null}));
    assert.equal(water.renderer,profile.renderer);assert.equal(water.quality,profile.quality);assert.equal(water.time,0);assert.equal(water.uploads,0);assert.equal(water.fatal,null);
    fs.writeFileSync(path.join(out,profile.name+'-water-0.png'),first);fs.writeFileSync(path.join(out,profile.name+'-water-2.png'),second);
    await page.evaluate(({phone})=>{
      const v=frontier.view;v.settings.reducedMotion=false;frontier.start({mode:'sandbox',map:'highlands',seed:512});const s=frontier.sim;s.tick=()=>{};s.checkVictory=()=>{};
      s.entities=[];s.index=new Map();s.nextId=1;s.grids={};s.revision++;s.visible.fill(1);s.explored.fill(1);s.players[0].age=3;s.players[0].resources.stone=5000;
      const worker=s.addUnit('villager',0,-15,-7),left=s.addResource('wood',-10,0,600),right=s.addResource('wood',10,0,600),walls=s.buildWallLine({x:-7.575,z:0},{x:7.575,z:0},[worker.id]);for(const wall of walls)wall.progress=1;
      const keep=s.addBuilding('keep',0,0,-10,true),enemy=s.addUnit('ram',1,0,10),attacker=s.addUnit('swordsman',1,8,-10);s.command([attacker.id],{type:'attack',target:keep.id});
      for(let i=0;i<200&&keep.hp===keep.maxHp;i++){s.time+=.05;s.tickUnit(attacker,.05);}s.hit(keep,enemy);
      v.attach(s);v.objects.visible=true;v.focus(0,0);v.zoom=phone?38:32;v.angle=.7;v.tilt=.6;v.updateCamera();
      window.qaScenario={left:left.id,right:right.id,worker:worker.id,walls:walls.length,keep:keep.id,attacker:attacker.id,enemy:enemy.id};
    },{phone:!!profile.touch});
    for(let i=0;i<4;i++)await page.evaluate(()=>qaDraw());const shot=await capturePaintedBattlefield(page,path.join(out,profile.name+'-battle.png'),{manual:true});
    const battle=await page.evaluate(()=>({natural:frontier.view.wallVisuals.links.filter(link=>link.natural).length,wallCount:qaScenario.walls,castleDamage:frontier.sim.get(qaScenario.keep).maxHp-frontier.sim.get(qaScenario.keep).hp,arrows:(frontier.sim.projectiles[0]?.bonus?.length||0)+1,overflow:document.documentElement.scrollWidth>innerWidth,fatal:frontier.view.graphicsFatal||null}));
    assert.equal(battle.natural,2);assert.ok(battle.wallCount>=4);assert.ok(battle.castleDamage>0);assert.equal(battle.arrows,5);assert.equal(battle.overflow,false);assert.equal(battle.fatal,null);
    await page.evaluate(()=>{frontier.select([qaScenario.worker]);frontier.action('build');document.querySelector('[data-build="wall"]').click();});
    const click=await page.evaluate(()=>{const v=frontier.view,tree=frontier.sim.get(qaScenario.left),p=v.project(tree);for(const dy of [0,-4,4,-8,8,-12,12])for(const dx of [0,-4,4,-8,8])if(v.pick(p.x+dx,p.y+dy)?.id===tree.id)return {x:p.x+dx,y:p.y+dy};throw Error('Could not pick the visible tree canopy');});
    if(profile.touch)await page.touchscreen.tap(click.x,click.y);else await page.mouse.click(click.x,click.y);
    const anchor=await page.evaluate(()=>({point:frontier.view.wallPreviewDiagnostics?.from,tree:frontier.sim.get(qaScenario.left)}));
    assert.ok(anchor.point&&Math.hypot(anchor.point.x-anchor.tree.x,anchor.point.z-anchor.tree.z)<.01,'actual pointer input selects the tree trunk');
    report.checks.push({profile:profile.name,motion,still,water,battle,treeTap:true,pixels:shot.pixels});await context.close();page=null;
  }
  assert.deepEqual(report.errors,[]);report.passed=true;
}catch(error){report.error=error.stack;process.exitCode=1;console.error(error.stack);}
finally{fs.writeFileSync(path.join(out,'report.json'),JSON.stringify(report,null,2));console.log(JSON.stringify({passed:report.passed,checks:report.checks.length,error:report.error}));await browser?.close().catch(()=>{});rooms.close();server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
