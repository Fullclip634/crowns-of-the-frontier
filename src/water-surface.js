import {Vector3} from 'three';
import {nodeRuntime} from './render-runtime.js';
import {WATER_WAVES_GLSL,waterMotionScale} from './water-waves.js';

export const WATER_PALETTES=Object.freeze({
  river:Object.freeze({shallow:0x838268,deep:0x344f3f,opacity:.94,foam:.22}),
  coast:Object.freeze({shallow:0x7eb4ad,deep:0x26545c,opacity:.9,foam:.55}),
  riverland:Object.freeze({shallow:0x7aa89e,deep:0x2b5856,opacity:.92,foam:.32}),
  archipelago:Object.freeze({shallow:0x88c2be,deep:0x225866,opacity:.88,foam:.66}),
  volcanic:Object.freeze({shallow:0x8a6a54,deep:0x3a2c2a,opacity:.96,foam:.23})
});

export function configureWaterPalette(material,map){
  const palette=WATER_PALETTES[map]||WATER_PALETTES.river;
  material.color.setHex(0xffffff);
  material.frontierWaterShallow.value.setHex(palette.shallow);
  material.frontierWaterDeep.value.setHex(palette.deep);
  material.frontierWaterFoam.value=palette.foam;
  material.opacity=palette.opacity;
}

