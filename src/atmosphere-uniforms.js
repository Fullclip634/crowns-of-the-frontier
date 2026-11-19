import * as THREE from 'three';

let sharedCloudMap=null;

function periodicHash(ix,iy,period,seed){
  const x=((ix%period)+period)%period,y=((iy%period)+period)%period;
  let n=(x*374761393+y*668265263+seed*1442695041)|0;
  n=(n^(n>>>13))*1274126177;
  return ((n^(n>>>16))>>>0)/4294967295;
}

function periodicValueNoise(u,v,period,seed){
  const x=u*period,y=v*period,ix=Math.floor(x),iy=Math.floor(y);
  let fx=x-ix,fy=y-iy;
  fx=fx*fx*(3-2*fx);fy=fy*fy*(3-2*fy);
  const a=periodicHash(ix,iy,period,seed),b=periodicHash(ix+1,iy,period,seed);
  const c=periodicHash(ix,iy+1,period,seed),d=periodicHash(ix+1,iy+1,period,seed);
  return a+(b-a)*fx+(c-a)*fy+(a-b-c+d)*fx*fy;
}

/** Build a seamless tileable 256x256 DataTexture encoding soft drifting cumulus cloud shadows. */
export function createCloudShadowTexture(size=256){
  const data=new Uint8Array(size*size*4);
  for(let y=0;y<size;y++){
    const v=y/size;
    for(let x=0;x<size;x++){
      const u=x/size;
      // Domain-warped periodic FBM so cloud edges feel organic with zero visible grid tiling.
      const wx=periodicValueNoise(u,v,4,17)-.5,wy=periodicValueNoise(u,v,4,53)-.5;
      const wu=(u+wx*.16+1)%1,wv=(v+wy*.16+1)%1;
      const n1=periodicValueNoise(wu,wv,4,101);
      const n2=periodicValueNoise(wu,wv,8,211);
      const n3=periodicValueNoise(wu,wv,16,307);
      const n4=periodicValueNoise(wu,wv,32,409);
      const fbm=n1*.50+n2*.28+n3*.15+n4*.07;
      // Shape into distinct sunlit clearings and soft cloud patches (~45% sky cover).
      const t=Math.max(0,Math.min(1,(fbm-.42)/.34));
      const cloud=t*t*(3-2*t);
      const byte=Math.round(cloud*255);
      const idx=(y*size+x)*4;
      data[idx]=byte;data[idx+1]=byte;data[idx+2]=byte;data[idx+3]=255;
    }
  }
  const texture=new THREE.DataTexture(data,size,size,THREE.RGBAFormat,THREE.UnsignedByteType);
  texture.colorSpace=THREE.NoColorSpace;
  texture.wrapS=texture.wrapT=THREE.RepeatWrapping;
  texture.magFilter=THREE.LinearFilter;
  texture.minFilter=THREE.LinearMipmapLinearFilter;
  texture.generateMipmaps=true;
  texture.needsUpdate=true;
  return texture;
}

/** Return the shared seamless cloud-shadow texture without duplicating GPU memory across matches. */
export function cloudShadowTexture(){
  return sharedCloudMap??=createCloudShadowTexture(256);
}

/** Create the shared per-view atmospheric lighting, analytic IBL, cloud shadow and rain wetness uniforms. */
export function createAtmosphereUniforms(){
  return {
    cloudMap:{value:cloudShadowTexture()},
    cloudOffset:{value:new THREE.Vector2(0,0)},
    cloudScale:{value:.0092},
    cloudStrength:{value:.22},
    wetness:{value:0},
    sunDir:{value:new THREE.Vector3(-48,62,32).normalize()},
    sunColor:{value:new THREE.Color(0xffe7c4)},
    iblSky:{value:new THREE.Color(0x5282b4)},
    iblHorizon:{value:new THREE.Color(0xdce8ef)},
    iblGround:{value:new THREE.Color(0x6e7d56)},
    iblIntensity:{value:.46},
    night:{value:0},
    wind:{value:new THREE.Vector3(1,0,.45)},
  };
}

/** Return the view's shared atmosphere uniforms, initializing defaults if needed. */
export function ensureAtmosphereUniforms(view){
  if(!view)return createAtmosphereUniforms();
  return view.atmosphereUniforms??=createAtmosphereUniforms();
}

