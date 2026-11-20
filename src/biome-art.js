import * as THREE from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {MeshoptDecoder} from 'three/addons/libs/meshopt_decoder.module.js';
import {canonicalGeometry} from './authored-assets.js';
import {readAssetResponse} from './load-progress.js';
import {isAridBiome} from './terrain-biomes.js';

const source=new URL('./assets3d/frontier-biome-art.glb',import.meta.url).href;
let pending=null,loaded=null;

function registerScene(scene){
  const cliffs=new Map(),volcanicTrees=new Map();
  scene.updateMatrixWorld(true);
  scene.traverse(node=>{
    if(node.isMesh)canonicalGeometry(node.geometry);
    const key=node.userData.assetKey;
    if(!key)return;
    if(key.startsWith('cliff:')&&node.isMesh){
      cliffs.set(key.slice(6),node.geometry);
    }else if(key.startsWith('tree:volcanic:')){
      volcanicTrees.set(key,node);
    }
  });
  return {cliffs,volcanicTrees};
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
  const style=map==='volcanic'?'volcanic':(isAridBiome(map)||['desert','canyon'].includes(map))?'arid':'meadow';
  const geo=loaded.cliffs.get(style)||loaded.cliffs.get('meadow');
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
