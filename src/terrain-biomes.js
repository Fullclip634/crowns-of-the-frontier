// Biome authority for both rendering and gameplay. The seven legacy maps keep
// their green meadow identity (save/network compatibility); the new map kinds
// deliver genuinely distinct palettes, relief, vegetation and resources in the
// Age of Empires tradition of clearly readable terrain types.
const styles={
  // Legacy meadow frontier — verified green dominance, do not change.
  highlands:{ground:['#5d864c','#7a9b60','#426c3e'],grassTint:0x97c78b,grass:[0x648c45,0x86a95f,0x507b3c],map:'#567a49',plaza:0x9d998c,cliff:0x86847c},
  valley:{ground:['#57844c','#78a363','#3f6d40'],grassTint:0x94c78b,grass:[0x608d49,0x7fa75c,0x4b793c],map:'#507849',plaza:0x9a988b,cliff:0x82847b},
  rivers:{ground:['#5b874f','#7ba267','#426e40'],grassTint:0x94c58b,grass:[0x618e48,0x80a85f,0x4f7d40],map:'#52794b',plaza:0x98968a,cliff:0x80837a},
  // Retain the legacy map identifier for saved kingdoms and network rooms.
  desert:{ground:['#6a8e4e','#8ca967','#4e793d'],grassTint:0x9bc986,grass:[0x6c9449,0x8eae62,0x567e3e],map:'#60834c',plaza:0xa69d88,cliff:0x8e8878},
  canyon:{ground:['#607f53','#829777','#466c42'],grassTint:0x97bf88,grass:[0x638948,0x86a464,0x4e773e],map:'#5c7951',plaza:0x9e9585,cliff:0x8a8274},
  coast:{ground:['#59884f','#79a36b','#427340'],grassTint:0x96c98a,grass:[0x628f49,0x83aa63,0x4d7b40],map:'#507c4c',plaza:0xa29e90,cliff:0x888980},
  winter:{ground:['#c5d0c3','#e1e3d5','#95ac9a'],grassTint:0xffffff,grass:[0xb7c6a7,0xc6c9aa,0x9cae83],map:'#b8c5b8',plaza:0xb8c2c4,cliff:0x94a0a6},

  // New terrain kinds. Each palette has a different dominant channel so the
  // minimap and the ground read as a different place from the first frame.
  arid:{ground:['#c9a468','#e2c68d','#977a49'],grassTint:0xd6b87c,grass:[0xc3a269,0xd9bc84,0xa18650],map:'#c4a066',plaza:0xcbb183,cliff:0xb38b59,sand:true},
  tundra:{ground:['#c6d5dc','#e7eef1','#93aeb8'],grassTint:0xd9e8ec,grass:[0xb3c8ce,0xd3e1e4,0x8fa9b1],map:'#b7cad2',plaza:0xb5c5cc,cliff:0x8296a1,snow:true},
  volcanic:{ground:['#4c4340','#6d5c52','#2d2928'],grassTint:0x8b8073,grass:[0x6b5d53,0x847266,0x494039],map:'#4e4541',plaza:0x5e5652,cliff:0x4a423e,ash:true},
  highland:{ground:['#84917b','#a8b299','#5d6b5b'],grassTint:0xa8b899,grass:[0x859674,0xa2ae8b,0x687762],map:'#7d8c73',plaza:0x96988e,cliff:0x787b72,rocky:true},
  woodland:{ground:['#3c6540','#5b8250','#26492d'],grassTint:0x79b46c,grass:[0x4a7641,0x699052,0x355934],map:'#3c6238',plaza:0x8d8c7e,cliff:0x6e7368,dense:true},
  riverland:{ground:['#548e88','#83b3a0','#376e68'],grassTint:0x8fc6b4,grass:[0x568e84,0x7fae99,0x3c7067],map:'#568c84',plaza:0x929e98,cliff:0x6d7f7a,lush:true},
  archipelago:{ground:['#b5b489','#d2cca2','#8b9a7d'],grassTint:0xb8c89a,grass:[0xa6b083,0xc5c59b,0x849975],map:'#a8b792',plaza:0xbcb69c,cliff:0x94927e,shore:true},
  ironpass:{ground:['#6e7d63','#929f81','#4d5c49'],grassTint:0x9bb088,grass:[0x6c8258,0x8ca073,0x526546],map:'#6a7b5f',plaza:0x97968a,cliff:0x6d7068,rocky:true},
  blackwood:{ground:['#335938','#4f7546','#203f27'],grassTint:0x6ea862,grass:[0x3e6939,0x5a8148,0x2b4d2c],map:'#325632',plaza:0x868576,cliff:0x63695f,dense:true},
  timbervale:{ground:['#5c8745','#84aa5e','#3b6735'],grassTint:0x97ca80,grass:[0x5d8c42,0x81ab5a,0x457337],map:'#507a40',plaza:0x9a9787,cliff:0x777c72,dense:true},
  bastion:{ground:['#60834f','#82a069','#46693d'],grassTint:0x95c184,grass:[0x628b48,0x81a360,0x4c733c],map:'#597b4c',plaza:0xa29d8f,cliff:0x7e8078,rocky:true},
  ironring:{ground:['#687c5d','#8e9f7d','#485b45'],grassTint:0x99b386,grass:[0x678154,0x8aa172,0x4d6443],map:'#627757',plaza:0x99988d,cliff:0x70736b,rocky:true},
  sunderedpass:{ground:['#628056','#87a174','#436140'],grassTint:0x95b884,grass:[0x608450,0x83a16c,0x47683e],map:'#5b7950',plaza:0x98968b,cliff:0x73766e,rocky:true},
  oakhold:{ground:['#45723c','#6d9652','#2c532e'],grassTint:0x86bc73,grass:[0x4f7e3d,0x739c54,0x396132],map:'#3f6a37',plaza:0x929081,cliff:0x6d7369,dense:true},
  threecrowns:{ground:['#558650','#7ba569','#3c6b41'],grassTint:0x92c48c,grass:[0x5a8c4b,0x7da761,0x467640],map:'#4d7d4d',plaza:0x99988d,cliff:0x7c8078,lush:true},
  emberroad:{ground:['#493f3c','#6b584e','#2a2625'],grassTint:0x887b6e,grass:[0x68594f,0x826f63,0x463d36],map:'#4a403c',plaza:0x5b534f,cliff:0x473f3b,ash:true},
  frostvale:{ground:['#c1d2da','#e4edf1','#8da9b5'],grassTint:0xd6e6ec,grass:[0xafc5cc,0xd0dfe3,0x8ba6ae],map:'#b1c6d0',plaza:0xb3c3ca,cliff:0x7e939e,snow:true},
  // Epic Frontier maps — sunlit AoE:DE emerald meadows, glacial gorges, forest ravines, coral jungle lagoon & Ironfall Pass.
  waterfallgorge:{ground:['#67a148','#96c660','#447c39'],grassTint:0xa8dc88,grass:[0x6ea649,0x97c562,0x4e863c],map:'#599344',plaza:0xaca490,cliff:0x868a7e,lush:true,waterfall:true},
  frostfallsiege:{ground:['#c9dbe6','#eef6fa','#91aebf'],grassTint:0xe2f0f6,grass:[0xbad0d8,0xdcebf0,0x93aeb8],map:'#bcd2dc',plaza:0xbdc9d0,cliff:0x8298a4,snow:true,waterfall:true},
  deepwoodravine:{ground:['#4e853c','#7db054','#32612d'],grassTint:0x95ca74,grass:[0x588e40,0x82b258,0x3c6b32],map:'#477a38',plaza:0x9a9685,cliff:0x787e70,dense:true,rocky:true},
  templelagoon:{ground:['#5ca84e','#95cf66','#387f3d'],grassTint:0x9ae07c,grass:[0x5aa448,0x8bc95c,0x3a7d3a],map:'#4d994c',plaza:0xccb993,cliff:0x7d8a74,jungle:true,shore:true,waterfall:true},
  ironfall:{ground:['#6b9654','#99bd72','#4a7140'],grassTint:0xa6d08a,grass:[0x6b984f,0x95ba6c,0x4f7840],map:'#628d4f',plaza:0xa7a18f,cliff:0x7e8378,rocky:true,waterfall:true},
};
for(const style of Object.values(styles)){Object.freeze(style.ground);Object.freeze(style.grass);Object.freeze(style);}
Object.freeze(styles);

