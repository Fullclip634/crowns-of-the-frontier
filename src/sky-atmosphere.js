import * as THREE from 'three';
import {environmentGenerator,basicMaterial,nodeRuntime} from './render-runtime.js';
import {isSnowBiome,terrainBiome} from './terrain-biomes.js';
import {ensureAtmosphereUniforms} from './atmosphere-uniforms.js';

const ATMOSPHERES=Object.freeze({
  winter:Object.freeze({skyHex:0xc4d3df,zenithHex:0x4a739c,hemiGroundHex:0x9eb2c2,envZenith:'#4a739c',envHorizon:'#e6f0f6',envGround:'#94a4ad',
    iblSkyHex:0x5e8ec0,iblHorizonHex:0xe2eef5,iblGroundHex:0x98aab6,iblIntensity:.48,
    sunHex:0xfff2e0,fillHex:0xd3e6ff,keyIntensity:3.04,fillIntensity:1.48,exposure:1.10,hazeNear:78,hazeFar:228}),
  arid:Object.freeze({skyHex:0xd1be9e,zenithHex:0x3f71a8,hemiGroundHex:0xb59670,envZenith:'#3f71a8',envHorizon:'#eedec2',envGround:'#9c8159',
    iblSkyHex:0x4f84bc,iblHorizonHex:0xecdac0,iblGroundHex:0xa98c63,iblIntensity:.46,
    sunHex:0xffdfaf,fillHex:0xd7e4f4,keyIntensity:3.34,fillIntensity:1.34,exposure:1.11,hazeNear:114,hazeFar:288}),
  volcanic:Object.freeze({skyHex:0x978b85,zenithHex:0x3a4352,hemiGroundHex:0x76665f,envZenith:'#3a4352',envHorizon:'#c2b4ab',envGround:'#4b403c',
    iblSkyHex:0x586274,iblHorizonHex:0xc4b3a8,iblGroundHex:0x6d584f,iblIntensity:.45,
    sunHex:0xf3cfa8,fillHex:0xc6cbda,keyIntensity:2.96,fillIntensity:1.36,exposure:1.14,hazeNear:95,hazeFar:240}),
  coastal:Object.freeze({skyHex:0xaac4d0,zenithHex:0x326ca8,hemiGroundHex:0x778b70,envZenith:'#326ca8',envHorizon:'#e0eef5',envGround:'#58704d',
    iblSkyHex:0x4684be,iblHorizonHex:0xdcecf4,iblGroundHex:0x6a8064,iblIntensity:.47,
    sunHex:0xffeece,fillHex:0xcde6f7,keyIntensity:3.18,fillIntensity:1.40,exposure:1.12,hazeNear:79,hazeFar:230}),
  temperate:Object.freeze({skyHex:0xa9bec8,zenithHex:0x396b9f,hemiGroundHex:0x7c8a62,envZenith:'#396b9f',envHorizon:'#dfe9ef',envGround:'#586945',
    iblSkyHex:0x4e82b8,iblHorizonHex:0xdee8ee,iblGroundHex:0x71805a,iblIntensity:.48,
    sunHex:0xffe7c4,fillHex:0xd5e8f8,keyIntensity:3.24,fillIntensity:1.42,exposure:1.12,hazeNear:94,hazeFar:255}),
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
    // WebGPU DX12 and WebGL ANGLE DX11; unified analytic sky/horizon/ground IBL keeps atmospheric parity without stalls.
    if(view.environmentTarget){view.environmentTarget.dispose();view.environmentTarget=null;}
    if(view.scene)view.scene.environment=null;
    view.environmentBiome=key;
  }
  view.scene.environmentIntensity=profile.iblIntensity;
  const atm=ensureAtmosphereUniforms(view);
  atm.iblSky.value.setHex(profile.iblSkyHex);
  atm.iblHorizon.value.setHex(profile.iblHorizonHex);
  atm.iblGround.value.setHex(profile.iblGroundHex);
  atm.iblIntensity.value=profile.iblIntensity;
  atm.sunColor.value.setHex(profile.sunHex);
  if(view.sun?.position&&view.sun?.target?.position){
    atm.sunDir.value.subVectors(view.sun.position,view.sun.target.position).normalize();
  }
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
        vec3 skyBase = mix(frontierSkyHorizon, frontierSkyZenith, pow(skyHeight, 0.50));
        float horizonHaze = exp(-abs(skyDir.y) * 7.8) * 0.20 * (1.0 - frontierSkyNight * 0.72) * (1.0 - frontierSkyClouds * 0.58);
        float sunDot = max(dot(skyDir, normalize(frontierSkySunDir)), 0.0);
        float solarClear = (1.0 - frontierSkyClouds * 0.84) * (1.0 - frontierSkyNight * 0.92);
        vec3 sunGlow = frontierSkySunColor * (pow(sunDot, 7.0) * 0.24 + pow(sunDot, 72.0) * 0.52) * solarClear;
        float warmScatter = exp(-abs(skyDir.y) * 5.2) * pow(sunDot, 2.5) * 0.16 * solarClear;
        vec3 moonGlow = vec3(0.78, 0.86, 1.0) * pow(sunDot, 52.0) * 0.24 * frontierSkyNight * (1.0 - frontierSkyClouds * 0.84);
        diffuseColor.rgb = clamp(skyBase + frontierSkyHorizon * horizonHaze + frontierSkySunColor * warmScatter + sunGlow + moonGlow, 0.0, 2.0);`);
    };
    material.customProgramCacheKey=()=>'frontier-sky-dome-v2';
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
  const atm=view.atmosphereUniforms;
  if(atm){
    atm.iblSky.value.copy(u.zenith.value);
    if(view.scene.background?.isColor)atm.iblHorizon.value.copy(view.scene.background);
    if(view.hemi?.groundColor?.isColor)atm.iblGround.value.copy(view.hemi.groundColor);
    atm.sunDir.value.copy(u.sunDir.value);
    atm.sunColor.value.copy(u.sunColor.value);
    atm.iblIntensity.value=view.scene.environmentIntensity??profile.iblIntensity;
    atm.night.value=night;
  }
}

/** Dispose sky dome GPU resources cleanly when tearing down renderers. */
export function disposeSkyDome(view){
  if(!view?.skyDome)return;
  view.skyDome.removeFromParent();
  view.skyDome.geometry.dispose();
  view.skyDome.material.dispose();
  view.skyDome=null;
}
