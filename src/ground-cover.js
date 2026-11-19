import {standardMaterial,nodeRuntime} from './render-runtime.js';
import * as THREE from 'three';
import {seededRandom} from './data.js';
import {nearViewport,markInstancePrefix} from './render-batches.js';
import {roadDistance,terrainRoadPaths} from './terrain-layout.js';
import {terrainMeadow} from './terrain-fields.js';
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
          vec3 grassWorldPosition = (instanceMatrix * vec4(position, 1.0)).xyz;
          float grassBend = clamp(position.y * 2.4, 0.0, 1.0);
          grassBend *= grassBend;
          float grassGust = sin(frontierGrassTime * 1.9 + grassWorldPosition.x * 0.24 + grassWorldPosition.z * 0.18)
            + 0.35 * sin(frontierGrassTime * 3.1 - grassWorldPosition.x * 0.39 + grassWorldPosition.z * 0.33);
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
  const heights=[.38,.57,.47,.33,.65,.44];
  for(let blade=0;blade<blades;blade++){
    const angle=blade*2.399,h=heights[blade%heights.length],w=.030+(blade%3)*.012,lean=.13+(blade%4)*.071;
    const spread=.11+(blade%3)*.09;
    const center=new THREE.Vector3(Math.sin(angle)*spread,0,Math.cos(angle)*spread);
    const across=new THREE.Vector3(Math.cos(angle),0,-Math.sin(angle));
    const front=new THREE.Vector3(Math.sin(angle),0,Math.cos(angle));
    const base=vertices.length/3;
    for(const [width,y,bend,thickness,tint] of [[w,0,0,.008,[.45,.48,.39]],[w*.65,h*.53,lean*.26,.005,[.82,.88,.72]]]){
      for(const [side,depth] of [[-1,-1],[1,-1],[1,1],[-1,1]]){
        const p=center.clone().addScaledVector(across,side*width).addScaledVector(front,bend+depth*thickness);p.y=y;
        vertices.push(...p.toArray());uv.push((side+1)*.5,y/h);colors.push(...tint);
      }
    }
    const tip=center.clone().addScaledVector(front,lean).addScaledVector(across,blade%2===0?w:-w);
    tip.y=h;vertices.push(...tip.toArray());uv.push(.5,1);colors.push(1,.98,.72);
    indices.push(base,base+1,base+2,base,base+2,base+3);
    for(let i=0;i<4;i++){const next=(i+1)%4;indices.push(base+i,base+4+next,base+next,base+i,base+4+i,base+4+next,base+4+i,base+8,base+4+next);}
  }
  const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3));geometry.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));geometry.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));geometry.setIndex(indices);geometry.computeVertexNormals();geometry.computeBoundingBox();geometry.computeBoundingSphere();return geometry;
}

function scatterCover(land,capacity){
  const rng=seededRandom(land.seed+19),biome=terrainBiome(land.map),winter=isSnowBiome(land.map);
  const meadow=!winter&&!biome.sand&&!biome.ash,entries=[],edge=land.half-3;
  const palette=meadow?[...biome.grass,0x526c39,0x81914d]:biome.grass;
  const settlements=land.settlements||[];
  const plant=(x,z,scale,height)=>{
    if(Math.max(Math.abs(x),Math.abs(z))>edge||roadDistance(x,z,land,2.18)<2.18||bridgeFootprint(land.map,x,z,3))return;
    const y=land.surfaceHeightAt(x,z);
    if(y<.21)return;
    entries.push({x,y,z,angle:rng()*Math.PI*2,scale,height,color:palette[Math.floor(rng()*palette.length)],shade:.81+rng()*.30});
  };
  const patch=(x,z,radius,count,limit,height=1)=>{
    for(let i=0;i<count&&entries.length<limit;i++){
      const angle=rng()*Math.PI*2,distance=Math.sqrt(rng())*radius;
      plant(x+Math.cos(angle)*distance,z+Math.sin(angle)*distance,.70+rng()*.68,height*(.74+rng()*.55));
    }
  };

  if(meadow){
    const roads=terrainRoadPaths(land);
    const vergeLimit=Math.floor(capacity*.21),patchesPerRoad=Math.max(1,Math.ceil(vergeLimit/Math.max(1,roads.length)/7));
    for(const road of roads){
      for(let i=0;i<patchesPerRoad&&entries.length<vergeLimit;i++){
        const index=Math.floor((i+.2+rng()*.6)/patchesPerRoad*road.segments.length);
        const segment=road.segments[index],t=rng(),side=i%2===0?1:-1;
        const offset=side*(3+rng()*2.6)/Math.sqrt(segment.length);
        patch(segment.x+t*segment.dx-segment.dz*offset,segment.z+t*segment.dz+segment.dx*offset,2,9,vergeLimit,.9);
      }
    }

    const townQuota=Math.floor(capacity*.19/Math.max(1,settlements.length));
    for(const town of settlements){
      const limit=entries.length+townQuota,attempts=Math.ceil(townQuota/3);
      for(let i=0;i<attempts&&entries.length<limit;i++){
        const angle=rng()*Math.PI*2,distance=9+Math.sqrt(rng())*18;
        patch(town.x+Math.cos(angle)*distance,town.z+Math.sin(angle)*distance,2.55,7,limit);
      }
    }

    const channels=land.channels(),riverQuota=Math.floor(capacity*.13/Math.max(1,channels.length));
    for(const channel of channels){
      const limit=entries.length+riverQuota;
      const patches=Math.ceil(riverQuota/5);
      for(let i=0;i<patches&&entries.length<limit;i++){
        const z=((i+.15+rng()*.7)/patches-.5)*(land.worldSize-9);
        const center=channel.center+Math.sin(z*channel.frequency)*channel.bend,side=i%2===0?1:-1;
        const beach=biome.shore||land.map==='coast',x=center+side*(channel.width+(beach?4.9:2.8)+rng()*2.2);
        patch(x,z,2.35,8,limit,beach?1.06:1.28);
      }
    }
  }

  const fieldLimit=Math.floor(capacity*.9);
  const fieldHeight=winter?.57:meadow?1:.68;
  for(let i=0;i<capacity&&entries.length<fieldLimit;i++){
    const x=(rng()-.5)*edge*2,z=(rng()-.5)*edge*2;
    if(winter&&rng()>.45)continue;
    const lush=terrainMeadow(x,z,land.phase),radius=1.7+lush*2.3;
    patch(x,z,radius,meadow?3+Math.floor(lush*7):2+Math.floor(lush*3),fieldLimit,fieldHeight*(.8+lush*.37));
  }
  for(let i=0;i<capacity*2&&entries.length<capacity;i++){
    plant((rng()-.5)*edge*2,(rng()-.5)*edge*2,.64+rng()*.69,fieldHeight*(.72+rng()*.38));
  }
  return entries;
}

