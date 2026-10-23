import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {capturePaintedBattlefield,settleBattlefieldResize} from './painted-battlefield-qa.mjs';
import {restrictWebGPUFeatures} from './webgpu-compatibility-probe.mjs';

// Real browser input, including CDP touch contacts. The fixture freezes only
// simulation time; construction spending and commands still use the real sim.
// tests/walls.test.js independently runs builders to completion and saves them.
export async function verifyWallPlacement(browser,base,output,mode='default'){
  const result={mode,cases:[],messages:[],simulationTimeFrozen:true};
  const profiles=mode==='default'?[...(process.env.QA_WALL_PHONE_ONLY==='1'?[]:[{touch:false,sizes:[[1366,768]]}]),{touch:true,sizes:[[740,360],[568,320]]}]:[{touch:true,sizes:[[568,320]]}];
  fs.mkdirSync(path.dirname(output),{recursive:true});
  for(const profile of profiles){
    const context=await browser.newContext({viewport:{width:profile.sizes[0][0],height:profile.sizes[0][1]},hasTouch:profile.touch,isMobile:profile.touch,...(mode==='compatibility'?{userAgent:'Mozilla/5.0 (Linux; Android 10; TestDevice) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/155.0.0.0 Mobile Safari/537.36'}:{})});
    if(mode==='compatibility')await restrictWebGPUFeatures(context);
    const page=await context.newPage();page.setDefaultTimeout(120000);const cdp=await context.newCDPSession(page);
    page.on('pageerror',error=>result.messages.push({type:'pageerror',text:error.stack}));page.on('console',message=>{if(['error','warning'].includes(message.type()))result.messages.push({type:message.type(),text:message.text()});if(message.text().startsWith('QA wall click'))console.log(message.text());});
    const press=async selector=>{const button=page.locator(selector+':visible').first(),target=await button.evaluate(el=>({key:el.dataset.action||'build:'+el.dataset.build,hud:!!el.closest('#hud')})),before=await page.evaluate(()=>({clicks:qaWallClicks.length,events:qaWallEvents.length}));if(profile.touch)await button.tap();else await button.click();try{await page.waitForFunction(({before,target})=>target.hud&&matchMedia('(pointer:coarse)').matches?qaWallEvents.slice(before.events).some(event=>event.type==='pointerup'&&event.action===target.key):qaWallClicks.slice(before.clicks).some(event=>event.key===target.key&&event.trusted),{before,target},{timeout:3000});}catch(error){throw Error(error.message+' '+JSON.stringify(await page.evaluate(()=>window.qaWallEvents.slice(-25))));}};
    const state=()=>page.evaluate(()=>{const v=frontier.view,s=frontier.sim;return {camera:v.target.toArray(),zoom:v.zoom,angle:v.angle,stone:s.players[0].resources.stone,walls:s.owned(0,'building','wall').map(e=>({id:e.id,x:e.x,z:e.z})),selection:[...v.selection],preview:v.wallPreviewDiagnostics,worker:s.get(window.qaWorker)?.order};});
    const screen=point=>page.evaluate(point=>{const v=frontier.view,p=v.target.clone().set(point.x,v.groundHeight(point.x,point.z),point.z).project(v.camera),r=v.renderer.domElement.getBoundingClientRect();return {x:r.x+(p.x+1)*r.width/2,y:r.y+(1-p.y)*r.height/2};},point);
    const drag=async(from,to,button='left')=>{
      if(profile.touch){const send=(type,p)=>cdp.send('Input.dispatchTouchEvent',{type,touchPoints:p?[{x:p.x,y:p.y,id:1}]:[]});await send('touchStart',from);for(let i=1;i<=8;i++)await send('touchMove',{x:from.x+(to.x-from.x)*i/8,y:from.y+(to.y-from.y)*i/8});await send('touchEnd');}
      else{await page.mouse.move(from.x,from.y);await page.mouse.down({button});await page.mouse.move(to.x,to.y,{steps:8});await page.mouse.up({button});}
    };
    const open=async()=>{await press('[data-action="build"]');await press('[data-build="wall"]');await page.waitForFunction(()=>document.querySelector('#hud').classList.contains('wall-placing'));};
    try{
      await page.addInitScript(()=>localStorage.setItem('crowns-settings',JSON.stringify({quality:'low',autoQuality:false,frameRate:'30',fog:false,weather:'clear',lighting:'day',volume:0,music:false})));
      const url=new URL(base);if(mode==='webgl')url.searchParams.set('renderer','webgl');else if(mode==='compatibility')url.searchParams.set('renderer','webgpu');
      await page.goto(url.href,{waitUntil:'domcontentloaded'});await page.waitForFunction(()=>window.frontier?.view);await page.evaluate(()=>document.fonts.ready);
      assert.equal(await page.evaluate(()=>document.documentElement.dataset.renderer),mode==='webgl'?'webgl':'webgpu');
      result.buildId=await page.locator('meta[name="frontier-build"]').getAttribute('content');
      if(mode==='compatibility'){result.compatibility=await page.evaluate(()=>({active:frontier.view.renderer.backend.compatibilityMode,features:[...frontier.view.renderer.backend.device.features]}));assert.equal(result.compatibility.active,true);assert.deepEqual(result.compatibility.features,[]);}
      await page.evaluate(()=>{window.qaWallEvents=[];for(const type of ['pointerdown','pointerup','pointercancel','touchstart','touchend','click'])document.addEventListener(type,event=>{const b=event.target.closest('button');qaWallEvents.push({type,target:event.target.tagName,action:b?.dataset.action||'build:'+b?.dataset.build,id:event.pointerId,x:event.clientX,y:event.clientY,at:Math.round(performance.now())});},true);window.qaWallClicks=[];document.addEventListener('click',event=>{const b=event.target.closest('button');if(b){qaWallClicks.push({key:b.dataset.action||'build:'+b.dataset.build,trusted:event.isTrusted});if(b.dataset.action==='wall-pan')console.log('QA wall click '+b.textContent+' '+event.isTrusted);}},true);const v=frontier.view;window.qaRender=v.render.bind(v);v.render=()=>false;window.qaDraw=async()=>{const q=v.renderer.backend?.device?.queue;if(q)await q.onSubmittedWorkDone();qaRender(.05,false);if(q)await q.onSubmittedWorkDone();};});
      for(const [width,height]of profile.sizes){
        console.log('Wall gestures '+mode+' '+width+'x'+height+' '+(profile.touch?'touch':'mouse'));await page.setViewportSize({width,height});
        await page.evaluate(()=>{
          frontier.start({mode:'sandbox',map:'highlands',seed:512});const s=frontier.sim,v=frontier.view;s.tick=()=>{};
          s.entities=[];s.revision++;s.visible.fill(1);s.explored.fill(1);s.players[0].age=3;s.players[0].resources.stone=10000;
          const u=s.addUnit('villager',0,-11,14);s.addUnit('villager',0,-13,14);window.qaWorker=u.id;frontier.select([u.id]);
          v.attach(s);v.focus(0,20);v.zoom=36;v.tilt=.62;v.angle=0;v.updateCamera();document.querySelector('#toasts').innerHTML='';
        });await settleBattlefieldResize(page);await open();
        let from=await screen({x:-9,z:20}),to=await screen({x:9,z:20}),before=await state();
        const hits=await page.evaluate(points=>points.map(p=>document.elementFromPoint(p.x,p.y)===frontier.view.renderer.domElement),[from,to]);assert.deepEqual(hits,[true,true],'Wall endpoints must be on the exposed battlefield');
        await drag(from,to);await page.waitForFunction(()=>frontier.view.wallPreviewDiagnostics?.segments>2);let drafted=await state();assert.deepEqual(drafted.camera,before.camera);assert.equal(drafted.zoom,before.zoom);assert.equal(drafted.angle,before.angle);assert.deepEqual(drafted.selection,before.selection);assert.equal(drafted.stone,before.stone);assert.equal(drafted.walls.length,0);assert.equal(drafted.worker,null);assert.equal(await page.locator('[data-action="wall-build"]').isEnabled(),true);
        // A wall-mode stroke cannot edge-scroll, even while held near an edge.
        if(!profile.touch){await page.mouse.move(width-2,height/2);await page.waitForTimeout(350);assert.deepEqual((await state()).camera,before.camera);await page.mouse.move(to.x,to.y);}
        const image=path.join(path.dirname(output),`wall-${mode}-${width}x${height}-preview.png`),pixels=(await capturePaintedBattlefield(page,image,{manual:true})).pixels;
        const layout=await page.locator('#placement-controls').evaluate(el=>{const r=el.getBoundingClientRect(),buttons=[...el.querySelectorAll('button')].map(b=>{const a=b.getBoundingClientRect();return {text:b.textContent,height:a.height,reachable:document.elementFromPoint(a.x+a.width/2,a.y+a.height/2)?.closest('button')===b};});return {rect:r.toJSON(),buttons,overflow:document.documentElement.scrollWidth>innerWidth,objectivesHidden:getComputedStyle(document.querySelector('#objectives')).visibility==='hidden',mapVisible:document.querySelector('#minimap').getBoundingClientRect().width>0};});assert.equal(layout.overflow,false);assert.ok(layout.rect.left>=0&&layout.rect.right<=width);assert.ok(layout.buttons.every(b=>b.height>=44&&b.reachable));assert.equal(layout.objectivesHidden,true);assert.equal(layout.mapVisible,true);
        // Explicit map mode pans without changing the wall draft or spending.
        await press('[data-action="wall-pan"]');assert.equal(await page.locator('[data-action="wall-build"]').isEnabled(),false);await drag({x:width*.45,y:height*.52},{x:width*.55,y:height*.57});let panned=await state();assert.notDeepEqual(panned.camera,before.camera);assert.deepEqual(panned.preview.from,drafted.preview.from);assert.deepEqual(panned.preview.to,drafted.preview.to);assert.equal(panned.stone,before.stone);await press('[data-action="wall-pan"]');await page.waitForFunction(()=>document.querySelector('[data-action=wall-pan]').getAttribute('aria-pressed')==='false',null,{timeout:3000});assert.equal(await page.locator('[data-action="wall-pan"]').getAttribute('aria-pressed'),'false','Place wall must return to drawing');console.log('Returned to wall drawing '+width);
        await page.evaluate(()=>{const v=frontier.view;v.focus(0,20);v.zoom=36;v.updateCamera();});
        // Native pinch must zoom only and never submit a construction command.
        let pinch=false;if(profile.touch){
          const prior=await state(),a={x:width*.43,y:height*.52,id:1},b={x:width*.57,y:height*.52,id:2};await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[a]});await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[a,b]});await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{...a,x:a.x-15},{...b,x:b.x+15}]});await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[a]});await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{...a,x:a.x+12}]});await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});const after=await state();assert.notEqual(after.zoom,prior.zoom);assert.equal(after.angle,prior.angle);assert.deepEqual(after.camera,prior.camera);assert.deepEqual(after.preview.from,prior.preview.from);assert.deepEqual(after.preview.to,prior.preview.to);assert.equal(after.stone,prior.stone);pinch=true;
          assert.equal(await page.locator('[data-action="wall-pan"]').getAttribute('aria-pressed'),'false','Pinch must retain drawing mode');console.log('Pinch retained drawing '+width);
        }
        // Switching real graphics settings must keep the solid preview valid.
        const qualities=[];if(mode==='default'&&!profile.touch){for(const quality of ['high','medium','low']){
          const q=await page.evaluate(async quality=>{const v=frontier.view;v.render=qaRender;let timer;try{const ok=await Promise.race([v.quality(quality),new Promise((_,reject)=>timer=setTimeout(()=>reject(Error('Wall quality timeout')),120000))]);v.render=()=>false;await qaDraw();return {quality,ok,actual:v.renderQuality,fatal:v.graphicsFatal,preview:v.wallPreviewDiagnostics,visible:v.wallPreview.group.visible};}finally{clearTimeout(timer);}},quality);assert.ok(q.ok&&q.actual===quality&&!q.fatal&&q.visible&&q.preview.segments>2);qualities.push(q);
        }}else await page.evaluate(()=>qaDraw());
        drafted=await state();const expected=drafted.preview.segments;await press('[data-action="wall-build"]');let built=await state();assert.equal(built.walls.length,expected);assert.equal(built.stone,before.stone-22*expected);assert.equal(built.worker.type,'build');assert.equal(built.preview.segments,0);assert.equal(await page.locator('#placement-controls [data-action="cancel-build"]').innerText(),'Done');assert.equal(await page.locator('[data-action="wall-build"]').isEnabled(),false);
        const notification=await page.evaluate(()=>({panelBottom:document.querySelector('#placement-controls').getBoundingClientRect().bottom,toastTop:document.querySelector('#toasts .toast')?.getBoundingClientRect().top}));if(profile.touch)assert.ok(notification.toastTop>=notification.panelBottom+4,'Order notification must clear the wall buttons');
        // Start/end taps also draft and can be reset without issuing an order.
        from=await screen({x:-9,z:27});to=await screen({x:9,z:27});for(const point of [from,to]){if(profile.touch)await page.touchscreen.tap(point.x,point.y);else await page.mouse.click(point.x,point.y);}
        await page.waitForFunction(()=>frontier.view.wallPreviewDiagnostics.segments>2);assert.equal((await state()).stone,built.stone);await press('[data-action="wall-reset"]');assert.equal((await state()).preview.segments,0);assert.equal((await state()).walls.length,expected);await press('#placement-controls [data-action="cancel-build"]');assert.equal(await page.locator('#placement-controls').isVisible(),false);assert.equal(await page.locator('#objectives').isVisible(),true);
        // Normal touch dragging pans again after leaving the tool.
        let normalPan=false;if(profile.touch){const prior=await state();await drag({x:width*.45,y:height*.52},{x:width*.55,y:height*.56});const after=await state();assert.notDeepEqual(after.camera,prior.camera);assert.equal(after.stone,prior.stone);normalPan=true;}
        else{
          await open();const prior=await state();await drag({x:width*.48,y:height*.5},{x:width*.53,y:height*.54},'middle');assert.notDeepEqual((await state()).camera,prior.camera);assert.equal((await state()).walls.length,expected);await page.mouse.click(width*.5,height*.5,{button:'right'});assert.equal(await page.locator('#placement-controls').isVisible(),false);assert.equal((await state()).walls.length,expected);
          await open();await page.keyboard.press('Escape');assert.equal(await page.locator('#placement-controls').isVisible(),false);assert.equal(await page.evaluate(()=>frontier.paused),false);
        }
        // A real building obstruction gives a red draft and disabled confirm.
        await page.evaluate(()=>{const s=frontier.sim,v=frontier.view;s.addBuilding('house',0,0,34,true);v.focus(0,34);v.zoom=36;v.updateCamera();document.querySelector('#toasts').innerHTML='';});await open();from=await screen({x:-9,z:34});to=await screen({x:9,z:34});await drag(from,to);await page.waitForFunction(()=>frontier.view.wallPreviewDiagnostics?.blocked>0);assert.equal(await page.locator('[data-action="wall-build"]').isEnabled(),false);const blocked=(await state()).preview;const blockedImage=path.join(path.dirname(output),`wall-${mode}-${width}x${height}-blocked.png`);await capturePaintedBattlefield(page,blockedImage,{manual:true});await press('#placement-controls [data-action="cancel-build"]');
        result.cases.push({width,height,input:profile.touch?'touch':'mouse',draftDoesNotSpend:true,wallDragLocksCamera:true,selectionPreserved:true,explicitPan:true,twoEndpointTaps:true,resetDoesNotSpend:true,confirmedWalls:expected,constructionOrderIssued:true,normalPan,pinchZoomWithoutRotation:pinch,qualities,blocked,pixels,layout,notification});
      }
    }finally{await context.close();}
  }
  const known=text=>/powerPreference option|KHR_parallel_shader_compile extension not supported/.test(text)||text.startsWith('THREE.WebGLProgram: Program Info Log:')&&text.includes('warning X4122:')&&!text.includes('error ');
  assert.deepEqual(result.messages.filter(m=>m.type!=='warning'||!known(m.text)),[]);return result;
}
