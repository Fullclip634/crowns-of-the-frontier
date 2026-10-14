import * as THREE from 'three';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';

function paletteMaterial(view){
  const m=view.materials;
  if(!m.structurePalette){
    const material=new THREE.MeshStandardMaterial({vertexColors:true,roughness:.9});
    const uniforms={wood:{value:null},stone:{value:null},plaster:{value:null},roof:{value:null},woodNormal:{value:null},stoneNormal:{value:null},plasterNormal:{value:null},woodArm:{value:null},stoneArm:{value:null},plasterArm:{value:null},normalAvailable:{value:new THREE.Vector3()},armAvailable:{value:new THREE.Vector3()},detail:{value:0},night:{value:0}};
    material.frontierUniforms=uniforms;
    material.defines={USE_UV:''};
    material.onBeforeCompile=shader=>{
      for(const [key,uniform] of Object.entries(uniforms))shader.uniforms['frontierStructure'+key]=uniform;
      shader.vertexShader='attribute vec3 structureSurface;\nattribute vec3 structureEmission;\nattribute float structureNightGlow;\nvarying vec3 vStructureSurface;\nvarying vec3 vStructureEmission;\nvarying float vStructureNightGlow;\n'+shader.vertexShader;
      shader.vertexShader=shader.vertexShader.replace('#include <color_vertex>','#include <color_vertex>\nvStructureSurface = structureSurface;\nvStructureEmission = structureEmission;\nvStructureNightGlow = structureNightGlow;');
      shader.fragmentShader=`uniform sampler2D frontierStructurewood;
        uniform sampler2D frontierStructurestone;
        uniform sampler2D frontierStructureplaster;
        uniform sampler2D frontierStructureroof;
        uniform sampler2D frontierStructurewoodNormal;
        uniform sampler2D frontierStructurestoneNormal;
        uniform sampler2D frontierStructureplasterNormal;
        uniform sampler2D frontierStructurewoodArm;
        uniform sampler2D frontierStructurestoneArm;
        uniform sampler2D frontierStructureplasterArm;
        uniform vec3 frontierStructurenormalAvailable;
        uniform vec3 frontierStructurearmAvailable;
        uniform float frontierStructuredetail;
        uniform float frontierStructurenight;
        varying vec3 vStructureSurface;
        varying vec3 vStructureEmission;\n`+shader.fragmentShader;
      shader.fragmentShader=shader.fragmentShader.replace('#include <color_fragment>',`#include <color_fragment>
        if(vStructureSurface.z > 3.5) diffuseColor.rgb *= texture2D(frontierStructureroof, vUv).rgb;
        else if(vStructureSurface.z > 2.5) diffuseColor.rgb *= texture2D(frontierStructureplaster, vUv).rgb;
        else if(vStructureSurface.z > 1.5) diffuseColor.rgb *= texture2D(frontierStructurestone, vUv).rgb;
        else if(vStructureSurface.z > 0.5) diffuseColor.rgb *= texture2D(frontierStructurewood, vUv).rgb;`);
      shader.fragmentShader=shader.fragmentShader.replace('#include <roughnessmap_fragment>',`#include <roughnessmap_fragment>
        roughnessFactor = vStructureSurface.x;
        float structureOcclusion = 1.0;
        bool armReady = vStructureSurface.z > 2.5 ? frontierStructurearmAvailable.z > 0.5 : vStructureSurface.z > 1.5 ? frontierStructurearmAvailable.y > 0.5 : frontierStructurearmAvailable.x > 0.5;
        if(frontierStructuredetail > 0.5 && vStructureSurface.z > 0.5 && vStructureSurface.z < 3.5 && armReady) {
          vec2 structureArm = vStructureSurface.z > 2.5 ? texture2D(frontierStructureplasterArm, vUv).rg : vStructureSurface.z > 1.5 ? texture2D(frontierStructurestoneArm, vUv).rg : texture2D(frontierStructurewoodArm, vUv).rg;
          roughnessFactor *= structureArm.g;
          structureOcclusion = mix(1.0, structureArm.r, 0.65);
        }
        roughnessFactor = clamp(roughnessFactor, 0.04, 1.0);`);
      shader.fragmentShader=shader.fragmentShader.replace('#include <aomap_fragment>','#include <aomap_fragment>\nreflectedLight.indirectDiffuse *= structureOcclusion;');
      shader.fragmentShader=shader.fragmentShader.replace('#include <metalnessmap_fragment>','#include <metalnessmap_fragment>\nmetalnessFactor = clamp(vStructureSurface.y, 0.0, 1.0);');
      shader.fragmentShader='varying float vStructureNightGlow;\n'+shader.fragmentShader;
      shader.fragmentShader=shader.fragmentShader.replace('#include <emissivemap_fragment>','#include <emissivemap_fragment>\ntotalEmissiveRadiance += vStructureEmission * (1.0 + frontierStructurenight * 1.5) + vec3(0.65, 0.3, 0.07) * vStructureNightGlow * frontierStructurenight;');
      shader.fragmentShader=shader.fragmentShader.replace('#include <normal_fragment_maps>',`
        #ifdef USE_NORMALMAP_TANGENTSPACE
        bool normalReady = vStructureSurface.z > 2.5 ? frontierStructurenormalAvailable.z > 0.5 : vStructureSurface.z > 1.5 ? frontierStructurenormalAvailable.y > 0.5 : frontierStructurenormalAvailable.x > 0.5;
        if(vStructureSurface.z > 0.5 && vStructureSurface.z < 3.5 && frontierStructuredetail > 0.5 && normalReady) {
          vec3 structureNormal = vStructureSurface.z > 2.5 ? texture2D(frontierStructureplasterNormal, vUv).xyz : vStructureSurface.z > 1.5 ? texture2D(frontierStructurestoneNormal, vUv).xyz : texture2D(frontierStructurewoodNormal, vUv).xyz;
          structureNormal = structureNormal * 2.0 - 1.0;
          structureNormal.xy *= vStructureSurface.z > 2.5 ? 0.24 : vStructureSurface.z > 1.5 ? 0.45 : 0.3;
          normal = normalize(tbn * structureNormal);
        }
        #endif`);
    };
    material.customProgramCacheKey=()=> 'frontier-structure-palette-v5';
    m.structurePalette=material;
  }
  const material=m.structurePalette,u=material.frontierUniforms;
  u.wood.value=m.wood.map||null;u.stone.value=m.stone.map||null;u.plaster.value=m.plaster.map||null;
  u.roof.value=view.roofMaterials?.find(material=>material.map)?.map||null;
  u.woodNormal.value=m.wood.normalMap||null;u.stoneNormal.value=m.stone.normalMap||null;
  u.plasterNormal.value=m.plaster.normalMap||null;u.normalAvailable.value.set(u.woodNormal.value?1:0,u.stoneNormal.value?1:0,u.plasterNormal.value?1:0);
  u.woodArm.value=m.wood.roughnessMap||null;u.stoneArm.value=m.stone.roughnessMap||null;
  u.plasterArm.value=m.plaster.roughnessMap||null;
  u.armAvailable.value.set(u.woodArm.value?1:0,u.stoneArm.value?1:0,u.plasterArm.value?1:0);
  u.detail.value=view.settings?.quality==='high'?2:view.settings?.quality==='medium'?1:0;
  const normal=u.stoneNormal.value||u.woodNormal.value||u.plasterNormal.value||null;
  if(material.normalMap!==normal){material.normalMap=normal;material.needsUpdate=true;}
  return material;
}

