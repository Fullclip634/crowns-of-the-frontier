import * as THREE from 'three';
import {standardMaterial,nodeRuntime} from './render-runtime.js';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';
import {architectureStyle,isAgeStyled,ageSurface} from './architecture-age.js';
import {isSnowBiome} from './terrain-biomes.js';
import {ensureAtmosphereUniforms,ANALYTIC_IBL_GLSL,CLOUD_SHADOW_GLSL} from './atmosphere-uniforms.js';
import {roofSurfaceMaps} from './surface-assets.js';

function smoothShallowCreases(geometry,cosLimit=.52){
  const pos=geometry.attributes.position,nrm=geometry.attributes.normal;
  if(!pos||!nrm)return;
  const buckets=new Map(),quant=v=>Math.round(v*1000);
  for(let i=0;i<pos.count;i++){
    const key=`${quant(pos.getX(i))},${quant(pos.getY(i))},${quant(pos.getZ(i))}`;
    let list=buckets.get(key);
    if(!list){list=[];buckets.set(key,list);}
    list.push(i);
  }
  const src=new Float32Array(nrm.array),out=new Float32Array(nrm.array);
  for(const indices of buckets.values()){
    if(indices.length<2)continue;
    for(const i of indices){
      const nx=src[i*3],ny=src[i*3+1],nz=src[i*3+2];
      let sx=0,sy=0,sz=0;
      for(const j of indices){
        const ox=src[j*3],oy=src[j*3+1],oz=src[j*3+2];
        if(nx*ox+ny*oy+nz*oz>=cosLimit){sx+=ox;sy+=oy;sz+=oz;}
      }
      const len=Math.hypot(sx,sy,sz);
      if(len>1e-6){out[i*3]=sx/len;out[i*3+1]=sy/len;out[i*3+2]=sz/len;}
    }
  }
  nrm.array.set(out);nrm.needsUpdate=true;
}

/**
 * Bake deterministic architectural Vertex AO into the merged building geometry
 * (once per cached archetype, 0 per-frame GPU cost across WebGL2 & WebGPU).
 * Darkens roof-overhang soffits, archway/buttress/porch crevices, and plinth
 * ground contact while gently lifting open sky-facing roof ridges.
 */
export function bakeBuildingVertexAO(geometry){
  const pos=geometry.attributes.position,nrm=geometry.attributes.normal,col=geometry.attributes.color;
  const surf=geometry.attributes.structureSurface,emis=geometry.attributes.structureEmission;
  if(!pos||!nrm||!col||!surf)return;
  if(!geometry.boundingBox)geometry.computeBoundingBox();
  const bb=geometry.boundingBox,size=bb.getSize(new THREE.Vector3());
  if(size.x<.05&&size.y<.05&&size.z<.05)return;

  // Measure roof overhang bounding footprint from roof vertices (mode === 4).
  let roofMinX=Infinity,roofMaxX=-Infinity,roofMinZ=Infinity,roofMaxZ=-Infinity,roofMinY=Infinity,roofMaxY=-Infinity;
  for(let i=0;i<pos.count;i++){
    if(surf.getZ(i)<=3.5)continue;
    const x=pos.getX(i),y=pos.getY(i),z=pos.getZ(i);
    if(x<roofMinX)roofMinX=x;if(x>roofMaxX)roofMaxX=x;
    if(z<roofMinZ)roofMinZ=z;if(z>roofMaxZ)roofMaxZ=z;
    if(y<roofMinY)roofMinY=y;if(y>roofMaxY)roofMaxY=y;
  }
  const hasRoof=Number.isFinite(roofMinY);

  // Coarse 3D occupancy grid (max 16x16x16) for fast concave corner & soffit occlusion.
  const cell=Math.max(.55,Math.max(size.x,size.y,size.z)/14);
  const gx=Math.min(18,Math.max(1,Math.ceil(size.x/cell)+2));
  const gy=Math.min(18,Math.max(1,Math.ceil(size.y/cell)+2));
  const gz=Math.min(18,Math.max(1,Math.ceil(size.z/cell)+2));
  const ox=bb.min.x-cell,oy=bb.min.y-cell,oz=bb.min.z-cell;
  const grid=new Uint8Array(gx*gy*gz);
  const idx=(x,y,z)=>{
    const ix=Math.floor((x-ox)/cell),iy=Math.floor((y-oy)/cell),iz=Math.floor((z-oz)/cell);
    if(ix<0||ix>=gx||iy<0||iy>=gy||iz<0||iz>=gz)return -1;
    return (iy*gz+iz)*gx+ix;
  };
  for(let i=0;i<pos.count;i++){
    const k=idx(pos.getX(i),pos.getY(i),pos.getZ(i));
    if(k>=0)grid[k]=1;
  }
  const probe=(x,y,z)=>{const k=idx(x,y,z);return k>=0&&grid[k]?1:0;};

  const minY=bb.min.y,hSpan=Math.max(.5,size.y);
  for(let i=0;i<pos.count;i++){
    if(emis&&(emis.getX(i)+emis.getY(i)+emis.getZ(i))>.08)continue;
    const x=pos.getX(i),y=pos.getY(i),z=pos.getZ(i);
    const nx=nrm.getX(i),ny=nrm.getY(i),nz=nrm.getZ(i);
    const mode=surf.getZ(i);

    // 1. Ground plinth contact & sky-hemisphere shading
    const hNorm=Math.max(0,Math.min(1,(y-minY)/Math.min(1.4,hSpan)));
    const groundAO=.84+.16*Math.sqrt(hNorm);
    const skyAO=.91+.09*Math.max(-1,Math.min(1,ny));

    // 2. Roof overhang eave shadow onto upper walls/porches/doors underneath
    let eaveAO=1;
    if(hasRoof&&mode<3.5&&x>=roofMinX-.35&&x<=roofMaxX+.35&&z>=roofMinZ-.35&&z<=roofMaxZ+.35){
      const under=roofMinY-y;
      if(under>=-.15&&under<=1.65){
        const band=1-Math.min(1,Math.abs(under-.22)/1.45);
        const downMask=1-Math.max(0,ny)*.65;
        eaveAO=1-.24*band*downMask;
      }
    }

    // 3. Concave crevice / archway / buttress-joint voxel occlusion
    const px=x+nx*cell*.75,py=y+ny*cell*.75,pz=z+nz*cell*.75;
    let hits=0;
    hits+=probe(px,py+cell*.85,pz);
    hits+=probe(px+cell*.65,py+cell*.35,pz);
    hits+=probe(px-cell*.65,py+cell*.35,pz);
    hits+=probe(px,py+cell*.35,pz+cell*.65);
    hits+=probe(px,py+cell*.35,pz-cell*.65);
    hits+=probe(px+nx*cell*.55,py+ny*cell*.55,pz+nz*cell*.55);
    const creviceAO=1-(hits/6)*.22;

    // 4. Subtle ridge pop on upward-facing roof planes
    let roofLift=1;
    if(mode>3.5&&hasRoof&&roofMaxY>roofMinY+.1){
      const rNorm=Math.max(0,Math.min(1,(y-roofMinY)/(roofMaxY-roofMinY)));
      roofLift=.94+.09*rNorm*Math.max(0,ny);
    }

    const ao=Math.max(.66,Math.min(1.04,groundAO*skyAO*eaveAO*creviceAO*roofLift));
    col.setXYZ(i,col.getX(i)*ao,col.getY(i)*ao,col.getZ(i)*ao);
  }
  col.needsUpdate=true;
}

