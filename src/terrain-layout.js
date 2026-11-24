import {terrainMeadow,terrainNoise} from './terrain-fields.js';
import {isSnowBiome,isAridBiome,isRockyBiome,terrainBiome} from './terrain-biomes.js';
import {bridgeSpans,spanZ} from './bridge-layout.js';
import {channelAt,waterFords,fordAt} from './map-water.js';
import {seededRandom} from './data.js';

const smooth=(a,b,x)=>{const t=Math.max(0,Math.min(1,(x-a)/(b-a)));return t*t*(3-2*t);};

function cartRoad(land,town,end,local=false,connected=false){
  const start={x:town.x,z:town.z},finish={x:end.x,z:end.z},dx=end.x-town.x,dz=end.z-town.z,length=Math.hypot(dx,dz);
  if(length<1)return null;
  const phase=Math.floor(land.phase*1048576),seed=terrainNoise(town.x*.037+18,town.z*.037-9,phase),wave=terrainNoise(town.x*.052-11,town.z*.052+7,phase^0x4ad7);
  const amplitude=Math.min(9,local?length*.1:Math.max(3,length*.035))*(.82+Math.abs(seed)*.2);
  const side=seed<0?-1:1,count=local?Math.max(4,Math.ceil(length/2)):Math.max(12,Math.min(28,Math.ceil(length/14))),points=[start],segments=[];
  for(let i=1;i<count;i++){
    const t=i/count,envelope=Math.sin(Math.PI*t),lateral=envelope*(side*amplitude+Math.sin(t*Math.PI*2+wave*1.6)*Math.min(2.4,amplitude*.28));
    points.push({x:town.x+dx*t-dz/length*lateral,z:town.z+dz*t+dx/length*lateral});
  }
  points.push(finish);
  for(let i=0;i<count;i++){
    const a=points[i],b=points[i+1],sx=b.x-a.x,sz=b.z-a.z;
    segments.push({x:a.x,z:a.z,dx:sx,dz:sz,length:sx*sx+sz*sz});
  }
  return {start,end:finish,points,segments,local,connected};
}

const defaultRoadEnd=(land,town)=>land.map==='coast'?{x:Math.sign(town.x)*20,z:town.z}:{x:town.x*.2,z:0};

function dryRoad(land,road){
  if(!road)return false;
  for(const segment of road.segments){
    const count=Math.ceil(Math.sqrt(segment.length));
    for(let step=0;step<=count;step++){
      const t=step/count,x=segment.x+t*segment.dx,z=segment.z+t*segment.dz;
      if(Math.abs(x)>land.half||Math.abs(z)>land.half||(channelAt(land.map,x,z)&&!fordAt(land.map,x,z)))return false;
    }
  }
  return true;
}

export function terrainRoadPaths(land){
  if(land.roadPaths)return land.roadPaths;
  if(!land.startingSites)return land.roadPaths=land.settlements
    .map(town=>cartRoad(land,town,defaultRoadEnd(land,town))).filter(Boolean);
  const roads=[],spans=bridgeSpans(land.map),fords=waterFords(land.map);
  for(const town of land.startingSites.filter(site=>site.type==='towncenter')){
    const approaches=[
      ...spans.map(span=>({x:span.center+Math.sign(town.x-span.center)*(span.halfLength+1.5),z:spanZ(span)})),
      ...fords.map(ford=>({x:ford.center+Math.sign(town.x-ford.center)*(ford.halfLength+2),z:ford.z})),
    ];
    approaches.sort((a,b)=>Math.hypot(a.x-town.x,a.z-town.z)-Math.hypot(b.x-town.x,b.z-town.z));
    if(!approaches.length&&land.map!=='coast')approaches.push(defaultRoadEnd(land,town));
    let connected=0;
    for(const end of approaches){
      const outlet=cartRoad(land,town,end,false,spans.length>0||fords.length>0);
      if(dryRoad(land,outlet)){roads.push(outlet);connected++;if(connected>=2)break;}
    }
    for(const site of land.startingSites){
      if(site===town||site.owner!==town.owner)continue;
      const road=cartRoad(land,town,site,true,true);
      if(dryRoad(land,road))roads.push(road);
    }
  }
  return land.roadPaths=roads;
}

