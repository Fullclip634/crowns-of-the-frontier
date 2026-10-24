import * as THREE from 'three';
import {standardMaterial,nodeRuntime} from './render-runtime.js';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';
import {ensureModelIndices} from './vertex-layout.js';
import {characterSurfaceMode,characterAtlasGLSL} from './character-surfaces.js';
import {characterSurfaceMaps} from './surface-assets.js';

function paletteMaterial(view){
  if(!view.materials.unitPalette){
    const material=standardMaterial({vertexColors:true,roughness:.9});
    const wood={value:view.materials.wood.map||null},teams={value:Array.from({length:8},(_,i)=>view.teamMaterials[i]?.color||new THREE.Color())},roofs={value:Array.from({length:8},(_,i)=>view.roofMaterials?.[i]?.color||new THREE.Color())},characterColor={value:null},characterNormal={value:null},characterReady={value:0},characterDetail={value:0};material.frontierUniforms={wood,teams,roofs,characterColor,characterNormal,characterReady,characterDetail};
    if(!material.isNodeMaterial)material.onBeforeCompile=shader=>{
      shader.uniforms.frontierUnitWood=wood;
      shader.uniforms.frontierTeamColors=teams;shader.uniforms.frontierRoofColors=roofs;
      for(const key of ['characterColor','characterNormal','characterReady','characterDetail'])shader.uniforms['frontierUnit'+key]=material.frontierUniforms[key];
      shader.vertexShader='attribute vec3 unitSurface;\nattribute float unitTeamMask;\n#ifdef USE_INSTANCING\nattribute float instanceOwner;\n#endif\nuniform vec3 frontierTeamColors[8];\nuniform vec3 frontierRoofColors[8];\nvarying vec3 vUnitSurface;\nvarying vec3 vUnitTeamColor;\n'+shader.vertexShader;
      shader.vertexShader=shader.vertexShader.replace('#include <color_vertex>',`#include <color_vertex>
        vUnitSurface = unitSurface; vUnitTeamColor = vec3(1.0);
        #ifdef USE_INSTANCING
        int owner = int(clamp(instanceOwner, 0.0, 7.0) + 0.5);
        if(unitTeamMask > 1.5) vUnitTeamColor = frontierRoofColors[owner];
        else if(unitTeamMask > 0.5) vUnitTeamColor = frontierTeamColors[owner];
        #endif`);
      shader.fragmentShader='uniform sampler2D frontierUnitWood;\nvarying vec3 vUnitSurface;\nvarying vec3 vUnitTeamColor;\n'+shader.fragmentShader;
      shader.fragmentShader='uniform sampler2D frontierUnitcharacterColor;\nuniform sampler2D frontierUnitcharacterNormal;\nuniform float frontierUnitcharacterReady;\nuniform float frontierUnitcharacterDetail;\n'+characterAtlasGLSL+shader.fragmentShader;
      shader.fragmentShader=shader.fragmentShader.replace('#include <color_fragment>',`#include <color_fragment>
        diffuseColor.rgb *= vUnitTeamColor;
        bool unitCharacter = vUnitSurface.z > 1.5 && frontierUnitcharacterReady > 0.5;
        vec2 unitCharacterUv = frontierCharacterUV(vUv, vUnitSurface.z);
        float unitDetail = (1.0 - smoothstep(18.0, 44.0, length(vViewPosition))) * frontierUnitcharacterDetail;
        if(vUnitSurface.z > 0.5 && vUnitSurface.z < 1.5) diffuseColor.rgb *= texture2D(frontierUnitWood, vUv).rgb;
        else if(unitCharacter) diffuseColor.rgb *= texture2D(frontierUnitcharacterColor, unitCharacterUv).rgb;`);
      shader.fragmentShader=shader.fragmentShader.replace('#include <roughnessmap_fragment>',`#include <roughnessmap_fragment>
        roughnessFactor = vUnitSurface.x;
        if(unitCharacter && unitDetail > 0.001) roughnessFactor = mix(roughnessFactor, texture2D(frontierUnitcharacterNormal, unitCharacterUv).a, unitDetail);
        roughnessFactor = clamp(roughnessFactor, 0.04, 1.0);`);
      shader.fragmentShader=shader.fragmentShader.replace('#include <metalnessmap_fragment>','#include <metalnessmap_fragment>\nmetalnessFactor = clamp(vUnitSurface.y, 0.0, 1.0);');
      shader.fragmentShader=shader.fragmentShader.replace('#include <normal_fragment_maps>',`
        #ifdef USE_NORMALMAP_TANGENTSPACE
        if(unitCharacter && unitDetail > 0.001) {
          vec3 unitNormal = texture2D(frontierUnitcharacterNormal, unitCharacterUv).xyz * 2.0 - 1.0;
          unitNormal.xy *= (vUnitSurface.z > 4.5 ? 0.12 : 0.3) * unitDetail;
          normal = normalize(tbn * unitNormal);
        }
        #endif`);
    };
    // A shared UV channel is needed for the optional wood sampling above.
    if(!material.isNodeMaterial){material.defines={USE_UV:''};material.customProgramCacheKey=()=> 'frontier-unit-palette-v3';}
    view.materials.unitPalette=material;
  }
  const uniforms=view.materials.unitPalette.frontierUniforms;uniforms.wood.value=view.materials.wood.map||null;
  const maps=characterSurfaceMaps(),material=view.materials.unitPalette,normal=view.settings?.quality==='low'?null:maps.normal||null;
  uniforms.characterColor.value=maps.color||null;uniforms.characterNormal.value=normal;uniforms.characterReady.value=maps.color?1:0;uniforms.characterDetail.value=normal?(view.settings?.quality==='medium'?.7:1):0;
  const normalChanged=material.normalMap!==normal;if(normalChanged){material.normalMap=normal;material.needsUpdate=true;}
  for(let i=0;i<8;i++){uniforms.teams.value[i]=view.teamMaterials[i]?.color||uniforms.teams.value[i];uniforms.roofs.value[i]=view.roofMaterials?.[i]?.color||uniforms.roofs.value[i];}
  if(material.isNodeMaterial&&(!material.colorNode||normalChanged))nodeRuntime().unitPalette(material,uniforms);
  return view.materials.unitPalette;
}

