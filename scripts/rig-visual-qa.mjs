import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const report={checks:[],errors:[],passed:false},browser=await chromium.launch({channel:'msedge',headless:true,args:['--enable-webgl','--ignore-gpu-blocklist']});
try{
  const page=await browser.newPage({viewport:{width:1024,height:720}});page.setDefaultTimeout(90000);page.on('pageerror',e=>report.errors.push(e.message));page.on('console',m=>{if(m.type()==='error')report.errors.push(m.text());});
  await page.addInitScript(()=>localStorage.setItem('crowns-settings',JSON.stringify({quality:'low',autoQuality:false,weather:'clear',music:false,volume:0})));
  await page.goto(process.env.QA_URL||'http://localhost:4174/',{waitUntil:'domcontentloaded'});await page.waitForFunction(()=>window.frontier?.view);
  for(const quality of process.argv[2]? [process.argv[2]]:['low','high']){
    await page.evaluate(q=>frontier.view.quality(q),quality);await page.waitForFunction(q=>frontier.view.surfaceQuality===q&&frontier.view.artDiagnostics.detail===(q==='high'?'high':'low'),quality);
    const check=await page.evaluate(()=>{
      frontier.start({mode:'sandbox',map:'highlands',seed:512});frontier.action('pause');document.querySelector('#modal-root').style.visibility='hidden';
      const v=frontier.view,s=frontier.sim;s.stop(s.owned(0,'unit').map(e=>e.id));s.visible.fill(1);s.explored.fill(1);
      const actors=['villager','spearman','swordsman','archer','scout','knight','sentinel','marksman','outrider','ram','catapult','cart'].map((type,i)=>{const e=s.addUnit(type,i%2,-44+(i%6)*3,46+Math.floor(i/6)*4);e.moving=false;e.cooldown=['archer','marksman'].includes(type)?1.6:type==='swordsman'?.5:0;return e;});
      const pixels=()=>{const gl=v.renderer.getContext(),data=new Uint8Array(gl.drawingBufferWidth*gl.drawingBufferHeight*4);gl.readPixels(0,0,gl.drawingBufferWidth,gl.drawingBufferHeight,gl.RGBA,gl.UNSIGNED_BYTE,data);return data;};
      const draw=rigid=>{v.settings.rigidUnits=rigid;v.attach(s);v.clock=25;v.zoom=25;v.tilt=.62;v.focus(-36,49);v.render(0,false);return {pixels:pixels(),draws:v.renderer.info.render.calls,triangles:v.renderer.info.render.triangles,memory:{...v.renderer.info.memory},units:{...v.unitRenderDiagnostics}};};
      const pickBodies=()=>actors.map(e=>{const rect=v.renderer.domElement.getBoundingClientRect();return {type:e.type,id:e.id,probes:[.9,1.3,1.7,2.1,2.6,3.1].map(height=>{const point=v.camera.position.clone().set(e.renderX,v.entityHeight(e)+height,e.renderZ).project(v.camera),x=rect.left+(point.x+1)*rect.width/2,y=rect.top+(1-point.y)*rect.height/2;return {height,hit:v.pick(x,y)?.id??null};})};});
      const compare=(a,b)=>{const histogram=new Uint32Array(256),width=v.renderer.getContext().drawingBufferWidth;let changed=0,max=0,total=0,minX=width,minY=Infinity,maxX=0,maxY=0;const tiles={};for(let i=0;i<a.length;i+=4){let delta=0;for(let c=0;c<3;c++)delta=Math.max(delta,Math.abs(a[i+c]-b[i+c]));histogram[delta]++;if(delta){changed++;const pixel=i/4,x=pixel%width,y=Math.floor(pixel/width),key=`${Math.floor(x/64)},${Math.floor(y/64)}`;minX=Math.min(minX,x);maxX=Math.max(maxX,x);minY=Math.min(minY,y);maxY=Math.max(maxY,y);tiles[key]=(tiles[key]||0)+1;}max=Math.max(max,delta);total+=delta;}let cumulative=0,p95=0,p99=0,found95=false,found99=false;for(let delta=0;delta<256;delta++){cumulative+=histogram[delta];if(!found95&&cumulative>Math.floor(a.length/4*.95)){p95=delta;found95=true;}if(!found99&&cumulative>Math.floor(a.length/4*.99)){p99=delta;found99=true;}}return {pixels:a.length/4,changed,max,average:total/(a.length/4),p95,p99,bounds:changed?{minX,minY,maxX,maxY}:null,topTiles:Object.entries(tiles).sort((a,b)=>b[1]-a[1]).slice(0,12)};};
      const before=draw(false),beforePicks=pickBodies(),beforePng=v.settings.quality==='high'?v.renderer.domElement.toDataURL('image/png'):null,after=draw(true),picks=pickBodies(),afterPng=v.settings.quality==='high'?v.renderer.domElement.toDataURL('image/png'):null,image=compare(before.pixels,after.pixels);
      if(beforePng)window.__rigDebugFrames=[beforePng,afterPng];
      const textures=[];for(let scene=0;scene<3;scene++){v.attach(s);v.clock=25;v.zoom=25;v.tilt=.62;v.focus(-36,49);v.render(0,false);textures.push({...v.renderer.info.memory});}
      return {quality:v.settings.quality,models:v.artDiagnostics.models,before:{draws:before.draws,triangles:before.triangles,memory:before.memory,units:before.units},after:{draws:after.draws,triangles:after.triangles,memory:after.memory,units:after.units},image,beforePicks,picks,textures};
    });
    if(quality==='high'){const frames=await page.evaluate(()=>window.__rigDebugFrames);for(let i=0;i<frames.length;i++)fs.writeFileSync(`artifacts/rig-high-${i?'after':'before'}.png`,Buffer.from(frames[i].split(',')[1],'base64'));}
    report.checks.push(check);assert.equal(check.models,126);assert.equal(check.before.triangles,check.after.triangles,'no visual geometry may be removed');assert.ok(check.after.draws<check.before.draws);assert.ok(check.after.units.rigParts>0);assert.ok(check.image.average<.5&&check.image.p99<4,'the new renderer must preserve color and shadow pixels');
    assert.ok(check.beforePicks.filter(p=>p.probes.some(probe=>probe.hit===p.id)).length>=8,'fixture must expose visible solid actor bodies');
    for(const [index,actor]of check.beforePicks.entries())for(const [probeIndex,probe]of actor.probes.entries())if(probe.hit===actor.id)assert.equal(check.picks[index].probes[probeIndex].hit,actor.id,'every visible body hit must survive the renderer change');
    assert.ok(check.textures.at(-1).textures<=check.textures[0].textures+1);assert.ok(check.textures.at(-1).geometries<=check.textures[0].geometries+1);await page.screenshot({path:`artifacts/rig-${quality}.png`});
  }
  assert.deepEqual(report.errors,[]);report.passed=true;console.log(JSON.stringify(report,null,2));
}finally{fs.writeFileSync('artifacts/rig-visual-qa.json',JSON.stringify(report,null,2));await browser.close();}
