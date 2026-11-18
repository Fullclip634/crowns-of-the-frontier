import {standardMaterial} from './render-runtime.js';
import * as THREE from 'three';
import {seededRandom} from './data.js';
import {roadDistance} from './terrain-layout.js';
import {nearViewport,markInstancePrefix} from './render-batches.js';
import {bridgeFootprint} from './bridge-layout.js';
import {isSnowBiome,isAridBiome,isRockyBiome,terrainBiome} from './terrain-biomes.js';

export function pebbleGeometry(){
  const geometry=new THREE.IcosahedronGeometry(.62,1),p=geometry.attributes.position;
  const slice=(px,py,pz,nx,ny,nz,limit,strength)=>{
    const d=px*nx+py*ny+pz*nz;if(d<=limit)return [px,py,pz];
    const push=(d-limit)*strength;return [px-nx*push,py-ny*push,pz-nz*push];
  };
  for(let i=0;i<p.count;i++){
    let x=p.getX(i),y=p.getY(i),z=p.getZ(i);
    const n1=Math.sin(x*127.1+y*74.7+z*311.7)*43758.5453,f1=n1-Math.floor(n1);
    const n2=Math.sin(x*269.5-y*183.3+z*113.5)*31415.9265,f2=n2-Math.floor(n2);
    [x,y,z]=slice(x,y,z,.70,.46,-.54,.30,.88);
    [x,y,z]=slice(x,y,z,-.62,.58,.52,.32,.86);
    [x,y,z]=slice(x,y,z,.28,.44,.85,.34,.84);
    const stepY=y>.20?.20+(y-.20)*.34+x*.08:y<-.06?-.06+(y+.06)*.45:y;
    const strata=1+Math.tanh(Math.sin(stepY*10.5+x*2.4)*2.8)*.10;
    const baseFlare=stepY<0?1.24:1-stepY*.24;
    const rx=(.88+f1*.26)*strata*baseFlare,rz=(.88+f2*.26)*strata*baseFlare,ry=.78+(f1+f2)*.12;
    p.setXYZ(i,x*rx,stepY*ry,z*rz);
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
    const material=view.materials?.rock?.clone()||standardMaterial();material.color.setHex(0xffffff);material.roughness=.89;material.vertexColors=false;
    this.mesh=new THREE.InstancedMesh(pebbleGeometry(),material,capacity);this.mesh.name='Solid terrain pebbles';this.mesh.count=0;this.mesh.frustumCulled=false;this.mesh.castShadow=false;this.mesh.receiveShadow=true;
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);view.terrain.add(this.mesh);this.entries=[];this.dummy=new THREE.Object3D();this.color=new THREE.Color();
    const palette=land.map==='volcanic'?[0x6f6966,0x87807b,0x56504d]:isSnowBiome(land.map)?[0xc8d2ce,0xe1e7e2,0x9aa9a4]:isAridBiome(land.map)||['desert','canyon','archipelago'].includes(land.map)?[0xc9ad7e,0xdcc59b,0x9e835c]:isRockyBiome(land.map)?[0x9ca097,0xb3b7ad,0x7d8178]:[0xb1b5aa,0xc6c9bd,0x8d9387];
    const settlements=land.settlements||[],campRadius=Math.min(28,land.worldSize*.145),attempts=capacity*3;
    const validSite=(x,z,minCamp)=>{
      if(Math.abs(x)>land.half-4||Math.abs(z)>land.half-4)return false;
      const y=land.surfaceHeightAt(x,z),td=settlements.length?Math.min(...settlements.map(s=>Math.hypot(x-s.x,z-s.z))):Infinity;
      return y>=.2&&td>=minCamp&&roadDistance(x,z,land,2.6)>=2.6&&!bridgeFootprint(land.map,x,z,3);
    };
    if(!low){
      const cliffChains=Math.min(18,Math.max(6,Math.floor(capacity/48)));
      for(let c=0;c<cliffChains&&this.entries.length+8<capacity;c++){
        let ax,az;
        if(c<settlements.length*2){
          const base=settlements[c%settlements.length],dir=Math.atan2(-base.z,-base.x)+(c<settlements.length?1.15:-1.15)+(rng()-.5)*.35;
          const dist=campRadius*1.38+rng()*14;ax=base.x+Math.cos(dir)*dist;az=base.z+Math.sin(dir)*dist;
        }else{
          ax=(rng()-.5)*(land.worldSize-24);az=(rng()-.5)*(land.worldSize-24);
        }
        if(!validSite(ax,az,campRadius*1.28))continue;
        const dx=(land.surfaceHeightAt(ax+2,az)-land.surfaceHeightAt(ax-2,az))/4,dz=(land.surfaceHeightAt(ax,az+2)-land.surfaceHeightAt(ax,az-2))/4;
        let heading=Math.hypot(dx,dz)>.04?Math.atan2(-dx,dz):rng()*Math.PI*2,cx=ax,cz=az;
        const blocks=5+Math.floor(rng()*4);
        for(let b=0;b<blocks&&this.entries.length<capacity;b++){
          if(validSite(cx,cz,campRadius*1.25)){
            const cy=land.surfaceHeightAt(cx,cz),arch=Math.sin((b+.5)/blocks*Math.PI),scale=(1.55+rng()*1.15)*(.78+arch*.42);
            this.entries.push({x:cx,y:cy,z:cz,angle:heading+(rng()-.5)*.22,scale,color:palette[this.entries.length%3],stretch:1.65+rng()*.75,heightScale:.92+rng()*.55,shade:.82+rng()*.22,sink:-.16*scale});
            if(this.entries.length<capacity&&rng()<.7){
              const tx=cx+Math.sin(heading)*(1.2+rng()*1.4),tz=cz-Math.cos(heading)*(1.2+rng()*1.4);
              if(validSite(tx,tz,campRadius*1.2)){
                const ty=land.surfaceHeightAt(tx,tz),ts=.48+rng()*.52;
                this.entries.push({x:tx,y:ty,z:tz,angle:rng()*Math.PI*2,scale:ts,color:palette[this.entries.length%3],stretch:1.1+rng()*.45,heightScale:.65+rng()*.35,shade:.78+rng()*.2,sink:-.05*ts});
              }
            }
          }
          heading+=(rng()-.5)*.28;cx+=Math.cos(heading)*2.05;cz+=Math.sin(heading)*2.05;
        }
      }
    }
    for(let i=0;i<attempts&&this.entries.length<capacity;i++){
      const x=(rng()-.5)*(land.worldSize-8),z=(rng()-.5)*(land.worldSize-8),y=land.surfaceHeightAt(x,z);
      const townDist=settlements.length?Math.min(...settlements.map(s=>Math.hypot(x-s.x,z-s.z))):Infinity;
      if(y<.2||townDist<campRadius*.9||townDist<campRadius*1.3&&rng()<.88||roadDistance(x,z,land,2.4)<2.4||bridgeFootprint(land.map,x,z,3))continue;
      const dx=(land.surfaceHeightAt(x+1.5,z)-land.surfaceHeightAt(x-1.5,z))/3,dz=(land.surfaceHeightAt(x,z+1.5)-land.surfaceHeightAt(x,z-1.5))/3;
      const slope=Math.hypot(dx,dz),cliff=(slope>.11||y>2.3||i%4===0)&&townDist>=campRadius*1.3;
      const angle=slope>.06?Math.atan2(-dx,dz)+(rng()-.5)*.38:rng()*Math.PI*2;
      const scale=cliff?(1.35+rng()*1.65+Math.min(1.3,slope*2.6)):(.48+rng()*.72);
      const stretch=cliff?(1.45+rng()*.95):(.88+rng()*.55),heightScale=cliff?(.82+rng()*.58):(.68+rng()*.38);
      this.entries.push({x,y,z,angle,scale,color:palette[this.entries.length%3],stretch,heightScale,shade:.84+rng()*.22,sink:cliff?-.14*scale:-.03*scale});
    }
    this.update(true,true);
  }
  update(menu=false,force=false){
    const v=this.view,key=[v.target.x,v.target.z,v.zoom,v.angle,v.tilt,menu,v.settings.fog].join(':');
    if(!force&&this.key===key&&v.clock-(this.last||0)<.5)return;
    this.key=key;this.last=v.clock;let count=0;const sites=v.groundCover?.buildingSites;
    for(const e of this.entries){
      if(!nearViewport(v,e.x,e.y,e.z,6)||!menu&&v.settings.fog!==false&&!v.sim.isExplored(e.x,e.z))continue;
      if(sites?.get(Math.floor(e.x/16)+':'+Math.floor(e.z/16))?.some(b=>(b.x-e.x)**2+(b.z-e.z)**2<b.radiusSquared))continue;
      this.dummy.position.set(e.x,e.y+(e.sink??.015),e.z);this.dummy.rotation.set(.09*Math.sin(e.angle),e.angle,.07*Math.cos(e.angle));this.dummy.scale.set(e.scale*e.stretch,e.scale*(e.heightScale||1),e.scale);this.dummy.updateMatrix();
      this.mesh.setMatrixAt(count,this.dummy.matrix);this.mesh.setColorAt(count,this.color.setHex(e.color).multiplyScalar(e.shade));count++;
    }
    this.mesh.count=count;markInstancePrefix(this.mesh);
    if(this.mesh.instanceColor&&count){this.mesh.instanceColor.clearUpdateRanges();this.mesh.instanceColor.addUpdateRange(0,count*3);this.mesh.instanceColor.needsUpdate=true;}
    v.terrainDetailDiagnostics={visible:count,seeded:this.entries.length,capacity:this.mesh.instanceMatrix.count,triangles:count*this.mesh.geometry.attributes.position.count/3,drawCalls:count?1:0};
  }
}
