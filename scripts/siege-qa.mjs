import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import assert from 'node:assert/strict';
import {chromium} from 'playwright-core';
const tag=process.env.QA_SIEGE_TAG||'after',root=path.resolve(process.env.QA_GAME_DIST||'dist'),report={passed:false,tag,checks:[],errors:[],renderer:'SwiftShader; emulated touch is not physical-device performance'};
const mime={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.svg':'image/svg+xml'};
const server=http.createServer((req,res)=>{const u=new URL(req.url,'http://localhost'),file=path.resolve(root,'.'+(u.pathname==='/'?'/index.html':decodeURIComponent(u.pathname)));if(!file.startsWith(root+path.sep)||!fs.existsSync(file)||!fs.statSync(file).isFile()){res.writeHead(404);res.end();return;}res.writeHead(200,{'Content-Type':mime[path.extname(file)]||'application/octet-stream','Cache-Control':'no-store'});fs.createReadStream(file).pipe(res);});
let launched;const guard=setTimeout(()=>{launched?.browser.close().catch(()=>{});process.exitCode=1;},420000);
try{
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));launched={browser:await chromium.connectOverCDP(process.env.QA_BROWSER_ENDPOINT)};
 for(const quality of (process.env.QA_SIEGE_QUALITIES?.split(',')||(tag==='before'?['high']:['high','medium','low']))){
  console.log('Siege scene '+quality);const phone=quality==='low',page=await launched.browser.newPage({viewport:phone?{width:640,height:360}:{width:960,height:640},isMobile:phone,hasTouch:phone,serviceWorkers:'block'});page.setDefaultTimeout(240000);page.on('pageerror',e=>report.errors.push(e.message));
  await page.addInitScript(q=>localStorage.setItem('crowns-settings',JSON.stringify({quality:q,frameRate:'30',autoQuality:false,fog:false,weather:'clear',lighting:'day',volume:0,music:false})),quality);
  await page.goto(`http://127.0.0.1:${server.address().port}/`,{waitUntil:'domcontentloaded',timeout:90000});await page.waitForFunction(()=>window.frontier?.view);report.buildId??=await page.locator('meta[name="frontier-build"]').getAttribute('content');
  await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>{window.requestAnimationFrame=()=>0;resolve();})));
  const start=await page.evaluate(()=>{
   frontier.start({mode:'sandbox',map:'highlands',seed:512});frontier.action('pause');document.querySelector('#modal-root').style.visibility='hidden';const s=frontier.sim,v=frontier.view;
   s.entities=s.entities.filter(e=>e.kind==='resource');s.visible.fill(1);const ram=s.addUnit('ram',0,-10,10),treb=s.addUnit('catapult',0,-4,10);ram.heading=treb.heading=0;window.qaSiege=[ram.id,treb.id];v.attach(s);v.focus(-7,10);v.target.y=(v.entityHeight(ram)+v.entityHeight(treb))*.5+1.8;v.zoom=15;v.tilt=.50;v.angle=.65;v.updateCamera();v.render(0,false);return {ids:qaSiege,target:v.target.toArray(),heights:[v.entityHeight(ram),v.entityHeight(treb)]};
  });
  const poses=[];
  for(const [name,angle,cooldown]of [['front',.55,0],['side',1.55,0],['firing',.9,3.45]]){
   const pose=await page.evaluate(({angle,cooldown})=>{const v=frontier.view;for(const id of qaSiege){const e=frontier.sim.entities.find(e=>e.id===id);e.cooldown=cooldown;e.moving=false;}v.angle=angle;v.updateCamera();v.renderer.shadowMap.needsUpdate=true;v.render(.03,false);return {frame:v.renderer.info.render.frame,triangles:v.renderer.info.render.triangles,calls:v.renderer.info.render.calls,shaders:v.renderer.info.programs.filter(p=>p.diagnostics?.runnable===false).length,stats:v.unitRenderDiagnostics,rigs:[...v.unitBatches.values()].filter(b=>b.renderIds.some(id=>qaSiege.includes(id))).map(b=>({ids:b.renderIds,parts:b.parts.map(p=>({vertices:p.geometry.attributes.position.count,joints:p.userData.rigidRig?.joints.length}))}))};},{angle,cooldown});
   assert.equal(pose.shaders,0);poses.push({name,...pose});await page.screenshot({path:`artifacts/siege-${tag}-${quality}-${name}.png`});
   await page.evaluate(()=>document.querySelector('#hud').style.visibility='hidden').catch(()=>{});
   await page.screenshot({path:`artifacts/siege-${tag}-${quality}-${name}-detail.png`});
   await page.evaluate(()=>document.querySelector('#hud').style.visibility='').catch(()=>{});console.log(name+' '+JSON.stringify(pose));
  }
  assert.ok(poses[2].frame>poses[0].frame);
  const uploads=await page.evaluate(()=>{
    const v=frontier.view,rigs=[...v.unitBatches.values()].flatMap(b=>b.parts).filter(p=>p.userData.rigidRig&&p.count),arrays=new Set(rigs.map(p=>p.userData.rigidRig.data)),gl=v.renderer.getContext(),original=gl.texSubImage2D,log=[];
    gl.texSubImage2D=function(...args){if(args.some(a=>arrays.has(a)))log.push({width:args[4],height:args[5],bytes:args[4]*args[5]*16});return original.apply(this,args);};
    try{
      v.render(0,false);const idle={requests:v.unitRenderDiagnostics.rigUploadBytes,actual:log.splice(0)};
      const treb=frontier.sim.entities.find(e=>e.id===qaSiege[1]);treb.cooldown=3.3;v.render(0,false);
      const changed={requests:v.unitRenderDiagnostics.rigUploadBytes,actual:log.splice(0)},picks=[];
      for(const id of qaSiege){const e=frontier.sim.entities.find(e=>e.id===id),point=v.target.clone().set(e.x,v.entityHeight(e)+1.3,e.z).project(v.camera);v.raycaster.setFromCamera(point,v.camera);const hits=v.raycaster.intersectObjects(rigs,true);picks.push(hits.some(h=>h.object.userData.unitIds[h.instanceId]===id));}
      return {idle,changed,picks,capacity:rigs.reduce((n,p)=>n+p.userData.rigidRig.data.byteLength,0),shadows:v.renderer.shadowMap.enabled,shadowSize:v.sun.shadow.mapSize.x,ratio:v.renderer.getPixelRatio(),viewport:{overflow:document.documentElement.scrollWidth>innerWidth,coarse:matchMedia('(pointer: coarse)').matches,touch:navigator.maxTouchPoints}};
    }finally{gl.texSubImage2D=original;}
  });
  if(tag!=='before'){assert.equal(uploads.idle.requests,0);assert.deepEqual(uploads.idle.actual,[]);assert.ok(uploads.changed.requests>0&&uploads.changed.requests<uploads.capacity);assert.equal(uploads.changed.actual.reduce((n,u)=>n+u.bytes,0),uploads.changed.requests);assert.ok(uploads.picks.every(Boolean));assert.ok(!uploads.viewport.overflow);if(phone)assert.ok(uploads.viewport.coarse&&uploads.viewport.touch>0);}
  let context,rapid;
  if(process.env.QA_SIEGE_CONTEXT==='1'){
   await page.evaluate(()=>new Promise(resolve=>{const v=frontier.view,canvas=v.renderer.domElement;window.qaLost=gl=>resolve();canvas.addEventListener('webglcontextlost',qaLost,{once:true});window.qaLose=v.renderer.getContext().getExtension('WEBGL_lose_context');if(!qaLose)throw new Error('Context-loss extension unavailable');qaLose.loseContext();}));
   await page.evaluate(()=>new Promise(resolve=>{frontier.view.renderer.domElement.addEventListener('webglcontextrestored',()=>resolve(),{once:true});setTimeout(()=>qaLose.restoreContext(),150);}));
   context=await page.evaluate(()=>{
    const v=frontier.view,rigs=[...v.unitBatches.values()].flatMap(b=>b.parts).filter(p=>p.userData.rigidRig&&p.count),before=rigs.map(p=>p.userData.rigidRig.data.slice());
    const fullRequested=rigs.every(p=>p.userData.rigidRig.fullUpload&&p.userData.rigidRig.texture.updateRanges.length===0);v.renderer.shadowMap.needsUpdate=true;v.render(0,false);const complete=v.unitRenderDiagnostics.rigUploadBytes;v.render(0,false);
    return {fullRequested,complete,capacity:rigs.reduce((n,p)=>n+p.userData.rigidRig.data.byteLength,0),idle:v.unitRenderDiagnostics.rigUploadBytes,posesMatch:rigs.every((p,i)=>p.userData.rigidRig.data.every((n,j)=>n===before[i][j])),contextLost:v.renderer.getContext().isContextLost(),frame:v.renderer.info.render.frame,drawn:v.unitRenderDiagnostics.drawn,shaderErrors:v.renderer.info.programs.filter(p=>p.diagnostics?.runnable===false).length};
   });
   assert.ok(context.fullRequested&&context.posesMatch&&!context.contextLost&&context.drawn===2);assert.equal(context.complete,context.capacity);assert.equal(context.idle,0);assert.equal(context.shaderErrors,0);
   await page.screenshot({path:`artifacts/siege-${tag}-context-restored.png`});console.log('Context '+JSON.stringify(context));
   await page.evaluate(()=>{
    const v=frontier.view;window.qaStableSim=frontier.sim;window.qaStableState=JSON.stringify(frontier.sim.serialize());window.qaCompile=v.renderer.compileAsync.bind(v.renderer);window.qaAtGate=false;let count=0;
    const gate=new Promise(resolve=>window.qaUnlock=resolve);
    v.renderer.compileAsync=async(...args)=>{await qaCompile(...args);if(++count===1){window.qaAtGate=true;await gate;}};
    window.qaFirst=v.quality('low');
   });
   await page.waitForFunction(()=>window.qaAtGate);
   await page.evaluate(()=>{window.qaSecond=frontier.view.quality('high');});
   rapid=await page.evaluate(async()=>{qaUnlock();const results=await Promise.all([qaFirst,qaSecond]),v=frontier.view;v.renderer.compileAsync=qaCompile;v.render(0,false);return {results,sameMatch:frontier.sim===qaStableSim,sameState:JSON.stringify(frontier.sim.serialize())===qaStableState,quality:v.renderQuality,selected:v.settings.quality,valid:v.graphicsSceneValid,cache:v.artCacheDiagnostics,shadows:v.renderer.shadowMap.enabled,shadowSize:v.sun.shadow.mapSize.x,drawn:v.unitRenderDiagnostics.drawn,shaderErrors:v.renderer.info.programs.filter(p=>p.diagnostics?.runnable===false).length};});
   assert.deepEqual(rapid.results,[false,true]);assert.ok(rapid.sameMatch&&rapid.sameState&&rapid.valid&&rapid.shadows&&rapid.drawn===2);assert.equal(rapid.quality,'high');assert.equal(rapid.selected,'high');assert.equal(rapid.shadowSize,2048);assert.equal(rapid.cache.retained,0);assert.equal(rapid.cache.reservations,0);assert.equal(rapid.shaderErrors,0);console.log('Rapid '+JSON.stringify(rapid));
  }
  report.checks.push({quality,phone,start,poses,uploads,context,rapid});console.log('Uploads '+JSON.stringify(uploads));await page.close();
 }
 assert.deepEqual(report.errors,[]);report.passed=true;
}catch(error){report.failure=error.stack;console.log(error.stack);process.exitCode=1;}
finally{clearTimeout(guard);fs.writeFileSync(`artifacts/siege-${tag}-qa.json`,JSON.stringify(report,null,2));await launched?.browser.close().catch(()=>{});await new Promise(resolve=>server.close(resolve));}
