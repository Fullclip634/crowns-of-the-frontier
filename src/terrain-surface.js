import * as THREE from 'three';
import {nodeRuntime} from './render-runtime.js';
import {terrainRoadPaths,strokeTaperedRoad,paintSettlementPaving} from './terrain-layout.js';
import {terrainBiome,isSnowBiome,isAridBiome,isRockyBiome} from './terrain-biomes.js';
import {createAtmosphereUniforms,CLOUD_SHADOW_GLSL} from './atmosphere-uniforms.js';

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
      const coveWave=Math.sin(z*.11+channel.center*.7)*1.85+Math.cos(z*.23-channel.center*.4)*.95+Math.sin(z*.47)*.42;
      const bankWidth=beach?Math.max(2.6,5.2+coveWave):Math.max(2.2,3.1+Math.sin(z*.18+channel.center)*.55);
      const left=Math.max(0,Math.floor((center-channel.width-bankWidth+half)*scale));
      const right=Math.min(size-1,Math.ceil((center+channel.width+bankWidth+half)*scale));
      for(let column=left;column<=right;column++){
        const side=(column+.5)/scale-half-center>=0?1:-1;
        const sideWave=beach?Math.sin(z*.15*side+side*1.3)*.75:0;
        const distance=Math.abs((column+.5)/scale-half-center)-channel.width;
        const i=(row*size+column)*4;
        if(beach)pixels[i+1]=Math.max(pixels[i+1],224*fade(distance,Math.max(2.2,bankWidth+sideWave)));
        pixels[i+2]=Math.max(pixels[i+2],220*fade(distance+1.25,Math.max(2.0,bankWidth+sideWave*.5)));
      }
    }
    ctx.putImageData(mask,0,0);
  }
  // Red values above the lane range identify the flagstone pads; twin wheel ruts
  // stay <= 196 so cart tracks read with a grassy center crown and never trigger paving.
  for(const road of paths){
    const wheelOffset=(road.local?.62:.92)*scale,rutWidth=(road.local?.74:.96)*scale;
    strokeTaperedRoad(ctx,road.points,{half,size:land.worldSize,canvasSize:size,connected:road.connected,layers:[
      {width:(road.local?3.4:4.9)*scale,rgba:t=>`rgba(196,0,0,${(.28*t).toFixed(3)})`},
      {width:(road.local?1.2:1.6)*scale,rgba:t=>`rgba(196,0,0,${(.30*t).toFixed(3)})`},
      {width:rutWidth,offset:-wheelOffset,rgba:t=>`rgba(196,0,0,${(.82*t).toFixed(3)})`},
      {width:rutWidth,offset:wheelOffset,rgba:t=>`rgba(196,0,0,${(.82*t).toFixed(3)})`},
    ],gravelColor:a=>`rgba(196,0,0,${a.toFixed(3)})`});
  }
  paintSettlementPaving(ctx,land,half,scale,true);
  ctx.fillStyle='#000';
  for(const edge of [0,size-1]){ctx.fillRect(edge,0,1,size);ctx.fillRect(0,edge,size,1);}
  const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.NoColorSpace;return texture;
}

