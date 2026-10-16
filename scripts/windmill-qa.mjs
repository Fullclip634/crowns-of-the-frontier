import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import assert from 'node:assert/strict';
import {chromium} from 'playwright-core';
const baseline=process.env.QA_WINDMILL_BASELINE==='1',root=path.resolve(process.env.QA_GAME_DIST||'dist'),tag=baseline?'before':'after',report={passed:false,baseline,checks:[],errors:[],renderer:'SwiftShader software rendering; phone uses emulated touch, not physical-device performance'};let browser;
const mime={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.svg':'image/svg+xml'};
const server=http.createServer((request,response)=>{const u=new URL(request.url,'http://localhost'),file=path.resolve(root,'.'+(u.pathname==='/'?'/index.html':decodeURIComponent(u.pathname)));if(!file.startsWith(root+path.sep)||!fs.existsSync(file)||!fs.statSync(file).isFile()){response.writeHead(404);response.end();return;}response.writeHead(200,{'Content-Type':mime[path.extname(file)]||'application/octet-stream','Cache-Control':'no-store'});fs.createReadStream(file).pipe(response);});
const guard=setTimeout(()=>{report.guard='Eight-minute windmill browser limit';browser?.close().catch(()=>{});setTimeout(()=>process.exit(1),5000);},480000);
function fixture(faction){
  frontier.start({mode:'sandbox',map:'highlands',seed:512});frontier.action('pause');document.querySelector('#modal-root').style.visibility='hidden';
  const s=frontier.sim,v=frontier.view;s.players[0].faction=faction;s.visible.fill(1);v.attach(s);
  const site=s.owned(0,'building','mill')[0];window.qaMill=site.id;v.focus(site.x,site.z);v.target.y+=4.3;v.zoom=16;v.tilt=.48;v.angle=.65;v.updateCamera();v.render(0,false);
  return {site:site.id,faction,authored:v.nodes.get(site.id).userData.model3d};
}
function draw({angle,phase}){
  const v=frontier.view,node=v.nodes.get(qaMill);v.angle=angle;v.clock=phase/.4;v.updateCamera();
  // Keep the real terrain, game model, shaders, shadow and camera. Hide nearby
  // buildings/trees for an unobstructed view of the reported mesh collision.
  const hidden=[];for(const object of v.objects.children)if(object!==node){hidden.push([object,object.visible]);object.visible=false;}
  for(const n of v.nodes.values())if(n!==node)n.visible=false;
  // The game updates visibility during render, so isolate the selected model
  // at the renderer boundary rather than mutating simulation entities.
  const render=v.renderer.render.bind(v.renderer);v.renderer.render=(scene,camera)=>{for(const child of v.objects.children)if(child!==node)child.visible=false;render(scene,camera);};
  v.renderer.shadowMap.needsUpdate=true;v.render(0,false);v.renderer.render=render;
  let rotor;node.traverse(n=>{if(n.userData.windmill)rotor=n;});
  const ray=v.raycaster;ray.setFromCamera({x:0,y:0},v.camera);const hits=ray.intersectObject(node,true);
  return {pivot:rotor.position.toArray(),angle:rotor.rotation.z,meshes:(()=>{let count=0;node.traverse(n=>{if(n.isMesh)count++;});return count;})(),pickable:hits.length>0,shaderFailures:v.renderer.info.programs.filter(p=>p.diagnostics?.runnable===false).length,frame:v.renderer.info.render.frame};
}
try{
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));browser=await chromium.connectOverCDP(process.env.QA_BROWSER_ENDPOINT);
  for(const phone of baseline?[false]:[false,true]){
    const quality=baseline?'low':phone?'low':'high';report.stage=`${phone?'phone':'desktop'}-${quality}`;console.log(report.stage);
    const page=await browser.newPage({viewport:phone?{width:640,height:360}:{width:960,height:640},isMobile:phone,hasTouch:phone,serviceWorkers:'block'});page.setDefaultTimeout(240000);page.on('pageerror',e=>report.errors.push(e.message));
    await page.addInitScript(quality=>localStorage.setItem('crowns-settings',JSON.stringify({quality,frameRate:'30',autoQuality:false,fog:false,weather:'clear',lighting:'day',volume:0,music:false})),quality);
    await page.goto(`http://127.0.0.1:${server.address().port}/`,{waitUntil:'domcontentloaded',timeout:90000});await page.waitForFunction(()=>window.frontier?.view);report.buildId??=await page.locator('meta[name="frontier-build"]').getAttribute('content');
    await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>{window.requestAnimationFrame=()=>0;resolve();})));
    for(const faction of baseline?['alder','raven']:['alder','sun','raven']){
      const start=await page.evaluate(fixture,faction),poses=[];
      for(const [name,angle,phase]of [['front',.15,0],['side',1.25,Math.PI/4]]){
        const pose=await page.evaluate(draw,{angle,phase});assert.ok(pose.pickable);assert.equal(pose.shaderFailures,0);if(!baseline)assert.ok(Math.abs(pose.pivot[2]-2.65)<.001);poses.push({name,...pose});
        await page.screenshot({path:`artifacts/windmill-${tag}-${phone?'phone-':''}${faction}-${name}.png`});
      }
      assert.ok(poses[1].frame>poses[0].frame&&poses[1].angle!==poses[0].angle);
      const viewport=await page.evaluate(()=>({overflow:document.documentElement.scrollWidth>innerWidth,coarse:matchMedia('(pointer: coarse)').matches,touch:navigator.maxTouchPoints}));assert.ok(!viewport.overflow);if(phone)assert.ok(viewport.coarse&&viewport.touch>0);
      report.checks.push({quality,phone,start,poses,viewport});console.log(`${faction}: two rendered angles, rotor animated and pickable`);
    }
    await page.close();
  }
  assert.deepEqual(report.errors,[]);report.passed=true;console.log(JSON.stringify({passed:true,checks:report.checks.length,buildId:report.buildId}));
}catch(error){report.failure=error.stack;process.exitCode=1;console.log(JSON.stringify({stage:report.stage,error:error.message}));}
finally{clearTimeout(guard);fs.writeFileSync(`artifacts/windmill-${tag}-qa.json`,JSON.stringify(report,null,2));await browser?.close().catch(()=>{});await new Promise(resolve=>server.close(resolve));}
