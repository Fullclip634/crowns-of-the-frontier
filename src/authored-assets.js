import * as THREE from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {MeshoptDecoder} from 'three/addons/libs/meshopt_decoder.module.js';
import manifest from './assets3d/catalogue.json' with {type:'json'};

const sources={
  low:new URL('./assets3d/frontier-low.glb',import.meta.url).href,
  medium:new URL('./assets3d/frontier-balanced.glb',import.meta.url).href,
  high:new URL('./assets3d/frontier-near.glb',import.meta.url).href,
};
const pending=new Map();
const loaded=new Map();
let active=null;
let loadSerial=0;

// Uniform float attributes let the existing material/joint batches merge
// compressed meshes reliably, including normalized/interleaved source buffers.
function canonicalGeometry(geometry){
  for(const name of ['position','normal','uv','color']){
    const attribute=geometry.getAttribute(name);if(!attribute)continue;
    const size=name==='color'?3:attribute.itemSize;
    const values=new Float32Array(attribute.count*size);
    for(let i=0;i<attribute.count;i++)for(let k=0;k<size;k++)
      values[i*size+k]=attribute.getComponent(i,k);
    geometry.setAttribute(name,new THREE.BufferAttribute(values,size));
  }
  const positions=geometry.getAttribute('position');
  if(!geometry.getAttribute('color'))geometry.setAttribute('color',new THREE.Float32BufferAttribute(new Float32Array(positions.count*3).fill(1),3));
  if(!geometry.getAttribute('uv')){
    const uv=new Float32Array(positions.count*2);
    for(let i=0;i<positions.count;i++){uv[i*2]=positions.getX(i)*.25;uv[i*2+1]=(positions.getY(i)+positions.getZ(i))*.25;}
    geometry.setAttribute('uv',new THREE.BufferAttribute(uv,2));
  }
  geometry.computeBoundingBox();geometry.computeBoundingSphere();
}

export function registerAuthoredAssets(gltf,detail='high',bytes=0,activate=true){
  const templates=new Map(),geometries=new Set();
  gltf.scene.traverse(node=>{
    if(node.userData.assetKey)templates.set(node.userData.assetKey,node);
    if(node.isMesh&&!geometries.has(node.geometry)){
      canonicalGeometry(node.geometry);geometries.add(node.geometry);
    }
  });
  const missing=manifest.models.filter(model=>!templates.has(model.key));
  if(missing.length)throw new Error('The 3D asset catalogue is incomplete: '+missing.map(model=>model.key).join(', '));
  const catalogue={templates,geometries,detail,bytes,source:'Blender'};
  if(activate)active=catalogue;
  return catalogue;
}

export async function loadAuthoredAssets(quality='high'){
  const serial=++loadSerial;
  const detail=['high','medium'].includes(quality)?quality:'low';
  if(!pending.has(detail))pending.set(detail,(async()=>{
    const response=await fetch(sources[detail]);
    if(!response.ok)throw new Error(`3D asset request failed (${response.status}).`);
    const buffer=await response.arrayBuffer();
    const loader=new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
    const gltf=await loader.parseAsync(buffer,'');
    const catalogue=registerAuthoredAssets(gltf,detail,buffer.byteLength,false);loaded.set(detail,catalogue);return catalogue;
  })());
  try{const catalogue=await pending.get(detail);if(serial===loadSerial)active=catalogue;return catalogue;}
  catch(error){pending.delete(detail);throw error;}
}

export function authoredAssetState(){return active?{source:active.source,detail:active.detail,models:active.templates.size,bytes:active.bytes}:null;}

