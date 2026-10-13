import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const browser=await chromium.launch({channel:'msedge',headless:true,args:['--enable-webgl','--ignore-gpu-blocklist']}),report={checks:[],errors:[],passed:false};
try{
  const page=await browser.newPage({viewport:{width:1280,height:720}});page.setDefaultTimeout(90000);page.on('pageerror',e=>report.errors.push(e.message));page.on('console',message=>{if(message.type()==='error')report.errors.push(message.text());});
  await page.addInitScript(()=>localStorage.setItem('crowns-settings',JSON.stringify({quality:'low',autoQuality:false,weather:'clear',music:false,volume:0})));
  await page.goto(process.env.QA_URL||'http://localhost:4174/',{waitUntil:'domcontentloaded'});await page.waitForFunction(()=>window.frontier?.view);
  const check=await page.evaluate(()=>{
    frontier.start({mode:'sandbox',map:'highlands',seed:512});frontier.action('pause');document.querySelector('#modal-root').style.visibility='hidden';
    const s=frontier.sim,v=frontier.view;s.stop(s.owned(0,'unit').map(e=>e.id));const worker=s.owned(0,'unit','villager')[0],horse=s.owned(0,'unit','scout')[0],ram=s.addUnit('ram',0,-44,46);
    worker.x=-40;worker.z=46;horse.x=-42;horse.z=46;s.revision++;s.updateFog();v.localMotion.clear();v.locomotion.clear();v.focus(-40,50);v.zoom=18;v.tilt=.65;v.render(0,false);
    for(const e of [worker,horse,ram])s.command([e.id],{type:'move',x:e.x,z:56});
    const trace=[];
    for(let tick=0;tick<10;tick++){
      v.localMotion.capture(s);s.tick(.1);v.localMotion.commit(s);
      for(const blend of [.25,.5,.75,1]){v.localBlend=blend;v.render(.025,false);trace.push({x:worker.renderX,z:worker.renderZ,phase:v.locomotion.get(worker.id).phase,blend:v.locomotion.get(worker.id).blend,ramBob:v.locomotion.get(ram.id).bob});}
    }
    const root=s.get(worker.id),authoritative=[root.x,root.z],before=v.locomotion.get(worker.id).phase,wheel=v.locomotion.get(ram.id).wheel;
    for(let i=0;i<45;i++)v.render(1/30,false);
    const result={models:v.artDiagnostics.models,trace,initial:{x:-40,z:46,phase:(worker.id*.7)%(Math.PI*2)},authoritative,after:[worker.x,worker.z],stopped:{phaseBefore:before,phaseAfter:v.locomotion.get(worker.id).phase,blend:v.locomotion.get(worker.id).blend,wheelBefore:wheel,wheelAfter:v.locomotion.get(ram.id).wheel},visible:[worker,horse,ram].map(e=>({type:e.type,packed:v.nodes.get(e.id).userData.batch.renderIds.includes(e.id)})),savedGait:s.serialize().locomotion};
    return result;
  });
  assert.equal(check.models,126);assert.ok(check.visible.every(e=>e.packed));assert.deepEqual(check.authoritative,check.after);assert.equal(check.savedGait,undefined);
  let travelled=0,phase=check.initial.phase,previous=check.initial;for(const pose of check.trace){travelled+=Math.hypot(pose.x-previous.x,pose.z-previous.z);phase=(check.initial.phase+travelled*Math.PI*2/2.05)%(Math.PI*2);assert.ok(Math.abs(pose.phase-phase)<1e-8,'the actual Blender rig advances by interpolated travel');assert.equal(pose.ramBob,0);previous=pose;}
  assert.ok(travelled>2);assert.equal(check.stopped.phaseBefore,check.stopped.phaseAfter);assert.equal(check.stopped.wheelBefore,check.stopped.wheelAfter);assert.ok(check.stopped.blend<1e-8);
  report.checks.push({models:check.models,travelled,frames:check.trace.length,visible:check.visible,stopped:check.stopped,authoritativePositionPreserved:true,saveHasNoGaitHistory:true});
  await page.screenshot({path:'artifacts/locomotion-low.png'});assert.deepEqual(report.errors,[]);report.passed=true;console.log(JSON.stringify(report,null,2));
}finally{fs.writeFileSync('artifacts/locomotion-qa.json',JSON.stringify(report,null,2));await browser.close();}