// Moving volume and slope normals stay on the GPU. Depth tint and a cheap sky
// approximation use existing terrain/light data without extra scene captures.
export function configureWaterSurface(material){
  if(material.frontierWaveTime)return;
  const time=material.frontierWaveTime={value:0};
  const sky=material.frontierWaterSky={value:material.color.clone().setHex(0xc4d9df)};
  const shallow=material.frontierWaterShallow={value:material.color.clone()};
  const deep=material.frontierWaterDeep={value:material.color.clone()};
  const foam=material.frontierWaterFoam={value:0};
  const ripples=material.frontierWaterRipples={value:.075};
  const detail=material.frontierWaterDetail={value:1};
  const motion=material.frontierWaterMotion={value:1};
  const light=material.frontierWaterLight={value:1};
  const sunDir=material.frontierWaterSunDir={value:new Vector3(-48,62,32).normalize()};
  const sunColor=material.frontierWaterSunColor={value:material.color.clone().setHex(0xffe4bd)};
  if(material.map?.isCanvasTexture){material.map.dispose();material.map=null;}
  configureWaterPalette(material,'river');
  material.metalness=0;material.roughness=.18;material.alphaTest=.012;
  if(material.isNodeMaterial){nodeRuntime().water(material);return;}
  const previous=material.onBeforeCompile;
  material.onBeforeCompile=(shader,renderer)=>{
    previous.call(material,shader,renderer);
    shader.uniforms.frontierWaterTime=time;
    shader.uniforms.frontierWaterSky=sky;
    shader.uniforms.frontierWaterShallow=shallow;
    shader.uniforms.frontierWaterDeep=deep;
    shader.uniforms.frontierWaterFoam=foam;
    shader.uniforms.frontierWaterRipples=ripples;
    shader.uniforms.frontierWaterDetail=detail;
    shader.uniforms.frontierWaterMotion=motion;
    shader.uniforms.frontierWaterLight=light;
    shader.uniforms.frontierWaterSunDir=sunDir;
    shader.uniforms.frontierWaterSunColor=sunColor;
    shader.vertexShader=`uniform float frontierWaterTime;
      uniform float frontierWaterMotion;
      attribute float frontierWaterDepth;
      attribute float frontierWaterShore;
      varying vec2 vFrontierWaterXZ;
      varying vec2 vFrontierWaterBank;
      ${WATER_WAVES_GLSL}\n`+shader.vertexShader;
    shader.vertexShader=shader.vertexShader.replace('#include <beginnormal_vertex>',`#include <beginnormal_vertex>
      float frontierWaveFade = smoothstep(0.0, 1.0, frontierWaterShore) * frontierWaterMotion;
      vec3 frontierWave = frontierWaterWaves(position.xz, frontierWaterTime) * frontierWaveFade;
      objectNormal = normalize(vec3(-frontierWave.y, 1.0, -frontierWave.z));`);
    shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>',`#include <begin_vertex>
      transformed.y += frontierWave.x;
      vFrontierWaterXZ = transformed.xz;
      vFrontierWaterBank = vec2(frontierWaterDepth, frontierWaterShore);`);
    shader.fragmentShader=`uniform vec3 frontierWaterSky;
      uniform vec3 frontierWaterShallow;
      uniform vec3 frontierWaterDeep;
      uniform float frontierWaterFoam;
      uniform float frontierWaterTime;
      uniform float frontierWaterRipples;
      uniform float frontierWaterDetail;
      uniform float frontierWaterLight;
      uniform vec3 frontierWaterSunDir;
      uniform vec3 frontierWaterSunColor;
      varying vec2 vFrontierWaterXZ;
      varying vec2 vFrontierWaterBank;
      float frontierWaterNoise(vec2 point) {
        vec2 cell = floor(point), f = fract(point); f = f * f * (3.0 - 2.0 * f);
        vec3 p = fract(vec3(cell.xyx) * 0.1031); p += dot(p, p.yzx + 33.33);
        float a = fract((p.x + p.y) * p.z);
        p = fract(vec3((cell + vec2(1.0, 0.0)).xyx) * 0.1031); p += dot(p, p.yzx + 33.33);
        float b = fract((p.x + p.y) * p.z);
        p = fract(vec3((cell + vec2(0.0, 1.0)).xyx) * 0.1031); p += dot(p, p.yzx + 33.33);
        float c = fract((p.x + p.y) * p.z);
        p = fract(vec3((cell + vec2(1.0, 1.0)).xyx) * 0.1031); p += dot(p, p.yzx + 33.33);
        float d = fract((p.x + p.y) * p.z);
        return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
      }\n`+shader.fragmentShader;
    shader.fragmentShader=shader.fragmentShader.replace('#include <color_fragment>',`#include <color_fragment>
      float frontierShore = vFrontierWaterBank.y;
      float frontierDepth = min(max(0.0, vFrontierWaterBank.x), frontierShore * 1.6);
      float frontierAbsorption = 1.0 - exp(-frontierDepth * 1.65);
      float frontierCurrent = sin(vFrontierWaterXZ.x * 1.22 + sin(vFrontierWaterXZ.y * 0.34 + frontierWaterTime * 0.34) * 0.86 + vFrontierWaterXZ.y * 0.13 - frontierWaterTime * 0.55);
      diffuseColor.rgb *= mix(frontierWaterShallow, frontierWaterDeep, frontierAbsorption) * (1.0 + frontierCurrent * 0.078);
      if (frontierWaterDetail > 0.5 && frontierDepth < 1.10) {
        float frontierCausticA = frontierWaterNoise(vFrontierWaterXZ * 1.45 + vec2(frontierWaterTime * 0.22, frontierWaterTime * 0.14));
        float frontierCausticB = frontierWaterNoise(vFrontierWaterXZ * 2.15 - vec2(frontierWaterTime * 0.16, -frontierWaterTime * 0.25));
        float frontierCaustic = pow(max(0.0, 1.0 - abs(frontierCausticA - frontierCausticB) * 2.0), 4.0) * (1.0 - frontierAbsorption) * frontierWaterLight;
        diffuseColor.rgb += frontierWaterShallow * frontierCaustic * (1.0 - smoothstep(0.55, 1.10, frontierDepth)) * 0.24;
      }
      float frontierWetEdge = smoothstep(0.0, 0.44, frontierShore) * smoothstep(0.0, 0.22, frontierDepth);
      diffuseColor.a *= mix(0.30, 1.0, frontierAbsorption) * frontierWetEdge;`);
    shader.fragmentShader=shader.fragmentShader.replace('#include <normal_fragment_maps>',`#include <normal_fragment_maps>
      if (frontierWaterRipples > 0.0) {
        float frontierDistortion = 0.0;
        if (frontierWaterDetail > 0.5) {
          vec2 frontierFlow = vec2(frontierWaterTime * 0.08, frontierWaterTime * 0.05);
          frontierDistortion = (frontierWaterNoise(vFrontierWaterXZ * 0.28 + frontierFlow) - 0.5) * 3.8;
        }
        float frontierRippleA = cos(dot(vFrontierWaterXZ, vec2(3.7, 1.9)) + frontierWaterTime * 2.4 + frontierDistortion);
        float frontierRippleB = cos(dot(vFrontierWaterXZ, vec2(-2.1, 3.1)) - frontierWaterTime * 1.9 - frontierDistortion * 0.73);
        float frontierRippleC = cos(dot(vFrontierWaterXZ, vec2(1.3, -4.2)) + frontierWaterTime * 1.4 + frontierDistortion * 0.41);
        float frontierRippleD = frontierWaterDetail > 0.5 ? cos(dot(vFrontierWaterXZ, vec2(-3.8, -2.5)) + frontierWaterTime * 2.9 - frontierDistortion * 0.55) : 0.0;
        vec2 frontierRippleSlope = frontierRippleA * vec2(0.42, 0.22) + frontierRippleB * vec2(-0.22, 0.31) + frontierRippleC * vec2(0.10, -0.27) + frontierRippleD * vec2(-0.18, -0.12);
        float frontierRippleCoverage = 1.0 / (1.0 + length(fwidth(vFrontierWaterXZ)) * 2.5);
        normal = normalize(normal + mat3(viewMatrix) * vec3(frontierRippleSlope.x, 0.0, frontierRippleSlope.y) * frontierWaterRipples * frontierRippleCoverage);
      }`);
    shader.fragmentShader=shader.fragmentShader.replace('#include <opaque_fragment>',`
      vec3 frontierViewDir = normalize(vViewPosition);
      float frontierViewCosine = clamp(dot(normal, frontierViewDir), 0.0, 1.0);
      float frontierFresnel = 0.04 + 0.96 * pow(1.0 - frontierViewCosine, 4.2);
      vec3 frontierReflection = normalize(inverseTransformDirection(reflect(-frontierViewDir, normal), viewMatrix));
      float frontierSkyElevation = pow(clamp(frontierReflection.y, 0.0, 1.0), 0.65);
      vec3 frontierSkyGradient = mix(frontierWaterSky * 1.12, frontierWaterSky * vec3(0.60, 0.76, 0.98), frontierSkyElevation);
      outgoingLight = mix(outgoingLight, frontierSkyGradient, frontierFresnel);
      float frontierSunAlign = max(dot(frontierReflection, normalize(frontierWaterSunDir)), 0.0);
      float frontierGlint = pow(frontierSunAlign, 96.0) * 0.85 + pow(frontierSunAlign, 18.0) * 0.16;
      outgoingLight += frontierWaterSunColor * frontierGlint * frontierWaterLight * smoothstep(0.0, 0.35, frontierShore);
      if (frontierShore < 1.65 && frontierDepth < 0.82) {
        vec2 frontierDrift = vec2(frontierWaterTime * 0.16, -frontierWaterTime * 0.11);
        float frontierCells = frontierWaterNoise(vFrontierWaterXZ * 1.65 + frontierDrift);
        float frontierLace = frontierWaterDetail > 0.5 ? frontierWaterNoise(vFrontierWaterXZ * 4.1 - frontierDrift * 1.4) : frontierCells;
        float frontierFoamNoise = mix(frontierCells, frontierLace, 0.38);
        float frontierWash = 0.14 * sin(dot(vFrontierWaterXZ, vec2(0.27, 0.58)) + frontierWaterTime * 1.15) + (frontierCells - 0.5) * 0.20;
        float frontierWaterline = (1.0 - smoothstep(0.18, 0.68, frontierDepth + frontierWash)) * (1.0 - smoothstep(0.65, 1.65, frontierShore));
        float frontierLacing = smoothstep(0.32, 0.79, frontierFoamNoise) * smoothstep(0.05, 0.22, frontierShore);
        vec3 frontierFoamColor = vec3(0.84, 0.88, 0.80) * frontierWaterLight;
        outgoingLight = mix(outgoingLight, frontierFoamColor, frontierWaterline * frontierLacing * frontierWaterFoam);
      }
      #include <opaque_fragment>`);
  };
  material.customProgramCacheKey=()=> 'frontier-water-depth-weather-v10';material.needsUpdate=true;
}

