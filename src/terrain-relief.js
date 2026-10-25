import {terrainNoise} from './terrain-fields.js';

// Broad forms remain readable at every terrain mesh density. Fine shading is
// handled by the existing surface materials rather than extra geometry.
export function terrainRelief(map,x,z,phase){
  const strength={highlands:3.15,canyon:3.95,winter:2.7,valley:2.25,rivers:2.1,coast:2.1,desert:1.65}[map]||1;
  const frequency=map==='canyon'?.85:1,xx=x*frequency,zz=z*frequency,seed=Math.floor(phase*1048576);
  // Keep recognizable rolling forms across the playable interior. Earlier
  // amplitudes read as nearly flat from the normal RTS camera, especially on
  // open meadow maps. These broader shoulders make the land catch light while
  // remaining smooth enough for the existing unit, building and road layouts.
  const broad=terrainNoise(xx*.014+phase*2,zz*.014-phase,seed)*3.45;
  const shoulders=terrainNoise(xx*.032+zz*.012+7,zz*.029-xx*.01-5,seed^0x51d2)*.72;
  // Keep the smallest physical forms wider than Low's larger terrain cells;
  // fine noise belongs in the existing surface textures at that mesh density.
  const detail=terrainNoise(xx*.045-zz*.014-9,zz*.043+xx*.015+13,seed^0x713a)*.09;
  return .8+strength*(broad+shoulders+detail);
}
