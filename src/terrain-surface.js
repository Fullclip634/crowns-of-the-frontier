import * as THREE from 'three';
import {nodeRuntime} from './render-runtime.js';
import {roadDistance} from './terrain-layout.js';
import {terrainBiome} from './terrain-biomes.js';

function roadMask(land){
  roadDistance(0,0,land);const canvas=document.createElement('canvas');canvas.width=canvas.height=512;
  const ctx=canvas.getContext('2d'),half=land.renderSize/2;ctx.fillStyle='#000';ctx.fillRect(0,0,512,512);ctx.strokeStyle='#fff';ctx.lineWidth=3*512/land.renderSize;ctx.lineCap='round';
  for(const road of land.roads){ctx.beginPath();ctx.moveTo((road.x+half)/land.renderSize*512,(road.z+half)/land.renderSize*512);ctx.lineTo((road.x+road.dx+half)/land.renderSize*512,(road.z+road.dz+half)/land.renderSize*512);ctx.stroke();}
  const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.NoColorSpace;return texture;
}

export function applyTerrainShading(material,land,quality,surfaces,dimensions){
  const grass=surfaces.grass;if(!grass?.color)return;
  const soil=surfaces.soil||grass,rock=surfaces.rock||grass,normal=quality!=='low'&&grass.normal;
  material.bumpMap?.dispose();material.bumpMap=null;
  material.normalMap=normal||null;material.roughnessMap=null;
  const amount=land.map==='winter'?.22:.78;
  for(const texture of material.frontierOwnedTextures||[])texture.dispose();
  const roads=roadMask(land);material.frontierOwnedTextures=[roads];
  const uniforms={
    grass:{value:grass.color},soil:{value:soil.color||grass.color},rock:{value:rock.color||grass.color},
    grassNormal:{value:normal||null},soilNormal:{value:normal?(soil.normal||grass.normal):null},rockNormal:{value:normal?(rock.normal||grass.normal):null},
    grassArm:{value:quality==='high'?grass.arm||null:null},soilArm:{value:quality==='high'?soil.arm||grass.arm||null:null},rockArm:{value:quality==='high'?rock.arm||grass.arm||null:null},
    scale:{value:new THREE.Vector3(land.renderSize/(dimensions.grass||2),land.renderSize/(dimensions.soil||1.3),land.renderSize/(dimensions.rock||90))},
    amount:{value:amount},tint:{value:new THREE.Color(land.map==='winter'?0xe3e8de:0xe0e5d8)},grassTint:{value:new THREE.Color(terrainBiome(land.map).grassTint)},
    roads:{value:roads},
  };
  material.frontierTerrainUniforms=uniforms;
  material.defines={...material.defines};delete material.defines.FRONTIER_TERRAIN_ARM;
  if(quality==='high')material.defines.FRONTIER_TERRAIN_ARM='';
  if(material.isNodeMaterial){nodeRuntime().terrain(material,uniforms);return;}
  material.onBeforeCompile=shader=>{
    for(const [key,value]of Object.entries(uniforms))shader.uniforms['frontierTerrain'+key]=value;
    shader.vertexShader='attribute vec3 terrainMix;\nvarying vec3 vTerrainMix;\n'+shader.vertexShader;
    shader.vertexShader=shader.vertexShader.replace('#include <color_vertex>','#include <color_vertex>\nvTerrainMix = terrainMix;');
    shader.fragmentShader=`varying vec3 vTerrainMix;
      uniform sampler2D frontierTerraingrass;
      uniform sampler2D frontierTerrainsoil;
      uniform sampler2D frontierTerrainrock;
      uniform sampler2D frontierTerraingrassNormal;
      uniform sampler2D frontierTerrainsoilNormal;
      uniform sampler2D frontierTerrainrockNormal;
      uniform sampler2D frontierTerraingrassArm;
      uniform sampler2D frontierTerrainsoilArm;
      uniform sampler2D frontierTerrainrockArm;
      uniform sampler2D frontierTerrainroads;
      uniform vec3 frontierTerrainscale;
      uniform vec3 frontierTerraintint;
      uniform vec3 frontierTerraingrassTint;
      uniform float frontierTerrainamount;\n`+shader.fragmentShader;
    shader.fragmentShader=shader.fragmentShader.replace('#include <map_fragment>',`#include <map_fragment>
      vec3 terrainBlend = max(vTerrainMix, vec3(0.0));
      float terrainRoad = texture2D(frontierTerrainroads, vMapUv).r;
      terrainBlend = mix(terrainBlend, vec3(0.0, 1.0, 0.0), terrainRoad * 0.94);
      terrainBlend /= max(dot(terrainBlend, vec3(1.0)), 0.001);
      vec3 terrainColor = texture2D(frontierTerraingrass, vMapUv * frontierTerrainscale.x).rgb * frontierTerraingrassTint * terrainBlend.x
        + texture2D(frontierTerrainsoil, vMapUv * frontierTerrainscale.y).rgb * terrainBlend.y
        + texture2D(frontierTerrainrock, vMapUv * frontierTerrainscale.z).rgb * terrainBlend.z;
      diffuseColor.rgb = mix(diffuseColor.rgb, terrainColor * frontierTerraintint, frontierTerrainamount);`);
    shader.fragmentShader=shader.fragmentShader.replace('#include <normal_fragment_maps>',`
      #ifdef USE_NORMALMAP_TANGENTSPACE
      vec3 terrainNormal = texture2D(frontierTerraingrassNormal, vMapUv * frontierTerrainscale.x).xyz * terrainBlend.x
        + texture2D(frontierTerrainsoilNormal, vMapUv * frontierTerrainscale.y).xyz * terrainBlend.y
        + texture2D(frontierTerrainrockNormal, vMapUv * frontierTerrainscale.z).xyz * terrainBlend.z;
      terrainNormal = terrainNormal * 2.0 - 1.0;
      terrainNormal.xy *= 0.35;
      normal = normalize(tbn * terrainNormal);
      #endif`);
    shader.fragmentShader=shader.fragmentShader.replace('#include <roughnessmap_fragment>',`#include <roughnessmap_fragment>
      #ifdef FRONTIER_TERRAIN_ARM
      float terrainRoughness = texture2D(frontierTerraingrassArm, vMapUv * frontierTerrainscale.x).g * terrainBlend.x
        + texture2D(frontierTerrainsoilArm, vMapUv * frontierTerrainscale.y).g * terrainBlend.y
        + texture2D(frontierTerrainrockArm, vMapUv * frontierTerrainscale.z).g * terrainBlend.z;
      roughnessFactor *= clamp(terrainRoughness, 0.25, 1.0);
      #endif`);
  };
  material.customProgramCacheKey=()=>`frontier-terrain-v2:${land.map}:${land.renderSize}:${quality}`;
  material.userData.surface='Locally bundled natural grass, soil and rocky terrain';
  material.needsUpdate=true;
}
