import {standardMaterial} from './render-runtime.js';
import * as THREE from 'three';
import {seededRandom} from './data.js';
import {roadDistance,terrainRoadPaths} from './terrain-layout.js';
import {nearViewport,markInstancePrefix} from './render-batches.js';
import {bridgeFootprint} from './bridge-layout.js';
import {isSnowBiome,isAridBiome,isRockyBiome,isVolcanicBiome,terrainBiome} from './terrain-biomes.js';
import {buildingSiteKey} from './ground-cover.js';
import {biomeCliffGeometry,biomeCliffWallGeometry,biomeCliffCapGeometry,biomeMountainGeometry,biomeBushGeometry,biomeRuinGeometry,biomeWaystoneGeometry,biomeFallenLogGeometry,biomeSpireGeometry} from './biome-art.js';
import {terrainTurfMaps} from './surface-assets.js';

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

/**
 * Renders ambient pebbles/outcrops PLUS Blender 4.5 LTS sheer stepped cliff walls,
 * towering alpine mountain peaks, and sculpted medieval woodland bushes — each
 * batched into a single GPU InstancedMesh draw call and smoothly fog-shaded.
 */
export class TerrainDetails{
  constructor(view){
    this.view=view;
    const land=view.landscape,rng=seededRandom(land.seed+2903),low=view.settings.quality==='low',high=view.settings.quality==='high';
    const baseCapacity=low?120:Math.min(high?1200:640,Math.max(360,Math.floor(land.worldSize**2*(high?.0045:.0025))));
    const cliffGeo=low?null:biomeCliffGeometry(land.map);
    const material=view.materials?.rock?.clone()||standardMaterial();
    material.color.setHex(0xffffff);material.roughness=.89;material.vertexColors=Boolean(cliffGeo?.attributes?.color);
    this.mesh=new THREE.InstancedMesh(cliffGeo||pebbleGeometry(high?2:1),material,baseCapacity);
    this.mesh.name='Solid terrain pebbles';this.mesh.count=0;this.mesh.frustumCulled=false;this.mesh.castShadow=false;this.mesh.receiveShadow=true;
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);view.terrain.add(this.mesh);
    this.entries=[];this.dummy=new THREE.Object3D();this.color=new THREE.Color();
    this.fogMaterials=[material];

    const coastal=land.map==='coast'||land.map==='archipelago';
    const rocky=isRockyBiome(land.map);
    const palette=isVolcanicBiome(land.map)?[0x655d59,0x79716d,0x514e47]:isSnowBiome(land.map)?[0x929da7,0xbac4c6,0x747d87]:coastal?[0x9d9b88,0xb5af98,0x797b72]:isAridBiome(land.map)||['desert','canyon'].includes(land.map)?[0xc9ad7e,0xdcc59b,0x9e835c]:rocky?[0x9ca097,0xb3b7ad,0x7d8178]:[0xa7a99b,0xb9b9a7,0x808778];
    const settlements=land.settlements||[],campRadius=Math.min(28,land.worldSize*.145),mapEdge=land.half-4;
    const townDistance=(x,z)=>settlements.reduce((d,site)=>Math.min(d,Math.hypot(x-site.x,z-site.z)),Infinity);
    const validSite=(x,z,clearance)=>Math.abs(x)<=mapEdge&&Math.abs(z)<=mapEdge&&
      roadDistance(x,z,land,clearance)>=clearance&&!bridgeFootprint(land.map,x,z,3);
    const add=(type,x,y,z,angle,scale,stretch,heightScale,sink)=>{
      const color=palette[this.entries.length%palette.length],shade=(type==='shore'?.73:.84)+rng()*.21;
      this.entries.push({type,x,y,z,angle,scale,color,stretch,heightScale,shade,sink});
    };

