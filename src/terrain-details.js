import {standardMaterial} from './render-runtime.js';
import * as THREE from 'three';
import {seededRandom} from './data.js';
import {roadDistance} from './terrain-layout.js';
import {nearViewport,markInstancePrefix} from './render-batches.js';
import {bridgeFootprint} from './bridge-layout.js';
import {isSnowBiome,isAridBiome,isRockyBiome,terrainBiome} from './terrain-biomes.js';

export function pebbleGeometry(){
  const geometry=new THREE.IcosahedronGeometry(.58,1),p=geometry.attributes.position;
  for(let i=0;i<p.count;i++){
    const x=p.getX(i),y=p.getY(i),z=p.getZ(i);
    const n1=Math.sin(x*127.1+y*74.7+z*311.7)*43758.5453,f1=n1-Math.floor(n1);
    const n2=Math.sin(x*269.5-y*183.3+z*113.5)*31415.9265,f2=n2-Math.floor(n2);
    const strata=1+Math.tanh(Math.sin(y*8.5+x*2.1)*2.4)*.12;
    const baseFlare=y<0?1.18:1-y*.22;
    const rx=(.84+f1*.32)*strata*baseFlare,rz=(.84+f2*.32)*strata*baseFlare,ry=.76+(f1+f2)*.16;
    p.setXYZ(i,x*rx,y*ry,z*rz);
  }
  geometry.computeVertexNormals();geometry.computeBoundingBox();geometry.computeBoundingSphere();return geometry;
}

// Non-resource 3D cliff rock outcrops, stepped hillside ledges, and weathered
// field boulders share one instanced draw call. Exploration and live building
// foundations control visibility.
export class TerrainDetails{
  constructor(view){
    this.view=view;const land=view.landscape,rng=seededRandom(land.seed+2903),low=view.settings.quality==='low',high=view.settings.quality==='high';
    const capacity=low?120:Math.min(high?1200:640,Math.max(360,Math.floor(land.worldSize**2*(high?.0045:.0025))));
    const material=view.materials?.rock?.clone()||standardMaterial();material.color.setHex(0xffffff);material.roughness=.94;material.vertexColors=false;
    this.mesh=new THREE.InstancedMesh(pebbleGeometry(),material,capacity);this.mesh.name='Solid terrain pebbles';this.mesh.count=0;this.mesh.frustumCulled=false;this.mesh.castShadow=high;this.mesh.receiveShadow=true;
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);view.terrain.add(this.mesh);this.entries=[];this.dummy=new THREE.Object3D();this.color=new THREE.Color();
    const palette=isSnowBiome(land.map)?[0xbec7c2,0xd8ddd5,0x98a59b]:isAridBiome(land.map)?[0xbfa272,0xd4bc90,0x947950]:isRockyBiome(land.map)?[0x86857c,0x9fa095,0x67665e]:[0x82857b,0x989a8e,0x6a6e64];
    const settlements=land.settlements||[],campRadius=Math.min(28,land.worldSize*.145),attempts=capacity*3;
    for(let i=0;i<attempts&&this.entries.length<capacity;i++){
      const x=(rng()-.5)*(land.worldSize-8),z=(rng()-.5)*(land.worldSize-8),y=land.surfaceHeightAt(x,z);
      const townDist=settlements.length?Math.min(...settlements.map(s=>Math.hypot(x-s.x,z-s.z))):Infinity;
      if(y<.2||townDist<campRadius*.82||townDist<campRadius*1.25&&rng()<.8||roadDistance(x,z,land)<2.4||bridgeFootprint(land.map,x,z,3))continue;
      const dx=(land.surfaceHeightAt(x+1.5,z)-land.surfaceHeightAt(x-1.5,z))/3,dz=(land.surfaceHeightAt(x,z+1.5)-land.surfaceHeightAt(x,z-1.5))/3;
      const slope=Math.hypot(dx,dz),cliff=(slope>.11||y>2.3||i%4===0)&&townDist>=campRadius*1.25;
      const angle=slope>.06?Math.atan2(-dx,dz)+(rng()-.5)*.38:rng()*Math.PI*2;
      const scale=cliff?(1.35+rng()*1.65+Math.min(1.3,slope*2.6)):(.48+rng()*.72);
      const stretch=cliff?(1.45+rng()*.95):(.88+rng()*.55),heightScale=cliff?(.82+rng()*.58):(.68+rng()*.38);
      this.entries.push({x,y,z,angle,scale,color:palette[this.entries.length%3],stretch,heightScale,shade:.84+rng()*.22,sink:cliff?-.14*scale:-.03*scale});
      if(cliff&&!low&&this.entries.length<capacity){
        const side=rng()<.5?-1:1,dist=1.5+rng()*2.2,cx=x+Math.cos(angle)*dist*side,cz=z+Math.sin(angle)*dist*side,cy=land.surfaceHeightAt(cx,cz);
        const subTownDist=settlements.length?Math.min(...settlements.map(s=>Math.hypot(cx-s.x,cz-s.z))):Infinity;
        if(cy>=.2&&subTownDist>=campRadius*1.15&&roadDistance(cx,cz,land)>=2.4&&!bridgeFootprint(land.map,cx,cz,3)){
          const subScale=scale*(.58+rng()*.32);
          this.entries.push({x:cx,y:cy,z:cz,angle:angle+(rng()-.5)*.45,scale:subScale,color:palette[this.entries.length%3],stretch:1.25+rng()*.65,heightScale:.74+rng()*.42,shade:.80+rng()*.22,sink:-.12*subScale});
        }
      }
    }
    this.update(true,true);
  }
  update(menu=false,force=false){
    const v=this.view,key=[v.target.x,v.target.z,v.zoom,v.angle,v.tilt,menu,v.settings.fog].join(':');
    if(!force&&this.key===key&&v.clock-(this.last||0)<.5)return;
    this.key=key;this.last=v.clock;let count=0;const sites=v.groundCover?.buildingSites;
    for(const e of this.entries){
      if(!nearViewport(v,e.x,e.y,e.z,6)||!menu&&v.settings.fog!==false&&!v.sim.isExplored(e.x,e.z))continue;
      if(sites?.get(Math.floor(e.x/16)+':'+Math.floor(e.z/16))?.some(b=>Math.hypot(b.x-e.x,b.z-e.z)<b.r+1))continue;
      this.dummy.position.set(e.x,e.y+(e.sink??.015),e.z);this.dummy.rotation.set(.09*Math.sin(e.angle),e.angle,.07*Math.cos(e.angle));this.dummy.scale.set(e.scale*e.stretch,e.scale*(e.heightScale||1),e.scale);this.dummy.updateMatrix();
      this.mesh.setMatrixAt(count,this.dummy.matrix);this.mesh.setColorAt(count,this.color.setHex(e.color).multiplyScalar(e.shade));count++;
    }
    this.mesh.count=count;markInstancePrefix(this.mesh);
    if(this.mesh.instanceColor&&count){this.mesh.instanceColor.clearUpdateRanges();this.mesh.instanceColor.addUpdateRange(0,count*3);this.mesh.instanceColor.needsUpdate=true;}
    v.terrainDetailDiagnostics={visible:count,seeded:this.entries.length,capacity:this.mesh.instanceMatrix.count,triangles:count*this.mesh.geometry.attributes.position.count/3,drawCalls:count?1:0};
  }
}
