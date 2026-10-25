import * as THREE from 'three';
import {standardMaterial,nodeRuntime} from './render-runtime.js';
import {seededRandom} from './data.js';
import {insideMap} from './map-geometry.js';
import {GroundCover} from './ground-cover.js';
import {applyGroundSurface} from './surface-assets.js';
import {configureWaterSurface,animateWaterSurface} from './water-surface.js';
import {WATER_WAVE_BOUND} from './water-waves.js';
import {prepareTerrainGeometry,terrainRoadPaths} from './terrain-layout.js';
import {TerrainDetails} from './terrain-details.js';
import {terrainRelief} from './terrain-relief.js';
import {terrainBiome} from './terrain-biomes.js';
import {terrainGridAxis,terrainGridCoordinate} from './terrain-grid.js';
import {terrainMeadow} from './terrain-fields.js';
import {bridgeAt,bridgeDeckHeight,bridgeSpans,bridgeArtwork} from './bridge-layout.js';
import {buildBridges} from './bridge-art.js';

const smooth=(a,b,x)=>{const t=Math.max(0,Math.min(1,(x-a)/(b-a)));return t*t*(3-2*t);};
export class Landscape {
  constructor(seed,map,worldSize=160,settlements=null){this.worldSize=worldSize;this.half=worldSize/2;this.renderSize=worldSize*2;this.settlements=settlements||[{x:-37,z:30},{x:37,z:-30}];this.seed=seed;this.map=map;this.phase=seededRandom(seed+751)()*Math.PI*2;}
  channels(){return this.waterChannels??=(this.map==='coast'?[{center:0,width:14,frequency:.03,bend:2}]:this.map==='valley'?[{center:0,width:5,frequency:.045,bend:4}]:this.map==='rivers'?[-19,19].map(center=>({center,width:4,frequency:.045,bend:3})):[]);}
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
      if(span){const outward=Math.abs(x-span.center)-span.halfLength,bank=smooth(-2,-.5,outward)*(1-smooth(10,18,outward)),across=1-smooth(11.2,18,Math.abs(z));h+=(bridgeArtwork.baseHeight-h)*bank*across;}
    }
    // Keep every terrain triangle adjacent to the crossing below its lowest
    // paving. The collar covers the coarsest supported grid at every quality.
    const collar=Math.max(2,this.renderSize/112+1);
    for(const span of bridgeSpans(this.map)){const along=1-smooth(span.halfLength+collar,span.halfLength+collar+4,Math.abs(x-span.center)),across=1-smooth(11.2+collar,15.2+collar,Math.abs(z));h-=Math.max(0,h-(bridgeArtwork.baseHeight-.35))*along*across;}
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
    if(!span||Math.abs(z)>bridgeArtwork.roadHalfWidth+1e-6)return this.surfaceHeightAt(x,z);
    const distance=Math.abs(x-span.center);
    if(distance<=span.halfLength)return bridgeDeckHeight(span,x);
    const outer=span.center+Math.sign(x-span.center)*(span.halfLength+3),blend=smooth(0,3,distance-span.halfLength);
    return Math.max(this.surfaceHeightAt(x,z),bridgeArtwork.baseHeight+(this.surfaceHeightAt(outer,z)-bridgeArtwork.baseHeight)*blend);
  }
  walkableSampleAt(x,z,output){
    const span=bridgeAt(this.map,x,z,3),grid=this.grid;
    if(!grid||Math.abs(x)>this.worldSize||Math.abs(z)>this.worldSize||span&&Math.abs(z)<=bridgeArtwork.roadHalfWidth+1e-6){
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

function groundMap(landscape){
  const canvas=document.createElement('canvas');canvas.width=canvas.height=1536;
  const ctx=canvas.getContext('2d'),rng=seededRandom(landscape.seed+818),size=landscape.renderSize,half=size/2;
  const winter=landscape.map==='winter',palette=terrainBiome(landscape.map).ground;
  const field=document.createElement('canvas');field.width=field.height=256;const fieldContext=field.getContext('2d'),pixels=fieldContext.createImageData(256,256),colors=palette.map(hex=>[1,3,5].map(at=>parseInt(hex.slice(at,at+2),16)));
  for(let row=0;row<256;row++)for(let column=0;column<256;column++){
    const value=terrainMeadow((column+.5)/256*size-half,(row+.5)/256*size-half,landscape.phase),a=value<.5?colors[2]:colors[0],b=value<.5?colors[0]:colors[1],blend=value<.5?value*2:(value-.5)*2,index=(row*256+column)*4;
    for(let component=0;component<3;component++)pixels.data[index+component]=a[component]+(b[component]-a[component])*blend;
    pixels.data[index+3]=255;
  }
  fieldContext.putImageData(pixels,0,0);ctx.drawImage(field,0,0,1536,1536);
  for(let i=0;i<38000;i++){ctx.fillStyle=winter?(i%2?'#d6cf9320':'#2f492220'):(i%2?'#b8c9a822':'#254d2a1a');ctx.fillRect(rng()*1536,rng()*1536,1+rng()*3,1+rng()*4);}
  for(const channel of landscape.channels()){
    ctx.lineWidth=(channel.width*2+(winter?8:4))*1536/size;ctx.strokeStyle=winter?'#b2b8aa':'#7b876b';ctx.lineCap='round';ctx.beginPath();
    for(let z=-half;z<=half;z+=2){const x=channel.center+Math.sin(z*channel.frequency)*channel.bend;ctx.lineTo((x+half)/size*1536,(z+half)/size*1536);}ctx.stroke();
  }
  for(const road of terrainRoadPaths(landscape)){ctx.lineWidth=3*1536/size;ctx.strokeStyle='#b0a078';ctx.lineCap='round';ctx.lineJoin='round';ctx.beginPath();for(const point of road.points)ctx.lineTo((point.x+half)/size*1536,(point.z+half)/size*1536);ctx.stroke();}
  const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;texture.anisotropy=8;return texture;
}

function groundRelief(seed){
  const c=document.createElement('canvas');c.width=c.height=128;const ctx=c.getContext('2d'),rng=seededRandom(seed+11);
  ctx.fillStyle='#808080';ctx.fillRect(0,0,128,128);
  for(let i=0;i<4500;i++){const gray=70+Math.floor(rng()*120);ctx.strokeStyle=`rgb(${gray},${gray},${gray})`;const x=rng()*128,y=rng()*128;ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(x+.4,y+2+rng()*3);ctx.stroke();}
  const t=new THREE.CanvasTexture(c);t.wrapS=t.wrapT=THREE.RepeatWrapping;t.repeat.set(90,90);t.anisotropy=4;return t;
}

export function buildLandscape(view){
  const land=view.landscape,segments=view.settings.quality==='low'?112:160,material=standardMaterial({map:groundMap(land),bumpMap:groundRelief(land.seed),bumpScale:.09,roughness:1});
  const geometry=land.geometry(land.renderSize,segments),details=prepareTerrainGeometry(geometry,land);
  geometry.setAttribute('terrainMix',new THREE.BufferAttribute(details.weights,3));view.terrainDiagnostics=details.diagnostics;
  applyGroundSurface(material,land,view.settings.quality);
  const ground=new THREE.Mesh(geometry,material);ground.receiveShadow=true;ground.userData.landscape=true;view.terrain.add(ground);view.groundSurface=ground;
  view.waterMeshes=[];
  configureWaterSurface(view.materials.water);
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