// Keep the active catalogue and anything still used by a scene during a switch.
// Old quality catalogues otherwise retain both CPU arrays and GPU buffers.
export function trimAuthoredAssets(view){
  const pinned=new Set();for(const scene of [view.scene,view.modelPortrait?.scene])scene?.traverse(node=>{if(node.geometry)pinned.add(node.geometry);});
  let evicted=0;
  for(const [detail,catalogue]of loaded){
    if(catalogue===active||[...catalogue.geometries].some(geometry=>pinned.has(geometry)))continue;
    for(const geometry of catalogue.geometries)geometry.dispose();
    const materials=new Set();for(const root of catalogue.templates.values())root.traverse(node=>{if(node.isMesh)for(const material of Array.isArray(node.material)?node.material:[node.material])materials.add(material);});for(const material of materials)material.dispose();
    loaded.delete(detail);pending.delete(detail);evicted++;
  }
  view.authoredGeometry=new Set([...(active?.geometries||[]),...[...loaded.values()].flatMap(catalogue=>[...catalogue.geometries])]);
  view.artCacheDiagnostics={catalogues:[...loaded.keys()],bytes:[...loaded.values()].reduce((sum,c)=>sum+c.bytes,0),evicted};return view.artCacheDiagnostics;
}
export function clearAuthoredAssets(){active=null;}

function cloneAsset(view,key,owner=0){
  const template=active?.templates.get(key);if(!template)return null;
  const root=template.clone(true);
  view.authoredGeometry??=new Set();
  root.traverse(part=>{
    if(part.userData.assetBody)root.userData.body=part;
    if(part.userData.gate)root.userData.portcullis=part;
    if(!part.isMesh)return;
    const authoredRole=part.userData.assetMaterial;
    // Ore uses natural boulder grain; buildings retain their masonry surfaces.
    // Gold inclusions remain their separate metallic geometry and material.
    const deposit=/^resource:(stone|gold):/.test(key);
    const role=deposit&&['stone','stoneDark'].includes(authoredRole)?(key.startsWith('resource:gold:')?'oreRock':'rock'):authoredRole;
    const material=role==='team'?view.teamMaterials[owner]:role==='teamRoof'?view.roofMaterials[owner]:view.materials[role];
    if(!material)throw new Error(`Unknown 3D surface '${role}' in '${key}'.`);
    material.vertexColors=true;part.material=material;
    part.userData.surfaceRole=role;
    part.castShadow=true;part.receiveShadow=true;
    view.authoredGeometry.add(part.geometry);
  });
  root.userData.model3d={...root.userData.model3d,authored:true,detail:active.detail};
  view.artDiagnostics=authoredAssetState();
  return root;
}

export function workerVisualTask(view,e){
  if(e.type!=='villager')return 'standard';
  const activity=e.order?.type||e.activity;
  if(['build','repair'].includes(activity))return 'build';
  const target=view.sim?.get?.(e.order?.target),resource=activity==='gather'?target?.type||e.gatherType||e.carryType:e.carryType;
  if(['gold','stone'].includes(resource))return 'mine';
  if(resource==='food'||resource==='farm')return 'food';
  return 'wood';
}
export function authoredUnit(view,e){
  const task=workerVisualTask(view,e);
  return (e.type==='villager'?cloneAsset(view,`unit:villager:${task}`,e.owner):null)||cloneAsset(view,`unit:${e.type}`,e.owner);
}
export function authoredBuilding(view,e){
  const faction=view.sim?.players[e.owner]?.faction||'alder';
  const age=e.type==='towncenter'?(view.sim?.players[e.owner]?.age||0):0;
  const root=cloneAsset(view,`building:${e.type}:${faction}:${age}`,e.owner);
  if(root&&e.type==='dock')root.traverse(part=>{
    if(!part.userData.dockPier)return;
    let angle=0;for(let i=0;i<16;i++)if(view.sim.isWater(e.x+Math.cos(i*Math.PI/8)*9,e.z+Math.sin(i*Math.PI/8)*9)){angle=i*Math.PI/8;break;}
    part.rotation.y=-angle;
  });
  return root;
}
export function authoredResource(view,e){
  const key=e.kind==='shrine'?'resource:shrine':e.water?'resource:fish':`resource:${e.type}:${e.id%4}`;
  return cloneAsset(view,key,Math.max(0,e.owner||0));
}
export function authoredTree(view,map,variant,far){
  const biome=['winter','desert'].includes(map)?map:'highlands';
  return cloneAsset(view,`tree:${biome}:${variant}:${far?'far':'near'}`);
}
