import * as THREE from 'three';
import {nodeRuntime} from './render-runtime.js';
import {terrainRoadPaths} from './terrain-layout.js';
import {terrainBiome,isSnowBiome,isAridBiome,isRockyBiome} from './terrain-biomes.js';
import {bridgeSpans,bridgeRoadHalfWidth} from './bridge-layout.js';

function traceOffsetStroke(ctx,points,offset,size,canvasSize){
  const half=size/2,scale=canvasSize/size;ctx.beginPath();
  for(let i=0;i<points.length;i++){
    const prev=points[Math.max(0,i-1)],next=points[Math.min(points.length-1,i+1)],dx=next.x-prev.x,dz=next.z-prev.z,len=Math.hypot(dx,dz)||1;
    ctx.lineTo((points[i].x-(dz/len)*offset+half)*scale,(points[i].z+(dx/len)*offset+half)*scale);
  }
  ctx.stroke();
}

function fillSoftRadial(ctx,x,y,radius,innerColor,midColor){
  if(typeof ctx.createRadialGradient==='function'){
    const gradient=ctx.createRadialGradient(x,y,radius*.12,x,y,radius);
    gradient.addColorStop(0,innerColor);gradient.addColorStop(.62,midColor);gradient.addColorStop(1,'rgba(0,0,0,0)');
    ctx.fillStyle=gradient;
  }else ctx.fillStyle=innerColor;
  ctx.beginPath();ctx.arc(x,y,radius,0,Math.PI*2);ctx.fill();
}

function roadMask(land){
  const paths=terrainRoadPaths(land),canvas=document.createElement('canvas');
  const ctx=canvas.getContext('2d'),rich=typeof ctx.arc==='function',size=rich?1024:512,half=land.renderSize/2,scale=size/land.renderSize;
  canvas.width=canvas.height=size;ctx.fillStyle='#000';ctx.fillRect(0,0,size,size);ctx.lineCap='round';ctx.lineJoin='round';
  if(!rich){
    ctx.strokeStyle='#fff';ctx.lineWidth=3*scale;
    for(const road of paths){ctx.beginPath();for(const point of road.points)ctx.lineTo((point.x+half)*scale,(point.z+half)*scale);ctx.stroke();}
    const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.NoColorSpace;return texture;
  }
  ctx.globalCompositeOperation='lighter';
  // R channel: dual-rut dirt trade roads and quarry earth beds.
  ctx.strokeStyle='rgba(155,0,0,.78)';ctx.lineWidth=4.6*scale;
  for(const road of paths)traceOffsetStroke(ctx,road.points,0,land.renderSize,size);
  ctx.strokeStyle='rgba(255,0,0,.95)';ctx.lineWidth=1.1*scale;
  for(const road of paths){
    traceOffsetStroke(ctx,road.points,-.62,land.renderSize,size);
    traceOffsetStroke(ctx,road.points,.62,land.renderSize,size);
  }
  const sites=land.terrainSites;
  for(const q of sites?.quarries||[])fillSoftRadial(ctx,(q.x+half)*scale,(q.z+half)*scale,(q.r*2.5+2)*scale,'rgba(165,70,0,.72)','rgba(85,0,0,.28)');
  // G channel: cobblestone aprons under settlements, buildings and bridge approaches.
  for(const town of land.settlements||[])fillSoftRadial(ctx,(town.x+half)*scale,(town.z+half)*scale,9.5*scale,'rgba(0,240,0,.94)','rgba(0,120,0,.42)');
  for(const b of sites?.buildings||[])fillSoftRadial(ctx,(b.x+half)*scale,(b.z+half)*scale,(b.r*1.45+1.4)*scale,'rgba(0,220,0,.88)','rgba(0,105,0,.34)');
  for(const span of bridgeSpans(land.map))for(const side of [-1,1]){
    const bx=(span.center+side*(span.halfLength+2.8)+half)*scale,bz=half*scale;
    fillSoftRadial(ctx,bx,bz,(bridgeRoadHalfWidth+2.5)*scale,'rgba(0,235,0,.92)','rgba(0,115,0,.38)');
  }
  // B channel: pure wet river and sea shoreline banks.
  for(const channel of land.channels?.()||[]){
    ctx.beginPath();
    for(let z=-half;z<=half;z+=2){const x=channel.center+Math.sin(z*channel.frequency)*channel.bend;ctx.lineTo((x+half)*scale,(z+half)*scale);}
    ctx.strokeStyle='rgba(0,0,175,.68)';ctx.lineWidth=(channel.width*2+6.2)*scale;ctx.stroke();
    ctx.strokeStyle='rgba(0,0,255,.95)';ctx.lineWidth=(channel.width*2+2.4)*scale;ctx.stroke();
  }
  ctx.globalCompositeOperation='source-over';
  const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.NoColorSpace;texture.anisotropy=4;return texture;
}

