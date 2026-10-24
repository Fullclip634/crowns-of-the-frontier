import * as THREE from 'three';
import {applyTerrainShading} from './terrain-surface.js';
import surfaceManifest from './assets3d/textures/manifest.json' with {type:'json'};
import {SurfaceResidency,surfaceKeys,surfacePins} from './surface-residency.js';
import {loadCompressedSurface,surfaceCodecState} from './surface-codecs.js';
import {characterSurfaceKinds} from './character-surfaces.js';

const files={
  grass:{color:new URL('./assets3d/textures/leafy_grass_color.jpg',import.meta.url).href,normal:new URL('./assets3d/textures/leafy_grass_normal.jpg',import.meta.url).href,arm:new URL('./assets3d/textures/leafy_grass_arm.jpg',import.meta.url).href},
  stone:{color:new URL('./assets3d/textures/medieval_blocks_05_color.jpg',import.meta.url).href,normal:new URL('./assets3d/textures/medieval_blocks_05_normal.jpg',import.meta.url).href,arm:new URL('./assets3d/textures/medieval_blocks_05_arm.jpg',import.meta.url).href},
  wood:{color:new URL('./assets3d/textures/old_wood_floor_color.jpg',import.meta.url).href,normal:new URL('./assets3d/textures/old_wood_floor_normal.jpg',import.meta.url).href,arm:new URL('./assets3d/textures/old_wood_floor_arm.jpg',import.meta.url).href},
  plaster:{color:new URL('./assets3d/textures/painted_plaster_wall_color.jpg',import.meta.url).href,normal:new URL('./assets3d/textures/painted_plaster_wall_normal.jpg',import.meta.url).href,arm:new URL('./assets3d/textures/painted_plaster_wall_arm.jpg',import.meta.url).href},
  soil:{color:new URL('./assets3d/textures/brown_mud_color.jpg',import.meta.url).href,normal:new URL('./assets3d/textures/brown_mud_normal.jpg',import.meta.url).href,arm:new URL('./assets3d/textures/brown_mud_arm.jpg',import.meta.url).href},
  rock:{color:new URL('./assets3d/textures/rocky_terrain_02_color.jpg',import.meta.url).href,normal:new URL('./assets3d/textures/rocky_terrain_02_normal.jpg',import.meta.url).href,arm:new URL('./assets3d/textures/rocky_terrain_02_arm.jpg',import.meta.url).href},
  boulder:{color:new URL('./assets3d/textures/rock_01_color.jpg',import.meta.url).href,normal:new URL('./assets3d/textures/rock_01_normal.jpg',import.meta.url).href,arm:new URL('./assets3d/textures/rock_01_arm.jpg',import.meta.url).href},
};
const compressed={
  grass:{color:new URL('./assets3d/textures/ktx2/leafy_grass_color.ktx2',import.meta.url).href,arm:new URL('./assets3d/textures/ktx2/leafy_grass_arm.ktx2',import.meta.url).href},
  stone:{color:new URL('./assets3d/textures/ktx2/medieval_blocks_05_color.ktx2',import.meta.url).href,arm:new URL('./assets3d/textures/ktx2/medieval_blocks_05_arm.ktx2',import.meta.url).href},
  wood:{color:new URL('./assets3d/textures/ktx2/old_wood_floor_color.ktx2',import.meta.url).href,arm:new URL('./assets3d/textures/ktx2/old_wood_floor_arm.ktx2',import.meta.url).href},
  plaster:{color:new URL('./assets3d/textures/ktx2/painted_plaster_wall_color.ktx2',import.meta.url).href,arm:new URL('./assets3d/textures/ktx2/painted_plaster_wall_arm.ktx2',import.meta.url).href},
  soil:{color:new URL('./assets3d/textures/ktx2/brown_mud_color.ktx2',import.meta.url).href,arm:new URL('./assets3d/textures/ktx2/brown_mud_arm.ktx2',import.meta.url).href},
  rock:{color:new URL('./assets3d/textures/ktx2/rocky_terrain_02_color.ktx2',import.meta.url).href,arm:new URL('./assets3d/textures/ktx2/rocky_terrain_02_arm.ktx2',import.meta.url).href},
  boulder:{color:new URL('./assets3d/textures/ktx2/rock_01_color.ktx2',import.meta.url).href,arm:new URL('./assets3d/textures/ktx2/rock_01_arm.ktx2',import.meta.url).href},
};
const characterFiles={color:new URL('./assets3d/characters/character-color.png',import.meta.url).href,normal:new URL('./assets3d/characters/character-normal-roughness.png',import.meta.url).href};
const surfaces={},cache=new SurfaceResidency({loaded(key,map){const [role,kind]=key.split(':');(surfaces[role]??={})[kind]=map;},removed(key,map){const [role,kind]=key.split(':');if(surfaces[role]?.[kind]===map)delete surfaces[role][kind];}});
async function texture(role,kind,renderer){
  return cache.load(role+':'+kind,async()=>{const map=await loadCompressedSurface(compressed[role]?.[kind],renderer)||await new THREE.TextureLoader().loadAsync((role==='character'?characterFiles:files[role])[kind]);
    map.colorSpace=kind==='color'?THREE.SRGBColorSpace:THREE.NoColorSpace;map.wrapS=map.wrapT=THREE.RepeatWrapping;map.flipY=false;map.anisotropy=4;
    if(role==='character'){map.flipY=true;map.wrapS=map.wrapT=THREE.ClampToEdgeWrapping;map.premultiplyAlpha=false;}
    return map;
  });
}
export async function loadSurfaceAssets(quality,renderer){
  const kinds=quality==='high'?['color','normal','arm']:quality==='medium'?['color','normal']:['color'];
  await Promise.all([...Object.keys(files).flatMap(role=>kinds.map(kind=>texture(role,kind,renderer))),...characterSurfaceKinds(quality).map(kind=>texture('character',kind,renderer))]);
  if(quality==='medium')await Promise.all(['stone','wood','plaster'].map(role=>texture(role,'arm',renderer)));
}
export function surfaceAssetState(){const maps=[...cache.textures()];return {source:'Poly Haven CC0',characters:{source:'Original Blender artwork',atlases:Object.keys(surfaces.character||{})},loaded:maps.length,compressed:maps.filter(map=>map.isCompressedTexture).length,compressedMipBytes:maps.reduce((n,map)=>n+(map.isCompressedTexture?map.mipmaps.reduce((sum,mip)=>sum+mip.data.byteLength,0):0),0),...surfaceCodecState()};}
export function characterSurfaceMaps(){return surfaces.character||{};}

