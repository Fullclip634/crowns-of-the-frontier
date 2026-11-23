import {seededRandom} from './data.js';

/**
 * Authoritative Natural Terrain Barrier & Chokepoint System.
 *
 * Generates impassable granite cliff ridges, boulder outcrops, and dense AoE2-style
 * Blackwood forest corridors so players and AI can seal narrow gaps with short walls
 * and gatehouses rather than walling an entire open field.
 *
 * Shared by Simulation (nav grid + build validation), Minimap (relief base),
 * and TerrainDetails (single GPU-instanced draw call — zero extra draw calls).
 */

const clamp=(v,lo,hi)=>Math.max(lo,Math.min(hi,v));

export function barrierHash(barriers){
  if(!barriers?.length)return 0;
  let h=barriers.length|0;
  for(let i=0;i<barriers.length;i++){
    const b=barriers[i];
    h=(Math.imul(h,31)+Math.round(b.x*4)+Math.round(b.z*7)+Math.round((b.r||2)*13))|0;
  }
  return h;
}

/** Stamps impassable natural cliff/boulder circles onto the simulation's base land grid. */
export function stampBarriersOnGrid(sim,base){
  const barriers=sim.barriers;
  if(!barriers?.length)return;
  const size=sim.gridSize,half=sim.halfWorld,cell=2;
  for(let i=0;i<barriers.length;i++){
    const b=barriers[i],rad=(b.r||2.4)+.35;
    const a=sim.cell(b.x-rad,b.z-rad),c=sim.cell(b.x+rad,b.z+rad);
    const ctr=sim.cell(b.x,b.z);
    base[ctr.z*size+ctr.x]=1;
    for(let z=a.z;z<=c.z;z++)for(let x=a.x;x<=c.x;x++){
      if(Math.hypot(x*cell-half+1-b.x,z*cell-half+1-b.z)<=rad)base[z*size+x]=1;
    }
  }
}

/** Checks if a candidate building footprint overlaps an impassable natural stone cliff. */
export function barrierCollision(sim,type,x,z,radius){
  const barriers=sim.barriers;
  if(!barriers?.length)return false;
  // Walls snap tightly against cliffs so players can seal passes without leaky gaps.
  const margin=type==='wall'?-.25:.65;
  for(let i=0;i<barriers.length;i++){
    const b=barriers[i];
    const limit=(b.r||2.4)+radius+margin;
    const dx=b.x-x,dz=b.z-z;
    if(dx*dx+dz*dz<limit*limit)return true;
  }
  return false;
}

/** Helper to check clearance against existing buildings, units, water, or explicit open pass corridors. */
function isSiteBlockedForBarrier(sim,x,z,r,passes=[],keepClear=[]){
  if(Math.abs(x)>sim.halfWorld-3||Math.abs(z)>sim.halfWorld-3)return true;
  if(sim.isWater(x,z))return true;
  for(const pass of passes){
    if(Math.hypot(x-pass.x,z-pass.z)<(pass.r||11)+r)return true;
  }
  for(const pt of keepClear){
    if(Math.hypot(x-pt.x,z-pt.z)<(pt.r||18)+r)return true;
  }
  for(const e of sim.entities){
    if(e.hp<=0)continue;
    const pad=e.kind==='building'?e.r+r+2.2:e.kind==='unit'?e.r+r+1.5:e.kind==='shrine'?e.r+r+4:0;
    if(pad>0&&Math.hypot(e.x-x,e.z-z)<pad)return true;
  }
  return false;
}

