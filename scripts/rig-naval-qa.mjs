import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const report={checks:[],errors:[],passed:false};
const browser=await chromium.launch({channel:'msedge',headless:true,args:['--enable-webgl','--ignore-gpu-blocklist']});
try{
  const page=await browser.newPage({viewport:{width:1280,height:720}});page.setDefaultTimeout(90000);
  page.on('pageerror',error=>report.errors.push(error.message));page.on('console',message=>{if(message.type()==='error')report.errors.push(message.text());});
  await page.addInitScript(()=>localStorage.setItem('crowns-settings',JSON.stringify({quality:'low',autoQuality:false,music:false,volume:0,weather:'clear'})));
  await page.goto(process.env.QA_URL||'http://localhost:4174/',{waitUntil:'domcontentloaded'});await page.waitForFunction(()=>window.frontier?.view);
  for(const quality of ['low','high']){
    await page.evaluate(quality=>frontier.view.quality(quality),quality);await page.waitForFunction(quality=>frontier.view.artDiagnostics.detail===quality&&frontier.view.surfaceQuality===quality,quality);
    const check=await page.evaluate(()=>{
      frontier.start({mode:'sandbox',map:'coast',seed:512});frontier.action('pause');document.querySelector('#modal-root').style.visibility='hidden';
      const s=frontier.sim,v=frontier.view;s.stop(s.owned(0,'unit').map(entity=>entity.id));s.visible.fill(1);s.explored.fill(1);
      const actors=['fishingboat','galley','warship','transport'].map((type,index)=>s.addUnit(type,index%2,0,28+index*13));
      // Keep foreground scenery away from the actor probes; an obscured body
      // should correctly pick its occluder, not be counted as a renderer fault.
      const clearSites=[{x:-24,z:37},{x:-24,z:58}];
      for(const entity of s.entities)if(entity.kind==='resource'&&clearSites.some(site=>Math.hypot(entity.x-site.x,entity.z-site.z)<22))entity.hp=0;
      actors.push(s.addUnit('monk',0,-24,37),s.addUnit('king',1,-24,58));for(const entity of actors){entity.moving=false;entity.heading=.3;entity.cooldown=.6;}
      const pixels=()=>{const gl=v.renderer.getContext(),data=new Uint8Array(gl.drawingBufferWidth*gl.drawingBufferHeight*4);gl.readPixels(0,0,gl.drawingBufferWidth,gl.drawingBufferHeight,gl.RGBA,gl.UNSIGNED_BYTE,data);return data;};
      const draw=rigid=>{v.settings.rigidUnits=rigid;v.attach(s);v.clock=25;v.zoom=48;v.tilt=.7;v.angle=.3;v.focus(-6,49);v.render(0,false);return {pixels:pixels(),draws:v.renderer.info.render.calls,triangles:v.renderer.info.render.triangles,units:{...v.unitRenderDiagnostics},memory:{...v.renderer.info.memory}};};
      const pick=()=>actors.map(entity=>{const rect=v.renderer.domElement.getBoundingClientRect();return {id:entity.id,type:entity.type,packed:v.nodes.get(entity.id).userData.batch.renderIds.includes(entity.id),probes:[.4,.8,1.2,1.8,2.5,3.4,4.5,6].map(height=>{const point=v.camera.position.clone().set(entity.renderX,v.entityHeight(entity)+height,entity.renderZ).project(v.camera);return {height,hit:v.pick(rect.left+(point.x+1)*rect.width/2,rect.top+(1-point.y)*rect.height/2)?.id??null};})};});
      const before=draw(false),oldPicks=pick(),after=draw(true),picks=pick();let changed=0,total=0,max=0;const histogram=new Uint32Array(256);
      for(let i=0;i<before.pixels.length;i+=4){let delta=0;for(let channel=0;channel<3;channel++)delta=Math.max(delta,Math.abs(before.pixels[i+channel]-after.pixels[i+channel]));histogram[delta]++;total+=delta;max=Math.max(max,delta);if(delta)changed++;}
      const count=before.pixels.length/4;let cumulative=0,p99=0;for(let delta=0;delta<256;delta++){cumulative+=histogram[delta];if(cumulative>=count*.99){p99=delta;break;}}
      const memory=[];for(let repeat=0;repeat<3;repeat++){draw(true);memory.push({...v.renderer.info.memory});}
      return {quality:v.settings.quality,models:v.artDiagnostics.models,before:{draws:before.draws,triangles:before.triangles,units:before.units},after:{draws:after.draws,triangles:after.triangles,units:after.units},image:{changed,pixels:count,average:total/count,max,p99},oldPicks,picks,memory};
    });
    report.checks.push(check);await page.screenshot({path:`artifacts/rig-naval-${quality}.png`});assert.equal(check.models,126);assert.equal(check.before.triangles,check.after.triangles);assert.ok(check.after.draws<check.before.draws);assert.ok(check.after.units.rigParts>0);
    assert.ok(check.image.average<.5&&check.image.p99<4,'ships, sails, characters and shadows retain their rendered appearance');
    for(let i=0;i<check.oldPicks.length;i++){
      const actor=check.oldPicks[i];assert.ok(actor.packed&&check.picks[i].packed);assert.ok(actor.probes.some(probe=>probe.hit===actor.id),`${actor.type} must expose a pickable solid surface`);
      for(let probe=0;probe<actor.probes.length;probe++)if(actor.probes[probe].hit===actor.id)assert.equal(check.picks[i].probes[probe].hit,actor.id,`${actor.type} preserves body picking`);
    }
    assert.ok(check.memory.at(-1).geometries<=check.memory[0].geometries+1);assert.ok(check.memory.at(-1).textures<=check.memory[0].textures+1);
  }
  assert.deepEqual(report.errors,[]);report.passed=true;console.log(JSON.stringify(report,null,2));
}finally{fs.writeFileSync('artifacts/rig-naval-qa.json',JSON.stringify(report,null,2));await browser.close();}
