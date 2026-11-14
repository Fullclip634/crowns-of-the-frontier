import * as THREE from 'three';
import {nodeRuntime} from './render-runtime.js';
import {terrainRoadPaths} from './terrain-layout.js';
import {terrainBiome,isSnowBiome,isAridBiome,isRockyBiome} from './terrain-biomes.js';

export function roadMask(land){
  const paths=terrainRoadPaths(land),canvas=document.createElement('canvas');canvas.width=canvas.height=512;
  const ctx=canvas.getContext('2d'),half=land.renderSize/2,scale=512/land.renderSize;
  ctx.fillStyle='#000';ctx.fillRect(0,0,512,512);ctx.lineCap='round';ctx.lineJoin='round';
  // B channel: wet shoreline / riverbank moisture transition.
  for(const channel of land.channels?.()||[]){
    ctx.strokeStyle='rgba(0,0,255,0.82)';ctx.lineWidth=(channel.width*2+9)*scale;
    ctx.beginPath();
    for(let z=-half;z<=half;z+=4){
      const x=channel.center+Math.sin(z*channel.frequency)*channel.bend,px=(x+half)*scale,py=(z+half)*scale;
      if(z===-half)ctx.moveTo(px,py);else ctx.lineTo(px,py);
    }
    ctx.stroke();
  }
  // R channel: wheel-rutted cart roads with softer shoulder and grassy median strip.
  for(const road of paths){
    for(const [width,color] of [[5.2*scale,'rgba(255,0,0,0.45)'],[3.2*scale,'rgba(255,0,0,0.95)'],[1.0*scale,'rgba(95,0,0,0.68)']]){
      ctx.strokeStyle=color;ctx.lineWidth=width;ctx.beginPath();
      road.points.forEach((point,i)=>{const px=(point.x+half)*scale,py=(point.z+half)*scale;if(i===0)ctx.moveTo(px,py);else ctx.lineTo(px,py);});
      ctx.stroke();
    }
  }
  const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.NoColorSpace;return texture;
}

