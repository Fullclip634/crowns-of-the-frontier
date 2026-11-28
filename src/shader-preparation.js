import * as THREE from 'three';
import {standardMaterial} from './render-runtime.js';

function cloneShaderMaterial(source){
  const copy=source.clone();
  copy.defines={...source.defines};
  copy.onBeforeCompile=source.onBeforeCompile;
  copy.customProgramCacheKey=source.customProgramCacheKey;
  return copy;
}

// Independent materials keep asynchronous compilation safe if a newer match
// replaces the live scene. Geometry and textures stay shared, without copying
// runtime userData (which can contain circular unit/batch references).
export function shaderPreview(scene,{activeOnly=false}={}){
  const group=new THREE.Group(),materials=new Map(),materialIds=new Map(),seen=new Set(),instances=[];
  const material=source=>{if(!source)return source;if(!materials.has(source)){const copy=cloneShaderMaterial(source);materials.set(source,copy);materialIds.set(source,materialIds.size+1);}return materials.get(source);};
  const materialKey=value=>Array.isArray(value)?value.map(entry=>entry?(material(entry),materialIds.get(entry)):0).join(','):(value?(material(value),materialIds.get(value)):0);
  const visit=source=>{
    if(activeOnly&&source.visible===false)return;
    const kind=source.isInstancedMesh?'I':source.isSkinnedMesh?'S':source.isMesh?'M':source.isPoints?'P':source.isLineSegments?'L':source.isLine?'N':source.isSprite?'R':'';
    if(kind&&(!activeOnly||!source.isInstancedMesh||source.count>0)){
      const attrs=source.geometry?.attributes?Object.keys(source.geometry.attributes).sort().join(','):'';
      const morphs=source.morphTargetInfluences?.length?1:0;
      const key=`${kind}|${materialKey(source.material)}|${attrs}|${source.instanceColor?1:0}|${source.castShadow?1:0}|${source.receiveShadow?1:0}|${morphs}`;
      if(!seen.has(key)){
        seen.add(key);
        const value=Array.isArray(source.material)?source.material.map(material):material(source.material);let proxy;
        if(source.isInstancedMesh){proxy=new THREE.InstancedMesh(source.geometry,value,1);proxy.instanceColor=source.instanceColor;instances.push(proxy);}
        else if(source.isSkinnedMesh){proxy=new THREE.SkinnedMesh(source.geometry,value);proxy.bind(source.skeleton,source.bindMatrix);}
        else if(source.isMesh)proxy=new THREE.Mesh(source.geometry,value);
        else if(source.isPoints)proxy=new THREE.Points(source.geometry,value);
        else if(source.isLineSegments)proxy=new THREE.LineSegments(source.geometry,value);
        else if(source.isLine)proxy=new THREE.Line(source.geometry,value);
        else if(source.isSprite)proxy=new THREE.Sprite(value);
        if(proxy){proxy.castShadow=source.castShadow;proxy.receiveShadow=source.receiveShadow;proxy.morphTargetInfluences=source.morphTargetInfluences;group.add(proxy);}
      }
    }
    for(const child of source.children)visit(child);
  };
  visit(scene);
  let disposed=false;return {group,materials,dispose(){if(disposed)return;disposed=true;for(const copy of materials.values())copy.dispose();for(const instance of instances)instance.dispose();group.clear();}};
}

function makeFallbackStructureGeometry(){
  const geo=new THREE.BoxGeometry(1,1,1),count=geo.attributes.position.count;
  geo.setAttribute('color',new THREE.Float32BufferAttribute(new Float32Array(count*3).fill(1),3));
  geo.setAttribute('structureSurface',new THREE.Float32BufferAttribute(new Float32Array(count*3),3));
  geo.setAttribute('structureEmission',new THREE.Float32BufferAttribute(new Float32Array(count*3),3));
  geo.setAttribute('structureNightGlow',new THREE.Float32BufferAttribute(new Float32Array(count),1));
  return geo;
}

