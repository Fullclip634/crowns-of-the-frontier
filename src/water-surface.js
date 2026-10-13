// Keep the existing physical wave profile on the GPU. Analytical slope normals
// give moving highlights without rewriting geometry or recalculating faces.
export function configureWaterSurface(material){
  if(material.frontierWaveTime)return;
  const time=material.frontierWaveTime={value:0};
  const sky=material.frontierWaterSky={value:material.color.clone().setHex(0xc4d9df)};
  const ripples=material.frontierWaterRipples={value:.075};
  // The former colored stripe map exaggerated repetition across wide seas.
  if(material.map?.isCanvasTexture){material.map.dispose();material.map=null;}
  const previous=material.onBeforeCompile;
  material.onBeforeCompile=shader=>{
    previous.call(material,shader);
    shader.uniforms.frontierWaterTime=time;
    shader.uniforms.frontierWaterSky=sky;
    shader.uniforms.frontierWaterRipples=ripples;
    shader.vertexShader='uniform float frontierWaterTime;\nattribute float frontierWaterDepth;\nattribute float frontierWaterShore;\nvarying vec2 vFrontierWaterXZ;\nvarying vec2 vFrontierWaterBank;\n'+shader.vertexShader;
    shader.vertexShader=shader.vertexShader.replace('#include <beginnormal_vertex>',`#include <beginnormal_vertex>
      float frontierWaveA = position.x * 0.9 + position.z * 0.36 + frontierWaterTime * 1.3;
      float frontierWaveB = position.z * 0.65 - frontierWaterTime;
      objectNormal = normalize(vec3(-0.0315 * cos(frontierWaveA), 1.0,
        -0.0126 * cos(frontierWaveA) + 0.013 * sin(frontierWaveB)));`);
    shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>',`#include <begin_vertex>
      transformed.y += (0.035 * sin(frontierWaveA) + 0.02 * cos(frontierWaveB)) * smoothstep(0.0, 1.0, frontierWaterShore);
      vFrontierWaterXZ = transformed.xz;
      vFrontierWaterBank = vec2(frontierWaterDepth, frontierWaterShore);`);
    shader.fragmentShader='uniform vec3 frontierWaterSky;\nuniform float frontierWaterTime;\nuniform float frontierWaterRipples;\nvarying vec2 vFrontierWaterXZ;\nvarying vec2 vFrontierWaterBank;\n'+shader.fragmentShader;
    shader.fragmentShader=shader.fragmentShader.replace('#include <color_fragment>',`#include <color_fragment>
      float frontierShallow = 1.0 - smoothstep(0.12, 1.3, vFrontierWaterBank.x);
      diffuseColor.rgb *= mix(vec3(0.48, 0.77, 0.83), vec3(0.98, 1.06, 0.94), frontierShallow);`);
    shader.fragmentShader=shader.fragmentShader.replace('#include <normal_fragment_maps>',`#include <normal_fragment_maps>
      float frontierRippleX = cos(vFrontierWaterXZ.x * 3.7 + vFrontierWaterXZ.y * 1.9 + frontierWaterTime * 2.3);
      float frontierRippleZ = sin(vFrontierWaterXZ.y * 4.1 - vFrontierWaterXZ.x * 1.2 - frontierWaterTime * 1.8);
      normal = normalize(normal + mat3(viewMatrix) * vec3(frontierRippleX, 0.0, frontierRippleZ) * frontierWaterRipples);`);
    shader.fragmentShader=shader.fragmentShader.replace('#include <opaque_fragment>',`
      float frontierWaterFresnel = pow(1.0 - clamp(dot(normal, normalize(vViewPosition)), 0.0, 1.0), 5.0);
      outgoingLight = mix(outgoingLight, frontierWaterSky, 0.08 + 0.58 * frontierWaterFresnel);
      float frontierWash = 0.18 * sin(vFrontierWaterXZ.y * 0.7 + frontierWaterTime * 1.1)
                         + 0.08 * sin(vFrontierWaterXZ.x * 1.3 - frontierWaterTime * 0.8);
      float frontierFoam = (1.0 - smoothstep(0.12, 0.75, vFrontierWaterBank.y + frontierWash))
                         * (0.45 + 0.55 * pow(sin(vFrontierWaterXZ.y * 2.4 + frontierWaterTime * 0.65), 2.0));
      outgoingLight = mix(outgoingLight, vec3(0.72, 0.81, 0.76), frontierFoam * 0.38);
      #include <opaque_fragment>`);
  };
  material.metalness=0;material.roughness=.22;
  material.customProgramCacheKey=()=> 'frontier-water-banks-v4';material.needsUpdate=true;
}

export function animateWaterSurface(view){
  const time=view.materials.water.frontierWaveTime;if(time)time.value=view.clock;
  const sky=view.materials.water.frontierWaterSky;if(sky&&view.scene.background?.isColor)sky.value.copy(view.scene.background);
  const ripples=view.materials.water.frontierWaterRipples;if(ripples)ripples.value=view.settings.quality==='low'?.035:.075;
  const diagnostics=view.waterDiagnostics??={animation:'GPU mesh displacement',geometryUploadsPerFrame:0};
  diagnostics.meshes=view.waterMeshes?.length||0;
}
