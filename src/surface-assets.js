import * as THREE from 'three';
import {applyTerrainShading} from './terrain-surface.js';
import surfaceManifest from './assets3d/textures/manifest.json' with {type:'json'};
import {SurfaceResidency,surfaceKeys,surfacePins} from './surface-residency.js';
import {loadCompressedSurface,surfaceCodecState} from './surface-codecs.js';
import {characterSurfaceKinds} from './character-surfaces.js';
import {ensureAtmosphereUniforms,applyAnalyticIblToMaterial} from './atmosphere-uniforms.js';
import {isSnowBiome} from './terrain-biomes.js';
import {nodeRuntime} from './render-runtime.js';

const files={
  grass:{color:new URL('./assets3d/textures/leafy_grass_color.jpg',import.meta.url).href,normal:new URL('./assets3d/textures/leafy_grass_normal.jpg',import.meta.url).href,arm:new URL('./assets3d/textures/leafy_grass_arm.jpg',import.meta.url).href},
  stone:{color:new URL('./assets3d/textures/medieval_blocks_05_color.jpg',import.meta.url).href,normal:new URL('./assets3d/textures/medieval_blocks_05_normal.jpg',import.meta.url).href,arm:new URL('./assets3d/textures/medieval_blocks_05_arm.jpg',import.meta.url).href},
  wood:{color:new URL('./assets3d/textures/old_wood_floor_color.jpg',import.meta.url).href,normal:new URL('./assets3d/textures/old_wood_floor_normal.jpg',import.meta.url).href,arm:new URL('./assets3d/textures/old_wood_floor_arm.jpg',import.meta.url).href},
  plaster:{color:new URL('./assets3d/textures/painted_plaster_wall_color.jpg',import.meta.url).href,normal:new URL('./assets3d/textures/painted_plaster_wall_normal.jpg',import.meta.url).href,arm:new URL('./assets3d/textures/painted_plaster_wall_arm.jpg',import.meta.url).href},
  soil:{color:new URL('./assets3d/textures/brown_mud_color.jpg',import.meta.url).href,normal:new URL('./assets3d/textures/brown_mud_normal.jpg',import.meta.url).href,arm:new URL('./assets3d/textures/brown_mud_arm.jpg',import.meta.url).href},
  rock:{color:new URL('./assets3d/textures/rocky_terrain_02_color.jpg',import.meta.url).href,normal:new URL('./assets3d/textures/rocky_terrain_02_normal.jpg',import.meta.url).href,arm:new URL('./assets3d/textures/rocky_terrain_02_arm.jpg',import.meta.url).href},
  boulder:{color:new URL('./assets3d/textures/rock_01_color.jpg',import.meta.url).href,normal:new URL('./assets3d/textures/rock_01_normal.jpg',import.meta.url).href,arm:new URL('./assets3d/textures/rock_01_arm.jpg',import.meta.url).href},
  snow:{color:new URL('./assets3d/textures/snow_02_color.jpg',import.meta.url).href,normal:new URL('./assets3d/textures/snow_02_normal.jpg',import.meta.url).href,arm:new URL('./assets3d/textures/snow_02_arm.jpg',import.meta.url).href},
  sand:{color:new URL('./assets3d/textures/sand_01_color.jpg',import.meta.url).href,normal:new URL('./assets3d/textures/sand_01_normal.jpg',import.meta.url).href,arm:new URL('./assets3d/textures/sand_01_arm.jpg',import.meta.url).href},
  volcanic:{color:new URL('./assets3d/textures/rock_face_03_color.jpg',import.meta.url).href,normal:new URL('./assets3d/textures/rock_face_03_normal.jpg',import.meta.url).href,arm:new URL('./assets3d/textures/rock_face_03_arm.jpg',import.meta.url).href},
  roof:{color:new URL('./assets3d/textures/roof_slates_02_color.jpg',import.meta.url).href,normal:new URL('./assets3d/textures/roof_slates_02_normal.jpg',import.meta.url).href,arm:new URL('./assets3d/textures/roof_slates_02_arm.jpg',import.meta.url).href},
};
const compressed={
  grass:{color:new URL('./assets3d/textures/ktx2/leafy_grass_color.ktx2',import.meta.url).href,arm:new URL('./assets3d/textures/ktx2/leafy_grass_arm.ktx2',import.meta.url).href},
  stone:{color:new URL('./assets3d/textures/ktx2/medieval_blocks_05_color.ktx2',import.meta.url).href,arm:new URL('./assets3d/textures/ktx2/medieval_blocks_05_arm.ktx2',import.meta.url).href},
  wood:{color:new URL('./assets3d/textures/ktx2/old_wood_floor_color.ktx2',import.meta.url).href,arm:new URL('./assets3d/textures/ktx2/old_wood_floor_arm.ktx2',import.meta.url).href},
  plaster:{color:new URL('./assets3d/textures/ktx2/painted_plaster_wall_color.ktx2',import.meta.url).href,arm:new URL('./assets3d/textures/ktx2/painted_plaster_wall_arm.ktx2',import.meta.url).href},
  soil:{color:new URL('./assets3d/textures/ktx2/brown_mud_color.ktx2',import.meta.url).href,arm:new URL('./assets3d/textures/ktx2/brown_mud_arm.ktx2',import.meta.url).href},
  rock:{color:new URL('./assets3d/textures/ktx2/rocky_terrain_02_color.ktx2',import.meta.url).href,arm:new URL('./assets3d/textures/ktx2/rocky_terrain_02_arm.ktx2',import.meta.url).href},
  boulder:{color:new URL('./assets3d/textures/ktx2/rock_01_color.ktx2',import.meta.url).href,arm:new URL('./assets3d/textures/ktx2/rock_01_arm.ktx2',import.meta.url).href},
  snow:{color:new URL('./assets3d/textures/ktx2/snow_02_color.ktx2',import.meta.url).href,arm:new URL('./assets3d/textures/ktx2/snow_02_arm.ktx2',import.meta.url).href},
  sand:{color:new URL('./assets3d/textures/ktx2/sand_01_color.ktx2',import.meta.url).href,arm:new URL('./assets3d/textures/ktx2/sand_01_arm.ktx2',import.meta.url).href},
  volcanic:{color:new URL('./assets3d/textures/ktx2/rock_face_03_color.ktx2',import.meta.url).href,arm:new URL('./assets3d/textures/ktx2/rock_face_03_arm.ktx2',import.meta.url).href},
  roof:{color:new URL('./assets3d/textures/ktx2/roof_slates_02_color.ktx2',import.meta.url).href,arm:new URL('./assets3d/textures/ktx2/roof_slates_02_arm.ktx2',import.meta.url).href},
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
const SHARED_SURFACE_ROLES=Object.freeze(['stone','wood','plaster','boulder','roof']);
const ALL_SURFACE_ROLES=Object.freeze(Object.keys(files));
function mapSurfaceSelection(map){
  const name=map||'highlands',snow=isSnowBiome(name),arid=name==='arid',volcanic=name==='volcanic',shore=name==='coast'||name==='archipelago',crag=name==='highland'||name==='canyon'||snow||arid||volcanic;
  return {
    primaryRole:snow?'snow':arid?'sand':volcanic?'volcanic':'grass',
    soilRole:shore?'sand':'soil',
    rockRole:crag?'volcanic':'rock',
  };
}
export function surfaceRolesForMap(map){
  if(!map)return [...ALL_SURFACE_ROLES];
  const {primaryRole,soilRole,rockRole}=mapSurfaceSelection(map);
  return [...new Set([...SHARED_SURFACE_ROLES,primaryRole,soilRole,rockRole])];
}
export function hasSurfaceAssetsForMap(quality,map){
  const roles=surfaceRolesForMap(map),keys=surfaceKeys(quality,roles);
  for(const kind of characterSurfaceKinds(quality))keys.add('character:'+kind);
  for(const key of keys){
    const [role,kind]=key.split(':');
    if(!surfaces[role]?.[kind])return false;
  }
  return true;
}
export async function loadSurfaceAssets(quality,renderer,options={}){
  const roles=options?.map?surfaceRolesForMap(options.map):ALL_SURFACE_ROLES;
  const keys=surfaceKeys(quality,roles);
  for(const kind of characterSurfaceKinds(quality))keys.add('character:'+kind);
  // Wait for every map to settle so cached color textures still register if an
  // optional detail map fails offline on Medium/High.
  const results=await Promise.allSettled(Array.from(keys,key=>{
    const [role,kind]=key.split(':');
    return texture(role,kind,renderer);
  }));
  const failed=results.find(result=>result.status==='rejected');
  if(failed)throw failed.reason;
}
export function surfaceAssetState(){const maps=[...cache.textures()];return {source:'Poly Haven CC0',characters:{source:'Original Blender artwork',atlases:Object.keys(surfaces.character||{})},loaded:maps.length,compressed:maps.filter(map=>map.isCompressedTexture).length,compressedMipBytes:maps.reduce((n,map)=>n+(map.isCompressedTexture?map.mipmaps.reduce((sum,mip)=>sum+mip.data.byteLength,0):0),0),...surfaceCodecState()};}
export function characterSurfaceMaps(){return surfaces.character||{};}
export function roofSurfaceMaps(){return surfaces.roof||{};}

function applyCoolAshlarStone(material){
  if(!material||material.userData?.coolAshlarStone)return;
  material.userData={...material.userData,coolAshlarStone:true};
  if(material.isNodeMaterial){
    nodeRuntime()?.coolAshlarStone?.(material);
    return;
  }
  const previousCompile=material.onBeforeCompile;
  material.onBeforeCompile=(shader,renderer)=>{
    if(previousCompile)previousCompile(shader,renderer);
    shader.fragmentShader=shader.fragmentShader.replace('#include <map_fragment>',`#include <map_fragment>
      {
        #ifdef USE_INSTANCING_COLOR
          float frontierSilver = smoothstep(0.02, 0.07, vColor.b - vColor.r);
        #else
          float frontierSilver = 0.0;
        #endif
        float frontierStoneLuma = dot(diffuseColor.rgb, vec3(0.30, 0.59, 0.11));
        vec3 frontierWarmStone = diffuseColor.rgb * vec3(1.06, 0.96, 0.84);
        vec3 frontierSilverStone = mix(diffuseColor.rgb, vec3(frontierStoneLuma * 1.28, frontierStoneLuma * 1.30, frontierStoneLuma * 1.34), 0.76) * vec3(0.96, 0.98, 1.02);
        diffuseColor.rgb = mix(frontierWarmStone, frontierSilverStone, frontierSilver);
      }`);
  };
  const previousKey=material.customProgramCacheKey;
  material.customProgramCacheKey=()=>`${previousKey?previousKey.call(material):'standard'}-cool-ashlar-v2`;
  material.needsUpdate=true;
}

export function applySurfaceMaterials(view){
  const m=view.materials,quality=view.settings.quality;
  const requested=quality==='high'?16:quality==='medium'?8:4,anisotropy=Math.min(requested,view.renderer?.getMaxAnisotropy?.()||view.renderer?.capabilities?.getMaxAnisotropy?.()||4);
  for(const map of new Set([...retainedSurfaceTextures(),...(view.roofMaterials||[]).flatMap(m=>[m.map,m.bumpMap]).filter(Boolean)]))if(map.anisotropy!==anisotropy){map.anisotropy=anisotropy;map.needsUpdate=true;}
  const bind=(material,role,tint,{albedo=true,roughnessMap=true,metalness=0,roughness=.95}={})=>{
    const set=surfaces[role];if(!set?.color||!material)return;
    const nextMap=albedo?set.color:null,nextBump=null,nextNormal=quality==='low'?null:set.normal||null;
    const nextRough=roughnessMap&&(quality==='high'||quality==='medium'&&['stone','wood','plaster'].includes(role))?set.arm||null:null;
    const structureChanged=material.map!==nextMap||material.bumpMap!==nextBump||material.normalMap!==nextNormal||material.roughnessMap!==nextRough||Boolean(material.metalness)!==Boolean(metalness);
    material.map=nextMap;material.bumpMap=nextBump;material.color.setHex(tint);
    material.normalMap=nextNormal;material.normalScale.setScalar(role==='stone'?.45:role==='boulder'?.55:.3);
    material.roughnessMap=nextRough;material.metalness=metalness;material.roughness=roughness;
    if(structureChanged)material.needsUpdate=true;
  };
  bind(m.stone,'stone',0xe5e0d4);bind(m.brick,'stone',0xb8947b);
  applyCoolAshlarStone(m.stone);applyCoolAshlarStone(m.stoneDark);
  bind(m.plaster,'plaster',0xe8dec3);
  bind(m.wood,'wood',0xe4d7bf);bind(m.darkwood,'wood',0xb09c84);bind(m.timberEdge,'wood',0x9c8770);
  bind(m.rock,'boulder',0xd8ded8);
  // Dark granite-slate host rock contrasts cleanly against inlaid metallic gold
  // veins without crushing boulder albedo into flat charcoal black.
  bind(m.oreRock,'boulder',0x969188,{metalness:.08,roughness:.84});
  const atm=ensureAtmosphereUniforms(view);
  for(const key of ['rock','oreRock','gold','iron'])applyAnalyticIblToMaterial(m[key],atm);
  view.surfaceDiagnostics={...surfaceAssetState(),anisotropy};view.surfaceQuality=quality;
}

export function applyGroundSurface(material,land,quality,atmosphere=null){
  const dimension=id=>Math.max(.25,(surfaceManifest.find(asset=>asset.id===id)?.dimensionsMM?.[0]||2000)/1000);
  const selected=mapSurfaceSelection(land?.map);
  const primaryRole=surfaces[selected.primaryRole]?.color?selected.primaryRole:'grass';
  const soilRole=surfaces[selected.soilRole]?.color?selected.soilRole:'soil';
  const rockRole=surfaces[selected.rockRole]?.color?selected.rockRole:'rock';
  const idFor={grass:'leafy_grass',soil:'brown_mud',rock:'rocky_terrain_02',snow:'snow_02',sand:'sand_01',volcanic:'rock_face_03',stone:'medieval_blocks_05'};
  const biomeSurfaces={
    grass:surfaces[primaryRole]||surfaces.grass,
    soil:surfaces[soilRole]||surfaces.soil,
    rock:surfaces[rockRole]||surfaces.rock,
    paving:surfaces.stone||surfaces.rock,
  };
  const dims={
    grass:dimension(idFor[primaryRole]),
    soil:dimension(idFor[soilRole]),
    rock:rockRole==='volcanic'?Math.max(48,dimension('rock_face_03')*24):dimension('rocky_terrain_02'),
    paving:dimension('medieval_blocks_05'),
  };
  applyTerrainShading(material,land,quality,biomeSurfaces,dims,atmosphere);
}

export function retainedSurfaceTextures(){return cache.textures();}
export function trimSurfaceAssets(view){
  const map=view?.sim?.options?.map||null;
  const roles=map?surfaceRolesForMap(map):ALL_SURFACE_ROLES;
  const activeQuality=view.renderQuality||view.settings.quality;
  const needed=surfaceKeys(activeQuality,roles);
  for(const quality of [activeQuality,view.graphicsLoading].filter(Boolean))for(const kind of characterSurfaceKinds(quality))needed.add('character:'+kind);
  if(view.graphicsLoading)for(const key of surfaceKeys(view.graphicsLoading,roles))needed.add(key);
  const result=cache.trim(needed,surfacePins(view));view.surfaceDiagnostics={...view.surfaceDiagnostics,...surfaceAssetState(),evicted:result.evicted,pending:result.pending};return result;
}