/** Adds a single impassable natural rock crag / cliff pillar to sim.barriers. */
export function addNaturalBarrier(sim,x,z,{r=3.0,height=3.6,kind='cliff',seed=0,passes=[],keepClear=[]}={}){
  if(isSiteBlockedForBarrier(sim,x,z,r,passes,keepClear))return null;
  sim.barriers??=[];
  // Avoid overlapping duplicates at the exact same spot
  if(sim.barriers.some(b=>Math.hypot(b.x-x,b.z-z)<Math.min(b.r,r)*.55))return null;
  // Clear overlapping gatherable trees/bushes cleanly inside the rock footprint
  for(const e of sim.entities){
    if(e.hp>0&&e.kind==='resource'&&!e.water&&Math.hypot(e.x-x,e.z-z)<r+e.r+.5)e.hp=0;
  }
  const barrier={x:Number(x.toFixed(2)),z:Number(z.toFixed(2)),r:Number(r.toFixed(2)),height:Number(height.toFixed(2)),kind,seed:seed||sim.barriers.length+1};
  sim.barriers.push(barrier);
  sim.revision++;
  return barrier;
}

/**
 * Carves an organic jagged mountain cliff wall from `from` to `to`, skipping any
 * declared `passes` (chokepoints) so units and wall-builders get clean mountain passes.
 */
export function addCliffRidge(sim,from,to,{step=3.6,width=1,radius=3.1,height=4.2,wobble=2.4,passes=[],keepClear=[],seedOffset=0}={}){
  const rng=seededRandom((sim.options?.seed||2026)+6101+seedOffset);
  const dx=to.x-from.x,dz=to.z-from.z,len=Math.hypot(dx,dz);
  if(len<1)return [];
  const count=Math.max(2,Math.ceil(len/step));
  const nx=-dz/len,nz=dx/len;
  const added=[];
  for(let i=0;i<=count;i++){
    const t=i/count;
    const wave=Math.sin(t*Math.PI*2.4+seedOffset)*.55*wobble+(rng()-.5)*wobble*.6;
    const cx=from.x+dx*t+nx*wave,cz=from.z+dz*t+nz*wave;
    for(let layer=0;layer<width;layer++){
      const lat=(layer-(width-1)/2)*(radius*1.15);
      const bx=cx+nx*lat+(rng()-.5)*.9,bz=cz+nz*lat+(rng()-.5)*.9;
      const r=radius*(.82+rng()*.38);
      const h=height*(.82+rng()*.46);
      const b=addNaturalBarrier(sim,bx,bz,{r,height:h,kind:'cliff',seed:Math.floor(rng()*99999),passes,keepClear});
      if(b)added.push(b);
    }
  }
  return added;
}

/**
 * Plants a dense Age of Empires II Black-Forest-style overlapping timber belt
 * that acts as a natural living barrier while leaving narrow carved pass trails.
 */
export function addDenseForestBelt(sim,from,to,{step=2.5,thickness=3,passes=[],keepClear=[],seedOffset=0}={}){
  const rng=seededRandom((sim.options?.seed||2026)+8203+seedOffset);
  const dx=to.x-from.x,dz=to.z-from.z,len=Math.hypot(dx,dz);
  if(len<1)return 0;
  const count=Math.max(2,Math.ceil(len/step));
  const nx=-dz/len,nz=dx/len;
  let planted=0;
  for(let i=0;i<=count;i++){
    const t=i/count;
    const cx=from.x+dx*t,cz=from.z+dz*t;
    for(let row=-thickness;row<=thickness;row++){
      const bx=cx+nx*(row*2.35+(rng()-.5)*1.1)+(rng()-.5)*.8;
      const bz=cz+nz*(row*2.35+(rng()-.5)*1.1)+(rng()-.5)*.8;
      if(Math.abs(bx)>sim.halfWorld-4||Math.abs(bz)>sim.halfWorld-4||sim.isWater(bx,bz))continue;
      if(passes.some(p=>Math.hypot(bx-p.x,bz-p.z)<(p.r||9.5)))continue;
      if(keepClear.some(p=>Math.hypot(bx-p.x,bz-p.z)<(p.r||18)))continue;
      if(sim.barriers?.some(b=>Math.hypot(b.x-bx,b.z-bz)<b.r+1.6))continue;
      if(sim.entities.some(e=>e.hp>0&&(e.kind==='building'&&Math.hypot(e.x-bx,e.z-bz)<e.r+2.6||e.kind==='unit'&&Math.hypot(e.x-bx,e.z-bz)<e.r+1.5||e.kind==='resource'&&Math.hypot(e.x-bx,e.z-bz)<1.75)))continue;
      sim.addNaturalResource('wood',bx,bz,280);
      planted++;
    }
  }
  return planted;
}

