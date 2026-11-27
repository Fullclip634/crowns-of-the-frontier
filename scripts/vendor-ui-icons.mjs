import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';import {gunzipSync} from 'node:zlib';import {createHash} from 'node:crypto';
const root=path.resolve(import.meta.dirname,'..'),version='1.61.0',integrity='yLAiQB3MWUJEstsEDAwenSA3m7vr1tdLvgnC16Q/XMxRRma0DWwMs8M2bWlvgShrIs1m2mWMJ+0AiahqQO4GrA==',gameCommit='82d948812bfe3f269ef8f731dcdb07b08160edc4';
const names=[
  'crown','castle','swords','shield','shield-half','shield-check','sword','bow-arrow','chess-knight','hammer','pickaxe',
  'wheat','logs','coins','mountain','users-round','user-round','house','landmark','church','store','anvil','door-open',
  'brick-wall','wind','trees','ship','ship-cargo','ship-wheel','sailboat','fish','shopping-cart','book-open','graduation-cap',
  'trophy','map','flag-triangle-right','tent-tree','settings','play','pause','x','check','chevron-right','chevron-down',
  'rotate-ccw','rotate-cw','zoom-in','zoom-out','columns-3','sun','ellipsis','menu','list-ordered','gift','clock','target',
  'square','message-square','save','folder-open','circle-help','circle-alert','volume-2','music','eye','bell','undo-2',
  'hand','network','anchor','wifi','globe','camera','copy','share-2','qr-code','flame','axe','megaphone','route','lock',
];
// Original custom 24x24 medieval, tactical formation, and civilization heraldry stroke symbols
// authored to match Lucide's 1.8px round-cap geometry.
const customSymbols=[
  ['watchtower','<path d="M7 21h10" /><path d="M9 21 10 9h4l1 12" /><path d="M8 9h8V4h-2v2h-1.5V4h-1v2H10V4H8z" /><path d="M12 12v3" />'],
  ['spear','<path d="M3 21 15 9" /><path d="M21 3 13 7l4 4z" /><path d="m12.5 11.5 1.5 3" />'],
  ['crossbow','<path d="M4 20 20 4" /><path d="M16 4h4v4" /><path d="M8 4a9 9 0 0 1 12 12" /><path d="m8 4 3 9 9 3" />'],
  ['spyglass','<path d="m3 19 2 2 4.5-4.5-2-2z" /><path d="m7.5 14.5 5.5-5.5 3 3-5.5 5.5" /><path d="m13 9 4-4 4 4-4 4z" />'],
  ['lance','<path d="M4 20 20 4" /><path d="m21 3-5 2 3 3z" /><path d="M15 9H7l2.5 2.2L7 13.5h5.5" />'],
  ['monument','<path d="M4 21h16" /><path d="M6 18h12" /><path d="M8 18v-5a4 4 0 0 1 8 0v5" /><path d="M12 3v6" /><path d="M10 6h4" />'],
  ['farm-plot','<rect x="3" y="10" width="18" height="10" rx="1" /><path d="M7 10v10" /><path d="M12 10v10" /><path d="M17 10v10" /><path d="M12 10V4" /><path d="m9 6 3-2 3 2" />'],
  ['horseshoe','<path d="M6 5v7a6 6 0 0 0 12 0V5" /><path d="M4 5h4" /><path d="M16 5h4" /><circle cx="7.5" cy="11" r=".5" /><circle cx="16.5" cy="11" r=".5" /><circle cx="12" cy="17.5" r=".5" />'],
  ['bastion','<path d="M3 20h18" /><path d="M4 20V8h3v3h3V8h4v3h3V8h3v12" /><path d="M4 15h16" />'],
  ['formation-square','<rect x="4" y="4" width="4" height="4" rx=".8" /><rect x="10" y="4" width="4" height="4" rx=".8" /><rect x="16" y="4" width="4" height="4" rx=".8" /><rect x="4" y="10" width="4" height="4" rx=".8" /><rect x="10" y="10" width="4" height="4" rx=".8" /><rect x="16" y="10" width="4" height="4" rx=".8" /><rect x="4" y="16" width="4" height="4" rx=".8" /><rect x="10" y="16" width="4" height="4" rx=".8" /><rect x="16" y="16" width="4" height="4" rx=".8" />'],
  ['formation-line','<rect x="3" y="9" width="4" height="6" rx=".8" /><rect x="10" y="9" width="4" height="6" rx=".8" /><rect x="17" y="9" width="4" height="6" rx=".8" /><path d="M2 5h20" /><path d="M2 19h20" />'],
  ['formation-column','<rect x="9" y="3" width="6" height="4" rx=".8" /><rect x="9" y="10" width="6" height="4" rx=".8" /><rect x="9" y="17" width="6" height="4" rx=".8" /><path d="M5 2v20" /><path d="M19 2v20" />'],
  ['crest-alder','<path d="M12 22s7-3.5 7-9.5V6l-7-3-7 3v6.5C5 18.5 12 22 12 22z" /><path d="M8.5 10.5 10 8l2 2 2-2 1.5 2.5" /><path d="M9 14.5h6" /><path d="M12 10.5v6.5" />'],
  ['crest-sun','<circle cx="12" cy="12" r="4" /><path d="M12 2v3" /><path d="M12 19v3" /><path d="M2 12h3" /><path d="M19 12h3" /><path d="m4.9 4.9 2.2 2.2" /><path d="m16.9 16.9 2.2 2.2" /><path d="m19.1 4.9-2.2 2.2" /><path d="m7.1 16.9-2.2 2.2" />'],
  ['crest-raven','<path d="M12 21V5" /><path d="M12 4c-2.5 2-6 3-9 2 1 4 4 7 9 8 5-1 8-4 9-8-3 1-6.5 0-9-2z" /><path d="M6.5 10.5 12 12l5.5-1.5" />'],
  ['crest-iron','<path d="M3 19h18" /><path d="M6 19v-3h12v3" /><path d="M8 16v-3l-4-2h16l-4 2v3" /><path d="m5 11 4-6 3 4 3-4 4 6" />'],
  ['crest-jade','<path d="M4 20h16" /><path d="M7 20v-5h10v5" /><path d="M4 15c3-.5 5-2 8-4 3 2 5 3.5 8 4" /><path d="M6 10c2.5-.5 4-1.5 6-3.5 2 2 3.5 3 6 3.5" /><path d="M12 3v3.5" />'],
];
const get=async url=>{const r=await fetch(url,{signal:AbortSignal.timeout(30000)});assert.ok(r.ok,url+' '+r.status);return Buffer.from(await r.arrayBuffer());};
const packedFile=path.join(root,'.tools/lucide-static-'+version+'.tgz');fs.mkdirSync(path.dirname(packedFile),{recursive:true});let packed=fs.existsSync(packedFile)?fs.readFileSync(packedFile):await get('https://registry.npmjs.org/lucide-static/-/lucide-static-'+version+'.tgz');
assert.equal(createHash('sha512').update(packed).digest('base64'),integrity);fs.writeFileSync(packedFile,packed);
const tar=gunzipSync(packed),files=new Map();for(let at=0;at+512<tar.length;){const name=tar.subarray(at,at+100).toString().replace(/\0.*$/s,''),size=parseInt(tar.subarray(at+124,at+136).toString().replace(/\0.*$/s,'').trim(),8)||0;if(!name)break;if(name==='package/LICENSE'||/^package\/icons\/[^/]+\.svg$/.test(name))files.set(name,tar.subarray(at+512,at+512+size).toString());at+=512+Math.ceil(size/512)*512;}
const inner=source=>{assert.ok(!/<(?:script|foreignObject|image|style|use)\b|\bon\w+=|javascript:|url\(/i.test(source));return source.slice(source.indexOf('>',source.indexOf('<svg'))+1,source.lastIndexOf('</svg>')).trim();};
const symbols=names.map(name=>{const source=files.get('package/icons/'+name+'.svg');assert.ok(source,'Missing Lucide '+name);return `<symbol id="icon-${name}" viewBox="0 0 24 24">${inner(source)}</symbol>`;});
const target=path.join(root,'src/ui-art');
const existingSvg=fs.existsSync(path.join(target,'icons.svg'))?fs.readFileSync(path.join(target,'icons.svg'),'utf8'):'';
const existingManifest=fs.existsSync(path.join(target,'icon-manifest.json'))?JSON.parse(fs.readFileSync(path.join(target,'icon-manifest.json'),'utf8')):null;
const game=[{name:'siege-ram',path:'skoll/siege-ram.svg',author:'Skoll'},{name:'trebuchet',path:'delapouite/trebuchet.svg',author:'Delapouite'}];
for(const item of game){
  item.source='https://game-icons.net/1x1/'+item.path.replace(/\.svg$/,'.html');
  const cachedMatch=existingSvg.match(new RegExp(`<symbol id="icon-${item.name}"[^>]*>[\\s\\S]*?</symbol>`));
  const cachedMeta=existingManifest?.gameIcons?.icons?.find(i=>i.name===item.name);
  if(cachedMatch&&cachedMeta?.sha256){
    item.sha256=cachedMeta.sha256;
    symbols.push(cachedMatch[0]);
  }else{
    const source=(await get('https://raw.githubusercontent.com/game-icons/icons/'+gameCommit+'/'+item.path)).toString();
    item.sha256=createHash('sha256').update(source).digest('hex');
    const body=inner(source).replace(/<path\s+d="M0 0h512v512H0z"\s*\/>/,'').replaceAll('fill="#fff"','fill="currentColor"');
    symbols.push(`<symbol id="icon-${item.name}" viewBox="0 0 512 512" fill="currentColor" stroke="none">${body}</symbol>`);
  }
}
for(const [name,body]of customSymbols){assert.ok(!/<(?:script|foreignObject|image|style|use)\b|\bon\w+=|javascript:|url\(/i.test(body));symbols.push(`<symbol id="icon-${name}" viewBox="0 0 24 24">${body}</symbol>`);}
const atlasPath=path.join(target,'medieval-icons-atlas.webp');
const atlasBytes=fs.existsSync(atlasPath)?fs.readFileSync(atlasPath):null;
const paintedAtlas=atlasBytes?{file:'medieval-icons-atlas.webp',grid:'8x9',width:1024,height:1152,bytes:atlasBytes.length,sha256:createHash('sha256').update(atlasBytes).digest('hex'),license:'Original project artwork (Crowns of the Frontier)'}:null;
const license=files.get('package/LICENSE'),credits=license+'\n\nSiege ram: Skoll; trebuchet: Delapouite. Game-icons.net, Creative Commons Attribution 3.0.\nhttps://creativecommons.org/licenses/by/3.0/\nChanges: scaled and recolored for the game interface.\n'+game.map(i=>i.source).join('\n')+'\n\nCustom medieval, formation, and faction heraldry stroke symbols & painted medieval-icons-atlas.webp: Original artwork for Crowns of the Frontier.\n';
const escape=s=>s.replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;'),svg=`<svg xmlns="http://www.w3.org/2000/svg"><metadata>${escape(credits)}</metadata>${symbols.join('')}</svg>\n`;fs.mkdirSync(target,{recursive:true});fs.writeFileSync(path.join(target,'icons.svg'),svg);
const allIconIds=[...names,...game.map(i=>i.name),...customSymbols.map(([n])=>n)];
fs.writeFileSync(path.join(target,'icon-manifest.json'),JSON.stringify({lucide:{version,integrity,license:'ISC',source:'https://lucide.dev'},gameIcons:{commit:gameCommit,license:'CC BY 3.0',icons:game},customSymbols:customSymbols.map(([n])=>n),...(paintedAtlas?{paintedAtlas}:{}),icons:allIconIds,spriteSHA256:createHash('sha256').update(svg).digest('hex')},null,2)+'\n');fs.writeFileSync(path.join(root,'public/ICON_LICENSES.txt'),credits);
const castle=inner(files.get('package/icons/castle.svg'));fs.writeFileSync(path.join(root,'public/icon.svg'),`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 192 192"><metadata>${escape(license)}</metadata><rect width="192" height="192" rx="38" fill="#172b23"/><rect x="12" y="12" width="168" height="168" rx="28" fill="none" stroke="#d7bc81" stroke-opacity=".3"/><svg x="36" y="32" width="120" height="120" viewBox="0 0 24 24" fill="none" stroke="#dfc793" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">${castle}</svg></svg>\n`);
console.log(JSON.stringify({passed:true,icons:allIconIds.length,spriteBytes:Buffer.byteLength(svg),paintedAtlasBytes:paintedAtlas?.bytes||0,runtimeDependenciesAdded:0}));
