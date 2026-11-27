import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import {createHash} from 'node:crypto';import {inflateSync} from 'node:zlib';
import {UNITS,BUILDINGS,TECHS,MODES,FACTIONS,costText} from '../src/data.js';import {HERO_DEFS} from '../src/heroes.js';import {uiIcon,uiVectorIcon,UI_ICONS,ICON_MAP,FACTION_CREST_ICONS,HERO_SKILL_ICONS} from '../src/ui-icons.js';import {NEARBY_ICONS} from '../src/nearby-ui.js';import manifest from '../src/ui-art/icon-manifest.json' with {type:'json'};

function pngCornerPixel(bytes){
  const colorType=bytes[25],idats=[];
  for(let off=8;off<bytes.length;){const len=bytes.readUInt32BE(off),type=bytes.toString('ascii',off+4,off+8);if(type==='IDAT')idats.push(bytes.subarray(off+8,off+8+len));off+=12+len;}
  const raw=inflateSync(Buffer.concat(idats));
  return colorType===6?{r:raw[1],g:raw[2],b:raw[3],a:raw[4]}:{r:raw[1],g:raw[2],b:raw[3],a:255};
}

test('professional local SVG artwork covers every unit, building, technology, faction crest, hero skill, nearby control and game mode',()=>{
  const svg=fs.readFileSync(new URL('../src/ui-art/icons.svg',import.meta.url),'utf8'),ids=[...svg.matchAll(/<symbol id="icon-([^"]+)"/g)].map(m=>m[1]);
  assert.deepEqual(ids,manifest.icons);assert.equal(new Set(ids).size,ids.length);assert.equal(createHash('sha256').update(svg).digest('hex'),manifest.spriteSHA256);assert.ok(Buffer.byteLength(svg)<35000);
  for(const key of [...Object.keys(UNITS),...Object.keys(BUILDINGS),...Object.keys(TECHS),...MODES.map(m=>m.id)]){assert.ok(ICON_MAP[key],key+' has a semantic icon');assert.ok(ids.includes(ICON_MAP[key]),key+' exists in the bundled artwork');assert.match(UI_ICONS[key],/<svg\b/);assert.match(UI_ICONS[key],/aria-hidden="true"/);}
  for(const faction of Object.keys(FACTIONS)){const id=FACTION_CREST_ICONS[faction];assert.ok(id&&ids.includes(id),`faction crest ${faction} exists in icons.svg`);assert.doesNotMatch(uiVectorIcon(id),/#icon-circle-help/);}
  for(const def of Object.values(HERO_DEFS))for(const sk of def.skills){const id=HERO_SKILL_ICONS[sk.id];assert.ok(id&&ids.includes(id),`hero skill ${sk.id} exists in icons.svg`);assert.doesNotMatch(uiVectorIcon(id),/#icon-circle-help/);}
  for(const formation of ['formation-square','formation-line','formation-column','route','lock']){assert.ok(ids.includes(formation),`${formation} exists in icons.svg`);}
  for(const [name,markup] of Object.entries(NEARBY_ICONS)){assert.match(markup,/#icon-/,'NEARBY_ICONS.'+name+' uses unified icons.svg sprite');assert.doesNotMatch(markup,/#icon-circle-help/);}
  assert.ok(manifest.paintedAtlas,'icon-manifest.json tracks painted atlas provenance');
  const atlasBytes=fs.readFileSync(new URL('../src/ui-art/medieval-icons-atlas.webp',import.meta.url));
  assert.equal(createHash('sha256').update(atlasBytes).digest('hex'),manifest.paintedAtlas.sha256,'painted atlas SHA-256 matches manifest');
  assert.doesNotMatch(svg,/<(?:script|image|foreignObject|style)\b|javascript:|\bon\w+=/i);assert.match(svg,/Lucide Icons and Contributors/);assert.match(svg,/Skoll/);assert.match(svg,/Delapouite/);assert.match(svg,/creativecommons.org\/licenses\/by\/3.0/);
  assert.match(uiIcon('not-a-real-icon'),/#icon-circle-help/);assert.doesNotMatch(uiIcon('" onclick="bad'),/onclick/);
});

test('resource costs use readable resource names in both tooltips and game messages',()=>{
  assert.equal(costText({wood:75,gold:20}),'75 Wood · 20 Gold');assert.equal(costText({food:30.2,stone:12}),'31 Food · 12 Stone');assert.equal(costText({}), '');
});

test('phone and installed-app icon exports match the attributed vector source with zero white corners and proper maskable entries',()=>{
  const root=new URL('../public/',import.meta.url),art=JSON.parse(fs.readFileSync(new URL('../src/ui-art/app-icon-manifest.json',import.meta.url))),hash=bytes=>createHash('sha256').update(bytes).digest('hex');
  assert.equal(hash(fs.readFileSync(new URL('icon.svg',root))),art.sourceSHA256);
  for(const file of art.files){
    const bytes=fs.readFileSync(new URL(file.file,root));
    assert.equal(bytes.readUInt32BE(16),file.size);assert.equal(bytes.readUInt32BE(20),file.size);
    assert.equal(hash(bytes),file.sha256);assert.ok(bytes.length<20000);
    const corner=pngCornerPixel(bytes);
    if(file.maskable){
      assert.equal(corner.a,255,file.file+' maskable/apple icon is full-bleed opaque');
      assert.ok(corner.r<40&&corner.g<60&&corner.b<50,`${file.file} corner is dark emerald, never white (got ${JSON.stringify(corner)})`);
    }else{
      assert.equal(corner.a,0,file.file+' rounded any-purpose PNG uses true transparent corners');
    }
  }
  const app=JSON.parse(fs.readFileSync(new URL('manifest.webmanifest',root)));
  for(const size of [192,512]){
    assert.ok(app.icons.some(icon=>icon.sizes===`${size}x${size}`&&icon.type==='image/png'&&icon.purpose==='any'),`manifest has dedicated ${size}px any icon`);
    assert.ok(app.icons.some(icon=>icon.sizes===`${size}x${size}`&&icon.type==='image/png'&&icon.purpose==='maskable'),`manifest has dedicated ${size}px maskable icon`);
  }
  assert.ok(app.icons.every(icon=>icon.purpose!=='any maskable'),'manifest avoids deprecated combined "any maskable" purpose');
});
