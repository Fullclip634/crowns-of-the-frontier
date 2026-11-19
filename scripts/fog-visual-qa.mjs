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
  await page.waitForFunction(()=>window.frontier?.view&&!frontier.view.graphicsLoading,null,{polling:250});
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
  async function capture({x,z,y=null,fog,name,zoom=28,tilt=.85,angle=0,highlights=false}){
    const frame=await page.evaluate(({x,z,y,fog,zoom,tilt,angle})=>{
      const v=frontier.view;
      v.settings.fog=fog;
      v.focus(x,z);v.target.set(x,y??v.groundHeight(x,z),z);v.zoom=zoom;v.tilt=tilt;v.angle=angle;v.updateCamera();
      return v.renderer.isWebGPURenderer?(v.renderFlight?.submitted??0):v.renderer.info.render.frame;
    },{x,z,y,fog,zoom,tilt,angle});
    await page.waitForFunction(frame=>{
      const v=frontier.view,count=v.renderer.isWebGPURenderer?(v.renderFlight?.submitted??0):v.renderer.info.render.frame;
      return v.graphicsFatal||count>frame+1;
    },frame,{polling:250});
    const failure=await page.evaluate(()=>frontier.view.graphicsFatal||null);
    assert.equal(failure,null,JSON.stringify(failure));
    const image=await page.screenshot({path:name?`${output}/${backend}-${name}.png`:undefined});
    return page.evaluate(async ({encoded,highlights})=>{
      const image=new Image();image.src='data:image/png;base64,'+encoded;await image.decode();
      const width=highlights?100:9,height=highlights?90:9,offset=highlights?12:0;
      const canvas=document.createElement('canvas');canvas.width=width;canvas.height=height;
      const context=canvas.getContext('2d');
      context.drawImage(image,Math.floor((image.width-width)/2),Math.floor((image.height-height)/2)-offset,width,height,0,0,width,height);
      const pixels=context.getImageData(0,0,width,height).data,luma=[];
      for(let i=0;i<pixels.length;i+=4)luma.push(.2126*pixels[i]+.7152*pixels[i+1]+.0722*pixels[i+2]);
      const samples=highlights?luma.sort((a,b)=>b-a).slice(0,Math.ceil(luma.length*.07)):luma;
      return Math.round(samples.reduce((sum,value)=>sum+value,0)/samples.length);
    },{encoded:image.toString('base64'),highlights});
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
  await start('valley');
  const approach=await page.evaluate(()=>{
    const {sim}=frontier,scout=sim.owned(0,'unit','scout')[0];
    for(const entity of sim.entities)if(entity!==scout)entity.hp=0;
    sim.explored.fill(0);
    for(let x=-40;x<=-20;x++){
      Object.assign(scout,{x,z:0});
      sim.updateFog();
      if(sim.isVisible(-12,0))break;
    }
    return {visible:sim.isVisible(-12,0),center:sim.isExplored(0,0)};
  });
  assert.deepEqual(approach,{visible:true,center:false});
  await capture({x:-9,z:0,fog:true,name:'bridge-approach'});
  assert.equal(await page.evaluate(()=>frontier.view.bridgeMeshes[0].visible),true);

  const deposit=await page.evaluate(()=>{
    const {sim,view}=frontier;
    const gold=sim.addResource('gold',-37,-44,5000);
    sim.addResource('gold',-33,-44,5000);
    return {x:gold.x,z:gold.z,y:view.entityHeight(gold)+.65,id:gold.id};
  });
  const sampleDeposit=async seen=>{
    const state=await page.evaluate(({deposit,seen})=>{
      const {sim}=frontier,scout=sim.owned(0,'unit','scout')[0];
      Object.assign(scout,seen?{x:deposit.x-16,z:deposit.z}:{x:-60,z:55});
      sim.updateFog();
      return {visible:sim.isVisible(deposit.x,deposit.z),explored:sim.isExplored(deposit.x,deposit.z)};
    },{deposit,seen});
    assert.deepEqual(state,{visible:seen,explored:true});
    const brightness=await capture({...deposit,fog:true,zoom:10,tilt:.62,angle:.34,highlights:true,name:seen?'visible-gold':'remembered-gold'});
    assert.equal(await page.evaluate(id=>frontier.view.nodes.get(id)?.visible,deposit.id),true);
    return brightness;
  };
  const litGold=await sampleDeposit(true),dimGold=await sampleDeposit(false);
  assert.ok(litGold-dimGold>=12,`explored gold stays bright after the scout departs (${litGold} vs ${dimGold})`);
  console.log(JSON.stringify({backend,approach,litGold,dimGold}));

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