function bakeSurface(view,part,matrix){
  const geometry=part.geometry.clone().applyMatrix4(matrix),count=geometry.attributes.position.count;
  // Indexed geometry retains the compressed catalogue's shared vertices in RAM.
  if(!geometry.index)geometry.setIndex(Array.from({length:count},(_,i)=>i));
  for(const name of Object.keys(geometry.attributes))if(!['position','normal','uv','color'].includes(name))geometry.deleteAttribute(name);
  if(!geometry.attributes.normal)geometry.computeVertexNormals();
  if(!geometry.attributes.uv)geometry.setAttribute('uv',new THREE.Float32BufferAttribute(new Float32Array(count*2),2));
  const old=geometry.attributes.color,colors=new Float32Array(count*3),surface=new Float32Array(count*3),emission=new Float32Array(count*3),nightGlow=new Float32Array(count);
  const m=view.materials,material=part.material,color=material.color.toArray(),emissive=material.emissive?.toArray()||[0,0,0];
  const mode=[m.wood,m.darkwood,m.timberEdge].includes(material)&&m.wood.map?1:[m.stone,m.brick].includes(material)&&m.stone.map?2:material===m.plaster&&m.plaster.map?3:view.roofMaterials?.includes(material)&&material.map?4:0;
  for(let i=0;i<count;i++)for(let k=0;k<3;k++){
    colors[i*3+k]=color[k]*(old?old.getComponent(i,k):1);
    surface[i*3+k]=k===0?material.roughness??.9:k===1?material.metalness??0:mode;
    emission[i*3+k]=emissive[k]*(material.emissiveIntensity??1);
  }
  geometry.setAttribute('color',new THREE.BufferAttribute(colors,3));
  geometry.setAttribute('structureSurface',new THREE.BufferAttribute(surface,3));
  geometry.setAttribute('structureEmission',new THREE.BufferAttribute(emission,3));
  if(material===m.glass)nightGlow.fill(1);
  geometry.setAttribute('structureNightGlow',new THREE.BufferAttribute(nightGlow,1));
  geometry.clearGroups();return geometry;
}