export function applyTerrainShading(material,land,quality,surfaces,dimensions){
  const grass=surfaces.grass;if(!grass?.color)return;
  const soil=surfaces.soil||grass,rock=surfaces.rock||grass,normal=quality!=='low'&&grass.normal;
  material.bumpMap?.dispose();material.bumpMap=null;
  material.normalMap=normal||null;material.roughnessMap=null;
  const snow=isSnowBiome(land.map),arid=isAridBiome(land.map),rocky=isRockyBiome(land.map),biome=terrainBiome(land.map);
  const amount=snow?.24:arid?.68:rocky?.9:.84;
  for(const texture of material.frontierOwnedTextures||[])texture.dispose();
  const roads=roadMask(land);material.frontierOwnedTextures=[roads];
  const uniforms={
    grass:{value:grass.color},soil:{value:soil.color||grass.color},rock:{value:rock.color||grass.color},
    grassNormal:{value:normal||null},soilNormal:{value:normal?(soil.normal||grass.normal):null},rockNormal:{value:normal?(rock.normal||grass.normal):null},
    grassArm:{value:quality==='high'?grass.arm||null:null},soilArm:{value:quality==='high'?soil.arm||grass.arm||null:null},rockArm:{value:quality==='high'?rock.arm||grass.arm||null:null},
    scale:{value:new THREE.Vector3(land.renderSize/(dimensions.grass||2),land.renderSize/(dimensions.soil||1.3),land.renderSize/(dimensions.rock||90))},
    amount:{value:amount},tint:{value:new THREE.Color(snow?0xe5eae0:arid?0xeadec2:rocky?0xdcded4:0xe2e7da)},grassTint:{value:new THREE.Color(biome.grassTint)},
    macroReference:{value:new THREE.Color(biome.ground[0])},macroStrength:{value:snow?0:1},
    cliffTint:{value:new THREE.Color(biome.cliff||0x86847c)},
    roads:{value:roads},
  };
  material.frontierTerrainUniforms=uniforms;
  material.defines={...material.defines};delete material.defines.FRONTIER_TERRAIN_ARM;
  if(quality==='high')material.defines.FRONTIER_TERRAIN_ARM='';
  if(material.isNodeMaterial){nodeRuntime().terrain(material,uniforms);return;}
  material.onBeforeCompile=shader=>{
    for(const [key,value]of Object.entries(uniforms))shader.uniforms['frontierTerrain'+key]=value;
    shader.vertexShader='attribute vec3 terrainMix;\nvarying vec3 vTerrainMix;\nvarying vec3 vTerrainWorldPos;\n'+shader.vertexShader;
    shader.vertexShader=shader.vertexShader.replace('#include <color_vertex>','#include <color_vertex>\nvTerrainMix = terrainMix;\nvTerrainWorldPos = position;');
    shader.fragmentShader=`varying vec3 vTerrainMix;
      varying vec3 vTerrainWorldPos;
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
      uniform vec3 frontierTerrainmacroReference;
      uniform vec3 frontierTerraincliffTint;
      uniform float frontierTerrainmacroStrength;
      uniform float frontierTerrainamount;
      vec3 frontierHeightBlend(vec3 weights, vec3 heights) {
        vec3 h = weights * pow(max(heights, vec3(0.08)), vec3(1.65));
        return h / max(dot(h, vec3(1.0)), 0.001);
      }\n`+shader.fragmentShader;
    shader.fragmentShader=shader.fragmentShader.replace('#include <map_fragment>',`#include <map_fragment>
      vec3 terrainBlend = max(vTerrainMix, vec3(0.0));
      vec3 roadSample = texture2D(frontierTerrainroads, vMapUv).rgb;
      float edgeNoise = sin(vTerrainWorldPos.x * 1.45 + vTerrainWorldPos.z * 1.15) * cos(vTerrainWorldPos.x * 0.85 - vTerrainWorldPos.z * 1.65) * 0.14;
      float terrainRoad = smoothstep(0.08, 0.88, roadSample.r + edgeNoise * roadSample.r);
      float terrainShore = smoothstep(0.05, 0.75, roadSample.b) * (1.0 - smoothstep(0.35, 0.85, terrainBlend.z));
      terrainBlend = mix(terrainBlend, vec3(0.0, 1.0, 0.0), clamp(terrainRoad * 0.92 + terrainShore * 0.62, 0.0, 0.95));
      vec2 grassUv = vMapUv * frontierTerrainscale.x;
      vec2 soilUv = vMapUv * frontierTerrainscale.y;
      vec2 rockUv = vMapUv * frontierTerrainscale.z;
      vec3 grassMicro = texture2D(frontierTerraingrass, grassUv).rgb;
      vec3 grassMeso = texture2D(frontierTerraingrass, grassUv * 0.16 + vec2(0.19, 0.43)).rgb;
      vec3 grassMacro = texture2D(frontierTerraingrass, grassUv * 0.045 + vec2(0.61, 0.27)).rgb;
      vec3 grassSample = mix(mix(grassMicro, grassMeso, 0.48), grassMacro, 0.28);
      grassSample = clamp((grassSample - 0.5) * 1.32 + 0.5, 0.05, 1.35);
      vec3 soilSample = mix(texture2D(frontierTerrainsoil, soilUv).rgb, texture2D(frontierTerrainsoil, soilUv * 0.18 + vec2(0.31, 0.17)).rgb, 0.42);
      vec3 rockSample = mix(texture2D(frontierTerrainrock, rockUv * 5.5).rgb, texture2D(frontierTerrainrock, rockUv * 15.0 + vec2(0.23, 0.41)).rgb, 0.46);
      vec3 sampleLuma = vec3(dot(grassSample, vec3(0.3, 0.59, 0.11)), dot(soilSample, vec3(0.3, 0.59, 0.11)), dot(rockSample, vec3(0.3, 0.59, 0.11)) + 0.16);
      terrainBlend = frontierHeightBlend(terrainBlend, sampleLuma);
      vec3 terrainMacro = mix(vec3(1.0), clamp(diffuseColor.rgb / frontierTerrainmacroReference, vec3(0.68), vec3(1.26)), frontierTerrainmacroStrength);
      float cloverDapple = sin(vTerrainWorldPos.x * 0.42 + vTerrainWorldPos.z * 0.36) * cos(vTerrainWorldPos.x * 0.29 - vTerrainWorldPos.z * 0.48);
      float tuftGrain = sin(vTerrainWorldPos.x * 2.8 + cos(vTerrainWorldPos.z * 2.1)) * cos(vTerrainWorldPos.z * 2.6 - sin(vTerrainWorldPos.x * 1.9));
      vec3 lushGrass = grassSample * frontierTerraingrassTint * terrainMacro * mix(vec3(0.88, 0.94, 0.84), vec3(1.08, 1.12, 0.94), smoothstep(-0.42, 0.48, cloverDapple)) * (0.96 + 0.09 * tuftGrain);
      float strata = 0.82 + 0.28 * sin(vTerrainWorldPos.y * 5.8 + sin(vTerrainWorldPos.x * 0.19) * 1.5 + cos(vTerrainWorldPos.z * 0.19) * 1.5);
      float crevice = smoothstep(0.46, 0.88, sin(vTerrainWorldPos.x * 1.45 - vTerrainWorldPos.y * 2.6) * cos(vTerrainWorldPos.z * 1.45 + vTerrainWorldPos.y * 2.3));
      vec3 finalRock = rockSample * frontierTerraincliffTint * strata * (1.0 - crevice * 0.32);
      vec3 finalSoil = soilSample * mix(1.0, 0.76, terrainShore) * mix(1.0, 0.90, terrainRoad);
      vec3 terrainColor = lushGrass * terrainBlend.x + finalSoil * terrainBlend.y + finalRock * terrainBlend.z;
      diffuseColor.rgb = mix(diffuseColor.rgb, terrainColor * frontierTerraintint, frontierTerrainamount);`);
    shader.fragmentShader=shader.fragmentShader.replace('#include <normal_fragment_maps>',`
      #ifdef USE_NORMALMAP_TANGENTSPACE
      vec3 grassNorm = mix(texture2D(frontierTerraingrassNormal, vMapUv * frontierTerrainscale.x).xyz, texture2D(frontierTerraingrassNormal, vMapUv * frontierTerrainscale.x * 0.16).xyz, 0.45);
      vec3 soilNorm = mix(texture2D(frontierTerrainsoilNormal, vMapUv * frontierTerrainscale.y).xyz, texture2D(frontierTerrainsoilNormal, vMapUv * frontierTerrainscale.y * 0.18).xyz, 0.4);
      vec3 rockNorm = texture2D(frontierTerrainrockNormal, vMapUv * frontierTerrainscale.z * 6.5).xyz;
      vec3 terrainNormal = grassNorm * terrainBlend.x + soilNorm * terrainBlend.y + rockNorm * terrainBlend.z;
      terrainNormal = terrainNormal * 2.0 - 1.0;
      terrainNormal.xy *= mix(0.48, 0.76, terrainBlend.z);
      normal = normalize(tbn * terrainNormal);
      #endif`);
    shader.fragmentShader=shader.fragmentShader.replace('#include <roughnessmap_fragment>',`#include <roughnessmap_fragment>
      #ifdef FRONTIER_TERRAIN_ARM
      float terrainRoughness = texture2D(frontierTerraingrassArm, vMapUv * frontierTerrainscale.x * 0.16).g * terrainBlend.x
        + texture2D(frontierTerrainsoilArm, vMapUv * frontierTerrainscale.y * 0.18).g * terrainBlend.y
        + texture2D(frontierTerrainrockArm, vMapUv * frontierTerrainscale.z * 6.5).g * terrainBlend.z;
      terrainRoughness = mix(terrainRoughness, 0.34, terrainShore * 0.55);
      roughnessFactor *= clamp(terrainRoughness, 0.22, 1.0);
      #endif`);
  };
  material.customProgramCacheKey=()=>`frontier-terrain-v5:${land.map}:${land.renderSize}:${quality}`;
  material.userData.surface='Locally bundled natural grass, soil and rocky terrain';
  material.needsUpdate=true;
}
