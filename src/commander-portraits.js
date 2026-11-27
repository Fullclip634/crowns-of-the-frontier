/**
 * Handcrafted heraldic vector SVG commander portraits for the Campaign World Map
 * Briefing Drawer and in-mission Commander Dialogue Banners.
 * Pure inline SVG (~900 bytes each, zero network fetches, zero GPU cost).
 */
const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

export const COMMANDER_PROFILES=Object.freeze({
  'Marshal Elian':{
    title:'Vanguard Marshal',bg1:'#1d3a44',bg2:'#0e1d23',rim:'#e4c579',accent:'#6bc3d1',
    emblem:'M16 7l3 5h-2v9h-2v-9h-2l3-5z M11 19h10v2H11z',
    silhouette:'M16 11a4.2 4.2 0 1 0 0 8.4a4.2 4.2 0 1 0 0-8.4z M7 28c1.5-5.2 4.8-7.5 9-7.5s7.5 2.3 9 7.5z',
    crest:'M11 8l5-4 5 4v3H11z',
  },
  'Quartermaster Sera':{
    title:'Road Quartermaster',bg1:'#263f31',bg2:'#112018',rim:'#e7c97a',accent:'#9cd68d',
    emblem:'M9 11h14v2H9z M15 8h2v14h-2z',
    silhouette:'M16 11.5a4 4 0 1 0 0 8a4 4 0 1 0 0-8z M7.5 28c1.4-5 4.5-7 8.5-7s7.1 2 8.5 7z',
    crest:'M12 9c2-2 6-2 8 0l-1 3h-6z',
  },
  'Castellan Maera':{
    title:'Keeper of Iron Ridge',bg1:'#343a40',bg2:'#171b20',rim:'#dfb96c',accent:'#c4cdd4',
    emblem:'M10 9h3v3h2V9h2v3h2V9h3v5H10z',
    silhouette:'M16 11.2a4.1 4.1 0 1 0 0 8.2a4.1 4.1 0 1 0 0-8.2z M7 28c1.6-5.2 4.9-7.4 9-7.4s7.4 2.2 9 7.4z',
    crest:'M11 7h2v3h2V7h2v3h2V7h2v4H11z',
  },
  'Keeper Nalin':{
    title:'Shrine Custodian',bg1:'#1d3d3c',bg2:'#0d1e1e',rim:'#f0d484',accent:'#86e2cc',
    emblem:'M16 5l4 6-4 5-4-5z',
    silhouette:'M16 12a3.9 3.9 0 1 0 0 7.8a3.9 3.9 0 1 0 0-7.8z M7.5 28c1.4-4.8 4.4-7 8.5-7s7.1 2.2 8.5 7z',
    crest:'M11 10l5-5 5 5-2 2h-6z',
  },
  'Admiral Iven':{
    title:'Fleet Commander',bg1:'#19324a',bg2:'#0b1724',rim:'#e6c77c',accent:'#7fc8f0',
    emblem:'M16 6v14 M12 10h8 M10 17c1.6 2.8 4 4 6 4s4.4-1.2 6-4',
    silhouette:'M16 11.5a4 4 0 1 0 0 8a4 4 0 1 0 0-8z M7 28c1.6-5 4.8-7.2 9-7.2s7.4 2.2 9 7.2z',
    crest:'M9 10c2.2-2.8 11.8-2.8 14 0l-1.5 2.5h-11z',
  },
  'Warden Ilya':{
    title:'Cinder Pass Warden',bg1:'#4a2820',bg2:'#21100c',rim:'#f0b86c',accent:'#ff9b5e',
    emblem:'M16 5c2.4 2.8 3.6 5.2 2 7.5 1.8-.4 2.6 1 1.6 2.8-1 1.7-2.4 2.4-3.6 2.7-1.2-.3-2.6-1-3.6-2.7-1-1.8-.2-3.2 1.6-2.8-1.6-2.3-.4-4.7 2-7.5z',
    silhouette:'M16 11.5a4 4 0 1 0 0 8a4 4 0 1 0 0-8z M7 28c1.5-5.2 4.8-7.4 9-7.4s7.5 2.2 9 7.4z',
    crest:'M11 9l2-4 3 2.5L19 5l2 4z',
  },
  'Forester Brann':{
    title:'Deepwood Pathfinder',bg1:'#213c26',bg2:'#0f1e12',rim:'#dec278',accent:'#9fd47c',
    emblem:'M16 6l5 8h-3l4 6H10l4-6h-3z',
    silhouette:'M16 11.5a4 4 0 1 0 0 8a4 4 0 1 0 0-8z M7.5 28c1.4-5 4.5-7.2 8.5-7.2s7.1 2.2 8.5 7.2z',
    crest:'M10 11c2-4 10-4 12 0z',
  },
  'Captain Sela':{
    title:'Frostmarch Defender',bg1:'#293d4a',bg2:'#121d26',rim:'#d8e6ee',accent:'#a8d8f0',
    emblem:'M16 6v14 M11 9l10 6 M21 9l-10 6',
    silhouette:'M16 11.2a4.1 4.1 0 1 0 0 8.2a4.1 4.1 0 1 0 0-8.2z M7 28c1.6-5.2 4.8-7.4 9-7.4s7.4 2.2 9 7.4z',
    crest:'M10 10l6-4 6 4v2H10z',
  },
  'Queen Maren':{
    title:'Sovereign of the Frontier',bg1:'#4c222d',bg2:'#210d13',rim:'#f5d67e',accent:'#f5be78',
    emblem:'M9 11l3-5 4 3.5L20 6l3 5v3H9z',
    silhouette:'M16 11.8a3.9 3.9 0 1 0 0 7.8a3.9 3.9 0 1 0 0-7.8z M7.2 28c1.4-5 4.6-7.2 8.8-7.2s7.4 2.2 8.8 7.2z',
    crest:'M9.5 10l2.5-4.5L16 8.5l4-3L22.5 10v2h-13z',
  },
  'Lord Commander Aldric':{
    title:'Warden of the Iron Ring',bg1:'#273b47',bg2:'#101a21',rim:'#f0cf7b',accent:'#8acde0',
    emblem:'M9 8h14v12l-7 5-7-5z',
    silhouette:'M16 11.2a4.1 4.1 0 1 0 0 8.2a4.1 4.1 0 1 0 0-8.2z M7 28c1.6-5.3 4.8-7.5 9-7.5s7.4 2.2 9 7.5z',
    crest:'M10 9h3v-3h6v3h3v3H10z',
  },
  'Marshal Vayne':{
    title:'Pass Garrison Strategist',bg1:'#3b372c',bg2:'#191712',rim:'#e6c678',accent:'#d6b984',
    emblem:'M7 22l9-15 9 15z',
    silhouette:'M16 11.5a4 4 0 1 0 0 8a4 4 0 1 0 0-8z M7.2 28c1.5-5 4.7-7.2 8.8-7.2s7.3 2.2 8.8 7.2z',
    crest:'M11 10l5-5 5 5v2H11z',
  },
  'Lady Isolde':{
    title:'Bannerlord of Oakhold',bg1:'#223f32',bg2:'#0e1d16',rim:'#ebd083',accent:'#92d99b',
    emblem:'M16 6c4 4 6 8 6 12H10c0-4 2-8 6-12z',
    silhouette:'M16 11.6a3.9 3.9 0 1 0 0 7.8a3.9 3.9 0 1 0 0-7.8z M7.4 28c1.5-5 4.6-7.2 8.6-7.2s7.1 2.2 8.6 7.2z',
    crest:'M10 11l3-5 3 3 3-3 3 5z',
  },
  'Marshal Rowan':{
    title:'Warden of Ironfall Sanctuary',bg1:'#213c47',bg2:'#0d1c22',rim:'#f0cf7b',accent:'#7bc4d6',
    emblem:'M10 8h12v11l-6 5-6-5z M16 10v9',
    silhouette:'M16 11.2a4.1 4.1 0 1 0 0 8.2a4.1 4.1 0 1 0 0-8.2z M7 28c1.6-5.2 4.9-7.4 9-7.4s7.4 2.2 9 7.4z',
    crest:'M10 9l6-4 6 4v3H10z',
  },
  'Lady Vaelen':{
    title:'Sunward Gorge Commander',bg1:'#4a361d',bg2:'#20160a',rim:'#f4cf74',accent:'#ffd980',
    emblem:'M16 5l2.5 5.5L24 12l-5.5 2.5L16 20l-2.5-5.5L8 12l5.5-1.5z',
    silhouette:'M16 11.6a3.9 3.9 0 1 0 0 7.8a3.9 3.9 0 1 0 0-7.8z M7.4 28c1.5-5 4.6-7.2 8.6-7.2s7.1 2.2 8.6 7.2z',
    crest:'M9.5 10.5l3-4.5 3.5 3 3.5-3 3 4.5z',
  },
  'Jarl Torin':{
    title:'Lord of Frostfall Bastion',bg1:'#243a4c',bg2:'#0f1a24',rim:'#dcebf4',accent:'#9cd2f0',
    emblem:'M16 6l6 4v8l-6 4-6-4v-8z M12 12h8',
    silhouette:'M16 11.2a4.1 4.1 0 1 0 0 8.2a4.1 4.1 0 1 0 0-8.2z M7 28c1.6-5.2 4.8-7.4 9-7.4s7.4 2.2 9 7.4z',
    crest:'M9 11l3-6 4 3 4-3 3 6z',
  },
  'Forgemaster Borin':{
    title:'Lord of the Anvil',bg1:'#4c2a1a',bg2:'#201009',rim:'#f0b068',accent:'#ff9854',
    emblem:'M10 9h12v5h-4v8h-4v-8h-4z',
    silhouette:'M16 11.2a4.2 4.2 0 1 0 0 8.4a4.2 4.2 0 1 0 0-8.4z M6.8 28c1.7-5.3 5-7.6 9.2-7.6s7.5 2.3 9.2 7.6z',
    crest:'M9 10h14v2.5H9z M12 6h8v4h-8z',
  },
  'Royal Herald':{
    title:'Voice of the Realm',bg1:'#3b3119',bg2:'#1a1408',rim:'#f6d97c',accent:'#ffe699',
    emblem:'M10 11l3-5 3 3 3-3 3 5v3H10z',
    silhouette:'M16 11.4a4 4 0 1 0 0 8a4 4 0 1 0 0-8z M7.4 28c1.5-5 4.6-7.2 8.6-7.2s7.1 2.2 8.6 7.2z',
    crest:'M10 10l2.5-4.5L16 8l3.5-2.5L22 10v2H10z',
  },
});

