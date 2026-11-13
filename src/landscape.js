import * as THREE from 'three';
import {standardMaterial,nodeRuntime} from './render-runtime.js';
import {seededRandom} from './data.js';
import {insideMap} from './map-geometry.js';
import {GroundCover} from './ground-cover.js';
import {applyGroundSurface} from './surface-assets.js';
import {configureWaterSurface,configureWaterPalette,animateWaterSurface} from './water-surface.js';
import {WATER_WAVE_BOUND} from './water-waves.js';
import {prepareTerrainGeometry,terrainRoadPaths} from './terrain-layout.js';
import {TerrainDetails} from './terrain-details.js';
import {terrainRelief} from './terrain-relief.js';
import {terrainGridAxis,terrainGridCoordinate} from './terrain-grid.js';
import {terrainMeadow} from './terrain-fields.js';
import {terrainClarityPixels} from './terrain-clarity.js';
import {waterChannels} from './map-water.js';
import {isSnowBiome,isVolcanicBiome,isAridBiome,isRockyBiome,terrainBiome} from './terrain-biomes.js';
import {bridgeAt,bridgeDeckHeight,bridgeSpans,bridgeArtwork,bridgeRoadHalfWidth,bridgeOuterHalfWidth} from './bridge-layout.js';
import {buildBridges} from './bridge-art.js';