function paletteMaterial(view){
  const m=view.materials;
  if(!m.structurePalette){
    const material=standardMaterial({vertexColors:true,roughness:.9});
    const atm=ensureAtmosphereUniforms(view);
    const uniforms={wood:{value:null},stone:{value:null},plaster:{value:null},roof:{value:null},woodNormal:{value:null},stoneNormal:{value:null},plasterNormal:{value:null},roofNormal:{value:null},woodArm:{value:null},stoneArm:{value:null},roofArm:{value:null},normalAvailable:{value:new THREE.Vector3()},armAvailable:{value:new THREE.Vector3()},roofPbr:{value:new THREE.Vector3()},detail:{value:0},night:{value:0},snow:{value:0},atmosphere:atm};
    material.frontierUniforms=uniforms;
    material.defines={USE_UV:''};
    if(!material.isNodeMaterial)material.onBeforeCompile=shader=>{
      for(const [key,uniform] of Object.entries(uniforms))if(key!=='atmosphere')shader.uniforms['frontierStructure'+key]=uniform;
      for(const key of ['cloudMap','cloudOffset','cloudScale','cloudStrength','wetness','sunDir','sunColor','iblSky','iblHorizon','iblGround','iblIntensity'])shader.uniforms['frontierAtm'+key]=atm[key];
      shader.vertexShader='attribute vec3 structureSurface;\nattribute vec3 structureEmission;\nattribute float structureNightGlow;\nvarying vec3 vStructureSurface;\nvarying vec3 vStructureEmission;\nvarying float vStructureNightGlow;\nvarying vec3 vStructurePos;\nvarying vec3 vStructureWorldPos;\nvarying float vStructureRoofUp;\n'+shader.vertexShader;
      shader.vertexShader=shader.vertexShader.replace('#include <color_vertex>','#include <color_vertex>\nvStructureSurface = structureSurface;\nvStructureEmission = structureEmission;\nvStructureNightGlow = structureNightGlow;\nvStructurePos = position;\nvStructureRoofUp = normalize(normal).y;');
      shader.vertexShader=shader.vertexShader.replace('#include <project_vertex>',`#include <project_vertex>
        vec4 frontierStructWorld = vec4(transformed, 1.0);
        #ifdef USE_BATCHING
          frontierStructWorld = batchingMatrix * frontierStructWorld;
        #endif
        #ifdef USE_INSTANCING
          frontierStructWorld = instanceMatrix * frontierStructWorld;
        #endif
        vStructureWorldPos = (modelMatrix * frontierStructWorld).xyz;`);
      shader.fragmentShader=`uniform sampler2D frontierStructurewood;
        uniform sampler2D frontierStructurestone;
        uniform sampler2D frontierStructureplaster;
        uniform sampler2D frontierStructureroof;
        uniform sampler2D frontierStructurewoodNormal;
        uniform sampler2D frontierStructurestoneNormal;
        uniform sampler2D frontierStructureplasterNormal;
        uniform sampler2D frontierStructureroofNormal;
        uniform sampler2D frontierStructurewoodArm;
        uniform sampler2D frontierStructurestoneArm;
        uniform sampler2D frontierStructureroofArm;
        uniform vec3 frontierStructurenormalAvailable;
        uniform vec3 frontierStructurearmAvailable;
        uniform vec3 frontierStructureroofPbr;
        uniform float frontierStructuredetail;
        uniform float frontierStructurenight;
        uniform float frontierStructuresnow;
        uniform sampler2D frontierAtmcloudMap;
        uniform vec2 frontierAtmcloudOffset;
        uniform float frontierAtmcloudScale;
        uniform float frontierAtmcloudStrength;
        uniform float frontierAtmwetness;
        uniform vec3 frontierAtmsunDir;
        uniform vec3 frontierAtmsunColor;
        uniform vec3 frontierAtmiblSky;
        uniform vec3 frontierAtmiblHorizon;
        uniform vec3 frontierAtmiblGround;
        uniform float frontierAtmiblIntensity;
        varying float vStructureRoofUp;
        varying vec3 vStructureSurface;
        varying vec3 vStructureEmission;
        varying vec3 vStructurePos;
        varying vec3 vStructureWorldPos;
        ${CLOUD_SHADOW_GLSL}
        ${ANALYTIC_IBL_GLSL}\n`+shader.fragmentShader;
      shader.fragmentShader=shader.fragmentShader.replace('#include <color_fragment>',`#include <color_fragment>
        float plinthMask = 1.0 - smoothstep(0.0, 0.85, max(0.0, vStructurePos.y));
        float earthSkirt = 1.0 - smoothstep(0.0, 0.48, max(0.0, vStructurePos.y));
        float groundAo = mix(0.79, 1.0, smoothstep(0.0, 1.25, max(0.0, vStructurePos.y)));
        if(vStructureSurface.z > 3.5) {
          float shingleCourse = 0.96 + 0.055 * sin(vStructurePos.y * 19.5 + (vStructurePos.x + vStructurePos.z) * 2.8);
          vec2 roofUv = frontierStructureroofPbr.x > 0.5 ? vUv * 1.65 : vUv;
          vec3 roofSample = texture2D(frontierStructureroof, roofUv).rgb;
          float roofLuma = dot(roofSample, vec3(0.30, 0.59, 0.11));
          vec3 roofDetail = mix(vec3(roofLuma * 1.95 + 0.28), roofSample * 1.46, 0.25);
          vec3 roof = frontierStructureroofPbr.x > 0.5 ? mix(vec3(1.0), roofDetail, 0.78) : roofSample;
          float eaveWeather = mix(0.88, 1.04, smoothstep(1.8, 6.2, vStructurePos.y));
          diffuseColor.rgb *= roof * shingleCourse * eaveWeather;
          if (frontierStructuresnow > 0.5) {
            float drift = sin(vStructurePos.x * 1.85 + vStructurePos.z * 0.71) * cos(vStructurePos.z * 1.31 - vStructurePos.y * .77);
            float edging = sin(vStructurePos.x * 9.6 - vStructurePos.z * 12.0) * .12;
            float settle = smoothstep(.23, .76, vStructureRoofUp) * smoothstep(-.60, .45, drift * .49 + edging + .28);
            float grain = .84 + .16 * dot(roofSample, vec3(.3, .59, .11));
            diffuseColor.rgb = mix(diffuseColor.rgb, vec3(.67, .76, .84) * grain, settle * .88);
          }
        } else if(vStructureSurface.z > 2.5) {
          vec3 plasterTex = texture2D(frontierStructureplaster, vUv * 1.15).rgb;
          vec3 plinthStone = texture2D(frontierStructurestone, vUv * 1.6).rgb * 0.84;
          float skipPlinth = smoothstep(-0.2, -0.8, vStructureNightGlow);
          float canvasMask = smoothstep(-1.2, -1.8, vStructureNightGlow);
          vec3 basePlaster = mix(plasterTex * 1.04, plinthStone, plinthMask * 0.65 * (1.0 - skipPlinth));
          if (canvasMask > 0.01) {
            // Photorealistic draped woven burlap / stitched animal-hide canvas (ZERO flat cartoon paper!)
            float cU = vStructurePos.x * 2.4 + vStructurePos.z * 0.7;
            float cV = vStructurePos.z * 2.4 - vStructurePos.x * 0.7;
            float weaveA = sin(vStructurePos.x * 58.0 + vStructurePos.z * 14.0) * sin(vStructurePos.z * 58.0 - vStructurePos.x * 14.0);
            float weaveB = sin(vStructurePos.x * 29.0 + vStructurePos.y * 26.0) * cos(vStructurePos.z * 31.0 - vStructurePos.y * 19.0);
            float foldWave = sin(cU * 2.9 + sin(cV * 1.7) * 0.9) * 0.55 + cos(cV * 3.4 - cU * 1.1) * 0.45;
            float mottle = sin(vStructurePos.x * 3.1 + vStructurePos.z * 2.7) * cos(vStructurePos.z * 2.3 - vStructurePos.x * 1.9);
            float seam = 1.0 - 0.16 * smoothstep(0.92, 0.99, abs(sin(vStructurePos.x * 2.6 + vStructurePos.z * 2.6)));
            float eaveWeather = mix(0.84, 1.05, smoothstep(1.4, 3.6, vStructurePos.y));
            float clothLuma = clamp(0.90 + foldWave * 0.17 + mottle * 0.09 + weaveA * 0.055 + weaveB * 0.045, 0.56, 1.16) * seam * eaveWeather;
            vec3 clothTint = mix(vec3(0.88, 0.76, 0.58), vec3(1.06, 1.00, 0.88), smoothstep(-0.65, 0.75, foldWave + mottle * 0.4));
            vec3 hideCanvas = mix(plasterTex * 0.5 + vec3(0.5), vec3(1.0), 0.55) * clothTint * clothLuma;
            basePlaster = mix(basePlaster, hideCanvas, canvasMask);
          }
          diffuseColor.rgb *= basePlaster;
        } else if(vStructureSurface.z > 1.5) {
          float ashlarCourse = 0.96 + 0.07 * sin(vStructurePos.y * 12.0) * cos((vStructurePos.x - vStructurePos.z) * 4.8);
          vec3 stoneSample = texture2D(frontierStructurestone, vUv * 1.25).rgb;
          float stoneLuma = dot(stoneSample, vec3(0.30, 0.59, 0.11));
          vec3 warmBrownStone = stoneSample * vec3(1.14, 1.00, 0.84);
          vec3 coolAshlar = mix(stoneSample, vec3(stoneLuma * 1.28, stoneLuma * 1.30, stoneLuma * 1.34), 0.76);
          float silverStone = smoothstep(-0.2, -0.8, vStructureNightGlow);
          diffuseColor.rgb *= mix(warmBrownStone, coolAshlar, silverStone) * ashlarCourse * mix(1.0, 0.85, plinthMask * 0.48);
        } else if(vStructureSurface.z > 0.5) {
          float woodGrain = 0.94 + 0.075 * sin((vStructurePos.x + vStructurePos.y * 2.6 + vStructurePos.z) * 11.5);
          vec3 woodSample = texture2D(frontierStructurewood, vUv * 1.25).rgb;
          float woodLuma = dot(woodSample, vec3(0.30, 0.59, 0.11));
          float weatheredMask = smoothstep(-0.2, -0.8, vStructureNightGlow);
          float thatchMask = smoothstep(-1.2, -1.8, vStructureNightGlow);
          // Bright weathered sun-bleached split-log ash-driftwood (stays bright & crisp at dusk, never charcoal!)
          float barkGroove = sin(vStructurePos.x * 26.0 + vStructurePos.z * 26.0 + sin(vStructurePos.y * 6.5) * 1.4);
          float driftTone = clamp(woodLuma * 2.55 + 0.48 + barkGroove * 0.10, 0.44, 1.18);
          vec3 weatheredDrift = vec3(driftTone * 1.04, driftTone * 0.99, driftTone * 0.90);
          vec3 chosenWood = mix(woodSample, weatheredDrift, weatheredMask) * woodGrain;
          if (thatchMask > 0.01) {
            // Photorealistic fine-grained shaggy multi-tier reed thatch (ZERO zebra stripes, ZERO cartoon paper!)
            float tierCoord = vStructurePos.y * 6.2 + sin(vStructurePos.x * 3.7 + vStructurePos.z * 3.3) * 0.22;
            float tierIdx = floor(tierCoord);
            float tierFrac = fract(tierCoord);
            float stalkPos = vStructurePos.x * 36.0 + vStructurePos.z * 36.0 + tierIdx * 19.7;
            float fiberA = sin(stalkPos + sin(vStructurePos.y * 14.0 + stalkPos * 0.22) * 1.4);
            float fiberB = sin(stalkPos * 2.17 - vStructurePos.y * 23.0 + tierIdx * 8.3);
            float fiberC = cos(vStructurePos.x * 62.0 - vStructurePos.z * 57.0 + vStructurePos.y * 18.0);
            float bundle = sin((vStructurePos.x + vStructurePos.z) * 11.4 + tierIdx * 5.3) * 0.5 + 0.5;
            // Crisp dark undercut shadow beneath each overlapping reed tier + fine individual straw wisps!
            float tierShadow = mix(0.66, 1.06, smoothstep(0.0, 0.28, tierFrac));
            float fiberShade = clamp(0.78 + fiberA * 0.19 + fiberB * 0.13 + fiberC * 0.09 + (bundle - 0.5) * 0.16, 0.44, 1.18);
            float patchNoise = sin(vStructurePos.x * 2.6 - vStructurePos.z * 2.3) * cos(vStructurePos.z * 3.5 + vStructurePos.y * 2.1);
            vec3 reedColor = mix(vec3(0.72, 0.63, 0.46), vec3(1.12, 1.02, 0.80), clamp(fiberA * 0.48 + 0.5 + patchNoise * 0.22, 0.0, 1.0));
            // Subtle mossy weathered patina right near low damp eaves
            vec3 dampMoss = mix(reedColor, vec3(0.68, 0.74, 0.52), smoothstep(2.8, 1.5, vStructurePos.y) * max(0.0, patchNoise) * 0.28);
            vec3 shaggyThatch = dampMoss * tierShadow * fiberShade * mix(0.86, 1.08, clamp(woodLuma * 2.2 + 0.42, 0.0, 1.0));
            chosenWood = mix(chosenWood, shaggyThatch, thatchMask);
          }
          diffuseColor.rgb *= chosenWood;
        } else if(vStructureNightGlow < -1.2) {
          // Woven medieval dyed-linen cloth grain for Age 1-2 team valances, banners & gable cloth (ZERO neon plastic!)
          float linen = sin(vStructurePos.x * 46.0 + vStructurePos.y * 22.0) * cos(vStructurePos.z * 46.0 - vStructurePos.y * 22.0);
          float fold = sin(vStructurePos.x * 6.2 + vStructurePos.z * 5.8 + vStructurePos.y * 3.1);
          diffuseColor.rgb *= clamp(0.84 + fold * 0.09 + linen * 0.055, 0.68, 1.02);
        }
        float structWetFace = frontierAtmwetness * mix(0.45, 1.0, smoothstep(0.15, 0.85, vStructureRoofUp));
        diffuseColor.rgb *= mix(vec3(1.0), vec3(0.86, 0.82, 0.73), earthSkirt * 0.48) * groundAo * mix(1.0, 0.84, structWetFace);
        diffuseColor.rgb *= frontierCloudLight(vStructureWorldPos.xz, frontierAtmcloudMap, frontierAtmcloudOffset, frontierAtmcloudScale, frontierAtmcloudStrength * 0.85, frontierAtmiblSky);`);
      shader.fragmentShader=shader.fragmentShader.replace('#include <roughnessmap_fragment>',`#include <roughnessmap_fragment>
        roughnessFactor = vStructureSurface.x;
        float structureOcclusion = mix(0.80, 1.0, smoothstep(0.0, 1.2, max(0.0, vStructurePos.y)));
        bool armReady = vStructureSurface.z > 3.5 ? frontierStructureroofPbr.z > 0.5 : vStructureSurface.z > 2.5 ? false : vStructureSurface.z > 1.5 ? frontierStructurearmAvailable.y > 0.5 : frontierStructurearmAvailable.x > 0.5;
        if(frontierStructuredetail > 0.5 && vStructureSurface.z > 0.5 && armReady) {
          vec2 structureArm = vStructureSurface.z > 3.5 ? texture2D(frontierStructureroofArm, vUv * 1.65).rg : vStructureSurface.z > 1.5 ? texture2D(frontierStructurestoneArm, vUv).rg : texture2D(frontierStructurewoodArm, vUv).rg;
          roughnessFactor *= vStructureSurface.z > 3.5 ? mix(0.68, 1.06, structureArm.g) : structureArm.g;
          structureOcclusion *= mix(1.0, structureArm.r, vStructureSurface.z > 3.5 ? 0.82 : 0.72);
        } else if(vStructureSurface.z > 2.5 && vStructureSurface.z < 3.5) {
          float plasterLuma = dot(diffuseColor.rgb, vec3(0.3, 0.59, 0.11));
          roughnessFactor *= mix(0.98, 0.88, smoothstep(0.25, 0.75, plasterLuma));
          structureOcclusion *= mix(0.88, 1.0, smoothstep(0.18, 0.62, plasterLuma));
        }
        float rainGloss = frontierAtmwetness * mix(0.42, 0.94, smoothstep(0.10, 0.75, vStructureRoofUp));
        roughnessFactor = clamp(mix(roughnessFactor, roughnessFactor * 0.40, rainGloss), 0.04, 1.0);`);
      shader.fragmentShader=shader.fragmentShader.replace('#include <aomap_fragment>','#include <aomap_fragment>\nreflectedLight.indirectDiffuse *= structureOcclusion;');
      shader.fragmentShader=shader.fragmentShader.replace('#include <metalnessmap_fragment>','#include <metalnessmap_fragment>\nmetalnessFactor = clamp(vStructureSurface.y, 0.0, 1.0);');
      shader.fragmentShader='varying float vStructureNightGlow;\n'+shader.fragmentShader;
      shader.fragmentShader=shader.fragmentShader.replace('#include <emissivemap_fragment>','#include <emissivemap_fragment>\ntotalEmissiveRadiance += vStructureEmission * (1.0 + frontierStructurenight * 1.65) + vec3(1.18, 0.56, 0.16) * max(0.0, vStructureNightGlow) * frontierStructurenight;');
      shader.fragmentShader=shader.fragmentShader.replace('#include <normal_fragment_maps>',`
        #ifdef USE_NORMALMAP_TANGENTSPACE
        bool normalReady = vStructureSurface.z > 3.5 ? frontierStructureroofPbr.y > 0.5 : vStructureSurface.z > 2.5 ? frontierStructurenormalAvailable.z > 0.5 : vStructureSurface.z > 1.5 ? frontierStructurenormalAvailable.y > 0.5 : frontierStructurenormalAvailable.x > 0.5;
        if(vStructureSurface.z > 0.5 && frontierStructuredetail > 0.5 && normalReady) {
          vec3 structureNormal = vStructureSurface.z > 3.5 ? texture2D(frontierStructureroofNormal, vUv * 1.65).xyz : vStructureSurface.z > 2.5 ? texture2D(frontierStructureplasterNormal, vUv).xyz : vStructureSurface.z > 1.5 ? texture2D(frontierStructurestoneNormal, vUv).xyz : texture2D(frontierStructurewoodNormal, vUv).xyz;
          structureNormal = structureNormal * 2.0 - 1.0;
          structureNormal.xy *= vStructureSurface.z > 3.5 ? 0.62 : vStructureSurface.z > 2.5 ? 0.30 : vStructureSurface.z > 1.5 ? 0.54 : 0.38;
          normal = normalize(tbn * structureNormal);
        }
        #endif`);
      shader.fragmentShader=shader.fragmentShader.replace('#include <opaque_fragment>',`
        {
          vec3 structViewDir = normalize(vViewPosition);
          vec3 structWorldNormal = normalize(inverseTransformDirection(normal, viewMatrix));
          vec3 structRefl = normalize(inverseTransformDirection(reflect(-structViewDir, normal), viewMatrix));
          float structLuma = dot(outgoingLight, vec3(0.3, 0.59, 0.11));
          outgoingLight += frontierAnalyticIbl(
            structWorldNormal, normal, structViewDir, structRefl,
            diffuseColor.rgb, roughnessFactor, metalnessFactor,
            frontierAtmsunDir, frontierAtmsunColor,
            frontierAtmiblSky, frontierAtmiblHorizon, frontierAtmiblGround,
            frontierAtmiblIntensity, frontierStructurenight, frontierAtmwetness, structLuma
          );
        }
        #include <opaque_fragment>`);
    };
    if(!material.isNodeMaterial)material.customProgramCacheKey=()=> 'frontier-structure-palette-v14';
    m.structurePalette=material;
  }
  const material=m.structurePalette,u=material.frontierUniforms,roofMaps=roofSurfaceMaps();
  u.wood.value=m.wood.map||null;u.stone.value=m.stone.map||null;u.plaster.value=m.plaster.map||null;
  u.roof.value=roofMaps.color||view.roofMaterials?.find(material=>material.map)?.map||null;
  u.woodNormal.value=m.wood.normalMap||null;u.stoneNormal.value=m.stone.normalMap||null;
  u.plasterNormal.value=m.plaster.normalMap||null;
  u.roofNormal.value=view.settings?.quality==='low'?null:roofMaps.normal||null;
  u.normalAvailable.value.set(u.woodNormal.value?1:0,u.stoneNormal.value?1:0,u.plasterNormal.value?1:0);
  u.woodArm.value=m.wood.roughnessMap||null;u.stoneArm.value=m.stone.roughnessMap||null;
  u.roofArm.value=view.settings?.quality==='low'?null:roofMaps.arm||null;
  u.armAvailable.value.set(u.woodArm.value?1:0,u.stoneArm.value?1:0,0);
  u.roofPbr.value.set(roofMaps.color?1:0,u.roofNormal.value?1:0,u.roofArm.value?1:0);
  u.snow.value=Number(isSnowBiome(view.sim?.options?.map));
  u.detail.value=view.settings?.quality==='high'?2:view.settings?.quality==='medium'?1:0;
  const normal=u.stoneNormal.value||u.woodNormal.value||u.plasterNormal.value||u.roofNormal.value||null;
  if(material.normalMap!==normal){material.normalMap=normal;material.needsUpdate=true;}
  if(material.isNodeMaterial&&!material.colorNode)nodeRuntime().structurePalette(material,u);
  return material;
}