export function paintSettlementPaving(ctx,land,half,scale,mask=false){
  const color=terrainBiome(land.map).plaza,r=color>>16,g=color>>8&255,b=color&255;
  const soil=mask?'196,0,0':`${Math.round(r*.72)},${Math.round(g*.65)},${Math.round(b*.52)}`;
  for(const site of land.startingSites||[]){
    if(site.type==='dock')continue;
    const radius=site.r+(site.type==='towncenter'?1.65:.95),size=2*radius;
    const cx=(site.x+half)*scale,cz=(site.z+half)*scale,wear=(radius+1.4)*scale;
    const packed=ctx.createRadialGradient(cx,cz,0,cx,cz,wear);
    for(const [stop,alpha] of [[0,.87],[.5,.76],[.78,.36],[1,0]]){
      packed.addColorStop(stop,`rgba(${soil},${mask?alpha*.42:alpha})`);
    }
    ctx.fillStyle=packed;
    ctx.fillRect(cx-wear,cz-wear,wear*2,wear*2);
    const rows=Math.ceil(size/1.03),columns=Math.ceil(size/1.32),tileX=size/columns,tileZ=size/rows;
    const random=seededRandom(land.seed^Math.imul(Math.round(site.x*128),73856093)^Math.imul(Math.round(site.z*128),19349663));
    for(let row=0;row<rows;row++)for(let column=-1;column<columns;column++){
      const shift=row%2*.47,start=Math.max(0,column+shift),end=Math.min(columns,column+1+shift);
      if(end-start<.25)continue;
      const x=Math.abs((start+end)*.5*tileX-radius),z=Math.abs((row+.5)*tileZ-radius);
      const edge=radius-Math.max(x,z)-Math.max(0,Math.min(x,z)-radius*.48)*.5;
      const coverage=smooth(0,.72,edge+(random()-.5)*.72);
      if(coverage<.12)continue;
      const grout=.10+random()*.065,shade=.48+random()*.13,vein=(random()-.5)*7;
      const left=(site.x-radius+start*tileX+grout*.5+half)*scale,right=(site.x-radius+end*tileX-grout*.5+half)*scale;
      const top=(site.z-radius+row*tileZ+grout*.5+half)*scale,bottom=(site.z-radius+(row+1)*tileZ-grout*.5+half)*scale;
      const chip=Math.min(right-left,bottom-top)*(.09+random()*.2),alpha=Math.min(1,coverage*1.3).toFixed(2);
      ctx.fillStyle=mask?`rgba(255,0,0,${alpha})`:`rgba(${Math.round(r*shade+vein)},${Math.round(g*shade+vein*.4)},${Math.round(b*shade-vein*.65)},${alpha})`;
      ctx.beginPath();
      ctx.moveTo(left+chip,top);
      ctx.lineTo(right-chip*.7,top);
      ctx.lineTo(right,top+chip);
      ctx.lineTo(right,bottom-chip*.65);
      ctx.lineTo(right-chip,bottom);
      ctx.lineTo(left+chip*.6,bottom);
      ctx.lineTo(left,bottom-chip);
      ctx.lineTo(left,top+chip*.7);
      ctx.fill();
    }
  }
}