const smooth=(a,b,x)=>{const t=Math.max(0,Math.min(1,(x-a)/(b-a)));return t*t*(3-2*t);};
export class Landscape {
  constructor(seed,map,worldSize=160,settlements=null){this.worldSize=worldSize;this.half=worldSize/2;this.renderSize=worldSize*2;this.settlements=settlements||[{x:-37,z:30},{x:37,z:-30}];this.seed=seed;this.map=map;this.phase=seededRandom(seed+751)()*Math.PI*2;}
  channels(){return this.waterChannels??=waterChannels(this.map);}
  heightAt(x,z){
    const p=this.phase;
    let h=terrainRelief(this.map,x,z,p);
    const townDistance=Math.min(...this.settlements.map(point=>Math.hypot(x-point.x,z-point.z)));
    h=.65+(h-.65)*smooth(12,26,townDistance);
    for(const channel of this.channels()){
      const d=Math.abs(x-channel.center-Math.sin(z*channel.frequency)*channel.bend);
      // The water mesh and naval navigation end at the same channel width.
      // Meet water level there instead of leaving a submerged "dry" bank.
      if(d<channel.width)h=-1.3+1.38*smooth(Math.max(0,channel.width-3),channel.width,d);
      else if(d<channel.width+6)h=.08+(Math.max(.3,h)-.08)*smooth(channel.width,channel.width+6,d);
      const span=bridgeSpans(this.map).find(span=>span.center===channel.center);
      if(span){const outward=Math.abs(x-span.center)-span.halfLength,bank=smooth(-2,-.5,outward)*(1-smooth(10,18,outward)),across=1-smooth(bridgeOuterHalfWidth,bridgeOuterHalfWidth+6.8,Math.abs(z));h+=(bridgeArtwork.baseHeight-h)*bank*across;}
    }
    // Keep every terrain triangle adjacent to the crossing below its lowest
    // paving. The collar covers the coarsest supported grid at every quality.
    const collar=Math.max(2,this.renderSize/112+1);
    for(const span of bridgeSpans(this.map)){const along=1-smooth(span.halfLength+collar,span.halfLength+collar+4,Math.abs(x-span.center)),across=1-smooth(bridgeOuterHalfWidth+collar,bridgeOuterHalfWidth+4+collar,Math.abs(z));h-=Math.max(0,h-(bridgeArtwork.baseHeight-.35))*along*across;}
    const edge=Math.max(Math.abs(x),Math.abs(z)),rise=smooth(this.half-4,this.half+30,edge);
    const ridges=7+Math.pow(Math.sin(x*.043+p)*Math.cos(z*.037-p),2)*18+Math.sin((x+z)*.07)*2;
    h+=rise*ridges;
    return h;
  }
  geometry(size=this.renderSize,segments=160,offset=0){
    const geo=new THREE.PlaneGeometry(size,size,segments,segments);geo.rotateX(-Math.PI/2);
    const pos=geo.getAttribute('position'),uv=geo.getAttribute('uv'),axis=size===this.renderSize?terrainGridAxis(size,segments):null;
    for(let i=0;i<pos.count;i++){
      const x=axis?axis[i%(segments+1)]:pos.getX(i),z=axis?axis[Math.floor(i/(segments+1))]:pos.getZ(i);
      pos.setXYZ(i,x,this.heightAt(x,z)+offset,z);uv.setXY(i,(x+size/2)/size,1-(z+size/2)/size);
    }
    if(size===this.renderSize&&offset===0){this.grid={segments,size,axis,heights:Float32Array.from({length:pos.count},(_,i)=>pos.getY(i))};}
    pos.needsUpdate=true;geo.computeVertexNormals();geo.computeBoundingBox();geo.computeBoundingSphere();return geo;
  }
  surfaceHeightAt(x,z){
    const grid=this.grid;if(!grid||Math.abs(x)>this.worldSize||Math.abs(z)>this.worldSize)return this.heightAt(x,z);
    const xx=terrainGridCoordinate(x,grid),zz=terrainGridCoordinate(z,grid),ix=Math.min(grid.segments-1,Math.floor(xx)),iz=Math.min(grid.segments-1,Math.floor(zz)),u=xx-ix,v=zz-iz,stride=grid.segments+1,a=iz*stride+ix;
    const h00=grid.heights[a],h10=grid.heights[a+1],h01=grid.heights[a+stride],h11=grid.heights[a+stride+1];
    return u+v<=1?h00+u*(h10-h00)+v*(h01-h00):h11+(1-u)*(h01-h11)+(1-v)*(h10-h11);
  }
  walkableHeightAt(x,z){
    const span=bridgeAt(this.map,x,z,3);
    if(!span||Math.abs(z)>bridgeRoadHalfWidth+1e-6)return this.surfaceHeightAt(x,z);
    const distance=Math.abs(x-span.center);
    if(distance<=span.halfLength)return bridgeDeckHeight(span,x);
    const outer=span.center+Math.sign(x-span.center)*(span.halfLength+3),blend=smooth(0,3,distance-span.halfLength);
    return Math.max(this.surfaceHeightAt(x,z),bridgeArtwork.baseHeight+(this.surfaceHeightAt(outer,z)-bridgeArtwork.baseHeight)*blend);
  }
  walkableSampleAt(x,z,output){
    const span=bridgeAt(this.map,x,z,3),grid=this.grid;
    if(!grid||Math.abs(x)>this.worldSize||Math.abs(z)>this.worldSize||span&&Math.abs(z)<=bridgeRoadHalfWidth+1e-6){
      output.height=this.walkableHeightAt(x,z);output.dx=(this.walkableHeightAt(x+.05,z)-this.walkableHeightAt(x-.05,z))/.1;output.dz=(this.walkableHeightAt(x,z+.05)-this.walkableHeightAt(x,z-.05))/.1;return output;
    }
    const xx=terrainGridCoordinate(x,grid),zz=terrainGridCoordinate(z,grid),ix=Math.min(grid.segments-1,Math.floor(xx)),iz=Math.min(grid.segments-1,Math.floor(zz)),u=xx-ix,v=zz-iz,stride=grid.segments+1,a=iz*stride+ix;
    const h00=grid.heights[a],h10=grid.heights[a+1],h01=grid.heights[a+stride],h11=grid.heights[a+stride+1],width=grid.axis?grid.axis[ix+1]-grid.axis[ix]:grid.size/grid.segments,depth=grid.axis?grid.axis[iz+1]-grid.axis[iz]:grid.size/grid.segments;
    if(u+v<=1){output.height=h00+u*(h10-h00)+v*(h01-h00);output.dx=(h10-h00)/width;output.dz=(h01-h00)/depth;}
    else{output.height=h11+(1-u)*(h01-h11)+(1-v)*(h10-h11);output.dx=(h11-h01)/width;output.dz=(h11-h10)/depth;}
    return output;
  }
  rayPoint(ray){
    // Sample the actual triangulated surface; never command on an invisible y=0 plane.
    let previous=null;
    for(let distance=0;distance<=Math.max(400,this.renderSize*1.5);distance+=2){const x=ray.origin.x+ray.direction.x*distance,y=ray.origin.y+ray.direction.y*distance,z=ray.origin.z+ray.direction.z*distance;
      if(Math.abs(x)>this.worldSize||Math.abs(z)>this.worldSize){previous=null;continue;}
      const delta=y-this.walkableHeightAt(x,z);
      if(delta<=0&&previous!==null){let lo=previous,hi=distance;for(let i=0;i<11;i++){const mid=(lo+hi)/2,xx=ray.origin.x+ray.direction.x*mid,zz=ray.origin.z+ray.direction.z*mid,yy=ray.origin.y+ray.direction.y*mid;if(yy>this.walkableHeightAt(xx,zz))lo=mid;else hi=mid;}const point=ray.at((lo+hi)/2,new THREE.Vector3());return insideMap(point.x,point.z,this.worldSize)?point:null;}
      previous=distance;
    }
    return null;
  }
  waterGeometry(channel,quality='low'){
    const vertices=[],uv=[],depth=[],shore=[],indices=[],across=quality==='low'?8:Math.max(8,Math.ceil(channel.width*2/1.4)),length=this.worldSize/2;
    for(let row=0;row<=length;row++){const z=-this.half+row*2,mid=channel.center+Math.sin(z*channel.frequency)*channel.bend;
      for(let col=0;col<=across;col++){const x=mid-channel.width+col/across*channel.width*2;vertices.push(x,.08,z);uv.push(col/across*2,row*.07);depth.push(Math.max(0,.08-this.surfaceHeightAt(x,z)));shore.push(channel.width*(1-Math.abs(col/across*2-1)));}
    }
    for(let row=0;row<length;row++)for(let col=0;col<across;col++){const a=row*(across+1)+col,b=a+across+1;indices.push(a,b,a+1,b,b+1,a+1);}
    const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3));geo.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));geo.setAttribute('frontierWaterDepth',new THREE.Float32BufferAttribute(depth,1));geo.setAttribute('frontierWaterShore',new THREE.Float32BufferAttribute(shore,1));geo.setIndex(indices);geo.computeVertexNormals();
    geo.computeBoundingBox();geo.boundingBox.min.y-=WATER_WAVE_BOUND;geo.boundingBox.max.y+=WATER_WAVE_BOUND;
    geo.computeBoundingSphere();geo.boundingSphere.radius+=WATER_WAVE_BOUND;return geo;
  }
}

