import * as THREE from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {MeshoptDecoder} from 'three/addons/libs/meshopt_decoder.module.js';
import {canonicalGeometry} from './authored-assets.js';
import {readAssetResponse} from './load-progress.js';

const source=new URL('./assets3d/frontier-epic-props.glb',import.meta.url).href;
let pending=null,loaded=null;

function registerScene(scene){
  const roots=new Map();
  scene.updateMatrixWorld(true);
  scene.traverse(node=>{
    if(node.isMesh)canonicalGeometry(node.geometry);
    const key=node.userData?.assetKey;
    if(key)roots.set(key,node);
  });
  return {roots};
}

export async function loadEpicPropsArtwork(){
  if(loaded)return loaded;
  if(!pending)pending=(async()=>{
    const response=await fetch(source);
    if(!response.ok)throw new Error(`Epic props artwork request failed (${response.status}).`);
    const buffer=await readAssetResponse(response,'epic-props','Waterfalls & frontier props');
    const gltf=await new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).parseAsync(buffer,'');
    loaded=registerScene(gltf.scene);
    return loaded;
  })();
  try{return await pending;}catch(error){pending=null;throw error;}
}

export function registerEpicPropsArtwork(scene){
  loaded=registerScene(scene);
  return loaded;
}

export function clearEpicPropsArtwork(){
  loaded=null;pending=null;
}

export function hasEpicProp(key){
  return Boolean(loaded?.roots?.has(key));
}

export function epicPropRoot(key){
  return loaded?.roots?.get(key)||null;
}

export function cloneEpicProp(key){
  const root=epicPropRoot(key);
  if(!root)return null;
  const group=root.clone(true);
  group.position.set(0,0,0);
  group.rotation.set(0,0,0);
  group.scale.set(1,1,1);
  return group;
}

/** Extract the first matching child mesh geometry from an epic prop (for GPU instancing). */
export function epicPropGeometry(key,role=null){
  const root=epicPropRoot(key);
  if(!root)return null;
  let found=null;
  root.traverse(node=>{
    if(found||!node.isMesh)return;
    if(!role||node.userData?.assetMaterial===role)found=node.geometry;
  });
  return found?found.clone():null;
}
