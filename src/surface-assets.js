import * as THREE from 'three';
import {applyTerrainShading} from './terrain-surface.js';
import surfaceManifest from './assets3d/textures/manifest.json' with {type:'json'};

const files={
  grass:{color:new URL('./assets3d/textures/leafy_grass_color.jpg',import.meta.url).href,normal:new URL('./assets3d/textures/leafy_grass_normal.jpg',import.meta.url).href,arm:new URL('./assets3d/textures/leafy_grass_arm.jpg',import.meta.url).href},
  stone:{color:new URL('./assets3d/textures/medieval_blocks_05_color.jpg',import.meta.url).href,normal:new URL('./assets3d/textures/medieval_blocks_05_normal.jpg',import.meta.url).href,arm:new URL('./assets3d/textures/medieval_blocks_05_arm.jpg',import.meta.url).href},
  wood:{color:new URL('./assets3d/textures/old_wood_floor_color.jpg',import.meta.url).href,normal:new URL('./assets3d/textures/old_wood_floor_normal.jpg',import.meta.url).href,arm:new URL('./assets3d/textures/old_wood_floor_arm.jpg',import.meta.url).href},
  plaster:{color:new URL('./assets3d/textures/painted_plaster_wall_color.jpg',import.meta.url).href,normal:new URL('./assets3d/textures/painted_plaster_wall_normal.jpg',import.meta.url).href,arm:new URL('./assets3d/textures/painted_plaster_wall_arm.jpg',import.meta.url).href},
  soil:{color:new URL('./assets3d/textures/brown_mud_color.jpg',import.meta.url).href,normal:new URL('./assets3d/textures/brown_mud_normal.jpg',import.meta.url).href,arm:new URL('./assets3d/textures/brown_mud_arm.jpg',import.meta.url).href},
  rock:{color:new URL('./assets3d/textures/rocky_terrain_02_color.jpg',import.meta.url).href,normal:new URL('./assets3d/textures/rocky_terrain_02_normal.jpg',import.meta.url).href,arm:new URL('./assets3d/textures/rocky_terrain_02_arm.jpg',import.meta.url).href},
  boulder:{color:new URL('./assets3d/textures/rock_01_color.jpg',import.meta.url).href,normal:new URL('./assets3d/textures/rock_01_normal.jpg',import.meta.url).href,arm:new URL('./assets3d/textures/rock_01_arm.jpg',import.meta.url).href},
};
const cache=new Map(),surfaces={};
async function texture(role,kind){
  const key=role+':'+kind;if(!cache.has(key))cache.set(key,new THREE.TextureLoader().loadAsync(files[role][kind]).then(map=>{
    map.colorSpace=kind==='color'?THREE.SRGBColorSpace:THREE.NoColorSpace;map.wrapS=map.wrapT=THREE.RepeatWrapping;map.flipY=false;map.anisotropy=4;
    (surfaces[role]??={})[kind]=map;return map;
  }).catch(error=>{cache.delete(key);throw error;}));return cache.get(key);
}
export async function loadSurfaceAssets(quality){
  const kinds=quality==='high'?['color','normal','arm']:quality==='medium'?['color','normal']:['color'];
  await Promise.all(Object.keys(files).flatMap(role=>kinds.map(kind=>texture(role,kind))));
  if(quality==='medium')await Promise.all(['stone','wood','plaster'].map(role=>texture(role,'arm')));
}
export function surfaceAssetState(){return {source:'Poly Haven CC0',loaded:[...cache.keys()].length};}

export function applySurfaceMaterials(view){
  const m=view.materials,quality=view.settings.quality;
  const requested=quality==='high'?16:quality==='medium'?8:4,anisotropy=Math.min(requested,view.renderer?.capabilities?.getMaxAnisotropy?.()||4);
  for(const map of new Set([...retainedSurfaceTextures(),...(view.roofMaterials||[]).flatMap(m=>[m.map,m.bumpMap]).filter(Boolean)]))if(map.anisotropy!==anisotropy){map.anisotropy=anisotropy;map.needsUpdate=true;}
  const bind=(material,role,tint)=>{
    const set=surfaces[role];if(!set?.color||!material)return;
    material.map=set.color;material.bumpMap=null;material.color.setHex(tint);
    material.normalMap=quality==='low'?null:set.normal||null;material.normalScale.setScalar(role==='stone'?.45:role==='boulder'?.55:.3);
    material.roughnessMap=quality==='high'||quality==='medium'&&['stone','wood','plaster'].includes(role)?set.arm||null:null;material.roughness=.95;material.needsUpdate=true;
  };
  bind(m.stone,'stone',0xe5e0d4);bind(m.brick,'stone',0xb8947b);
  bind(m.plaster,'plaster',0xe5dbbf);
  bind(m.wood,'wood',0xddd1b9);bind(m.darkwood,'wood',0x988674);bind(m.timberEdge,'wood',0x82715d);
  bind(m.rock,'boulder',0xd8ded8);bind(m.oreRock,'boulder',0x9d9c88);
  view.surfaceDiagnostics={...surfaceAssetState(),anisotropy};view.surfaceQuality=quality;
}

export function applyGroundSurface(material,land,quality){
  const dimension=id=>Math.max(.25,(surfaceManifest.find(asset=>asset.id===id)?.dimensionsMM?.[0]||2000)/1000);
  applyTerrainShading(material,land,quality,surfaces,{grass:dimension('leafy_grass'),soil:dimension('brown_mud'),rock:dimension('rocky_terrain_02')});
}

export function retainedSurfaceTextures(){return new Set(Object.values(surfaces).flatMap(set=>Object.values(set)));}
