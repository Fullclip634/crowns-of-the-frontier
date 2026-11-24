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
export function earlyAgeBuildingKey(type,faction='alder',age=0,tier='stone',corner=false){
  if(type==='wall'&&corner)return `building:wallcorner:${tier}`;
  if((type==='wall'||type==='gate')&&tier==='palisade')return `building:${type}:palisade`;
  if(type==='wall'||type==='gate'||type==='farm')return null;
  if(age===0)return `building:${type}:frontier`;
  const artFaction=faction==='iron'?'alder':(faction||'alder');
  if(age===1)return `building:${type}:${artFaction}:1`;
  return null;
}

/**
 * Uniform world-scale calibration for dedicated Age 1 (Frontier) and Age 2
 * (Feudal) GLB models so they fill their gameplay footprints (2*r) and stand
 * properly taller than soldiers & cavalry while preserving Age 1 < Age 2 < Age 3
 * progression and 100% undistorted roof pitches, beams, and mill blades.
 */
const EARLY_AGE_SCALES=Object.freeze({
  0:Object.freeze({
    towncenter:1.36,house:1.24,barracks:1.18,mill:1.28,camp:1.24,mine:1.24,dock:1.20,
  }),
  1:Object.freeze({
    towncenter:1.40,house:1.32,barracks:1.30,mill:1.32,camp:1.24,mine:1.26,
    range:1.34,stable:1.32,blacksmith:1.28,market:1.28,tower:1.18,dock:1.20,
  }),
});

export function earlyAgeBuildingScale(type,age=0){
  if(type==='wall'||type==='gate'||type==='farm')return 1;
  return EARLY_AGE_SCALES[age]?.[type]??1;
}

export function earlyAgeBuildingTemplate(type,faction='alder',age=0,tier='stone',corner=false){
  if(!loaded?.templates?.size)return null;
  const key=earlyAgeBuildingKey(type,faction,age,tier,corner);
  if(!key)return null;
  const template=loaded.templates.get(key);
  return template?{key,template,scale:earlyAgeBuildingScale(type,age)}:null;
}
