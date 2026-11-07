// Device / zoom matrix geometry and legibility QA. Renders the real game in a
// headless browser and asserts no overflow, no overlapping HUD, readable text
// and usable touch targets at every profile. Zoom is emulated by shrinking the
// CSS viewport (a 200% zoom of 1280x800 is a 640x400 CSS viewport).
import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const base=process.env.QA_URL||'http://localhost:4173/';
const output='artifacts/legibility-review';
const shots=new Set((process.env.QA_SHOTS||'phone-portrait,phone-landscape,desktop,zoom-200').split(','));
fs.mkdirSync(output,{recursive:true});
const report={url:base,profiles:[],errors:[],passed:false};
const browser=await chromium.launch({channel:'msedge',headless:true,args:['--enable-webgl','--ignore-gpu-blocklist','--use-gl=angle','--use-angle=swiftshader']});
const profiles=[
  {name:'phone-portrait',width:390,height:844,mobile:true},
  {name:'phone-small',width:320,height:568,mobile:true},
  {name:'phone-landscape',width:844,height:390,mobile:true},
  {name:'phone-short',width:640,height:360,mobile:true},
  {name:'tablet-portrait',width:768,height:1024,mobile:true},
  {name:'foldable',width:717,height:512,mobile:true},
  {name:'tablet-landscape',width:1024,height:768,mobile:true},
  {name:'desktop',width:1280,height:800,mobile:false},
  {name:'desktop-wide',width:1600,height:900,mobile:false},
  {name:'ultrawide',width:2560,height:1080,mobile:false},
  {name:'desktop-short',width:1280,height:500,mobile:false},
  {name:'zoom-125',width:1024,height:640,mobile:false,zoom:1.25},
  {name:'zoom-150',width:853,height:533,mobile:false,zoom:1.5},
  {name:'zoom-200',width:640,height:400,mobile:false,zoom:2},
];

async function makePage(mobile){
  const context=await browser.newContext({viewport:{width:1280,height:800},isMobile:mobile,hasTouch:mobile,deviceScaleFactor:1});
  const page=await context.newPage();page.setDefaultTimeout(90000);
  page.on('pageerror',error=>report.errors.push(error.message));
  page.on('console',message=>{if(message.type()==='error')report.errors.push(message.text());});
  await page.addInitScript(()=>localStorage.setItem('crowns-settings',JSON.stringify({quality:'low',autoQuality:false,weather:'clear',music:false,volume:0,fog:false,lighting:'day'})));
  await page.goto(base,{waitUntil:'domcontentloaded',timeout:90000});
  await page.waitForFunction(()=>window.frontier?.view);
  await page.evaluate(()=>{frontier.start({mode:'sandbox',map:'highlands',seed:512});frontier.action('pause');const modal=document.querySelector('#modal-root');if(modal)modal.style.visibility='hidden';frontier.view.render(.016,false);});
  return {context,page};
}

const measure=page=>page.evaluate(()=>{
  const rect=selector=>{const node=document.querySelector(selector);if(!node)return null;const r=node.getBoundingClientRect();if(!r.width||!r.height||getComputedStyle(node).visibility==='hidden')return null;return {x:r.x,y:r.y,width:r.width,height:r.height,right:r.right,bottom:r.bottom};};
  const fontSelectors=['.resource small','.resource strong','.command-buttons span','.command-heading','.map-heading','.map-footer','.game-bottomline','.objective-panel p','.objective-eyebrow','.control-hint','.selection-title small','.production-actions small'];
  const fonts=fontSelectors.map(selector=>{const node=document.querySelector(selector);return {selector,size:node&&node.getClientRects().length?parseFloat(getComputedStyle(node).fontSize):null};}).filter(item=>item.size!==null);
  const targets=[...document.querySelectorAll('.command-buttons button,.camera-controls button,#selection-panel button,.game-header button,.build-option')]
    .filter(node=>node.getClientRects().length)
    .map(node=>({selector:node.className||node.dataset.action||node.tagName,width:node.getBoundingClientRect().width,height:node.getBoundingClientRect().height}));
  const header=rect('.game-header'),objectives=rect('.objective-panel'),hud=rect('.bottom-hud');
  const overlap=(a,b)=>!!(a&&b&&a.x<b.right&&a.right>b.x&&a.y<b.bottom&&a.bottom>b.y);
  return {width:innerWidth,height:innerHeight,
    horizontalOverflow:document.documentElement.scrollWidth>document.documentElement.clientWidth+1,
    verticalOverflow:document.documentElement.scrollHeight>document.documentElement.clientHeight+1,
    fonts,targets,header,objectives,hud,
    headerObjectivesOverlap:overlap(header,objectives),
    hudInside:!!hud&&hud.x>=-1&&hud.right<=innerWidth+1&&hud.bottom<=innerHeight+1,
    drawCalls:frontier.view.renderer.info.render.calls,
    vfx:frontier.view.vfxReport?.()||null};
});

try{
  const mobile=await makePage(true),desktop=await makePage(false);
  for(const profile of profiles){
    const {page}=profile.mobile?mobile:desktop;
    await page.setViewportSize({width:profile.width,height:profile.height});
    await page.evaluate(()=>{frontier.view.render(.016,false);frontier.view.render(.016,false);});
    const result=await measure(page);
    const entry={...profile,...result};
    report.profiles.push(entry);
    assert.equal(result.horizontalOverflow,false,`${profile.name} must not scroll horizontally`);
    assert.equal(result.headerObjectivesOverlap,false,`${profile.name} HUD panels must not overlap`);
    assert.ok(result.hudInside,`${profile.name} bottom HUD stays on screen`);
    assert.ok(result.fonts.length>=6,`${profile.name} renders its labels`);
    for(const font of result.fonts)assert.ok(font.size>=10,`${profile.name} ${font.selector} is legible (${font.size}px)`);
    if(profile.mobile)for(const target of result.targets)assert.ok(target.width>=44&&target.height>=44,`${profile.name} ${target.selector} keeps a 44x44 touch target`);
    assert.ok(result.drawCalls>0,`${profile.name} actually rendered`);
    if(shots.has(profile.name))await page.screenshot({path:`${output}/${profile.name}.png`,timeout:240000,animations:'disabled'});
  }
  await mobile.context.close();await desktop.context.close();
  assert.deepEqual(report.errors,[],'no console or page errors');
  report.passed=true;
  console.log(JSON.stringify({passed:true,profiles:report.profiles.length,errors:report.errors.length,minFont:Math.min(...report.profiles.flatMap(p=>p.fonts.map(f=>f.size)))},null,2));
}catch(error){
  report.failure=error.message;console.error(JSON.stringify({failure:error.message,profiles:report.profiles.map(p=>p.name)},null,2));process.exitCode=1;
}finally{
  fs.writeFileSync(`${output}/report.json`,JSON.stringify(report,null,2));
  await browser.close();
}
