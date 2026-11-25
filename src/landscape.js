import * as THREE from 'three';
import {standardMaterial,nodeRuntime} from './render-runtime.js';
import {seededRandom} from './data.js';
import {insideMap} from './map-geometry.js';
import {GroundCover} from './ground-cover.js';
import {applyGroundSurface,retainedSurfaceTextures} from './surface-assets.js';
import {configureWaterSurface,configureWaterPalette,animateWaterSurface} from './water-surface.js';
import {WATER_WAVE_BOUND} from './water-waves.js';
import {prepareTerrainGeometry,terrainRoadPaths,strokeTaperedRoad,strokeCobblestoneRoad,paintSettlementPaving} from './terrain-layout.js';
import {TerrainDetails} from './terrain-details.js';
import {terrainRelief} from './terrain-relief.js';
import {terrainGridAxis,terrainGridCoordinate} from './terrain-grid.js';
import {terrainMeadow} from './terrain-fields.js';
import {terrainClarityPixels} from './terrain-clarity.js';
import {waterChannels,waterFords,fordAt} from './map-water.js';
import {isSnowBiome,isAridBiome,isRockyBiome,isVolcanicBiome,isJungleBiome,terrainBiome} from './terrain-biomes.js';
import {bridgeAt,bridgeDeckHeight,bridgeSpans,bridgeArtwork,bridgeRoadHalfWidth,bridgeOuterHalfWidth,spanZ,spanRoadHalfWidth,spanOuterHalfWidth} from './bridge-layout.js';
import {buildBridges} from './bridge-art.js';
import {shadeBattlefieldFog} from './fog-surface.js';
import {buildFrontierFeatures,updateFrontierFeatures} from './frontier-features.js';

