import * as THREE from 'three';
import {standardMaterial,nodeRuntime} from './render-runtime.js';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';
import {ensureModelIndices} from './vertex-layout.js';
import {characterSurfaceMode,characterAtlasGLSL} from './character-surfaces.js';
import {characterSurfaceMaps} from './surface-assets.js';
import {ensureAtmosphereUniforms,ANALYTIC_IBL_GLSL} from './atmosphere-uniforms.js';
const GARMENT_TINT={
  villager:[1.02,.98,.87],spearman:[.78,.68,.53],swordsman:[.72,.65,.60],
  archer:[.61,.72,.51],marksman:[.69,.60,.47],knight:[.71,.67,.62],
  scout:[.93,.95,.88],outrider:[.77,.60,.50],sentinel:[.73,.73,.66],ironbreaker:[.66,.69,.74],
  monk:[.91,.82,.69],king:[.88,.77,.66],
};
const FIELD_FABRIC={
  villager:{canvas:new THREE.Color(0xc1bba4).toArray(),pants:new THREE.Color(0x72806d).toArray()},
  scout:{canvas:new THREE.Color(0xb2ad96).toArray(),pants:new THREE.Color(0x687a72).toArray()},
  galley:{canvas:new THREE.Color(0xe6deca).toArray()},
  warship:{canvas:new THREE.Color(0xebe3d0).toArray()},
  transport:{canvas:new THREE.Color(0xdfd5be).toArray()},
  fishingboat:{canvas:new THREE.Color(0xd5cab2).toArray()},
};
const HORSE_COAT={
  knight:new THREE.Color(0x584337).toArray(),
  scout:new THREE.Color(0x817568).toArray(),
  outrider:new THREE.Color(0x744531).toArray(),
};


