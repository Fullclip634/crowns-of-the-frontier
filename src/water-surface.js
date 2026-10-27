import {nodeRuntime} from './render-runtime.js';
import {WATER_WAVES_GLSL,waterMotionScale} from './water-waves.js';

export const WATER_PALETTES=Object.freeze({
  river:Object.freeze({shallow:0x838268,deep:0x344f3f,opacity:.94}),
  coast:Object.freeze({shallow:0x82978a,deep:0x365c5c,opacity:.9})
});

export function configureWaterPalette(material,map){
  const palette=WATER_PALETTES[map==='coast'?'coast':'river'];
  material.color.setHex(0xffffff);
  material.frontierWaterShallow.value.setHex(palette.shallow);
  material.frontierWaterDeep.value.setHex(palette.deep);
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
  const ripples=material.frontierWaterRipples={value:.075};
  const detail=material.frontierWaterDetail={value:1};
  const motion=material.frontierWaterMotion={value:1};
  const light=material.frontierWaterLight={value:1};
  if(material.map?.isCanvasTexture){material.map.dispose();material.map=null;}
  configureWaterPalette(material,'river');
  material.metalness=0;material.roughness=.34;
  if(material.isNodeMaterial){nodeRuntime().water(material);return;}
  const previous=material.onBeforeCompile;
  material.onBeforeCompile=(shader,renderer)=>{
    previous.call(material,shader,renderer);
    shader.uniforms.frontierWaterTime=time;
    shader.uniforms.frontierWaterSky=sky;
    shader.uniforms.frontierWaterShallow=shallow;
    shader.uniforms.frontierWaterDeep=deep;
    shader.uniforms.frontierWaterRipples=ripples;
    shader.uniforms.frontierWaterDetail=detail;
    shader.uniforms.frontierWaterMotion=motion;
    shader.uniforms.frontierWaterLight=light;
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
      uniform float frontierWaterTime;
      uniform float frontierWaterRipples;
      uniform float frontierWaterDetail;
      uniform float frontierWaterLight;
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
      float frontierDepth = max(0.0, vFrontierWaterBank.x);
      float frontierAbsorption = 1.0 - exp(-frontierDepth * 1.8);
      diffuseColor.rgb *= mix(frontierWaterShallow, frontierWaterDeep, frontierAbsorption);
      diffuseColor.a *= mix(0.45, 1.0, frontierAbsorption);`);
    shader.fragmentShader=shader.fragmentShader.replace('#include <normal_fragment_maps>',`#include <normal_fragment_maps>
      if (frontierWaterRipples > 0.0) {
        float frontierDistortion = 0.0;
        if (frontierWaterDetail > 0.5) {
          vec2 frontierFlow = vec2(frontierWaterTime * 0.06, -frontierWaterTime * 0.04);
          frontierDistortion = (frontierWaterNoise(vFrontierWaterXZ * 0.28 + frontierFlow) - 0.5) * 4.0;
        }
        float frontierRippleA = cos(dot(vFrontierWaterXZ, vec2(3.7, 1.9)) + frontierWaterTime * 2.3 + frontierDistortion);
        float frontierRippleB = cos(dot(vFrontierWaterXZ, vec2(-2.1, 3.1)) - frontierWaterTime * 1.8 - frontierDistortion * 0.73);
        float frontierRippleC = cos(dot(vFrontierWaterXZ, vec2(1.3, -4.2)) + frontierWaterTime * 1.2 + frontierDistortion * 0.41);
        vec2 frontierRippleSlope = frontierRippleA * vec2(0.48, 0.247) + frontierRippleB * vec2(-0.23, 0.339) + frontierRippleC * vec2(0.091, -0.294);
        float frontierRippleCoverage = 1.0 / (1.0 + length(fwidth(vFrontierWaterXZ)) * 2.5);
        normal = normalize(normal + mat3(viewMatrix) * vec3(frontierRippleSlope.x, 0.0, frontierRippleSlope.y) * frontierWaterRipples * frontierRippleCoverage);
      }`);
    shader.fragmentShader=shader.fragmentShader.replace('#include <opaque_fragment>',`
      float frontierViewCosine = clamp(dot(normal, normalize(vViewPosition)), 0.0, 1.0);
      float frontierFresnel = 0.02 + 0.98 * pow(1.0 - frontierViewCosine, 5.0);
      vec3 frontierReflection = inverseTransformDirection(reflect(-normalize(vViewPosition), normal), viewMatrix);
      vec3 frontierSkyGradient = frontierWaterSky * mix(0.72, 1.12, clamp(frontierReflection.y * 0.5 + 0.5, 0.0, 1.0));
      outgoingLight = mix(outgoingLight, frontierSkyGradient, frontierFresnel);
      if (vFrontierWaterBank.y < 1.25) {
        vec2 frontierDrift = vec2(frontierWaterTime * 0.18, -frontierWaterTime * 0.12);
        float frontierCells = frontierWaterNoise(vFrontierWaterXZ * 1.7 + frontierDrift);
        float frontierWash = 0.12 * sin(dot(vFrontierWaterXZ, vec2(0.23, 0.54)) + frontierWaterTime * 0.7) + (frontierCells - 0.5) * 0.18;
        float frontierFoam = (1.0 - smoothstep(0.06, 0.48, vFrontierWaterBank.y + frontierWash)) * smoothstep(0.22, 0.8, frontierCells);
        vec3 frontierFoamColor = vec3(0.72, 0.75, 0.63) * frontierWaterLight;
        outgoingLight = mix(outgoingLight, frontierFoamColor, frontierFoam * 0.28);
      }
      #include <opaque_fragment>`);
  };
  material.customProgramCacheKey=()=> 'frontier-water-depth-weather-v7';material.needsUpdate=true;
}

export function animateWaterSurface(view){
  const still=view.settings.reducedMotion;
  const time=view.materials.water.frontierWaveTime;if(time)time.value=still?0:view.clock;
  const sky=view.materials.water.frontierWaterSky;if(sky&&view.scene.background?.isColor)sky.value.copy(view.scene.background);
  const wet=Math.max(0,Math.min(1,view.weatherState?.amount||0));
  const ripples=view.materials.water.frontierWaterRipples;if(ripples)ripples.value=(view.settings.quality==='low'?.045:.075)*(still?0:1+wet*.35);
  const detail=view.materials.water.frontierWaterDetail;if(detail)detail.value=still||view.settings.quality==='low'?0:1;
  const motion=view.materials.water.frontierWaterMotion;if(motion)motion.value=waterMotionScale(wet);
  const light=view.materials.water.frontierWaterLight;if(light)light.value=Math.max(.18,Math.min(1,((view.sun?.intensity??2.7)+(view.hemi?.intensity??.9)*.45)/3.105));
  const diagnostics=view.waterDiagnostics??={animation:'GPU mesh displacement',geometryUploadsPerFrame:0};
  diagnostics.meshes=view.waterMeshes?.length||0;
  diagnostics.motionScale=motion?.value||1;diagnostics.reducedMotion=!!still;
}
