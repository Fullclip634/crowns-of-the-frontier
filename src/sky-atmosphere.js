import * as THREE from 'three';
import {environmentGenerator,basicMaterial,nodeRuntime} from './render-runtime.js';
import {isSnowBiome,terrainBiome} from './terrain-biomes.js';

const ATMOSPHERES=Object.freeze({
  winter:Object.freeze({skyHex:0xc2d0da,zenithHex:0x4e769e,hemiGroundHex:0x7c8e94,envZenith:'#4e769e',envHorizon:'#e4eef4',envGround:'#8b999f'}),
  arid:Object.freeze({skyHex:0xcbb99b,zenithHex:0x4473a6,hemiGroundHex:0x8e744c,envZenith:'#4474a6',envHorizon:'#eadbc0',envGround:'#917851'}),
  volcanic:Object.freeze({skyHex:0x938884,zenithHex:0x3c4553,hemiGroundHex:0x4a403b,envZenith:'#3d4653',envHorizon:'#bdb0a9',envGround:'#3d3735'}),
  coastal:Object.freeze({skyHex:0xa7c0cb,zenithHex:0x356ea8,hemiGroundHex:0x526845,envZenith:'#356ea8',envHorizon:'#deecf2',envGround:'#4d6542'}),
  temperate:Object.freeze({skyHex:0xa4b9c2,zenithHex:0x3b6c9e,hemiGroundHex:0x50633b,envZenith:'#3b6d9f',envHorizon:'#dce7ed',envGround:'#4a5a3a'}),
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