// Build a lean, targeted WebGL2 preview containing ONLY transient or deferred
// shader variants that are not active on frame 1 (construction clipping planes,
// scaffolds, flags, clouds, instanced fire/smoke, combat VFX, walls).
// Compiling only these ~10 variants one at a time avoids parallel-compiler RAM
// spikes on 4 GB devices while retaining proxy materials so Three.js
// WebGLProgram refcounts stay >= 1 and never evict/recompile mid-match.
export function runtimeShaderPreview(view){
  const group=new THREE.Group();
  const ownedGeometries=[],ownedMaterials=[],ownedInstances=[],ownedTextures=[];
  const plainGeo=new THREE.BoxGeometry(1,1,1);
  const coloredGeo=new THREE.BoxGeometry(1,1,1);
  coloredGeo.setAttribute('color',new THREE.Float32BufferAttribute(new Float32Array(coloredGeo.attributes.position.count*3).fill(1),3));
  ownedGeometries.push(plainGeo,coloredGeo);

  let structureGeo=null;
  view.objects?.traverse?.(child=>{if(!structureGeo&&child.isMesh&&child.userData?.structureSurface)structureGeo=child.geometry;});
  if(!structureGeo){structureGeo=makeFallbackStructureGeometry();ownedGeometries.push(structureGeo);}

  const dummyTex=new THREE.DataTexture(new Uint8Array([255,255,255,255]),1,1,THREE.RGBAFormat);
  dummyTex.colorSpace=THREE.SRGBColorSpace;dummyTex.needsUpdate=true;
  ownedTextures.push(dummyTex);

  const clipPlane=new THREE.Plane(new THREE.Vector3(0,-1,0),1);
  const shadowsOn=Boolean(view.renderer?.shadowMap?.enabled);
  const addedKeys=new Set();
  const addProxy=(geo,mat,{instanced=false,instanceColor=null,castShadow=false,receiveShadow=false,tag=''}={})=>{
    const ckey=typeof mat.customProgramCacheKey==='function'?mat.customProgramCacheKey():'';
    const sig=`${tag}|${instanced?1:0}|${instanceColor?1:0}|${mat.type}|${mat.map?1:0}|${mat.normalMap?1:0}|${mat.roughnessMap?1:0}|${mat.bumpMap?1:0}|${mat.vertexColors?1:0}|${mat.transparent?1:0}|${mat.clippingPlanes?.length||0}|${shadowsOn&&receiveShadow?1:0}|${ckey}`;
    if(addedKeys.has(sig)){mat.dispose();return;}
    addedKeys.add(sig);
    ownedMaterials.push(mat);
    const proxy=instanced?new THREE.InstancedMesh(geo,mat,1):new THREE.Mesh(geo,mat);
    if(instanced){if(instanceColor)proxy.instanceColor=instanceColor;ownedInstances.push(proxy);}
    proxy.castShadow=castShadow;proxy.receiveShadow=receiveShadow;
    group.add(proxy);
  };

  // Order lightest shaders first so fast VFX/weather programs are ready within
  // milliseconds and heavy structure-palette clipping compiles last in isolation.
  // 1. Combat & feedback effects (ImpactEffects, FlightEffects, BattleRemains fallen bodies).
  addProxy(plainGeo,new THREE.MeshBasicMaterial({color:0xffe680,transparent:true,opacity:.9,depthWrite:false}),{instanced:true,tag:'vfx-sparks'});
  addProxy(plainGeo,new THREE.MeshBasicMaterial({map:dummyTex,color:0xffffff,transparent:true,opacity:.7,depthWrite:false,side:THREE.DoubleSide,polygonOffset:true,polygonOffsetFactor:-1,polygonOffsetUnits:-1}),{tag:'vfx-decal'});
  addProxy(plainGeo,new THREE.MeshBasicMaterial({color:0x91e0b4,transparent:true,opacity:.7,depthWrite:false,side:THREE.DoubleSide}),{tag:'vfx-ring'});
  // Covers chimneySmoke, groundGlows, hearthSparks, buildingDamage.* and selectionOverlays.rings/dots.
  const smokeSource=view.weather?.nightAtmosphere?.chimneySmoke||view.buildingDamage?.smoke||null;
  if(smokeSource?.material&&!smokeSource.material.isNodeMaterial){
    addProxy(smokeSource.geometry,cloneShaderMaterial(smokeSource.material),{instanced:true,instanceColor:smokeSource.instanceColor,tag:'vfx-smoke'});
  }
  addProxy(plainGeo,standardMaterial({color:0xe8c28b,roughness:.9,transparent:true,opacity:.8}),{instanced:true,tag:'vfx-burst'});
  addProxy(coloredGeo,standardMaterial({vertexColors:true,roughness:.75,metalness:.18}),{instanced:true,receiveShadow:false,tag:'vfx-flight'});
  if(shadowsOn){
    addProxy(coloredGeo,standardMaterial({vertexColors:true,roughness:.92,metalness:.08}),{instanced:true,castShadow:true,receiveShadow:true,tag:'vfx-remains'});
  }
  addProxy(plainGeo,standardMaterial({color:0xe0d6b1,transparent:true,opacity:.5,depthWrite:false,roughness:.6}),{tag:'vfx-slash'});

  // 2. Idle weather clouds, battle rubble & connected wall batches (instanced color variants).
  const clouds=view.weather?.clouds;
  if(clouds?.material&&!clouds.material.isNodeMaterial){
    addProxy(clouds.geometry,cloneShaderMaterial(clouds.material),{instanced:true,instanceColor:clouds.instanceColor,tag:'weather-clouds'});
  }
  const rubble=view.remains?.rubble;
  if(rubble?.material&&!rubble.material.isNodeMaterial){
    addProxy(rubble.geometry,cloneShaderMaterial(rubble.material),{instanced:true,instanceColor:rubble.instanceColor,castShadow:rubble.castShadow,receiveShadow:true,tag:'remains-rubble'});
  }
  for(const wallMesh of [view.wallVisuals?.stone,view.wallVisuals?.palisade]){
    if(wallMesh?.material&&!wallMesh.material.isNodeMaterial){
      addProxy(wallMesh.geometry,cloneShaderMaterial(wallMesh.material),{instanced:true,instanceColor:wallMesh.instanceColor,castShadow:true,receiveShadow:true,tag:'wall-conn'});
    }
  }

  // 3. Construction scaffold material (standard material with plaster map / wood normalMap).
  if(view.scaffoldDriftwoodMat&&!view.scaffoldDriftwoodMat.isNodeMaterial){
    const scaffoldCopy=cloneShaderMaterial(view.scaffoldDriftwoodMat);
    const map=view.materials?.plaster?.map||null,normal=view.materials?.wood?.normalMap||null;
    if(scaffoldCopy.map!==map||scaffoldCopy.normalMap!==normal){scaffoldCopy.map=map;scaffoldCopy.normalMap=normal;}
    addProxy(coloredGeo,scaffoldCopy,{castShadow:true,receiveShadow:true,tag:'scaffold'});
  }

  // 4. Non-merged animated building part material (flags use teamMaterials with vertexColors).
  const flagSource=view.teamMaterials?.[0];
  if(flagSource&&!flagSource.isNodeMaterial){
    const unclipped=cloneShaderMaterial(flagSource);
    unclipped.vertexColors=true;
    addProxy(coloredGeo,unclipped,{castShadow:true,receiveShadow:true,tag:'bpart'});
    const clipped=cloneShaderMaterial(flagSource);
    clipped.vertexColors=true;clipped.clippingPlanes=[clipPlane];clipped.clipShadows=true;
    addProxy(coloredGeo,clipped,{castShadow:true,receiveShadow:true,tag:'bpart-clip'});
  }

  // 5. Clipped construction structure palette (compiled last so it never delays lighter VFX).
  const structurePalette=view.materials?.structurePalette;
  if(structurePalette&&!structurePalette.isNodeMaterial){
    const clipped=cloneShaderMaterial(structurePalette);
    clipped.clippingPlanes=[clipPlane];clipped.clipShadows=true;
    addProxy(structureGeo,clipped,{castShadow:true,receiveShadow:true,tag:'struct-clip'});
  }

  let disposed=false;
  return {
    group,
    dispose(){
      if(disposed)return;disposed=true;
      for(const mat of ownedMaterials)mat.dispose();
      for(const inst of ownedInstances)inst.dispose();
      for(const geo of ownedGeometries)geo.dispose();
      for(const tex of ownedTextures)tex.dispose();
      group.clear();
    },
  };
}

