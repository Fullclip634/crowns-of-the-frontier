import * as THREE from 'three';

// Independent materials keep asynchronous compilation safe if a newer match
// replaces the live scene. Geometry and textures stay shared, without copying
// runtime userData (which can contain circular unit/batch references).
export function shaderPreview(scene){
  const group=new THREE.Group(),materials=new Map(),materialIds=new Map(),seen=new Set(),instances=[];
  const material=source=>{if(!source)return source;if(!materials.has(source)){const copy=source.clone();copy.defines={...source.defines};copy.onBeforeCompile=source.onBeforeCompile;copy.customProgramCacheKey=source.customProgramCacheKey;materials.set(source,copy);materialIds.set(source,materialIds.size+1);}return materials.get(source);};
  const materialKey=value=>Array.isArray(value)?value.map(entry=>entry?(material(entry),materialIds.get(entry)):0).join(','):(value?(material(value),materialIds.get(value)):0);
  scene.traverse(source=>{
    const kind=source.isInstancedMesh?'I':source.isSkinnedMesh?'S':source.isMesh?'M':source.isPoints?'P':source.isLineSegments?'L':source.isLine?'N':source.isSprite?'R':'';
    if(!kind)return;
    const attrs=source.geometry?.attributes?Object.keys(source.geometry.attributes).sort().join(','):'';
    const morphs=source.morphTargetInfluences?.length?1:0;
    const key=`${kind}|${materialKey(source.material)}|${attrs}|${source.instanceColor?1:0}|${source.castShadow?1:0}|${source.receiveShadow?1:0}|${morphs}`;
    if(seen.has(key))return;seen.add(key);
    const value=Array.isArray(source.material)?source.material.map(material):material(source.material);let proxy;
    if(source.isInstancedMesh){proxy=new THREE.InstancedMesh(source.geometry,value,1);proxy.instanceColor=source.instanceColor;instances.push(proxy);}
    else if(source.isSkinnedMesh){proxy=new THREE.SkinnedMesh(source.geometry,value);proxy.bind(source.skeleton,source.bindMatrix);}
    else if(source.isMesh)proxy=new THREE.Mesh(source.geometry,value);
    else if(source.isPoints)proxy=new THREE.Points(source.geometry,value);
    else if(source.isLineSegments)proxy=new THREE.LineSegments(source.geometry,value);
    else if(source.isLine)proxy=new THREE.Line(source.geometry,value);
    else if(source.isSprite)proxy=new THREE.Sprite(value);
    if(!proxy)return;proxy.castShadow=source.castShadow;proxy.receiveShadow=source.receiveShadow;proxy.morphTargetInfluences=source.morphTargetInfluences;group.add(proxy);
  });
  let disposed=false;return {group,materials,dispose(){if(disposed)return;disposed=true;for(const copy of materials.values())copy.dispose();for(const instance of instances)instance.dispose();group.clear();}};
}

export async function prepareScenePrograms(view){
  if(!view.renderer.compileAsync)return;
  const preview=shaderPreview(view.scene);
  try{await view.renderer.compileAsync(preview.group,view.camera,view.scene);}
  catch(error){preview.dispose();throw error;}
  // Keep warmed programs referenced until the live frame acquires them.
  (view.graphicsProgramReleases??=[]).push(()=>preview.dispose());
}

export function releasePreparedPrograms(view){for(const release of view.graphicsProgramReleases?.splice(0)||[])release();}
