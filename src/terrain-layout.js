const smooth=(a,b,x)=>{const t=Math.max(0,Math.min(1,(x-a)/(b-a)));return t*t*(3-2*t);};

export function roadDistance(x,z,land){
  land.roads??=land.settlements.map(town=>{
    const end=land.map==='coast'?{x:Math.sign(town.x)*20,z:town.z}:{x:town.x*.2,z:0};
    const dx=end.x-town.x,dz=end.z-town.z;return {x:town.x,z:town.z,dx,dz,length:dx*dx+dz*dz||1};
  });
  let distance=Infinity;
  for(const road of land.roads){const t=Math.max(0,Math.min(1,((x-road.x)*road.dx+(z-road.z)*road.dz)/road.length));distance=Math.min(distance,Math.hypot(x-road.x-t*road.dx,z-road.z-t*road.dz));}
  return distance;
}

export function terrainWeights(land,x,y,z,normalY=1){
  const road=1-smooth(1.2,2.8,roadDistance(x,z,land)),slope=1-Math.max(0,normalY);
  const patch=.5+.5*Math.sin(x*.064+land.phase)*Math.cos(z*.053-land.phase);
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
