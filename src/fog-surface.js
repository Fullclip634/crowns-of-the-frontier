import {nodeRuntime} from './render-runtime.js';
import {UNEXPLORED_ALPHA} from './fog-texture.js';

// Sample at each surface's world position so relief, waves and other raised
// scenery share the same map as the minimap without an overdraw pass.
export function shadeBattlefieldFog(material,view){
  const fog=view.battleFog;
  if(material.isNodeMaterial){nodeRuntime().battlefieldFog(material,fog);return material;}

  const prepare=material.onBeforeCompile,programKey=material.customProgramCacheKey.call(material);
  material.onBeforeCompile=function(shader,renderer){
    prepare.call(this,shader,renderer);
    shader.uniforms.frontierFogMask=fog.mask;
    shader.uniforms.frontierFogScale=fog.scale;
    shader.uniforms.frontierFogEnabled=fog.enabled;
    shader.uniforms.frontierFogTint=fog.tint;
    shader.vertexShader='varying vec2 vFrontierFogPosition;\n'+shader.vertexShader.replace('#include <project_vertex>',`
      #include <project_vertex>
      vec4 frontierFogPosition = vec4(transformed, 1.0);
      #ifdef USE_BATCHING
        frontierFogPosition = batchingMatrix * frontierFogPosition;
      #endif
      #ifdef USE_INSTANCING
        frontierFogPosition = instanceMatrix * frontierFogPosition;
      #endif
      vFrontierFogPosition = (modelMatrix * frontierFogPosition).xz;
    `);
    shader.fragmentShader=`
      uniform sampler2D frontierFogMask;
      uniform float frontierFogScale;
      uniform float frontierFogEnabled;
      uniform vec3 frontierFogTint;
      varying vec2 vFrontierFogPosition;
    `+shader.fragmentShader.replace('#include <opaque_fragment>',`
      #include <opaque_fragment>
      vec2 fogPosition = vFrontierFogPosition * frontierFogScale;
      float fogAtBorder = smoothstep(0.5, 0.5 + 4.0 * frontierFogScale, max(abs(fogPosition.x), abs(fogPosition.y)));
      float fogAtSurface = texture2D(frontierFogMask, fogPosition + 0.5).a;
      float fogAmount = mix(fogAtSurface, ${UNEXPLORED_ALPHA/255}, fogAtBorder) * frontierFogEnabled;
      gl_FragColor.rgb = mix(gl_FragColor.rgb, frontierFogTint, fogAmount);
    `);
  };
  material.customProgramCacheKey=()=>`${programKey}:battlefield-fog`;
  material.needsUpdate=true;
  return material;
}