/**
 * Encloses a settlement center inside a pre-built stone-walled fortress with gatehouses
 * and corner watchtowers (AoE2 Arena / Fortress & Campaign Citadel builder).
 */
export function buildWalledCitadel(sim,owner,center,{radius=18,gates=['north','south'],towers=true,complete=true}={}){
  const cx=center.x,cz=center.z;
  const step=3;
  const half=Math.max(12,Math.round(radius/step)*step);
  const gateAngles=new Set(gates);
  const placed={walls:[],gates:[],towers:[]};
  const limit=sim.halfWorld-4;

  const tryPlace=(type,x,z,angle=0)=>{
    if(Math.abs(x)>limit||Math.abs(z)>limit||sim.isWater(x,z))return null;
    if(sim.barriers?.some(b=>Math.hypot(b.x-x,b.z-z)<b.r+1.5))return null;
    // Clear stray trees/berries on the wall line so the ring closes cleanly
    for(const e of sim.entities){
      if(e.hp>0&&e.kind==='resource'&&!e.water&&Math.hypot(e.x-x,e.z-z)<(type==='gate'?3.4:2.2))e.hp=0;
    }
    if(sim.entities.some(e=>e.hp>0&&e.kind==='building'&&Math.hypot(e.x-x,e.z-z)<(type==='wall'?1.9:e.r+1.4)))return null;
    return sim.addBuilding(type,owner,x,z,complete,{angle});
  };

  // North (z = cz - half) and South (z = cz + half) runs
  for(const side of [['north',-half],['south',half]]){
    const [dir,dz]=side,hasGate=gateAngles.has(dir);
    if(hasGate){
      const g=tryPlace('gate',cx,cz+dz,0);
      if(g)placed.gates.push(g);
    }
    for(let dx=-half;dx<=half;dx+=step){
      if(hasGate&&Math.abs(dx)<=3.5)continue;
      const w=tryPlace('wall',cx+dx,cz+dz,0);
      if(w)placed.walls.push(w);
    }
  }
  // West (x = cx - half) and East (x = cx + half) runs
  for(const side of [['west',-half],['east',half]]){
    const [dir,dx]=side,hasGate=gateAngles.has(dir);
    if(hasGate){
      const g=tryPlace('gate',cx+dx,cz,Math.PI/2);
      if(g)placed.gates.push(g);
    }
    for(let dz=-half+step;dz<=half-step;dz+=step){
      if(hasGate&&Math.abs(dz)<=3.5)continue;
      const w=tryPlace('wall',cx+dx,cz+dz,Math.PI/2);
      if(w)placed.walls.push(w);
    }
  }
  // Corner Watchtowers tucked just inside the bastion corners
  if(towers){
    const inset=Math.max(10,half-4);
    for(const [sx,sz] of [[-1,-1],[1,-1],[-1,1],[1,1]]){
      const t=tryPlace('tower',cx+sx*inset,cz+sz*inset,0);
      if(t)placed.towers.push(t);
    }
  }
  return placed;
}

/**
 * Generates map-specific natural stone cliffs, dense Blackwood forest walls,
 * and pre-walled Bastion fortresses for Skirmish & Custom Battles.
 */
