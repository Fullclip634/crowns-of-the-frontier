import {nodeRuntime} from './render-runtime.js';
import {UNEXPLORED_ALPHA} from './fog-texture.js';

// Sample at each surface's world position so relief, waves and other raised
// scenery share the same map as the minimap without an overdraw pass.
export function shadeBattlefieldFog(material,view){
  const fog=view.battleFog,unexploredAlpha=UNEXPLORED_ALPHA/255;
  if(material.isNodeMaterial){nodeRuntime().battlefieldFog(material,fog,unexploredAlpha);return material;}

  const prepare=material.onBeforeCompile,programKey=material.customProgramCacheKey.call(material);
  material.onBeforeCompile=function(shader,renderer){
    prepare.call(this,shader,renderer);
    shader.uniforms.frontierFogMask=fog.mask;
    shader.uniforms.frontierFogScale=fog.scale;
    shader.uniforms.frontierFogEnabled=fog.enabled;
    shader.uniforms.frontierFogTint=fog.tint;
    shader.uniforms.frontierFogBlur=fog.blur??{value:1};
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
      uniform float frontierFogBlur;
      uniform vec3 frontierFogTint;
      varying vec2 vFrontierFogPosition;
    `+shader.fragmentShader.replace('#include <opaque_fragment>',`
      #include <opaque_fragment>
      vec2 fogPosition = vFrontierFogPosition * frontierFogScale;
      float fogAtBorder = smoothstep(0.5, 0.5 + 4.0 * frontierFogScale, max(abs(fogPosition.x), abs(fogPosition.y)));
      vec2 fogUv = fogPosition + 0.5;
      float fogStep = 1.3 * frontierFogScale;
      float fogCenter = texture2D(frontierFogMask, fogUv).a;
      float fogAtSurface = fogCenter;
      if (frontierFogBlur > 0.5) {
        fogAtSurface = fogCenter * 0.40 + (
          texture2D(frontierFogMask, fogUv + vec2(fogStep, fogStep)).a +
          texture2D(frontierFogMask, fogUv + vec2(-fogStep, fogStep)).a +
          texture2D(frontierFogMask, fogUv + vec2(fogStep, -fogStep)).a +
          texture2D(frontierFogMask, fogUv + vec2(-fogStep, -fogStep)).a
        ) * 0.15;
      }
      float fogAmount = mix(fogAtSurface, ${unexploredAlpha}, fogAtBorder) * frontierFogEnabled;
      gl_FragColor.rgb = mix(gl_FragColor.rgb, frontierFogTint, fogAmount);
    `);
  };
  material.customProgramCacheKey=()=>`${programKey}:battlefield-fog-v2`;
  material.needsUpdate=true;
  return material;
}
