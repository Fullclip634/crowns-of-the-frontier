import * as THREE from 'three';
import {environmentGenerator,basicMaterial,nodeRuntime} from './render-runtime.js';
import {isSnowBiome,terrainBiome} from './terrain-biomes.js';

const ATMOSPHERES=Object.freeze({
  winter:Object.freeze({skyHex:0xc2d0da,zenithHex:0x4e769e,hemiGroundHex:0x91a8b7,envZenith:'#4e769e',envHorizon:'#e4eef4',envGround:'#8b999f',
    sunHex:0xfff4e7,fillHex:0xd0e5ff,keyIntensity:3.05,fillIntensity:1.28,exposure:1.19,hazeNear:77,hazeFar:228}),
  arid:Object.freeze({skyHex:0xcbb99b,zenithHex:0x4473a6,hemiGroundHex:0xa08666,envZenith:'#4474a6',envHorizon:'#eadbc0',envGround:'#917851',
    sunHex:0xffe0b9,fillHex:0xd4e1f1,keyIntensity:3.22,fillIntensity:1.13,exposure:1.15,hazeNear:112,hazeFar:288}),
  volcanic:Object.freeze({skyHex:0x938884,zenithHex:0x3c4553,hemiGroundHex:0x695c58,envZenith:'#3d4653',envHorizon:'#bdb0a9',envGround:'#3d3735',
    sunHex:0xf1d6b8,fillHex:0xc3c8d7,keyIntensity:2.82,fillIntensity:1.17,exposure:1.19,hazeNear:95,hazeFar:240}),
  coastal:Object.freeze({skyHex:0xa7c0cb,zenithHex:0x356ea8,hemiGroundHex:0x697f66,envZenith:'#356ea8',envHorizon:'#deecf2',envGround:'#4d6542',
    sunHex:0xffedda,fillHex:0xcfe7f5,keyIntensity:3,fillIntensity:1.22,exposure:1.16,hazeNear:78,hazeFar:230}),
  temperate:Object.freeze({skyHex:0xa4b9c2,zenithHex:0x3b6c9e,hemiGroundHex:0x6f7e56,envZenith:'#3b6d9f',envHorizon:'#dce7ed',envGround:'#4a5a3a',
    sunHex:0xffecd2,fillHex:0xd8e9f2,keyIntensity:3.12,fillIntensity:1.2,exposure:1.17,hazeNear:94,hazeFar:255}),
});

const STORM_ZENITH=0x4c5d69,NIGHT_ZENITH=0x060d1c;

/** Resolve the biome key and atmosphere palette for a map identifier. */
export function biomeAtmosphereKey(map){
  if(isSnowBiome(map))return 'winter';
  const biome=terrainBiome(map);
  if(biome.ash)return 'volcanic';
  if(biome.sand)return 'arid';
  if(biome.shore||map==='coast'||map==='riverland')return 'coastal';
  return 'temperate';
}

/** Return sky, bounce and IBL colours tuned for a terrain biome. */
export function biomeAtmosphere(map){return ATMOSPHERES[biomeAtmosphereKey(map)];}

/** Build an equirectangular sky-and-sun reflection probe texture for PBR materials. */
export function buildEnvironmentTexture(renderer,map='highlands'){
  const profile=biomeAtmosphere(map),canvas=document.createElement('canvas');
  canvas.width=256;canvas.height=128;
  const ctx=canvas.getContext('2d'),gradient=ctx.createLinearGradient(0,0,0,128);
  gradient.addColorStop(0,profile.envZenith);
  gradient.addColorStop(.46,profile.envHorizon);
  gradient.addColorStop(.52,'#efe5cb');
  gradient.addColorStop(1,profile.envGround);
  ctx.fillStyle=gradient;ctx.fillRect(0,0,256,128);
  // Paint a soft directional solar highlight matching the sunlit key direction
  // so metallic armor, gold trim and water crests catch natural skylight glint.
  const sunGlow=ctx.createRadialGradient(84,30,2,84,30,38);
  sunGlow.addColorStop(0,'rgba(255,248,228,0.88)');
  sunGlow.addColorStop(.32,'rgba(255,235,198,0.34)');
  sunGlow.addColorStop(1,'rgba(255,235,198,0)');
  ctx.fillStyle=sunGlow;ctx.fillRect(46,0,76,68);
  const source=new THREE.CanvasTexture(canvas);
  source.colorSpace=THREE.SRGBColorSpace;
  source.mapping=THREE.EquirectangularReflectionMapping;
  const generator=environmentGenerator(renderer),target=generator.fromEquirectangular(source);
  source.dispose();generator.dispose();
  return target;
}

/** Apply biome-specific sky baseline, ground bounce and PMREM reflection probe. */
export function applyBiomeAtmosphere(view){
  const map=view.sim?.options?.map||'highlands',key=biomeAtmosphereKey(map),profile=biomeAtmosphere(map);
  view.scene?.background?.setHex?.(profile.skyHex);
  view.scene?.fog?.color?.setHex?.(profile.skyHex);
  view.hemi?.groundColor?.setHex?.(profile.hemiGroundHex);
  if(view.sun){view.sun.color.setHex(profile.sunHex);view.sun.intensity=profile.keyIntensity;}
  if(view.hemi){view.hemi.color.setHex(profile.fillHex);view.hemi.intensity=profile.fillIntensity;}
  if(view.renderer)view.renderer.toneMappingExposure=profile.exposure;
  if(view.renderer){
    // CubeUV PMREM expands every PBR fragment shader across dozens of pipelines on both
    // WebGPU DX12 and WebGL ANGLE DX11; sky dome and hemisphere bounce keep atmospheric parity without stalls.
    if(view.environmentTarget){view.environmentTarget.dispose();view.environmentTarget=null;}
    if(view.scene)view.scene.environment=null;
    view.environmentBiome=key;
  }
  view.scene.environmentIntensity=.42;
}

