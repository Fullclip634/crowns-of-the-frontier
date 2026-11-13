// Biome authority for both rendering and gameplay. The seven legacy maps keep
// their green meadow identity (save/network compatibility); the new map kinds
// deliver genuinely distinct palettes, relief, vegetation and resources in the
// Age of Empires tradition of clearly readable terrain types.
const styles={
  // Legacy meadow frontier — verified green dominance, do not change.
  highlands:{ground:['#5d864c','#7a9b60','#426c3e'],grassTint:0x97c78b,grass:[0x648c45,0x86a95f,0x507b3c],map:'#567a49'},
  valley:{ground:['#57844c','#78a363','#3f6d40'],grassTint:0x94c78b,grass:[0x608d49,0x7fa75c,0x4b793c],map:'#507849'},
  rivers:{ground:['#5b874f','#7ba267','#426e40'],grassTint:0x94c58b,grass:[0x618e48,0x80a85f,0x4f7d40],map:'#52794b'},
  // Retain the legacy map identifier for saved kingdoms and network rooms.
  desert:{ground:['#6a8e4e','#8ca967','#4e793d'],grassTint:0x9bc986,grass:[0x6c9449,0x8eae62,0x567e3e],map:'#60834c'},
  canyon:{ground:['#607f53','#829777','#466c42'],grassTint:0x97bf88,grass:[0x638948,0x86a464,0x4e773e],map:'#5c7951'},
  coast:{ground:['#59884f','#79a36b','#427340'],grassTint:0x96c98a,grass:[0x628f49,0x83aa63,0x4d7b40],map:'#507c4c'},
  winter:{ground:['#c5d0c3','#e1e3d5','#95ac9a'],grassTint:0xffffff,grass:[0xb7c6a7,0xc6c9aa,0x9cae83],map:'#b8c5b8'},

  // New terrain kinds. Each palette has a different dominant channel so the
  // minimap and the ground read as a different place from the first frame.
  arid:{ground:['#c9a468','#e2c68d','#977a49'],grassTint:0xd6b87c,grass:[0xc3a269,0xd9bc84,0xa18650],map:'#c4a066',sand:true},
  tundra:{ground:['#c6d5dc','#e7eef1','#93aeb8'],grassTint:0xd9e8ec,grass:[0xb3c8ce,0xd3e1e4,0x8fa9b1],map:'#b7cad2',snow:true},
  volcanic:{ground:['#4c4340','#6d5c52','#2d2928'],grassTint:0x8b8073,grass:[0x6b5d53,0x847266,0x494039],map:'#4e4541',ash:true},
  highland:{ground:['#84917b','#a8b299','#5d6b5b'],grassTint:0xa8b899,grass:[0x859674,0xa2ae8b,0x687762],map:'#7d8c73',rocky:true},
  woodland:{ground:['#3c6540','#5b8250','#26492d'],grassTint:0x79b46c,grass:[0x4a7641,0x699052,0x355934],map:'#3c6238',dense:true},
  riverland:{ground:['#548e88','#83b3a0','#376e68'],grassTint:0x8fc6b4,grass:[0x568e84,0x7fae99,0x3c7067],map:'#568c84',lush:true},
  archipelago:{ground:['#b5b489','#d2cca2','#8b9a7d'],grassTint:0xb8c89a,grass:[0xa6b083,0xc5c59b,0x849975],map:'#a8b792',shore:true},
};
for(const style of Object.values(styles)){Object.freeze(style.ground);Object.freeze(style.grass);Object.freeze(style);}
Object.freeze(styles);

export const LEGACY_MEADOW_MAPS=Object.freeze(['highlands','valley','rivers','desert','canyon','coast']);
export const NEW_BIOME_MAPS=Object.freeze(['arid','tundra','volcanic','highland','woodland','riverland','archipelago']);

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
});

export function terrainBiome(map){return styles[map]||styles.highlands;}
// Unknown/legacy save map ids must keep the original neutral relief strength.
const FALLBACK_PROFILE=Object.freeze({strength:1,cliffs:0,wood:1,gold:1,stone:1,food:1});
export function biomeProfile(map){return BIOME_PROFILES[map]||FALLBACK_PROFILE;}
export function isSnowBiome(map){return map==='winter'||!!styles[map]?.snow;}
export function isAridBiome(map){return !!styles[map]?.sand||!!styles[map]?.ash;}
export function isRockyBiome(map){return !!styles[map]?.rocky||!!styles[map]?.ash;}
// Only three authored tree atlases exist; map every kind onto the closest one.
export function treeBiome(map){
  if(isSnowBiome(map))return 'winter';
  // The legacy 'desert' map id owns the authored desert tree atlas; new arid
  // and volcanic world kinds reuse it.
  if(map==='desert'||styles[map]?.sand||styles[map]?.ash)return 'desert';
  return 'highlands';
}