function traceOffsetRoad(points,offset,size,canvasSize){
  const path=new Path2D(),half=size/2,scale=canvasSize/size;
  for(let i=0;i<points.length;i++){
    const prev=points[Math.max(0,i-1)],next=points[Math.min(points.length-1,i+1)],dx=next.x-prev.x,dz=next.z-prev.z,len=Math.hypot(dx,dz)||1;
    const x=points[i].x-(dz/len)*offset,z=points[i].z+(dx/len)*offset;
    path.lineTo((x+half)*scale,(z+half)*scale);
  }
  return path;
}

function groundMap(landscape){
  const canvas=document.createElement('canvas');canvas.width=canvas.height=1536;
  const ctx=canvas.getContext('2d'),rng=seededRandom(landscape.seed+818),size=landscape.renderSize,half=size/2,scale=1536/size;
  const winter=isSnowBiome(landscape.map),volcanic=isVolcanicBiome(landscape.map),arid=isAridBiome(landscape.map)&&!volcanic,rocky=isRockyBiome(landscape.map),palette=terrainBiome(landscape.map).ground;
  const field=document.createElement('canvas');field.width=field.height=256;const fieldContext=field.getContext('2d'),pixels=fieldContext.createImageData(256,256),colors=palette.map(hex=>[1,3,5].map(at=>parseInt(hex.slice(at,at+2),16)));
  for(let row=0;row<256;row++)for(let column=0;column<256;column++){
    const wx=(column+.5)/256*size-half,wz=(row+.5)/256*size-half;
    const value=terrainMeadow(wx,wz,landscape.phase),patch=terrainMeadow(wx*2.1+41,wz*2.1-29,landscape.phase+.37);
    const mixed=Math.max(0,Math.min(1,value*.84+patch*.16)),a=mixed<.5?colors[2]:colors[0],b=mixed<.5?colors[0]:colors[1],blend=mixed<.5?mixed*2:(mixed-.5)*2,index=(row*256+column)*4;
    for(let component=0;component<3;component++)pixels.data[index+component]=a[component]+(b[component]-a[component])*blend;
    pixels.data[index+3]=255;
  }
  fieldContext.putImageData(pixels,0,0);ctx.drawImage(field,0,0,1536,1536);
  // Real elevation-derived shading: ridges catch warm light, lee slopes fall
  // into cool shadow, and steep faces expose bedrock. One merged texture.
  const clarity=terrainClarityPixels(landscape),res=clarity.resolution;
  const overlay=document.createElement('canvas');overlay.width=overlay.height=res;const overlayContext=overlay.getContext('2d');
  overlayContext.putImageData(new ImageData(clarity.relief,res,res),0,0);ctx.drawImage(overlay,0,0,1536,1536);
  overlayContext.putImageData(new ImageData(clarity.rock,res,res),0,0);ctx.drawImage(overlay,0,0,1536,1536);
  // Organic meadow grain & clover flecks instead of sharp block noise.
  const grain=winter?['#d6cf9312','#2f492212']:volcanic?['#7d6f6616','#211d1b16']:arid?['#e8d3a416','#8a6b3a14']:rocky?['#b9b8aa14','#3c3a3412']:['#bfd29916','#224a2412'];
  const grainScale=Math.max(.45,Math.min(1,320/size));
  for(let i=0;i<11000;i++){ctx.fillStyle=grain[i%2];const gx=rng()*1536,gy=rng()*1536,r=(.7+rng()*1.9)*grainScale;ctx.beginPath();ctx.arc(gx,gy,r,0,Math.PI*2);ctx.fill();}
  // Mossy humus carpets beneath forest groves so trees anchor into cool shaded earth.
  const sites=landscape.terrainSites;
  if(sites?.trees?.length){
    ctx.fillStyle=winter?'rgba(42,56,48,.16)':volcanic?'rgba(34,28,26,.22)':arid?'rgba(92,74,46,.18)':'rgba(22,40,18,.21)';
    for(const tree of sites.trees){
      const tx=(tree.x+half)*scale,ty=(tree.z+half)*scale,tr=2.8*scale;
      ctx.beginPath();ctx.arc(tx,ty,tr,0,Math.PI*2);ctx.fill();
    }
  }
  // Crushed bedrock scree and gravel beds beneath gold and stone mineral deposits.
  if(sites?.quarries?.length){
    for(const q of sites.quarries){
      const qx=(q.x+half)*scale,qy=(q.z+half)*scale,qr=(q.r*2.4+1.4)*scale;
      const g=ctx.createRadialGradient(qx,qy,qr*.15,qx,qy,qr);
      g.addColorStop(0,q.type==='gold'?'rgba(118,96,60,.62)':'rgba(116,118,110,.62)');
      g.addColorStop(.6,q.type==='gold'?'rgba(96,82,54,.30)':'rgba(98,100,92,.28)');
      g.addColorStop(1,'rgba(0,0,0,0)');
      ctx.fillStyle=g;ctx.beginPath();ctx.arc(qx,qy,qr,0,Math.PI*2);ctx.fill();
    }
  }
  // Packed dirt & cobblestone aprons around settlements and initial foundations.
  const aprons=[...landscape.settlements.map(s=>({x:s.x,z:s.z,r:9.2})),...(sites?.buildings||[]).map(b=>({x:b.x,z:b.z,r:b.r*1.55+1.2}))];
  for(const pad of aprons){
    const px=(pad.x+half)*scale,py=(pad.z+half)*scale,pr=pad.r*scale;
    const g=ctx.createRadialGradient(px,py,pr*.18,px,py,pr);
    g.addColorStop(0,winter?'rgba(155,156,144,.42)':volcanic?'rgba(116,104,96,.44)':arid?'rgba(168,144,104,.46)':'rgba(140,130,110,.44)');
    g.addColorStop(.55,winter?'rgba(108,112,102,.20)':volcanic?'rgba(64,54,48,.22)':'rgba(98,84,60,.22)');
    g.addColorStop(1,'rgba(0,0,0,0)');
    ctx.fillStyle=g;ctx.beginPath();ctx.arc(px,py,pr,0,Math.PI*2);ctx.fill();
  }
  for(const channel of landscape.channels()){
    const path=new Path2D();for(let z=-half;z<=half;z+=2){const x=channel.center+Math.sin(z*channel.frequency)*channel.bend;path.lineTo((x+half)*scale,(z+half)*scale);}
    ctx.lineCap='round';ctx.lineJoin='round';
    ctx.lineWidth=(channel.width*2+(winter?11:8))*scale;ctx.strokeStyle=winter?'rgba(84,96,92,.35)':arid?'rgba(104,80,48,.38)':'rgba(54,64,46,.38)';ctx.stroke(path);
    ctx.lineWidth=(channel.width*2+(winter?8:5))*scale;ctx.strokeStyle=winter?'#aeb7ab':arid?'#9b8156':'#64745a';ctx.stroke(path);
    ctx.lineWidth=(channel.width*2+(winter?5.5:3))*scale;ctx.strokeStyle=winter?'#b2b8aa':arid?'#c2a878':'#7b876b';ctx.stroke(path);
  }
  // Organic trade roads: packed earth shoulder, twin cart-wheel ruts and worn edge stones.
  for(const road of terrainRoadPaths(landscape)){
    const path=new Path2D();for(const point of road.points)path.lineTo((point.x+half)*scale,(point.z+half)*scale);
    ctx.lineCap='round';ctx.lineJoin='round';
    ctx.lineWidth=6.2*scale;ctx.strokeStyle=winter?'rgba(92,98,92,.30)':volcanic?'rgba(54,46,42,.36)':arid?'rgba(108,82,44,.34)':'rgba(68,58,38,.32)';ctx.stroke(path);
    ctx.lineWidth=3.5*scale;ctx.strokeStyle=winter?'#cfc8ae':volcanic?'#82756b':arid?'#d6ba84':rocky?'#b5ae9a':'#bfa87e';ctx.stroke(path);
    for(const offset of [-.62,.62]){
      const rut=traceOffsetRoad(road.points,offset,size,1536);
      ctx.lineWidth=.82*scale;ctx.strokeStyle=winter?'rgba(130,126,112,.45)':volcanic?'rgba(64,52,44,.48)':arid?'rgba(128,96,56,.46)':'rgba(94,76,50,.48)';ctx.stroke(rut);
    }
    ctx.lineWidth=.9*scale;ctx.strokeStyle=winter?'rgba(195,204,192,.32)':volcanic?'rgba(138,124,114,.28)':'rgba(138,148,96,.24)';ctx.stroke(path);
  }
  const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;texture.anisotropy=8;texture.userData.clarity=clarity.diagnostics;return texture;
}

