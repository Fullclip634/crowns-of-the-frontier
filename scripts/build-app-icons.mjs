// Rasterize the attributed vector mark; no generated artwork or runtime renderer.
import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';import {createHash} from 'node:crypto';import {chromium} from 'playwright-core';
const root=path.resolve(import.meta.dirname,'..'),source=fs.readFileSync(path.join(root,'public/icon.svg'),'utf8');
// Build full-bleed opaque maskable / Apple Touch variant from the exact same attributed castle vector
// (no rounded corners, emblem sized comfortably inside W3C 80% safe zone so OS masks never expose white slivers).
const maskableSource=source
  .replace(/<rect width="192" height="192" rx="38" fill="#172b23"\/>/,'<rect width="192" height="192" fill="#172b23"/>')
  .replace(/<rect x="12" y="12" width="168" height="168" rx="28"[^/]*\/>/,'<rect x="24" y="24" width="144" height="144" rx="26" fill="none" stroke="#d7bc81" stroke-opacity=".28"/>')
  .replace(/<svg x="36" y="32" width="120" height="120"/,'<svg x="46" y="44" width="100" height="100"');
const hash=bytes=>createHash('sha256').update(bytes).digest('hex'),report={sourceSHA256:hash(source),files:[]};
const browserCandidates=[process.env.UI_ICON_BROWSER,chromium.executablePath(),'C:/Program Files/Google/Chrome/Application/chrome.exe','C:/Program Files (x86)/Google/Chrome/Application/chrome.exe','C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'].filter(Boolean);
const executablePath=browserCandidates.find(p=>fs.existsSync(p));
const launchOpts={headless:true,args:['--disable-gpu','--no-sandbox','--disable-dev-shm-usage'],...(executablePath?{executablePath}:{})};
let browser;
try{
  browser=await chromium.launch(launchOpts);
  const context=await browser.newContext({deviceScaleFactor:1}),page=await context.newPage();
  const exports=[
    ['apple-touch-icon.png',180,maskableSource,false],
    ['icon-192.png',192,source,true],
    ['icon-512.png',512,source,true],
    ['icon-maskable-192.png',192,maskableSource,false],
    ['icon-maskable-512.png',512,maskableSource,false],
  ];
  for(const [file,size,svgMarkup,transparent]of exports){
    await page.setViewportSize({width:size,height:size});
    await page.setContent(`<style>html,body{margin:0;width:100%;height:100%;overflow:hidden;background:${transparent?'transparent':'#172b23'}}body>svg{width:100%;height:100%;display:block}</style>`+svgMarkup);
    const bytes=await page.screenshot({omitBackground:transparent});assert.equal(bytes.readUInt32BE(16),size);assert.equal(bytes.readUInt32BE(20),size);fs.writeFileSync(path.join(root,'public',file),bytes);report.files.push({file,size,bytes:bytes.length,sha256:hash(bytes),maskable:!transparent});
  }
  fs.writeFileSync(path.join(root,'src/ui-art/app-icon-manifest.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({passed:true,...report}));
}finally{await browser?.close().catch(()=>{});}