/** Shared GLSL helper for physically balanced analytic hemisphere + horizon + sun-glint IBL. */
export const ANALYTIC_IBL_GLSL=`
vec3 frontierAnalyticIbl(
  vec3 worldNormal,
  vec3 viewNormal,
  vec3 viewDir,
  vec3 worldRefl,
  vec3 albedo,
  float roughness,
  float metalness,
  vec3 sunDir,
  vec3 sunColor,
  vec3 iblSky,
  vec3 iblHorizon,
  vec3 iblGround,
  float iblIntensity,
  float nightAmount,
  float wetness,
  float baseLuma
) {
  float nDotV = clamp(dot(viewNormal, viewDir), 0.0, 1.0);
  float fresnel = pow(1.0 - nDotV, 4.0);
  float skyUp = smoothstep(-0.35, 0.78, worldRefl.y);
  float horizonBand = exp(-abs(worldRefl.y) * 4.6);
  vec3 envSpec = mix(iblGround * 0.72, iblSky * 1.15, skyUp) + iblHorizon * horizonBand * 0.34;
  float upMix = worldNormal.y * 0.5 + 0.5;
  vec3 envDiffuse = mix(iblGround * 0.85, mix(iblHorizon, iblSky, 0.45), upMix);
  float sunAlign = max(dot(worldRefl, normalize(sunDir)), 0.0);
  float gloss = clamp(1.0 - roughness, 0.0, 1.0);
  float specExp = mix(10.0, 96.0, gloss * gloss);
  vec3 sunSpec = sunColor * (pow(sunAlign, specExp) * (0.28 + 0.62 * gloss) + pow(sunAlign, 12.0) * 0.07) * (1.0 - nightAmount * 0.72);
  float metalMask = smoothstep(0.06, 0.48, metalness);
  float lightFloor = clamp(baseLuma * 1.15 + 0.30, 0.24, 1.15);
  // Dielectrics get soft ambient sky/ground shadow fill + wet grazing specular.
  float shadowLift = (1.0 - smoothstep(0.0, 0.55, baseLuma)) * (1.0 - metalMask * 0.75);
  vec3 diffuseBounce = albedo * envDiffuse * iblIntensity * (0.08 + 0.16 * shadowLift) * (1.0 - nightAmount * 0.45);
  float dielecSpecWeight = (0.04 + 0.34 * fresnel) * gloss * gloss * (0.42 + wetness * 0.85) * (1.0 - metalMask * 0.5);
  vec3 dielecSpec = (envSpec * 0.55 + sunSpec * 0.45) * dielecSpecWeight * iblIntensity * lightFloor;
  // Metals get rich sky/horizon reflections + crisp sun glint tinted by metal albedo.
  vec3 metalTint = mix(vec3(0.78), albedo, 0.80);
  float metalFresnel = 0.28 + 0.72 * fresnel;
  vec3 metalSpec = metalTint * (envSpec * 0.88 + sunSpec * 0.72) * metalFresnel * (0.22 + 0.78 * gloss) * metalMask * iblIntensity * lightFloor * (1.0 - nightAmount * 0.42);
  return diffuseBounce + dielecSpec + metalSpec;
}
`;

/** Shared GLSL helper for drifting world-space cloud shadows with warm-sun / cool-shade balance. */
export const CLOUD_SHADOW_GLSL=`
vec3 frontierCloudLight(vec2 worldXZ, sampler2D cloudMap, vec2 offset, float scale, float strength, vec3 skyTint) {
  if (strength <= 0.001) return vec3(1.0);
  float cover = texture2D(cloudMap, worldXZ * scale + offset).r;
  float shade = clamp(cover * strength, 0.0, 0.55);
  vec3 coolTint = mix(vec3(0.84, 0.90, 1.0), normalize(max(skyTint, vec3(0.15))) * 1.15, 0.35);
  return mix(vec3(1.03, 1.015, 0.99), coolTint * (1.0 - shade * 0.78), shade);
}
`;

/** Attach unified analytic IBL + rain wetness to standalone PBR materials (gold ore, boulders, props). */
export function applyAnalyticIblToMaterial(material,uniforms){
  if(!material||!uniforms||material.frontierAnalyticIblApplied)return material;
  material.frontierAnalyticIblApplied=true;
  material.frontierAtmosphereUniforms=uniforms;
  if(material.isNodeMaterial)return material;
  const previous=material.onBeforeCompile,prevKey=material.customProgramCacheKey;
  material.onBeforeCompile=function(shader,renderer){
    previous?.call(this,shader,renderer);
    shader.uniforms.frontierIblSunDir=uniforms.sunDir;
    shader.uniforms.frontierIblSunColor=uniforms.sunColor;
    shader.uniforms.frontierIblSky=uniforms.iblSky;
    shader.uniforms.frontierIblHorizon=uniforms.iblHorizon;
    shader.uniforms.frontierIblGround=uniforms.iblGround;
    shader.uniforms.frontierIblIntensity=uniforms.iblIntensity;
    shader.uniforms.frontierIblNight=uniforms.night;
    shader.uniforms.frontierIblWetness=uniforms.wetness;
    shader.fragmentShader=`
      uniform vec3 frontierIblSunDir;
      uniform vec3 frontierIblSunColor;
      uniform vec3 frontierIblSky;
      uniform vec3 frontierIblHorizon;
      uniform vec3 frontierIblGround;
      uniform float frontierIblIntensity;
      uniform float frontierIblNight;
      uniform float frontierIblWetness;
      ${ANALYTIC_IBL_GLSL}\n`+shader.fragmentShader;
    shader.fragmentShader=shader.fragmentShader.replace('#include <roughnessmap_fragment>',`#include <roughnessmap_fragment>
      roughnessFactor = clamp(mix(roughnessFactor, roughnessFactor * 0.54, frontierIblWetness * 0.78), 0.06, 1.0);`);
    shader.fragmentShader=shader.fragmentShader.replace('#include <opaque_fragment>',`
      {
        vec3 iblViewDir = normalize(vViewPosition);
        vec3 iblWorldNormal = normalize(inverseTransformDirection(normal, viewMatrix));
        vec3 iblWorldRefl = normalize(inverseTransformDirection(reflect(-iblViewDir, normal), viewMatrix));
        float iblLuma = dot(outgoingLight, vec3(0.3, 0.59, 0.11));
        outgoingLight += frontierAnalyticIbl(
          iblWorldNormal, normal, iblViewDir, iblWorldRefl,
          diffuseColor.rgb, roughnessFactor, metalnessFactor,
          frontierIblSunDir, frontierIblSunColor,
          frontierIblSky, frontierIblHorizon, frontierIblGround,
          frontierIblIntensity, frontierIblNight, frontierIblWetness, iblLuma
        );
      }
      #include <opaque_fragment>`);
  };
  material.customProgramCacheKey=()=>`${prevKey?prevKey.call(material):'std'}:analytic-ibl-v1`;
  material.needsUpdate=true;
  return material;
}
