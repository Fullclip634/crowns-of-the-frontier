import {chromium} from '@playwright/test';
import fs from 'node:fs';

const browser=await chromium.launch({channel:'msedge',headless:true,args:['--enable-webgl','--ignore-gpu-blocklist']});
try{
  const page=await browser.newPage({viewport:{width:1024,height:720}}),errors=[];
  page.on('pageerror',error=>errors.push(error.message));
  page.on('console',message=>{if(message.type()==='error')errors.push(message.text());});
  await page.addInitScript(()=>localStorage.setItem('crowns-settings',JSON.stringify({quality:'high',autoQuality:false,weather:'clear',music:false,volume:0})));
  await page.goto(process.env.QA_URL||'http://localhost:4174/',{waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>window.frontier?.view?.artDiagnostics?.detail==='high');
  const channel=process.argv[2]||'direct';
  const report=await page.evaluate(channel=>{
    frontier.start({mode:'sandbox',map:'highlands',seed:512});frontier.action('pause');document.querySelector('#modal-root').style.visibility='hidden';
    const v=frontier.view,s=frontier.sim;s.stop(s.owned(0,'unit').map(e=>e.id));s.visible.fill(1);s.explored.fill(1);
    if(channel!=='normal'){
    const palette=v.materials.unitPalette,base=palette.onBeforeCompile,cache=palette.customProgramCacheKey;
    palette.onBeforeCompile=function(shader,renderer){base.call(this,shader,renderer);
      shader.vertexShader='varying vec4 frontierDebugShadowCoord;\n'+shader.vertexShader;
      shader.vertexShader=shader.vertexShader.replace('#include <shadowmap_vertex>','#include <shadowmap_vertex>\nfrontierDebugShadowCoord = vDirectionalShadowCoord[0];');
      shader.fragmentShader='varying vec4 frontierDebugShadowCoord;\n'+shader.fragmentShader;
      const output=channel==='outgoing'?'outgoingLight':channel==='receive'?'vec3(receiveShadow ? 1.0 : 0.0)':channel==='indirect'?'reflectedLight.indirectDiffuse':channel==='specular'?'reflectedLight.directSpecular':channel==='indirectSpecular'?'reflectedLight.indirectSpecular':'reflectedLight.directDiffuse';
      shader.fragmentShader=shader.fragmentShader.replace('#include <dithering_fragment>',channel==='noop'?'#include <dithering_fragment>\ngl_FragColor = gl_FragColor;':`#include <dithering_fragment>
        gl_FragColor = vec4(${output} * 0.125, 1.0);`);
    };palette.customProgramCacheKey=()=>cache.call(palette)+':shadow-'+channel+'-debug';palette.needsUpdate=true;}
    const types=['villager','spearman','swordsman','archer','scout','knight','sentinel','marksman','outrider','ram','catapult','cart'];
    types.forEach((type,i)=>{const e=s.addUnit(type,i%2,-44+(i%6)*3,46+Math.floor(i/6)*4);e.moving=false;e.cooldown=['archer','marksman'].includes(type)?1.6:type==='swordsman'?.5:0;});
    const pixels=()=>{const gl=v.renderer.getContext(),result=new Uint8Array(gl.drawingBufferWidth*gl.drawingBufferHeight*4);gl.readPixels(0,0,gl.drawingBufferWidth,gl.drawingBufferHeight,gl.RGBA,gl.UNSIGNED_BYTE,result);return result;};
    const draw=rigid=>{v.settings.rigidUnits=rigid;v.attach(s);v.clock=25;v.zoom=25;v.tilt=.62;v.focus(-36,49);v.render(0,false);return {pixels:pixels(),image:v.renderer.domElement.toDataURL('image/png')};};
    const before=draw(false),after=draw(true);let changed=0,max=0,total=0;const histogram=new Uint32Array(256);
    for(let i=0;i<before.pixels.length;i+=4){let delta=0;for(let channel=0;channel<3;channel++)delta=Math.max(delta,Math.abs(before.pixels[i+channel]-after.pixels[i+channel]));histogram[delta]++;if(delta)changed++;total+=delta;max=Math.max(max,delta);}
    let cumulative=0,p99=0;for(let delta=0;delta<256;delta++){cumulative+=histogram[delta];if(cumulative>Math.floor(before.pixels.length/4*.99)){p99=delta;break;}}
    return {pixels:before.pixels.length/4,changed,max,average:total/(before.pixels.length/4),p99,images:[before.image,after.image]};
  },channel);
  for(const [index,data]of report.images.entries())fs.writeFileSync(`artifacts/rig-shadow-${channel}-${index?'after':'before'}.png`,Buffer.from(data.split(',')[1],'base64'));
  delete report.images;report.errors=errors;
  fs.writeFileSync(`artifacts/rig-shadow-${channel}.json`,JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
}finally{await browser.close();}
