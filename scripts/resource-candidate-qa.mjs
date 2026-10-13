import {chromium} from '@playwright/test';
import fs from 'node:fs';
import assert from 'node:assert/strict';

const phoneOnly=process.env.QA_PHONE_ONLY==='true',report={scope:phoneOnly?'small-phone-diagnostic':'full-candidate',checks:[],errors:[],failures:[],passed:false},base=process.env.QA_URL||'http://localhost:4174/',candidate='.tools/art-candidate/full/optimized';
const phoneSizes=phoneOnly?JSON.parse(process.env.QA_PHONE_SIZES||'[[568,320]]'):[[568,320],[640,360],[667,375],[844,390],[320,568],[360,640],[1024,768]];
const browser=await chromium.launch({channel:'msedge',headless:true,args:['--enable-webgl','--ignore-gpu-blocklist']});
async function prepare(page){
  page.setDefaultTimeout(90000);page.on('pageerror',error=>report.errors.push(error.message));page.on('console',message=>{if(message.type()==='error')report.errors.push(message.text());});
  await page.route(/frontier-(near|low)(?:-[\w-]+)?\.glb(?:\?.*)?$/,route=>{const detail=route.request().url().includes('frontier-near')?'near':'low';return route.fulfill({body:fs.readFileSync(`${candidate}/frontier-${detail}.glb`),contentType:'model/gltf-binary'});});
  await page.addInitScript(()=>localStorage.setItem('crowns-settings',JSON.stringify({quality:'low',autoQuality:false,weather:'clear',music:false,volume:0})));
  await page.goto(base,{waitUntil:'domcontentloaded'});await page.waitForFunction(()=>window.frontier?.view);
}
try{
  if(!phoneOnly){
  const page=await browser.newPage({viewport:{width:1440,height:900}});await prepare(page);
  for(const quality of ['low','high']){
    await page.evaluate(quality=>frontier.view.quality(quality),quality);await page.waitForFunction(quality=>frontier.view.surfaceQuality===quality&&frontier.view.artDiagnostics.detail===(quality==='high'?'high':'low'),quality);
    for(const type of ['food','stone','gold']){
      const info=await page.evaluate(type=>{
        frontier.start({mode:'sandbox',map:'highlands',seed:512});frontier.action('pause');document.querySelector('#modal-root').style.visibility='hidden';
        const v=frontier.view,s=frontier.sim,tc=s.owned(0,'building','towncenter')[0],e=s.entities.filter(e=>e.kind==='resource'&&e.type===type&&!e.water).sort((a,b)=>Math.hypot(a.x-tc.x,a.z-tc.z)-Math.hypot(b.x-tc.x,b.z-tc.z))[0];
        v.settings.fog=false;v.focus(e.x,e.z);v.zoom=20;v.tilt=.9;v.angle=2.6;v.updateCamera();v.render(.016,false);
        const node=v.nodes.get(e.id)||v.createNode(e),p=node.position.clone();p.y+=type==='food'?.8:.6;p.project(v.camera);const rect=v.renderer.domElement.getBoundingClientRect(),hit=v.pick(rect.left+(p.x+1)*rect.width/2,rect.top+(1-p.y)*rect.height/2);
        return {type,models:v.artDiagnostics.models,revision:node.userData.model3d.resourceRevision,bytes:v.artDiagnostics.bytes,centerPick:hit?.id===e.id,usablePick:hit?.kind==='resource'&&hit.type===type&&!hit.water&&s.isVisible(hit.x,hit.z),picked:hit?.id,visible:s.isVisible(e.x,e.z),shown:node.visible,resource:e.id,click:{x:rect.left+(p.x+1)*rect.width/2,y:rect.top+(1-p.y)*rect.height/2},worker:s.owned(0,'unit','villager')[0].id,draws:v.renderer.info.render.calls};
      },type);
      assert.equal(info.models,126);assert.equal(info.revision,'field-resources-v1');if(!info.usablePick)report.failures.push(`${quality} ${type} cannot be selected for harvesting`);report.checks.push({quality,resource:info});await page.screenshot({path:`artifacts/candidate-${type}-${quality}.png`});
      await page.evaluate(id=>{frontier.select([id]);frontier.action('close');},info.worker);await page.mouse.click(info.click.x,info.click.y,{button:'right'});
      assert.ok(await page.evaluate(({worker,picked})=>{const order=frontier.sim.get(worker).order;return order?.type==='gather'&&order.target===picked;},info));info.rightClickGather=true;
    }
  }
  await page.close();
  }
  const phone=await browser.newPage({viewport:{width:568,height:320},isMobile:true,hasTouch:true});await prepare(phone);
  for(const [width,height]of phoneSizes){
    await phone.setViewportSize({width,height});
    await phone.evaluate(()=>{document.querySelector('#modal-root').style.visibility='';frontier.action('menu');});
    await phone.locator('[data-action=custom-battle]').first().tap();await phone.locator('[data-battle-preset="4v4"]').tap();
    assert.ok(await phone.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'custom setup fits the viewport');
    await phone.locator('[data-action=custom-start]').tap();await phone.waitForFunction(()=>frontier.sim.players.length===8);
    if(width<height&&await phone.locator('[data-action=dismiss-rotate]').isVisible())await phone.locator('[data-action=dismiss-rotate]').tap();
    await phone.evaluate(()=>{frontier.action('pause');document.querySelector('#modal-root').style.visibility='hidden';frontier.select([frontier.sim.owned(0,'unit','villager')[0].id]);});
    await phone.evaluate(async()=>{await document.fonts.ready;await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));});
    const controls=await phone.evaluate(()=>{
      const selectors=['.camera-controls','#minimap','#selection-panel','.command-panel','.game-header'],boxes=selectors.map(selector=>{const r=document.querySelector(selector).getBoundingClientRect();return {selector,x:r.x,y:r.y,width:r.width,height:r.height};});
      const buttons=[...document.querySelectorAll('.camera-controls button,.command-buttons button,#production-toggle,.worker-actions button,.objective-toggle')].filter(button=>button.getBoundingClientRect().height>0).map(button=>{const r=button.getBoundingClientRect(),hit=document.elementFromPoint(r.x+r.width/2,r.y+r.height/2);return {action:button.dataset.action,width:r.width,height:r.height,reachable:hit===button||button.contains(hit)};});
      const canvas=frontier.view.renderer.domElement.getBoundingClientRect(),layoutWidth=document.documentElement.clientWidth,overflow=document.documentElement.scrollWidth>layoutWidth;
      const overflowElements=overflow?[...document.querySelectorAll('*')].map(e=>{const r=e.getBoundingClientRect();return {tag:e.tagName,id:e.id,cls:e.className?.baseVal??e.className,x:r.x,width:r.width,visibility:getComputedStyle(e).visibility};}).filter(e=>e.width>0&&(e.x<0||e.x+e.width>layoutWidth+.5)):undefined;
      return {width:innerWidth,height:innerHeight,layoutWidth,canvas:{width:canvas.width,height:canvas.height},overflow,scrollWidth:document.documentElement.scrollWidth,overflowElements,boxes,buttons,models:frontier.view.artDiagnostics.models};
    });report.checks.push({phone:controls});
    assert.equal(controls.overflow,false);assert.equal(controls.models,126);const radar=controls.boxes.find(box=>box.selector==='#minimap');assert.equal(radar.width,radar.height);
    if(controls.width!==width||controls.canvas.width!==width||controls.canvas.height!==height)report.failures.push(`${width}x${height}: viewport or canvas scale is wrong`);
    if(!controls.boxes.every(box=>box.x>=-1&&box.y>=-1&&box.x+box.width<=width+1&&box.y+box.height<=height+1))report.failures.push(`${width}x${height}: panels outside viewport`);
    if(!controls.buttons.every(button=>button.reachable))report.failures.push(`${width}x${height}: primary controls covered`);
    if(!controls.buttons.every(button=>button.height>=44&&button.width>=40))report.failures.push(`${width}x${height}: primary controls too small`);
    const angle=await phone.evaluate(()=>frontier.view.angle);await phone.getByRole('button',{name:'Rotate camera left',exact:true}).tap();assert.ok(await phone.evaluate(angle=>frontier.view.angle>angle,angle));
    const objectives=phone.locator('[data-action=objectives-expand]');if(await objectives.isVisible()){await objectives.tap();assert.ok(await phone.locator('.battle-roster').isVisible());assert.equal(await objectives.getAttribute('aria-expanded'),'true');await objectives.tap();assert.equal(await objectives.getAttribute('aria-expanded'),'false');}
    if(width<height){await phone.locator('[data-action=camera-options]').tap();assert.ok(await phone.locator('[data-action=camera-view]').isVisible());assert.ok(await phone.locator('[data-action=weather]').isVisible());await phone.locator('[data-action=camera-options]').tap();}
    await phone.locator('#production-toggle').tap();const bounds=await phone.locator('#production-panel').boundingBox();assert.ok(bounds&&bounds.x>=0&&bounds.y>=0&&bounds.x+bounds.width<=width+1&&bounds.y+bounds.height<=height+1);await phone.locator('#production-toggle').tap();
    await phone.locator('.command-buttons [data-action=build]').tap();assert.ok(await phone.locator('#build-panel').isVisible());await phone.getByRole('button',{name:'Close construction',exact:true}).tap();assert.equal(await phone.locator('#build-panel').isVisible(),false);
    const queue=await phone.evaluate(()=>{const tc=frontier.sim.owned(0,'building','towncenter')[0];frontier.select([tc.id]);return {id:tc.id,before:tc.queue.length};});await phone.locator('#selection-panel [data-train=villager]').tap();assert.equal(await phone.evaluate(id=>frontier.sim.get(id).queue.length,queue.id),queue.before+1);controls.touchTraining=true;
    const ground=await phone.evaluate(()=>{
      const s=frontier.sim,v=frontier.view,e=s.owned(0,'unit','villager')[0];s.stop([e.id]);frontier.select([e.id]);frontier.action('close');
      const canvas=v.renderer.domElement,grid=s.grid(0,false);window.tapTrace=[];for(const type of ['pointerdown','pointerup','pointercancel'])document.addEventListener(type,event=>tapTrace.push({type,target:event.target.id||event.target.dataset.action||event.target.tagName,pointerType:event.pointerType,x:event.clientX,y:event.clientY,paused:frontier.paused,selection:[...v.selection],ended:s.ended}),{once:true});s.on(event=>{if(event.type==='order')tapTrace.push({order:event.order});});
      // Touch browsers may expand nearby button hit regions. Pick a genuinely
      // clear patch of battlefield rather than a pixel beside a HUD control.
      for(let y=112;y<innerHeight-40;y+=24)for(let x=24;x<innerWidth-24;x+=24){if(![[0,0],[-20,0],[20,0],[0,-20],[0,20]].every(([dx,dy])=>document.elementFromPoint(x+dx,y+dy)===canvas))continue;const p=v.groundPoint(x,y);if(!p)continue;const cell=s.cell(p.x,p.z);if(!v.pick(x,y)&&Math.hypot(p.x-e.x,p.z-e.z)>6&&!grid[cell.z*s.gridSize+cell.x])return {x,y,id:e.id,point:{x:p.x,z:p.z},paused:frontier.paused};}
    });assert.ok(ground,'some open battlefield remains accessible');controls.groundTap=ground;await phone.touchscreen.tap(ground.x,ground.y);const moved=await phone.evaluate(id=>({order:frontier.sim.get(id).order,paused:frontier.paused,trace:tapTrace,position:{x:frontier.sim.get(id).x,z:frontier.sim.get(id).z}}),ground.id);controls.moveResult=moved;assert.equal(moved.order?.type,'move');controls.touchMove=true;
    await phone.evaluate(()=>{frontier.action('pause');document.querySelector('#modal-root').style.visibility='hidden';});
    await phone.screenshot({path:`artifacts/candidate-phone-${width}x${height}.png`});
  }
  await phone.close();assert.deepEqual(report.errors,[]);assert.deepEqual(report.failures,[]);report.passed=true;console.log(JSON.stringify(report));
}catch(error){report.failure=error.message;console.log(JSON.stringify(report));throw error;}
finally{fs.writeFileSync(phoneOnly?'artifacts/resource-candidate-phone-qa.json':'artifacts/resource-candidate-qa.json',JSON.stringify(report,null,2));await browser.close();}