const ROLE_PROFILES=Object.freeze({
  enemy:{
    title:'Hostile Warlord',bg1:'#4a1e1b',bg2:'#1e0b0a',rim:'#e57869',accent:'#ff9e90',
    emblem:'M9 8l14 14 M23 8L9 22',
    silhouette:'M16 11.2a4.1 4.1 0 1 0 0 8.2a4.1 4.1 0 1 0 0-8.2z M7 28c1.6-5.2 4.9-7.4 9-7.4s7.4 2.2 9 7.4z',
    crest:'M9 11l2.5-5.5L16 9l4.5-3.5L23 11l-2 1.5H11z',
  },
  ally:{
    title:'Allied Commander',bg1:'#1a3e3a',bg2:'#0b1d1b',rim:'#79d9cb',accent:'#9df5e8',
    emblem:'M10 8h12v10l-6 5-6-5z',
    silhouette:'M16 11.4a4 4 0 1 0 0 8a4 4 0 1 0 0-8z M7.4 28c1.5-5 4.6-7.2 8.6-7.2s7.1 2.2 8.6 7.2z',
    crest:'M10 10l6-4.5L22 10v2H10z',
  },
  herald:{
    title:'Royal Herald',bg1:'#3f331a',bg2:'#1a1409',rim:'#f4d378',accent:'#ffe291',
    emblem:'M10 11l3-5 3 3 3-3 3 5v3H10z',
    silhouette:'M16 11.4a4 4 0 1 0 0 8a4 4 0 1 0 0-8z M7.4 28c1.5-5 4.6-7.2 8.6-7.2s7.1 2.2 8.6 7.2z',
    crest:'M10 10l2.5-4.5L16 8l3.5-2.5L22 10v2H10z',
  },
  player:{
    title:'Royal Vanguard',bg1:'#2a3c42',bg2:'#111b1e',rim:'#f2cf78',accent:'#8cd6e6',
    emblem:'M16 5l4 6-4 10-4-10z',
    silhouette:'M16 11.2a4.1 4.1 0 1 0 0 8.2a4.1 4.1 0 1 0 0-8.2z M7 28c1.6-5.2 4.8-7.4 9-7.4s7.4 2.2 9 7.4z',
    crest:'M10 10l6-5 6 5v2H10z',
  },
});

