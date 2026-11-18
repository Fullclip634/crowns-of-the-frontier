import * as THREE from 'three';
import {nodeRuntime} from './render-runtime.js';
import {terrainRoadPaths,strokeTaperedRoad,paintSettlementPaving} from './terrain-layout.js';
import {terrainBiome,isSnowBiome,isAridBiome,isRockyBiome} from './terrain-biomes.js';

export function roadMask(land){
  const paths=terrainRoadPaths(land),size=768,canvas=document.createElement('canvas');canvas.width=canvas.height=size;
  const ctx=canvas.getContext('2d'),half=land.half,scale=size/land.worldSize;
  ctx.fillStyle='#000';ctx.fillRect(0,0,size,size);ctx.lineCap='round';ctx.lineJoin='round';
  const beach=land.map==='coast'||land.map==='archipelago';
  const channels=land.channels?.()||[];
  if(channels.length){
    const mask=ctx.createImageData(size,size),pixels=mask.data;
    for(let i=3;i<pixels.length;i+=4)pixels[i]=255;
    const fade=(distance,width)=>{
      const t=Math.min(1,Math.max(0,distance/width));
      return (1-t)*(1-t)*(1+2*t);
    };
    for(const channel of channels)for(let row=0;row<size;row++){
      const z=(row+.5)/scale-half,center=channel.center+Math.sin(z*channel.frequency)*channel.bend;
      const bankWidth=beach?4.3+Math.sin(z*.19+channel.center)*1.05+Math.cos(z*.41)*.38:3.1;
      const left=Math.max(0,Math.floor((center-channel.width-bankWidth+half)*scale));
      const right=Math.min(size-1,Math.ceil((center+channel.width+bankWidth+half)*scale));
      for(let column=left;column<=right;column++){
        const distance=Math.abs((column+.5)/scale-half-center)-channel.width;
        const i=(row*size+column)*4;
        if(beach)pixels[i+1]=Math.max(pixels[i+1],214*fade(distance,bankWidth));
        pixels[i+2]=Math.max(pixels[i+2],215*fade(distance+1.3,bankWidth));
      }
    }
    ctx.putImageData(mask,0,0);
  }
  // Red values above the lane range identify the flagstone pads.
  for(const road of paths){
    strokeTaperedRoad(ctx,road.points,{half,size:land.worldSize,canvasSize:size,connected:road.connected,layers:[
      {width:(road.local?3.2:4.6)*scale,rgba:t=>`rgba(196,0,0,${(.39*t).toFixed(3)})`},
      {width:(road.local?2.1:2.8)*scale,rgba:t=>`rgba(196,0,0,${(.72*t).toFixed(3)})`},
    ],gravelColor:a=>`rgba(196,0,0,${a.toFixed(3)})`});
  }
  paintSettlementPaving(ctx,land,half,scale,true);
  ctx.fillStyle='#000';
  for(const edge of [0,size-1]){ctx.fillRect(edge,0,1,size);ctx.fillRect(0,edge,size,1);}
  const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.NoColorSpace;return texture;
}

