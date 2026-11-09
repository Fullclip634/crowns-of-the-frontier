import * as THREE from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {MeshoptDecoder} from 'three/addons/libs/meshopt_decoder.module.js';
import manifest from './assets3d/catalogue.json' with {type:'json'};
import {bindWorkerToolJoints} from './worker-tool-rig.js';
import {bindFootJoints} from './foot-placement.js';
import {bindMountedFootRig} from './mounted-footing.js';
import {wallTier} from './fortified-walls.js';
import {treeBiome} from './terrain-biomes.js';
import {isAgeStyled,architectureAge,applyArchitectureAge} from './architecture-age.js';

const sources={
  low:new URL('./assets3d/frontier-low.glb',import.meta.url).href,
  medium:new URL('./assets3d/frontier-balanced.glb',import.meta.url).href,
  high:new URL('./assets3d/frontier-near.glb',import.meta.url).href,
  trees:new URL('./assets3d/frontier-trees.glb',import.meta.url).href,
};
const pending=new Map();
const loaded=new Map();
const retained=new Map(),reservations=new Map();
let active=null;
let loadSerial=0;
let sharedTrees=null,treesPending=null;

export function registerSharedTrees(gltf,bytes=0){
  const templates=new Map(),geometries=new Set();
  gltf.scene.traverse(node=>{if(node.userData.assetKey)templates.set(node.userData.assetKey,node);if(node.isMesh&&!geometries.has(node.geometry)){canonicalGeometry(node.geometry);geometries.add(node.geometry);}});
  const expected=manifest.models.filter(model=>model.key.startsWith('tree:')).map(model=>model.key);
  if(templates.size!==expected.length||expected.some(key=>!templates.has(key)))throw new Error('Shared tree artwork is incomplete.');
  return {templates,geometries,bytes};
}

export function useSharedTrees(catalogue,trees){
  // Other template roots retain their parent scene. Detach superseded trees
  // so that those parent links cannot retain an unused second forest roster.
  for(const [key,root]of trees.templates){const old=catalogue.templates.get(key);if(old&&old!==root)old.removeFromParent();catalogue.templates.set(key,root);}
  const used=new Set();for(const root of catalogue.templates.values())root.traverse(node=>{if(node.isMesh)used.add(node.geometry);});
  for(const geometry of catalogue.geometries)if(!used.has(geometry)){geometry.dispose();catalogue.geometries.delete(geometry);}
  catalogue.trees=trees;return catalogue;
}

async function sharedTreeCatalogue(){
  if(!treesPending)treesPending=(async()=>{
    const response=await fetch(sources.trees);if(!response.ok)throw new Error(`Tree asset request failed (${response.status}).`);
    const buffer=await response.arrayBuffer(),gltf=await new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).parseAsync(buffer,'');
    return sharedTrees=registerSharedTrees(gltf,buffer.byteLength);
  })();
  try{return await treesPending;}catch(error){treesPending=null;throw error;}
}