    const channels=land.channels();
    if(channels.length){
      const limit=Math.floor(baseCapacity*(coastal?.32:.22));
      const pockets=Math.max(1,Math.ceil(limit/(channels.length*2*6)));
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
      const chains=Math.min(rocky?30:22,Math.max(8,Math.floor(baseCapacity/(rocky?28:38))));
      const limit=Math.min(baseCapacity*(rocky?.64:.54),this.entries.length+chains*11);
      let placed=0;
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

    // Separate Blender 4.5 LTS Sheer Stepped Cliff Walls & Towering Alpine Mountains
    const barriers=view.sim?.barriers||[];
    this.cliffEntries=[];
    this.mountainEntries=[];
    for(const b of barriers){
      const brng=seededRandom((b.seed||1)*7919+land.seed);
      const y=land.surfaceHeightAt(b.x,b.z);
      if(b.kind==='mountain'){
        const sx=Math.max(1.1,(b.r||4.0)/1.75);
        const sy=Math.max(1.0,(b.height||6.4)/5.2);
        this.mountainEntries.push({x:b.x,y,z:b.z,angle:Number.isFinite(b.angle)?b.angle:brng()*Math.PI*2,sx,sy,sz:sx*(.92+brng()*.18),shade:.92+brng()*.14});
      }else{
        const sx=Math.max(.95,(b.r||3.1)/1.45);
        const sy=Math.max(.95,(b.height||4.2)/3.15);
        const sz=Math.max(.95,(b.r||3.1)/1.12);
        this.cliffEntries.push({x:b.x,y,z:b.z,angle:Number.isFinite(b.angle)?b.angle:brng()*Math.PI*2,sx,sy,sz,shade:.90+brng()*.16});
      }
    }

    if(this.cliffEntries.length){
      const geo=biomeCliffWallGeometry(land.map)||pebbleGeometry(1);
      const mat=view.materials?.rock?.clone()||standardMaterial({roughness:.9});
      mat.color.setHex(0xffffff);mat.roughness=.9;mat.vertexColors=Boolean(geo.attributes?.color);
      this.cliffWallMesh=new THREE.InstancedMesh(geo,mat,this.cliffEntries.length);
      this.cliffWallMesh.name='Blender sheer cliff walls';this.cliffWallMesh.count=0;this.cliffWallMesh.frustumCulled=false;
      this.cliffWallMesh.castShadow=!low;this.cliffWallMesh.receiveShadow=true;
      this.cliffWallMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      view.terrain.add(this.cliffWallMesh);
      this.fogMaterials.push(mat);
      const capGeo=biomeCliffCapGeometry(land.map);
      if(capGeo){
        const turf=terrainTurfMaps(land.map);
        const biomeTint=new THREE.Color(terrainBiome(land.map).grassTint||0x88b058);
        const textured=Boolean(turf?.color);
        const fallbackTint=isSnowBiome(land.map)?new THREE.Color(0xe6edf2):isAridBiome(land.map)?new THREE.Color(0xc4a26a):isVolcanicBiome(land.map)?new THREE.Color(0x524b45):new THREE.Color(0x4b7434).lerp(biomeTint,.35);
        const capTint=textured?(isSnowBiome(land.map)?new THREE.Color(0xffffff):isVolcanicBiome(land.map)?new THREE.Color(0x6c625b):new THREE.Color(0xffffff).lerp(biomeTint,.42)):fallbackTint;
        const capMat=standardMaterial({color:capTint,map:turf?.color||null,normalMap:low?null:(turf?.normal||null),roughness:.92,vertexColors:Boolean(capGeo.attributes?.color)});
        if(capMat.normalScale&&capMat.normalMap)capMat.normalScale.setScalar(.35);
        this.cliffCapMesh=new THREE.InstancedMesh(capGeo,capMat,this.cliffEntries.length);
        this.cliffCapMesh.name='Blender grass-capped cliff plateaus';this.cliffCapMesh.count=0;this.cliffCapMesh.frustumCulled=false;
        this.cliffCapMesh.castShadow=false;this.cliffCapMesh.receiveShadow=true;
        this.cliffCapMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
        view.terrain.add(this.cliffCapMesh);
        this.fogMaterials.push(capMat);
      }else this.cliffCapMesh=null;
    }else{this.cliffWallMesh=null;this.cliffCapMesh=null;}

    if(this.mountainEntries.length){
      const geo=biomeMountainGeometry(land.map)||biomeCliffWallGeometry(land.map)||pebbleGeometry(1);
      const mat=view.materials?.rock?.clone()||standardMaterial({roughness:.91});
      mat.color.setHex(0xffffff);mat.roughness=.91;mat.vertexColors=Boolean(geo.attributes?.color);
      this.mountainMesh=new THREE.InstancedMesh(geo,mat,this.mountainEntries.length);
      this.mountainMesh.name='Blender mountain crags';this.mountainMesh.count=0;this.mountainMesh.frustumCulled=false;
      this.mountainMesh.castShadow=!low;this.mountainMesh.receiveShadow=true;
      this.mountainMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      view.terrain.add(this.mountainMesh);
      this.fogMaterials.push(mat);
    }else this.mountainMesh=null;

    // Blender 4.5 LTS Sculpted Medieval Woodland Bushes (around cliff feet, forest edges & hills across the whole continent)
    const bushGeo=biomeBushGeometry(land.map);
    this.bushEntries=[];
    if(bushGeo&&!view.settings.reduceFoliage){
      const sizeScale=Math.max(1,land.worldSize/160);
      const bushCap=Math.round((low?110:high?480:260)*Math.min(1.6,sizeScale));
      const brng=seededRandom(land.seed+6781);
      const plantBush=(x,z,scale=1)=>{
        if(this.bushEntries.length>=bushCap)return;
        if(Math.abs(x)>mapEdge||Math.abs(z)>mapEdge||roadDistance(x,z,land,2.2)<2.2||bridgeFootprint(land.map,x,z,3))return;
        if(view.sim?.isWater?.(x,z))return;
        const y=land.surfaceHeightAt(x,z);
        if(y<.24)return;
        this.bushEntries.push({x,y,z,angle:brng()*Math.PI*2,sx:scale*(.85+brng()*.45),sy:scale*(.75+brng()*.42),sz:scale*(.85+brng()*.45),shade:.86+brng()*.24});
      };
      // 1. Natural fern & bramble undergrowth hugging cliff bases & mountain feet
      const cliffBudget=Math.floor(bushCap*.56);
      const bStride=Math.max(1,Math.floor(barriers.length/Math.max(1,Math.floor(cliffBudget/2))));
      for(let i=0;i<barriers.length&&this.bushEntries.length<cliffBudget;i+=bStride){
        const b=barriers[i],count=b.kind==='mountain'?2:2;
        for(let k=0;k<count&&this.bushEntries.length<cliffBudget;k++){
          const a=brng()*Math.PI*2,d=(b.r||3.0)+.55+brng()*1.25;
          plantBush(b.x+Math.cos(a)*d,b.z+Math.sin(a)*d,.75+brng()*.42);
        }
      }
      // 2. Woodland fern undergrowth tucked closely along natural timber lines (never floating in open town grass!)
      const trees=(view.sim?.entities||[]).filter(e=>e.hp>0&&e.kind==='resource'&&e.type==='wood');
      const stride=Math.max(1,Math.floor(trees.length/Math.max(1,Math.floor(bushCap*.44))));
      for(let i=0;i<trees.length&&this.bushEntries.length<bushCap;i+=stride){
        const tr=trees[i],a=brng()*Math.PI*2,d=1.05+brng()*1.15;
        if(townDistance(tr.x+Math.cos(a)*d,tr.z+Math.sin(a)*d)<18)continue;
        plantBush(tr.x+Math.cos(a)*d,tr.z+Math.sin(a)*d,.68+brng()*.36);
      }
      if(this.bushEntries.length){
        const bmat=standardMaterial({color:0xffffff,roughness:.92,vertexColors:Boolean(bushGeo.attributes?.color)});
        this.bushMesh=new THREE.InstancedMesh(bushGeo,bmat,this.bushEntries.length);
        this.bushMesh.name='Blender woodland bushes';this.bushMesh.count=0;this.bushMesh.frustumCulled=false;
        this.bushMesh.castShadow=false;this.bushMesh.receiveShadow=true;
        this.bushMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
        view.terrain.add(this.bushMesh);
        this.fogMaterials.push(bmat);
      }else{bushGeo.dispose();this.bushMesh=null;}
    }else{if(bushGeo)bushGeo.dispose();this.bushMesh=null;}

    // Blender 4.5 LTS Environmental Storytelling Landmarks (Natural Medieval Ruins, Roadside Waystones, Mossy Fallen Logs & Biome Spires)
    // Purely visual scenery: sparse, climate-matched, grounded on slopes, fog-shaded & auto-cleared beneath player foundations.
    const lrng=seededRandom(land.seed+9137);
    const sizeFactor=Math.max(1,Math.min(1.65,land.worldSize/180));
    const simEntities=view.sim?.entities||[];
    const landmarksPlaced=[];
    const isClearLandmarkSite=(x,z,minRoad,minTown,minSelf,selfList,maxSlope=.36,resPad=1.65)=>{
      if(Math.abs(x)>mapEdge-3||Math.abs(z)>mapEdge-3)return false;
      if(view.sim?.isWater?.(x,z)||bridgeFootprint(land.map,x,z,4.5))return false;
      if(townDistance(x,z)<minTown)return false;
      if(minRoad>0&&roadDistance(x,z,land,minRoad)<minRoad)return false;
      const y=land.surfaceHeightAt(x,z);
      if(y<.34)return false;
      const dx=(land.surfaceHeightAt(x+1.8,z)-land.surfaceHeightAt(x-1.8,z))/3.6;
      const dz=(land.surfaceHeightAt(x,z+1.8)-land.surfaceHeightAt(x,z-1.8))/3.6;
      if(Math.hypot(dx,dz)>maxSlope)return false;
      for(const b of barriers)if(Math.hypot(b.x-x,b.z-z)<(b.r||3.0)+1.8)return false;
      for(const e of simEntities){
        if(e.hp<=0)continue;
        const pad=e.kind==='building'?e.r+3.0:e.kind==='resource'?e.r+resPad:e.kind==='shrine'?e.r+4.8:0;
        if(pad>0&&Math.hypot(e.x-x,e.z-z)<pad)return false;
      }
      for(const prev of selfList)if(Math.hypot(prev.x-x,prev.z-z)<minSelf)return false;
      for(const any of landmarksPlaced)if(Math.hypot(any.x-x,any.z-z)<5.0)return false;
      return true;
    };

    const makeLandmarkMesh=(geo,name,entries,useRockMat=true,castShadow=!low)=>{
      if(!geo)return null;
      if(!entries.length){geo.dispose();return null;}
      const lmat=useRockMat?(view.materials?.rock?.clone()||standardMaterial({roughness:.9})):standardMaterial({color:0xffffff,roughness:.93});
      lmat.color.setHex(0xffffff);lmat.roughness=useRockMat?.90:.93;lmat.vertexColors=Boolean(geo.attributes?.color);
      const mesh=new THREE.InstancedMesh(geo,lmat,entries.length);
      mesh.name=name;mesh.count=0;mesh.frustumCulled=false;mesh.castShadow=castShadow;mesh.receiveShadow=true;
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      view.terrain.add(mesh);
      this.fogMaterials.push(lmat);
      return mesh;
    };

    // 1. Roadside Medieval Waystones (tucked organically along trade-road verges)
    const waystoneGeo=biomeWaystoneGeometry(land.map);
    this.waystoneEntries=[];
    if(waystoneGeo){
      const wsCap=Math.round((low?6:high?22:14)*sizeFactor);
      const roads=terrainRoadPaths(land)||[];
      let sideToggle=1;
      for(const road of roads){
        const pts=road.points||[];
        let accum=12+lrng()*8;
        for(let i=1;i<pts.length&&this.waystoneEntries.length<wsCap;i++){
          const a=pts[i-1],b=pts[i],segLen=Math.hypot(b.x-a.x,b.z-a.z);
          if(segLen<.1)continue;
          accum-=segLen;
          if(accum>0)continue;
          accum=20+lrng()*12;
          const nx=-(b.z-a.z)/segLen,nz=(b.x-a.x)/segLen;
          const offset=sideToggle*(2.9+lrng()*1.1);
          sideToggle*=-1;
          const wx=(a.x+b.x)*.5+nx*offset,wz=(a.z+b.z)*.5+nz*offset;
          if(!isClearLandmarkSite(wx,wz,2.1,18,18,this.waystoneEntries,.32))continue;
          const roadAng=Math.atan2(-(b.z-a.z),b.x-a.x);
          const sc=1.02+lrng()*.26;
          const entry={x:wx,y:land.surfaceHeightAt(wx,wz)-.10,z:wz,angle:roadAng+Math.PI*.5+(lrng()-.5)*.35,sx:sc,sy:sc*(.94+lrng()*.18),sz:sc,shade:.88+lrng()*.18};
          this.waystoneEntries.push(entry);landmarksPlaced.push(entry);
        }
      }
      // Subtle border & pass trail markers if a map has short/few roads
      for(let tries=0;tries<70&&this.waystoneEntries.length<Math.max(5,Math.floor(wsCap*.55));tries++){
        const wx=(lrng()-.5)*(land.worldSize-24),wz=(lrng()-.5)*(land.worldSize-24);
        if(!isClearLandmarkSite(wx,wz,3.0,22,22,this.waystoneEntries,.28))continue;
        const sc=1.00+lrng()*.26;
        const entry={x:wx,y:land.surfaceHeightAt(wx,wz)-.10,z:wz,angle:lrng()*Math.PI*2,sx:sc,sy:sc*(.94+lrng()*.18),sz:sc,shade:.88+lrng()*.18};
        this.waystoneEntries.push(entry);landmarksPlaced.push(entry);
      }
    }
    this.waystoneMesh=makeLandmarkMesh(waystoneGeo,'Blender medieval waystones',this.waystoneEntries,true,!low);

    // 2. Crumbling Medieval Stone Archway Ruins (near shrines, mountain foothills & quiet overlooks)
    const ruinGeo=biomeRuinGeometry(land.map);
    this.ruinEntries=[];
    if(ruinGeo){
      const ruinCap=Math.round((low?5:high?16:10)*sizeFactor);
      const shrines=simEntities.filter(e=>e.hp>0&&e.kind==='shrine');
      for(const sh of shrines){
        if(this.ruinEntries.length>=ruinCap)break;
        for(let k=0;k<8;k++){
          const a=lrng()*Math.PI*2,d=8.5+lrng()*5.5;
          const rx=sh.x+Math.cos(a)*d,rz=sh.z+Math.sin(a)*d;
          if(!isClearLandmarkSite(rx,rz,4.0,24,26,this.ruinEntries,.28))continue;
          const sc=1.05+lrng()*.24;
          const entry={x:rx,y:land.surfaceHeightAt(rx,rz)-.14,z:rz,angle:a+Math.PI*.5+(lrng()-.5)*.45,sx:sc,sy:sc*(.94+lrng()*.16),sz:sc,shade:.86+lrng()*.18};
          this.ruinEntries.push(entry);landmarksPlaced.push(entry);break;
        }
      }
      if(barriers.length){
        const bStep=Math.max(1,Math.floor(barriers.length/Math.max(1,ruinCap*2)));
        for(let i=0;i<barriers.length&&this.ruinEntries.length<ruinCap;i+=bStep){
          const b=barriers[i],a=lrng()*Math.PI*2,d=(b.r||3.0)+3.6+lrng()*3.8;
          const rx=b.x+Math.cos(a)*d,rz=b.z+Math.sin(a)*d;
          if(!isClearLandmarkSite(rx,rz,4.0,24,26,this.ruinEntries,.28))continue;
          const sc=1.04+lrng()*.26;
          const entry={x:rx,y:land.surfaceHeightAt(rx,rz)-.14,z:rz,angle:lrng()*Math.PI*2,sx:sc,sy:sc*(.92+lrng()*.18),sz:sc,shade:.86+lrng()*.18};
          this.ruinEntries.push(entry);landmarksPlaced.push(entry);
        }
      }
      for(let tries=0;tries<160&&this.ruinEntries.length<ruinCap;tries++){
        const rx=(lrng()-.5)*(land.worldSize-26),rz=(lrng()-.5)*(land.worldSize-26);
        if(!isClearLandmarkSite(rx,rz,4.2,24,28,this.ruinEntries,.26))continue;
        const sc=1.02+lrng()*.26;
        const entry={x:rx,y:land.surfaceHeightAt(rx,rz)-.14,z:rz,angle:lrng()*Math.PI*2,sx:sc,sy:sc*(.92+lrng()*.18),sz:sc,shade:.86+lrng()*.18};
        this.ruinEntries.push(entry);landmarksPlaced.push(entry);
      }
    }
    this.ruinMesh=makeLandmarkMesh(ruinGeo,'Blender medieval stone ruins',this.ruinEntries,true,!low);

    // 3. Mossy Fallen Ancient Woodland Logs (tucked along forest edges & glade rims; skipped on arid/volcanic)
    const logGeo=biomeFallenLogGeometry(land.map);
    this.logEntries=[];
    if(logGeo&&!view.settings.reduceFoliage){
      const logCap=Math.round((low?10:high?34:22)*sizeFactor);
      const woodTrees=simEntities.filter(e=>e.hp>0&&e.kind==='resource'&&e.type==='wood');
      const wStep=Math.max(1,Math.floor(woodTrees.length/Math.max(1,logCap*2)));
      for(let i=0;i<woodTrees.length&&this.logEntries.length<logCap;i+=wStep){
        const tr=woodTrees[i],a=lrng()*Math.PI*2,d=2.2+lrng()*2.2;
        const lx=tr.x+Math.cos(a)*d,lz=tr.z+Math.sin(a)*d;
        if(!isClearLandmarkSite(lx,lz,3.0,18,11,this.logEntries,.30,1.15))continue;
        const sc=.94+lrng()*.36;
        const entry={x:lx,y:land.surfaceHeightAt(lx,lz)-.06,z:lz,angle:lrng()*Math.PI*2,sx:sc,sy:sc*(.90+lrng()*.22),sz:sc,shade:.86+lrng()*.20};
        this.logEntries.push(entry);landmarksPlaced.push(entry);
      }
    }
    this.logMesh=makeLandmarkMesh(logGeo,'Blender fallen woodland logs',this.logEntries,false,false);

    // 4. Biome Geological Spires & Standing Stones (basalt spires, desert hoodoos, alpine crags, mossy dolmens)
    const spireGeo=biomeSpireGeometry(land.map);
    this.spireEntries=[];
    if(spireGeo){
      const spireRich=isVolcanicBiome(land.map)||isAridBiome(land.map)||isSnowBiome(land.map)||rocky;
      const spireCap=Math.round((low?(spireRich?6:4):high?(spireRich?20:12):(spireRich?13:8))*sizeFactor);
      if(barriers.length){
        const sStep=Math.max(1,Math.floor(barriers.length/Math.max(1,spireCap*2)));
        for(let i=0;i<barriers.length&&this.spireEntries.length<spireCap;i+=sStep){
          const b=barriers[i],a=lrng()*Math.PI*2,d=(b.r||3.0)+2.8+lrng()*4.0;
          const sx=b.x+Math.cos(a)*d,sz=b.z+Math.sin(a)*d;
          if(!isClearLandmarkSite(sx,sz,3.8,24,20,this.spireEntries,.34))continue;
          const sc=.98+lrng()*.36;
          const entry={x:sx,y:land.surfaceHeightAt(sx,sz)-.16,z:sz,angle:lrng()*Math.PI*2,sx:sc,sy:sc*(.92+lrng()*.28),sz:sc,shade:.88+lrng()*.18};
          this.spireEntries.push(entry);landmarksPlaced.push(entry);
        }
      }
      for(let tries=0;tries<140&&this.spireEntries.length<spireCap;tries++){
        const sx=(lrng()-.5)*(land.worldSize-24),sz=(lrng()-.5)*(land.worldSize-24);
        if(!isClearLandmarkSite(sx,sz,4.0,24,22,this.spireEntries,.32))continue;
        const sc=.95+lrng()*.34;
        const entry={x:sx,y:land.surfaceHeightAt(sx,sz)-.16,z:sz,angle:lrng()*Math.PI*2,sx:sc,sy:sc*(.90+lrng()*.26),sz:sc,shade:.88+lrng()*.18};
        this.spireEntries.push(entry);landmarksPlaced.push(entry);
      }
    }
    this.spireMesh=makeLandmarkMesh(spireGeo,'Blender biome geological spires',this.spireEntries,true,!low);

    this.visibleEntries=[];
    this.nextEntries=[];
    this.visibleCliffs=[];
    this.visibleCliffCaps=[];
    this.visibleMountains=[];
    this.visibleBushes=[];
    this.visibleWaystones=[];
    this.visibleRuins=[];
    this.visibleLogs=[];
    this.visibleSpires=[];
    this.update(true,true);
  }

