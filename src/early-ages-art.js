import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {MeshoptDecoder} from 'three/addons/libs/meshopt_decoder.module.js';
import {canonicalGeometry} from './authored-assets.js';
import {readAssetResponse} from './load-progress.js';

const source=new URL('./assets3d/frontier-early-ages.glb',import.meta.url).href;
let pending=null,loaded=null;

function registerScene(scene){
  const templates=new Map(),geometries=new Set();
  scene.updateMatrixWorld(true);
  scene.traverse(node=>{
    if(node.isMesh&&!geometries.has(node.geometry)){
      canonicalGeometry(node.geometry);
      geometries.add(node.geometry);
    }
    const key=node.userData.assetKey;
    if(key)templates.set(key,node);
  });
  return {templates,geometries};
}

export async function loadEarlyAgeArtwork(){
  if(loaded)return loaded;
  if(!pending)pending=(async()=>{
    const response=await fetch(source);
    if(!response.ok)throw new Error(`Early-age artwork request failed (${response.status}).`);
    const buffer=await readAssetResponse(response,'early-ages','Early age buildings');
    const gltf=await new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).parseAsync(buffer,'');
    loaded=registerScene(gltf.scene);
    return loaded;
  })();
  try{return await pending;}catch(error){pending=null;throw error;}
}

/** Register pre-decoded early-age artwork (used by deterministic Node tests). */
export function registerEarlyAgeArtwork(scene){
  loaded=registerScene(scene);
  return loaded;
}

export function clearEarlyAgeArtwork(){
  loaded=null;pending=null;
}

export function earlyAgeArtworkState(){
  return loaded?{models:loaded.templates.size,geometries:loaded.geometries.size}:null;
}

export function earlyAgeGeometries(){
  return loaded?.geometries||null;
}

/**
 * Resolve the dedicated Age 1 (Frontier), Age 2 (Feudal regional), or
 * Wooden Palisade model key. Castle Age (age 2) and Imperial Age (age 3)
 * always return null so late-game stone architecture stays 100% unchanged.
 */
export function earlyAgeBuildingKey(type,faction='alder',age=0,tier='stone'){
  if((type==='wall'||type==='gate')&&tier==='palisade')return `building:${type}:palisade`;
  if(type==='wall'||type==='gate'||type==='farm')return null;
  if(age===0)return `building:${type}:frontier`;
  if(age===1)return `building:${type}:${faction||'alder'}:1`;
  return null;
}

export function earlyAgeBuildingTemplate(type,faction='alder',age=0,tier='stone'){
  if(!loaded?.templates?.size)return null;
  const key=earlyAgeBuildingKey(type,faction,age,tier);
  if(!key)return null;
  const template=loaded.templates.get(key);
  return template?{key,template}:null;
}
