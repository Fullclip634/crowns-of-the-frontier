import {chromium} from 'playwright-core';
import fs from 'node:fs';
import assert from 'node:assert/strict';

const candidatePath=process.env.SURFACE_CANDIDATE||'.tools/compressed-surfaces-uastc3';
assert.match(candidatePath,/^\.tools\/[a-z0-9-]+$/);
const format=process.env.SURFACE_FORMAT||'auto';assert.ok(['auto','bptc'].includes(format));const suffix=format==='auto'?'':'-'+format;
const reportPath=`artifacts/texture-${candidatePath.split('/').at(-1)}${suffix}-qa.json`,report={passed:false,requestedFormat:format,errors:[],maps:[],fidelityFailures:[],stage:'browser launch'};let browser,page;
const guard=setTimeout(()=>{fs.writeFileSync(reportPath,JSON.stringify({...report,failure:'Verification exceeded five minutes'},null,2));browser?.close().catch(()=>{});setTimeout(()=>process.exit(1),5000);},300000);
try{
  browser=process.env.QA_BROWSER_ENDPOINT?await chromium.connectOverCDP(process.env.QA_BROWSER_ENDPOINT):await chromium.launch({channel:'msedge',headless:true,args:['--enable-webgl','--ignore-gpu-blocklist']});
  page=await browser.newPage({viewport:{width:1100,height:740}});page.setDefaultNavigationTimeout(90000);page.setDefaultTimeout(90000);
  page.on('pageerror',error=>report.errors.push(error.message));
  page.on('console',message=>{if(message.type()==='error')report.errors.push(message.text());});
  report.stage='fixture navigation';await page.goto(new URL('/scripts/texture-fixture.html',process.env.QA_URL||'http://127.0.0.1:4174/').href,{waitUntil:'domcontentloaded'});await page.waitForFunction(()=>window.textureFixture,null,{timeout:30000});console.log('Isolated texture renderer ready');
  const candidates=JSON.parse(fs.readFileSync(candidatePath+'/compression.json','utf8')).maps;
  for(const candidate of candidates){
    report.stage=candidate.source;console.log('Checking '+candidate.source);
    const check=await page.evaluate(async ({candidate,candidatePath,format})=>{
      const {THREE,KTX2Loader,renderer}=textureFixture;
      let support=renderer;if(format==='bptc'){if(!renderer.extensions.has('EXT_texture_compression_bptc'))throw new Error('The test GPU does not support BPTC');support=Object.create(renderer);support.extensions={has:name=>name==='WEBGL_compressed_texture_astc'?false:renderer.extensions.has(name)};}
      const loader=new KTX2Loader().setTranscoderPath('/node_modules/three/examples/jsm/libs/basis/').setWorkerLimit(1).detectSupport(support);
      const original=await new THREE.TextureLoader().loadAsync('/src/assets3d/textures/'+candidate.source);
      const encoded=await loader.loadAsync('/'+candidatePath+'/'+candidate.file);
      original.flipY=encoded.flipY=false;original.colorSpace=encoded.colorSpace=candidate.kind==='color'?THREE.SRGBColorSpace:THREE.NoColorSpace;
      original.minFilter=encoded.minFilter=THREE.LinearFilter;original.magFilter=encoded.magFilter=THREE.LinearFilter;
      const scene=new THREE.Scene(),camera=new THREE.OrthographicCamera(-1,1,1,-1,0,2),material=new THREE.MeshBasicMaterial({map:original,toneMapped:false}),geometry=new THREE.PlaneGeometry(2,2);
      camera.position.z=1;scene.add(new THREE.Mesh(geometry,material));
      const target=new THREE.WebGLRenderTarget(1024,1024,{depthBuffer:false,colorSpace:candidate.kind==='color'?THREE.SRGBColorSpace:THREE.NoColorSpace}),before=new Uint8Array(1024*1024*4),after=new Uint8Array(before.length),saved=renderer.getRenderTarget();
      renderer.setRenderTarget(target);renderer.render(scene,camera);renderer.readRenderTargetPixels(target,0,0,1024,1024,before);
      material.map=encoded;material.needsUpdate=true;renderer.render(scene,camera);renderer.readRenderTargetPixels(target,0,0,1024,1024,after);renderer.setRenderTarget(saved);
      const errors=new Uint32Array(256);let squared=0,max=0,count=0,angleSquared=0,angleMax=0;
      for(let p=0;p<before.length;p+=4){for(let c=0;c<3;c++){const d=Math.abs(before[p+c]-after[p+c]);squared+=d*d;max=Math.max(max,d);errors[d]++;count++;}
        if(candidate.kind==='normal'){const a=[0,1,2].map(c=>before[p+c]/127.5-1),b=[0,1,2].map(c=>after[p+c]/127.5-1),dot=a.reduce((n,v,c)=>n+v*b[c],0)/(Math.hypot(...a)*Math.hypot(...b)),angle=Math.acos(Math.max(-1,Math.min(1,dot)))*180/Math.PI;angleSquared+=angle*angle;angleMax=Math.max(angleMax,angle);}}
      let at=0,p95=0;for(;p95<255;p95++){at+=errors[p95];if(at>=count*.95)break;}
      const result={source:candidate.source,kind:candidate.kind,compressed:!!encoded.isCompressedTexture,format:encoded.format,width:encoded.image.width,height:encoded.image.height,mips:encoded.mipmaps.length,gpuPayloadBytes:encoded.mipmaps.reduce((n,mip)=>n+mip.data.byteLength,0),uncompressedMipBytes:Math.round(1024*1024*4*4/3),psnr:squared?10*Math.log10(255**2/(squared/count)):100,p95,max,normalAngleRms:candidate.kind==='normal'?Math.sqrt(angleSquared/(1024*1024)):null,normalAngleMax:candidate.kind==='normal'?angleMax:null};
      renderer.render(scene,camera);
      original.dispose();encoded.dispose();target.dispose();geometry.dispose();material.dispose();loader.dispose();return result;
    },{candidate,candidatePath,format});
    if(format==='bptc')assert.equal(check.format,36492,'The pixel comparison must use real BPTC textures');
    report.maps.push(check);assert.equal(check.compressed,true);assert.equal(check.width,1024);assert.equal(check.height,1024);assert.equal(check.mips,11);if(check.psnr<35||check.p95>10||check.kind==='normal'&&check.normalAngleRms>2)report.fidelityFailures.push(check.source);
    console.log(JSON.stringify(check));
    if(candidate.source==='leafy_grass_color.jpg')await page.screenshot({path:`artifacts/texture-${candidatePath.split('/').at(-1)}${suffix}-grass.png`});
  }
  assert.deepEqual(report.errors,[]);assert.deepEqual(report.fidelityFailures,[],'Every candidate must preserve the required surface detail');report.passed=true;
}catch(error){report.failure??=error.message;if(page)report.document=await page.evaluate(()=>({url:location.href,title:document.title,text:document.body.innerText.slice(0,300)})).catch(()=>null);throw error;}
finally{clearTimeout(guard);fs.writeFileSync(reportPath,JSON.stringify(report,null,2));await browser?.close();}