function paletteMaterial(view){
  if(!view.materials.unitPalette){
    const material=standardMaterial({vertexColors:true,roughness:.9});
    const atm=ensureAtmosphereUniforms(view);
    const wood={value:view.materials.wood.map||null},teams={value:Array.from({length:8},(_,i)=>view.teamMaterials[i]?.color||new THREE.Color())},roofs={value:Array.from({length:8},(_,i)=>view.roofMaterials?.[i]?.color||new THREE.Color())},characterColor={value:null},characterNormal={value:null},characterReady={value:0},characterDetail={value:0};material.frontierUniforms={wood,teams,roofs,characterColor,characterNormal,characterReady,characterDetail,atmosphere:atm};
    if(!material.isNodeMaterial)material.onBeforeCompile=shader=>{
      shader.uniforms.frontierUnitWood=wood;
      shader.uniforms.frontierTeamColors=teams;shader.uniforms.frontierRoofColors=roofs;
      for(const key of ['characterColor','characterNormal','characterReady','characterDetail'])shader.uniforms['frontierUnit'+key]=material.frontierUniforms[key];
      for(const key of ['wetness','night','sunDir','sunColor','iblSky','iblHorizon','iblGround','iblIntensity'])shader.uniforms['frontierUnitAtm'+key]=atm[key];
      shader.vertexShader='attribute vec3 unitSurface;\nattribute float unitTeamMask;\n#ifdef USE_INSTANCING\nattribute float instanceOwner;\n#endif\nuniform vec3 frontierTeamColors[8];\nuniform vec3 frontierRoofColors[8];\nvarying vec3 vUnitSurface;\nvarying vec3 vUnitTeamColor;\nvarying float vUnitHeraldry;\n'+shader.vertexShader;
      shader.vertexShader=shader.vertexShader.replace('#include <color_vertex>',`#include <color_vertex>
        vUnitSurface = unitSurface; vUnitTeamColor = vec3(1.0); vUnitHeraldry = 0.0;
        #ifdef USE_INSTANCING
        int owner = int(clamp(instanceOwner, 0.0, 7.0) + 0.5);
        if(unitTeamMask > 1.5) vUnitTeamColor = frontierRoofColors[owner];
        else if(unitTeamMask > 0.01) {
          float mask = clamp(unitTeamMask, 0.0, 1.0);
          vec3 herald = mix(vec3(0.76, 0.71, 0.61), frontierTeamColors[owner], mask);
          float bold = smoothstep(0.55, 0.98, mask);
          vUnitTeamColor = herald * mix(1.0, 1.10, bold);
          vUnitHeraldry = bold;
        }
        #endif`);
      shader.fragmentShader='uniform sampler2D frontierUnitWood;\nvarying vec3 vUnitSurface;\nvarying vec3 vUnitTeamColor;\nvarying float vUnitHeraldry;\n'+shader.fragmentShader;
      shader.fragmentShader=`uniform sampler2D frontierUnitcharacterColor;
        uniform sampler2D frontierUnitcharacterNormal;
        uniform float frontierUnitcharacterReady;
        uniform float frontierUnitcharacterDetail;
        uniform float frontierUnitAtmwetness;
        uniform float frontierUnitAtmnight;
        uniform vec3 frontierUnitAtmsunDir;
        uniform vec3 frontierUnitAtmsunColor;
        uniform vec3 frontierUnitAtmiblSky;
        uniform vec3 frontierUnitAtmiblHorizon;
        uniform vec3 frontierUnitAtmiblGround;
        uniform float frontierUnitAtmiblIntensity;
        ${ANALYTIC_IBL_GLSL}\n`+characterAtlasGLSL+shader.fragmentShader;
      shader.fragmentShader=shader.fragmentShader.replace('#include <color_fragment>',`#include <color_fragment>
        diffuseColor.rgb *= vUnitTeamColor;
        bool unitCharacter = vUnitSurface.z > 1.5 && frontierUnitcharacterReady > 0.5;
        vec2 unitCharacterUv = frontierCharacterUV(vUv, vUnitSurface.z);
        float unitDetail = (1.0 - smoothstep(42.0, 110.0, length(vViewPosition))) * frontierUnitcharacterDetail;
        if(vUnitSurface.z > 0.5 && vUnitSurface.z < 1.5) diffuseColor.rgb *= texture2D(frontierUnitWood, vUv).rgb;
        else if(unitCharacter) {
          vec3 charTex = texture2D(frontierUnitcharacterColor, unitCharacterUv).rgb;
          if(vUnitSurface.z > 3.5 && vUnitSurface.z < 4.5) charTex = mix(charTex, charTex * vec3(1.06, 1.08, 1.12), 0.55);
          diffuseColor.rgb *= charTex;
        }`);
      shader.fragmentShader=shader.fragmentShader.replace('#include <roughnessmap_fragment>',`#include <roughnessmap_fragment>
        roughnessFactor = vUnitSurface.x;
        if(unitCharacter && unitDetail > 0.001) roughnessFactor = mix(roughnessFactor, texture2D(frontierUnitcharacterNormal, unitCharacterUv).a, unitDetail);
        if(vUnitSurface.z > 3.5 && vUnitSurface.z < 4.5) roughnessFactor *= 0.76;
        roughnessFactor = clamp(mix(roughnessFactor, roughnessFactor * 0.60, frontierUnitAtmwetness * 0.72), 0.04, 1.0);`);
      shader.fragmentShader=shader.fragmentShader.replace('#include <metalnessmap_fragment>','#include <metalnessmap_fragment>\nmetalnessFactor = clamp(min(vUnitSurface.y + (vUnitSurface.z > 3.5 && vUnitSurface.z < 4.5 ? 0.12 : 0.0), 0.68), 0.0, 1.0);');
      shader.fragmentShader=shader.fragmentShader.replace('#include <normal_fragment_maps>',`
        #ifdef USE_NORMALMAP_TANGENTSPACE
        if(unitCharacter && unitDetail > 0.001) {
          vec3 unitNormal = texture2D(frontierUnitcharacterNormal, unitCharacterUv).xyz * 2.0 - 1.0;
          unitNormal.xy *= (vUnitSurface.z > 4.5 ? 0.16 : 0.38) * unitDetail;
          normal = normalize(tbn * unitNormal);
        }
        #endif`);
      shader.fragmentShader=shader.fragmentShader.replace('#include <opaque_fragment>',`
        {
          vec3 unitViewDir = normalize(vViewPosition);
          vec3 unitWorldNormal = normalize(inverseTransformDirection(normal, viewMatrix));
          vec3 unitRefl = normalize(inverseTransformDirection(reflect(-unitViewDir, normal), viewMatrix));
          float unitLuma = dot(outgoingLight, vec3(0.3, 0.59, 0.11));
          outgoingLight += frontierAnalyticIbl(
            unitWorldNormal, normal, unitViewDir, unitRefl,
            diffuseColor.rgb, roughnessFactor, metalnessFactor,
            frontierUnitAtmsunDir, frontierUnitAtmsunColor,
            frontierUnitAtmiblSky, frontierUnitAtmiblHorizon, frontierUnitAtmiblGround,
            frontierUnitAtmiblIntensity, frontierUnitAtmnight, frontierUnitAtmwetness, unitLuma
          );
          float heraldRim = pow(1.0 - clamp(dot(normal, unitViewDir), 0.0, 1.0), 3.0) * vUnitHeraldry * (1.0 - frontierUnitAtmnight * 0.55);
          outgoingLight += vUnitTeamColor * heraldRim * 0.16;
        }
        #include <opaque_fragment>`);
    };
    // A shared UV channel is needed for the optional wood sampling above.
    if(!material.isNodeMaterial){material.defines={USE_UV:''};material.customProgramCacheKey=()=> 'frontier-unit-palette-v8';}
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
    const rawTeam=neutralTeams?(view.teamMaterials.includes(part.material)?1:view.roofMaterials?.includes(part.material)?2:0):0;
    const unitType=model.userData.model3d?.type,motionType=part.userData.motion?.type;
    const wooden=[view.materials.wood,view.materials.darkwood,view.materials.timberEdge].includes(part.material)&&!!view.materials.wood.map;
    const mode=wooden?1:characterSurfaceMode(part.userData.surfaceRole,unitType,part.userData.motion);
    let team=rawTeam;
    if(rawTeam===1&&unitType&&mode===2&&motionType!=='cape'){
      const partName=part.userData.figurePart||part.name||'';
      if(unitType==='villager'){
        team=partName.includes('cuff')||partName==='Unchanged body'?.55:.28;
      }else if(['archer','marksman','scout','outrider','monk'].includes(unitType)){
        if(partName.includes('Mantle'))team=.92;
        else if(partName.includes('Tunic')||partName.includes('Coat tail'))team=.46;
        else if(['arm','forearm','head'].includes(motionType))team=.42;
      }
    }
    const positions=geometry.attributes.position,count=positions.count,old=geometry.attributes.color;
    const colors=new Float32Array(count*3),surface=new Float32Array(count*3);
    // Retain the team colours on shields and standards. Dyed wool and linen
    // still carry a team tint, and cloth has a recognisable colour by role.
    const tunic=mode===2&&motionType!=='cape'&&part.userData.surfaceRole==='team'?GARMENT_TINT[unitType]:null;
    const coat=part.userData.surfaceRole==='horse'?HORSE_COAT[unitType]:null;
    const fabric=FIELD_FABRIC[unitType]?.[part.userData.surfaceRole];
    const color=coat||fabric||(rawTeam?[1,1,1]:part.material.color.toArray());
    for(let i=0;i<count;i++){
      const coatShade=coat?.63+.37*Math.min(1,Math.max(0,(positions.getY(i)-.28)/1.05)):1;
      for(let k=0;k<3;k++){
        colors[i*3+k]=(old?old.getComponent(i,k):1)*color[k]*(tunic?.[k]??1)*coatShade;
        surface[i*3+k]=k===0?part.material.roughness??.9:k===1?part.material.metalness??0:mode;
      }
    }
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