const DEFAULT_PROFILE=Object.freeze({
  title:'Frontier Commander',bg1:'#22382e',bg2:'#101d18',rim:'#e4c579',accent:'#b5d8a8',
  emblem:'M16 6l5 4v6l-5 4-5-4v-6z',
  silhouette:'M16 11.5a4 4 0 1 0 0 8a4 4 0 1 0 0-8z M7.5 28c1.4-5 4.5-7.2 8.5-7.2s7.1 2.2 8.5 7.2z',
  crest:'M11 10l5-4 5 4z',
});

export function commanderProfile(speaker='',role=''){
  return COMMANDER_PROFILES[speaker]||ROLE_PROFILES[role]||DEFAULT_PROFILE;
}

export function commanderPortraitSvg(speaker='',size=42,role=''){
  const p=commanderProfile(speaker,role);
  const gid=`cp-${String(speaker||role||'default').toLowerCase().replace(/[^a-z0-9]+/g,'-')}`;
  return `<svg class="commander-portrait-svg" width="${size}" height="${size}" viewBox="0 0 32 32" role="img" aria-label="${esc(speaker||'Commander')} heraldic portrait">
    <defs>
      <radialGradient id="${gid}" cx="38%" cy="28%" r="72%">
        <stop offset="0%" stop-color="${p.bg1}"/>
        <stop offset="100%" stop-color="${p.bg2}"/>
      </radialGradient>
    </defs>
    <rect x="1" y="1" width="30" height="30" rx="5" fill="url(#${gid})" stroke="${p.rim}" stroke-width="1.4"/>
    <rect x="3.2" y="3.2" width="25.6" height="25.6" rx="3.2" fill="none" stroke="${p.rim}" stroke-opacity=".28" stroke-width=".8"/>
    <path d="${p.emblem}" fill="${p.accent}" fill-opacity=".16" stroke="${p.accent}" stroke-opacity=".26" stroke-width=".9"/>
    <path d="${p.silhouette}" fill="#efe6cf" fill-opacity=".9"/>
    <path d="${p.crest}" fill="${p.rim}"/>
  </svg>`;
}