const linearHex=hex=>new THREE.Color(hex).toArray();
const EARLY_SURFACE_COLOR={
  strawTex:linearHex(0x8c7248),
  strawFlat:linearHex(0x7a623c),
  trunkTex:linearHex(0x7c7163),
  trunkFlat:linearHex(0x685e52),
  canvasTex:linearHex(0xe2c488),
  canvasFlat:linearHex(0xcda86c),
  sunPlasterTex:linearHex(0xe8c388),
  sunPlasterFlat:linearHex(0xd8b074),
  creamPlasterTex:linearHex(0xe8dfd0),
  sunBrick:linearHex(0xc87d4b),
  mossLight:linearHex(0x4c8531),
  mossDark:linearHex(0x2f5c1e),
};

function promotedWallColor(material,rawMode,mode,m){
  if(mode===rawMode)return material.color.toArray();
  // Replace wood's brown multiplier or plaster's warm tint when age promotes a surface to another architectural class.
  if(mode===1)return [.68,.55,.41];
  if(mode===3)return m.plaster?.color?.toArray()||[.88,.82,.69];
  if(mode===2)return material===m.darkwood?[.64,.68,.75]:[.90,.92,.96];
  return material.color.toArray();
}

function bakeSurface(view,part,matrix,tint,roughnessScale,wallAge,roofFinish,silverStone=false,preserveSurface=false,faction='alder'){
  const geometry=part.geometry.clone().applyMatrix4(matrix),count=geometry.attributes.position.count;
  // Indexed geometry retains the compressed catalogue's shared vertices in RAM.
  if(!geometry.index)geometry.setIndex(Array.from({length:count},(_,i)=>i));
  for(const name of Object.keys(geometry.attributes))if(!['position','normal','uv','color'].includes(name))geometry.deleteAttribute(name);
  if(!geometry.attributes.normal)geometry.computeVertexNormals();
  if(!geometry.attributes.uv)geometry.setAttribute('uv',new THREE.Float32BufferAttribute(new Float32Array(count*2),2));
  const old=geometry.attributes.color,colors=new Float32Array(count*3),surface=new Float32Array(count*3),emission=new Float32Array(count*3),nightGlow=new Float32Array(count);
  const m=view.materials,material=part.material,emissive=material.emissive?.toArray()||[0,0,0];
  const hasRoofMap=Boolean(roofSurfaceMaps().color||material.map);
  const rawMode=[m.wood,m.timberEdge].includes(material)&&m.wood.map?1:material===m.darkwood&&m.wood.map?1:preserveSurface&&(material===m.straw||material===m.trunk)&&m.wood.map?1:[m.stone,m.stoneDark,m.brick].includes(material)&&m.stone.map?2:(material===m.plaster||(preserveSurface&&material===m.canvas))&&m.plaster.map?3:view.roofMaterials?.includes(material)&&hasRoofMap?4:0;
  const mode=preserveSurface?rawMode:(material===m.darkwood&&rawMode===1&&wallAge<3?1:ageSurface(rawMode,wallAge));
  if(mode===4&&!/SlateTiles/i.test(part.name||''))smoothShallowCreases(geometry,.52);
  let sourceColor=promotedWallColor(material,rawMode,mode,m);
  if(preserveSurface){
    if(material===m.straw)sourceColor=mode===1?EARLY_SURFACE_COLOR.strawTex:EARLY_SURFACE_COLOR.strawFlat;
    else if(material===m.trunk)sourceColor=mode===1?EARLY_SURFACE_COLOR.trunkTex:EARLY_SURFACE_COLOR.trunkFlat;
    else if(material===m.canvas)sourceColor=mode===3?EARLY_SURFACE_COLOR.canvasTex:EARLY_SURFACE_COLOR.canvasFlat;
    else if(material===m.plaster&&faction==='sun')sourceColor=mode===3?EARLY_SURFACE_COLOR.sunPlasterTex:EARLY_SURFACE_COLOR.sunPlasterFlat;
    else if(material===m.plaster&&mode===3)sourceColor=EARLY_SURFACE_COLOR.creamPlasterTex;
    else if(material===m.brick&&faction==='sun')sourceColor=EARLY_SURFACE_COLOR.sunBrick;
    else if(material===m.leaf)sourceColor=EARLY_SURFACE_COLOR.mossLight;
    else if(material===m.leafDark)sourceColor=EARLY_SURFACE_COLOR.mossDark;
  }
  // Roofs keep clear team ownership color (72%) with a subtle age-specific finish tint (28%).
  const styledRoof=mode===4&&roofFinish;
  const color=styledRoof?sourceColor.map((channel,i)=>THREE.MathUtils.lerp(channel,roofFinish[i],.28)):sourceColor;
  for(let i=0;i<count;i++)for(let k=0;k<3;k++){
    colors[i*3+k]=color[k]*(old?old.getComponent(i,k):1)*(styledRoof?1:tint[k]);
    surface[i*3+k]=k===0?Math.min(1,(material.roughness??.9)*roughnessScale):k===1?material.metalness??0:mode;
    emission[i*3+k]=emissive[k]*(material.emissiveIntensity??1);
  }
  geometry.setAttribute('color',new THREE.BufferAttribute(colors,3));
  geometry.setAttribute('structureSurface',new THREE.BufferAttribute(surface,3));
  geometry.setAttribute('structureEmission',new THREE.BufferAttribute(emission,3));
  if(material===m.glass)nightGlow.fill(1);
  else if(mode===2&&silverStone)nightGlow.fill(-1);
  else if(preserveSurface&&mode===1&&material===m.straw)nightGlow.fill(-2);
  else if(preserveSurface&&mode===1&&material===m.trunk)nightGlow.fill(-1);
  else if(preserveSurface&&mode===3&&material===m.canvas)nightGlow.fill(-2);
  else if(preserveSurface&&mode===3&&material===m.plaster&&faction==='sun')nightGlow.fill(-1);
  else if(preserveSurface&&mode===0&&view.teamMaterials?.includes(material))nightGlow.fill(-2);
  geometry.setAttribute('structureNightGlow',new THREE.BufferAttribute(nightGlow,1));
  geometry.clearGroups();return geometry;
}