export function animateWaterSurface(view){
  const still=view.settings.reducedMotion;
  const time=view.materials.water.frontierWaveTime;if(time)time.value=still?0:view.clock;
  const sky=view.materials.water.frontierWaterSky;if(sky&&view.scene.background?.isColor)sky.value.copy(view.scene.background);
  const wet=Math.max(0,Math.min(1,view.weatherState?.amount||0));
  const quality=view.settings.quality;
  const ripples=view.materials.water.frontierWaterRipples;if(ripples)ripples.value=(quality==='high'?.103:quality==='low'?.051:.083)*(still?1:1+wet*.35);
  const detail=view.materials.water.frontierWaterDetail;if(detail)detail.value=quality==='low'?0:1;
  const motion=view.materials.water.frontierWaterMotion;if(motion)motion.value=waterMotionScale(still?0:wet);
  const light=view.materials.water.frontierWaterLight;if(light)light.value=Math.max(.18,Math.min(1,((view.sun?.intensity??2.7)+(view.hemi?.intensity??.9)*.45)/3.105));
  const sunDir=view.materials.water.frontierWaterSunDir;
  if(sunDir&&view.sun?.position){
    sunDir.value.copy(view.sun.position);
    if(view.sun.target?.position)sunDir.value.sub(view.sun.target.position);
    if(sunDir.value.lengthSq()>1e-6)sunDir.value.normalize();
  }
  const sunColor=view.materials.water.frontierWaterSunColor;if(sunColor&&view.sun?.color?.isColor)sunColor.value.copy(view.sun.color);
  const diagnostics=view.waterDiagnostics??={animation:'GPU mesh displacement',geometryUploadsPerFrame:0};
  diagnostics.meshes=view.waterMeshes?.length||0;
  diagnostics.motionScale=motion?.value||1;diagnostics.reducedMotion=!!still;
}
