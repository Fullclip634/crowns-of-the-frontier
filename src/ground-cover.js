import {standardMaterial,nodeRuntime} from './render-runtime.js';
import * as THREE from 'three';
import {seededRandom} from './data.js';
import {nearViewport,markInstancePrefix} from './render-batches.js';
import {roadDistance} from './terrain-layout.js';
import {terrainBiome,isSnowBiome} from './terrain-biomes.js';
import {bridgeFootprint} from './bridge-layout.js';

const buildingCellKey=(cx,cz)=>(cx+4096)*8192+(cz+4096);
export const buildingSiteKey=(x,z)=>buildingCellKey(Math.floor(x/16),Math.floor(z/16));

// Grass never casts shadows, so tip-weighted GPU vertex wind runs smoothly at
// 60 FPS with zero stationary CPU instance-matrix rebuilds or depth hooks.
function configureGrassWind(material){
  const wind=material.frontierGrassWind={time:{value:0},strength:{value:0}};
  if(material.isNodeMaterial){nodeRuntime()?.grassWind?.(material,wind);return wind;}
  const prepare=material.onBeforeCompile,programKey=material.customProgramCacheKey.call(material);
  material.onBeforeCompile=function(shader,renderer){
    prepare.call(this,shader,renderer);
    shader.uniforms.frontierGrassTime=wind.time;
    shader.uniforms.frontierGrassStrength=wind.strength;
    shader.vertexShader=`uniform float frontierGrassTime;
      uniform float frontierGrassStrength;\n`+shader.vertexShader.replace('#include <begin_vertex>',`#include <begin_vertex>
      #ifdef USE_INSTANCING
        if (frontierGrassStrength > 0.0001) {
          vec2 grassWorldXZ = (instanceMatrix * vec4(position, 1.0)).xz;
          float grassBend = clamp(position.y * 2.4, 0.0, 1.0);
          grassBend *= grassBend;
          float grassGust = sin(frontierGrassTime * 1.9 + grassWorldXZ.x * 0.24 + grassWorldXZ.z * 0.18)
            + 0.35 * sin(frontierGrassTime * 3.1 - grassWorldXZ.x * 0.39 + grassWorldXZ.z * 0.33);
          vec2 grassWindWorld = vec2(0.84, 0.54) * (grassGust * grassBend * frontierGrassStrength);
          float grassScaleSq = max(dot(instanceMatrix[0].xz, instanceMatrix[0].xz), 0.0001);
          transformed.x += dot(grassWindWorld, instanceMatrix[0].xz) / grassScaleSq;
          transformed.z += dot(grassWindWorld, instanceMatrix[2].xz) / grassScaleSq;
        }
      #endif`);
  };
  material.customProgramCacheKey=()=>`${programKey}:grass-wind-v1`;
  material.needsUpdate=true;
  return wind;
}

// Both tiers use the same low, tapered silhouette. Performance and Balanced
// draw four blades per tuft, while High draws six in the same instance batch.
export const tuftBlades=quality=>quality==='high'?6:4;
export function grassTuftGeometry(blades=6){
  const vertices=[],indices=[],uv=[],colors=[];
  const heights=[.25,.36,.43,.30,.33,.39];
  for(let blade=0;blade<blades;blade++){
    const angle=blade*2.399,h=heights[blade%heights.length],w=.024+(blade%3)*.008,lean=.12+(blade%4)*.035;
    const spread=.16+(blade%3)*.06;
    const center=new THREE.Vector3(Math.sin(angle)*spread,0,Math.cos(angle)*spread);
    const across=new THREE.Vector3(Math.cos(angle),0,-Math.sin(angle));
    const front=new THREE.Vector3(Math.sin(angle),0,Math.cos(angle));
    const base=vertices.length/3;
    for(const [width,y,bend,thickness,tint] of [[w,0,0,.008,[.50,.51,.43]],[w*.58,h*.54,lean*.28,.005,[.79,.84,.70]]]){
      for(const [side,depth] of [[-1,-1],[1,-1],[1,1],[-1,1]]){
        const p=center.clone().addScaledVector(across,side*width).addScaledVector(front,bend+depth*thickness);p.y=y;
        vertices.push(...p.toArray());uv.push((side+1)*.5,y/h);colors.push(...tint);
      }
    }
    const tip=center.clone().addScaledVector(front,lean).addScaledVector(across,blade%2===0?w:-w);
    tip.y=h;vertices.push(...tip.toArray());uv.push(.5,1);colors.push(.98,1,.81);
    indices.push(base,base+2,base+1,base,base+3,base+2);
    for(let i=0;i<4;i++){const next=(i+1)%4;indices.push(base+i,base+next,base+4+next,base+i,base+4+next,base+4+i,base+4+i,base+4+next,base+8);}
  }
  const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3));geometry.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));geometry.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));geometry.setIndex(indices);geometry.computeVertexNormals();geometry.computeBoundingBox();geometry.computeBoundingSphere();return geometry;
}

