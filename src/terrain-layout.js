import {terrainMeadow,terrainNoise} from './terrain-fields.js';
import {isSnowBiome,isAridBiome,isRockyBiome} from './terrain-biomes.js';

const smooth=(a,b,x)=>{const t=Math.max(0,Math.min(1,(x-a)/(b-a)));return t*t*(3-2*t);};

export function terrainRoadPaths(land){
  return land.roadPaths??=(land.settlements.map(town=>{
    const end=land.map==='coast'?{x:Math.sign(town.x)*20,z:town.z}:{x:town.x*.2,z:0},dx=end.x-town.x,dz=end.z-town.z,length=Math.hypot(dx,dz)||1;
    const phase=Math.floor(land.phase*1048576),seed=terrainNoise(town.x*.037+18,town.z*.037-9,phase),wave=terrainNoise(town.x*.052-11,town.z*.052+7,phase^0x4ad7);
    const amplitude=Math.min(9,Math.max(3,length*.035))*(.82+Math.abs(seed)*.2),side=seed<0?-1:1,count=Math.max(12,Math.min(28,Math.ceil(length/14))),points=[],segments=[];
    for(let i=0;i<=count;i++){
      const t=i/count,envelope=Math.sin(Math.PI*t),lateral=envelope*(side*amplitude+Math.sin(t*Math.PI*2+wave*1.6)*Math.min(2.4,amplitude*.28));
      points.push(i===0?{x:town.x,z:town.z}:i===count?{x:end.x,z:end.z}:{x:town.x+dx*t-dz/length*lateral,z:town.z+dz*t+dx/length*lateral});
    }
    for(let i=0;i<count;i++){
      const a=points[i],b=points[i+1],sx=b.x-a.x,sz=b.z-a.z;segments.push({x:a.x,z:a.z,dx:sx,dz:sz,length:sx*sx+sz*sz||1});
    }
    return {start:town,end,points,segments};
  }));
}

export function strokeTaperedRoad(ctx,points,{half,size,canvasSize,layers,gravelColor=null}){
  if(!points||points.length<2)return;
  const scale=canvasSize/size,cum=[0];
  for(let i=1;i<points.length;i++)cum.push(cum[i-1]+Math.hypot(points[i].x-points[i-1].x,points[i].z-points[i-1].z));
  const total=cum[cum.length-1]||1,fadeStart=Math.min(total*.08,2.5),fadeEnd=Math.min(total*.30,13.5);
  const toPx=p=>[(p.x+half)*scale,(p.z+half)*scale];
  const prevCap=ctx.lineCap,prevJoin=ctx.lineJoin;
  ctx.lineCap='butt';ctx.lineJoin='round';
  for(const {width,rgba,median}of layers){
    for(let i=0;i<points.length-1;i++){
      const a=points[i],b=points[i+1],segLen=cum[i+1]-cum[i],sub=Math.max(1,Math.ceil(segLen/2.5));
      for(let s=0;s<sub;s++){
        const dMid=cum[i]+segLen*((s+.5)/sub),dStart=Math.min(1,dMid/Math.max(fadeStart,.01));
        const dEnd=Math.max(0,Math.min(1,(total-dMid)/Math.max(fadeEnd,.01)));
        const taper=dEnd*dEnd*(3-2*dEnd)*(.6+.4*dStart);
        if(taper<=.02)continue;
        const u0=s/sub,u1=(s+1)/sub,p0={x:a.x+(b.x-a.x)*u0,z:a.z+(b.z-a.z)*u0},p1={x:a.x+(b.x-a.x)*u1,z:a.z+(b.z-a.z)*u1};
        const [x0,y0]=toPx(p0),[x1,y1]=toPx(p1);
        ctx.strokeStyle=rgba(taper,median);ctx.lineWidth=width*(.32+.68*taper);
        ctx.beginPath();ctx.moveTo(x0,y0);ctx.lineTo(x1,y1);ctx.stroke();
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

export function roadDistance(x,z,land){
  let squaredDistance=Infinity;
  for(const path of terrainRoadPaths(land))for(const road of path.segments){
    const t=Math.max(0,Math.min(1,((x-road.x)*road.dx+(z-road.z)*road.dz)/road.length)),dx=x-road.x-t*road.dx,dz=z-road.z-t*road.dz;
    squaredDistance=Math.min(squaredDistance,dx*dx+dz*dz);
  }
  return Math.sqrt(squaredDistance);
}

export function terrainWeights(land,x,y,z,normalY=1){
  const road=1-smooth(1.2,2.8,roadDistance(x,z,land)),slope=1-Math.max(0,normalY);
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