export function applySurfaceMaterials(view){
  const m=view.materials,quality=view.settings.quality;
  const requested=quality==='high'?16:quality==='medium'?8:4,anisotropy=Math.min(requested,view.renderer?.getMaxAnisotropy?.()||view.renderer?.capabilities?.getMaxAnisotropy?.()||4);
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
  bind(m.rock,'boulder',0xd8ded8);bind(m.oreRock,'boulder',0xd4a643);
  // The grey boulder albedo hides gold at low detail; preserve its relief while
  // tinting the ore body itself. Gold veins use a separate metallic material.
  if(m.oreRock){m.oreRock.map=null;m.oreRock.roughnessMap=null;m.oreRock.metalness=.3;m.oreRock.roughness=.63;m.oreRock.needsUpdate=true;}
  view.surfaceDiagnostics={...surfaceAssetState(),anisotropy};view.surfaceQuality=quality;
}

export function applyGroundSurface(material,land,quality){
  const dimension=id=>Math.max(.25,(surfaceManifest.find(asset=>asset.id===id)?.dimensionsMM?.[0]||2000)/1000);
  applyTerrainShading(material,land,quality,surfaces,{grass:dimension('leafy_grass'),soil:dimension('brown_mud'),rock:dimension('rocky_terrain_02')});
}

export function retainedSurfaceTextures(){return cache.textures();}
export function trimSurfaceAssets(view){
  const needed=surfaceKeys(view.renderQuality||view.settings.quality,Object.keys(files));
  for(const quality of [view.renderQuality||view.settings.quality,view.graphicsLoading].filter(Boolean))for(const kind of characterSurfaceKinds(quality))needed.add('character:'+kind);
  if(view.graphicsLoading)for(const key of surfaceKeys(view.graphicsLoading,Object.keys(files)))needed.add(key);
  const result=cache.trim(needed,surfacePins(view));view.surfaceDiagnostics={...view.surfaceDiagnostics,...surfaceAssetState(),evicted:result.evicted,pending:result.pending};return result;
}