// Bake the ownership palette into vertex colors, while retaining per-vertex
// roughness/metalness and every nested joint. This merges surfaces at each joint
// instead of drawing a separate skin, sleeve, cuff and tool mesh for that joint.
export function mergeUnitModel(view,model,neutralTeams=false){
  model.updateMatrixWorld(true);const groups=new Map(),transparent=[];
  const palette=paletteMaterial(view),result=new THREE.Group();result.userData.model3d=model.userData.model3d;
  model.traverse(part=>{
    if(!part.isMesh)return;
    if(part.material.transparent){const copy=part.clone();copy.geometry=part.geometry.clone().applyMatrix4(part.matrixWorld);copy.position.set(0,0,0);copy.rotation.set(0,0,0);copy.scale.setScalar(1);transparent.push(copy);return;}
    const geometry=part.geometry.clone().applyMatrix4(part.matrixWorld);ensureModelIndices(geometry);
    for(const name of Object.keys(geometry.attributes))if(!['position','normal','uv','color'].includes(name))geometry.deleteAttribute(name);
    const team=neutralTeams?(view.teamMaterials.includes(part.material)?1:view.roofMaterials?.includes(part.material)?2:0):0;
    const count=geometry.attributes.position.count,old=geometry.attributes.color,colors=new Float32Array(count*3),surface=new Float32Array(count*3),color=team?[1,1,1]:part.material.color.toArray();
    const wooden=[view.materials.wood,view.materials.darkwood,view.materials.timberEdge].includes(part.material)&&!!view.materials.wood.map,mode=wooden?1:characterSurfaceMode(part.userData.surfaceRole,model.userData.model3d?.type,part.userData.motion);
    for(let i=0;i<count;i++)for(let k=0;k<3;k++){colors[i*3+k]=(old?old.getComponent(i,k):1)*color[k];surface[i*3+k]=k===0?part.material.roughness??.9:k===1?part.material.metalness??0:mode;}
    geometry.setAttribute('color',new THREE.BufferAttribute(colors,3));geometry.setAttribute('unitSurface',new THREE.BufferAttribute(surface,3));geometry.setAttribute('unitTeamMask',new THREE.Float32BufferAttribute(new Float32Array(count).fill(team),1));
    const key=JSON.stringify(part.userData.motion||null);if(!groups.has(key))groups.set(key,{motion:part.userData.motion,geometries:[]});groups.get(key).geometries.push(geometry);
  });
  for(const group of groups.values()){
    const geometry=mergeGeometries(group.geometries);for(const source of group.geometries)source.dispose();
    if(!geometry)throw new Error('Troop surfaces could not be merged.');
    const mesh=new THREE.Mesh(geometry,palette);mesh.userData.motion=group.motion;mesh.castShadow=mesh.receiveShadow=true;result.add(mesh);
  }
  for(const part of transparent)result.add(part);
  return result;
}
