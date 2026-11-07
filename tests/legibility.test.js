import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const cssDir=path.join(root,'src');
const styles=fs.readdirSync(cssDir).filter(file=>file.endsWith('.css'));
const main=fs.readFileSync(path.join(root,'src','main.js'),'utf8');
const layer=fs.readFileSync(path.join(cssDir,'legibility.css'),'utf8');
const html=fs.readFileSync(path.join(root,'index.html'),'utf8');
const floor='font-size:max(.625rem,10px)';

test('no stylesheet ships a sub-10px fixed font size',()=>{
  const offenders=[];
  for(const file of styles){
    const source=fs.readFileSync(path.join(cssDir,file),'utf8');
    for(const match of source.matchAll(/font-size: *([0-9])px/g))offenders.push(`${file}:${match[1]}px`);
  }
  assert.deepEqual(offenders,[]);
  const raised=styles.filter(file=>fs.readFileSync(path.join(cssDir,file),'utf8').includes(floor));
  assert.ok(raised.length>=3,'the rem-based floor replaced the tiny declarations');
});

test('the legibility layer loads last and covers the device/accessibility matrix',()=>{
  const index=main.indexOf("import './legibility.css'");
  assert.ok(index>=0,'main.js imports the legibility layer');
  assert.ok(index>main.indexOf("import './interface-design.css'"),'it loads after the compact media queries');
  for(const feature of ['env(safe-area-inset','prefers-reduced-motion','forced-colors:active','html[dir="rtl"]','touch-action:manipulation','focus-visible','--ui-touch:44px','min-width:1900px','max-height:500px','max-width:720px']){
    assert.ok(layer.includes(feature),`legibility layer supports ${feature}`);
  }
  assert.match(html,/viewport-fit=cover/,'the viewport uses the safe-area viewport fit');
});

test('the font floor uses relative units so zoom and user font settings scale it',()=>{
  assert.match(floor,/\.625rem/);
  assert.match(floor,/10px/);
  assert.ok(floor.startsWith('font-size:max('));
});
