import {standardMaterial} from './render-runtime.js';
import * as THREE from 'three';
import {seededRandom} from './data.js';
import {roadDistance} from './terrain-layout.js';
import {nearViewport,markInstancePrefix} from './render-batches.js';
import {bridgeFootprint} from './bridge-layout.js';
import {isSnowBiome,isAridBiome,isRockyBiome} from './terrain-biomes.js';
import {buildingSiteKey} from './ground-cover.js';
import {biomeCliffGeometry} from './biome-art.js';

export function pebbleGeometry(detail=1){
  const geometry=new THREE.IcosahedronGeometry(.66,detail),p=geometry.attributes.position;
  const slice=(px,py,pz,nx,ny,nz,limit,strength)=>{
    const d=px*nx+py*ny+pz*nz;if(d<=limit)return [px,py,pz];
    const push=(d-limit)*strength;return [px-nx*push,py-ny*push,pz-nz*push];
  };
  for(let i=0;i<p.count;i++){
    let x=p.getX(i),y=p.getY(i),z=p.getZ(i);
    const n1=Math.sin(x*127.1+y*74.7+z*311.7)*43758.5453,f1=n1-Math.floor(n1);
    const n2=Math.sin(x*269.5-y*183.3+z*113.5)*31415.9265,f2=n2-Math.floor(n2);
    // Five asymmetric geological cleavage planes sculpt sharp stratified crags.
    [x,y,z]=slice(x,y,z,.74,.42,-.52,.26,.92);
    [x,y,z]=slice(x,y,z,-.68,.52,.51,.28,.90);
    [x,y,z]=slice(x,y,z,.24,.48,.84,.30,.88);
    [x,y,z]=slice(x,y,z,-.38,.36,-.85,.32,.86);
    [x,y,z]=slice(x,y,z,.12,.96,.24,.34,.94);
    const stepY=y>.18?.18+(y-.18)*.30+x*.10:y<-.08?-.08+(y+.08)*.42:y;
    const strata=1+Math.tanh(Math.sin(stepY*13.5+x*2.8-z*1.6)*3.2)*.14;
    const baseFlare=stepY<0?1.32:1-stepY*.28;
    const rx=(.86+f1*.28)*strata*baseFlare,rz=(.86+f2*.28)*strata*baseFlare,ry=.82+(f1+f2)*.14;
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
    const barriers=view.sim?.barriers||[];
    const barrierSlots=barriers.length*3;
    const baseCapacity=low?120:Math.min(high?1200:640,Math.max(360,Math.floor(land.worldSize**2*(high?.0045:.0025))));
    const capacity=baseCapacity+barrierSlots;
    const cliffGeo=low?null:biomeCliffGeometry(land.map);
    const material=view.materials?.rock?.clone()||standardMaterial();material.color.setHex(0xffffff);material.roughness=.89;material.vertexColors=Boolean(cliffGeo?.attributes?.color);
    this.mesh=new THREE.InstancedMesh(cliffGeo||pebbleGeometry(high?2:1),material,capacity);this.mesh.name='Solid terrain pebbles';this.mesh.count=0;this.mesh.frustumCulled=false;this.mesh.castShadow=false;this.mesh.receiveShadow=true;
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);view.terrain.add(this.mesh);this.entries=[];this.dummy=new THREE.Object3D();this.color=new THREE.Color();
    const coastal=land.map==='coast'||land.map==='archipelago';
    const rocky=isRockyBiome(land.map);
    const palette=land.map==='volcanic'?[0x655d59,0x79716d,0x514e47]:isSnowBiome(land.map)?[0x929da7,0xbac4c6,0x747d87]:coastal?[0x9d9b88,0xb5af98,0x797b72]:isAridBiome(land.map)||['desert','canyon'].includes(land.map)?[0xc9ad7e,0xdcc59b,0x9e835c]:rocky?[0x9ca097,0xb3b7ad,0x7d8178]:[0xa7a99b,0xb9b9a7,0x808778];
    const settlements=land.settlements||[],campRadius=Math.min(28,land.worldSize*.145),mapEdge=land.half-4;
    const townDistance=(x,z)=>settlements.reduce((d,site)=>Math.min(d,Math.hypot(x-site.x,z-site.z)),Infinity);
    const validSite=(x,z,clearance)=>Math.abs(x)<=mapEdge&&Math.abs(z)<=mapEdge&&
      roadDistance(x,z,land,clearance)>=clearance&&!bridgeFootprint(land.map,x,z,3);
    const add=(type,x,y,z,angle,scale,stretch,heightScale,sink)=>{
      const color=palette[this.entries.length%palette.length],shade=(type==='shore'?.73:.84)+rng()*.21;
      this.entries.push({type,x,y,z,angle,scale,color,stretch,heightScale,shade,sink});
    };

    // Small pockets of mixed gravel follow the exposed bank between crossings.
    if(coastal){
      const limit=Math.floor(capacity*.32),channels=land.channels();
      const pockets=Math.ceil(limit/(channels.length*2*6));
      for(const channel of channels)for(const side of [-1,1])for(let i=0;i<pockets&&this.entries.length<limit;i++){
        const centerZ=((i+.15+rng()*.7)/pockets-.5)*(land.worldSize-16);
        const setback=.95+rng()*2.2,spread=1.6+rng()*2.1;
        for(let j=0;j<6&&this.entries.length<limit;j++){
          const z=centerZ+(rng()-.5)*spread*2,mid=channel.center+Math.sin(z*channel.frequency)*channel.bend;
          const depth=Math.max(.55,setback+(rng()-.5)*1.65),x=mid+side*(channel.width+depth);
          const y=land.surfaceHeightAt(x,z);
          if(y<.12||!validSite(x,z,2))continue;
          const scale=(j===0?.49:.16)+rng()*(j===0?.40:.34);
          add('shore',x,y,z,rng()*Math.PI*2,scale,1+rng()*.48,.6+rng()*.35,-scale*.095);
        }
      }
    }

    if(!low){
      const chains=Math.min(rocky?30:22,Math.max(8,Math.floor(capacity/(rocky?28:38))));
      const limit=Math.min(capacity*(rocky?.64:.54),this.entries.length+chains*11);
      let placed=0;
      // Ledges follow the uphill contours, and loose fragments collect lower down.
      for(let i=0;i<chains*14&&placed<chains&&this.entries.length<limit;i++){
        const x=(rng()-.5)*(land.worldSize-14),z=(rng()-.5)*(land.worldSize-14);
        if(!validSite(x,z,3.2)||townDistance(x,z)<campRadius*1.22||land.surfaceHeightAt(x,z)<.45)continue;
        const dx=(land.surfaceHeightAt(x+2,z)-land.surfaceHeightAt(x-2,z))*.25;
        const dz=(land.surfaceHeightAt(x,z+2)-land.surfaceHeightAt(x,z-2))*.25;
        const slope=Math.hypot(dx,dz);
        if(slope<(rocky?.17:.13))continue;
        const alongX=-dz/slope,alongZ=dx/slope,outX=-dx/slope,outZ=-dz/slope;
        const angle=Math.atan2(-alongZ,alongX),blocks=4+Math.floor(rng()*4),first=this.entries.length;
        for(let b=0;b<blocks&&this.entries.length<limit;b++){
          const step=(b-(blocks-1)*.5)*1.33,lap=(rng()-.5)*.6;
          const bx=x+alongX*step+outX*lap,bz=z+alongZ*step+outZ*lap,y=land.surfaceHeightAt(bx,bz);
          if(y<.44||!validSite(bx,bz,3.2)||townDistance(bx,bz)<campRadius*1.17)continue;
          const cragBoost=rocky?1.24:1.0;
          const scale=(.98+rng()*.68+Math.min(slope,.8)*.65)*(.72+.28*Math.sin((b+.5)/blocks*Math.PI))*cragBoost;
          add('ledge',bx,y,bz,angle+(rng()-.5)*.25,scale,1.68+rng()*.52,.82+rng()*.56,-scale*(.18+Math.min(.17,slope*.11)));
          if(rng()<.36||this.entries.length>=limit)continue;
          const run=1.15+rng()*1.4,sx=bx+outX*run,sz=bz+outZ*run,sy=land.surfaceHeightAt(sx,sz);
          if(sy>=.28&&validSite(sx,sz,2.6)){
            const size=.24+rng()*.49;
            add('scree',sx,sy,sz,angle+rng()*1.4,size,1.10+rng()*.42,.62+rng()*.34,-size*.11);
          }
        }
        if(this.entries.length>first)placed++;
      }
    }

    for(let i=0;i<baseCapacity*4&&this.entries.length<baseCapacity;i++){
      const x=(rng()-.5)*(land.worldSize-8),z=(rng()-.5)*(land.worldSize-8),y=land.surfaceHeightAt(x,z);
      if(y<.23||!validSite(x,z,2.4))continue;
      const distance=townDistance(x,z);
      if(distance<campRadius*.86||distance<campRadius*1.25&&rng()<.75)continue;
      const scale=.33+rng()*.65;
      add('field',x,y,z,rng()*Math.PI*2,scale,.84+rng()*.53,.65+rng()*.38,-scale*.07);
    }
    // Impassable natural stone cliff crags & granite chokepoint boulders share this single instanced draw call.
    for(const b of barriers){
      const brng=seededRandom((b.seed||1)*7919+land.seed);
      const by=land.surfaceHeightAt(b.x,b.z);
      const baseScale=Math.max(1.8,(b.r||2.8)*1.12);
      const hScale=Math.max(1.35,(b.height||3.8)/Math.max(1.2,baseScale)*1.45);
      add('barrier',b.x,by,b.z,brng()*Math.PI*2,baseScale,1.1+brng()*.32,hScale,-baseScale*.18);
      for(let k=0;k<2;k++){
        const a=brng()*Math.PI*2,dist=(b.r||2.8)*(.48+brng()*.36);
        const sx=b.x+Math.cos(a)*dist,sz=b.z+Math.sin(a)*dist,sy=land.surfaceHeightAt(sx,sz);
        const sScale=baseScale*(.55+brng()*.28);
        add('barrier',sx,sy,sz,brng()*Math.PI*2,sScale,1.18+brng()*.35,hScale*(.58+brng()*.24),-sScale*.15);
      }
    }
    this.visibleEntries=[];
    this.nextEntries=[];
    this.update(true,true);
  }
  update(menu=false,force=false){
    const v=this.view,aspect=v.camera?.aspect,fog=v.settings.fog;
    const stationary=this.lastX===v.target.x&&this.lastZ===v.target.z&&this.lastZoom===v.zoom;
    const configChanged=this.lastAngle!==v.angle||this.lastTilt!==v.tilt||this.lastAspect!==aspect||this.lastMenu!==menu||this.lastFog!==fog;
    const moved=!stationary&&(Math.hypot((v.target.x||0)-(this.lastX??Infinity),(v.target.z||0)-(this.lastZ??Infinity))>=1.5||Math.abs((v.zoom||0)-(this.lastZoom??Infinity))>=1);
    const interval=stationary?.5:.05;
    if(!force&&!configChanged&&!moved&&v.clock-(this.last||0)<interval&&v.clock>=(this.last||0))return;
    this.lastX=v.target.x;this.lastZ=v.target.z;this.lastZoom=v.zoom;this.lastAngle=v.angle;this.lastTilt=v.tilt;this.lastAspect=aspect;this.lastMenu=menu;this.lastFog=fog;this.last=v.clock;
    const visible=this.nextEntries,sites=v.groundCover?.buildingSites;
    visible.length=0;
    let changed=force;
    for(const e of this.entries){
      if(!nearViewport(v,e.x,e.y,e.z,e.type==='barrier'?12:6)||!menu&&v.settings.fog!==false&&!v.sim.isExplored(e.x,e.z))continue;
      if(e.type!=='barrier'&&sites?.get(buildingSiteKey(e.x,e.z))?.some(b=>(b.x-e.x)**2+(b.z-e.z)**2<b.radiusSquared))continue;
      if(e!==this.visibleEntries[visible.length])changed=true;
      visible.push(e);
    }
    if(!changed&&visible.length===this.visibleEntries.length)return;
    this.nextEntries=this.visibleEntries;
    this.visibleEntries=visible;
    for(let i=0;i<visible.length;i++){
      const e=visible[i];
      this.dummy.position.set(e.x,e.y+e.sink,e.z);
      this.dummy.rotation.set(.09*Math.sin(e.angle),e.angle,.07*Math.cos(e.angle));
      this.dummy.scale.set(e.scale*e.stretch,e.scale*e.heightScale,e.scale);
      this.dummy.updateMatrix();
      this.mesh.setMatrixAt(i,this.dummy.matrix);
      this.mesh.setColorAt(i,this.color.setHex(e.color).multiplyScalar(e.shade));
    }
    const count=visible.length;
    this.mesh.count=count;markInstancePrefix(this.mesh);
    if(this.mesh.instanceColor&&count){this.mesh.instanceColor.clearUpdateRanges();this.mesh.instanceColor.addUpdateRange(0,count*3);this.mesh.instanceColor.needsUpdate=true;}
    v.terrainDetailDiagnostics={visible:count,seeded:this.entries.length,capacity:this.mesh.instanceMatrix.count,triangles:count*this.mesh.geometry.attributes.position.count/3,drawCalls:count?1:0};
  }
}