function indexCover(entries){
  const cells=new Map();
  for(const entry of entries){
    const cellX=Math.floor(entry.x/16),cellZ=Math.floor(entry.z/16),key=buildingCellKey(cellX,cellZ);
    let cell=cells.get(key);
    if(!cell){cell={key,x:cellX*16+8,z:cellZ*16+8,low:entry.y,high:entry.y,entries:[]};cells.set(key,cell);}
    cell.low=Math.min(cell.low,entry.y);cell.high=Math.max(cell.high,entry.y);cell.entries.push(entry);
  }
  return Array.from(cells.values(),cell=>({...cell,y:(cell.low+cell.high)*.5,radius:Math.hypot(8,8,(cell.high-cell.low)*.5)+6}));
}

export class GroundCover{
  constructor(view){
    this.view=view;const land=view.landscape,low=view.settings.quality!=='high';
    const capacity=Math.min(low?1800:4800,Math.floor(land.worldSize**2*(low?.036:.072)));

    const material=standardMaterial({color:0xffffff,roughness:.98,vertexColors:true});
    this.wind=configureGrassWind(material);
    this.mesh=new THREE.InstancedMesh(grassTuftGeometry(tuftBlades(view.settings.quality)),material,capacity);this.mesh.count=0;this.mesh.frustumCulled=false;this.mesh.receiveShadow=true;
    this.mesh.name='Solid ground vegetation';this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);view.terrain.add(this.mesh);
    this.entries=scatterCover(land,capacity);this.cells=indexCover(this.entries);
    this.visibleEntries=[];this.buildingSites=new Map();this.dummy=new THREE.Object3D();this.color=new THREE.Color();
    this.update(true,true);
  }
  update(menu=false,force=false){
    const v=this.view;
    const animated=!v.settings.reducedMotion&&v.settings.quality!=='low';
    this.wind.time.value=animated?v.clock:0;
    this.wind.strength.value=animated?(.055+(v.weatherState?.amount||0)*.095)*(v.settings.quality==='high'?1:.7):0;
    const key=[v.target.x,v.target.z,v.zoom,v.angle,v.tilt,v.camera?.aspect,menu,v.settings.fog].join(':');
    if(!force&&this.key===key&&v.clock-(this.last||0)<(v.settings.quality==='high'?.3:.5))return;
    this.key=key;this.last=v.clock;
    const sites=this.buildingSites;sites.clear();
    for(const e of v.sim.entities)if(e.kind==='building'&&e.hp>0){const r=e.r+(e.type==='towncenter'?1.8:1.15),site={x:e.x,z:e.z,radiusSquared:r*r};for(let x=Math.floor((e.x-r)/16);x<=Math.floor((e.x+r)/16);x++)for(let z=Math.floor((e.z-r)/16);z<=Math.floor((e.z+r)/16);z++){const cellKey=buildingCellKey(x,z);let list=sites.get(cellKey);if(!list){list=[];sites.set(cellKey,list);}list.push(site);}}
    let count=0,matrixChanged=false,colorChanged=false;
    for(const cell of this.cells){
      if(!nearViewport(v,cell.x,cell.y,cell.z,cell.radius))continue;
      const footprints=sites.get(cell.key);
      for(const e of cell.entries){
        if(!nearViewport(v,e.x,e.y,e.z,6)||(!menu&&v.settings.fog!==false&&!v.sim.isExplored(e.x,e.z)))continue;
        if(footprints?.some(b=>(b.x-e.x)**2+(b.z-e.z)**2<b.radiusSquared))continue;
        if(this.visibleEntries[count]!==e){
          this.dummy.position.set(e.x,e.y+.005,e.z);this.dummy.rotation.set(0,e.angle,0);
          this.dummy.scale.set(e.scale*1.22,e.scale*e.height,e.scale*1.22);this.dummy.updateMatrix();
          this.mesh.setMatrixAt(count,this.dummy.matrix);matrixChanged=true;
          this.mesh.setColorAt(count,this.color.setHex(e.color).multiplyScalar(e.shade));colorChanged=true;
        }
        this.visibleEntries[count++]=e;
      }
    }
    this.mesh.count=count;this.visibleEntries.length=count;
    if(matrixChanged)markInstancePrefix(this.mesh);
    if(colorChanged){this.mesh.instanceColor.clearUpdateRanges();this.mesh.instanceColor.addUpdateRange(0,count*3);this.mesh.instanceColor.needsUpdate=true;}
    v.groundCoverDiagnostics={visible:count,seeded:this.entries.length,triangles:count*this.mesh.geometry.index.count/3,drawCalls:count?1:0};
  }
}