export const LEGACY_MEADOW_MAPS=Object.freeze(['highlands','valley','rivers','desert','canyon','coast']);
export const NEW_BIOME_MAPS=Object.freeze(['arid','tundra','volcanic','highland','woodland','riverland','archipelago']);
export const CLASSIC_TACTICAL_MAPS=Object.freeze(['ironpass','blackwood','timbervale','bastion']);
export const CAMPAIGN_BATTLEFIELD_MAPS=Object.freeze(['ironring','sunderedpass','oakhold','threecrowns','emberroad','frostvale']);
export const EPIC_FRONTIER_MAPS=Object.freeze(['waterfallgorge','frostfallsiege','deepwoodravine','templelagoon','ironfall']);

// Distinct elevation profiles. `cliffs` drives smooth mesas/terraces in the
// shared relief function; `strength` scales the rolling shoulders.
export const BIOME_PROFILES=Object.freeze({
  highlands:Object.freeze({strength:3.15,cliffs:0,wood:1,gold:1,stone:1,food:1}),
  valley:Object.freeze({strength:2.25,cliffs:0,wood:1,gold:1,stone:1,food:1}),
  rivers:Object.freeze({strength:2.1,cliffs:0,wood:1,gold:1,stone:1,food:1}),
  desert:Object.freeze({strength:1.65,cliffs:0,wood:.8,gold:1.2,stone:1.15,food:.9}),
  canyon:Object.freeze({strength:3.95,cliffs:0,wood:.85,gold:1.35,stone:1.5,food:.9}),
  coast:Object.freeze({strength:2.1,cliffs:0,wood:1,gold:1,stone:1,food:1.15}),
  winter:Object.freeze({strength:2.7,cliffs:0,wood:1.6,gold:1,stone:1,food:.8}),
  arid:Object.freeze({strength:1.35,cliffs:.85,wood:.45,gold:1.6,stone:1.45,food:.55}),
  tundra:Object.freeze({strength:2.35,cliffs:.7,wood:1.35,gold:1.05,stone:1.2,food:.7}),
  volcanic:Object.freeze({strength:3.4,cliffs:1.65,wood:.35,gold:1.45,stone:1.85,food:.6}),
  highland:Object.freeze({strength:4.35,cliffs:1.9,wood:.7,gold:1.25,stone:1.7,food:.85}),
  woodland:Object.freeze({strength:2.85,cliffs:.35,wood:1.85,gold:.85,stone:.9,food:1.15}),
  riverland:Object.freeze({strength:2.05,cliffs:.45,wood:1.15,gold:1,stone:1,food:1.35}),
  archipelago:Object.freeze({strength:1.7,cliffs:1.05,wood:.75,gold:1.2,stone:1.1,food:1.3}),
  ironpass:Object.freeze({strength:3.85,cliffs:1.65,wood:.85,gold:1.35,stone:1.6,food:.9}),
  blackwood:Object.freeze({strength:2.35,cliffs:.3,wood:1.95,gold:1.05,stone:1.0,food:1.15}),
  timbervale:Object.freeze({strength:2.25,cliffs:.42,wood:2.15,gold:1.2,stone:1.15,food:1.25}),
  bastion:Object.freeze({strength:2.2,cliffs:.6,wood:1.05,gold:1.25,stone:1.35,food:1.05}),
  ironring:Object.freeze({strength:3.45,cliffs:1.45,wood:1.05,gold:1.4,stone:1.55,food:1.05}),
  sunderedpass:Object.freeze({strength:3.65,cliffs:1.55,wood:1.35,gold:1.3,stone:1.5,food:1.1}),
  oakhold:Object.freeze({strength:2.3,cliffs:.38,wood:2.1,gold:1.15,stone:1.1,food:1.2}),
  threecrowns:Object.freeze({strength:2.2,cliffs:.55,wood:1.15,gold:1.25,stone:1.2,food:1.3}),
  emberroad:Object.freeze({strength:3.5,cliffs:1.7,wood:.4,gold:1.55,stone:1.8,food:.65}),
  frostvale:Object.freeze({strength:2.55,cliffs:.85,wood:1.45,gold:1.15,stone:1.3,food:.85}),
  waterfallgorge:Object.freeze({strength:2.65,cliffs:1.1,wood:1.25,gold:1.25,stone:1.3,food:1.3}),
  frostfallsiege:Object.freeze({strength:2.85,cliffs:1.25,wood:1.45,gold:1.2,stone:1.35,food:.9}),
  deepwoodravine:Object.freeze({strength:2.6,cliffs:1.15,wood:1.95,gold:1.2,stone:1.25,food:1.2}),
  templelagoon:Object.freeze({strength:1.95,cliffs:.95,wood:1.45,gold:1.35,stone:1.2,food:1.45}),
  ironfall:Object.freeze({strength:3.1,cliffs:1.4,wood:1.3,gold:1.45,stone:1.5,food:1.25}),
});