const movable=node=>node.userData.gate||node.userData.windmill||node.userData.dockPier;

// One opaque draw per static structure; moving gates, mill rotors and flags keep
// their own pivots. Identical houses and wall sections reuse the same geometry.
export function packBuildingModel(view,root,e){
  if(root.userData.structurePacked)return root;
  const palette=paletteMaterial(view),metadata=root.userData.model3d||{};
  const key=[e.type,view.sim.players[e.owner]?.faction,metadata.architectureAge||0,metadata.artRevision||'base',e.owner,metadata.detail||'procedural',view.settings?.quality,
    view.teamMaterials[e.owner]?.color.getHex(),view.roofMaterials?.[e.owner]?.color.getHex()].join(':');
  view.structureGeometryCache??=new Map();view.sharedModelGeometry??=new Set();
  root.updateMatrixWorld(true);
  const pack=(group,path)=>{
    const parts=[],walk=node=>{
      for(const child of [...node.children]){
        if(movable(child)){pack(child,path+'/'+child.name+':'+node.children.indexOf(child));continue;}
        if(child.isMesh){if(!child.userData.flag&&!child.material.transparent)parts.push(child);}
        else walk(child);
      }
    };walk(group);
    if(!parts.length)return;
    const cacheKey=key+':'+path;let geometry=view.structureGeometryCache.get(cacheKey);
    if(!geometry){
      const inverse=group.matrixWorld.clone().invert(),sources=parts.map(part=>bakeSurface(view,part,inverse.clone().multiply(part.matrixWorld)));
      geometry=mergeGeometries(sources);for(const source of sources)source.dispose();
      if(!geometry)throw new Error('Building surfaces could not be merged.');
      geometry.computeBoundingBox();geometry.computeBoundingSphere();
      view.structureGeometryCache.set(cacheKey,geometry);view.sharedModelGeometry.add(geometry);
    }
    const shared=new Set([...Object.values(view.geo),...(view.authoredGeometry||[]),...view.sharedModelGeometry]);
    for(const part of parts){part.removeFromParent();if(!shared.has(part.geometry))part.geometry.dispose();}
    const mesh=new THREE.Mesh(geometry,palette);mesh.castShadow=mesh.receiveShadow=true;mesh.userData.structureSurface=true;group.add(mesh);
  };pack(root,'static');
  const prune=node=>{for(const child of [...node.children]){prune(child);if(child.isGroup&&!child.children.length&&!movable(child))child.removeFromParent();}};
  prune(root);root.userData.structurePacked=true;return root;
}

export function installStructurePalette(WorldView){
  const p=WorldView.prototype,makeBuilding=p.makeBuilding,mergeModel=p.mergeModel,attach=p.attach;
  p.makeBuilding=function(e){return packBuildingModel(this,makeBuilding.call(this,e),e);};
  p.mergeModel=function(root){return root.userData.structurePacked?root:mergeModel.call(this,root);};
  p.attach=function(sim){
    const previous=this.sharedModelGeometry||new Set();
    this.structureGeometryCache=new Map();this.sharedModelGeometry=new Set(previous);
    // Portraits can still reference a previous scene's shared building geometry.
    this.modelPortrait?.clear();if(this.modelPortrait)this.modelPortrait.key=null;
    attach.call(this,sim);
    for(const geometry of previous){geometry.dispose();this.sharedModelGeometry.delete(geometry);}
  };
}
