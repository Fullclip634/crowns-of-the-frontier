// Rasterize the attributed vector mark; no generated artwork or runtime renderer.
import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';import {spawn} from 'node:child_process';import {setTimeout as delay} from 'node:timers/promises';import {createHash} from 'node:crypto';import {chromium} from 'playwright-core';
const root=path.resolve(import.meta.dirname,'..'),source=fs.readFileSync(path.join(root,'public/icon.svg'),'utf8'),profile=path.join(root,'.tools/app-icons-browser-'+Date.now());fs.mkdirSync(profile,{recursive:true});
const child=spawn(process.env.UI_ICON_BROWSER||'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',['--headless','--disable-gpu','--no-sandbox','--no-first-run','--remote-debugging-address=127.0.0.1','--remote-debugging-port=0','--user-data-dir='+profile],{windowsHide:true,stdio:'ignore'});let browser,failure;child.on('error',e=>failure=e);
const hash=bytes=>createHash('sha256').update(bytes).digest('hex'),report={sourceSHA256:hash(source),files:[]};
try{
  let port;for(let i=0;i<300;i++){if(failure)throw failure;const active=path.join(profile,'DevToolsActivePort');if(fs.existsSync(active)){try{port=Number(fs.readFileSync(active,'utf8').split('\n')[0]);if(port)break;}catch{}}await delay(100);}assert.ok(port,'No local browser endpoint');
  browser=await chromium.connectOverCDP('http://127.0.0.1:'+port);const context=await browser.newContext({deviceScaleFactor:1}),page=await context.newPage();
  for(const [file,size]of [['apple-touch-icon.png',180],['icon-192.png',192],['icon-512.png',512]]){
    await page.setViewportSize({width:size,height:size});await page.setContent('<style>html,body{margin:0;width:100%;height:100%;overflow:hidden}body>svg{width:100%;height:100%;display:block}</style>'+source);
    const bytes=await page.screenshot();assert.equal(bytes.readUInt32BE(16),size);assert.equal(bytes.readUInt32BE(20),size);fs.writeFileSync(path.join(root,'public',file),bytes);report.files.push({file,size,bytes:bytes.length,sha256:hash(bytes)});
  }
  fs.writeFileSync(path.join(root,'src/ui-art/app-icon-manifest.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({passed:true,...report}));
}finally{await browser?.close().catch(()=>{});child.kill();}