export function applyTerrainShading(material,land,quality,surfaces,dimensions){
  const grass=surfaces.grass;if(!grass?.color)return;
  const soil=surfaces.soil||grass,rock=surfaces.rock||grass,normal=quality!=='low'&&grass.normal;
  material.bumpMap?.dispose();material.bumpMap=null;
  material.normalMap=normal||null;material.roughnessMap=null;
  const snow=isSnowBiome(land.map),arid=isAridBiome(land.map),volcanic=land.map==='volcanic',rocky=isRockyBiome(land.map),shore=land.map==='coast'||land.map==='archipelago',biome=terrainBiome(land.map);
  const amount=snow?.58:arid?.82:rocky?.9:.84;
  for(const texture of material.frontierOwnedTextures||[])texture.dispose();
  const roads=roadMask(land);material.frontierOwnedTextures=[roads];
  const uniforms={
    grass:{value:grass.color},soil:{value:soil.color||grass.color},rock:{value:rock.color||grass.color},
    grassNormal:{value:normal||null},soilNormal:{value:normal?(soil.normal||grass.normal):null},rockNormal:{value:normal?(rock.normal||grass.normal):null},
    grassArm:{value:quality==='high'?grass.arm||null:null},soilArm:{value:quality==='high'?soil.arm||grass.arm||null:null},rockArm:{value:quality==='high'?rock.arm||grass.arm||null:null},
    scale:{value:new THREE.Vector3(land.renderSize/(dimensions.grass||2),land.renderSize/(dimensions.soil||1.3),land.renderSize/(dimensions.rock||90))},
    amount:{value:amount},tint:{value:new THREE.Color(snow?0xeef3f6:arid?0xeadec2:rocky?0xdcded4:0xe2e7da)},grassTint:{value:new THREE.Color(biome.grassTint)},
    soilTint:{value:new THREE.Color(snow?0xd0dad4:volcanic?0x62564e:arid?0xc9a876:0xc0b59c)},
    macroReference:{value:new THREE.Color(biome.ground[0])},macroStrength:{value:snow?.45:1},
    cliffTint:{value:new THREE.Color(biome.cliff||0x86847c)},
    biomeFlags:{value:new THREE.Vector4(snow?1:0,arid&&!volcanic?1:0,volcanic?1:0,shore?1:0)},
    roads:{value:roads},
  };
  material.frontierTerrainUniforms=uniforms;
  material.defines={...material.defines};delete material.defines.FRONTIER_TERRAIN_ARM;
  if(quality==='high')material.defines.FRONTIER_TERRAIN_ARM='';
  if(material.isNodeMaterial){nodeRuntime().terrain(material,uniforms);return;}
  material.onBeforeCompile=shader=>{
    for(const [key,value]of Object.entries(uniforms))shader.uniforms['frontierTerrain'+key]=value;
    shader.vertexShader='attribute vec3 terrainMix;\nvarying vec3 vTerrainMix;\nvarying vec3 vTerrainWorldPos;\nvarying vec3 vTerrainWorldNormal;\nvarying float vTerrainNormalY;\n'+shader.vertexShader;
    shader.vertexShader=shader.vertexShader.replace('#include <color_vertex>','#include <color_vertex>\nvTerrainMix = terrainMix;\nvTerrainWorldPos = position;\nvTerrainWorldNormal = normalize(normal);\nvTerrainNormalY = normal.y;');
    shader.fragmentShader=`varying vec3 vTerrainMix;
      varying vec3 vTerrainWorldPos;
      varying vec3 vTerrainWorldNormal;
      varying float vTerrainNormalY;
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
      uniform vec3 frontierTerrainsoilTint;
      uniform vec3 frontierTerrainmacroReference;
      uniform vec3 frontierTerraincliffTint;
      uniform vec4 frontierTerrainbiomeFlags;
      uniform float frontierTerrainmacroStrength;
      uniform float frontierTerrainamount;
      vec3 frontierHeightBlend(vec3 weights, vec3 heights) {
        vec3 h = weights * pow(max(heights, vec3(0.08)), vec3(1.65));
        return h / max(dot(h, vec3(1.0)), 0.001);
      }\n`+shader.fragmentShader;
    shader.fragmentShader=shader.fragmentShader.replace('#include <map_fragment>',`#include <map_fragment>
      vec3 terrainBlend = max(vTerrainMix, vec3(0.0));
      vec3 roadSample = texture2D(frontierTerrainroads, vMapUv * 2.0 - 0.5).rgb;
      float terrainPaving = smoothstep(0.81, 0.99, roadSample.r);
      float roadStrength = min(roadSample.r * 1.30, 1.0);
      float edgeNoise = sin(vTerrainWorldPos.x * 1.45 + vTerrainWorldPos.z * 1.15) * cos(vTerrainWorldPos.x * 0.85 - vTerrainWorldPos.z * 1.65) * 0.14;
      float terrainRoad = smoothstep(0.08, 0.88, roadStrength + edgeNoise * roadStrength);
      float terrainShore = smoothstep(0.05, 0.75, roadSample.b) * (1.0 - smoothstep(0.35, 0.85, terrainBlend.z));
      float terrainBeach = frontierTerrainbiomeFlags.w > 0.5 ? smoothstep(0.08, 0.78, roadSample.g + edgeNoise * 0.5 * roadSample.g) * (1.0 - smoothstep(0.32, 0.80, terrainBlend.z)) * (1.0 - terrainRoad * 0.85) : 0.0;
      terrainBlend = mix(terrainBlend, vec3(0.0, 1.0, 0.0), clamp(terrainRoad * 0.78 + max(terrainShore, terrainBeach) * 0.62, 0.0, 0.92));
      vec2 grassUv = vMapUv * frontierTerrainscale.x;
      vec2 soilUv = vMapUv * frontierTerrainscale.y;
      vec2 rockUv = vMapUv * frontierTerrainscale.z;
      vec3 grassMicro = texture2D(frontierTerraingrass, grassUv).rgb;
      vec3 grassMeso = texture2D(frontierTerraingrass, grassUv * 0.16 + vec2(0.19, 0.43)).rgb;
      vec3 grassMacro = texture2D(frontierTerraingrass, grassUv * 0.045 + vec2(0.61, 0.27)).rgb;
      vec3 grassSample = mix(mix(grassMicro, grassMeso, 0.48), grassMacro, 0.28);
      grassSample = clamp((grassSample - 0.5) * 1.32 + 0.5, 0.05, 1.35);
      vec3 soilSample = mix(texture2D(frontierTerrainsoil, soilUv).rgb, texture2D(frontierTerrainsoil, soilUv * 0.18 + vec2(0.31, 0.17)).rgb, 0.42);
      vec3 triW = pow(abs(vTerrainWorldNormal), vec3(4.0));
      triW /= max(triW.x + triW.y + triW.z, 0.001);
      vec3 rockTop = mix(texture2D(frontierTerrainrock, rockUv * 5.5).rgb, texture2D(frontierTerrainrock, rockUv * 15.0 + vec2(0.23, 0.41)).rgb, 0.46);
      vec3 rockSideX = texture2D(frontierTerrainrock, vTerrainWorldPos.zy * 0.085).rgb;
      vec3 rockSideZ = texture2D(frontierTerrainrock, vTerrainWorldPos.xy * 0.085 + vec2(0.37, 0.19)).rgb;
      vec3 rockSample = rockSideX * triW.x + rockTop * triW.y + rockSideZ * triW.z;
      vec3 sampleLuma = vec3(dot(grassSample, vec3(0.3, 0.59, 0.11)), dot(soilSample, vec3(0.3, 0.59, 0.11)), dot(rockSample, vec3(0.3, 0.59, 0.11)) + 0.16);
      terrainBlend = frontierHeightBlend(terrainBlend, sampleLuma);
      vec3 terrainMacro = mix(vec3(1.0), clamp(diffuseColor.rgb / frontierTerrainmacroReference, vec3(0.68), vec3(1.26)), frontierTerrainmacroStrength);
      float cloverDapple = sin(vTerrainWorldPos.x * 0.42 + vTerrainWorldPos.z * 0.36) * cos(vTerrainWorldPos.x * 0.29 - vTerrainWorldPos.z * 0.48);
      float tuftGrain = sin(vTerrainWorldPos.x * 2.8 + cos(vTerrainWorldPos.z * 2.1)) * cos(vTerrainWorldPos.z * 2.6 - sin(vTerrainWorldPos.x * 1.9));
      vec3 lushGrass = grassSample * frontierTerraingrassTint * terrainMacro * mix(vec3(0.88, 0.94, 0.84), vec3(1.08, 1.12, 0.94), smoothstep(-0.42, 0.48, cloverDapple)) * (0.96 + 0.09 * tuftGrain);
      if (frontierTerrainbiomeFlags.x > 0.5) {
        float driftWave = sin(vTerrainWorldPos.x * 0.42 - vTerrainWorldPos.z * 0.19 + sin(vTerrainWorldPos.z * 0.14) * 1.3);
        float snowSparkle = sin(vTerrainWorldPos.x * 4.3 + vTerrainWorldPos.z * 3.7) * cos(vTerrainWorldPos.z * 4.1 - vTerrainWorldPos.x * 3.2);
        float snowMask = mix(0.86, 1.04, smoothstep(-0.6, 0.65, driftWave)) * (0.97 + 0.045 * snowSparkle);
        vec3 snowBase = mix(vec3(0.86, 0.91, 0.96), vec3(0.99, 1.0, 1.02), smoothstep(-0.5, 0.5, driftWave));
        lushGrass = mix(lushGrass, grassSample * snowBase * snowMask * terrainMacro, 0.85);
      } else if (frontierTerrainbiomeFlags.y > 0.5) {
        float sandRipple = sin(vTerrainWorldPos.x * 3.4 + vTerrainWorldPos.z * 1.3 + sin(vTerrainWorldPos.z * 0.6) * 1.4);
        vec3 aridShade = mix(vec3(0.88, 0.72, 0.48), vec3(1.12, 0.96, 0.70), smoothstep(-0.7, 0.7, sandRipple));
        vec3 sandGrain = mix(soilSample, grassSample, 0.28) * frontierTerraingrassTint * aridShade * terrainMacro;
        lushGrass = mix(lushGrass, sandGrain, 0.72);
      } else if (frontierTerrainbiomeFlags.z > 0.5) {
        float ashNoise = sin(vTerrainWorldPos.x * 1.8 - vTerrainWorldPos.z * 1.4) * cos(vTerrainWorldPos.z * 1.5 + vTerrainWorldPos.x * 1.2);
        vec3 ashBase = soilSample * frontierTerraingrassTint * mix(vec3(0.76, 0.72, 0.70), vec3(1.06, 0.98, 0.94), smoothstep(-0.5, 0.5, ashNoise)) * terrainMacro;
        lushGrass = mix(lushGrass, ashBase, 0.68);
      }
      float strataWarp = sin(vTerrainWorldPos.x * 0.19) * 1.5 + cos(vTerrainWorldPos.z * 0.19) * 1.5;
      float strata = 0.84 + 0.20 * sin(vTerrainWorldPos.y * 6.4 + strataWarp) + 0.08 * cos(vTerrainWorldPos.y * 15.2 + strataWarp * 1.7);
      float crevice = smoothstep(0.42, 0.88, sin(vTerrainWorldPos.x * 1.45 - vTerrainWorldPos.y * 2.6) * cos(vTerrainWorldPos.z * 1.45 + vTerrainWorldPos.y * 2.3));
      float ledgeDust = smoothstep(0.64, 0.90, vTerrainNormalY);
      vec3 rawRock = rockSample * frontierTerraincliffTint * strata * (1.0 - crevice * 0.34);
      if (frontierTerrainbiomeFlags.z > 0.5) {
        float emberMask = smoothstep(0.62, 0.92, crevice) * smoothstep(0.22, 0.75, terrainBlend.z) * (1.0 - ledgeDust);
        rawRock += vec3(1.35, 0.38, 0.08) * emberMask * 0.55;
      }
      vec3 finalRock = mix(rawRock, lushGrass * 0.90, ledgeDust * 0.36);
      vec3 finalSoil = soilSample * frontierTerrainsoilTint * mix(1.0, 0.72, terrainShore) * mix(1.0, 0.88, terrainRoad);
      if (frontierTerrainbiomeFlags.w > 0.5 && terrainBeach > 0.01) {
        float swashRipple = sin(vTerrainWorldPos.x * 2.9 + vTerrainWorldPos.z * 1.7 + sin(vTerrainWorldPos.z * 0.45) * 1.2);
        vec3 beachSand = mix(vec3(0.51, 0.43, 0.29), vec3(0.72, 0.63, 0.44), smoothstep(-0.6, 0.6, swashRipple)) * mix(1.0, 0.76, terrainShore);
        finalSoil = mix(finalSoil, beachSand * (0.68 + 0.54 * dot(soilSample, vec3(0.3, 0.59, 0.11))), terrainBeach);
      }
      vec3 terrainColor = lushGrass * terrainBlend.x + finalSoil * terrainBlend.y + finalRock * terrainBlend.z;
      float packedGround = max(terrainPaving * 0.72, terrainRoad * 0.24);
      diffuseColor.rgb = mix(diffuseColor.rgb, terrainColor * frontierTerraintint, frontierTerrainamount * (1.0 - packedGround));`);
    shader.fragmentShader=shader.fragmentShader.replace('#include <normal_fragment_maps>',`
      #ifdef USE_NORMALMAP_TANGENTSPACE
      vec3 grassNorm = mix(texture2D(frontierTerraingrassNormal, vMapUv * frontierTerrainscale.x).xyz, texture2D(frontierTerraingrassNormal, vMapUv * frontierTerrainscale.x * 0.16).xyz, 0.45);
      vec3 soilNorm = mix(texture2D(frontierTerrainsoilNormal, vMapUv * frontierTerrainscale.y).xyz, texture2D(frontierTerrainsoilNormal, vMapUv * frontierTerrainscale.y * 0.18).xyz, 0.4);
      vec3 rockNorm = texture2D(frontierTerrainrockNormal, vMapUv * frontierTerrainscale.z * 6.5).xyz;
      vec3 terrainNormal = grassNorm * terrainBlend.x + soilNorm * terrainBlend.y + rockNorm * terrainBlend.z;
      terrainNormal = terrainNormal * 2.0 - 1.0;
      terrainNormal.xy *= mix(0.48, 0.76, terrainBlend.z) * (1.0 - terrainPaving * 0.52);
      normal = normalize(tbn * terrainNormal);
      #endif`);
    shader.fragmentShader=shader.fragmentShader.replace('#include <roughnessmap_fragment>',`#include <roughnessmap_fragment>
      #ifdef FRONTIER_TERRAIN_ARM
      float terrainRoughness = texture2D(frontierTerraingrassArm, vMapUv * frontierTerrainscale.x * 0.16).g * terrainBlend.x
        + texture2D(frontierTerrainsoilArm, vMapUv * frontierTerrainscale.y * 0.18).g * terrainBlend.y
        + texture2D(frontierTerrainrockArm, vMapUv * frontierTerrainscale.z * 6.5).g * terrainBlend.z;
      terrainRoughness = mix(terrainRoughness, 0.34, terrainShore * 0.55);
      terrainRoughness = mix(terrainRoughness, 0.48, frontierTerrainbiomeFlags.x * 0.35);
      roughnessFactor *= mix(clamp(terrainRoughness, 0.22, 1.0), 0.94, terrainPaving);
      #endif`);
  };
  material.customProgramCacheKey=()=>`frontier-terrain-v9:${land.map}:${land.renderSize}:${quality}`;
  material.userData.surface='Locally bundled natural grass, soil and rocky terrain';
  material.needsUpdate=true;
}
