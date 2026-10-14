import {chromium} from '@playwright/test';
import fs from 'node:fs';
import assert from 'node:assert/strict';

const phase=process.argv[2]||'before',report={phase,checks:[],interactions:[],errors:[],passed:false};
const browser=await chromium.launch({channel:'msedge',headless:true,args:['--enable-webgl','--ignore-gpu-blocklist']});
try{
  const page=await browser.newPage({viewport:{width:640,height:360},isMobile:true,hasTouch:true,deviceScaleFactor:1});page.setDefaultTimeout(90000);
  page.on('pageerror',error=>report.errors.push(error.message));page.on('console',message=>{if(message.type()==='error')report.errors.push(message.text());});
  await page.addInitScript(()=>localStorage.setItem('crowns-settings',JSON.stringify({quality:'low',autoQuality:false,weather:'clear',music:false,volume:0})));
  await page.goto(process.env.QA_URL||'http://localhost:4174/',{waitUntil:'domcontentloaded'});await page.waitForFunction(()=>window.frontier?.view);
  await page.evaluate(()=>frontier.start({mode:'custom',map:'highlands',mapSize:'huge',seed:2026}));
  if(phase==='after'){
    const construction=await page.evaluate(()=>{const s=frontier.sim,v=frontier.view,tc=s.owned(0,'building','towncenter')[0],house=s.addBuilding('house',0,tc.x+11,tc.z+9,false);house.progress=.35;v.focus(house.x,house.z);v.render(0,false);const node=v.nodes.get(house.id),count=node.userData.construction.materials.filter(material=>material.defines?.USE_UV!==undefined).length;v.focus(tc.x,tc.z);return count;});
    assert.ok(construction>0,'the production fixture renders an unfinished textured building');report.interactions.push('Unfinished building textures compile in the real phone renderer');
  }
  for(const viewport of [{width:568,height:320},{width:640,height:360},{width:844,height:390},{width:915,height:412}]){
    await page.setViewportSize(viewport);
    for(const state of ['empty','worker','town']){
      await page.evaluate(state=>{const s=frontier.sim;frontier.select(state==='empty'?[]:[s.owned(0,state==='worker'?'unit':'building',state==='worker'?'villager':'towncenter')[0].id]);document.querySelector('#toasts').innerHTML='';},state);
      const check=await page.evaluate(()=>{
        const box=selector=>{const node=document.querySelector(selector),rect=node?.getBoundingClientRect();if(!rect||!rect.width||!rect.height||getComputedStyle(node).visibility==='hidden')return null;return {selector,x:rect.left,y:rect.top,width:rect.width,height:rect.height,right:rect.right,bottom:rect.bottom};};
        const panels=['.game-header','.map-panel','#selection-panel','.command-panel','.camera-controls','#objectives','.game-bottomline'].map(box).filter(Boolean);let covered=0,total=0;
        for(let y=2;y<innerHeight;y+=4)for(let x=2;x<innerWidth;x+=4){total++;if(panels.some(rect=>x>=rect.x&&x<rect.right&&y>=rect.y&&y<rect.bottom))covered++;}
        const touchTargets=[...document.querySelectorAll('.command-buttons button,.camera-controls button,#selection-panel button,.game-header button,.map-heading button,.objective-toggle')].map(node=>({action:node.dataset.action||node.dataset.train||node.dataset.research,width:node.getBoundingClientRect().width,height:node.getBoundingClientRect().height})).filter(rect=>rect.width&&rect.height);
        return {width:innerWidth,height:innerHeight,freeAreaPercent:(1-covered/total)*100,panels,touchTargets,horizontalOverflow:document.documentElement.scrollWidth>innerWidth,minimap:box('#minimap')};
      });
      report.checks.push({state,...check});await page.screenshot({path:`artifacts/phone-${phase}-${viewport.width}-${state}.png`});
      if(phase==='after'){assert.equal(check.horizontalOverflow,false);assert.ok(check.freeAreaPercent>=60,`${viewport.width} ${state} should leave at least 60% of the battlefield clear`);assert.ok(check.touchTargets.every(target=>target.width>=44&&target.height>=44),'visible primary controls retain usable touch targets');assert.ok(Math.abs(check.minimap.width-check.minimap.height)<1,'the minimap remains square');}
    }
  }
  if(phase==='after'){
    await page.setViewportSize({width:568,height:320});
    const select=type=>page.evaluate(type=>{frontier.select([frontier.sim.owned(0,type==='villager'?'unit':'building',type)[0].id]);document.querySelector('#toasts').innerHTML='';},type);
    await select('towncenter');
    const villager=page.locator('#selection-panel [data-train=villager]');await villager.tap();
    assert.ok(await page.evaluate(()=>frontier.sim.owned(0,'building','towncenter')[0].queue.some(item=>item.type==='villager')),'training works from the compact strip');
    await page.locator('.selection-details').tap();assert.equal(await page.locator('.selection-details').getAttribute('aria-expanded'),'true');
    await page.locator('#selection-panel [data-research=economy]').tap();assert.ok(await page.evaluate(()=>frontier.sim.owned(0,'building','towncenter')[0].queue.some(item=>item.type==='economy')));
    await page.locator('.selection-details').tap();assert.equal(await page.locator('.selection-details').getAttribute('aria-expanded'),'false');
    report.interactions.push('Train a worker and research from expanded options');
    await page.locator('[data-action=command-options]').tap();
    await page.locator('.phone-command[data-action=map-expand]').tap();
    const expanded=await page.locator('#minimap').boundingBox();assert.ok(expanded.width>150&&Math.abs(expanded.width-expanded.height)<1);
    const targetBefore=await page.evaluate(()=>({x:frontier.view.target.x,z:frontier.view.target.z}));
    await page.locator('#minimap').tap({position:{x:expanded.width*.8,y:expanded.height*.2}});
    assert.ok(await page.evaluate(before=>Math.hypot(frontier.view.target.x-before.x,frontier.view.target.z-before.z)>10,targetBefore));
    await page.locator('.map-size-toggle').tap();assert.equal(await page.locator('.map-size-toggle').getAttribute('aria-expanded'),'false');
    report.interactions.push('Expand, tap and shrink the square minimap');
    await select('villager');await page.locator('.selection-details').tap();
    await page.locator('#selection-panel [data-action=build]').tap();assert.ok(await page.locator('#build-panel').isVisible());
    assert.equal(await page.locator('.selection-details').getAttribute('aria-expanded'),'false');
    await page.locator('[data-build=house]').tap();assert.ok(await page.locator('#build-panel').isHidden());
    await page.evaluate(()=>frontier.action('cancel-build'));
    report.interactions.push('Construction closes extra selection information for placement');
    const mistaken=await page.evaluate(()=>{const s=frontier.sim,tc=s.owned(0,'building','towncenter')[0],wall=s.addBuilding('wall',0,tc.x-12,tc.z+8,false);frontier.select([wall.id]);return {id:wall.id,stone:s.players[0].resources.stone,refund:Math.floor(s.cost({stone:22},0,'building').stone*.7)};});
    await page.locator('.selection-details').tap();await page.locator(`#selection-panel [data-demolish="${mistaken.id}"]`).tap();
    const removed=await page.evaluate(id=>({gone:!frontier.sim.get(id),stone:frontier.sim.players[0].resources.stone}),mistaken.id);assert.equal(removed.gone,true);assert.ok(removed.stone>=mistaken.stone+mistaken.refund);
    report.interactions.push('Phone building Options exposes cancellation and its refund');
    await page.evaluate(()=>{const unit=frontier.sim.addUnit('swordsman',0,0,20);frontier.select([unit.id]);});
    await page.locator('.selection-details').tap();await page.locator('#selection-panel [data-action=patrol]').tap();
    assert.equal(await page.locator('.selection-details').getAttribute('aria-expanded'),'false');
    await page.locator('[data-action=command-options]').tap();await page.locator('.command-panel [data-action=stop]').tap();
    assert.equal(await page.locator('[data-action=command-options]').getAttribute('aria-expanded'),'false');
    report.interactions.push('Tactical orders and Stop remain reachable');
    await page.locator('[data-action=camera-options]').tap();const angle=await page.evaluate(()=>frontier.view.angle);
    await page.locator('[data-action=camera-left]').tap();assert.notEqual(await page.evaluate(()=>frontier.view.angle),angle);
    await page.locator('[data-action=camera-options]').tap();
    await page.locator('[data-action=production]').tap();await page.locator('.production-panel [data-action=production]').tap();
    await page.evaluate(()=>frontier.select([]));
    assert.ok(await page.evaluate(()=>document.elementFromPoint(innerWidth/2,innerHeight-70)===frontier.view.renderer.domElement),'the empty dock passes touches to the battlefield');
    report.interactions.push('Camera options, production and battlefield touch access');
    await page.getByRole('button',{name:'Pause',exact:true}).tap();await page.getByRole('button',{name:'Controls & strategy',exact:true}).tap();
    const touchGuide=await page.locator('#modal-root .help-grid>div').first().textContent();assert.match(touchGuide,/Phone & tablet/);assert.match(touchGuide,/Deselect/);assert.match(touchGuide,/Done building/);
    await page.screenshot({path:'artifacts/phone-controls-guide.png'});await page.locator('#modal-root [data-action=close]').tap();
    report.interactions.push('Pause opens touch-first controls with selection and placement exits');
    for(const viewport of [{width:320,height:568},{width:390,height:844}]){
      await page.setViewportSize(viewport);await page.evaluate(()=>frontier.action('dismiss-rotate'));await select('towncenter');
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
      const header=await page.evaluate(()=>{const h=document.querySelector('.game-header').getBoundingClientRect();return {height:h.height,buttons:[...document.querySelectorAll('.time-controls button')].map(button=>button.getBoundingClientRect()).filter(rect=>rect.width).every(rect=>rect.bottom<=h.bottom+1)};});
      assert.equal(header.height,44);assert.ok(header.buttons,'portrait header controls stay in one row');
      const resources=await page.evaluate(()=>{const bar=document.querySelector('#resource-bar').getBoundingClientRect();return {width:bar.width,counts:[...document.querySelectorAll('#resource-bar strong')].map(node=>{const rect=node.getBoundingClientRect();return {text:node.textContent,width:rect.width,visible:rect.left>=bar.left-1&&rect.right<=bar.right+1};})};});
      assert.ok(resources.width>150);assert.equal(resources.counts.length,5);assert.ok(resources.counts.every(count=>count.visible&&count.width>8),'all five resource counts remain visible beside the header controls');
      (report.portraitHeaders??=[]).push({viewport,header,resources});
      await page.locator('.selection-details').tap();await page.locator('.selection-details').tap();
      await page.screenshot({path:`artifacts/phone-${phase}-${viewport.width}-portrait.png`});
    }
    report.interactions.push('Portrait fallback fits 320px and 390px widths');
    await page.setViewportSize({width:568,height:320});await page.locator('[data-action=command-options]').tap();await page.locator('[data-action=camera-options]').tap();
    await select('villager');await page.evaluate(()=>frontier.action('build'));await page.locator('[data-build=house]').tap();
    assert.ok(await page.locator('#placement-controls').isVisible());
    await page.evaluate(()=>frontier.start({mode:'sandbox',seed:512}));
    assert.ok(await page.locator('#placement-controls').isHidden());assert.equal(await page.locator('#world').evaluate(node=>node.classList.contains('placing')),false);
    assert.equal(await page.locator('[data-action=command-options]').getAttribute('aria-expanded'),'false');assert.equal(await page.locator('[data-action=camera-options]').getAttribute('aria-expanded'),'false');
    await page.close();
    const desktop=await browser.newPage({viewport:{width:1366,height:768}});desktop.setDefaultNavigationTimeout(90000);
    desktop.on('pageerror',error=>report.errors.push(error.message));desktop.on('console',message=>{if(message.type()==='error')report.errors.push(message.text());});
    await desktop.addInitScript(()=>localStorage.setItem('crowns-settings',JSON.stringify({quality:'low',autoQuality:false,music:false,weather:'clear',volume:0})));
    await desktop.goto(process.env.QA_URL||'http://localhost:4174/',{waitUntil:'domcontentloaded'});await desktop.waitForFunction(()=>window.frontier?.view);
    await desktop.evaluate(()=>{frontier.start({mode:'sandbox',seed:512});frontier.select([frontier.sim.owned(0,'building','towncenter')[0].id]);});
    assert.ok(await desktop.locator('.selection-details').isHidden());assert.ok(await desktop.locator('[data-action=command-options]').isHidden());assert.ok(await desktop.locator('[data-research=economy]').isVisible());
    await desktop.close();report.interactions.push('New matches reset compact panels; desktop retains the full controls');
  }
  assert.deepEqual(report.errors,[]);report.passed=true;console.log(JSON.stringify({phase,passed:report.passed,checks:report.checks.map(check=>({width:check.width,height:check.height,state:check.state,freeAreaPercent:check.freeAreaPercent})),interactions:report.interactions},null,2));
}finally{fs.writeFileSync(`artifacts/phone-layout-${phase}.json`,JSON.stringify(report,null,2));await browser.close();}
