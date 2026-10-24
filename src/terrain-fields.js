const fade=t=>t*t*t*(t*(t*6-15)+10),mix=(a,b,t)=>a+(b-a)*t;
function hash(x,z,seed){let n=Math.imul(x,0x1f123bb5)^Math.imul(z,0x5f356495)^seed;n=Math.imul(n^(n>>>16),0x45d9f3b);return (n^(n>>>16))>>>0;}
function gradient(x,z,dx,dz,seed){const h=hash(x,z,seed)&7;return h<4?((h&1)?-dx:dx)+((h&2)?-dz:dz):h<6?((h&1)?-dx:dx):((h&1)?-dz:dz);}

// Quintic interpolation gives coherent fields with smooth first and second
// derivatives. These samples are prepared with the mesh and material, not in
// the render loop; simulation RNG and resource layouts remain independent.
export function terrainNoise(x,z,seed){
  const ix=Math.floor(x),iz=Math.floor(z),dx=x-ix,dz=z-iz,u=fade(dx),v=fade(dz);
  return mix(mix(gradient(ix,iz,dx,dz,seed),gradient(ix+1,iz,dx-1,dz,seed),u),mix(gradient(ix,iz+1,dx,dz-1,seed),gradient(ix+1,iz+1,dx-1,dz-1,seed),u),v);
}

export function terrainMeadow(x,z,phase){
  const seed=Math.floor(phase*1048576),broad=terrainNoise(x*.018+13.4,z*.018-7.1,seed),detail=terrainNoise((x+z*.3)*.036-4.6,(z-x*.2)*.036+11.3,seed^0x52ab3);
  return Math.max(0,Math.min(1,.5+broad*.7+detail*.1));
}
