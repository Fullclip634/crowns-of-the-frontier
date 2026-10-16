import * as THREE from 'three';
import {seededRandom} from './data.js';
import {insideMap} from './map-geometry.js';
import {GroundCover} from './ground-cover.js';
import {applyGroundSurface} from './surface-assets.js';
import {configureWaterSurface,animateWaterSurface} from './water-surface.js';
import {WATER_WAVE_BOUND} from './water-waves.js';
import {prepareTerrainGeometry} from './terrain-layout.js';
import {TerrainDetails} from './terrain-details.js';
import {terrainRelief} from './terrain-relief.js';

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
      if(this.map!=='coast'&&Math.abs(z)<=9&&d<channel.width+5){h=.72+(h-.72)*smooth(channel.width+2,channel.width+5,d);continue;}
      // The water mesh and naval navigation end at the same channel width.
      // Meet water level there instead of leaving a submerged "dry" bank.
      if(d<channel.width)h=-1.3+1.38*smooth(Math.max(0,channel.width-3),channel.width,d);
      else if(d<channel.width+6)h=.08+(Math.max(.3,h)-.08)*smooth(channel.width,channel.width+6,d);
    }
    const edge=Math.max(Math.abs(x),Math.abs(z)),rise=smooth(this.half-4,this.half+30,edge);
    const ridges=7+Math.pow(Math.sin(x*.043+p)*Math.cos(z*.037-p),2)*18+Math.sin((x+z)*.07)*2;
    h+=rise*ridges;
    return h;
  }
  geometry(size=this.renderSize,segments=160,offset=0){
    const geo=new THREE.PlaneGeometry(size,size,segments,segments);geo.rotateX(-Math.PI/2);
    const pos=geo.getAttribute('position');
    for(let i=0;i<pos.count;i++)pos.setY(i,this.heightAt(pos.getX(i),pos.getZ(i))+offset);
    if(size===this.renderSize&&offset===0){this.grid={segments,size,heights:Float32Array.from({length:pos.count},(_,i)=>pos.getY(i))};}
    pos.needsUpdate=true;geo.computeVertexNormals();geo.computeBoundingBox();geo.computeBoundingSphere();return geo;
  }
  surfaceHeightAt(x,z){
    const grid=this.grid;if(!grid||Math.abs(x)>this.worldSize||Math.abs(z)>this.worldSize)return this.heightAt(x,z);
    const xx=(x+this.worldSize)/grid.size*grid.segments,zz=(z+this.worldSize)/grid.size*grid.segments,ix=Math.min(grid.segments-1,Math.floor(xx)),iz=Math.min(grid.segments-1,Math.floor(zz)),u=xx-ix,v=zz-iz,stride=grid.segments+1,a=iz*stride+ix;
    const h00=grid.heights[a],h10=grid.heights[a+1],h01=grid.heights[a+stride],h11=grid.heights[a+stride+1];
    return u+v<=1?h00+u*(h10-h00)+v*(h01-h00):h11+(1-u)*(h01-h11)+(1-v)*(h10-h11);
  }
  rayPoint(ray){
    // Sample the actual triangulated surface; never command on an invisible y=0 plane.
    let previous=null;
    for(let distance=0;distance<=Math.max(400,this.renderSize*1.5);distance+=2){const x=ray.origin.x+ray.direction.x*distance,y=ray.origin.y+ray.direction.y*distance,z=ray.origin.z+ray.direction.z*distance;
      if(Math.abs(x)>this.worldSize||Math.abs(z)>this.worldSize){previous=null;continue;}
      const delta=y-this.surfaceHeightAt(x,z);
      if(delta<=0&&previous!==null){let lo=previous,hi=distance;for(let i=0;i<11;i++){const mid=(lo+hi)/2,xx=ray.origin.x+ray.direction.x*mid,zz=ray.origin.z+ray.direction.z*mid,yy=ray.origin.y+ray.direction.y*mid;if(yy>this.surfaceHeightAt(xx,zz))lo=mid;else hi=mid;}const point=ray.at((lo+hi)/2,new THREE.Vector3());return insideMap(point.x,point.z,this.worldSize)?point:null;}
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
  const colors={highlands:['#6e844a','#8f9959','#506f3a'],valley:['#718b4d','#a39d66','#486c3d'],rivers:['#71854d','#9c985f','#4a6b3e'],desert:['#b7a17a','#c7b68d','#998258'],winter:['#c5d0c3','#e1e3d5','#95ac9a'],canyon:['#9b866c','#b8a183','#726d52'],coast:['#768c52','#aaa271','#53783f']};
  const palette=colors[landscape.map]||colors.highlands;
  ctx.fillStyle=palette[0];ctx.fillRect(0,0,1536,1536);
  for(let i=0;i<160;i++){
    const x=rng()*1536,y=rng()*1536,r=30+rng()*150,g=ctx.createRadialGradient(x,y,0,x,y,r);
    g.addColorStop(0,palette[i%3]+'80');g.addColorStop(1,palette[i%3]+'00');ctx.fillStyle=g;ctx.fillRect(x-r,y-r,r*2,r*2);
  }
  for(let i=0;i<38000;i++){ctx.fillStyle=i%2?'#d6cf9320':'#2f492220';ctx.fillRect(rng()*1536,rng()*1536,1+rng()*3,1+rng()*4);}
  for(const channel of landscape.channels()){
    ctx.lineWidth=(channel.width*2+8)*1536/size;ctx.strokeStyle=landscape.map==='winter'?'#b2b8aa':'#aa9a72';ctx.lineCap='round';ctx.beginPath();
    for(let z=-half;z<=half;z+=2){const x=channel.center+Math.sin(z*channel.frequency)*channel.bend;ctx.lineTo((x+half)/size*1536,(z+half)/size*1536);}ctx.stroke();
  }
  for(const town of landscape.settlements){ctx.lineWidth=3*1536/size;ctx.strokeStyle='#b0a078';ctx.lineCap='round';ctx.beginPath();const end=landscape.map==='coast'?{x:Math.sign(town.x)*20,z:town.z}:{x:town.x*.2,z:0};for(const point of [town,{x:town.x+(end.x-town.x)*.3,z:town.z+(end.z-town.z)*.3},end])ctx.lineTo((point.x+half)/size*1536,(point.z+half)/size*1536);ctx.stroke();}
  const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;texture.anisotropy=8;return texture;
}

function groundRelief(seed){
  const c=document.createElement('canvas');c.width=c.height=128;const ctx=c.getContext('2d'),rng=seededRandom(seed+11);
  ctx.fillStyle='#808080';ctx.fillRect(0,0,128,128);
  for(let i=0;i<4500;i++){const gray=70+Math.floor(rng()*120);ctx.strokeStyle=`rgb(${gray},${gray},${gray})`;const x=rng()*128,y=rng()*128;ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(x+.4,y+2+rng()*3);ctx.stroke();}
  const t=new THREE.CanvasTexture(c);t.wrapS=t.wrapT=THREE.RepeatWrapping;t.repeat.set(90,90);t.anisotropy=4;return t;
}

export function buildLandscape(view){
  const land=view.landscape,segments=view.settings.quality==='low'?112:160,material=new THREE.MeshStandardMaterial({map:groundMap(land),bumpMap:groundRelief(land.seed),bumpScale:.09,roughness:1});
  const geometry=land.geometry(land.renderSize,segments),details=prepareTerrainGeometry(geometry,land);
  geometry.setAttribute('terrainMix',new THREE.BufferAttribute(details.weights,3));view.terrainDiagnostics=details.diagnostics;
  applyGroundSurface(material,land,view.settings.quality);
  const ground=new THREE.Mesh(geometry,material);ground.receiveShadow=true;ground.userData.landscape=true;view.terrain.add(ground);view.groundSurface=ground;
  view.waterMeshes=[];
  configureWaterSurface(view.materials.water);
  for(const channel of land.channels()){
    const water=new THREE.Mesh(land.waterGeometry(channel,view.settings.quality),view.materials.water);water.userData.channel=channel;view.terrain.add(water);view.waterMeshes.push(water);
    if(land.map!=='coast')buildBridge(view,channel);
  }
  // Match the ground triangulation at every quality setting.
  view.fogMesh.geometry.dispose();view.fogMesh.geometry=land.geometry(land.renderSize,segments,.13);view.fogMesh.rotation.set(0,0,0);view.fogMesh.position.y=0;
  const fogPositions=view.fogMesh.geometry.getAttribute('position'),fogUV=view.fogMesh.geometry.getAttribute('uv');
  for(let i=0;i<fogUV.count;i++)fogUV.setXY(i,(fogPositions.getX(i)+land.half)/land.worldSize,1-(fogPositions.getZ(i)+land.half)/land.worldSize);
  view.fogMesh.material.polygonOffset=true;view.fogMesh.material.polygonOffsetFactor=-1;view.fogMesh.material.polygonOffsetUnits=-1;
  view.groundCover=new GroundCover(view);
  view.terrainDetails=new TerrainDetails(view);
}

function buildBridge(view,channel){
  const g=new THREE.Group(),m=view.materials,x=channel.center,width=channel.width+3;
  view.box(g,m.wood,x,.54,0,width*2,.36,15.5);
  for(let z=-7.5;z<=7.5;z+=.65)view.box(g,m.darkwood,x,.745,z,width*2,.045,.06);
  for(const side of [-1,1]){
    view.box(g,m.stoneDark,x,1.18,side*7.4,width*2+.6,.3,.45);
    for(let xx=-width;xx<=width;xx+=2){view.box(g,m.stone,x+xx,.7,side*7.4,.5,1.3,.5);}
  }
  for(const xx of [-width+1,width-1])for(const z of [-6,6])view.box(g,m.stoneDark,x+xx,-.05,z,1.2,2.5,1.5);
  view.terrain.add(view.mergeModel(g));
}

export function animateWater(view){
  animateWaterSurface(view);
}