function runtimeProgramSignature(view){
  const quality=view.renderQuality||view.settings?.quality||'';
  const shadows=view.renderer?.shadowMap?.enabled?1:0;
  const map=view.sim?.options?.map||'';
  const spNorm=view.materials?.structurePalette?.normalMap?1:0;
  const scaffoldMap=view.materials?.plaster?.map?1:0;
  const surfaceToken=view.surfaceMapToken||0;
  return `${quality}|${shadows}|${map}|${spNorm}|${scaffoldMap}|${surfaceToken}`;
}

const pauseBetweenCompiles=()=>typeof globalThis.requestAnimationFrame==='function'
  ?new Promise(resolve=>setTimeout(resolve,32))
  :Promise.resolve();

export async function warmRuntimePrograms(view,{force=false,deferFirstFrame=false}={}){
  if(!view?.renderer||view.renderer.isWebGPURenderer||typeof view.renderer.compileAsync!=='function'||!view.scene||!view.camera||view.renderingReleased)return false;
  const signature=runtimeProgramSignature(view);
  if(!force&&view.runtimeProgramSignature===signature){
    if(view.runtimeProgramPromise)return view.runtimeProgramPromise;
    if(view.retainedRuntimePrograms)return true;
  }
  // Enable local clipping upfront on WebGL2 so clipped construction variants
  // compile asynchronously once and stay pinned across the entire match.
  view.renderer.localClippingEnabled=true;
  const token=(view.runtimeProgramToken||0)+1;
  view.runtimeProgramToken=token;
  view.runtimeProgramSignature=signature;
  const preview=runtimeShaderPreview(view);
  const task=(async()=>{
    try{
      if(deferFirstFrame&&typeof globalThis.requestAnimationFrame==='function'){
        await new Promise(resolve=>setTimeout(resolve,120));
      }
      const items=[...preview.group.children];
      const stepGroup=new THREE.Group();
      for(let i=0;i<items.length;i++){
        if(view.renderingReleased||view.runtimeProgramToken!==token){
          preview.dispose();
          return false;
        }
        const item=items[i];
        stepGroup.add(item);
        await view.renderer.compileAsync(stepGroup,view.camera,view.scene);
        preview.group.add(item);
        if(i+1<items.length)await pauseBetweenCompiles();
      }
    }catch{
      preview.dispose();
      if(view.runtimeProgramToken===token){view.runtimeProgramSignature=null;view.runtimeProgramPromise=null;}
      return false;
    }
    if(view.renderingReleased||view.runtimeProgramToken!==token){
      preview.dispose();
      return false;
    }
    const previous=view.retainedRuntimePrograms;
    view.retainedRuntimePrograms=preview;
    view.runtimeProgramPromise=null;
    previous?.dispose();
    return true;
  })();
  view.runtimeProgramPromise=task;
  return task;
}

export function disposeRuntimePrograms(view){
  if(!view)return;
  view.runtimeProgramToken=(view.runtimeProgramToken||0)+1;
  view.runtimeProgramSignature=null;
  view.runtimeProgramPromise=null;
  view.retainedRuntimePrograms?.dispose();
  view.retainedRuntimePrograms=null;
}

export async function prepareScenePrograms(view){
  if(!view.renderer.compileAsync)return;
  if(view.renderer.isWebGPURenderer){
    // WebGPU compiles pipelines per live material and InstancedMesh NodeBuffer id;
    // compiling the full scene up front exceeds low-spec transition budgets, so
    // let the active frame compile only rendered pipelines on first draw.
    return;
  }
  const preview=shaderPreview(view.scene,{activeOnly:true});
  try{await view.renderer.compileAsync(preview.group,view.camera,view.scene);}
  catch(error){preview.dispose();throw error;}
  // Keep warmed programs referenced until the live frame acquires them.
  (view.graphicsProgramReleases??=[]).push(()=>preview.dispose());
}

export function releasePreparedPrograms(view){for(const release of view.graphicsProgramReleases?.splice(0)||[])release();}
