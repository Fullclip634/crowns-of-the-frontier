import {standardMaterial} from './render-runtime.js';
import * as THREE from 'three';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';
import {seededRandom} from './data.js';
import {roadDistance} from './terrain-layout.js';
import {nearViewport,markInstancePrefix} from './render-batches.js';
import {bridgeFootprint} from './bridge-layout.js';
import {isSnowBiome,isVolcanicBiome,isAridBiome,isRockyBiome} from './terrain-biomes.js';

function chiselStone(radius,detail,sx,sy,sz,ox,oy,oz,yaw,seed){
  const stone=new THREE.DodecahedronGeometry(radius,detail),p=stone.attributes.position,c=Math.cos(yaw),s=Math.sin(yaw);
  for(let i=0;i<p.count;i++){
    const x=p.getX(i),y=p.getY(i),z=p.getZ(i);
    const strata=Math.sin(x*7.4+seed)*0.09+Math.cos(z*8.2-seed)*0.08+Math.sin((x+z)*11.5)*0.05;
    const flatY=y<-0.12*radius?Math.max(y,-0.22*radius):y*(y>0.35*radius?0.86:1);
    const lx=(x*sx*(1+strata)),ly=flatY*sy*(1+strata*0.4),lz=(z*sz*(1-strata*0.6));
    p.setXYZ(i,lx*c-lz*s+ox,ly+oy,lx*s+lz*c+oz);
  }
  return stone.index?stone.toNonIndexed():stone;
}

export function pebbleGeometry(){
  // Compose three distinct closed faceted field stones so clusters stay crisp and manifold.
  const main=chiselStone(.42,1,1.15,.68,.88,0,.04,0,.35,1.7);
  const wing=chiselStone(.24,0,1.1,.56,.85,.42,.01,.16,1.25,4.1);
  const shard=chiselStone(.18,0,.95,.48,1.1,-.36,0,-.22,-.7,6.3);
  const geometry=mergeGeometries([main,wing,shard],false);
  main.dispose();wing.dispose();shard.dispose();
  geometry.computeVertexNormals();geometry.computeBoundingBox();geometry.computeBoundingSphere();return geometry;
}

// Small cosmetic stones share one draw; they never become hidden obstacles or
// game entities. Exploration and new building foundations control visibility.
export class TerrainDetails{
  constructor(view){
    this.view=view;const land=view.landscape,rng=seededRandom(land.seed+2903),high=view.settings.quality==='high',capacity=high?360:120;
    const material=view.materials?.rock?.clone()||standardMaterial();material.color.setHex(0xffffff);material.roughness=.95;material.vertexColors=false;
    this.mesh=new THREE.InstancedMesh(pebbleGeometry(),material,capacity);this.mesh.name='Solid terrain pebbles';this.mesh.count=0;this.mesh.frustumCulled=false;this.mesh.receiveShadow=true;
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);view.terrain.add(this.mesh);this.entries=[];this.dummy=new THREE.Object3D();this.color=new THREE.Color();
    const palette=isSnowBiome(land.map)?[0xb8c2bd,0xd7ddd6,0x92a09a]:isVolcanicBiome(land.map)?[0x4b4440,0x645953,0x342f2d]:isAridBiome(land.map)?[0xb89668,0xd1b384,0x8c704c]:isRockyBiome(land.map)?[0x86857c,0xa1a095,0x67665e]:[0x8c9082,0xa5a898,0x6e7366];
    for(let attempt=0;attempt<capacity*4&&this.entries.length<capacity;attempt++){
      const x=(rng()-.5)*(land.worldSize-8),z=(rng()-.5)*(land.worldSize-8),y=land.surfaceHeightAt(x,z);
      if(y<.16||roadDistance(x,z,land)<2.1||bridgeFootprint(land.map,x,z,3))continue;
      const slope=Math.hypot(land.surfaceHeightAt(x+.8,z)-land.surfaceHeightAt(x-.8,z),land.surfaceHeightAt(x,z+.8)-land.surfaceHeightAt(x,z-.8))/1.6;
      const nearBank=y<.75||roadDistance(x,z,land)<4.2;
      if(slope<.12&&!nearBank&&rng()<.65)continue;
      this.entries.push({x,y,z,angle:rng()*Math.PI*2,scale:(.34+rng()*.58)*(slope>.22?1.25:1),color:palette[this.entries.length%palette.length],stretch:.85+rng()*.5,shade:.86+rng()*.18});
    }
    this.update(true,true);
  }
  update(menu=false,force=false){
    const v=this.view,key=[v.target.x,v.target.z,v.zoom,v.angle,v.tilt,menu,v.settings.fog].join(':');
    if(!force&&this.key===key&&v.clock-(this.last||0)<.5)return;
    this.key=key;this.last=v.clock;let count=0;const sites=v.groundCover?.buildingSites;
    for(const e of this.entries){
      if(!nearViewport(v,e.x,e.y,e.z,2)||!menu&&v.settings.fog!==false&&!v.sim.isExplored(e.x,e.z))continue;
      if(sites?.get(Math.floor(e.x/16)+':'+Math.floor(e.z/16))?.some(b=>Math.hypot(b.x-e.x,b.z-e.z)<b.r+1))continue;
      this.dummy.position.set(e.x,e.y+.015,e.z);this.dummy.rotation.set(.08*Math.sin(e.angle),e.angle,.06*Math.cos(e.angle));this.dummy.scale.set(e.scale*e.stretch,e.scale,e.scale);this.dummy.updateMatrix();
      this.mesh.setMatrixAt(count,this.dummy.matrix);this.mesh.setColorAt(count,this.color.setHex(e.color).multiplyScalar(e.shade));count++;
    }
    this.mesh.count=count;markInstancePrefix(this.mesh);
    if(this.mesh.instanceColor&&count){this.mesh.instanceColor.clearUpdateRanges();this.mesh.instanceColor.addUpdateRange(0,count*3);this.mesh.instanceColor.needsUpdate=true;}
    v.terrainDetailDiagnostics={visible:count,seeded:this.entries.length,capacity:this.mesh.instanceMatrix.count,triangles:count*this.mesh.geometry.attributes.position.count/3,drawCalls:count?1:0};
  }
}