export const TREE_PALETTES=Object.freeze({
  highlands:Object.freeze({leaf:0x4f6d3b,leafDark:0x2f4b2d,trunk:0x63513b,snow:0xe3e9e5,minimap:'#254b30'}),
  valley:Object.freeze({leaf:0x4d6e3c,leafDark:0x2d4a2d,trunk:0x62503a,snow:0xe3e9e5,minimap:'#254b30'}),
  rivers:Object.freeze({leaf:0x4c6e3e,leafDark:0x2c4b2f,trunk:0x61513b,snow:0xe3e9e5,minimap:'#244c31'}),
  desert:Object.freeze({leaf:0x6e8242,leafDark:0x45582d,trunk:0x6c583e,snow:0xe3e9e5,minimap:'#3d5b2d'}),
  canyon:Object.freeze({leaf:0x596d43,leafDark:0x384930,trunk:0x695542,snow:0xe3e9e5,minimap:'#334b31'}),
  coast:Object.freeze({leaf:0x486b42,leafDark:0x2b4933,trunk:0x615342,snow:0xe3e9e5,minimap:'#244a35'}),
  winter:Object.freeze({leaf:0x6b7f6e,leafDark:0x324b40,trunk:0x564c44,snow:0xe8eff0,minimap:'#4a6860'}),
  arid:Object.freeze({leaf:0x8c8748,leafDark:0x57572e,trunk:0x7a6244,snow:0xe3e9e5,minimap:'#6a6735'}),
  tundra:Object.freeze({leaf:0x5c7578,leafDark:0x2d464d,trunk:0x4e4a49,snow:0xdfecf2,minimap:'#45666e'}),
  volcanic:Object.freeze({leaf:0x4f4a3d,leafDark:0x2b2926,trunk:0x342c28,snow:0xd8dde0,minimap:'#312b26'}),
  highland:Object.freeze({leaf:0x54694f,leafDark:0x334536,trunk:0x5d5348,snow:0xe3e9e5,minimap:'#344c3a'}),
  woodland:Object.freeze({leaf:0x395c32,leafDark:0x213d22,trunk:0x524231,snow:0xe3e9e5,minimap:'#1e4224'}),
  riverland:Object.freeze({leaf:0x447548,leafDark:0x285137,trunk:0x5f4e39,snow:0xe3e9e5,minimap:'#24563a'}),
  archipelago:Object.freeze({leaf:0x5e7844,leafDark:0x3a5430,trunk:0x6d5a41,snow:0xe3e9e5,minimap:'#355532'}),
  ironpass:Object.freeze({leaf:0x4b6447,leafDark:0x2c4232,trunk:0x594e43,snow:0xe3e9e5,minimap:'#2f4936'}),
  blackwood:Object.freeze({leaf:0x31542c,leafDark:0x1b361e,trunk:0x4c3d2d,snow:0xe3e9e5,minimap:'#193a1f'}),
  timbervale:Object.freeze({leaf:0x446b33,leafDark:0x234224,trunk:0x5d4c37,snow:0xe3e9e5,minimap:'#1f4424'}),
  bastion:Object.freeze({leaf:0x4c6b3d,leafDark:0x2d492d,trunk:0x604f3a,snow:0xe3e9e5,minimap:'#264930'}),
  ironring:Object.freeze({leaf:0x486444,leafDark:0x29412e,trunk:0x5a4f42,snow:0xe3e9e5,minimap:'#2b4733'}),
  sunderedpass:Object.freeze({leaf:0x47683e,leafDark:0x28452c,trunk:0x5c4d3c,snow:0xe3e9e5,minimap:'#28472e'}),
  oakhold:Object.freeze({leaf:0x3b632f,leafDark:0x1f3d21,trunk:0x544430,snow:0xe3e9e5,minimap:'#1c4021'}),
  threecrowns:Object.freeze({leaf:0x496d3f,leafDark:0x2a4b30,trunk:0x60503b,snow:0xe3e9e5,minimap:'#244b32'}),
  emberroad:Object.freeze({leaf:0x4c473b,leafDark:0x292724,trunk:0x332b27,snow:0xd8dde0,minimap:'#2f2a25'}),
  frostvale:Object.freeze({leaf:0x587276,leafDark:0x2b444b,trunk:0x4d4948,snow:0xdfecf2,minimap:'#42636b'}),
  waterfallgorge:Object.freeze({leaf:0x45743c,leafDark:0x254b2c,trunk:0x5e4d38,snow:0xe3e9e5,minimap:'#234e2e'}),
  frostfallsiege:Object.freeze({leaf:0x557178,leafDark:0x29434b,trunk:0x4b4746,snow:0xe5f0f5,minimap:'#40616b'}),
  deepwoodravine:Object.freeze({leaf:0x355c2e,leafDark:0x1b381f,trunk:0x50402e,snow:0xe3e9e5,minimap:'#1a3d1f'}),
  templelagoon:Object.freeze({leaf:0x3f8838,leafDark:0x1d5428,trunk:0x664e34,snow:0xe3e9e5,minimap:'#1f5c2d'}),
  ironfall:Object.freeze({leaf:0x466b3c,leafDark:0x27462d,trunk:0x5a4c3c,snow:0xe3e9e5,minimap:'#26492f'}),
});

export function terrainBiome(map){return styles[map]||styles.highlands;}
// Unknown/legacy save map ids must keep the original neutral relief strength.
const FALLBACK_PROFILE=Object.freeze({strength:1,cliffs:0,wood:1,gold:1,stone:1,food:1});
export function biomeProfile(map){return BIOME_PROFILES[map]||FALLBACK_PROFILE;}
export function isSnowBiome(map){return map==='winter'||!!styles[map]?.snow;}
export function isVolcanicBiome(map){return !!styles[map]?.ash;}
export function isAridBiome(map){return !!styles[map]?.sand||!!styles[map]?.ash;}
export function isRockyBiome(map){return !!styles[map]?.rocky||!!styles[map]?.ash;}
export function isJungleBiome(map){return !!styles[map]?.jungle;}
export function hasWaterfallBiome(map){return !!styles[map]?.waterfall;}
export function treeBiome(map){return isSnowBiome(map)?'winter':isJungleBiome(map)?'jungle':'highlands';}
export function treePalette(map){return TREE_PALETTES[map]||TREE_PALETTES.highlands;}
