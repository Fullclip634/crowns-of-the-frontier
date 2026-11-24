import {seededRandom} from './data.js';
import {bridgeFootprint} from './bridge-layout.js';
import {isAridBiome,isVolcanicBiome} from './terrain-biomes.js';

const clamp=(v,lo,hi)=>Math.max(lo,Math.min(hi,v));

/**
 * Spawns roaming, huntable deer herds (1 royal stag + 2–3 does per herd) in sunlit
 * meadows and snowy valleys. Deer are authoritative 'food' resources harvested 35%
 * faster than berry bushes, giving classic Age of Empires hunting openings.
 */
export function seedDeerHerds(sim,options={}){
  const map=sim.options?.map;
  if(isVolcanicBiome(map)||map==='arid')return [];
  const rng=seededRandom((sim.options?.seed||2026)+7717+(options.seedOffset||0));
  const half=sim.halfWorld-10;
  const bases=(sim.players||[]).map(p=>p?.start).filter(Boolean);
  const spots=[];

  // Place one sheltered huntable herd near each starting base (outside immediate TC pad)
  for(const base of bases){
    for(let attempt=0;attempt<18;attempt++){
      const ang=rng()*Math.PI*2,dist=21+rng()*11;
      const hx=base.x+Math.cos(ang)*dist,hz=base.z+Math.sin(ang)*dist;
      if(Math.abs(hx)>half||Math.abs(hz)>half||sim.isWater(hx,hz)||bridgeFootprint(map,hx,hz,6))continue;
      if(sim.barriers?.some(b=>Math.hypot(b.x-hx,b.z-hz)<b.r+5))continue;
      if(sim.entities.some(e=>e.hp>0&&e.kind==='building'&&Math.hypot(e.x-hx,e.z-hz)<e.r+8))continue;
      spots.push({x:hx,z:hz,count:3});
      break;
    }
  }
  // Plus 2–4 wilderness herds grazing across contested valleys & snowfields
  const wildCount=options.wildHerds??Math.max(2,Math.min(5,Math.round(sim.worldSize/85)));
  for(let w=0;w<wildCount;w++){
    for(let attempt=0;attempt<20;attempt++){
      const hx=(rng()-.5)*(sim.worldSize-28),hz=(rng()-.5)*(sim.worldSize-28);
      if(sim.isWater(hx,hz)||bridgeFootprint(map,hx,hz,7))continue;
      if(sim.barriers?.some(b=>Math.hypot(b.x-hx,b.z-hz)<b.r+5))continue;
      if(bases.some(b=>Math.hypot(b.x-hx,b.z-hz)<24))continue;
      if(spots.some(s=>Math.hypot(s.x-hx,s.z-hz)<26))continue;
      if(sim.entities.some(e=>e.hp>0&&e.kind==='building'&&Math.hypot(e.x-hx,e.z-hz)<e.r+8))continue;
      spots.push({x:hx,z:hz,count:3+(w%2)});
      break;
    }
  }

  const placed=[];
  spots.forEach((spot,herdIdx)=>{
    for(let i=0;i<spot.count;i++){
      const ang=(i/spot.count)*Math.PI*2+rng()*.6,rad=1.6+rng()*2.6;
      const x=clamp(spot.x+Math.cos(ang)*rad,-half,half);
      const z=clamp(spot.z+Math.sin(ang)*rad,-half,half);
      if(sim.isWater(x,z)||sim.barriers?.some(b=>Math.hypot(b.x-x,b.z-z)<b.r+2.2))continue;
      if(sim.entities.some(e=>e.hp>0&&(e.kind==='building'&&Math.hypot(e.x-x,e.z-z)<e.r+2.5||e.kind==='resource'&&Math.hypot(e.x-x,e.z-z)<1.8)))continue;
      const deer=sim.addResource('food',x,z,280);
      deer.wildlife=i===0?'deer':'doe';
      deer.displayName=i===0?'Wild stag':'Wild deer';
      deer.r=1.2;
      deer.herdId=herdIdx+1;
      deer.homeX=spot.x;
      deer.homeZ=spot.z;
      deer.angle=rng()*Math.PI*2;
      deer.grazeTimer=1.5+rng()*4.5;
      deer.wandering=false;
      deer.wanderX=x;
      deer.wanderZ=z;
      placed.push(deer);
    }
  });
  return placed;
}

/**
 * Gently animates grazing deer herds across clearings without disrupting villagers
 * who are actively hunting them. Deterministic via entity ids and simulation time.
 */
export function tickWildlife(sim,dt){
  const list=sim.entities;
  if(!list?.length)return;
  const limit=sim.halfWorld-4;
  for(let i=0;i<list.length;i++){
    const e=list[i];
    if(e.hp<=0||!e.wildlife)continue;
    // Pause movement once villagers begin harvesting so hunters never chase infinitely!
    if(e.amount<e.initialAmount-1){
      e.wandering=false;
      continue;
    }
    e.grazeTimer=(e.grazeTimer??2)-dt;
    if(e.wandering){
      const dx=(e.wanderX??e.x)-e.x,dz=(e.wanderZ??e.z)-e.z,dist=Math.hypot(dx,dz);
      if(dist<.35||e.grazeTimer<=0){
        e.wandering=false;
        e.grazeTimer=3.2+((e.id*17+Math.floor(sim.time))%5);
      }else{
        const step=Math.min(dist,dt*1.35);
        const nx=clamp(e.x+(dx/dist)*step,-limit,limit);
        const nz=clamp(e.z+(dz/dist)*step,-limit,limit);
        const blocked=sim.isWater(nx,nz)||bridgeFootprint(sim.options.map,nx,nz,2.5)||
          sim.barriers?.some(b=>Math.hypot(b.x-nx,b.z-nz)<b.r+2.0)||
          sim.candidatesFor('building').some(b=>b.hp>0&&Math.hypot(b.x-nx,b.z-nz)<b.r+2.2);
        if(blocked){
          e.wandering=false;
          e.grazeTimer=2.5;
        }else{
          e.x=nx;e.z=nz;
          e.angle=Math.atan2(dx,dz);
        }
      }
    }else if(e.grazeTimer<=0){
      const hash=Math.sin(e.id*91.7+sim.time*3.1)*43758.5453;
      const frac=hash-Math.floor(hash);
      const ang=frac*Math.PI*2;
      const rad=2.5+((e.id*13)%5)*1.1;
      e.wanderX=clamp((e.homeX??e.x)+Math.cos(ang)*rad,-limit,limit);
      e.wanderZ=clamp((e.homeZ??e.z)+Math.sin(ang)*rad,-limit,limit);
      e.wandering=true;
      e.grazeTimer=4.5;
    }
  }
}