const smooth=(a,b,x)=>{const t=Math.max(0,Math.min(1,(x-a)/(b-a)));return t*t*(3-2*t);};
export class Landscape {
  constructor(seed,map,worldSize=160,settlements=null,startingSites=null){this.worldSize=worldSize;this.half=worldSize/2;this.renderSize=worldSize*2;this.settlements=settlements||[{x:-37,z:30},{x:37,z:-30}];this.startingSites=startingSites;this.seed=seed;this.map=map;this.phase=seededRandom(seed+751)()*Math.PI*2;}
  channels(){return this.waterChannels??=waterChannels(this.map);}
  heightAt(x,z){
    const p=this.phase;
    let h=terrainRelief(this.map,x,z,p);
    let settleBlend=1;
    for(const point of this.settlements){
      const dx=x-point.x,dz=z-point.z,d=Math.hypot(dx,dz);
      if(d<72){
        const angle=Math.atan2(dz,dx),warp=1+.15*Math.sin(angle*2+p)+.10*Math.cos(angle*3-p);
        settleBlend=Math.min(settleBlend,smooth(12,48,d*warp));
      }
    }
    h=.65+(h-.65)*settleBlend;
    for(const channel of this.channels()){
      const d=Math.abs(x-channel.center-Math.sin(z*channel.frequency)*channel.bend);
      // The water mesh and naval navigation end at the same channel width.
      // Meet water level there instead of leaving a submerged "dry" bank.
      if(d<channel.width){
        const baseBed=-1.3+1.38*smooth(Math.max(0,channel.width-3),channel.width,d);
        const sandbar=(this.map==='coast'||this.map==='archipelago'||this.map==='templelagoon')?Math.sin(z*.085+channel.center)*Math.cos(x*.21)*.20*(1-smooth(Math.max(0,channel.width-3.2),channel.width-.4,d)):0;
        let bed=Math.min(.08,baseBed+sandbar);
        // Crossable shallow river fords raise the riverbed smoothly to an ankle-deep pebble shoal!
        const ford=fordAt(this.map,x,z,3.5);
        if(ford){
          const fBlend=1-smooth(ford.halfWidth*.55,ford.halfWidth+3.5,Math.abs(z-ford.z));
          bed=bed+(-0.11-bed)*fBlend;
        }
        h=bed;
      }
      else if(d<channel.width+6)h=.08+(Math.max(.3,h)-.08)*smooth(channel.width,channel.width+6,d);
      for(const span of bridgeSpans(this.map)){
        if(Math.abs(span.center-channel.center)>10)continue;
        const cz=spanZ(span),outerW=spanOuterHalfWidth(span);
        const outward=Math.abs(x-span.center)-span.halfLength,bank=smooth(-2,-.5,outward)*(1-smooth(10,18,outward)),across=1-smooth(outerW,outerW+6.8,Math.abs(z-cz));
        const deckBase=span.style==='timber'?1.45:bridgeArtwork.baseHeight;
        h+=(deckBase-h)*bank*across;
      }
    }
    // Keep every terrain triangle adjacent to the crossing below its lowest
    // paving. The collar covers the coarsest supported grid at every quality.
    const collar=Math.max(2,this.renderSize/112+1);
    for(const span of bridgeSpans(this.map)){
      const cz=spanZ(span),outerW=spanOuterHalfWidth(span),deckBase=span.style==='timber'?1.45:bridgeArtwork.baseHeight;
      const along=1-smooth(span.halfLength+collar,span.halfLength+collar+4,Math.abs(x-span.center)),across=1-smooth(outerW+collar,outerW+4+collar,Math.abs(z-cz));
      h-=Math.max(0,h-(deckBase-.35))*along*across;
    }
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
    if(!span||Math.abs(z-spanZ(span))>spanRoadHalfWidth(span)+1e-6)return this.surfaceHeightAt(x,z);
    const distance=Math.abs(x-span.center),deckBase=span.style==='timber'?1.45:bridgeArtwork.baseHeight;
    if(distance<=span.halfLength)return bridgeDeckHeight(span,x);
    const outer=span.center+Math.sign(x-span.center)*(span.halfLength+3),blend=smooth(0,3,distance-span.halfLength);
    return Math.max(this.surfaceHeightAt(x,z),deckBase+(this.surfaceHeightAt(outer,z)-deckBase)*blend);
  }
  walkableSampleAt(x,z,output){
    const span=bridgeAt(this.map,x,z,3),grid=this.grid;
    if(!grid||Math.abs(x)>this.worldSize||Math.abs(z)>this.worldSize||span&&Math.abs(z-spanZ(span))<=spanRoadHalfWidth(span)+1e-6){
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
    const vertices=[],uv=[],depth=[],shore=[],pier=[],indices=[],across=quality==='low'?8:Math.max(8,Math.ceil(channel.width*2/1.4)),length=this.worldSize/2;
    const span=bridgeSpans(this.map).find(s=>s.center===channel.center);
    // Give the shallow water more samples without adding rows or triangles.
    const offsets=Array.from({length:across+1},(_,col)=>{
      const u=2*col/across-1;
      return channel.width*u*(1+.44*(1-Math.abs(u)));
    });
    for(let row=0;row<=length;row++){const z=-this.half+row*2,mid=channel.center+Math.sin(z*channel.frequency)*channel.bend;
      for(const offset of offsets){
        const x=mid+offset;vertices.push(x,.08,z);uv.push(1+offset/channel.width,row*.07);
        depth.push(Math.max(0,.08-this.surfaceHeightAt(x,z)));shore.push(channel.width-Math.abs(offset));
        let wake=0;
        if(span&&z>-bridgeOuterHalfWidth-3.5&&z<bridgeOuterHalfWidth+9.5){
          // Bridge stone piers sit at +-halfLength*.48 and abutments at +-halfLength*.92; emit animated wake downstream (+z).
          for(const px of [span.center-span.halfLength*.48,span.center+span.halfLength*.48,span.center-span.halfLength*.90,span.center+span.halfLength*.90]){
            const dx=Math.abs(x-px),dz=z-bridgeOuterHalfWidth*.35;
            const spread=dz>0?1.35+dz*.26:1.35;
            const along=dz>0?Math.max(0,1-dz/9.0):Math.max(0,1-Math.abs(dz)/4.2);
            const acrossW=Math.max(0,1-dx/spread);
            wake=Math.max(wake,acrossW*acrossW*along);
          }
        }
        pier.push(wake);
      }
    }
    for(let row=0;row<length;row++)for(let col=0;col<across;col++){const a=row*(across+1)+col,b=a+across+1;indices.push(a,b,a+1,b,b+1,a+1);}
    const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3));geo.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));geo.setAttribute('frontierWaterDepth',new THREE.Float32BufferAttribute(depth,1));geo.setAttribute('frontierWaterShore',new THREE.Float32BufferAttribute(shore,1));geo.setAttribute('frontierWaterPier',new THREE.Float32BufferAttribute(pier,1));geo.setIndex(indices);geo.computeVertexNormals();
    geo.computeBoundingBox();geo.boundingBox.min.y-=WATER_WAVE_BOUND;geo.boundingBox.max.y+=WATER_WAVE_BOUND;
    geo.computeBoundingSphere();geo.boundingSphere.radius+=WATER_WAVE_BOUND;return geo;
  }
}

