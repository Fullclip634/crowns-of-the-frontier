// Broad forms remain readable at every terrain mesh density. Fine shading is
// handled by the existing surface materials rather than extra geometry.
export function terrainRelief(map,x,z,phase){
  const strength={highlands:3.15,canyon:4.1,winter:2.7,valley:2.25,rivers:2.1,coast:2.1,desert:1.65}[map]||1;
  const rolling=Math.sin(x*.043+phase)*Math.cos(z*.036-phase)*1.15;
  const shoulders=Math.sin(x*.082+z*.051+phase)*.27;
  const broad=Math.sin(x*.019+phase*2)*Math.sin(z*.017-phase)*.65;
  return .8+strength*(rolling+shoulders+broad);
}
