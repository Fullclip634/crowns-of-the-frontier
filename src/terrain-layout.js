import {terrainMeadow,terrainNoise} from './terrain-fields.js';

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

export function roadDistance(x,z,land){
  let distance=Infinity;
  for(const path of terrainRoadPaths(land))for(const road of path.segments){const t=Math.max(0,Math.min(1,((x-road.x)*road.dx+(z-road.z)*road.dz)/road.length));distance=Math.min(distance,Math.hypot(x-road.x-t*road.dx,z-road.z-t*road.dz));}
  return distance;
}

export function terrainWeights(land,x,y,z,normalY=1){
  const road=1-smooth(1.2,2.8,roadDistance(x,z,land)),slope=1-Math.max(0,normalY);
  const patch=terrainMeadow(x,z,land.phase);
  let bank=0;for(const channel of land.channels()){
    const distance=Math.abs(x-channel.center-Math.sin(z*channel.frequency)*channel.bend)-channel.width;
    if(distance>=0)bank=Math.max(bank,1-smooth(.2,4,distance));
  }
  const winter=land.map==='winter',rock=Math.min(.94,.12*patch+smooth(.025,.19,slope)*.75+smooth(5,15,y)*.35)*(1-road*.9)*(1-bank*.6);
  const soil=Math.min(.95,Math.max(road*.95,bank*(winter?.75:.45),(winter?.12:.04)+patch*(winter?.17:.08)))*(1-rock);
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
