import * as THREE from 'three';
import {nodeRuntime} from './render-runtime.js';
import {terrainRoadPaths} from './terrain-layout.js';
import {terrainBiome,isSnowBiome,isAridBiome,isRockyBiome} from './terrain-biomes.js';

function strokeRing(ctx,cx,cz,r,width,color){
  ctx.strokeStyle=color;ctx.lineWidth=width;ctx.beginPath();
  for(let i=0;i<=16;i++){const a=i*Math.PI/8,x=cx+Math.cos(a)*r,y=cz+Math.sin(a)*r;if(i===0)ctx.moveTo(x,y);else ctx.lineTo(x,y);}
  ctx.stroke();
}

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
  // G channel: cobblestone/flagstone plazas under settlements and outbuildings.
  for(const settlement of land.settlements||[]){
    const cx=(settlement.x+half)*scale,cz=(settlement.z+half)*scale;
    for(const [r,w,alpha] of [[3.5,8*scale,0.95],[9.5,7.5*scale,0.82],[15.5,6.5*scale,0.58],[21,5.5*scale,0.28]]){
      strokeRing(ctx,cx,cz,r*scale,w,`rgba(0,255,0,${alpha})`);
    }
  }
  // R channel: wheel-rutted cart roads with softer shoulder and grassy median strip.
  for(const road of paths){
    for(const [width,color] of [[4.8*scale,'rgba(255,48,0,0.42)'],[3.2*scale,'rgba(255,95,0,0.94)'],[0.95*scale,'rgba(110,40,0,0.65)']]){
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
  const amount=snow?.24:arid?.68:rocky?.9:.82;
  for(const texture of material.frontierOwnedTextures||[])texture.dispose();
  const roads=roadMask(land);material.frontierOwnedTextures=[roads];
  const uniforms={
    grass:{value:grass.color},soil:{value:soil.color||grass.color},rock:{value:rock.color||grass.color},
    grassNormal:{value:normal||null},soilNormal:{value:normal?(soil.normal||grass.normal):null},rockNormal:{value:normal?(rock.normal||grass.normal):null},
    grassArm:{value:quality==='high'?grass.arm||null:null},soilArm:{value:quality==='high'?soil.arm||grass.arm||null:null},rockArm:{value:quality==='high'?rock.arm||grass.arm||null:null},
    scale:{value:new THREE.Vector3(land.renderSize/(dimensions.grass||2),land.renderSize/(dimensions.soil||1.3),land.renderSize/(dimensions.rock||90))},
    amount:{value:amount},tint:{value:new THREE.Color(snow?0xe5eae0:arid?0xeadec2:rocky?0xdcded4:0xe2e7da)},grassTint:{value:new THREE.Color(biome.grassTint)},
    macroReference:{value:new THREE.Color(biome.ground[0])},macroStrength:{value:snow?0:1},
    plazaTint:{value:new THREE.Color(biome.plaza||0x9d998c)},cliffTint:{value:new THREE.Color(biome.cliff||0x86847c)},
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
      uniform vec3 frontierTerrainplazaTint;
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
      float terrainRoad = roadSample.r;
      float terrainPlaza = smoothstep(0.08, 0.72, roadSample.g);
      float terrainShore = smoothstep(0.05, 0.75, roadSample.b) * (1.0 - smoothstep(0.35, 0.85, terrainBlend.z));
      terrainBlend = mix(terrainBlend, vec3(0.0, 1.0, 0.0), clamp(terrainRoad * 0.94 + terrainShore * 0.62, 0.0, 0.96));
      terrainBlend = mix(terrainBlend, vec3(0.0, 0.36, 0.64), terrainPlaza * 0.88);
      vec2 grassUv = vMapUv * frontierTerrainscale.x;
      vec2 soilUv = vMapUv * frontierTerrainscale.y;
      vec2 rockUv = vMapUv * frontierTerrainscale.z;
      vec3 grassSample = mix(texture2D(frontierTerraingrass, grassUv).rgb, texture2D(frontierTerraingrass, grassUv * 0.37 + vec2(0.19, 0.43)).rgb, 0.34);
      vec3 soilSample = mix(texture2D(frontierTerrainsoil, soilUv).rgb, texture2D(frontierTerrainsoil, soilUv * 0.41 + vec2(0.31, 0.17)).rgb, 0.3);
      vec3 rockSample = mix(texture2D(frontierTerrainrock, rockUv).rgb, texture2D(frontierTerrainrock, rockUv * 2.35).rgb, 0.42);
      vec3 sampleLuma = vec3(dot(grassSample, vec3(0.3, 0.59, 0.11)), dot(soilSample, vec3(0.3, 0.59, 0.11)), dot(rockSample, vec3(0.3, 0.59, 0.11)) + 0.14);
      terrainBlend = frontierHeightBlend(terrainBlend, sampleLuma);
      vec3 terrainMacro = mix(vec3(1.0), clamp(diffuseColor.rgb / frontierTerrainmacroReference, vec3(0.70), vec3(1.25)), frontierTerrainmacroStrength);
      float cloverDapple = sin(vTerrainWorldPos.x * 0.55 + vTerrainWorldPos.z * 0.48) * cos(vTerrainWorldPos.x * 0.37 - vTerrainWorldPos.z * 0.62);
      vec3 lushGrass = grassSample * frontierTerraingrassTint * terrainMacro * mix(vec3(0.95, 0.98, 0.93), vec3(1.05, 1.09, 0.96), smoothstep(-0.35, 0.45, cloverDapple));
      vec2 cobbleGrid = fract(vTerrainWorldPos.xz * 0.85) - 0.5;
      float cobbleMortar = smoothstep(0.36, 0.47, max(abs(cobbleGrid.x), abs(cobbleGrid.y)));
      float cobbleCell = fract(sin(dot(floor(vTerrainWorldPos.xz * 0.85), vec2(127.1, 311.7))) * 43758.5453);
      vec3 plazaStone = mix(rockSample * frontierTerrainplazaTint * (0.91 + 0.18 * cobbleCell), soilSample * 0.62, cobbleMortar * 0.65);
      float strata = 0.86 + 0.22 * sin(vTerrainWorldPos.y * 5.2 + sin(vTerrainWorldPos.x * 0.18) * 1.4 + cos(vTerrainWorldPos.z * 0.18) * 1.4);
      float crevice = smoothstep(0.55, 0.92, sin(vTerrainWorldPos.x * 1.35 - vTerrainWorldPos.y * 2.4) * cos(vTerrainWorldPos.z * 1.35 + vTerrainWorldPos.y * 2.1));
      vec3 cliffRock = rockSample * frontierTerraincliffTint * strata * (1.0 - crevice * 0.24);
      vec3 finalRock = mix(cliffRock, plazaStone, terrainPlaza);
      vec3 finalSoil = soilSample * mix(1.0, 0.76, terrainShore) * mix(1.0, 0.92, terrainRoad);
      vec3 terrainColor = lushGrass * terrainBlend.x + finalSoil * terrainBlend.y + finalRock * terrainBlend.z;
      diffuseColor.rgb = mix(diffuseColor.rgb, terrainColor * frontierTerraintint, frontierTerrainamount);`);
    shader.fragmentShader=shader.fragmentShader.replace('#include <normal_fragment_maps>',`
      #ifdef USE_NORMALMAP_TANGENTSPACE
      vec3 terrainNormal = texture2D(frontierTerraingrassNormal, vMapUv * frontierTerrainscale.x).xyz * terrainBlend.x
        + texture2D(frontierTerrainsoilNormal, vMapUv * frontierTerrainscale.y).xyz * terrainBlend.y
        + texture2D(frontierTerrainrockNormal, vMapUv * frontierTerrainscale.z * mix(1.0, 2.2, terrainBlend.z)).xyz * terrainBlend.z;
      terrainNormal = terrainNormal * 2.0 - 1.0;
      terrainNormal.xy *= mix(0.42, 0.65, max(terrainBlend.z, terrainPlaza));
      normal = normalize(tbn * terrainNormal);
      #endif`);
    shader.fragmentShader=shader.fragmentShader.replace('#include <roughnessmap_fragment>',`#include <roughnessmap_fragment>
      #ifdef FRONTIER_TERRAIN_ARM
      float terrainRoughness = texture2D(frontierTerraingrassArm, vMapUv * frontierTerrainscale.x).g * terrainBlend.x
        + texture2D(frontierTerrainsoilArm, vMapUv * frontierTerrainscale.y).g * terrainBlend.y
        + texture2D(frontierTerrainrockArm, vMapUv * frontierTerrainscale.z).g * terrainBlend.z;
      terrainRoughness = mix(terrainRoughness, 0.58, terrainPlaza * 0.45);
      terrainRoughness = mix(terrainRoughness, 0.34, terrainShore * 0.55);
      roughnessFactor *= clamp(terrainRoughness, 0.22, 1.0);
      #endif`);
  };
  material.customProgramCacheKey=()=>`frontier-terrain-v4:${land.map}:${land.renderSize}:${quality}`;
  material.userData.surface='Locally bundled natural grass, soil and rocky terrain';
  material.needsUpdate=true;
}