export function applyTerrainShading(material,land,quality,surfaces,dimensions,atmosphere=null){
  const grass=surfaces.grass;if(!grass?.color)return;
  const soil=surfaces.soil||grass,rock=surfaces.rock||grass,paving=surfaces.paving||surfaces.stone||rock,normal=quality!=='low'&&grass.normal;
  material.bumpMap?.dispose();material.bumpMap=null;
  material.normalMap=normal||null;material.roughnessMap=null;
  const snow=isSnowBiome(land.map),arid=isAridBiome(land.map),volcanic=land.map==='volcanic',rocky=isRockyBiome(land.map),shore=land.map==='coast'||land.map==='archipelago',biome=terrainBiome(land.map);
  const amount=snow?.74:arid?.88:rocky?.92:.86;
  for(const texture of material.frontierOwnedTextures||[])texture.dispose();
  const roads=roadMask(land);material.frontierOwnedTextures=[roads];
  const atm=atmosphere||createAtmosphereUniforms();
  const uniforms={
    grass:{value:grass.color},soil:{value:soil.color||grass.color},rock:{value:rock.color||grass.color},
    paving:{value:paving.color||rock.color||grass.color},
    grassNormal:{value:normal||null},soilNormal:{value:normal?(soil.normal||grass.normal):null},rockNormal:{value:normal?(rock.normal||grass.normal):null},
    grassArm:{value:quality==='high'?grass.arm||null:null},soilArm:{value:quality==='high'?soil.arm||grass.arm||null:null},rockArm:{value:quality==='high'?rock.arm||grass.arm||null:null},
    scale:{value:new THREE.Vector3(land.renderSize/(dimensions.grass||2),land.renderSize/(dimensions.soil||1.3),land.renderSize/(dimensions.rock||90))},
    amount:{value:amount},tint:{value:new THREE.Color(snow?0xf3f7fa:arid?0xf0e4ca:rocky?0xe2e4dc:0xe4e9dc)},grassTint:{value:new THREE.Color(biome.grassTint)},
    soilTint:{value:new THREE.Color(snow?0xd2dcd8:volcanic?0x665a52:arid?0xcfa972:shore?0xd4c298:0xc2b69c)},
    macroReference:{value:new THREE.Color(biome.ground[0])},macroStrength:{value:snow?.52:1},
    cliffTint:{value:new THREE.Color(biome.cliff||0x86847c)},
    plazaTint:{value:new THREE.Color(biome.plaza||0x9d998c)},
    biomeFlags:{value:new THREE.Vector4(snow?1:0,arid&&!volcanic?1:0,volcanic?1:0,shore?1:0)},
    roads:{value:roads},
    cloudMap:atm.cloudMap,cloudOffset:atm.cloudOffset,cloudScale:atm.cloudScale,cloudStrength:atm.cloudStrength,
    wetness:atm.wetness,iblSky:atm.iblSky,
    atmosphere:atm,
  };
  material.frontierTerrainUniforms=uniforms;
  material.defines={...material.defines};delete material.defines.FRONTIER_TERRAIN_ARM;
  if(quality==='high')material.defines.FRONTIER_TERRAIN_ARM='';
  if(material.isNodeMaterial){nodeRuntime().terrain(material,uniforms);return;}
  const desert=arid&&!volcanic;
  const beachDeclGlsl=shore
    ? 'float terrainBeach = smoothstep(0.06, 0.76, roadSample.g + edgeNoise * 0.55 * roadSample.g) * (1.0 - smoothstep(0.32, 0.80, terrainBlend.z)) * (1.0 - terrainRoad * 0.85);'
    : 'float terrainBeach = 0.0;';
  const grassGlsl=snow ? `
      // Real CC0 snow_02 albedo with cool wind-drifted troughs and sunlit alpine crests.
      float driftWave = sin(vTerrainWorldPos.x * 0.36 - vTerrainWorldPos.z * 0.18 + sin(vTerrainWorldPos.z * 0.13) * 1.4);
      float snowSparkle = sin(vTerrainWorldPos.x * 5.1 + vTerrainWorldPos.z * 4.3) * cos(vTerrainWorldPos.z * 4.7 - vTerrainWorldPos.x * 3.8);
      vec3 snowTint = mix(vec3(0.84, 0.91, 0.98), vec3(1.03, 1.04, 1.06), smoothstep(-0.65, 0.65, driftWave));
      vec3 lushGrass = grassSample * snowTint * (0.97 + 0.04 * snowSparkle) * mix(vec3(1.0), terrainMacro, 0.65);`
    : desert ? `
      // Real CC0 sand_01 albedo with wind-carved dune warmth and dry desert grit.
      float sandRipple = sin(vTerrainWorldPos.x * 2.8 + vTerrainWorldPos.z * 1.15 + sin(vTerrainWorldPos.z * 0.45) * 1.6);
      vec3 duneShade = mix(vec3(0.92, 0.80, 0.62), vec3(1.10, 0.99, 0.80), smoothstep(-0.7, 0.7, sandRipple));
      vec3 lushGrass = grassSample * mix(vec3(1.0), frontierTerraingrassTint * 1.18, 0.48) * duneShade * terrainMacro;`
    : volcanic ? `
      // Real CC0 dark rock_face_03 basalt crust with organic ash & fissure soot.
      float ashDrift = sin(vTerrainWorldPos.x * 0.52 - vTerrainWorldPos.z * 0.39 + sin(vTerrainWorldPos.z * 0.25) * 1.5);
      vec3 lushGrass = mix(grassSample, soilSample * 0.85, 0.30) * frontierTerraingrassTint * mix(vec3(0.76, 0.72, 0.70), vec3(1.06, 0.99, 0.94), smoothstep(-0.55, 0.55, ashDrift)) * terrainMacro;`
    : `
      float cloverDapple = sin(vTerrainWorldPos.x * 0.42 + vTerrainWorldPos.z * 0.36) * cos(vTerrainWorldPos.x * 0.29 - vTerrainWorldPos.z * 0.48);
      float tuftGrain = sin(vTerrainWorldPos.x * 2.8 + cos(vTerrainWorldPos.z * 2.1)) * cos(vTerrainWorldPos.z * 2.6 - sin(vTerrainWorldPos.x * 1.9));
      vec3 lushGrass = grassSample * frontierTerraingrassTint * terrainMacro * mix(vec3(0.88, 0.94, 0.84), vec3(1.08, 1.12, 0.94), smoothstep(-0.42, 0.48, cloverDapple)) * (0.96 + 0.09 * tuftGrain);`;
  const rockGlsl=volcanic ? `
      float crevice = frontierVolcanicFissure(vTerrainWorldPos);
      float ledgeDust = smoothstep(0.66, 0.91, vTerrainNormalY);
      vec3 rawRock = rockSample * frontierTerraincliffTint * strata * (1.0 - crevice * 0.42);
      // Dark charred volcanic basalt with molten fissures concentrated on rocky slopes & ravines.
      rawRock *= vec3(0.74, 0.72, 0.74);
      float slopeCrag = 1.0 - smoothstep(0.76, 0.96, vTerrainNormalY);
      float emberMask = smoothstep(0.28, 0.86, crevice) * smoothstep(0.32, 0.78, terrainBlend.z) * (0.22 + 0.78 * slopeCrag);
      float coreHot = smoothstep(0.62, 0.95, crevice) * emberMask;
      rawRock += (vec3(1.65, 0.34, 0.04) * emberMask * 0.78 + vec3(2.1, 1.05, 0.30) * coreHot * 0.75);`
    : `
      float crevice = smoothstep(0.42, 0.88, sin(vTerrainWorldPos.x * 1.45 - vTerrainWorldPos.y * 2.6) * cos(vTerrainWorldPos.z * 1.45 + vTerrainWorldPos.y * 2.3));
      float ledgeDust = smoothstep(0.66, 0.91, vTerrainNormalY);
      vec3 rawRock = rockSample * frontierTerraincliffTint * strata * (1.0 - crevice * 0.42);`;
  const beachSoilGlsl=shore ? `
      if (terrainBeach > 0.01) {
        // Real CC0 sand_01 coastal cove sand with dark wet swash zone near the waterline.
        float swashRipple = sin(vTerrainWorldPos.x * 2.6 + vTerrainWorldPos.z * 1.5 + sin(vTerrainWorldPos.z * 0.42) * 1.3);
        vec3 beachWarmth = mix(vec3(0.86, 0.78, 0.60), vec3(1.08, 0.99, 0.80), smoothstep(-0.65, 0.65, swashRipple));
        vec3 beachSand = soilSample * beachWarmth * mix(1.0, 0.68, terrainShore);
        finalSoil = mix(finalSoil, beachSand, terrainBeach);
      }` : '';
  const snowRoughGlsl=snow ? 'terrainRoughness = mix(terrainRoughness, 0.44, 0.38);' : '';
  material.onBeforeCompile=shader=>{
    for(const [key,value]of Object.entries(uniforms))if(key!=='atmosphere')shader.uniforms['frontierTerrain'+key]=value;
    shader.vertexShader='attribute vec3 terrainMix;\nvarying vec3 vTerrainMix;\nvarying vec3 vTerrainWorldPos;\nvarying vec3 vTerrainWorldNormal;\nvarying float vTerrainNormalY;\n'+shader.vertexShader;
    shader.vertexShader=shader.vertexShader.replace('#include <color_vertex>','#include <color_vertex>\nvTerrainMix = terrainMix;\nvTerrainWorldPos = position;\nvTerrainWorldNormal = normalize(normal);\nvTerrainNormalY = normal.y;');
    shader.fragmentShader=`varying vec3 vTerrainMix;
      varying vec3 vTerrainWorldPos;
      varying vec3 vTerrainWorldNormal;
      varying float vTerrainNormalY;
      uniform sampler2D frontierTerraingrass;
      uniform sampler2D frontierTerrainsoil;
      uniform sampler2D frontierTerrainrock;
      uniform sampler2D frontierTerrainpaving;
      uniform sampler2D frontierTerraingrassNormal;
      uniform sampler2D frontierTerrainsoilNormal;
      uniform sampler2D frontierTerrainrockNormal;
      uniform sampler2D frontierTerraingrassArm;
      uniform sampler2D frontierTerrainsoilArm;
      uniform sampler2D frontierTerrainrockArm;
      uniform sampler2D frontierTerrainroads;
      uniform sampler2D frontierTerraincloudMap;
      uniform vec2 frontierTerraincloudOffset;
      uniform float frontierTerraincloudScale;
      uniform float frontierTerraincloudStrength;
      uniform float frontierTerrainwetness;
      uniform vec3 frontierTerrainiblSky;
      uniform vec3 frontierTerrainscale;
      uniform vec3 frontierTerraintint;
      uniform vec3 frontierTerraingrassTint;
      uniform vec3 frontierTerrainsoilTint;
      uniform vec3 frontierTerrainmacroReference;
      uniform vec3 frontierTerraincliffTint;
      uniform vec3 frontierTerrainplazaTint;
      uniform vec4 frontierTerrainbiomeFlags;
      uniform float frontierTerrainmacroStrength;
      uniform float frontierTerrainamount;
      vec3 frontierHeightBlend(vec3 weights, vec3 heights) {
        vec3 h = weights * pow(max(heights, vec3(0.06)), vec3(2.35));
        return h / max(dot(h, vec3(1.0)), 0.001);
      }
      float frontierVolcanicFissure(vec3 p) {
        // Multi-frequency jagged basalt fractures broken into localized magma pockets.
        vec2 q = p.xz * 0.34 + vec2(p.y * 0.42, -p.y * 0.36);
        vec2 warp = vec2(
          sin(q.x * 2.1 + cos(q.y * 1.9)) * 0.72 + cos(q.y * 4.3 - q.x * 3.1) * 0.28,
          cos(q.y * 2.3 - sin(q.x * 2.0)) * 0.72 + sin(q.x * 4.1 + q.y * 3.3) * 0.28
        );
        vec2 w = q + warp * 0.58;
        float jag = sin(w.x * 5.7 - w.y * 4.9) * 0.16 + cos(w.x * 8.3 + w.y * 7.1) * 0.09;
        float ridgeA = abs(sin(w.x * 1.65 + w.y * 1.05 + jag) + cos(w.x * 0.92 - w.y * 1.75 - jag));
        float ridgeB = abs(sin(w.x * 3.4 - w.y * 2.5 + jag * 1.4) + cos(w.y * 3.1 + w.x * 2.2));
        float crackA = 1.0 - smoothstep(0.015, 0.15, ridgeA);
        float crackB = (1.0 - smoothstep(0.015, 0.12, ridgeB)) * 0.50;
        // Localized volcanic pockets so fissures break naturally instead of forming endless contour loops.
        float pocket = smoothstep(0.18, 0.72, sin(p.x * 0.085 + cos(p.z * 0.072) * 1.8) * cos(p.z * 0.081 - sin(p.x * 0.068) * 1.5) * 0.5 + 0.5);
        return clamp(max(crackA, crackB) * pocket, 0.0, 1.0);
      }
      ${CLOUD_SHADOW_GLSL}\n`+shader.fragmentShader;
    shader.fragmentShader=shader.fragmentShader.replace('#include <map_fragment>',`#include <map_fragment>
      vec3 terrainBlend = max(vTerrainMix, vec3(0.0));
      vec3 roadSample = texture2D(frontierTerrainroads, vMapUv * 2.0 - 0.5).rgb;
      float terrainPaving = smoothstep(0.81, 0.99, roadSample.r);
      float roadStrength = min(roadSample.r * 1.30, 1.0);
      float edgeNoise = sin(vTerrainWorldPos.x * 1.45 + vTerrainWorldPos.z * 1.15) * cos(vTerrainWorldPos.x * 0.85 - vTerrainWorldPos.z * 1.65) * 0.14;
      float terrainRoad = smoothstep(0.08, 0.88, roadStrength + edgeNoise * roadStrength);
      float terrainShore = smoothstep(0.05, 0.75, roadSample.b) * (1.0 - smoothstep(0.35, 0.85, terrainBlend.z));
      ${beachDeclGlsl}
      terrainBlend = mix(terrainBlend, vec3(0.0, 1.0, 0.0), clamp(terrainRoad * 0.78 + ${shore?'max(terrainShore, terrainBeach)':'terrainShore'} * 0.68, 0.0, 0.94));
      vec2 grassUv = vMapUv * frontierTerrainscale.x;
      vec2 soilUv = vMapUv * frontierTerrainscale.y;
      vec2 rockUv = vMapUv * frontierTerrainscale.z;
      const mat2 antiTileRot = mat2(0.836, -0.548, 0.548, 0.836);
      vec3 grassMicro = texture2D(frontierTerraingrass, grassUv).rgb;
      vec3 grassMeso = texture2D(frontierTerraingrass, antiTileRot * (grassUv * 0.17) + vec2(0.19, 0.43)).rgb;
      vec3 grassMacro = texture2D(frontierTerraingrass, grassUv * 0.048 + vec2(0.61, 0.27)).rgb;
      vec3 grassSample = mix(mix(grassMicro, grassMeso, 0.46), grassMacro, 0.28);
      grassSample = clamp((grassSample - 0.5) * 1.28 + 0.5, 0.05, 1.35);
      vec3 soilSample = mix(texture2D(frontierTerrainsoil, soilUv).rgb, texture2D(frontierTerrainsoil, antiTileRot * (soilUv * 0.19) + vec2(0.31, 0.17)).rgb, 0.44);
      vec3 triW = pow(abs(vTerrainWorldNormal), vec3(4.5));
      triW /= max(triW.x + triW.y + triW.z, 0.001);
      vec3 rockTop = mix(texture2D(frontierTerrainrock, rockUv * 5.5).rgb, texture2D(frontierTerrainrock, antiTileRot * (rockUv * 13.5) + vec2(0.23, 0.41)).rgb, 0.44);
      vec3 rockSideX = texture2D(frontierTerrainrock, vTerrainWorldPos.zy * 0.088).rgb;
      vec3 rockSideZ = texture2D(frontierTerrainrock, vTerrainWorldPos.xy * 0.088 + vec2(0.37, 0.19)).rgb;
      vec3 rockSample = rockSideX * triW.x + rockTop * triW.y + rockSideZ * triW.z;
      vec3 sampleLuma = vec3(dot(grassSample, vec3(0.3, 0.59, 0.11)), dot(soilSample, vec3(0.3, 0.59, 0.11)), dot(rockSample, vec3(0.3, 0.59, 0.11)) + 0.16);
      terrainBlend = frontierHeightBlend(terrainBlend, sampleLuma);
      vec3 terrainMacro = mix(vec3(1.0), clamp(diffuseColor.rgb / frontierTerrainmacroReference, vec3(0.68), vec3(1.26)), frontierTerrainmacroStrength);${grassGlsl}
      float strataWarp = sin(vTerrainWorldPos.x * 0.19) * 1.5 + cos(vTerrainWorldPos.z * 0.19) * 1.5;
      float strata = 0.84 + 0.20 * sin(vTerrainWorldPos.y * 6.4 + strataWarp) + 0.08 * cos(vTerrainWorldPos.y * 15.2 + strataWarp * 1.7);${rockGlsl}
      vec3 finalRock = mix(rawRock, lushGrass * 0.90, ledgeDust * ${snow?'0.58':'0.34'});
      vec3 finalSoil = soilSample * frontierTerrainsoilTint * mix(1.0, 0.70, terrainShore) * mix(1.0, 0.88, terrainRoad);${beachSoilGlsl}
      vec3 terrainColor = lushGrass * terrainBlend.x + finalSoil * terrainBlend.y + finalRock * terrainBlend.z;
      // Real 1k CC0 medieval flagstone cobblestone plazas around settlements.
      float pavingLuma = 0.5;
      float pavingAo = 1.0;
      if (terrainPaving > 0.01) {
        vec2 pavingUv = vTerrainWorldPos.xz * 0.36;
        vec3 pavingBase = texture2D(frontierTerrainpaving, pavingUv).rgb;
        vec3 pavingVar = texture2D(frontierTerrainpaving, antiTileRot * (pavingUv * 0.31) + vec2(0.41, 0.19)).rgb;
        vec3 pavingTex = mix(pavingBase, pavingVar, 0.22);
        pavingLuma = dot(pavingTex, vec3(0.3, 0.59, 0.11));
        pavingAo = mix(0.72, 1.04, smoothstep(0.16, 0.68, pavingLuma));
        // Subtle soil/moss in mortar seams near courtyard perimeter so plazas blend naturally.
        float mortar = 1.0 - smoothstep(0.18, 0.44, pavingLuma);
        float edgeWear = (1.0 - smoothstep(0.25, 0.88, terrainPaving)) * 0.65;
        vec3 plazaColor = pavingTex * mix(vec3(1.0), frontierTerrainplazaTint * 1.25, 0.45) * pavingAo;
        plazaColor = mix(plazaColor, finalSoil * 0.85, clamp(mortar * 0.32 + edgeWear * 0.48, 0.0, 0.75));
        terrainColor = mix(terrainColor, plazaColor, terrainPaving * 0.90);
      }
      float packedGround = terrainRoad * 0.18 * (1.0 - terrainPaving * 0.85);
      diffuseColor.rgb = mix(diffuseColor.rgb, terrainColor * frontierTerraintint, frontierTerrainamount * (1.0 - packedGround));
      float rainDarken = mix(1.0, 0.78, frontierTerrainwetness * (0.45 + 0.55 * max(terrainRoad, max(terrainPaving, terrainBlend.z))));
      diffuseColor.rgb *= rainDarken * frontierCloudLight(vTerrainWorldPos.xz, frontierTerraincloudMap, frontierTerraincloudOffset, frontierTerraincloudScale, frontierTerraincloudStrength, frontierTerrainiblSky);`);
    shader.fragmentShader=shader.fragmentShader.replace('#include <normal_fragment_maps>',`
      #ifdef USE_NORMALMAP_TANGENTSPACE
      vec3 grassNorm = mix(texture2D(frontierTerraingrassNormal, vMapUv * frontierTerrainscale.x).xyz, texture2D(frontierTerraingrassNormal, vMapUv * frontierTerrainscale.x * 0.17).xyz, 0.44);
      vec3 soilNorm = mix(texture2D(frontierTerrainsoilNormal, vMapUv * frontierTerrainscale.y).xyz, texture2D(frontierTerrainsoilNormal, vMapUv * frontierTerrainscale.y * 0.19).xyz, 0.40);
      vec3 rockNormTop = texture2D(frontierTerrainrockNormal, vMapUv * frontierTerrainscale.z * 6.5).xyz;
      vec3 rockNormX = texture2D(frontierTerrainrockNormal, vTerrainWorldPos.zy * 0.088).xyz;
      vec3 rockNormZ = texture2D(frontierTerrainrockNormal, vTerrainWorldPos.xy * 0.088 + vec2(0.37, 0.19)).xyz;
      vec3 rockNorm = rockNormX * triW.x + rockNormTop * triW.y + rockNormZ * triW.z;
      vec3 terrainNormal = grassNorm * terrainBlend.x + soilNorm * terrainBlend.y + rockNorm * terrainBlend.z;
      terrainNormal = terrainNormal * 2.0 - 1.0;
      terrainNormal.xy *= mix(0.52, 0.86, terrainBlend.z) * (1.0 - terrainPaving * 0.55);
      vec2 pavingBump = vec2(dFdx(pavingLuma), dFdy(pavingLuma)) * 10.0;
      terrainNormal.xy += clamp(pavingBump, vec2(-0.48), vec2(0.48)) * smoothstep(0.08, 0.38, terrainPaving);
      normal = normalize(tbn * terrainNormal);
      #endif`);
    shader.fragmentShader=shader.fragmentShader.replace('#include <roughnessmap_fragment>',`#include <roughnessmap_fragment>
      float terrainAo = 1.0;
      #ifdef FRONTIER_TERRAIN_ARM
      vec2 grassArmSample = texture2D(frontierTerraingrassArm, vMapUv * frontierTerrainscale.x * 0.17).rg;
      vec2 soilArmSample = texture2D(frontierTerrainsoilArm, vMapUv * frontierTerrainscale.y * 0.19).rg;
      vec2 rockArmSample = texture2D(frontierTerrainrockArm, vMapUv * frontierTerrainscale.z * 6.5).rg;
      vec2 terrainArm = grassArmSample * terrainBlend.x + soilArmSample * terrainBlend.y + rockArmSample * terrainBlend.z;
      terrainAo = mix(1.0, terrainArm.r, 0.65);
      float terrainRoughness = terrainArm.g;
      terrainRoughness = mix(terrainRoughness, 0.30, terrainShore * 0.62);
      ${snowRoughGlsl}
      float pavingRough = mix(0.92, 0.62, smoothstep(0.22, 0.78, pavingLuma));
      roughnessFactor *= mix(clamp(terrainRoughness, 0.22, 1.0), pavingRough, terrainPaving);
      #endif
      terrainAo *= mix(1.0, pavingAo, terrainPaving * 0.85);
      float wetSurface = frontierTerrainwetness * (0.35 + 0.65 * max(terrainRoad, max(terrainPaving, terrainBlend.z)));
      roughnessFactor = clamp(mix(roughnessFactor, 0.22, wetSurface * 0.74), 0.16, 1.0);`);
    shader.fragmentShader=shader.fragmentShader.replace('#include <aomap_fragment>','#include <aomap_fragment>\nreflectedLight.indirectDiffuse *= terrainAo;');
  };
  material.customProgramCacheKey=()=>`frontier-terrain-v11:${land.map}:${land.renderSize}:${quality}`;
  material.userData.surface='Locally bundled biome-authentic PBR grass, snow, sand, basalt, cobblestone and rocky terrain';
  material.needsUpdate=true;
}