export class GroundCover{
  constructor(view){
    this.view=view;const land=view.landscape,rng=seededRandom(land.seed+19),low=view.settings.quality!=='high';
    const capacity=Math.min(low?1800:4800,Math.floor(land.worldSize**2*(low?.036:.072)));
    const winter=isSnowBiome(land.map);
    const material=standardMaterial({color:0xffffff,roughness:.98,vertexColors:true});
    this.wind=configureGrassWind(material);
    this.mesh=new THREE.InstancedMesh(grassTuftGeometry(tuftBlades(view.settings.quality)),material,capacity);this.mesh.count=0;this.mesh.frustumCulled=false;this.mesh.receiveShadow=true;
    this.mesh.name='Solid ground vegetation';this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);view.terrain.add(this.mesh);
    this.entries=[];this.visibleEntries=[];this.buildingSites=new Map();this.dummy=new THREE.Object3D();this.color=new THREE.Color();
    const basePalette=terrainBiome(land.map).grass,meadowGreen=!winter&&!['arid','tundra','volcanic'].includes(land.map);
    const palette=meadowGreen?[...basePalette,0x4c6835,0x79824e]:basePalette;
    this.heightScale=winter?.75:meadowGreen?1:.8;
    const settlements=land.settlements||[],campRadius=Math.min(28,land.worldSize*.15);
    for(let i=0;i<capacity*2&&this.entries.length<capacity;i++){
      const x=(rng()-.5)*(land.worldSize-6),z=(rng()-.5)*(land.worldSize-6),y=land.surfaceHeightAt(x,z);
      if(y<.2||roadDistance(x,z,land,1.85)<1.85||bridgeFootprint(land.map,x,z,3)||winter&&rng()<.5)continue;
      const townDist=settlements.length?Math.min(...settlements.map(s=>Math.hypot(x-s.x,z-s.z))):Infinity;
      const campDist=townDist+Math.sin(x*.23+z*.19)*3.8+Math.cos(x*.17-z*.29)*2.8;
      const campFactor=Math.max(0,Math.min(1,campDist/campRadius));
      if(campFactor<1&&rng()>.18+campFactor*.55)continue;
      const patch=Math.sin(x*.14+z*.11)*Math.cos(x*.09-z*.13);
      const campScale=.7+.3*campFactor;
      const scale=(.82+rng()*.84)*(patch>0?1.17:.95)*campScale;
      this.entries.push({x,y,z,angle:rng()*Math.PI*2,scale,color:palette[this.entries.length%palette.length],shade:.79+rng()*.31});
    }
    this.update(true,true);
  }
  update(menu=false,force=false){
    const v=this.view;
    const animated=!v.settings.reducedMotion&&v.settings.quality!=='low';
    this.wind.time.value=animated?v.clock:0;
    this.wind.strength.value=animated?(.055+(v.weatherState?.amount||0)*.095)*(v.settings.quality==='high'?1:.7):0;
    const key=[v.target.x,v.target.z,v.zoom,v.angle,v.tilt,menu,v.settings.fog].join(':');
    if(!force&&this.key===key&&v.clock-(this.last||0)<(v.settings.quality==='high'?.3:.5))return;
    this.key=key;this.last=v.clock;
    const sites=this.buildingSites;sites.clear();
    for(const e of v.sim.entities)if(e.kind==='building'&&e.hp>0){const r=e.r+(e.type==='towncenter'?1.8:1.15),site={x:e.x,z:e.z,radiusSquared:r*r};for(let x=Math.floor((e.x-r)/16);x<=Math.floor((e.x+r)/16);x++)for(let z=Math.floor((e.z-r)/16);z<=Math.floor((e.z+r)/16);z++){const cellKey=buildingCellKey(x,z);let list=sites.get(cellKey);if(!list){list=[];sites.set(cellKey,list);}list.push(site);}}
    let count=0,matrixChanged=false,colorChanged=false;
    for(const e of this.entries){
      if(!nearViewport(v,e.x,e.y,e.z,6)||!menu&&v.settings.fog!==false&&!v.sim.isExplored(e.x,e.z))continue;
      if(sites.get(buildingSiteKey(e.x,e.z))?.some(b=>(b.x-e.x)**2+(b.z-e.z)**2<b.radiusSquared))continue;
      const changed=this.visibleEntries[count]!==e;
      if(changed){
        this.dummy.position.set(e.x,e.y+.005,e.z);this.dummy.rotation.set(0,e.angle,0);this.dummy.scale.set(e.scale*1.36,e.scale*this.heightScale,e.scale*1.36);this.dummy.updateMatrix();
        this.mesh.setMatrixAt(count,this.dummy.matrix);matrixChanged=true;
        this.mesh.setColorAt(count,this.color.setHex(e.color).multiplyScalar(e.shade));colorChanged=true;
      }
      this.visibleEntries[count++]=e;
    }
    this.mesh.count=count;this.visibleEntries.length=count;
    if(matrixChanged)markInstancePrefix(this.mesh);
    if(colorChanged){this.mesh.instanceColor.clearUpdateRanges();this.mesh.instanceColor.addUpdateRange(0,count*3);this.mesh.instanceColor.needsUpdate=true;}
    v.groundCoverDiagnostics={visible:count,seeded:this.entries.length,triangles:count*this.mesh.geometry.index.count/3,drawCalls:count?1:0};
  }
}