export function strokeTaperedRoad(ctx,points,{half,size,canvasSize,layers,gravelColor=null,connected=false}){
  if(!points||points.length<2)return;
  const scale=canvasSize/size,cum=[0];
  for(let i=1;i<points.length;i++)cum.push(cum[i-1]+Math.hypot(points[i].x-points[i-1].x,points[i].z-points[i-1].z));
  const total=cum[cum.length-1]||1,fadeStart=Math.min(total*.08,2.5),fadeEnd=Math.min(total*.30,13.5);
  const toPx=p=>[(p.x+half)*scale,(p.z+half)*scale];
  const prevCap=ctx.lineCap,prevJoin=ctx.lineJoin;
  ctx.lineCap='butt';ctx.lineJoin='round';
  for(const {width,rgba,median,offset=0}of layers){
    for(let i=0;i<points.length-1;i++){
      const a=points[i],b=points[i+1],segLen=cum[i+1]-cum[i],sub=Math.max(1,Math.ceil(segLen/2.5));
      for(let s=0;s<sub;s++){
        const dMid=cum[i]+segLen*((s+.5)/sub),dStart=Math.min(1,dMid/Math.max(fadeStart,.01));
        const dEnd=Math.max(0,Math.min(1,(total-dMid)/Math.max(fadeEnd,.01)));
        const taper=connected?1:dEnd*dEnd*(3-2*dEnd)*(.6+.4*dStart);
        if(taper<=.02)continue;
        const u0=s/sub,u1=(s+1)/sub,p0={x:a.x+(b.x-a.x)*u0,z:a.z+(b.z-a.z)*u0},p1={x:a.x+(b.x-a.x)*u1,z:a.z+(b.z-a.z)*u1};
        const [x0,y0]=toPx(p0),[x1,y1]=toPx(p1);
        ctx.strokeStyle=rgba(taper,median);ctx.lineWidth=width*(.32+.68*taper);
        const dx=-(b.z-a.z)*offset/segLen,dz=(b.x-a.x)*offset/segLen;
        ctx.beginPath();ctx.moveTo(x0+dx,y0+dz);ctx.lineTo(x1+dx,y1+dz);ctx.stroke();
      }
    }
  }
  if(gravelColor){
    ctx.lineCap='round';
    const tail=points[points.length-1],prev=points[points.length-2],[ex,ey]=toPx(tail),[nx,ny]=toPx(prev);
    const dx=ex-nx,dy=ey-ny,len=Math.hypot(dx,dy)||1;
    for(let d=0;d<9;d++){
      const h=Math.sin((tail.x+d*3.1)*17.3+(tail.z-d*2.7)*31.7)*43758.5453,r=h-Math.floor(h);
      const gx=ex-(dx/len)*(r*5.5)*scale+(r-.5)*4.2*scale,gy=ey-(dy/len)*(r*5.5)*scale+(Math.cos(d*2.1)-.5)*3.4*scale;
      ctx.strokeStyle=gravelColor(.16+r*.28);ctx.lineWidth=(.75+r*.85)*scale;
      ctx.beginPath();ctx.moveTo(gx,gy);ctx.lineTo(gx+.18*scale,gy+.18*scale);ctx.stroke();
    }
  }
  ctx.lineCap=prevCap;ctx.lineJoin=prevJoin;
}

const ROAD_BUCKET_SIZE=12,ROAD_SAMPLE_RADIUS=4;
const roadCell=(x,z)=>x*1024+z;

function indexRoads(segments){
  const buckets=new Map();
  for(const road of segments){
    const minX=Math.floor((Math.min(road.x,road.x+road.dx)-ROAD_SAMPLE_RADIUS)/ROAD_BUCKET_SIZE);
    const maxX=Math.floor((Math.max(road.x,road.x+road.dx)+ROAD_SAMPLE_RADIUS)/ROAD_BUCKET_SIZE);
    const minZ=Math.floor((Math.min(road.z,road.z+road.dz)-ROAD_SAMPLE_RADIUS)/ROAD_BUCKET_SIZE);
    const maxZ=Math.floor((Math.max(road.z,road.z+road.dz)+ROAD_SAMPLE_RADIUS)/ROAD_BUCKET_SIZE);
    for(let x=minX;x<=maxX;x++)for(let z=minZ;z<=maxZ;z++){
      const key=roadCell(x,z);
      if(!buckets.has(key))buckets.set(key,[]);
      buckets.get(key).push(road);
    }
  }
  return buckets;
}

