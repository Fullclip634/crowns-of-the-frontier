import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const base=process.env.QA_URL||'http://localhost:4174/',errors=[],checks=[];
fs.mkdirSync('artifacts',{recursive:true});
const browser=await chromium.launch({channel:'msedge',headless:true,args:['--enable-webgl','--ignore-gpu-blocklist']});
try{
  const page=await browser.newPage({viewport:{width:1440,height:900}});page.setDefaultTimeout(90000);
  page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
  await page.addInitScript(()=>localStorage.setItem('crowns-settings',JSON.stringify({quality:'high',frameRate:'60',autoQuality:false,weather:'clear',volume:0,music:false})));
  await page.goto(base,{waitUntil:'domcontentloaded'});await page.waitForFunction(()=>window.frontier?.view);
  for(const map of ['highlands','winter']){
    const info=await page.evaluate(map=>{
      frontier.start({mode:'sandbox',map,seed:512});frontier.action('pause');document.querySelector('#modal-root').style.visibility='hidden';
      const s=frontier.sim,v=frontier.view,home=s.owned(0,'building','towncenter')[0];
      const tree=s.entities.filter(e=>e.type==='wood').sort((a,b)=>Math.hypot(a.x-home.x,a.z-home.z)-Math.hypot(b.x-home.x,b.z-home.z))[0];
      v.settings.fog=false;v.focus(tree.x,tree.z);v.zoom=23;v.tilt=.58;v.angle=.8;v.updateCamera();v.render(.016,false);
      return {map,art:v.artDiagnostics,draws:v.renderer.info.render.calls,tree:tree.id};
    },map);
    await page.waitForTimeout(450);await page.screenshot({path:`artifacts/forest-detail-${map}.png`});assert.equal(info.art.models,126);checks.push({foliage:info});
  }
  const effects=await page.evaluate(()=>{
    frontier.start({mode:'sandbox',map:'highlands',seed:512});frontier.action('pause');document.querySelector('#modal-root').style.visibility='hidden';
    const s=frontier.sim,v=frontier.view;
    s.stop(s.owned(0,'unit').map(e=>e.id));const archer=s.addUnit('archer',0,-40,60),enemy=s.addUnit('swordsman',1,-40,69),siege=s.addUnit('catapult',0,-43,60);
    s.updateFog();v.focus(-40,65);v.zoom=22;v.tilt=.6;v.updateCamera();v.render(.016,false);
    const source={...archer,renderX:archer.x,renderZ:archer.z},target={...enemy,renderX:enemy.x,renderZ:enemy.z};
    const event={type:'attack',entity:source,target},stone={type:'attack',entity:siege,target};
    v.effect(event);v.effect(stone);const shot=v.fx.find(f=>f.kind==='arrow'),rock=v.fx.find(f=>f.kind==='stone');
    const origin=shot.object.position.clone(),rotation=shot.object.quaternion.clone();v.render(.10,false);
    const rotated=rotation.angleTo(shot.object.quaternion),flightHeight=shot.object.position.y;
    v.render(2,false);const geometry=shot.object.geometry;
    v.effect(event);const reused=v.fx.find(f=>f.kind==='arrow').object===shot.object;
    const memory=[];for(let batch=0;batch<4;batch++){
      for(let i=0;i<24;i++)v.effect({...event,entity:{...source,type:i%2?'archer':'swordsman'}});
      v.render(.1,false);v.render(2,false);memory.push({...v.renderer.info.memory});
    }
    const before=geometry.attributes.position.count,pool=v.flightEffects,retained=pool.retained.size;
    v.effect(event);const active=v.fx.length;
    frontier.start({mode:'sandbox',map:'winter',seed:512});frontier.action('pause');document.querySelector('#modal-root').style.visibility='hidden';v.render(.016,false);
    return {origin:origin.toArray(),source:[archer.x,archer.z],rotated,flightHeight,siegeArc:rock.arc,reused,memory,retained,limit:pool.limit,
      geometrySurvivesSceneSwitch:geometry.attributes.position.count===before,activeBeforeSwitch:active,activeAfterSwitch:v.fx.length,freeAfterSwitch:pool.free.arrow.length,art:v.artDiagnostics};
  });
  assert.ok(effects.rotated>.03&&effects.flightHeight>effects.origin[1]);assert.ok(effects.siegeArc>1);assert.ok(effects.reused);
  assert.ok(effects.retained<=effects.limit);assert.ok(effects.memory[3].geometries<=effects.memory[1].geometries+1);assert.ok(effects.memory[3].textures<=effects.memory[1].textures+1);
  assert.ok(effects.geometrySurvivesSceneSwitch&&effects.activeBeforeSwitch>0);assert.equal(effects.activeAfterSwitch,0);assert.ok(effects.freeAfterSwitch>0);checks.push({pooledCombat:effects});
  await page.evaluate(()=>{
    frontier.start({mode:'sandbox',map:'highlands',seed:512});frontier.action('pause');document.querySelector('#modal-root').style.visibility='hidden';
    const s=frontier.sim,v=frontier.view,target=s.addUnit('swordsman',1,-40,69);v.settings.fog=false;
    for(let i=0;i<8;i++){const e=s.addUnit(i%3?'archer':'catapult',0,-44+i,59+i%2);v.effect({type:'attack',entity:e,target});}
    s.updateFog();v.focus(-40,65);v.zoom=23;v.tilt=.6;v.updateCamera();v.render(.13,false);
  });
  await page.screenshot({path:'artifacts/battle-projectiles-3d.png'});assert.deepEqual(errors,[]);
  console.log(JSON.stringify({passed:true,checks,errors}));
}finally{fs.writeFileSync('artifacts/battle-visual-qa.json',JSON.stringify({checks,errors},null,2));await browser.close();}