export function applyMapGeography(sim){
  const map=sim.options?.map;
  if(!map)return;
  const bases=(sim.players||[]).map((p,owner)=>p?.start?{x:p.start.x,z:p.start.z,owner}:null).filter(Boolean);
  const keepClear=bases.map(b=>({x:b.x,z:b.z,r:24}));
  const h=sim.halfWorld;

  if(map==='ironpass'){
    // Classic AoE2 Mountain Pass: Twin diagonal granite cliff walls creating 3 narrow tactical passes
    const passes=[
      {x:0,z:0,r:10.5},
      {x:-h*.42,z:-h*.42,r:10},
      {x:h*.42,z:h*.42,r:10},
    ];
    addCliffRidge(sim,{x:-h+6,z:-h+6},{x:h-6,z:h-6},{step:3.4,width:2,radius:3.2,height:4.8,wobble:2.6,passes,keepClear,seedOffset:11});
    // Flanking shoulder ridges near each valley corner to reward short forward walls
    addCliffRidge(sim,{x:-h*.68,z:h*.08},{x:-h*.28,z:h*.02},{step:3.6,width:1,radius:2.8,height:3.9,wobble:1.8,passes,keepClear,seedOffset:23});
    addCliffRidge(sim,{x:h*.28,z:-h*.02},{x:h*.68,z:-h*.08},{step:3.6,width:1,radius:2.8,height:3.9,wobble:1.8,passes,keepClear,seedOffset:37});
    // Rich mineral veins tucked near the central & outer mountain passes
    for(const [mx,mz,t] of [[-10,-12,'gold'],[10,12,'gold'],[-14,8,'stone'],[14,-8,'stone']]){
      if(!barrierCollision(sim,'mine',mx,mz,2)&&!sim.isWater(mx,mz))sim.addNaturalResource(t,mx,mz,2000);
    }
  }else if(map==='blackwood'){
    // Classic AoE2 Black Forest: Impenetrable ancient forest walls with 2-3 narrow carved corridors
    const passes=[
      {x:0,z:0,r:9.5},
      {x:-h*.38,z:-h*.38,r:9},
      {x:h*.38,z:h*.38,r:9},
    ];
    addDenseForestBelt(sim,{x:-h+8,z:-h+8},{x:h-8,z:h-8},{step:2.5,thickness:3,passes,keepClear,seedOffset:41});
    // Stone outcrops anchoring the central forest pass
    addNaturalBarrier(sim,-11,9,{r:3.0,height:3.8,passes,keepClear,seedOffset:51});
    addNaturalBarrier(sim,11,-9,{r:3.0,height:3.8,passes,keepClear,seedOffset:52});
  }else if(map==='bastion'){
    // Classic AoE2 Arena / Fortress: Every kingdom starts inside a stone-walled citadel
    for(const base of bases){
      const faceX=base.x<0?'east':'west',faceZ=base.z<0?'south':'north';
      buildWalledCitadel(sim,base.owner,base,{radius:18,gates:[faceX,faceZ],towers:true,complete:true});
    }
    // Natural rocky crags flanking the central contested arena
    const centerKeep=[...keepClear,{x:0,z:0,r:13}];
    addCliffRidge(sim,{x:-22,z:-24},{x:-10,z:-26},{step:3.5,width:1,radius:2.7,height:3.5,wobble:1.4,keepClear:centerKeep,seedOffset:61});
    addCliffRidge(sim,{x:10,z:26},{x:22,z:24},{step:3.5,width:1,radius:2.7,height:3.5,wobble:1.4,keepClear:centerKeep,seedOffset:62});
  }else if(map==='highland'||map==='volcanic'){
    // Subtle natural cliff crags on mountain/volcanic biomes (never blocking legacy spawn lanes)
    const passes=[{x:0,z:0,r:14},{x:-24,z:0,r:12},{x:24,z:0,r:12}];
    addCliffRidge(sim,{x:-h*.55,z:-h*.12},{x:-h*.22,z:-h*.18},{step:4.0,width:1,radius:2.7,height:4.0,wobble:2.0,passes,keepClear,seedOffset:71});
    addCliffRidge(sim,{x:h*.22,z:h*.18},{x:h*.55,z:h*.12},{step:4.0,width:1,radius:2.7,height:4.0,wobble:2.0,passes,keepClear,seedOffset:73});
  }
}
