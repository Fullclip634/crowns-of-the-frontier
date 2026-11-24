import * as THREE from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {MeshoptDecoder} from 'three/addons/libs/meshopt_decoder.module.js';
import {canonicalGeometry} from './authored-assets.js';
import {readAssetResponse} from './load-progress.js';
import {isAridBiome,isSnowBiome,isVolcanicBiome} from './terrain-biomes.js';

const source=new URL('./assets3d/frontier-biome-art.glb',import.meta.url).href;
let pending=null,loaded=null;

function registerScene(scene){
  const cliffs=new Map(),cliffWalls=new Map(),mountains=new Map(),bushes=new Map(),ruins=new Map(),waystones=new Map(),fallenLogs=new Map(),spires=new Map(),volcanicTrees=new Map();
  scene.updateMatrixWorld(true);
  scene.traverse(node=>{
    if(node.isMesh)canonicalGeometry(node.geometry);
    const key=node.userData.assetKey;
    if(!key)return;
    if(key.startsWith('cliff:')&&node.isMesh){
      cliffs.set(key.slice(6),node.geometry);
    }else if(key.startsWith('cliffwall:')&&node.isMesh){
      cliffWalls.set(key.slice(10),node.geometry);
    }else if(key.startsWith('mountain:')&&node.isMesh){
      mountains.set(key.slice(9),node.geometry);
    }else if(key.startsWith('bush:')&&node.isMesh){
      bushes.set(key.slice(5),node.geometry);
    }else if(key.startsWith('ruin:')&&node.isMesh){
      ruins.set(key.slice(5),node.geometry);
    }else if(key.startsWith('waystone:')&&node.isMesh){
      waystones.set(key.slice(9),node.geometry);
    }else if(key.startsWith('fallenlog:')&&node.isMesh){
      fallenLogs.set(key.slice(10),node.geometry);
    }else if(key.startsWith('spire:')&&node.isMesh){
      spires.set(key.slice(6),node.geometry);
    }else if(key.startsWith('tree:volcanic:')){
      volcanicTrees.set(key,node);
    }
  });
  return {cliffs,cliffWalls,mountains,bushes,ruins,waystones,fallenLogs,spires,volcanicTrees};
}

export async function loadBiomeArtwork(){
  if(loaded)return loaded;
  if(!pending)pending=(async()=>{
    const response=await fetch(source);
    if(!response.ok)throw new Error(`Biome artwork request failed (${response.status}).`);
    const buffer=await readAssetResponse(response,'biome-art','Biome terrain');
    const gltf=await new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).parseAsync(buffer,'');
    loaded=registerScene(gltf.scene);
    return loaded;
  })();
  try{return await pending;}catch(error){pending=null;throw error;}
}

/** Register pre-decoded biome artwork (used by deterministic Node tests). */
export function registerBiomeArtwork(scene){
  loaded=registerScene(scene);
  return loaded;
}

export function clearBiomeArtwork(){
  loaded=null;pending=null;
}

export function biomeCliffGeometry(map){
  if(!loaded?.cliffs?.size)return null;
  const style=isVolcanicBiome(map)?'volcanic':(isAridBiome(map)||['desert','canyon'].includes(map))?'arid':'meadow';
  const geo=loaded.cliffs.get(style)||loaded.cliffs.get('meadow');
  return geo?geo.clone():null;
}

export function biomeCliffWallGeometry(map){
  if(!loaded?.cliffWalls?.size)return null;
  const style=isVolcanicBiome(map)?'volcanic':isSnowBiome(map)?'snow':(isAridBiome(map)||map==='desert')?'arid':'meadow';
  const geo=loaded.cliffWalls.get(style)||loaded.cliffWalls.get('meadow');
  return geo?geo.clone():null;
}

export function biomeMountainGeometry(map){
  if(!loaded?.mountains?.size)return null;
  const style=isVolcanicBiome(map)?'volcanic':isSnowBiome(map)?'snow':'meadow';
  const geo=loaded.mountains.get(style)||loaded.mountains.get('meadow');
  return geo?geo.clone():null;
}

export function biomeBushGeometry(map){
  if(!loaded?.bushes?.size)return null;
  const style=isSnowBiome(map)?'snow':(isAridBiome(map)||map==='desert')?'arid':'meadow';
  const geo=loaded.bushes.get(style)||loaded.bushes.get('meadow');
  return geo?geo.clone():null;
}

function landmarkStyle(map){
  return isVolcanicBiome(map)?'volcanic':isSnowBiome(map)?'snow':(isAridBiome(map)||map==='desert')?'arid':'meadow';
}

export function biomeRuinGeometry(map){
  if(!loaded?.ruins?.size)return null;
  const geo=loaded.ruins.get(landmarkStyle(map))||loaded.ruins.get('meadow');
  return geo?geo.clone():null;
}

export function biomeWaystoneGeometry(map){
  if(!loaded?.waystones?.size)return null;
  const geo=loaded.waystones.get(landmarkStyle(map))||loaded.waystones.get('meadow');
  return geo?geo.clone():null;
}

export function biomeFallenLogGeometry(map){
  if(!loaded?.fallenLogs?.size)return null;
  if(isVolcanicBiome(map)||isAridBiome(map))return null;
  const style=isSnowBiome(map)?'snow':'meadow';
  const geo=loaded.fallenLogs.get(style)||loaded.fallenLogs.get('meadow');
  return geo?geo.clone():null;
}

export function biomeSpireGeometry(map){
  if(!loaded?.spires?.size)return null;
  const geo=loaded.spires.get(landmarkStyle(map))||loaded.spires.get('meadow');
  return geo?geo.clone():null;
}

export function biomeVolcanicTreeModel(view,variant=0,far=false){
  if(!loaded?.volcanicTrees?.size)return null;
  const key=`tree:volcanic:${((variant%4)+4)%4}:${far?'far':'near'}`;
  const template=loaded.volcanicTrees.get(key);
  if(!template)return null;
  const clone=template.clone(true),m=view.materials;
  clone.traverse(part=>{
    if(!part.isMesh)return;
    const role=part.userData.assetMaterial;
    if(role==='glow'&&m.glow)part.material=m.glow;
    else if(m.trunk)part.material=m.trunk;
    else if(m.wood)part.material=m.wood;
  });
  return clone;
}
