import assert from 'node:assert/strict';
import path from 'node:path';
import {battlePreset} from '../src/custom-battle.js';
import {capturePaintedBattlefield} from './painted-battlefield-qa.mjs';

export async function verifyObjectivePanel(browser,base,output){
  const result={desktop:[],phone:[],messages:[]};
  for(const touch of [false,true]){
    const context=await browser.newContext({viewport:touch?{width:568,height:320}:{width:1366,height:768},hasTouch:touch,isMobile:touch}),page=await context.newPage();page.setDefaultTimeout(120000);
    page.on('pageerror',error=>result.messages.push({type:'pageerror',text:error.stack}));page.on('console',message=>{if(['warning','error'].includes(message.type()))result.messages.push({type:message.type(),text:message.text()});});
    try{
      await page.addInitScript(()=>localStorage.setItem('crowns-settings',JSON.stringify({quality:'low',autoQuality:false,frameRate:'30',fog:false,weather:'clear',lighting:'day',volume:0,music:false})));
      await page.goto(base.href,{waitUntil:'domcontentloaded'});await page.waitForFunction(()=>window.frontier?.view);
      assert.equal(await page.evaluate(()=>document.documentElement.dataset.renderer),'webgpu');
      await page.evaluate(()=>{const v=frontier.view;window.qaRender=v.render.bind(v);v.render=()=>false;window.qaDraw=async()=>{const queue=v.renderer.backend.device.queue;await queue.onSubmittedWorkDone();qaRender(.05,false);await queue.onSubmittedWorkDone();};});
      const cases=touch?[{mode:'custom',width:568,height:320},{mode:'tutorial',width:740,height:360}]:[{mode:'tutorial',width:1366,height:768},{mode:'custom',width:1024,height:600},{mode:'campaign1',width:1366,height:768}];
      for(const item of cases){
        await page.setViewportSize({width:item.width,height:item.height});
        await page.evaluate(item=>{frontier.start({mode:item.mode,map:'highlands',seed:512,...(item.slots?{slots:item.slots}:{})});const unit=frontier.sim.owned(0,'unit','villager')[0];if(unit)frontier.select([unit.id]);},{...item,...(item.mode==='custom'?{slots:battlePreset('4v4')}:{})});
        const button=page.locator('#objectives .objective-toggle'),body=page.locator('#objective-body');assert.equal(await button.isVisible(),true);assert.equal(await button.getAttribute('aria-expanded'),String(!touch));assert.equal(await body.isVisible(),!touch);
        const before=await page.evaluate(()=>({selection:[...frontier.view.selection],camera:frontier.view.target.toArray(),zoom:frontier.view.zoom}));
        if(touch){await button.tap();assert.equal(await body.isVisible(),true);await button.tap();}
        else{assert.match(await button.innerText(),/Close objectives.*×/s);await button.click();}
        assert.equal(await body.isVisible(),false);assert.equal(await button.getAttribute('aria-expanded'),'false');
        await page.waitForTimeout(350);assert.equal(await body.isVisible(),false,'HUD refresh must not reopen a dismissed panel');
        if(!touch){
          await button.focus();await page.keyboard.press('Enter');assert.equal(await body.isVisible(),true);await page.keyboard.press('Space');assert.equal(await body.isVisible(),false);assert.equal(await page.evaluate(()=>frontier.paused),false);
          await page.keyboard.press('Space');assert.equal(await body.isVisible(),true);await page.keyboard.press('Escape');assert.equal(await body.isVisible(),false);assert.equal(await page.evaluate(()=>frontier.paused),false);assert.equal(await button.evaluate(el=>document.activeElement===el),true);
        }
        const state=await page.evaluate(()=>({selection:[...frontier.view.selection],camera:frontier.view.target.toArray(),zoom:frontier.view.zoom}));assert.deepEqual(state,before,'Closing objectives preserves selected units and camera');
        assert.equal(await page.locator('#minimap').isVisible(),true);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
        const image=path.join(path.dirname(output),'objectives-'+(touch?'phone':'desktop')+'-'+item.mode+'-closed.png'),pixels=(await capturePaintedBattlefield(page,image,{manual:true})).pixels;
        await button.click();assert.equal(await body.isVisible(),true);const scroll=await page.locator('#objectives').evaluate(el=>{el.scrollTop=el.scrollHeight;return {scrollable:el.scrollHeight>el.clientHeight,top:el.scrollTop};});const openImage=path.join(path.dirname(output),'objectives-'+(touch?'phone':'desktop')+'-'+item.mode+'-open.png');await page.screenshot({path:openImage});
        const hit=await button.evaluate(el=>{const rect=el.getBoundingClientRect(),panel=el.closest('#objectives').getBoundingClientRect(),hud=document.querySelector('.bottom-hud').getBoundingClientRect(),top=document.elementFromPoint(rect.x+rect.width/2,rect.y+rect.height/2);return {height:rect.height,top:rect.top,panelTop:panel.top,panelBottom:panel.bottom,hudTop:hud.top,reachable:top?.closest('.objective-toggle')===el};});assert.ok(hit.height>=44&&hit.reachable);assert.ok(Math.abs(hit.top-hit.panelTop)<=2,'Scrolled roster text must stay behind a flush header');assert.ok(hit.panelBottom<=hit.hudTop-10,'Objectives must end above the actual bottom HUD and minimap');
        if(item.mode==='custom')assert.equal(scroll.scrollable,true,'The long eight-kingdom roster exercises the sticky close control');
        (touch?result.phone:result.desktop).push({...item,closedAfterHudRefresh:true,keyboard:!touch,selectionAndCameraPreserved:true,minimapVisible:true,pixels,button:hit,scroll});
      }
    }finally{await context.close();}
  }
  assert.deepEqual(result.messages.filter(message=>message.type!=='warning'||!message.text.includes('powerPreference option')),[]);return result;
}
