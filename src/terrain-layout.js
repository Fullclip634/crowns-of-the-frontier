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

export function settlementPlazas(land){
  return land.plazaPads??=(land.settlements||[]).flatMap(town=>[
    {x:town.x,z:town.z,size:6.4,primary:true},
    {x:town.x-9.5,z:town.z-9,size:4.1,primary:false},
    {x:town.x+9.5,z:town.z+9,size:4.1,primary:false},
    {x:town.x-10.2,z:town.z+7.5,size:4.3,primary:false},
    {x:town.x+12,z:town.z-7,size:4.3,primary:false},
  ]);
}

export function settlementCourtyardRoads(land){
  return land.courtyardRoads??=(land.settlements||[]).flatMap(town=>{
    const ring=[],spokes=[];
    for(let i=0;i<=24;i++){
      const a=i/24*Math.PI*2;
      ring.push({x:town.x+Math.cos(a)*10.8,z:town.z+Math.sin(a)*9.8});
    }
    for(const [dx,dz] of [[-18,-16],[18,16],[-19,14],[20,-13]]){
      spokes.push([
        {x:town.x+dx*.32,z:town.z+dz*.32},
        {x:town.x+dx*.66+dz*.08,z:town.z+dz*.66-dx*.08},
        {x:town.x+dx,z:town.z+dz},
      ]);
    }
    return [{points:ring},...spokes.map(points=>({points}))];
  });
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
  let courtyard=Infinity;
  for(const road of settlementCourtyardRoads(land)){
    const pts=road.points;
    for(let i=0;i<pts.length-1;i++){
      const ax=pts[i].x,az=pts[i].z,dx=pts[i+1].x-ax,dz=pts[i+1].z-az,len2=dx*dx+dz*dz||1;
      const t=Math.max(0,Math.min(1,((x-ax)*dx+(z-az)*dz)/len2));
      courtyard=Math.min(courtyard,Math.hypot(x-ax-t*dx,z-az-t*dz));
    }
  }
  const road=Math.max(1-smooth(1.2,2.8,roadDistance(x,z,land)),(1-smooth(1.0,2.5,courtyard))*.88),slope=1-Math.max(0,normalY);
  const patch=terrainMeadow(x,z,land.phase);
  let bank=0;for(const channel of land.channels()){
    const distance=Math.abs(x-channel.center-Math.sin(z*channel.frequency)*channel.bend)-channel.width;
    if(distance>=0)bank=Math.max(bank,1-smooth(.2,4,distance));
  }
  const winter=isSnowBiome(land.map),arid=isAridBiome(land.map),rocky=isRockyBiome(land.map);
  // New terrain kinds get a distinct grass/soil/rock signature instead of the
  // uniform meadow wash; roads and river banks still win over the base blend.
  const exposure=(arid?.28:rocky?.34:.12)*patch+smooth(.018,.15,slope)*(rocky?.96:.82)+smooth(4.2,13.5,y)*.38;
  const rock=Math.min(.95,exposure)*(1-road*.9)*(1-bank*.6);
  const baseSoil=arid?.34:rocky?.18:winter?.12:.04,patchSoil=arid?.3:rocky?.2:winter?.17:.08;
  const soil=Math.min(.95,Math.max(road*.95,bank*(winter?.75:.45),baseSoil+patch*patchSoil)*(1-rock));
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
