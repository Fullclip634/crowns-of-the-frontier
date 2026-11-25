import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {MeshoptDecoder} from 'three/addons/libs/meshopt_decoder.module.js';
import {canonicalGeometry} from './authored-assets.js';
import {earlyAgeBuildingScale} from './early-ages-art.js';
import {readAssetResponse} from './load-progress.js';

const source=new URL('./assets3d/frontier-jade-heroes.glb',import.meta.url).href;
let pending=null,loaded=null;

const JADE_BUILDINGS=new Set([
  'towncenter','house','barracks','range','stable','workshop',
  'blacksmith','market','monastery','mill','camp','mine',
  'tower','keep','wonder','dock',
]);

const SPECIAL_UNITS=new Set([
  'chukonu','firelancer','trebuchet',
  'hero_alder','hero_sun','hero_raven','hero_iron','hero_jade',
]);

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

export async function loadJadeHeroesArtwork(){
  if(loaded)return loaded;
  if(!pending)pending=(async()=>{
    const response=await fetch(source);
    if(!response.ok)throw new Error(`Jade & Heroes artwork request failed (${response.status}).`);
    const buffer=await readAssetResponse(response,'jade-heroes','Jade Empire, Heroes & Trebuchet');
    const gltf=await new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).parseAsync(buffer,'');
    loaded=registerScene(gltf.scene);
    return loaded;
  })();
  try{return await pending;}catch(error){pending=null;throw error;}
}

export function registerJadeHeroesArtwork(scene){
  loaded=registerScene(scene);
  return loaded;
}

export function clearJadeHeroesArtwork(){
  loaded=null;pending=null;
}

export function jadeHeroesArtworkState(){
  return loaded?{models:loaded.templates.size,geometries:loaded.geometries.size}:null;
}

export function jadeHeroesGeometries(){
  return loaded?.geometries||null;
}

export function jadeHeroesUnitTemplate(type){
  if(!loaded?.templates?.size||!SPECIAL_UNITS.has(type))return null;
  const key=`unit:${type}`;
  const template=loaded.templates.get(key);
  return template?{key,template}:null;
}

export function jadeBuildingKey(type,age=0){
  if(!JADE_BUILDINGS.has(type)||age===0)return null;
  if(age===1)return `building:${type}:jade:1`;
  if(type==='towncenter')return `building:towncenter:jade:${Math.max(2,Math.min(3,age))}`;
  return `building:${type}:jade:0`;
}

export function jadeBuildingTemplate(type,age=0){
  if(!loaded?.templates?.size)return null;
  const key=jadeBuildingKey(type,age);
  if(!key)return null;
  const template=loaded.templates.get(key);
  if(!template)return null;
  const feudal=age===1;
  return {key,template,feudal,scale:feudal?earlyAgeBuildingScale(type,1):1};
}

export function rubblePropTemplate(){
  return loaded?.templates?.get('prop:rubble')||null;
}
