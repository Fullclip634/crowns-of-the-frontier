import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const report={checks:[],errors:[],passed:false};
const browser=await chromium.launch({channel:'msedge',headless:true,args:['--enable-webgl','--ignore-gpu-blocklist']});
try{
  const page=await browser.newPage({viewport:{width:1024,height:640}});page.setDefaultTimeout(90000);
  page.on('pageerror',error=>report.errors.push(error.message));page.on('console',message=>{if(message.type()==='error')report.errors.push(message.text());});
  await page.addInitScript(()=>localStorage.setItem('crowns-settings',JSON.stringify({quality:'low',autoQuality:false,music:false,volume:1,weather:'clear',weatherSounds:false})));
  await page.goto(process.env.QA_URL||'http://localhost:4174/',{waitUntil:'domcontentloaded'});await page.waitForFunction(()=>window.frontier?.view);
  await page.evaluate(()=>frontier.start({mode:'sandbox',map:'highlands',seed:2026}));
  await page.locator('.command-panel [data-action=army]').click();await page.waitForFunction(()=>frontier.audio.context?.state==='running');
  await page.evaluate(()=>{
    const s=frontier.sim;s.tick=()=>{};const attacker=s.addUnit('swordsman',0,-10,20),target=s.addUnit('knight',1,-8,20);s.qaFight={attacker,target};
    frontier.view.focus(attacker.x,attacker.z);frontier.view.zoom=35;frontier.view.updateCamera();
    const audio=frontier.audio,original=audio.combat;audio.qaEvents=[];
    audio.combat=function(entity,target){const played=original.call(this,entity,target);this.qaEvents.push({played,type:entity.type});return played;};
  });
  const local=await page.evaluate(()=>{
    const {attacker,target}=frontier.sim.qaFight;frontier.sim.emit('attack',{entity:attacker,target,damage:10});
    const audio=frontier.audio,voice=[...audio.combatVoices][0];return {played:audio.qaEvents.at(-1).played,kind:voice?.kind,level:voice?.gain.gain.value,voices:audio.combatVoices.size};
  });
  assert.equal(local.played,true);assert.equal(local.kind,'metal');assert.ok(local.level>0);report.checks.push({name:'A visible melee attack starts the metallic effect',...local});
  const panAway=await page.evaluate(()=>{
    const audio=frontier.audio,voice=[...audio.combatVoices][0];frontier.view.focus(65,-65);audio.updateCombat();
    const {attacker,target}=frontier.sim.qaFight;frontier.sim.emit('attack',{entity:attacker,target,damage:10});
    return {retiring:voice.retiring,newSound:audio.qaEvents.at(-1).played};
  });
  assert.equal(panAway.retiring,true);assert.equal(panAway.newSound,false);
  await page.waitForFunction(()=>frontier.audio.combatVoices.size===0);
  const quiet=await page.evaluate(()=>{
    const audio=frontier.audio,{attacker,target}=frontier.sim.qaFight;
    for(let i=0;i<100;i++)frontier.sim.emit('attack',{entity:attacker,target,damage:10});
    return {played:audio.qaEvents.slice(-100).filter(event=>event.played).length,voices:audio.combatVoices.size};
  });
  assert.equal(quiet.played,0);assert.equal(quiet.voices,0);report.checks.push({name:'Panning to quiet terrain fades old voices and rejects 100 offscreen attacks',...panAway,...quiet});
  await page.evaluate(()=>{const {attacker}=frontier.sim.qaFight;frontier.view.focus(attacker.x,attacker.z);});
  for(const [type,expected] of [['archer','arrow'],['ram','wood'],['catapult','siege']]){
    await page.waitForTimeout(70);
    const result=await page.evaluate(type=>{
      const {attacker,target}=frontier.sim.qaFight,entity=frontier.sim.addUnit(type,0,attacker.x,attacker.z);
      frontier.sim.emit('attack',{entity,target,damage:10});const audio=frontier.audio;return {played:audio.qaEvents.at(-1).played,kind:[...audio.combatVoices].at(-1)?.kind};
    },type);
    assert.equal(result.played,true);assert.equal(result.kind,expected);report.checks.push({name:`${type} uses ${expected}`, ...result});
  }
  await page.evaluate(()=>frontier.action('pause'));await page.waitForFunction(()=>frontier.audio.combatVoices.size===0);
  const paused=await page.evaluate(()=>{const {attacker,target}=frontier.sim.qaFight;frontier.sim.emit('attack',{entity:attacker,target,damage:10});return frontier.audio.qaEvents.at(-1).played;});
  assert.equal(paused,false);await page.evaluate(()=>frontier.action('close'));report.checks.push({name:'Commander menu mutes battle effects'});
  const buffers=await page.evaluate(()=>[...frontier.audio.combatBuffers.entries()].map(([key,buffer])=>{const data=buffer.getChannelData(0);let peak=0,energy=0;for(const sample of data){peak=Math.max(peak,Math.abs(sample));energy+=sample*sample;}return {key,seconds:buffer.duration,peak,rms:Math.sqrt(energy/data.length),finite:data.every(Number.isFinite)};}));
  assert.ok(buffers.every(buffer=>buffer.finite&&buffer.peak<=.821&&buffer.rms>.01));report.checks.push({name:'Real Web Audio buffers have a finite, bounded signal',buffers});
  await page.evaluate(()=>frontier.action('menu'));assert.equal(await page.evaluate(()=>frontier.playing),false);
  assert.deepEqual(report.errors,[]);report.passed=true;console.log(JSON.stringify(report,null,2));
}finally{fs.writeFileSync('artifacts/combat-audio-qa.json',JSON.stringify(report,null,2));await browser.close();}
