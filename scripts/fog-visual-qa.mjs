import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';
import {chromium} from 'playwright-core';

const backend=process.env.QA_RENDERER||'webgl',base=new URL(process.env.QA_URL||'http://127.0.0.1:4173/');
const output=process.env.QA_OUTPUT||'.shots/fog';
base.searchParams.set('renderer',backend);
await mkdir(output,{recursive:true});
const browser=await chromium.launch({channel:process.env.QA_BROWSER||'msedge',headless:true,args:[
  '--enable-webgl','--ignore-gpu-blocklist','--enable-unsafe-webgpu','--enable-unsafe-swiftshader',
  ...(backend==='webgl'?['--use-angle=swiftshader']:[`--use-webgpu-adapter=${process.env.QA_WEBGPU_ADAPTER||'swiftshader'}`]),
]});
const errors=[];
try{
  const page=await browser.newPage({viewport:{width:1000,height:650},serviceWorkers:'block'});
  page.setDefaultTimeout(180000);
  page.on('pageerror',error=>errors.push(error.message));
  page.on('console',message=>{if(message.type()==='error')errors.push(message.text());});
  await page.addInitScript(()=>localStorage.setItem('crowns-settings',JSON.stringify({
    quality:'low',autoQuality:false,frameRate:'30',fog:true,reducedMotion:true,weather:'clear',volume:0,music:false,
  })));
  await page.goto(base.href,{waitUntil:'commit'});
  await page.waitForFunction(()=>window.frontier?.view&&!frontier.view.graphicsLoading);
  assert.equal(await page.locator('html').getAttribute('data-renderer'),backend);

  async function start(map,mapSize){
    return page.evaluate(({map,mapSize})=>{
      frontier.start({mode:'sandbox',map,mapSize,seed:512});
      frontier.action('pause');
      document.querySelector('#modal-root').style.visibility='hidden';
      const v=frontier.view,s=frontier.sim,home=s.owned(0,'building','towncenter')[0];
      return {worldSize:s.worldSize,cells:v.fogCanvas.width,home:{x:home.x,z:home.z},visible:s.isVisible(home.x,home.z)};
    },{map,mapSize});
  }
  async function capture({x,z,y=null,fog,name}){
    const frame=await page.evaluate(({x,z,y,fog})=>{
      const v=frontier.view;
      v.settings.fog=fog;
      v.focus(x,z);v.target.set(x,y??v.groundHeight(x,z),z);v.zoom=28;v.tilt=.85;v.angle=0;v.updateCamera();
      return v.renderer.info.render.frame;
    },{x,z,y,fog});
    await page.waitForFunction(frame=>frontier.view.renderer.info.render.frame>frame+1,frame);
    const image=await page.screenshot({path:name?`${output}/${backend}-${name}.png`:undefined});
    return page.evaluate(async encoded=>{
      const image=new Image();image.src='data:image/png;base64,'+encoded;await image.decode();
      const canvas=document.createElement('canvas');canvas.width=canvas.height=9;
      const context=canvas.getContext('2d');
      context.drawImage(image,Math.floor(image.width/2)-4,Math.floor(image.height/2)-4,9,9,0,0,9,9);
      const pixels=context.getImageData(0,0,9,9).data;let sum=0;
      for(let i=0;i<pixels.length;i+=4)sum+=.2126*pixels[i]+.7152*pixels[i+1]+.0722*pixels[i+2];
      return Math.round(sum/81);
    },image.toString('base64'));
  }

  for(const {map,mapSize,z,name} of [
    {map:'coast',z:-43,name:'coast'},
    {map:'archipelago',mapSize:'epic',z:105,name:'epic-isles'},
    {map:'coast',z:-43,name:'coast-reload'},
  ]){
    const initial=await start(map,mapSize);
    assert.equal(initial.cells,initial.worldSize/2,'mask dimensions follow the match');
    assert.equal(initial.visible,true,'starting Town Center has sight');
    const home={...initial.home,y:4};
    const clearHome=await capture({...home,fog:false}),fogHome=await capture({...home,fog:true,name:name+'-home'});
    assert.ok(Math.abs(clearHome-fogHome)<=4,`${name}: fog changes the visible base (${clearHome} vs ${fogHome})`);

    const point=await page.evaluate(z=>{
      const channel=frontier.view.landscape.channels()[0];
      return {x:channel.center+Math.sin(z*channel.frequency)*channel.bend,z,y:.08};
    },z);
    assert.equal(await page.evaluate(({x,z})=>frontier.sim.isExplored(x,z),point),false,'water starts unexplored');
    const unknown=await capture({...point,fog:true,name:name+'-unexplored'});
    const clear=await capture({...point,fog:false});
    assert.ok(clear-unknown>=30,`${name}: unexplored water leaks through (${clear} vs ${unknown})`);

    const moveScout=async back=>page.evaluate(({point,back})=>{
      const sim=frontier.sim,scout=sim.owned(0,'unit','scout')[0],home=sim.players[0].start;
      scout.x=back?home.x:point.x-16;scout.z=back?home.z:point.z;
      sim.updateFog();
      return {visible:sim.isVisible(point.x,point.z),explored:sim.isExplored(point.x,point.z)};
    },{point,back});
    assert.deepEqual(await moveScout(false),{visible:true,explored:true});
    const scouted=await capture({...point,fog:true,name:name+'-visible'});
    assert.ok(Math.abs(clear-scouted)<=8,`${name}: scout leaves water fogged (${clear} vs ${scouted})`);
    assert.deepEqual(await moveScout(true),{visible:false,explored:true});
    const remembered=await capture({...point,fog:true,name:name+'-explored'});
    assert.ok(unknown+8<remembered&&remembered+8<scouted,`${name}: exploration states are indistinguishable (${unknown}, ${remembered}, ${scouted})`);
    console.log(JSON.stringify({backend,name,...initial,fogHome,clearHome,unknown,remembered,scouted,clear}));
  }
  const diagnostics=await page.evaluate(()=>{
    const v=frontier.view;
    return {fatal:v.graphicsFatal||null,programFailures:v.renderer.info.programs?.filter(program=>program.diagnostics?.runnable===false).length||0};
  });
  assert.deepEqual(diagnostics,{fatal:null,programFailures:0});
  assert.deepEqual(errors,[]);
}catch(error){
  if(errors.length)console.error(errors);
  throw error;
}finally{
  await browser.close();
}