// Uniform float attributes let the existing material/joint batches merge
// compressed meshes reliably, including normalized/interleaved source buffers.
export function canonicalGeometry(geometry){
  for(const name of ['position','normal','uv','color']){
    const attribute=geometry.getAttribute(name);if(!attribute)continue;
    const size=name==='color'?3:attribute.itemSize;
    // Decoder Float32 attributes already have the batch-compatible layout.
    // Keep their exact buffers instead of allocating a second complete roster.
    if(!attribute.isInterleavedBufferAttribute&&!attribute.normalized&&attribute.itemSize===size&&attribute.array instanceof Float32Array)continue;
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

const detailFor=quality=>['high','medium'].includes(quality)?quality:'low';
async function catalogueFor(detail){
  if(!pending.has(detail))pending.set(detail,(async()=>{
    const [response,trees]=await Promise.all([fetch(sources[detail]),sharedTreeCatalogue()]);
    if(!response.ok)throw new Error(`3D asset request failed (${response.status}).`);
    const buffer=await response.arrayBuffer();
    const loader=new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
    const gltf=await loader.parseAsync(buffer,'');
    const catalogue=useSharedTrees(registerAuthoredAssets(gltf,detail,buffer.byteLength,false),trees);loaded.set(detail,catalogue);return catalogue;
  })());
  try{return await pending.get(detail);}
  catch(error){pending.delete(detail);throw error;}
}

export async function loadAuthoredAssets(quality='high'){
  const serial=++loadSerial,catalogue=await catalogueFor(detailFor(quality));if(serial===loadSerial)active=catalogue;return catalogue;
}

// Leases retain source meshes rather than a duplicate rendered battlefield.
// A failed rebuild can reconstruct the previous preset without another fetch.
export function retainAuthoredAssets(catalogue=active){
  if(catalogue)retained.set(catalogue,(retained.get(catalogue)||0)+1);let released=false;
  return {catalogue,activate(){if(released)throw new Error('Artwork lease already released.');loadSerial++;active=catalogue;},release(){if(released)return;released=true;if(catalogue){const count=retained.get(catalogue)-1;if(count)retained.set(catalogue,count);else retained.delete(catalogue);}}};
}

export async function prepareAuthoredAssets(quality){
  const detail=detailFor(quality);reservations.set(detail,(reservations.get(detail)||0)+1);
  try{return retainAuthoredAssets(await catalogueFor(detail));}
  finally{const count=reservations.get(detail)-1;if(count)reservations.set(detail,count);else reservations.delete(detail);}
}

export function authoredAssetState(){return active?{source:active.source,detail:active.detail,models:active.templates.size,bytes:active.bytes,sharedTrees:active.trees?.templates.size||0}:null;}

// Keep the active catalogue and anything still used by a scene during a switch.
// Old quality catalogues otherwise retain both CPU arrays and GPU buffers.
export function trimAuthoredAssets(view){
  const pinned=new Set();for(const scene of [view.scene,view.modelPortrait?.scene])scene?.traverse(node=>{if(node.geometry)pinned.add(node.geometry);});
  let evicted=0;
  for(const [detail,catalogue]of loaded){
    if(catalogue===active||retained.has(catalogue)||reservations.has(detail)||[...catalogue.geometries].some(geometry=>pinned.has(geometry)))continue;
    for(const geometry of catalogue.geometries)geometry.dispose();
    const materials=new Set();for(const [key,root]of catalogue.templates){if(catalogue.trees?.templates.has(key))continue;root.traverse(node=>{if(node.isMesh)for(const material of Array.isArray(node.material)?node.material:[node.material])materials.add(material);});}for(const material of materials)material.dispose();
    loaded.delete(detail);pending.delete(detail);evicted++;
  }
  view.authoredGeometry=new Set([...(sharedTrees?.geometries||[]),...(active?.geometries||[]),...[...loaded.values(),...retained.keys()].flatMap(catalogue=>[...catalogue.geometries])]);
  view.artCacheDiagnostics={catalogues:[...loaded.keys()],bytes:[...loaded.values()].reduce((sum,c)=>sum+c.bytes,sharedTrees?.bytes||0),sharedTreeBytes:sharedTrees?.bytes||0,evicted,retained:retained.size,reservations:reservations.size};return view.artCacheDiagnostics;
}
export function clearAuthoredAssets(){active=null;}

function cloneAsset(view,key,owner=0){
  const template=active?.templates.get(key);if(!template)return null;
  const root=template.clone(true);
  if(key.startsWith('unit:villager'))bindWorkerToolJoints(root);
  const terrainFeet=key.startsWith('unit:')&&bindFootJoints(root);
  const terrainHorse=key.startsWith('unit:')&&bindMountedFootRig(root);
  view.authoredGeometry??=new Set();
  root.traverse(part=>{
    if(part.userData.assetBody)root.userData.body=part;
    if(part.userData.gate)root.userData.portcullis=part;
    if(!part.isMesh)return;
    const authoredRole=part.userData.assetMaterial;
    // Ore uses natural boulder grain; buildings retain their masonry surfaces.
    // Gold inclusions remain their separate metallic geometry and material.
    const deposit=/^resource:(stone|gold):/.test(key);
    const role=deposit&&['stone','stoneDark'].includes(authoredRole)?(key.startsWith('resource:gold:')?'oreRock':'rock'):deposit&&key.startsWith('resource:gold:')&&authoredRole==='gold'?'oreGold':authoredRole;
    const material=role==='team'?view.teamMaterials[owner]:role==='teamRoof'?view.roofMaterials[owner]:view.materials[role];
    if(!material)throw new Error(`Unknown 3D surface '${role}' in '${key}'.`);
    material.vertexColors=true;part.material=material;
    part.userData.surfaceRole=role;
    part.castShadow=true;part.receiveShadow=true;
    view.authoredGeometry.add(part.geometry);
  });
  root.userData.model3d={...root.userData.model3d,...(terrainFeet?{terrainFeet:true}:{}),...(terrainHorse?{terrainHorse:true}:{}),authored:true,detail:key.startsWith('tree:')&&active.trees?'shared':active.detail};
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
  // Landmark buildings gain age-specific massing and crenellation from their
  // single authored base; only the Town Center has four Blender variants.
  // Both paths tag the visual age so the renderer can detect an age advance.
  if(root){
    const styledAge=e.type==='towncenter'?Math.max(0,Math.min(3,age)):architectureAge(view.sim,e);
    if(e.type==='towncenter'||isAgeStyled(e.type))root.userData.model3d={...root.userData.model3d,architectureAge:styledAge};
    if(isAgeStyled(e.type))applyArchitectureAge(view,root,e,styledAge);
    foundation(view,root,e);
  }
  if(root&&e.type==='dock')root.traverse(part=>{
    if(!part.userData.dockPier)return;
    let angle=0;for(let i=0;i<16;i++)if(view.sim.isWater(e.x+Math.cos(i*Math.PI/8)*9,e.z+Math.sin(i*Math.PI/8)*9)){angle=i*Math.PI/8;break;}
    part.rotation.y=-angle;
  });
  // Fortified walls reuse the identical Blender template. The heavier tier is
  // authored as a transform + baked surface tint, never a new mesh or material.
  if(root&&(e.type==='wall'||e.type==='gate')){
    const tier=wallTier(view.sim,e);
    root.userData.model3d={...root.userData.model3d,wallTier:tier};
    if(tier==='fortified')root.traverse(part=>{
      if(!part.isMesh)return;
      // The portcullis is a separate animated pivot; keep its lift geometry exact.
      for(let node=part;node&&node!==root;node=node.parent)if(node.userData.gate)return;
      part.scale.set(part.scale.x*1.06,part.scale.y*1.19,part.scale.z*1.14);
    });
    if(e.type==='wall')crenellate(view,root,tier);
  }
  return root;
}

// The authored buildings were modelled with their walls meeting the ground
// plane, so they read as pasted onto the grass. The procedural fallback has
// always drawn a stone slab under each building; the authored path did not.
// A shallow plinth restores that foundation without changing the silhouette.
function foundation(view,root,e){
  const body=view.materials?.stoneDark;
  if(!body||!view.geo?.box||root.userData.foundation)return;
  // Walls, fields and towers are excluded: a wall segment must not gain a
  // skirt, a field is soil rather than masonry, and a tower's own footing is
  // already authored. A mill keeps a plinth but one that does not protrude at
  // all, because its blades sweep close to the front wall.
  if(['farm','dock','wall','gate','tower'].includes(e.type))return;
  const overhang=e.type==='mill'?1:1.06;
  root.updateMatrixWorld(true);
  // Measure the building only. A rotor or a moving gate sits outside the walls
  // and would otherwise inflate the plinth until it clipped the blades.
  const bounds=new THREE.Box3(),part=new THREE.Box3();
  root.traverse(node=>{
    if(!node.isMesh||node.userData.windmillMount)return;
    for(let parent=node;parent&&parent!==root;parent=parent.parent)if(parent.userData?.windmill||parent.userData?.gate)return;
    bounds.union(part.setFromObject(node));
  });
  if(bounds.isEmpty())return;
  const size=bounds.getSize(new THREE.Vector3());
  if(size.x<.6||size.z<.6)return;
  root.userData.foundation=true;
  // The slab is a child of the root, so it inherits the age massing scale.
  // Divide the measured world size by that scale to keep the plinth flush with
  // the walls instead of overshooting them at higher ages.
  const sx=root.scale.x||1,sy=root.scale.y||1,sz=root.scale.z||1;
  const slab=new THREE.Mesh(view.geo.box,body);
  slab.position.set((bounds.min.x+bounds.max.x)/2/sx,(bounds.min.y+.10)/sy,(bounds.min.z+bounds.max.z)/2/sz);
  slab.scale.set(size.x*overhang/sx,.46/sy,size.z*overhang/sz);
  slab.userData.architectureDetail=true;
  root.add(slab);
}

// The authored wall segment is a ninety-six triangle box, so a run of walls read
// as a plain parapet with no battlements at all. The procedural fallback has
// merlons and the authored model did not. These are added through the structure
// palette, so they take the same masonry texture, roughness and lighting as the
// wall they sit on rather than the flat dark material that made the old
// ornaments look like black blocks.
function crenellate(view,root,tier){
  const materials=view.materials,body=tier==='fortified'?materials?.stoneDark:materials?.stone;
  if(!body||!view.geo?.box||root.userData.crenellated)return;
  root.userData.crenellated=true;
  root.updateMatrixWorld(true);
  const bounds=new THREE.Box3().setFromObject(root),size=bounds.getSize(new THREE.Vector3()),center=bounds.getCenter(new THREE.Vector3());
  if(!(size.x>.5||size.z>.5)||size.y<1)return;
  const alongX=size.x>=size.z,span=alongX?size.x:size.z,depth=alongX?size.z:size.x;
  const heavy=tier==='fortified',count=Math.max(3,Math.round(span/1.05));
  const width=span/count*.58,height=heavy?.72:.55,deep=depth*.55;
  for(let i=0;i<count;i++){
    const offset=(i+.5)/count*span-span/2;
    const merlon=new THREE.Mesh(view.geo.box,body);
    merlon.position.set(alongX?center.x+offset:center.x,bounds.max.y+height/2,alongX?center.z:center.z+offset);
    merlon.scale.set(alongX?width:deep,height,alongX?deep:width);
    merlon.userData.architectureDetail=true;
    root.add(merlon);
  }
}
export function authoredResource(view,e){
  const key=e.kind==='shrine'?'resource:shrine':e.water?'resource:fish':`resource:${e.type}:${e.id%4}`;
  return cloneAsset(view,key,Math.max(0,e.owner||0));
}
export function authoredTree(view,map,variant,far){
  const biome=treeBiome(map);
  return cloneAsset(view,`tree:${biome}:${variant}:${far?'far':'near'}`);
}