  _updateBarrierMesh(mesh,entries,prevVisible,menu,pad){
    if(!mesh)return 0;
    const v=this.view;
    let count=0,changed=false;
    for(const e of entries){
      if(!nearViewport(v,e.x,e.y,e.z,pad)||(!menu&&v.settings.fog!==false&&!v.sim.isExplored(e.x,e.z)))continue;
      if(prevVisible[count]!==e){
        this.dummy.position.set(e.x,e.y-.2,e.z);
        this.dummy.rotation.set(0,e.angle,0);
        this.dummy.scale.set(e.sx,e.sy,e.sz);
        this.dummy.updateMatrix();
        mesh.setMatrixAt(count,this.dummy.matrix);
        mesh.setColorAt(count,this.color.setHex(0xffffff).multiplyScalar(e.shade));
        changed=true;
      }
      prevVisible[count++]=e;
    }
    if(count!==prevVisible.length){prevVisible.length=count;changed=true;}
    mesh.count=count;
    if(changed){
      markInstancePrefix(mesh);
      if(mesh.instanceColor&&count){mesh.instanceColor.clearUpdateRanges();mesh.instanceColor.addUpdateRange(0,count*3);mesh.instanceColor.needsUpdate=true;}
    }
    return count;
  }

  _updateLandmarkMesh(mesh,entries,prevVisible,menu,pad,sites,force){
    if(!mesh)return 0;
    const v=this.view;
    let count=0,changed=force;
    for(const e of entries){
      if(!nearViewport(v,e.x,e.y,e.z,pad)||(!menu&&v.settings.fog!==false&&!v.sim.isExplored(e.x,e.z)))continue;
      if(sites?.get(buildingSiteKey(e.x,e.z))?.some(b=>(b.x-e.x)**2+(b.z-e.z)**2<b.radiusSquared))continue;
      if(prevVisible[count]!==e){
        this.dummy.position.set(e.x,e.y,e.z);
        this.dummy.rotation.set(0,e.angle,0);
        this.dummy.scale.set(e.sx,e.sy,e.sz);
        this.dummy.updateMatrix();
        mesh.setMatrixAt(count,this.dummy.matrix);
        mesh.setColorAt(count,this.color.setHex(0xffffff).multiplyScalar(e.shade));
        changed=true;
      }
      prevVisible[count++]=e;
    }
    if(count!==prevVisible.length){prevVisible.length=count;changed=true;}
    mesh.count=count;
    if(changed){
      markInstancePrefix(mesh);
      if(mesh.instanceColor&&count){mesh.instanceColor.clearUpdateRanges();mesh.instanceColor.addUpdateRange(0,count*3);mesh.instanceColor.needsUpdate=true;}
    }
    return count;
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
      if(!nearViewport(v,e.x,e.y,e.z,6)||!menu&&v.settings.fog!==false&&!v.sim.isExplored(e.x,e.z))continue;
      if(sites?.get(buildingSiteKey(e.x,e.z))?.some(b=>(b.x-e.x)**2+(b.z-e.z)**2<b.radiusSquared))continue;
      if(e!==this.visibleEntries[visible.length])changed=true;
      visible.push(e);
    }
    if(changed||visible.length!==this.visibleEntries.length){
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
    }

