import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {MeshoptDecoder} from 'three/addons/libs/meshopt_decoder.module.js';
import {canonicalGeometry} from './authored-assets.js';
import {readAssetResponse} from './load-progress.js';

const source=new URL('./assets3d/frontier-tactical-depth.glb',import.meta.url).href;
let pending=null,loaded=null;

const TACTICAL_UNITS=new Set(['skirmisher','catapult']);
const TACTICAL_BUILDINGS=new Set(['bombard']);

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

export async function loadTacticalDepthArtwork(){
  if(loaded)return loaded;
  if(!pending)pending=(async()=>{
    const response=await fetch(source);
    if(!response.ok)throw new Error(`Tactical depth artwork request failed (${response.status}).`);
    const buffer=await readAssetResponse(response,'tactical-depth','Tactical siege & fortifications');
    const gltf=await new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).parseAsync(buffer,'');
    loaded=registerScene(gltf.scene);
    return loaded;
  })();
  try{return await pending;}catch(error){pending=null;throw error;}
}

export function registerTacticalDepthArtwork(scene){
  loaded=registerScene(scene);
  return loaded;
}

export function clearTacticalDepthArtwork(){
  loaded=null;pending=null;
}

export function tacticalDepthArtworkState(){
  return loaded?{models:loaded.templates.size,geometries:loaded.geometries.size}:null;
}

export function tacticalDepthGeometries(){
  return loaded?.geometries||null;
}

export function tacticalDepthUnitTemplate(type){
  if(!loaded?.templates?.size||!TACTICAL_UNITS.has(type))return null;
  const key=`unit:${type}`;
  const template=loaded.templates.get(key);
  return template?{key,template}:null;
}

export function tacticalDepthBuildingTemplate(type){
  if(!loaded?.templates?.size||!TACTICAL_BUILDINGS.has(type))return null;
  const key=`building:${type}`;
  const template=loaded.templates.get(key);
  return template?{key,template}:null;
}