const movable=node=>node.userData.gate||node.userData.windmill||node.userData.dockPier||node.userData.flag;
const FRAMED_BUILDINGS=new Set(['house','mill','market','barracks','range','stable','camp','workshop']);

// One opaque draw per static structure; moving gates, mill rotors and flags keep
// their own pivots. Identical houses and wall sections reuse the same geometry.
export function packBuildingModel(view,root,e){
  if(root.userData.structurePacked)return root;
  const palette=paletteMaterial(view),metadata=root.userData.model3d||{};
  const tier=metadata.wallTier||'stone',fortified=tier==='fortified',palisade=tier==='palisade';
  const preserveSurface=!!metadata.authoredAgeVariant||palisade;
  const surfaceAge=metadata.architectureAge||0,ageStyled=e.type==='towncenter'||e.type==='dock'||isAgeStyled(e.type);
  // Everyday buildings keep timber frames and limewashed panels as they grow.
  // Dedicated Age 1 & Age 2 regional Blender models preserve their exact timber/adobe/plaster surfaces.
  const wallAge=FRAMED_BUILDINGS.has(e.type)?Math.min(1,surfaceAge):surfaceAge;
  const style=architectureStyle(ageStyled?surfaceAge:0),masonry=e.type==='wall'||e.type==='gate';
  const silverStone=fortified||(!masonry&&surfaceAge>=3);
  const tint=masonry?(fortified?[.84,.89,.96]:palisade?[1,1,1]:[.98,.93,.86]):(metadata.authoredAgeVariant?[1,1,1]:style.tint),roofFinish=ageStyled?style.roof:null,roughnessScale=fortified?1.08:1+surfaceAge*.01;
  const faction=view.sim.players[e.owner]?.faction||'alder';
  const key=[e.type,faction,metadata.architectureAge||0,metadata.artRevision||'base',metadata.authoredAgeVariant?'early':'std',metadata.wallCorner?'corner':'run',e.owner,metadata.detail||'procedural',view.settings?.quality,
    view.teamMaterials[e.owner]?.color.getHex(),view.roofMaterials?.[e.owner]?.color.getHex(),tier,isSnowBiome(view.sim?.options?.map)?'snow':'dry'].join(':');
  view.structureGeometryCache??=new Map();view.sharedModelGeometry??=new Set();
  root.updateMatrixWorld(true);
  const pack=(group,path)=>{
    const parts=[],walk=node=>{
      for(const child of [...node.children]){
        if(movable(child)){pack(child,path+'/'+child.name+':'+node.children.indexOf(child));continue;}
        if(child.isMesh){if(!child.userData.flag&&!child.material.transparent)parts.push(child);}
        else walk(child);
      }
    };walk(group);
    if(!parts.length)return;
    const cacheKey=key+':'+path;let geometry=view.structureGeometryCache.get(cacheKey);
    if(!geometry){
      const inverse=group.matrixWorld.clone().invert(),sources=parts.map(part=>bakeSurface(view,part,inverse.clone().multiply(part.matrixWorld),tint,roughnessScale,wallAge,roofFinish,silverStone,preserveSurface,faction));
      geometry=mergeGeometries(sources);for(const source of sources)source.dispose();
      if(!geometry)throw new Error('Building surfaces could not be merged.');
      geometry.computeBoundingBox();geometry.computeBoundingSphere();
      bakeBuildingVertexAO(geometry);
      view.structureGeometryCache.set(cacheKey,geometry);view.sharedModelGeometry.add(geometry);
    }
    const shared=new Set([...Object.values(view.geo),...(view.authoredGeometry||[]),...view.sharedModelGeometry]);
    for(const part of parts){part.removeFromParent();if(!shared.has(part.geometry))part.geometry.dispose();}
    const mesh=new THREE.Mesh(geometry,palette);mesh.castShadow=mesh.receiveShadow=true;mesh.userData.structureSurface=true;group.add(mesh);
    // A destroyed building leaves a shell that reuses this exact surface, so the
    // geometry and material stay reachable after the node itself is removed.
    if(e?.id!=null){const registry=view.structureByEntity??=new Map();registry.set(e.id,{geometry,material:palette});if(registry.size>512)registry.delete(registry.keys().next().value);}
  };pack(root,'static');
  const prune=node=>{for(const child of [...node.children]){prune(child);if(child.isGroup&&!child.children.length&&!movable(child))child.removeFromParent();}};
  prune(root);root.userData.structurePacked=true;return root;
}

export function installStructurePalette(WorldView){
  const p=WorldView.prototype,makeBuilding=p.makeBuilding,mergeModel=p.mergeModel,attach=p.attach;
  p.makeBuilding=function(e){return packBuildingModel(this,makeBuilding.call(this,e),e);};
  p.mergeModel=function(root){return root.userData.structurePacked?root:mergeModel.call(this,root);};
  p.attach=function(sim){
    const previous=this.sharedModelGeometry||new Set();
    this.structureGeometryCache=new Map();this.damagedGeometryCache=new Map();this.sharedModelGeometry=new Set(previous);
    // Portraits can still reference a previous scene's shared building geometry.
    this.modelPortrait?.clear();if(this.modelPortrait)this.modelPortrait.key=null;
    attach.call(this,sim);
    for(const geometry of previous){geometry.dispose();this.sharedModelGeometry.delete(geometry);}
  };
}
