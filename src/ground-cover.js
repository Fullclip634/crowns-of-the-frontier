import {standardMaterial} from './render-runtime.js';
import * as THREE from 'three';
import {seededRandom} from './data.js';
import {nearViewport,markInstancePrefix} from './render-batches.js';
import {roadDistance} from './terrain-layout.js';
import {terrainBiome,isSnowBiome} from './terrain-biomes.js';
import {bridgeFootprint} from './bridge-layout.js';

// A tuft is six blades at full detail. On the tiers used by phones and older
// laptops the same ground is covered by four, which keeps the coverage and the
// silhouette while cutting a third of the triangles: the tufts are under thirty
// centimetres tall, so the missing blades read as thinner grass rather than as
// missing grass, and the saving is larger than an entire town's buildings.
export const tuftBlades=quality=>quality==='high'?6:4;
export function grassTuftGeometry(blades=6){
  const vertices=[],colors=[],indices=[],uv=[];
  for(let blade=0;blade<blades;blade++){
    const angle=blade*2.399,h=.30+(blade%3)*.12,w=.038,lean=.14;
    const center=new THREE.Vector3(Math.sin(angle)*.13,0,Math.cos(angle)*.13);
    const across=new THREE.Vector3(Math.cos(angle),0,-Math.sin(angle));
    const front=new THREE.Vector3(Math.sin(angle),0,Math.cos(angle));
    const base=vertices.length/3;
    for(const [width,y,bend,thickness,shade] of [[w,0,0,.009,.56],[w*.72,h*.55,lean*.34,.006,.88]]){
      for(const [side,depth] of [[-1,-1],[1,-1],[1,1],[-1,1]]){
        const p=center.clone().addScaledVector(across,side*width).addScaledVector(front,bend+depth*thickness);p.y=y;
        vertices.push(...p.toArray());uv.push((side+1)*.5,y/h);colors.push(shade,shade*.98,shade*.94);
      }
    }
    const tip=center.clone().addScaledVector(front,lean);tip.y=h;vertices.push(...tip.toArray());uv.push(.5,1);colors.push(1.04,1.06,.92);
    indices.push(base,base+2,base+1,base,base+3,base+2);
    for(let i=0;i<4;i++){const next=(i+1)%4;indices.push(base+i,base+next,base+4+next,base+i,base+4+next,base+4+i,base+4+i,base+4+next,base+8);}
  }
  const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3));geometry.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));geometry.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));geometry.setIndex(indices);geometry.computeVertexNormals();geometry.computeBoundingBox();geometry.computeBoundingSphere();return geometry;
}

export class GroundCover{
  constructor(view){
    this.view=view;const land=view.landscape,rng=seededRandom(land.seed+19),low=view.settings.quality!=='high';
    const capacity=Math.min(low?1800:4800,Math.floor(land.worldSize**2*(low?.045:.085)));
    const winter=isSnowBiome(land.map);
    const material=standardMaterial({color:0xffffff,roughness:.94,vertexColors:true,emissive:0x1f2b18,emissiveIntensity:.07});
    this.mesh=new THREE.InstancedMesh(grassTuftGeometry(tuftBlades(view.settings.quality)),material,capacity);this.mesh.count=0;this.mesh.frustumCulled=false;this.mesh.receiveShadow=true;
    this.mesh.name='Solid ground vegetation';this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);view.terrain.add(this.mesh);
    this.entries=[];this.dummy=new THREE.Object3D();this.color=new THREE.Color();
    const palette=terrainBiome(land.map).grass;
    // Cluster grass tufts organically across open meadows, road borders and gentle rises while staying within budget.
    const clusters=Array.from({length:36},()=>({x:(rng()-.5)*(land.worldSize-12),z:(rng()-.5)*(land.worldSize-12),spread:3.5+rng()*7}));
    for(let attempt=0;attempt<capacity*4&&this.entries.length<capacity;attempt++){
      const clumped=attempt%3===0,anchor=clumped?clusters[attempt%clusters.length]:null;
      const x=anchor?anchor.x+(rng()+rng()-1)*anchor.spread:(rng()-.5)*(land.worldSize-6);
      const z=anchor?anchor.z+(rng()+rng()-1)*anchor.spread:(rng()-.5)*(land.worldSize-6);
      if(Math.abs(x)>(land.worldSize-6)*.5||Math.abs(z)>(land.worldSize-6)*.5)continue;
      const y=land.surfaceHeightAt(x,z);
      if(y<.24||roadDistance(x,z,land)<1.75||bridgeFootprint(land.map,x,z,3)||winter&&rng()<.55)continue;
      const slope=Math.abs(land.surfaceHeightAt(x+.7,z)-land.surfaceHeightAt(x-.7,z))+Math.abs(land.surfaceHeightAt(x,z+.7)-land.surfaceHeightAt(x,z-.7));
      if(slope>.65&&rng()<.7)continue;
      this.entries.push({x,y,z,angle:rng()*Math.PI*2,scale:.72+rng()*.78,color:palette[(this.entries.length+Math.floor(rng()*3))%palette.length],shade:.82+rng()*.24});
    }
    this.update(true,true);
  }
  update(menu=false,force=false){
    const v=this.view,key=[v.target.x,v.target.z,v.zoom,v.angle,v.tilt,menu,v.settings.fog].join(':');
    if(!force&&this.key===key&&v.clock-(this.last||0)<(v.settings.quality==='high'?.3:.5))return;
    this.key=key;this.last=v.clock;
    const sites=new Map(),cell=(x,z)=>Math.floor(x/16)+':'+Math.floor(z/16);
    for(const e of v.sim.entities)if(e.kind==='building'&&e.hp>0){const r=e.r+1;for(let x=Math.floor((e.x-r)/16);x<=Math.floor((e.x+r)/16);x++)for(let z=Math.floor((e.z-r)/16);z<=Math.floor((e.z+r)/16);z++){const key=x+':'+z;if(!sites.has(key))sites.set(key,[]);sites.get(key).push(e);}}
    this.buildingSites=sites;
    let count=0;
    for(const e of this.entries){
      if(!nearViewport(v,e.x,e.y,e.z,5)||!menu&&v.settings.fog!==false&&!v.sim.isExplored(e.x,e.z))continue;
      if(sites.get(cell(e.x,e.z))?.some(b=>Math.hypot(b.x-e.x,b.z-e.z)<b.r+1))continue;
      this.dummy.position.set(e.x,e.y+.005,e.z);this.dummy.rotation.set(0,e.angle,v.settings.quality==='high'?Math.sin(v.clock*1.6+e.x*.2)*(.025+(v.weatherState?.intensity||0)*.07):0);this.dummy.scale.setScalar(e.scale);this.dummy.updateMatrix();
      this.mesh.setMatrixAt(count,this.dummy.matrix);this.mesh.setColorAt(count,this.color.setHex(e.color).multiplyScalar(e.shade));count++;
    }
    this.mesh.count=count;markInstancePrefix(this.mesh);if(this.mesh.instanceColor&&count){this.mesh.instanceColor.clearUpdateRanges();this.mesh.instanceColor.addUpdateRange(0,count*3);this.mesh.instanceColor.needsUpdate=true;}
    v.groundCoverDiagnostics={visible:count,seeded:this.entries.length,triangles:count*this.mesh.geometry.index.count/3,drawCalls:count?1:0};
  }
}
