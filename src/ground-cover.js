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
  const wind=material.frontierGrassWind={time:{value:0},strength:{value:0},dir:{value:new THREE.Vector2(.84,.54)}};
  if(material.isNodeMaterial){nodeRuntime()?.grassWind?.(material,wind);return wind;}
  const prepare=material.onBeforeCompile,programKey=material.customProgramCacheKey.call(material);
  material.onBeforeCompile=function(shader,renderer){
    prepare.call(this,shader,renderer);
    shader.uniforms.frontierGrassTime=wind.time;
    shader.uniforms.frontierGrassStrength=wind.strength;
    shader.uniforms.frontierGrassDir=wind.dir;
    shader.vertexShader=`uniform float frontierGrassTime;
      uniform float frontierGrassStrength;
      uniform vec2 frontierGrassDir;\n`+shader.vertexShader.replace('#include <begin_vertex>',`#include <begin_vertex>
      #ifdef USE_INSTANCING
        if (frontierGrassStrength > 0.0001) {
          vec3 grassWorldPosition = (instanceMatrix * vec4(position, 1.0)).xyz;
          float grassBend = clamp(position.y * 2.4, 0.0, 1.0);
          grassBend *= grassBend;
          float wavePhase = dot(grassWorldPosition.xz, frontierGrassDir * 0.22);
          float grassGust = sin(frontierGrassTime * 1.9 - wavePhase)
            + 0.38 * sin(frontierGrassTime * 3.1 - grassWorldPosition.x * 0.39 + grassWorldPosition.z * 0.33);
          vec2 grassWindWorld = frontierGrassDir * (grassGust * grassBend * frontierGrassStrength);
          float grassScaleSq = max(dot(instanceMatrix[0].xz, instanceMatrix[0].xz), 0.0001);
          transformed.x += dot(grassWindWorld, instanceMatrix[0].xz) / grassScaleSq;
          transformed.z += dot(grassWindWorld, instanceMatrix[2].xz) / grassScaleSq;
        }
      #endif`);
  };
  material.customProgramCacheKey=()=>`${programKey}:grass-wind-v2`;
  material.needsUpdate=true;
  return wind;
}

// Both tiers use curved, closed 3-sided ribbon blades with bent-upward normals
// so grass blends seamlessly with terrain lighting while cutting triangles by 29%.
export const tuftBlades=quality=>quality==='high'?6:4;
export function grassTuftGeometry(blades=6){
  const vertices=[],indices=[],uv=[],colors=[];
  const heights=[.42,.62,.50,.36,.68,.47];
  for(let blade=0;blade<blades;blade++){
    const angle=blade*2.399,h=heights[blade%heights.length],w=.034+(blade%3)*.013,lean=.16+(blade%4)*.082;
    const spread=.10+(blade%3)*.095;
    const center=new THREE.Vector3(Math.sin(angle)*spread,0,Math.cos(angle)*spread);
    const across=new THREE.Vector3(Math.cos(angle),0,-Math.sin(angle));
    const front=new THREE.Vector3(Math.sin(angle),0,Math.cos(angle));
    const base=vertices.length/3;
    // Closed 3-sided curved prism: base triangle -> arched mid triangle -> tapered tip (10 tris/blade).
    const rings=[
      [w,0,0,.013,[.46,.50,.40]],
      [w*.62,h*.54,lean*.34,.009,[.82,.89,.72]],
    ];
    for(const [width,y,bend,thickness,tint] of rings){
      const left=center.clone().addScaledVector(across,-width).addScaledVector(front,bend);left.y=y;
      const right=center.clone().addScaledVector(across,width).addScaledVector(front,bend);right.y=y;
      const ridge=center.clone().addScaledVector(front,bend+thickness);ridge.y=y;
      vertices.push(...left.toArray(),...right.toArray(),...ridge.toArray());
      uv.push(0,y/h,1,y/h,.5,y/h);
      colors.push(...tint,...tint,...tint);
    }
    const tip=center.clone().addScaledVector(front,lean).addScaledVector(across,(blade%2===0?1:-1)*w*.75);
    tip.y=h;vertices.push(...tip.toArray());uv.push(.5,1);colors.push(1,.99,.76);
    indices.push(base,base+1,base+2);
    for(let i=0;i<3;i++){
      const next=(i+1)%3;
      indices.push(
        base+i,base+3+i,base+3+next,
        base+i,base+3+next,base+next,
        base+3+i,base+6,base+3+next,
      );
    }
  }
  const geometry=new THREE.BufferGeometry();
  geometry.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3));
  geometry.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));
  geometry.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  // Bend blade normals softly upward (72% skyward) so sunlit meadows read lush
  // and cohesive without harsh black backfaces.
  const normals=geometry.attributes.normal,n=new THREE.Vector3();
  for(let i=0;i<normals.count;i++){
    n.fromBufferAttribute(normals,i).lerp(new THREE.Vector3(0,1,0),.72).normalize();
    normals.setXYZ(i,n.x,n.y,n.z);
  }
  geometry.computeBoundingBox();geometry.computeBoundingSphere();return geometry;
}