    const cliffCount=this._updateBarrierMesh(this.cliffWallMesh,this.cliffEntries,this.visibleCliffs,menu,14);
    this._updateBarrierMesh(this.cliffCapMesh,this.cliffEntries,this.visibleCliffCaps,menu,14);
    const mountainCount=this._updateBarrierMesh(this.mountainMesh,this.mountainEntries,this.visibleMountains,menu,18);
    let bushCount=0;
    if(this.bushMesh){
      let bChanged=force;
      for(const e of this.bushEntries){
        if(!nearViewport(v,e.x,e.y,e.z,7)||(!menu&&v.settings.fog!==false&&!v.sim.isExplored(e.x,e.z)))continue;
        if(sites?.get(buildingSiteKey(e.x,e.z))?.some(b=>(b.x-e.x)**2+(b.z-e.z)**2<b.radiusSquared))continue;
        if(this.visibleBushes[bushCount]!==e){
          this.dummy.position.set(e.x,e.y-.04,e.z);
          this.dummy.rotation.set(0,e.angle,0);
          this.dummy.scale.set(e.sx,e.sy,e.sz);
          this.dummy.updateMatrix();
          this.bushMesh.setMatrixAt(bushCount,this.dummy.matrix);
          this.bushMesh.setColorAt(bushCount,this.color.setHex(0xffffff).multiplyScalar(e.shade));
          bChanged=true;
        }
        this.visibleBushes[bushCount++]=e;
      }
      if(bushCount!==this.visibleBushes.length){this.visibleBushes.length=bushCount;bChanged=true;}
      this.bushMesh.count=bushCount;
      if(bChanged){
        markInstancePrefix(this.bushMesh);
        if(this.bushMesh.instanceColor&&bushCount){this.bushMesh.instanceColor.clearUpdateRanges();this.bushMesh.instanceColor.addUpdateRange(0,bushCount*3);this.bushMesh.instanceColor.needsUpdate=true;}
      }
    }

