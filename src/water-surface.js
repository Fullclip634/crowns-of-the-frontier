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
      attribute float frontierWaterPier;
      varying vec2 vFrontierWaterXZ;
      varying vec3 vFrontierWaterBank;
      ${WATER_WAVES_GLSL}\n`+shader.vertexShader;
    shader.vertexShader=shader.vertexShader.replace('#include <beginnormal_vertex>',`#include <beginnormal_vertex>
      float frontierWaveFade = smoothstep(0.0, 1.0, frontierWaterShore) * frontierWaterMotion;
      vec3 frontierWave = frontierWaterWaves(position.xz, frontierWaterTime) * frontierWaveFade;
      objectNormal = normalize(vec3(-frontierWave.y, 1.0, -frontierWave.z));`);
    shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>',`#include <begin_vertex>
      transformed.y += frontierWave.x;
      vFrontierWaterXZ = transformed.xz;
      vFrontierWaterBank = vec3(frontierWaterDepth, frontierWaterShore, frontierWaterPier);`);
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
      varying vec3 vFrontierWaterBank;
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
      // Spectral Beer-Lambert transmittance: red absorbs faster than green/blue for realistic shallow clarity.
      vec3 frontierTransmit = exp(-frontierDepth * vec3(2.05, 1.38, 1.08));
      float frontierCurrent = sin(vFrontierWaterXZ.x * 1.22 + sin(vFrontierWaterXZ.y * 0.34 + frontierWaterTime * 0.34) * 0.86 + vFrontierWaterXZ.y * 0.13 - frontierWaterTime * 0.55);
      vec3 frontierWaterBase = mix(frontierWaterDeep, frontierWaterShallow, clamp(frontierTransmit * 0.65 + (1.0 - frontierAbsorption) * 0.35, 0.0, 1.0));
      // Subtle submerged pebble/sandbed micro-variation visible through crystal-clear shallows.
      float frontierShallowVis = (1.0 - smoothstep(0.06, 0.92, frontierDepth)) * smoothstep(0.0, 0.30, frontierShore);
      if (frontierWaterDetail > 0.5 && frontierShallowVis > 0.01) {
        float frontierBedA = frontierWaterNoise(vFrontierWaterXZ * 2.4);
        float frontierBedB = frontierWaterNoise(vFrontierWaterXZ * 6.2 + vec2(3.7, 1.9));
        float frontierPebbles = mix(frontierBedA, frontierBedB, 0.45);
        vec3 frontierBedTint = frontierWaterShallow * mix(vec3(0.84, 0.80, 0.68), vec3(1.16, 1.11, 0.96), frontierPebbles);
        frontierWaterBase = mix(frontierWaterBase, frontierBedTint, frontierShallowVis * 0.42);
      }
      diffuseColor.rgb *= frontierWaterBase * (1.0 + frontierCurrent * 0.085);
      if (frontierWaterDetail > 0.5 && frontierDepth < 1.25) {
        vec2 frontierWarp = vec2(
          frontierWaterNoise(vFrontierWaterXZ * 0.72 + vec2(frontierWaterTime * 0.11, -frontierWaterTime * 0.08)) - 0.5,
          frontierWaterNoise(vFrontierWaterXZ * 0.78 - vec2(frontierWaterTime * 0.09, frontierWaterTime * 0.12)) - 0.5
        ) * 0.55;
        vec2 frontierCausticUv = vFrontierWaterXZ + frontierWarp;
        float frontierCausticA = frontierWaterNoise(frontierCausticUv * 1.55 + vec2(frontierWaterTime * 0.24, frontierWaterTime * 0.15));
        float frontierCausticB = frontierWaterNoise(frontierCausticUv * 2.35 - vec2(frontierWaterTime * 0.18, -frontierWaterTime * 0.26));
        float frontierCausticC = frontierWaterNoise(frontierCausticUv * 3.8 + vec2(-frontierWaterTime * 0.21, frontierWaterTime * 0.19));
        float frontierWeb = pow(max(0.0, 1.0 - abs(frontierCausticA - frontierCausticB) * 2.15), 4.2);
        float frontierShimmer = pow(max(0.0, 1.0 - abs(frontierCausticB - frontierCausticC) * 2.3), 3.6) * 0.45;
        float frontierCaustic = (frontierWeb + frontierShimmer) * (1.0 - frontierAbsorption * 0.85) * frontierWaterLight;
        diffuseColor.rgb += (frontierWaterShallow * 0.65 + frontierWaterSunColor * 0.45) * frontierCaustic * (1.0 - smoothstep(0.55, 1.25, frontierDepth)) * 0.34;
      }
      float frontierWetEdge = smoothstep(0.0, 0.38, frontierShore) * smoothstep(0.0, 0.18, frontierDepth);
      diffuseColor.a *= mix(0.24, 1.0, smoothstep(0.0, 0.85, frontierAbsorption)) * frontierWetEdge;`);
    shader.fragmentShader=shader.fragmentShader.replace('#include <normal_fragment_maps>',`#include <normal_fragment_maps>
      if (frontierWaterRipples > 0.0) {
        float frontierDistortion = 0.0;
        if (frontierWaterDetail > 0.5) {
          vec2 frontierFlow = vec2(frontierWaterTime * 0.09, frontierWaterTime * 0.06);
          frontierDistortion = (frontierWaterNoise(vFrontierWaterXZ * 0.30 + frontierFlow) - 0.5) * 4.1;
        }
        float frontierRippleA = cos(dot(vFrontierWaterXZ, vec2(3.7, 1.9)) + frontierWaterTime * 2.5 + frontierDistortion);
        float frontierRippleB = cos(dot(vFrontierWaterXZ, vec2(-2.1, 3.1)) - frontierWaterTime * 2.0 - frontierDistortion * 0.73);
        float frontierRippleC = cos(dot(vFrontierWaterXZ, vec2(1.3, -4.2)) + frontierWaterTime * 1.5 + frontierDistortion * 0.41);
        float frontierRippleD = frontierWaterDetail > 0.5 ? cos(dot(vFrontierWaterXZ, vec2(-3.8, -2.5)) + frontierWaterTime * 3.0 - frontierDistortion * 0.55) : 0.0;
        float frontierRippleE = frontierWaterDetail > 0.5 ? cos(dot(vFrontierWaterXZ, vec2(6.4, -5.1)) - frontierWaterTime * 3.7 + frontierDistortion * 0.62) : 0.0;
        vec2 frontierRippleSlope = frontierRippleA * vec2(0.42, 0.22) + frontierRippleB * vec2(-0.22, 0.31) + frontierRippleC * vec2(0.10, -0.27) + frontierRippleD * vec2(-0.18, -0.12) + frontierRippleE * vec2(0.11, -0.09);
        float frontierRippleCoverage = 1.0 / (1.0 + length(fwidth(vFrontierWaterXZ)) * 2.35);
        normal = normalize(normal + mat3(viewMatrix) * vec3(frontierRippleSlope.x, 0.0, frontierRippleSlope.y) * frontierWaterRipples * 1.12 * frontierRippleCoverage);
      }`);
    shader.fragmentShader=shader.fragmentShader.replace('#include <opaque_fragment>',`
      vec3 frontierViewDir = normalize(vViewPosition);
      float frontierViewCosine = clamp(dot(normal, frontierViewDir), 0.0, 1.0);
      float frontierFresnel = 0.035 + 0.965 * pow(1.0 - frontierViewCosine, 4.4);
      vec3 frontierReflection = normalize(inverseTransformDirection(reflect(-frontierViewDir, normal), viewMatrix));
      float frontierSkyElevation = pow(clamp(frontierReflection.y, 0.0, 1.0), 0.62);
      vec3 frontierSkyGradient = mix(frontierWaterSky * 1.16, frontierWaterSky * vec3(0.56, 0.75, 0.98), frontierSkyElevation);
      outgoingLight = mix(outgoingLight, frontierSkyGradient, frontierFresnel * mix(0.65, 1.0, smoothstep(0.0, 0.45, frontierShore)));
      float frontierSunAlign = max(dot(frontierReflection, normalize(frontierWaterSunDir)), 0.0);
      float frontierGlint = pow(frontierSunAlign, 128.0) * 1.15 + pow(frontierSunAlign, 22.0) * 0.18;
      outgoingLight += frontierWaterSunColor * frontierGlint * frontierWaterLight * smoothstep(0.0, 0.32, frontierShore);
      if (frontierShore < 2.20 && frontierDepth < 0.96) {
        vec2 frontierDrift = vec2(frontierWaterTime * 0.16, -frontierWaterTime * 0.12);
        float frontierCells = frontierWaterNoise(vFrontierWaterXZ * 1.75 + frontierDrift);
        float frontierLace = frontierWaterDetail > 0.5 ? frontierWaterNoise(vFrontierWaterXZ * 4.4 - frontierDrift * 1.45) : frontierCells;
        float frontierFoamNoise = mix(frontierCells, frontierLace, 0.44);
        // Advancing & receding rhythmic surf band plus tight shoreline edge froth.
        float frontierSurfPhase = sin(frontierDepth * 6.8 - frontierWaterTime * 1.9 + frontierCells * 2.6 + dot(vFrontierWaterXZ, vec2(0.18, 0.24)));
        float frontierSurfBand = smoothstep(0.28, 0.88, frontierSurfPhase) * (1.0 - smoothstep(0.18, 0.86, frontierDepth)) * (1.0 - smoothstep(0.85, 2.20, frontierShore));
        float frontierWash = 0.12 * sin(dot(vFrontierWaterXZ, vec2(0.27, 0.58)) + frontierWaterTime * 1.15) + (frontierCells - 0.5) * 0.20;
        float frontierWaterline = (1.0 - smoothstep(0.14, 0.58, frontierDepth + frontierWash)) * (1.0 - smoothstep(0.55, 1.55, frontierShore));
        float frontierLacing = smoothstep(0.30, 0.76, frontierFoamNoise) * smoothstep(0.04, 0.20, frontierShore);
        float frontierFoamMask = clamp((frontierWaterline * 0.85 + frontierSurfBand * 0.55) * frontierLacing * frontierWaterFoam, 0.0, 0.92);
        vec3 frontierFoamColor = mix(vec3(0.82, 0.87, 0.84), vec3(0.95, 0.97, 0.95), frontierSurfBand) * frontierWaterLight;
        outgoingLight = mix(outgoingLight, frontierFoamColor, frontierFoamMask);
      }
      if (vFrontierWaterBank.z > 0.02) {
        float frontierPierWake = vFrontierWaterBank.z;
        float frontierPierPulse = 0.5 + 0.5 * sin(vFrontierWaterXZ.y * 3.8 - frontierWaterTime * 4.4 + abs(vFrontierWaterXZ.x) * 1.4);
        float frontierPierNoise = frontierWaterNoise(vFrontierWaterXZ * 2.9 - vec2(0.0, frontierWaterTime * 0.65));
        float frontierPierFoam = clamp(frontierPierWake * (0.48 + 0.52 * frontierPierPulse) * smoothstep(0.22, 0.78, frontierPierNoise + frontierPierWake * 0.35), 0.0, 0.78);
        outgoingLight = mix(outgoingLight, vec3(0.90, 0.94, 0.93) * frontierWaterLight, frontierPierFoam);
      }
      #include <opaque_fragment>`);
  };
  material.customProgramCacheKey=()=> 'frontier-water-depth-weather-v12';material.needsUpdate=true;
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