export function roadDistance(x,z,land,within=Infinity){
  const segments=land.roadSegments??=terrainRoadPaths(land).flatMap(road=>road.segments);
  let candidates=segments;
  if(within<=ROAD_SAMPLE_RADIUS){
    const buckets=land.roadBuckets??=indexRoads(segments),key=roadCell(Math.floor(x/ROAD_BUCKET_SIZE),Math.floor(z/ROAD_BUCKET_SIZE));
    candidates=buckets.get(key);
  }
  if(!candidates)return Infinity;
  let squaredDistance=Infinity;
  for(const road of candidates){
    const t=Math.max(0,Math.min(1,((x-road.x)*road.dx+(z-road.z)*road.dz)/road.length)),dx=x-road.x-t*road.dx,dz=z-road.z-t*road.dz;
    squaredDistance=Math.min(squaredDistance,dx*dx+dz*dz);
  }
  return squaredDistance<=within*within?Math.sqrt(squaredDistance):Infinity;
}

export function terrainWeights(land,x,y,z,normalY=1){
  const road=1-smooth(1.2,2.8,roadDistance(x,z,land,2.8)),slope=1-Math.max(0,normalY);
  const patch=terrainMeadow(x,z,land.phase);
  const settlements=land.settlements||[],townDist=settlements.length?Math.min(...settlements.map(s=>Math.hypot(x-s.x,z-s.z))):Infinity;
  const campIrregular=(terrainMeadow(x*2.1+17,z*2.1-11,land.phase)-.5)*9+Math.sin(x*.31-z*.27)*2.8;
  const campZone=1-smooth(9,25,townDist+campIrregular);
  const shoreSpan=land.map==='archipelago'?7.2:land.map==='coast'?5.2:4;
  let bank=0;for(const channel of land.channels()){
    const distance=Math.abs(x-channel.center-Math.sin(z*channel.frequency)*channel.bend)-channel.width;
    if(distance>=0)bank=Math.max(bank,1-smooth(.2,shoreSpan,distance));
  }
  const winter=isSnowBiome(land.map),arid=isAridBiome(land.map),rocky=isRockyBiome(land.map);
  // New terrain kinds get a distinct grass/soil/rock signature instead of the
  // uniform meadow wash; roads and river banks still win over the base blend.
  const exposure=(arid?.28:rocky?.36:.14)*patch+smooth(.016,.135,slope)*(rocky?.96:.86)+smooth(3.8,12.5,y)*.42;
  const rock=Math.min(.95,exposure*(1-campZone*.92))*(1-road*.9)*(1-bank*.6);
  const baseSoil=arid?.34:rocky?.18:winter?.12:.04,patchSoil=arid?.3:rocky?.2:winter?.17:.08;
  const bankWeight=winter?.75:land.map==='archipelago'||land.map==='coast'?.82:.45;
  const soil=Math.min(.95,Math.max(road*.95,bank*bankWeight,baseSoil+patch*patchSoil)*(1-rock));
  return {grass:Math.max(0,1-soil-rock),soil,rock};
}

export function prepareTerrainGeometry(geometry,land){
  const p=geometry.attributes.position,n=geometry.attributes.normal,weights=new Float32Array(p.count*3);
  let min=Infinity,max=-Infinity,rocky=0,paths=0;
  for(let i=0;i<p.count;i++){
    const x=p.getX(i),y=p.getY(i),z=p.getZ(i),mix=terrainWeights(land,x,y,z,n.getY(i));
    weights.set([mix.grass,mix.soil,mix.rock],i*3);min=Math.min(min,y);max=Math.max(max,y);if(mix.rock>.3)rocky++;if(mix.soil>.7)paths++;
  }
  return {weights,diagnostics:{vertices:p.count,heightRange:{min,max},rockyVertices:rocky,pathVertices:paths}};
}