/** Closed low-poly meadow wildflower & leafy-shrub accent rosette (24 tris, bent-upward normals). */
export function biomeAccentGeometry(){
  const vertices=[],indices=[],uv=[],colors=[];
  const petals=4;
  for(let p=0;p<petals;p++){
    const a=p*Math.PI/2+.35,dx=Math.cos(a),dz=Math.sin(a),px=-dz,pz=dx;
    const base=vertices.length/3,len=.26+(p%2)*.06,wid=.11,h=.22+(p%2)*.07;
    const stem=[dx*.03,0,dz*.03],left=[dx*len*.55-px*wid,h*.62,dz*len*.55-pz*wid],right=[dx*len*.55+px*wid,h*.62,dz*len*.55+pz*wid],tip=[dx*len,h,dz*len],under=[dx*len*.45,h*.38,dz*len*.45];
    vertices.push(...stem,...left,...right,...tip,...under);
    uv.push(.5,0,0,.5,1,.5,.5,1,.5,.4);
    colors.push(.42,.48,.34,.78,.84,.68,.78,.84,.68,1,1,.92,.52,.56,.44);
    indices.push(base,base+2,base+1, base+1,base+2,base+3, base,base+1,base+4, base+1,base+3,base+4, base+3,base+2,base+4, base+2,base,base+4);
  }
  const geometry=new THREE.BufferGeometry();
  geometry.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3));
  geometry.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));
  geometry.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  const normals=geometry.attributes.normal,n=new THREE.Vector3();
  for(let i=0;i<normals.count;i++){n.fromBufferAttribute(normals,i).lerp(new THREE.Vector3(0,1,0),.75).normalize();normals.setXYZ(i,n.x,n.y,n.z);}
  geometry.computeBoundingBox();geometry.computeBoundingSphere();return geometry;
}

function accentPaletteFor(map){
  const biome=terrainBiome(map);
  if(isSnowBiome(map))return [0xc6d5dc,0x95adb4,0xdce6ea,0x7d9491];
  if(biome.ash)return [0x4c403c,0x664c3d,0x3a3330,0x7c553b];
  if(biome.sand)return [0xd8be78,0xc4a562,0x8f9468,0xe2cd94];
  return [0xebd05a,0xf1ebd0,0xb29ad2,0x497336,0x628844,0xe0b553];
}