export function applyTerrainShading(material,land,quality,surfaces,dimensions){
  const grass=surfaces.grass;if(!grass?.color)return;
  const soil=surfaces.soil||grass,rock=surfaces.rock||grass,stone=surfaces.stone||rock,boulder=surfaces.boulder||rock,normal=quality!=='low'&&grass.normal;
  material.bumpMap?.dispose();material.bumpMap=null;
  material.normalMap=normal||null;material.roughnessMap=null;
  const snow=isSnowBiome(land.map),arid=isAridBiome(land.map),rocky=isRockyBiome(land.map);
  const amount=snow?.24:arid?.68:rocky?.88:.82;
  for(const texture of material.frontierOwnedTextures||[])texture.dispose();
  const roads=roadMask(land);material.frontierOwnedTextures=[roads];
  const uniforms={
    grass:{value:grass.color},soil:{value:soil.color||grass.color},rock:{value:rock.color||grass.color},
    stone:{value:stone.color||rock.color||grass.color},boulder:{value:boulder.color||rock.color||grass.color},
    grassNormal:{value:normal||null},soilNormal:{value:normal?(soil.normal||grass.normal):null},rockNormal:{value:normal?(rock.normal||grass.normal):null},
    stoneNormal:{value:normal?(stone.normal||rock.normal||grass.normal):null},boulderNormal:{value:normal?(boulder.normal||rock.normal||grass.normal):null},
    grassArm:{value:quality==='high'?grass.arm||null:null},soilArm:{value:quality==='high'?soil.arm||grass.arm||null:null},rockArm:{value:quality==='high'?rock.arm||grass.arm||null:null},
    stoneArm:{value:quality==='high'?stone.arm||rock.arm||grass.arm||null:null},boulderArm:{value:quality==='high'?boulder.arm||rock.arm||grass.arm||null:null},
    scale:{value:new THREE.Vector3(land.renderSize/(dimensions.grass||2),land.renderSize/(dimensions.soil||1.3),land.renderSize/Math.min(10,dimensions.rock||7.5))},
    detailScale:{value:new THREE.Vector3(land.renderSize/(dimensions.stone||2.2),land.renderSize/(dimensions.cliff||4.2),snow?1:0)},
    amount:{value:amount},tint:{value:new THREE.Color(snow?0xe4e9df:arid?0xe8dcc0:rocky?0xd9dcd2:0xe4e9dc)},grassTint:{value:new THREE.Color(terrainBiome(land.map).grassTint)},
    macroReference:{value:new THREE.Color(terrainBiome(land.map).ground[0])},macroStrength:{value:snow?0:1},
    roads:{value:roads},
  };
  material.frontierTerrainUniforms=uniforms;
  material.defines={...material.defines};delete material.defines.FRONTIER_TERRAIN_ARM;
  if(quality==='high')material.defines.FRONTIER_TERRAIN_ARM='';
  if(material.isNodeMaterial){nodeRuntime().terrain(material,uniforms);return;}
  material.onBeforeCompile=shader=>{
    for(const [key,value]of Object.entries(uniforms))shader.uniforms['frontierTerrain'+key]=value;
    shader.vertexShader='attribute vec3 terrainMix;\nvarying vec3 vTerrainMix;\nvarying vec3 vTerrainWorldPos;\nvarying vec3 vTerrainWorldNormal;\n'+shader.vertexShader;
    shader.vertexShader=shader.vertexShader.replace('#include <color_vertex>','#include <color_vertex>\nvTerrainMix = terrainMix;');
    shader.vertexShader=shader.vertexShader.replace('#include <worldpos_vertex>','#include <worldpos_vertex>\nvTerrainWorldPos = (modelMatrix * vec4(transformed, 1.0)).xyz;\nvTerrainWorldNormal = normalize(mat3(modelMatrix) * objectNormal);');
    shader.fragmentShader=`varying vec3 vTerrainMix;
      varying vec3 vTerrainWorldPos;
      varying vec3 vTerrainWorldNormal;
      uniform sampler2D frontierTerraingrass;
      uniform sampler2D frontierTerrainsoil;
      uniform sampler2D frontierTerrainrock;
      uniform sampler2D frontierTerrainstone;
      uniform sampler2D frontierTerrainboulder;
      uniform sampler2D frontierTerraingrassNormal;
      uniform sampler2D frontierTerrainsoilNormal;
      uniform sampler2D frontierTerrainrockNormal;
      uniform sampler2D frontierTerrainstoneNormal;
      uniform sampler2D frontierTerrainboulderNormal;
      uniform sampler2D frontierTerraingrassArm;
      uniform sampler2D frontierTerrainsoilArm;
      uniform sampler2D frontierTerrainrockArm;
      uniform sampler2D frontierTerrainstoneArm;
      uniform sampler2D frontierTerrainboulderArm;
      uniform sampler2D frontierTerrainroads;
      uniform vec3 frontierTerrainscale;
      uniform vec3 frontierTerraindetailScale;
      uniform vec3 frontierTerraintint;
      uniform vec3 frontierTerraingrassTint;
      uniform vec3 frontierTerrainmacroReference;
      uniform float frontierTerrainmacroStrength;
      uniform float frontierTerrainamount;
      float frontierTerrainNoise(vec2 p) {
        vec2 i = floor(p), f = fract(p);
        f = f * f * (3.0 - 2.0 * f);
        float a = fract(sin(dot(i, vec2(127.1, 311.7))) * 43758.5453);
        float b = fract(sin(dot(i + vec2(1.0, 0.0), vec2(127.1, 311.7))) * 43758.5453);
        float c = fract(sin(dot(i + vec2(0.0, 1.0), vec2(127.1, 311.7))) * 43758.5453);
        float d = fract(sin(dot(i + vec2(1.0, 1.0), vec2(127.1, 311.7))) * 43758.5453);
        return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
      }\n`+shader.fragmentShader;
    shader.fragmentShader=shader.fragmentShader.replace('#include <map_fragment>',`#include <map_fragment>
      vec4 frontierCtrl = texture2D(frontierTerrainroads, vMapUv);
      float frontierWorldN1 = frontierTerrainNoise(vTerrainWorldPos.xz * 0.09);
      float frontierWorldN2 = frontierTerrainNoise(vTerrainWorldPos.xz * 0.34 + 17.3);
      float frontierEdgeBreak = (frontierWorldN1 * 0.65 + frontierWorldN2 * 0.35 - 0.5) * 0.34;
      vec3 frontierSlopeVec = abs(normalize(vTerrainWorldNormal));
      float frontierCliffSlope = smoothstep(0.05, 0.28, 1.0 - clamp(vTerrainWorldNormal.y, 0.0, 1.0));
      vec3 terrainBase = max(vTerrainMix, vec3(0.0));
      float frontierRoadBand = smoothstep(0.14, 0.78, frontierCtrl.r + frontierEdgeBreak * 0.55);
      float frontierRoadRut = smoothstep(0.76, 0.96, frontierCtrl.r);
      float frontierPlaza = smoothstep(0.24, 0.84, frontierCtrl.g + frontierEdgeBreak * 0.65) * (1.0 - frontierCliffSlope * 0.85);
      float frontierRockAmt = clamp(terrainBase.z + frontierCliffSlope * 0.92, 0.0, 1.0);
      float frontierSoilAmt = max(terrainBase.y, frontierRoadBand * 0.94);
      float frontierGrassAmt = terrainBase.x * (1.0 - frontierRoadBand * 0.92) * (1.0 - frontierCliffSlope * 0.92) * (1.0 - frontierPlaza * 0.88);
      vec2 frontierUvGrass = vMapUv * frontierTerrainscale.x;
      vec2 frontierUvGrass2 = vec2(frontierUvGrass.x * 0.43 - frontierUvGrass.y * 0.29, frontierUvGrass.x * 0.29 + frontierUvGrass.y * 0.43) + vec2(0.17, 0.31);
      float frontierGrassMix = smoothstep(0.22, 0.78, frontierWorldN1);
      vec2 frontierUvSoil = vMapUv * frontierTerrainscale.y;
      vec2 frontierUvStone = vMapUv * frontierTerraindetailScale.x;
      vec2 frontierUvCliff = mix(vMapUv * frontierTerraindetailScale.y, vec2(vTerrainWorldPos.x * 0.24 + vTerrainWorldPos.z * 0.24, vTerrainWorldPos.y * 0.36), smoothstep(0.04, 0.22, frontierSlopeVec.x + frontierSlopeVec.z));
      vec3 frontierTexGrass = mix(texture2D(frontierTerraingrass, frontierUvGrass).rgb, texture2D(frontierTerraingrass, frontierUvGrass2).rgb, frontierGrassMix);
      vec3 frontierTexSoil = texture2D(frontierTerrainsoil, frontierUvSoil).rgb * mix(1.0, 0.78, frontierRoadRut * 0.75);
      vec3 frontierTexStone = texture2D(frontierTerrainstone, frontierUvStone).rgb * mix(vec3(0.95, 0.93, 0.88), vec3(0.78, 0.82, 0.74), frontierWorldN2 * 0.45);
      float frontierStrata = mix(1.0, 0.82 + 0.22 * sin(vTerrainWorldPos.y * 4.8 + frontierWorldN1 * 3.1), frontierCliffSlope);
      vec3 frontierTexRock = mix(texture2D(frontierTerrainrock, vMapUv * frontierTerrainscale.z).rgb, texture2D(frontierTerrainboulder, frontierUvCliff).rgb, clamp(0.45 + frontierCliffSlope * 0.55, 0.0, 1.0)) * frontierStrata;
      // Height-contrasted layer sharpening keeps blades, mud clumps, stones and rock edges crisp.
      float fHG = frontierTexGrass.g * 0.55 + frontierWorldN2 * 0.25 + frontierGrassAmt;
      float fHS = frontierTexSoil.r * 0.45 + frontierWorldN2 * 0.20 + frontierSoilAmt * (1.0 - frontierPlaza * 0.5);
      float fHP = dot(frontierTexStone, vec3(0.33)) * 0.55 + frontierPlaza * 1.15;
      float fHR = dot(frontierTexRock, vec3(0.33)) * 0.50 + frontierRockAmt * 1.05;
      vec4 frontierActive = vec4(step(0.001, frontierGrassAmt), step(0.001, frontierSoilAmt), step(0.001, frontierPlaza), step(0.001, frontierRockAmt));
      vec4 frontierH = mix(vec4(-9.0), vec4(fHG, fHS, fHP, fHR), frontierActive);
      float fMax = max(max(frontierH.x, frontierH.y), max(frontierH.z, frontierH.w)) - 0.18;
      vec4 frontierWeights = max(frontierH - vec4(fMax), vec4(0.0)) * frontierActive;
      frontierWeights.x += step(dot(frontierWeights, vec4(1.0)), 0.0001);
      frontierWeights /= dot(frontierWeights, vec4(1.0));
      vec3 terrainMacro = mix(vec3(1.0), clamp(diffuseColor.rgb / frontierTerrainmacroReference, vec3(0.68), vec3(1.26)), frontierTerrainmacroStrength);
      float frontierWet = smoothstep(0.30, 0.95, frontierCtrl.b) * (1.0 - frontierCliffSlope * 0.85);
      vec3 terrainColor = frontierTexGrass * frontierTerraingrassTint * terrainMacro * frontierWeights.x
        + frontierTexSoil * mix(vec3(1.0), vec3(0.95, 0.92, 0.86), frontierTerraindetailScale.z) * frontierWeights.y
        + frontierTexStone * mix(vec3(1.0), vec3(0.96, 0.98, 1.0), frontierTerraindetailScale.z * 0.5) * frontierWeights.z
        + frontierTexRock * frontierWeights.w;
      terrainColor *= mix(1.0, 0.74, frontierWet * 0.48);
      diffuseColor.rgb = mix(diffuseColor.rgb, terrainColor * frontierTerraintint, frontierTerrainamount);`);
    shader.fragmentShader=shader.fragmentShader.replace('#include <normal_fragment_maps>',`
      #ifdef USE_NORMALMAP_TANGENTSPACE
      vec3 frontierNormGrass = mix(texture2D(frontierTerraingrassNormal, frontierUvGrass).xyz, texture2D(frontierTerraingrassNormal, frontierUvGrass2).xyz, frontierGrassMix);
      vec3 frontierNormSoil = texture2D(frontierTerrainsoilNormal, frontierUvSoil).xyz;
      vec3 frontierNormStone = texture2D(frontierTerrainstoneNormal, frontierUvStone).xyz;
      vec3 frontierNormRock = mix(texture2D(frontierTerrainrockNormal, vMapUv * frontierTerrainscale.z).xyz, texture2D(frontierTerrainboulderNormal, frontierUvCliff).xyz, clamp(0.45 + frontierCliffSlope * 0.55, 0.0, 1.0));
      vec3 terrainNormal = frontierNormGrass * frontierWeights.x
        + frontierNormSoil * frontierWeights.y
        + frontierNormStone * frontierWeights.z
        + frontierNormRock * frontierWeights.w;
      terrainNormal = terrainNormal * 2.0 - 1.0;
      terrainNormal.xy *= mix(0.50, 0.68, clamp(frontierWeights.z + frontierWeights.w, 0.0, 1.0));
      normal = normalize(tbn * terrainNormal);
      #endif`);
    shader.fragmentShader=shader.fragmentShader.replace('#include <roughnessmap_fragment>',`#include <roughnessmap_fragment>
      #ifdef FRONTIER_TERRAIN_ARM
      float terrainRoughness = mix(texture2D(frontierTerraingrassArm, frontierUvGrass).g, texture2D(frontierTerraingrassArm, frontierUvGrass2).g, frontierGrassMix) * frontierWeights.x
        + texture2D(frontierTerrainsoilArm, frontierUvSoil).g * frontierWeights.y
        + texture2D(frontierTerrainstoneArm, frontierUvStone).g * frontierWeights.z
        + mix(texture2D(frontierTerrainrockArm, vMapUv * frontierTerrainscale.z).g, texture2D(frontierTerrainboulderArm, frontierUvCliff).g, clamp(0.45 + frontierCliffSlope * 0.55, 0.0, 1.0)) * frontierWeights.w;
      roughnessFactor *= mix(clamp(terrainRoughness, 0.25, 1.0), 0.34, frontierWet * 0.62);
      #endif`);
  };
  material.customProgramCacheKey=()=>`frontier-terrain-v4:${land.map}:${land.renderSize}:${quality}`;
  material.userData.surface='Locally bundled natural grass, cobblestone plazas, soil roads and stratified rock cliffs';
  material.needsUpdate=true;
}