function groundRelief(seed){
  const c=document.createElement('canvas');c.width=c.height=128;const ctx=c.getContext('2d'),rng=seededRandom(seed+11);
  ctx.fillStyle='#808080';ctx.fillRect(0,0,128,128);
  for(let i=0;i<4500;i++){const gray=70+Math.floor(rng()*120);ctx.strokeStyle=`rgb(${gray},${gray},${gray})`;const x=rng()*128,y=rng()*128;ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(x+.4,y+2+rng()*3);ctx.stroke();}
  const t=new THREE.CanvasTexture(c);t.wrapS=t.wrapT=THREE.RepeatWrapping;t.repeat.set(90,90);t.anisotropy=4;return t;
}

export function buildLandscape(view){
  const land=view.landscape,segments=view.settings.quality==='low'?112:160,material=standardMaterial({map:null,bumpMap:groundRelief(land.seed),bumpScale:.09,roughness:1});
  const entities=view.sim?.entities||[];
  land.terrainSites={
    trees:entities.filter(e=>e.hp>0&&e.type==='wood').map(e=>({x:e.x,z:e.z})),
    quarries:entities.filter(e=>e.hp>0&&e.kind==='resource'&&(e.type==='gold'||e.type==='stone')).map(e=>({x:e.x,z:e.z,type:e.type,r:e.r||1.6})),
    buildings:entities.filter(e=>e.hp>0&&e.kind==='building'&&!['farm','wall'].includes(e.type)).map(e=>({x:e.x,z:e.z,r:e.r||2.4,type:e.type})),
  };
  material.map=groundMap(land);
  const geometry=land.geometry(land.renderSize,segments),details=prepareTerrainGeometry(geometry,land);
  geometry.setAttribute('terrainMix',new THREE.BufferAttribute(details.weights,3));view.terrainDiagnostics=details.diagnostics;
  applyGroundSurface(material,land,view.settings.quality);
  const ground=new THREE.Mesh(geometry,material);ground.receiveShadow=true;ground.userData.landscape=true;view.terrain.add(ground);view.groundSurface=ground;
  view.waterMeshes=[];
  configureWaterSurface(view.materials.water);
  configureWaterPalette(view.materials.water,land.map);
  for(const channel of land.channels()){
    const water=new THREE.Mesh(land.waterGeometry(channel,view.settings.quality),view.materials.water);water.userData.channel=channel;view.terrain.add(water);view.waterMeshes.push(water);
  }
  buildBridges(view);
  // Match the ground triangulation at every quality setting.
  view.fogMesh.geometry.dispose();view.fogMesh.geometry=land.geometry(land.renderSize,segments,.13);view.fogMesh.rotation.set(0,0,0);view.fogMesh.position.y=0;
  const fogPositions=view.fogMesh.geometry.getAttribute('position'),fogUV=view.fogMesh.geometry.getAttribute('uv');
  for(let i=0;i<fogUV.count;i++)fogUV.setXY(i,(fogPositions.getX(i)+land.half)/land.worldSize,1-(fogPositions.getZ(i)+land.half)/land.worldSize);
  view.fogMesh.material.polygonOffset=true;view.fogMesh.material.polygonOffsetFactor=-1;view.fogMesh.material.polygonOffsetUnits=-1;
  view.groundCover=new GroundCover(view);
  view.terrainDetails=new TerrainDetails(view);
}

export function animateWater(view){
  animateWaterSurface(view);
}
