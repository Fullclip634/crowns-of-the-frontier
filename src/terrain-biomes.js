const styles={
  highlands:{ground:['#5d864c','#7a9b60','#426c3e'],grassTint:0x97c78b,grass:[0x648c45,0x86a95f,0x507b3c],map:'#567a49'},
  valley:{ground:['#57844c','#78a363','#3f6d40'],grassTint:0x94c78b,grass:[0x608d49,0x7fa75c,0x4b793c],map:'#507849'},
  rivers:{ground:['#5b874f','#7ba267','#426e40'],grassTint:0x94c58b,grass:[0x618e48,0x80a85f,0x4f7d40],map:'#52794b'},
  // Retain the legacy map identifier for saved kingdoms and network rooms.
  desert:{ground:['#6a8e4e','#8ca967','#4e793d'],grassTint:0x9bc986,grass:[0x6c9449,0x8eae62,0x567e3e],map:'#60834c'},
  canyon:{ground:['#607f53','#829777','#466c42'],grassTint:0x97bf88,grass:[0x638948,0x86a464,0x4e773e],map:'#5c7951'},
  coast:{ground:['#59884f','#79a36b','#427340'],grassTint:0x96c98a,grass:[0x628f49,0x83aa63,0x4d7b40],map:'#507c4c'},
  winter:{ground:['#c5d0c3','#e1e3d5','#95ac9a'],grassTint:0xffffff,grass:[0xb7c6a7,0xc6c9aa,0x9cae83],map:'#b8c5b8'},
};
for(const style of Object.values(styles)){Object.freeze(style.ground);Object.freeze(style.grass);Object.freeze(style);}
export function terrainBiome(map){return styles[map]||styles.highlands;}