function groundMap(landscape){
  const canvas=document.createElement('canvas');canvas.width=canvas.height=1536;
  const ctx=canvas.getContext('2d'),rng=seededRandom(landscape.seed+818),size=landscape.renderSize,half=size/2;
  const winter=isSnowBiome(landscape.map),arid=isAridBiome(landscape.map),rocky=isRockyBiome(landscape.map),palette=terrainBiome(landscape.map).ground;
  const field=document.createElement('canvas');field.width=field.height=256;const fieldContext=field.getContext('2d'),pixels=fieldContext.createImageData(256,256),colors=palette.map(hex=>[1,3,5].map(at=>parseInt(hex.slice(at,at+2),16)));
  for(let row=0;row<256;row++)for(let column=0;column<256;column++){
    const value=terrainMeadow((column+.5)/256*size-half,(row+.5)/256*size-half,landscape.phase),a=value<.5?colors[2]:colors[0],b=value<.5?colors[0]:colors[1],blend=value<.5?value*2:(value-.5)*2,index=(row*256+column)*4;
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
  // Coherent, restrained grain: the old 38k single-pixel speckles read as mud.
  const volcanicGround=isVolcanicBiome(landscape.map);
  const grain=winter?['#d6cf9310','#2f492210']:arid?['#e8d3a414','#8a6b3a12']:rocky?['#b9b8aa12','#3c3a3410']:['#c3d2a912','#254d2a0e'];
  for(let i=0;i<9000;i++){ctx.fillStyle=grain[i%2];ctx.fillRect(rng()*1536,rng()*1536,1+rng()*2,1+rng()*3);}
  // Natural feathered biome mottling (sunlit clover clearings, mossy woodland glades,
  // warm dune drifts, glacial snowbanks & dark volcanic ash pockets) for organic realism!
  const patchPalette=winter?['rgba(238,246,252,0.16)','rgba(148,176,188,0.14)']
    :volcanicGround?['rgba(128,88,66,0.14)','rgba(32,26,24,0.18)']
    :arid?['rgba(236,204,142,0.17)','rgba(156,118,68,0.14)']
    :rocky?['rgba(154,174,126,0.14)','rgba(92,108,82,0.13)']
    :['rgba(154,202,98,0.13)','rgba(46,94,44,0.12)'];
  for(let i=0;i<44;i++){
    const px=rng()*1536,py=rng()*1536,rad=48+rng()*128;
    const grad=ctx.createRadialGradient(px,py,rad*.08,px,py,rad);
    grad.addColorStop(0,patchPalette[i%2]);
    grad.addColorStop(1,'rgba(0,0,0,0)');
    ctx.fillStyle=grad;ctx.beginPath();ctx.arc(px,py,rad,0,Math.PI*2);ctx.fill();
  }
  const scale=1536/size;
  const shore=landscape.map==='coast'||landscape.map==='archipelago'||landscape.map==='templelagoon';
  const jungle=isJungleBiome(landscape.map);
  for(const channel of landscape.channels()){
    ctx.lineCap='round';ctx.lineJoin='round';
    // Warm sunlit AoE2:DE golden sandy riverbanks & coastal coves across all temperate/tropical waterways!
    const bankBands=winter
      ? [[11,'#a8b6b4'],[6.5,'#cfdcd8']]
      : volcanicGround
        ? [[10,'#544a44'],[5.5,'#6b5e54']]
        : arid
          ? [[12,'#b89862'],[7.0,'#dfc58e']]
          : shore
            ? (jungle?[[17,'#dcc480'],[11.5,'#f7ecc0'],[5.0,'#e2cd96']]:[[15.5,'#d4bd82'],[10.2,'#f2e4b6'],[4.4,'#dcc894']])
            : [[12.5,'#c8b57c'],[8.0,'#eee0b2'],[3.6,'#d8c490']];
    for(const [extra,color] of bankBands){
      ctx.beginPath();
      for(let z=-half;z<=half;z+=3){
        const cx=channel.center+Math.sin(z*channel.frequency)*channel.bend;
        const cove=Math.sin(z*.11+channel.center*.7)*2.0+Math.cos(z*.23-channel.center*.4)*1.0+Math.sin(z*.15+1.3)*.65;
        const px=(cx+channel.width+extra*.5+cove+half)/size*1536,py=(z+half)/size*1536;
        if(z===-half)ctx.moveTo(px,py);else ctx.lineTo(px,py);
      }
      for(let z=half;z>=-half;z-=3){
        const cx=channel.center+Math.sin(z*channel.frequency)*channel.bend;
        const cove=Math.sin(z*.11+channel.center*.7)*2.0+Math.cos(z*.23-channel.center*.4)*1.0-Math.sin(z*.15-1.3)*.65;
        ctx.lineTo((cx-channel.width-extra*.5-cove+half)/size*1536,(z+half)/size*1536);
      }
      ctx.closePath();ctx.fillStyle=color;ctx.fill();
    }
  }
  // Paint bright sandy/pebbly shallow river fords clearly across walkable crossings!
  for(const ford of waterFords(landscape.map)){
    const ch=landscape.channels().find(c=>c.center===ford.center);
    const mid=ch?ch.center+Math.sin(ford.z*ch.frequency)*ch.bend:ford.center;
    const fx=(mid+half)*scale,fz=(ford.z+half)*scale,fw=ford.halfLength*1.15*scale,fh=ford.halfWidth*1.05*scale;
    const grad=ctx.createRadialGradient(fx,fz,fh*.15,fx,fz,Math.max(fw,fh));
    grad.addColorStop(0,winter?'rgba(202,216,214,0.88)':jungle?'rgba(238,228,182,0.92)':'rgba(226,210,164,0.92)');
    grad.addColorStop(.68,winter?'rgba(176,196,198,0.62)':jungle?'rgba(202,222,180,0.62)':'rgba(194,184,142,0.60)');
    grad.addColorStop(1,'rgba(180,170,132,0)');
    ctx.save();ctx.translate(fx,fz);ctx.scale(fw/Math.max(fw,fh),fh/Math.max(fw,fh));
    ctx.fillStyle=grad;ctx.beginPath();ctx.arc(0,0,Math.max(fw,fh),0,Math.PI*2);ctx.fill();ctx.restore();
  }
  // Warm sunlit medieval cobblestone trade roads with packed ochre shoulders & broken flagstone edges!
  const volcanic=isVolcanicBiome(landscape.map);
  const roadShoulder=volcanic?[48,42,39]:winter?[156,166,164]:arid?[166,132,82]:[158,128,80];
  const roadTrack=volcanic?[92,80,72]:winter?[202,210,206]:arid?[214,182,126]:rocky?[198,178,136]:[214,184,126];
  const cobbleRgb=volcanic?[116,106,100]:winter?[208,216,220]:arid?[222,196,148]:[212,200,172];
  for(const road of terrainRoadPaths(landscape)){
    const wheelSpacing=road.local?.57:.79,wheelWidth=road.local?.37:.48;
    strokeTaperedRoad(ctx,road.points,{half,size,canvasSize:1536,connected:road.connected,layers:[
      {width:(road.local?3.6:5.2)*scale,rgba:t=>`rgba(${roadShoulder[0]},${roadShoulder[1]},${roadShoulder[2]},${(.38*t).toFixed(3)})`},
      {width:(road.local?2.3:3.2)*scale,rgba:t=>`rgba(${roadTrack[0]},${roadTrack[1]},${roadTrack[2]},${(.86*t).toFixed(3)})`},
      ...[-wheelSpacing,wheelSpacing].map(offset=>({width:wheelWidth*scale,offset:offset*scale,rgba:t=>`rgba(${roadShoulder[0]},${roadShoulder[1]},${roadShoulder[2]},${(.48*t).toFixed(3)})`})),
    ],gravelColor:a=>`rgba(${roadTrack[0]},${roadTrack[1]},${roadTrack[2]},${a.toFixed(3)})`});
    strokeCobblestoneRoad(ctx,road.points,{half,size,canvasSize:1536,connected:road.connected,local:road.local,mask:false,seed:landscape.seed,stoneRgb:cobbleRgb});
  }
  paintSettlementPaving(ctx,landscape,half,scale);
  const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;texture.anisotropy=8;texture.userData.clarity=clarity.diagnostics;return texture;
}

function groundRelief(seed){
  const c=document.createElement('canvas');c.width=c.height=128;const ctx=c.getContext('2d'),rng=seededRandom(seed+11);
  ctx.fillStyle='#808080';ctx.fillRect(0,0,128,128);
  for(let i=0;i<4500;i++){const gray=70+Math.floor(rng()*120);ctx.strokeStyle=`rgb(${gray},${gray},${gray})`;const x=rng()*128,y=rng()*128;ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(x+.4,y+2+rng()*3);ctx.stroke();}
  const t=new THREE.CanvasTexture(c);t.wrapS=t.wrapT=THREE.RepeatWrapping;t.repeat.set(90,90);t.anisotropy=4;return t;
}

function buildGroundMaterial(view){
  const land=view.landscape,material=standardMaterial({map:groundMap(land),bumpMap:groundRelief(land.seed),bumpScale:.09,roughness:1});
  applyGroundSurface(material,land,view.settings.quality,view.atmosphereUniforms);
  view.battleFog.scale.value=1/land.worldSize;
  shadeBattlefieldFog(material,view);
  return material;
}

export function refreshGroundSurface(view){
  const ground=view.groundSurface;
  if(!ground||!view.landscape)return false;
  const previous=ground.material;
  const retained=new Set([view.fogTexture,...retainedSurfaceTextures()]);
  ground.material=buildGroundMaterial(view);
  if(previous&&previous!==ground.material){
    for(const key of ['map','bumpMap','normalMap','roughnessMap'])if(previous[key]&&!retained.has(previous[key]))previous[key].dispose();
    for(const texture of previous.frontierOwnedTextures||[])texture.dispose();
    previous.dispose();
  }
  return true;
}

export function buildLandscape(view){
  const land=view.landscape,segments=view.settings.quality==='low'?112:160,material=buildGroundMaterial(view);
  const geometry=land.geometry(land.renderSize,segments),details=prepareTerrainGeometry(geometry,land);
  geometry.setAttribute('terrainMix',new THREE.BufferAttribute(details.weights,3));view.terrainDiagnostics=details.diagnostics;
  const ground=new THREE.Mesh(geometry,material);ground.receiveShadow=true;ground.userData.landscape=true;view.terrain.add(ground);view.groundSurface=ground;
  view.waterMeshes=[];
  if(!view.materials.water.frontierWaveTime){configureWaterSurface(view.materials.water);shadeBattlefieldFog(view.materials.water,view);}
  configureWaterPalette(view.materials.water,land.map);
  for(const channel of land.channels()){
    const water=new THREE.Mesh(land.waterGeometry(channel,view.settings.quality),view.materials.water);water.userData.channel=channel;view.terrain.add(water);view.waterMeshes.push(water);
  }
  buildBridges(view);
  view.groundCover=new GroundCover(view);
  shadeBattlefieldFog(view.groundCover.mesh.material,view);
  view.terrainDetails=new TerrainDetails(view);
  for(const mat of view.terrainDetails.fogMaterials||[view.terrainDetails.mesh.material])shadeBattlefieldFog(mat,view);
  buildFrontierFeatures(view);
}

export function animateWater(view){
  animateWaterSurface(view);
  updateFrontierFeatures(view);
}