    const waystoneCount=this._updateLandmarkMesh(this.waystoneMesh,this.waystoneEntries,this.visibleWaystones,menu,9,sites,force);
    const ruinCount=this._updateLandmarkMesh(this.ruinMesh,this.ruinEntries,this.visibleRuins,menu,12,sites,force);
    const logCount=this._updateLandmarkMesh(this.logMesh,this.logEntries,this.visibleLogs,menu,8,sites,force);
    const spireCount=this._updateLandmarkMesh(this.spireMesh,this.spireEntries,this.visibleSpires,menu,11,sites,force);

    const count=this.mesh.count;
    v.terrainDetailDiagnostics={
      visible:count,
      cliffsVisible:cliffCount,
      mountainsVisible:mountainCount,
      bushesVisible:bushCount,
      landmarksVisible:waystoneCount+ruinCount+logCount+spireCount,
      seeded:this.entries.length,
      capacity:this.mesh.instanceMatrix.count,
      triangles:count*this.mesh.geometry.attributes.position.count/3,
      drawCalls:(count?1:0)+(cliffCount?1:0)+(mountainCount?1:0)+(bushCount?1:0)+(waystoneCount?1:0)+(ruinCount?1:0)+(logCount?1:0)+(spireCount?1:0),
    };
  }
}