/** Create a sky dome mesh rendered in lockstep between WebGL2 and WebGPU. */
export function createSkyDome(view){
  if(view.skyDome)return view.skyDome;
  const uniforms={
    horizon:{value:new THREE.Color(0xa4b9c2)},
    zenith:{value:new THREE.Color(0x3b6c9e)},
    sunDir:{value:new THREE.Vector3(-48,62,32).normalize()},
    sunColor:{value:new THREE.Color(0xffe4bd)},
    night:{value:0},
    clouds:{value:0},
  };
  const material=basicMaterial({color:0xffffff,side:THREE.BackSide,depthWrite:false,fog:false});
  material.frontierSkyUniforms=uniforms;
  if(material.isNodeMaterial)nodeRuntime().skyDome(material,uniforms);
  else{
    material.onBeforeCompile=shader=>{
      shader.uniforms.frontierSkyHorizon=uniforms.horizon;
      shader.uniforms.frontierSkyZenith=uniforms.zenith;
      shader.uniforms.frontierSkySunDir=uniforms.sunDir;
      shader.uniforms.frontierSkySunColor=uniforms.sunColor;
      shader.uniforms.frontierSkyNight=uniforms.night;
      shader.uniforms.frontierSkyClouds=uniforms.clouds;
      shader.vertexShader='varying vec3 vFrontierSkyDir;\n'+shader.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\nvFrontierSkyDir = position;');
      shader.fragmentShader=`varying vec3 vFrontierSkyDir;
        uniform vec3 frontierSkyHorizon;
        uniform vec3 frontierSkyZenith;
        uniform vec3 frontierSkySunDir;
        uniform vec3 frontierSkySunColor;
        uniform float frontierSkyNight;
        uniform float frontierSkyClouds;\n`+shader.fragmentShader.replace('#include <color_fragment>',`#include <color_fragment>
        vec3 skyDir = normalize(vFrontierSkyDir);
        float skyHeight = clamp(skyDir.y, 0.0, 1.0);
        vec3 skyBase = mix(frontierSkyHorizon, frontierSkyZenith, pow(skyHeight, 0.52));
        float horizonHaze = exp(-abs(skyDir.y) * 8.5) * 0.16 * (1.0 - frontierSkyNight * 0.72) * (1.0 - frontierSkyClouds * 0.65);
        float sunDot = max(dot(skyDir, normalize(frontierSkySunDir)), 0.0);
        float solarClear = (1.0 - frontierSkyClouds * 0.86) * (1.0 - frontierSkyNight * 0.92);
        vec3 sunGlow = frontierSkySunColor * (pow(sunDot, 10.0) * 0.22 + pow(sunDot, 84.0) * 0.46) * solarClear;
        vec3 moonGlow = vec3(0.78, 0.86, 1.0) * pow(sunDot, 56.0) * 0.20 * frontierSkyNight * (1.0 - frontierSkyClouds * 0.84);
        diffuseColor.rgb = clamp(skyBase + frontierSkyHorizon * horizonHaze + sunGlow + moonGlow, 0.0, 2.0);`);
    };
    material.customProgramCacheKey=()=>'frontier-sky-dome-v1';
  }
  const mesh=new THREE.Mesh(new THREE.SphereGeometry(1,24,14),material);
  mesh.frustumCulled=false;mesh.castShadow=false;mesh.receiveShadow=false;mesh.renderOrder=-10;
  mesh.userData.skyZenithScratch=new THREE.Color();mesh.userData.skyStormScratch=new THREE.Color(STORM_ZENITH);mesh.userData.skyNightScratch=new THREE.Color(NIGHT_ZENITH);
  view.skyDome=mesh;view.scene.add(mesh);
  return mesh;
}

/** Synchronize the sky dome transform and atmospheric gradient with live camera, time and weather. */
export function updateSkyDome(view){
  const dome=view.skyDome;if(!dome)return;
  dome.position.copy(view.camera.position);
  const radius=Math.max(300,(view.camera.far||400)*.85);
  dome.scale.setScalar(radius);
  const u=dome.material.frontierSkyUniforms;if(!u)return;
  const profile=biomeAtmosphere(view.sim?.options?.map||'highlands');
  const clouds=view.weather?.cloudiness||0,night=view.lightingState?.night||0;
  if(view.scene.background?.isColor)u.horizon.value.copy(view.scene.background);
  const {skyZenithScratch,skyStormScratch,skyNightScratch}=dome.userData;
  u.zenith.value.copy(skyZenithScratch.setHex(profile.zenithHex).lerp(skyStormScratch,clouds*.72).lerp(skyNightScratch,night*.95));
  if(view.sun){
    u.sunDir.value.subVectors(view.sun.position,view.sun.target.position).normalize();
    u.sunColor.value.copy(view.sun.color);
  }
  u.night.value=night;
  u.clouds.value=clouds;
}

/** Dispose sky dome GPU resources cleanly when tearing down renderers. */
export function disposeSkyDome(view){
  if(!view?.skyDome)return;
  view.skyDome.removeFromParent();
  view.skyDome.geometry.dispose();
  view.skyDome.material.dispose();
  view.skyDome=null;
}