function scatterAccents(land,capacity){
  if(!capacity)return [];
  const rng=seededRandom(land.seed+4391),palette=accentPaletteFor(land.map),entries=[],edge=land.half-4;
  const plant=(x,z,scale,height)=>{
    if(Math.max(Math.abs(x),Math.abs(z))>edge||roadDistance(x,z,land,2.3)<2.3||bridgeFootprint(land.map,x,z,3.2))return;
    const y=land.surfaceHeightAt(x,z);
    if(y<.24)return;
    entries.push({x,y,z,angle:rng()*Math.PI*2,scale,height,color:palette[Math.floor(rng()*palette.length)],shade:.84+rng()*.26});
  };
  const cluster=(x,z,r,n,lim)=>{
    for(let i=0;i<n&&entries.length<lim;i++){
      const a=rng()*Math.PI*2,d=Math.sqrt(rng())*r;
      plant(x+Math.cos(a)*d,z+Math.sin(a)*d,.75+rng()*.70,.75+rng()*.65);
    }
  };
  const roads=terrainRoadPaths(land),vergeLim=Math.floor(capacity*.34);
  for(const road of roads){
    const count=Math.max(2,Math.ceil(vergeLim/Math.max(1,roads.length)/4));
    for(let i=0;i<count&&entries.length<vergeLim;i++){
      const seg=road.segments[Math.floor(rng()*road.segments.length)],t=rng(),side=i%2?1:-1;
      const off=side*(2.9+rng()*2.6)/Math.max(.001,Math.sqrt(seg.length));
      cluster(seg.x+t*seg.dx-seg.dz*off,seg.z+t*seg.dz+seg.dx*off,1.8,4,vergeLim);
    }
  }
  for(let i=0;i<capacity*2&&entries.length<capacity;i++){
    const x=(rng()-.5)*edge*2,z=(rng()-.5)*edge*2;
    cluster(x,z,2.1,2+Math.floor(rng()*4),capacity);
  }
  return entries;
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
    this.view=view;const land=view.landscape,quality=view.settings.quality,low=quality!=='high';
    const capacity=Math.min(low?1800:4800,Math.floor(land.worldSize**2*(low?.036:.072)));

    const material=standardMaterial({color:0xffffff,roughness:.96,vertexColors:true});
    this.wind=configureGrassWind(material);
    this.mesh=new THREE.InstancedMesh(grassTuftGeometry(tuftBlades(quality)),material,capacity);this.mesh.count=0;this.mesh.frustumCulled=false;this.mesh.receiveShadow=true;
    this.mesh.name='Solid ground vegetation';this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);view.terrain.add(this.mesh);
    this.entries=scatterCover(land,capacity);this.cells=indexCover(this.entries);
    this.visibleEntries=[];this.buildingSites=new Map();this.dummy=new THREE.Object3D();this.color=new THREE.Color();

    // Biome wildflower & low-shrub scatter shares the exact same fog/viewport/foundation culling.
    const accentCap=quality==='high'?Math.min(780,Math.floor(land.worldSize**2*.014)):quality==='medium'?Math.min(340,Math.floor(land.worldSize**2*.007)):0;
    this.accentEntries=scatterAccents(land,accentCap);
    this.accentCells=indexCover(this.accentEntries);
    this.visibleAccents=[];
    if(accentCap>0){
      this.accents=new THREE.InstancedMesh(biomeAccentGeometry(),material,accentCap);
      this.accents.count=0;this.accents.frustumCulled=false;this.accents.receiveShadow=true;
      this.accents.name='Biome wildflowers and shrubs';this.accents.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      view.terrain.add(this.accents);
    }else this.accents=null;
    this.update(true,true);
  }
  update(menu=false,force=false){
    const v=this.view;
    const animated=!v.settings.reducedMotion&&v.settings.quality!=='low';
    this.wind.time.value=animated?v.clock:0;
    this.wind.strength.value=animated?(.060+(v.weatherState?.amount||0)*.10)*(v.settings.quality==='high'?1:.7):0;
    const atmWind=v.atmosphereUniforms?.wind?.value;
    if(atmWind&&this.wind.dir){
      const len=Math.hypot(atmWind.x,atmWind.z);
      if(len>.001)this.wind.dir.value.set(atmWind.x/len,atmWind.z/len);
    }
    const key=[v.target.x,v.target.z,v.zoom,v.angle,v.tilt,v.camera?.aspect,menu,v.settings.fog,v.settings.quality].join(':');
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
          this.dummy.scale.set(e.scale*1.26,e.scale*e.height,e.scale*1.26);this.dummy.updateMatrix();
          this.mesh.setMatrixAt(count,this.dummy.matrix);matrixChanged=true;
          this.mesh.setColorAt(count,this.color.setHex(e.color).multiplyScalar(e.shade));colorChanged=true;
        }
        this.visibleEntries[count++]=e;
      }
    }
    this.mesh.count=count;this.visibleEntries.length=count;
    if(matrixChanged)markInstancePrefix(this.mesh);
    if(colorChanged){this.mesh.instanceColor.clearUpdateRanges();this.mesh.instanceColor.addUpdateRange(0,count*3);this.mesh.instanceColor.needsUpdate=true;}

    let accentCount=0;
    if(this.accents&&v.settings.quality!=='low'){
      let aMat=false,aCol=false;
      for(const cell of this.accentCells){
        if(!nearViewport(v,cell.x,cell.y,cell.z,cell.radius))continue;
        const footprints=sites.get(cell.key);
        for(const e of cell.entries){
          if(!nearViewport(v,e.x,e.y,e.z,6)||(!menu&&v.settings.fog!==false&&!v.sim.isExplored(e.x,e.z)))continue;
          if(footprints?.some(b=>(b.x-e.x)**2+(b.z-e.z)**2<b.radiusSquared))continue;
          if(this.visibleAccents[accentCount]!==e){
            this.dummy.position.set(e.x,e.y+.006,e.z);this.dummy.rotation.set(0,e.angle,0);
            this.dummy.scale.set(e.scale*1.15,e.scale*e.height,e.scale*1.15);this.dummy.updateMatrix();
            this.accents.setMatrixAt(accentCount,this.dummy.matrix);aMat=true;
            this.accents.setColorAt(accentCount,this.color.setHex(e.color).multiplyScalar(e.shade));aCol=true;
          }
          this.visibleAccents[accentCount++]=e;
        }
      }
      this.accents.count=accentCount;this.visibleAccents.length=accentCount;
      if(aMat)markInstancePrefix(this.accents);
      if(aCol){this.accents.instanceColor.clearUpdateRanges();this.accents.instanceColor.addUpdateRange(0,accentCount*3);this.accents.instanceColor.needsUpdate=true;}
    }else if(this.accents){
      this.accents.count=0;this.visibleAccents.length=0;
    }
    v.groundCoverDiagnostics={visible:count,seeded:this.entries.length,accentVisible:accentCount,triangles:count*this.mesh.geometry.index.count/3+(this.accents?accentCount*this.accents.geometry.index.count/3:0),drawCalls:count?1:0};
  }
  dispose(){
    this.mesh.geometry.dispose();this.mesh.material.dispose();this.mesh.removeFromParent();
    if(this.accents){this.accents.geometry.dispose();this.accents.removeFromParent();}
  }
}
