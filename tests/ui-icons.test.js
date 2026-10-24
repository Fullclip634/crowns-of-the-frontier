import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import {createHash} from 'node:crypto';
import {UNITS,BUILDINGS,TECHS,MODES,costText} from '../src/data.js';import {uiIcon,UI_ICONS,ICON_MAP} from '../src/ui-icons.js';import manifest from '../src/ui-art/icon-manifest.json' with {type:'json'};

test('professional local SVG artwork covers every unit, building, technology and game mode',()=>{
  const svg=fs.readFileSync(new URL('../src/ui-art/icons.svg',import.meta.url),'utf8'),ids=[...svg.matchAll(/<symbol id="icon-([^"]+)"/g)].map(m=>m[1]);
  assert.deepEqual(ids,manifest.icons);assert.equal(new Set(ids).size,ids.length);assert.equal(createHash('sha256').update(svg).digest('hex'),manifest.spriteSHA256);assert.ok(Buffer.byteLength(svg)<35000);
  for(const key of [...Object.keys(UNITS),...Object.keys(BUILDINGS),...Object.keys(TECHS),...MODES.map(m=>m.id)]){assert.ok(ICON_MAP[key],key+' has a semantic icon');assert.ok(ids.includes(ICON_MAP[key]),key+' exists in the bundled artwork');assert.match(UI_ICONS[key],/<svg\b/);assert.match(UI_ICONS[key],/aria-hidden="true"/);}
  assert.doesNotMatch(svg,/<(?:script|image|foreignObject|style)\b|javascript:|\bon\w+=/i);assert.match(svg,/Lucide Icons and Contributors/);assert.match(svg,/Skoll/);assert.match(svg,/Delapouite/);assert.match(svg,/creativecommons.org\/licenses\/by\/3.0/);
  assert.match(uiIcon('not-a-real-icon'),/#icon-circle-help/);assert.doesNotMatch(uiIcon('" onclick="bad'),/onclick/);
});

test('resource costs use readable resource names in both tooltips and game messages',()=>{
  assert.equal(costText({wood:75,gold:20}),'75 Wood · 20 Gold');assert.equal(costText({food:30.2,stone:12}),'31 Food · 12 Stone');assert.equal(costText({}), '');
});

test('phone and installed-app icon exports match the attributed vector source',()=>{
  const root=new URL('../public/',import.meta.url),art=JSON.parse(fs.readFileSync(new URL('../src/ui-art/app-icon-manifest.json',import.meta.url))),hash=bytes=>createHash('sha256').update(bytes).digest('hex');
  assert.equal(hash(fs.readFileSync(new URL('icon.svg',root))),art.sourceSHA256);
  for(const file of art.files){const bytes=fs.readFileSync(new URL(file.file,root));assert.equal(bytes.readUInt32BE(16),file.size);assert.equal(bytes.readUInt32BE(20),file.size);assert.equal(hash(bytes),file.sha256);assert.ok(bytes.length<20000);}
  const app=JSON.parse(fs.readFileSync(new URL('manifest.webmanifest',root)));for(const size of [192,512])assert.ok(app.icons.some(icon=>icon.sizes===`${size}x${size}`&&icon.type==='image/png'));
});
