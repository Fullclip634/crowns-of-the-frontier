import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {MeshoptDecoder} from 'three/addons/libs/meshopt_decoder.module.js';
import {canonicalGeometry} from './authored-assets.js';
import {earlyAgeBuildingScale} from './early-ages-art.js';
import {readAssetResponse} from './load-progress.js';

const source=new URL('./assets3d/frontier-ironhold.glb',import.meta.url).href;
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

export async function loadIronholdArtwork(){
  if(loaded)return loaded;
  if(!pending)pending=(async()=>{
    const response=await fetch(source);
    if(!response.ok)throw new Error(`Ironhold artwork request failed (${response.status}).`);
    const buffer=await readAssetResponse(response,'ironhold','Ironhold Vanguard models');
    const gltf=await new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).parseAsync(buffer,'');
    loaded=registerScene(gltf.scene);
    return loaded;
  })();
  try{return await pending;}catch(error){pending=null;throw error;}
}

/** Register pre-decoded Ironhold artwork (used by deterministic Node tests). */
export function registerIronholdArtwork(scene){
  loaded=registerScene(scene);
  return loaded;
}

export function clearIronholdArtwork(){
  loaded=null;pending=null;
}

export function ironholdArtworkState(){
  return loaded?{models:loaded.templates.size,geometries:loaded.geometries.size}:null;
}

export function hasIronholdArtwork(){
  return Boolean(loaded?.templates?.size);
}

export function ironholdGeometries(){
  return loaded?.geometries||null;
}

export function ironholdUnitTemplate(type){
  if(!loaded?.templates?.size)return null;
  const key=`unit:${type}`;
  const template=loaded.templates.get(key);
  return template?{key,template}:null;
}

export function ironholdBuildingKey(type,age=0){
  if(type==='wall'||type==='gate'||type==='farm'||age===0)return null;
  if(age===1)return `building:${type}:iron:1`;
  if(type==='towncenter')return `building:towncenter:iron:${Math.max(2,Math.min(3,age))}`;
  return `building:${type}:iron:0`;
}

export function ironholdBuildingTemplate(type,age=0){
  if(!loaded?.templates?.size)return null;
  const key=ironholdBuildingKey(type,age);
  if(!key)return null;
  const template=loaded.templates.get(key);
  if(!template)return null;
  const feudal=age===1;
  return {key,template,feudal,scale:feudal?earlyAgeBuildingScale(type,1):1};
}
