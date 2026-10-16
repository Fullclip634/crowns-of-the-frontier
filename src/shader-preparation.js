import * as THREE from 'three';

// Independent materials keep asynchronous compilation safe if a newer match
// replaces the live scene. Geometry and textures stay shared, without copying
// runtime userData (which can contain circular unit/batch references).
export function shaderPreview(scene){
  const group=new THREE.Group(),materials=new Map(),instances=[];
  const material=source=>{if(!source)return source;if(!materials.has(source)){const copy=source.clone();copy.defines={...source.defines};copy.onBeforeCompile=source.onBeforeCompile;copy.customProgramCacheKey=source.customProgramCacheKey;materials.set(source,copy);}return materials.get(source);};
  scene.traverse(source=>{
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
