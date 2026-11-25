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

function paintFlagstonePatch(ctx,cxWorld,czWorld,radius,seed,half,scale,{mask=false,r=160,g=154,b=138,soil='196,0,0',soilAlpha=.42,density=1,square=false}){
  if(typeof ctx.fill!=='function')return;
  const size=2*radius,cx=(cxWorld+half)*scale,cz=(czWorld+half)*scale,wear=(radius+1.7)*scale;
  if(typeof ctx.createRadialGradient==='function'){
    const packed=ctx.createRadialGradient(cx,cz,0,cx,cz,wear);
    for(const [stop,alpha] of [[0,.86],[.52,.72],[.80,.34],[1,0]]){
      packed.addColorStop(stop,`rgba(${soil},${(mask?alpha*soilAlpha:alpha).toFixed(3)})`);
    }
    ctx.fillStyle=packed;
    ctx.fillRect(cx-wear,cz-wear,wear*2,wear*2);
  }
  const rows=Math.ceil(size/.96),columns=Math.ceil(size/1.22),tileX=size/columns,tileZ=size/rows;
  const random=seededRandom(seed^Math.imul(Math.round(cxWorld*128),73856093)^Math.imul(Math.round(czWorld*128),19349663));
  for(let row=0;row<rows;row++)for(let column=-1;column<columns;column++){
    const shift=row%2*.48,start=Math.max(0,column+shift),end=Math.min(columns,column+1+shift);
    if(end-start<.25)continue;
    const x=Math.abs((start+end)*.5*tileX-radius),z=Math.abs((row+.5)*tileZ-radius);
    const dist=square?Math.max(x,z)+Math.max(0,Math.min(x,z)-radius*.50)*.42:Math.hypot(x,z);
    const edge=radius-dist;
    const coverage=smooth(0,1.05,edge+(random()-.48)*1.15)*density;
    if(coverage<.14)continue;
    const grout=.09+random()*.06,shade=.66+random()*.20,vein=(random()-.5)*11;
    const left=(cxWorld-radius+start*tileX+grout*.5+half)*scale,right=(cxWorld-radius+end*tileX-grout*.5+half)*scale;
    const top=(czWorld-radius+row*tileZ+grout*.5+half)*scale,bottom=(czWorld-radius+(row+1)*tileZ-grout*.5+half)*scale;
    const chip=Math.min(right-left,bottom-top)*(.08+random()*.18),alpha=Math.min(1,coverage*1.32).toFixed(2);
    ctx.fillStyle=mask?`rgba(255,0,0,${alpha})`:`rgba(${Math.min(255,Math.round(r*shade+vein))},${Math.min(255,Math.round(g*shade+vein*.5))},${Math.min(255,Math.round(b*shade-vein*.45))},${alpha})`;
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

export function paintSettlementPaving(ctx,land,half,scale,mask=false){
  const color=terrainBiome(land.map).plaza,r=Math.min(255,Math.round((color>>16)*1.16)),g=Math.min(255,Math.round((color>>8&255)*1.14)),b=Math.min(255,Math.round((color&255)*1.08));
  const soil=mask?'196,0,0':`${Math.round(r*.76)},${Math.round(g*.68)},${Math.round(b*.52)}`;
  // Unifying sunlit AoE2:DE medieval cobblestone town square around each settlement hub
  for(const town of land.settlements||[]){
    paintFlagstonePatch(ctx,town.x,town.z,9.4,land.seed^0x217a,half,scale,{mask,r,g,b,soil,soilAlpha:.38,density:.86,square:false});
  }
  for(const site of land.startingSites||[]){
    if(site.type==='dock')continue;
    const radius=site.r+(site.type==='towncenter'?4.2:site.type==='keep'?3.2:1.45);
    paintFlagstonePatch(ctx,site.x,site.z,radius,land.seed^0x51a3,half,scale,{mask,r,g,b,soil,soilAlpha:.44,density:1,square:true});
  }
  // Paved cobblestone bridgehead aprons linking roads smoothly onto every stone/timber bridge!
  for(const span of bridgeSpans(land.map)){
    const cz=spanZ(span);
    for(const side of [-1,1]){
      const ax=span.center+side*(span.halfLength+2.1);
      paintFlagstonePatch(ctx,ax,cz,4.2,land.seed^(side>0?0x71b3:0x39e5),half,scale,{mask,r,g,b,soil,soilAlpha:.45,density:.94,square:true});
    }
  }
}

/** Paints weathered, broken-edge medieval cobblestone flagstones down road cores (matching AoE2:DE paved trade roads). */
export function strokeCobblestoneRoad(ctx,points,{half,size,canvasSize,connected=false,local=false,mask=false,seed=1,stoneRgb=[204,191,164]}){
  if(!points||points.length<2||typeof ctx.fill!=='function')return;
  const scale=canvasSize/size,cum=[0];
  for(let i=1;i<points.length;i++)cum.push(cum[i-1]+Math.hypot(points[i].x-points[i-1].x,points[i].z-points[i-1].z));
  const total=cum[cum.length-1]||1,fadeStart=Math.min(total*.06,2.2),fadeEnd=Math.min(total*.28,12.5);
  const step=mask?(local?.85:.78):(local?.92:.85),halfRoad=local?1.35:2.05;
  const rng=seededRandom((seed|0)^Math.imul(Math.round(points[0].x*64),73856093)^Math.imul(Math.round(points[0].z*64),19349663));
  let segIdx=0,row=0;
  for(let d=0.4;d<total-0.3;d+=step,row++){
    while(segIdx<points.length-2&&cum[segIdx+1]<d)segIdx++;
    const segLen=Math.max(1e-4,cum[segIdx+1]-cum[segIdx]),u=(d-cum[segIdx])/segLen;
    const a=points[segIdx],b=points[segIdx+1];
    const wx=a.x+(b.x-a.x)*u,wz=a.z+(b.z-a.z)*u;
    const tx=(b.x-a.x)/segLen,tz=(b.z-a.z)/segLen,nx=-tz,nz=tx;
    const dStart=Math.min(1,d/Math.max(fadeStart,.01)),dEnd=Math.max(0,Math.min(1,(total-d)/Math.max(fadeEnd,.01)));
    const taper=connected?1:dEnd*dEnd*(3-2*dEnd)*(.6+.4*dStart);
    if(taper<.15)continue;
    if(mask){
      // Solid broken-edge cobblestone ribbon in the shader mask so bilinear filtering
      // triggers crisp 1K Poly Haven medieval_blocks_05 pavers along the entire trade road!
      const coreHalf=(local?1.08:1.68)*taper*(.84+rng()*.26);
      const halfLen=(step*.72)*scale,ang=Math.atan2(tz,tx)+(rng()-.5)*.14,ca=Math.cos(ang),sa=Math.sin(ang);
      const px=(wx+nx*((rng()-.5)*.32)+half)*scale,pz=(wz+nz*((rng()-.5)*.32)+half)*scale;
      const hw=halfLen,hh=coreHalf*scale;
      const ux=ca*hw,uy=sa*hw,vx=-sa*hh,vy=ca*hh;
      ctx.fillStyle=`rgba(255,0,0,${Math.min(1,.88*taper+.12).toFixed(2)})`;
      ctx.beginPath();
      ctx.moveTo(px-ux-vx,pz-uy-vy);
      ctx.lineTo(px+ux-vx,pz+uy-vy);
      ctx.lineTo(px+ux+vx,pz+uy+vy);
      ctx.lineTo(px-ux+vx,pz-uy+vy);
      ctx.fill();
      // Occasional broken stone cobble cluster crumbling outward along the road shoulder
      if(rng()<.55){
        const side=row%2?1:-1,off=side*(coreHalf+.45+rng()*.45);
        const cx=(wx+nx*off+half)*scale,cz=(wz+nz*off+half)*scale,cr=(.48+rng()*.32)*scale;
        ctx.fillStyle=`rgba(248,0,0,${Math.min(1,.92*taper).toFixed(2)})`;
        ctx.beginPath();
        ctx.moveTo(cx-cr,cz-cr*.8);ctx.lineTo(cx+cr,cz-cr*.7);ctx.lineTo(cx+cr*.9,cz+cr*.8);ctx.lineTo(cx-cr*.8,cz+cr*.7);
        ctx.fill();
      }
      continue;
    }
    const cols=local?2:3;
    for(let c=0;c<cols;c++){
      const lane=((c+.5)/cols-.5)*2*halfRoad*taper+(row%2?.24:-.24)+(rng()-.5)*.28;
      // Leave organic broken-edge weathered gaps on the outer pavers just like AoE2:DE cobblestone roads!
      const edgeFrac=Math.abs(lane)/Math.max(.5,halfRoad);
      if(edgeFrac>.68&&rng()<.32)continue;
      if(rng()<.06)continue;
      const px=(wx+nx*lane+half)*scale,pz=(wz+nz*lane+half)*scale;
      const hw=(.36+rng()*.20)*scale,hh=(.28+rng()*.16)*scale;
      const ang=Math.atan2(tz,tx)+(rng()-.5)*.24,ca=Math.cos(ang),sa=Math.sin(ang);
      const ux=ca*hw,uy=sa*hw,vx=-sa*hh,vy=ca*hh;
      const shade=.78+rng()*.24,vein=(rng()-.5)*14,alpha=Math.min(1,(.82+rng()*.18)*taper).toFixed(2);
      ctx.fillStyle=`rgba(${Math.min(255,Math.round(stoneRgb[0]*shade+vein))},${Math.min(255,Math.round(stoneRgb[1]*shade+vein*.6))},${Math.min(255,Math.round(stoneRgb[2]*shade-vein*.3))},${alpha})`;
      ctx.beginPath();
      ctx.moveTo(px-ux-vx,pz-uy-vy);
      ctx.lineTo(px+ux-vx,pz+uy-vy);
      ctx.lineTo(px+ux+vx,pz+uy+vy);
      ctx.lineTo(px-ux+vx,pz-uy+vy);
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
