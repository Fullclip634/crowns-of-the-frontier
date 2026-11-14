import {standardMaterial} from './render-runtime.js';
import * as THREE from 'three';
import {seededRandom} from './data.js';
import {roadDistance} from './terrain-layout.js';
import {nearViewport,markInstancePrefix} from './render-batches.js';
import {bridgeFootprint} from './bridge-layout.js';
import {isSnowBiome,isAridBiome,isRockyBiome,terrainBiome} from './terrain-biomes.js';

export function pebbleGeometry(){
  const geometry=new THREE.IcosahedronGeometry(.35,1),p=geometry.attributes.position;
  for(let i=0;i<p.count;i++){
    const x=p.getX(i),y=p.getY(i),z=p.getZ(i),noise=Math.sin(x*127.1+y*74.7+z*311.7)*43758.5453;
    const scale=.88+(noise-Math.floor(noise))*.24;p.setXYZ(i,x*scale,y*scale*.65,z*scale);
  }
  geometry.computeVertexNormals();geometry.computeBoundingBox();geometry.computeBoundingSphere();return geometry;
}

// Small cosmetic stones share one draw; they never become hidden obstacles or
// game entities. Exploration and new building foundations control visibility.
export class TerrainDetails{
  constructor(view){
    this.view=view;const land=view.landscape,rng=seededRandom(land.seed+2903),high=view.settings.quality==='high',capacity=high?360:120;
    const material=view.materials?.rock?.clone()||standardMaterial();material.color.setHex(0xffffff);material.roughness=.98;material.vertexColors=false;
    this.mesh=new THREE.InstancedMesh(pebbleGeometry(),material,capacity);this.mesh.name='Solid terrain pebbles';this.mesh.count=0;this.mesh.frustumCulled=false;this.mesh.receiveShadow=true;
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);view.terrain.add(this.mesh);this.entries=[];this.dummy=new THREE.Object3D();this.color=new THREE.Color();
    const palette=isSnowBiome(land.map)?[0xc3cbc5,0xe0e4db,0xa7b4a9]:isAridBiome(land.map)?[0xc4a878,0xd8c096,0x9b8158]:isRockyBiome(land.map)?[0x8c8b82,0xa5a49a,0x6b6a62]:[0x8a8d82,0x9e9f93,0x70746a];
    for(let i=0;i<capacity;i++){
      const x=(rng()-.5)*(land.worldSize-6),z=(rng()-.5)*(land.worldSize-6),y=land.surfaceHeightAt(x,z);
      if(y<.2||roadDistance(x,z,land)<2.2||bridgeFootprint(land.map,x,z,3))continue;
      const slope=Math.hypot(land.surfaceHeightAt(x+1.2,z)-y,land.surfaceHeightAt(x,z+1.2)-y);
      const talusBoost=slope>.22?1.28:1;
      this.entries.push({x,y,z,angle:rng()*Math.PI*2,scale:(.32+rng()*.62)*talusBoost,color:palette[i%3],stretch:.82+rng()*.62,shade:.88+rng()*.18});
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
