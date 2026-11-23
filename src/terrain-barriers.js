import {seededRandom} from './data.js';
import {bridgeFootprint} from './bridge-layout.js';

/**
 * Authoritative Continent-Wide Natural Terrain & Tactical Fortification System.
 *
 * Builds REALISTIC, WORLD-SCALE Age of Empires II / IV landscapes FIRST:
 *  - Sweeping curved mountain chains, multi-peak alpine massifs, branching canyon
 *    escarpments, rocky mesas, and ancient Blackwood timber tracts spanning the
 *    ENTIRE battlefield (NEVER fake circular rock rings stamped around a base!).
 *  - Human-crafted fortifications tie straight/angled Stone Curtain Walls & Gatehouses
 *    between REAL regional mountain ridges and natural forest edges across valley mouths,
 *    saving walls while naturally enclosing wide, spacious valleys with safe resources.
 */

export function barrierHash(barriers){
  if(!barriers?.length)return 0;
  let h=barriers.length|0;
  for(let i=0;i<barriers.length;i++){
    const b=barriers[i];
    h=(Math.imul(h,31)+Math.round(b.x*4)+Math.round(b.z*7)+Math.round((b.r||2)*13))|0;
  }
  return h;
}

/** Stamps impassable natural cliff/mountain circles onto the simulation's base land grid. */
export function stampBarriersOnGrid(sim,base){
  const barriers=sim.barriers;
  if(!barriers?.length)return;
  const size=sim.gridSize,half=sim.halfWorld,cell=2;
  for(let i=0;i<barriers.length;i++){
    const b=barriers[i],rad=(b.r||2.8)+.4;
    const a=sim.cell(b.x-rad,b.z-rad),c=sim.cell(b.x+rad,b.z+rad);
    const ctr=sim.cell(b.x,b.z);
    base[ctr.z*size+ctr.x]=1;
    for(let z=a.z;z<=c.z;z++)for(let x=a.x;x<=c.x;x++){
      if(Math.hypot(x*cell-half+1-b.x,z*cell-half+1-b.z)<=rad)base[z*size+x]=1;
    }
  }
}

/** Checks if a candidate building footprint overlaps an impassable natural stone cliff/mountain. */
export function barrierCollision(sim,type,x,z,radius){
  const barriers=sim.barriers;
  if(!barriers?.length)return false;
  // Walls tie snugly right into natural cliff faces so players seal passes with zero leaky gaps.
  const margin=type==='wall'?-.45:.65;
  for(let i=0;i<barriers.length;i++){
    const b=barriers[i];
    const limit=(b.r||2.8)+radius+margin;
    const dx=b.x-x,dz=b.z-z;
    if(dx*dx+dz*dz<limit*limit)return true;
  }
  return false;
}

function isSiteBlockedForBarrier(sim,x,z,r,passes=[],keepClear=[]){
  if(Math.abs(x)>sim.halfWorld-2.5||Math.abs(z)>sim.halfWorld-2.5)return true;
  if(sim.isWater(x,z))return true;
  if(bridgeFootprint(sim.options?.map,x,z,r+3.5))return true;
  for(const pass of passes){
    if(Math.hypot(x-pass.x,z-pass.z)<(pass.r||10)+r*.65)return true;
  }
  for(const pt of keepClear){
    if(Math.hypot(x-pt.x,z-pt.z)<(pt.r||18)+r)return true;
  }
  for(const e of sim.entities){
    if(e.hp<=0)continue;
    const pad=e.kind==='building'?e.r+r+1.6:e.kind==='unit'?e.r+r+1.4:e.kind==='shrine'?e.r+r+4.5:0;
    if(pad>0&&Math.hypot(e.x-x,e.z-z)<pad)return true;
  }
  return false;
}

/** Adds a single impassable Blender-authored cliffwall escarpment or alpine mountain peak. */
export function addNaturalBarrier(sim,x,z,{r=3.1,height=4.2,kind='cliffwall',angle=0,seed=0,passes=[],keepClear=[]}={}){
  if(isSiteBlockedForBarrier(sim,x,z,r,passes,keepClear))return null;
  sim.barriers??=[];
  if(sim.barriers.some(b=>Math.hypot(b.x-x,b.z-z)<Math.min(b.r,r)*.48))return null;
  for(const e of sim.entities){
    if(e.hp>0&&e.kind==='resource'&&!e.water&&Math.hypot(e.x-x,e.z-z)<r+e.r+.3)e.hp=0;
  }
  const barrier={
    x:Number(x.toFixed(2)),
    z:Number(z.toFixed(2)),
    r:Number(r.toFixed(2)),
    height:Number(height.toFixed(2)),
    angle:Number(angle.toFixed(3)),
    kind,
    seed:seed||sim.barriers.length+1,
  };
  sim.barriers.push(barrier);
  sim.revision++;
  return barrier;
}

/**
 * Carves a continuous, interlocking Age of Empires stepped stone cliff range from
 * `from` to `to`, automatically anchoring ridge ends & pass mouths with towering
 * alpine mountain crags while leaving clear narrow tactical passes.
 */
export function addCliffRidge(sim,from,to,{step=3.5,width=1,radius=3.1,height=4.4,wobble=2.4,passes=[],keepClear=[],seedOffset=0,withMountains=true,foothillTrees=false}={}){
  const rng=seededRandom((sim.options?.seed||2026)+6101+seedOffset);
  const dx=to.x-from.x,dz=to.z-from.z,len=Math.hypot(dx,dz);
  if(len<1)return [];
  const count=Math.max(2,Math.ceil(len/step));
  const nx=-dz/len,nz=dx/len;
  const ridgeAngle=Math.atan2(-dz,dx);
  const added=[];
  let prevPlaced=false;
  for(let i=0;i<=count;i++){
    const t=i/count;
    const wave=Math.sin(t*Math.PI*2.3+seedOffset)*.55*wobble+(rng()-.5)*wobble*.45;
    const cx=from.x+dx*t+nx*wave,cz=from.z+dz*t+nz*wave;
    let placedThisStep=false;
    for(let layer=0;layer<width;layer++){
      const lat=(layer-(width-1)/2)*(radius*1.08);
      const bx=cx+nx*lat+(rng()-.5)*.6,bz=cz+nz*lat+(rng()-.5)*.6;
      const nearEnd=i===0||i===count||!prevPlaced;
      const isMountain=withMountains&&layer===0&&(nearEnd||(i%5===0&&rng()<.55));
      const kind=isMountain?'mountain':'cliffwall';
      const r=radius*(isMountain?1.24:.92+rng()*.24);
      const h=height*(isMountain?1.42:.90+rng()*.30);
      const ang=ridgeAngle+(rng()-.5)*.30;
      const b=addNaturalBarrier(sim,bx,bz,{r,height:h,kind,angle:ang,seed:Math.floor(rng()*99999),passes,keepClear});
      if(b){added.push(b);placedThisStep=true;}
    }
    if(foothillTrees&&placedThisStep&&i%2===0){
      for(const side of [-1,1]){
        if(rng()>.58)continue;
        const tx=cx+nx*side*(radius*width+2.4+rng()*2.2),tz=cz+nz*side*(radius*width+2.4+rng()*2.2);
        if(Math.abs(tx)<sim.halfWorld-5&&Math.abs(tz)<sim.halfWorld-5&&!sim.isWater(tx,tz)&&
          !passes.some(p=>Math.hypot(tx-p.x,tz-p.z)<(p.r||9)+2)&&
          !keepClear.some(p=>Math.hypot(tx-p.x,tz-p.z)<(p.r||18))&&
          !sim.barriers.some(b=>Math.hypot(b.x-tx,b.z-tz)<b.r+1.6)&&
          !sim.entities.some(e=>e.hp>0&&(e.kind==='building'&&Math.hypot(e.x-tx,e.z-tz)<e.r+2.4||e.kind==='resource'&&Math.hypot(e.x-tx,e.z-tz)<1.9))){
          sim.addNaturalResource('wood',tx,tz,260);
        }
      }
    }
    prevPlaced=placedThisStep;
  }
  return added;
}

/**
 * Sculpts a long, organically curving multi-waypoint mountain range across the continent
 * (using smooth spline segments rather than straight lines or fake circles).
 */
export function addCurvedCliffChain(sim,points,opts={}){
  if(!points||points.length<2)return [];
  const added=[];
  for(let i=0;i<points.length-1;i++){
    const seg=addCliffRidge(sim,points[i],points[i+1],{...opts,seedOffset:(opts.seedOffset||0)+i*37});
    added.push(...seg);
  }
  return added;
}

/**
 * Sculpts an asymmetric, jagged alpine mountain massif (multiple peaks + stepped cliff
 * shoulders + foothill pines) for map corners, mountain headlands, and natural high ground.
 */
export function addMountainMassif(sim,cx,cz,{radius=14,peaks=4,passes=[],keepClear=[],seedOffset=0,withTrees=true}={}){
  const rng=seededRandom((sim.options?.seed||2026)+9307+seedOffset);
  const added=[];
  const centerMtn=addNaturalBarrier(sim,cx,cz,{r:4.2,height:6.8,kind:'mountain',angle:rng()*Math.PI*2,seed:Math.floor(rng()*99999),passes,keepClear});
  if(centerMtn)added.push(centerMtn);
  for(let i=0;i<peaks;i++){
    const a=(i/peaks)*Math.PI*2+(rng()-.5)*.65;
    const dist=radius*(.36+rng()*.42);
    const px=cx+Math.cos(a)*dist,pz=cz+Math.sin(a)*dist;
    const kind=i%2===0?'mountain':'cliffwall';
    const b=addNaturalBarrier(sim,px,pz,{
      r:kind==='mountain'?3.6+rng()*.6:3.1+rng()*.5,
      height:kind==='mountain'?5.6+rng()*1.2:4.0+rng()*1.1,
      kind,
      angle:a+Math.PI*.5+(rng()-.5)*.45,
      seed:Math.floor(rng()*99999),
      passes,
      keepClear,
    });
    if(b)added.push(b);
  }
  if(withTrees){
    for(let t=0;t<10;t++){
      const a=rng()*Math.PI*2,d=radius*(.78+rng()*.42);
      const tx=cx+Math.cos(a)*d,tz=cz+Math.sin(a)*d;
      if(Math.abs(tx)<sim.halfWorld-5&&Math.abs(tz)<sim.halfWorld-5&&!sim.isWater(tx,tz)&&
        !passes.some(p=>Math.hypot(tx-p.x,tz-p.z)<(p.r||9)+2)&&
        !keepClear.some(p=>Math.hypot(tx-p.x,tz-p.z)<(p.r||18))&&
        !sim.barriers.some(b=>Math.hypot(b.x-tx,b.z-tz)<b.r+1.6)&&
        !sim.entities.some(e=>e.hp>0&&(e.kind==='building'&&Math.hypot(e.x-tx,e.z-tz)<e.r+2.4||e.kind==='resource'&&Math.hypot(e.x-tx,e.z-tz)<1.9))){
        sim.addNaturalResource('wood',tx,tz,260);
      }
    }
  }
  return added;
}

/**
 * Plants a dense Age of Empires II Black-Forest-style overlapping timber belt
 * that acts as a natural living barrier while leaving narrow carved pass trails.
 */
export function addDenseForestBelt(sim,from,to,{step=2.45,thickness=3,passes=[],keepClear=[],seedOffset=0}={}){
  const rng=seededRandom((sim.options?.seed||2026)+8203+seedOffset);
  const dx=to.x-from.x,dz=to.z-from.z,len=Math.hypot(dx,dz);
  if(len<1)return 0;
  const count=Math.max(2,Math.ceil(len/step));
  const nx=-dz/len,nz=dx/len;
  let planted=0;
  for(let i=0;i<=count;i++){
    const t=i/count;
    const wave=Math.sin(t*Math.PI*2.1+seedOffset)*1.9;
    const cx=from.x+dx*t+nx*wave,cz=from.z+dz*t+nz*wave;
    for(let row=-thickness;row<=thickness;row++){
      const bx=cx+nx*(row*2.3+(rng()-.5)*1.0)+(rng()-.5)*.7;
      const bz=cz+nz*(row*2.3+(rng()-.5)*1.0)+(rng()-.5)*.7;
      if(Math.abs(bx)>sim.halfWorld-4||Math.abs(bz)>sim.halfWorld-4||sim.isWater(bx,bz))continue;
      if(bridgeFootprint(sim.options?.map,bx,bz,4))continue;
      if(passes.some(p=>Math.hypot(bx-p.x,bz-p.z)<(p.r||9.5)))continue;
      if(keepClear.some(p=>Math.hypot(bx-p.x,bz-p.z)<(p.r||18)))continue;
      if(sim.barriers?.some(b=>Math.hypot(b.x-bx,b.z-bz)<b.r+1.5))continue;
      if(sim.entities.some(e=>e.hp>0&&(e.kind==='building'&&Math.hypot(e.x-bx,e.z-bz)<e.r+2.4||e.kind==='unit'&&Math.hypot(e.x-bx,e.z-bz)<e.r+1.5||e.kind==='resource'&&Math.hypot(e.x-bx,e.z-bz)<1.75)))continue;
      sim.addNaturalResource('wood',bx,bz,280);
      planted++;
    }
  }
  return planted;
}

/**
 * Connects two natural terrain anchors (mountain jaws, cliff spurs, or forest edges)
 * with a clean human-crafted straight Stone Curtain Wall + central Gatehouse + optional
 * backing Watchtower — saving massive stone by using the real landscape as the fortress walls!
 */
export function connectCliffPassWall(sim,owner,jawA,jawB,center,{complete=true,withGate=true,withTower=true}={}){
  const dx=jawB.x-jawA.x,dz=jawB.z-jawA.z,len=Math.hypot(dx,dz);
  if(len<4)return {walls:[],gates:[],towers:[]};
  const angle=Math.atan2(-dz,dx),limit=sim.halfWorld-3.5;
  const placed={walls:[],gates:[],towers:[]};

  const tryPlace=(type,x,z,rot)=>{
    if(Math.abs(x)>limit||Math.abs(z)>limit||sim.isWater(x,z))return null;
    for(const e of sim.entities){
      if(e.hp>0&&e.kind==='resource'&&!e.water&&Math.hypot(e.x-x,e.z-z)<(type==='gate'?3.2:2.0))e.hp=0;
    }
    if(sim.entities.some(e=>e.hp>0&&e.kind==='building'&&Math.hypot(e.x-x,e.z-z)<(type==='wall'?1.7:e.r+1.2)))return null;
    return sim.addBuilding(type,owner,x,z,complete,{angle:rot});
  };

  const midX=(jawA.x+jawB.x)*.5,midZ=(jawA.z+jawB.z)*.5;
  if(withGate){
    const g=tryPlace('gate',midX,midZ,angle);
    if(g)placed.gates.push(g);
  }
  const steps=Math.max(2,Math.round(len/2.85));
  for(let i=0;i<=steps;i++){
    const t=i/steps;
    const wx=jawA.x+dx*t,wz=jawA.z+dz*t;
    if(withGate&&Math.hypot(wx-midX,wz-midZ)<3.15)continue;
    const w=tryPlace('wall',wx,wz,angle);
    if(w)placed.walls.push(w);
  }
  if(withTower&&center){
    const inX=center.x-midX,inZ=center.z-midZ,inLen=Math.hypot(inX,inZ)||1;
    const sideX=-dz/len,sideZ=dx/len;
    const tx=midX+(inX/inLen)*5.5+sideX*4.5,tz=midZ+(inZ/inLen)*5.5+sideZ*4.5;
    const t=tryPlace('tower',tx,tz,0);
    if(t)placed.towers.push(t);
  }
  return placed;
}

/**
 * Seeds safe, well-spaced starting timber, gold, stone, and berry patches inside a
 * settlement's natural valley territory without colliding with cliffs or buildings.
 */
export function seedValleyResources(sim,center,{radius=26,keepOutAngles=[],seedOffset=0}={}){
  const rng=seededRandom((sim.options?.seed||2026)+7717+seedOffset);
  const cx=center.x,cz=center.z;
  const angleDiff=(a,b)=>Math.abs(((a-b+Math.PI*3)%(Math.PI*2))-Math.PI);
  const safeAngles=[];
  for(let i=0;i<32;i++){
    const a=(i/32)*Math.PI*2-Math.PI;
    if(keepOutAngles.every(oa=>angleDiff(a,oa)>.38))safeAngles.push(a);
  }
  const pickSafe=idx=>safeAngles.length?safeAngles[idx%safeAngles.length]:(seedOffset*.7);
  const innerR=Math.max(12,radius-7.5);

  const tryResource=(type,x,z,amt)=>{
    if(Math.abs(x)>sim.halfWorld-5||Math.abs(z)>sim.halfWorld-5||sim.isWater(x,z))return false;
    if(Math.hypot(x-cx,z-cz)>radius-3.5)return false;
    if(sim.barriers?.some(b=>Math.hypot(b.x-x,b.z-z)<b.r+1.6))return false;
    if(sim.entities.some(e=>e.hp>0&&(e.kind==='building'&&Math.hypot(e.x-x,e.z-z)<e.r+2.2||e.kind==='unit'&&Math.hypot(e.x-x,e.z-z)<e.r+1.4||e.kind==='resource'&&Math.hypot(e.x-x,e.z-z)<1.85)))return false;
    sim.addNaturalResource(type,x,z,amt);
    return true;
  };
  const placeCluster=(type,baseAngle,offsets,amt)=>{
    let placedCount=0;
    const radialSteps=[innerR-.8,innerR-3.2,innerR+1.2,innerR-5.6];
    const angleSteps=[0,.18,-.18,.36,-.36,.58,-.58,Math.PI*.5,-Math.PI*.5,Math.PI];
    for(const da of angleSteps){
      for(const rad of radialSteps){
        const a=baseAngle+da;
        const ax=cx+Math.cos(a)*rad,az=cz+Math.sin(a)*rad;
        for(const [ox,oz] of offsets){
          if(tryResource(type,ax+ox,az+oz,amt))placedCount++;
          if(placedCount>=offsets.length)return placedCount;
        }
        if(placedCount>=Math.min(3,offsets.length))return placedCount;
      }
    }
    return placedCount;
  };

  // Protected Woodline Grove
  const woodA=pickSafe(0);
  for(let t=-4;t<=4;t++){
    const a=woodA+t*.11;
    for(const ring of [innerR+1.2,innerR-1.3]){
      tryResource('wood',cx+Math.cos(a)*ring+(rng()-.5)*1.1,cz+Math.sin(a)*ring+(rng()-.5)*1.1,280);
    }
  }
  // Protected Gold Vein, Stone Quarry & Berry Patch inside the valley territory
  placeCluster('gold',pickSafe(Math.floor(safeAngles.length*.26)),[[-1.3,-1.3],[1.3,-1.3],[-1.3,1.3],[1.3,1.3]],2200);
  placeCluster('stone',pickSafe(Math.floor(safeAngles.length*.74)),[[-1.3,-1.3],[1.3,-1.3],[-1.3,1.3],[1.3,1.3]],2200);
  placeCluster('food',pickSafe(Math.max(1,Math.floor(safeAngles.length*.5))),[[0,0],[2.3,0],[-2.3,0],[1.1,2.1],[-1.1,-2.1]],400);
}

const DIR_ANGLES={east:0,south:Math.PI/2,west:Math.PI,north:-Math.PI/2,ne:-Math.PI/4,se:Math.PI/4,sw:Math.PI*3/4,nw:-Math.PI*3/4};

/**
 * Authentic Age of Empires IV / II Regional Valley Fortification (ZERO Fake Rock Donuts!).
 *
 * Instead of wrapping a circular rock ring strictly around a Town Center:
 *  - Anchors the stronghold into LONG, SWEEPING CONTINENT MOUNTAIN SPURS & ANCIENT FOREST
 *    TRACTS that radiate naturally out into the wider battlefield & map borders!
 *  - Only the open valley approaches facing the enemy are sealed with clean, straight
 *    medieval Stone Curtain Walls + Gatehouses + Watchtowers tied directly from mountain
 *    spur to mountain spur / forest belt.
 *  - Naturally encloses spacious town grounds + safe timber, gold, stone, and berry patches!
 */
export function buildNaturalFortifiedBase(sim,owner,center,{
  radius=28,
  gates=['north','east'],
  towers=true,
  complete=true,
  wallGaps=true,
  includeResources=true,
  keepClear=[],
  seedOffset=0,
  backToBorder=true,
}={}){
  const rng=seededRandom((sim.options?.seed||2026)+4409+owner*137+seedOffset);
  const cx=center.x,cz=center.z,h=sim.halfWorld;
  const openAngles=gates.map(g=>typeof g==='number'?g:(DIR_ANGLES[g]??0));
  const placed={walls:[],gates:[],towers:[],barriers:[]};
  const rimKeep=[{x:cx,z:cz,r:Math.max(16,radius-5.0)},...keepClear];
  const distFromOrigin=Math.hypot(cx,cz);

  if(backToBorder&&distFromOrigin>26){
    // VALLEY COVE FORTIFICATION (AoE4 Altai / French Pass / Helm's Deep style):
    // Backed naturally against sweeping border mountain ranges + dense woodland flanks
    // extending out to the map edges — NEVER a circular ring stamped around the TC!
    const towardCenter=Math.atan2(-cz,-cx);
    const leftFlank=towardCenter-Math.PI*.48;
    const rightFlank=towardCenter+Math.PI*.48;
    const backDir=towardCenter+Math.PI;

    // 1. Two long sweeping natural mountain spurs extending from the outer map hills
    //    forward past the left and right flanks into the open battlefield!
    const lJaw={x:cx+Math.cos(towardCenter-.78)*radius,z:cz+Math.sin(towardCenter-.78)*radius};
    const rJaw={x:cx+Math.cos(towardCenter+.78)*radius,z:cz+Math.sin(towardCenter+.78)*radius};
    const lBack={x:Math.max(-h+4,Math.min(h-4,cx+Math.cos(leftFlank-0.45)*(radius+22))),z:Math.max(-h+4,Math.min(h-4,cz+Math.sin(leftFlank-0.45)*(radius+22)))};
    const rBack={x:Math.max(-h+4,Math.min(h-4,cx+Math.cos(rightFlank+0.45)*(radius+22))),z:Math.max(-h+4,Math.min(h-4,cz+Math.sin(rightFlank+0.45)*(radius+22)))};
    const lOuter={x:Math.max(-h+4,Math.min(h-4,lJaw.x+Math.cos(leftFlank)*24)),z:Math.max(-h+4,Math.min(h-4,lJaw.z+Math.sin(leftFlank)*24))};
    const rOuter={x:Math.max(-h+4,Math.min(h-4,rJaw.x+Math.cos(rightFlank)*24)),z:Math.max(-h+4,Math.min(h-4,rJaw.z+Math.sin(rightFlank)*24))};
    const backPeak={x:Math.max(-h+5,Math.min(h-5,cx+Math.cos(backDir)*(radius+12))),z:Math.max(-h+5,Math.min(h-5,cz+Math.sin(backDir)*(radius+12)))};

    // Sweeping back mountain massif & outer flanking ridges blending seamlessly into the continent
    placed.barriers.push(...addCurvedCliffChain(sim,[lOuter,lJaw,lBack,backPeak,rBack,rJaw,rOuter],{
      step:3.4,width:1,radius:3.2,height:4.6,wobble:2.2,keepClear:rimKeep,seedOffset:seedOffset+3,foothillTrees:true,
    }));
    // Ancient forest tracts flanking the mountain ridges outward into the wilderness
    addDenseForestBelt(sim,lBack,lOuter,{step:2.6,thickness:2,keepClear:rimKeep,seedOffset:seedOffset+17});
    addDenseForestBelt(sim,rBack,rOuter,{step:2.6,thickness:2,keepClear:rimKeep,seedOffset:seedOffset+29});

    // Anchor twin mountain promontories at the valley mouth shoulders
    const mL=addNaturalBarrier(sim,lJaw.x,lJaw.z,{r:3.9,height:6.2,kind:'mountain',angle:towardCenter,seed:seedOffset+41,keepClear:rimKeep});
    const mR=addNaturalBarrier(sim,rJaw.x,rJaw.z,{r:3.9,height:6.2,kind:'mountain',angle:towardCenter,seed:seedOffset+43,keepClear:rimKeep});
    if(mL)placed.barriers.push(mL);
    if(mR)placed.barriers.push(mR);

    // 2. Seal ONLY the open valley mouth with proud angled Stone Curtain Walls + 2 Gatehouses!
    if(wallGaps){
      // Central rocky knoll / bastion pivot splitting the front into 2 realistic castle curtain walls
      const midFront={
        x:cx+Math.cos(towardCenter)*(radius+3.5),
        z:cz+Math.sin(towardCenter)*(radius+3.5),
      };
      const midCrag=addNaturalBarrier(sim,midFront.x,midFront.z,{r:3.3,height:5.0,kind:'mountain',angle:towardCenter+Math.PI*.5,seed:seedOffset+53,keepClear:rimKeep});
      if(midCrag)placed.barriers.push(midCrag);

      for(const [aPt,bPt] of [[lJaw,midFront],[midFront,rJaw]]){
        const dx=bPt.x-aPt.x,dz=bPt.z-aPt.z,len=Math.hypot(dx,dz)||1;
        const trim=Math.min(2.2,len*.12);
        const seg=connectCliffPassWall(
          sim,owner,
          {x:aPt.x+(dx/len)*trim,z:aPt.z+(dz/len)*trim},
          {x:bPt.x-(dx/len)*trim,z:bPt.z-(dz/len)*trim},
          center,{complete,withGate:true,withTower:towers}
        );
        placed.walls.push(...seg.walls);
        placed.gates.push(...seg.gates);
        placed.towers.push(...seg.towers);
      }
    }
    if(includeResources)seedValleyResources(sim,center,{radius,keepOutAngles:[towardCenter-.3,towardCenter+.3],seedOffset:seedOffset+71});
    return placed;
  }

  // CROSSROADS HIGHLAND PLATEAU FORTIFICATION (e.g. Chapter XI central highland citadel):
  // FOUR MASSIVE CONTINENT-SPANNING MOUNTAIN RANGES radiate outward across all 4 quadrants
  // of the world (NEVER a circular donut!), converging at 4 natural mountain spurs around
  // the central plateau — and straight Stone Curtain Walls + Gatehouses seal ONLY the 4 canyon passes!
  const spurAngles=[-Math.PI*3/4,-Math.PI/4,Math.PI/4,Math.PI*3/4]; // NW, NE, SE, SW mountain ridges
  const spurs=spurAngles.map((a,idx)=>{
    const jDist=radius*1.02;
    const tip={x:cx+Math.cos(a)*jDist,z:cz+Math.sin(a)*jDist};
    const mid={x:cx+Math.cos(a+(idx%2?.12:-.12))*(jDist+24),z:cz+Math.sin(a+(idx%2?.12:-.12))*(jDist+24)};
    const far={x:Math.max(-h+8,Math.min(h-8,cx+Math.cos(a)*(jDist+52))),z:Math.max(-h+8,Math.min(h-8,cz+Math.sin(a)*(jDist+52)))};
    // Branching mountain range radiating across the whole quadrant!
    const branchA=a+(idx%2?-.42:.42);
    const branchEnd={x:Math.max(-h+10,Math.min(h-10,mid.x+Math.cos(branchA)*26)),z:Math.max(-h+10,Math.min(h-10,mid.z+Math.sin(branchA)*26))};
    placed.barriers.push(...addCurvedCliffChain(sim,[tip,mid,far],{
      step:3.4,width:2,radius:3.3,height:5.1,wobble:2.6,keepClear:rimKeep,seedOffset:seedOffset+idx*31,foothillTrees:true,
    }));
    placed.barriers.push(...addCliffRidge(sim,mid,branchEnd,{
      step:3.6,width:1,radius:3.0,height:4.5,wobble:2.2,keepClear:rimKeep,seedOffset:seedOffset+idx*31+15,foothillTrees:true,
    }));
    // Broaden each mountain shoulder flanking the plateau so walls tie flush into solid mountain flanks
    for(const off of [-.18,.18]){
      const sa=a+off;
      const sx=cx+Math.cos(sa)*(radius*.98),sz=cz+Math.sin(sa)*(radius*.98);
      const shoulder=addNaturalBarrier(sim,sx,sz,{r:3.7,height:5.8,kind:off<0?'mountain':'cliffwall',angle:sa+Math.PI*.5,seed:seedOffset+idx*19+(off<0?1:2),keepClear:rimKeep});
      if(shoulder)placed.barriers.push(shoulder);
    }
    return {a,tip};
  });

  // Connect adjacent mountain shoulders across the 4 natural canyon passes with straight castle curtain walls + Gatehouses!
  if(wallGaps){
    const passPairs=[
      {dir:-Math.PI/2,a:spurs[0],b:spurs[1]}, // North Pass (NW spur -> NE spur)
      {dir:0,a:spurs[1],b:spurs[2]},          // East Pass  (NE spur -> SE spur)
      {dir:Math.PI/2,a:spurs[2],b:spurs[3]},  // South Pass (SE spur -> SW spur)
      {dir:Math.PI,a:spurs[3],b:spurs[0]},    // West Pass  (SW spur -> NW spur)
    ];
    for(const pass of passPairs){
      const aL=pass.a.a+.22,aR=pass.b.a-.22;
      const pL={x:cx+Math.cos(aL)*(radius*.96),z:cz+Math.sin(aL)*(radius*.96)};
      const pR={x:cx+Math.cos(aR)*(radius*.96),z:cz+Math.sin(aR)*(radius*.96)};
      // Anchor mountain shoulders right on the pass edges
      const jL=addNaturalBarrier(sim,pL.x,pL.z,{r:3.7,height:6.0,kind:'mountain',angle:pass.dir+Math.PI*.5,seed:Math.floor(rng()*99999),keepClear:rimKeep});
      const jR=addNaturalBarrier(sim,pR.x,pR.z,{r:3.7,height:6.0,kind:'mountain',angle:pass.dir+Math.PI*.5,seed:Math.floor(rng()*99999),keepClear:rimKeep});
      if(jL)placed.barriers.push(jL);
      if(jR)placed.barriers.push(jR);
      const dx=pR.x-pL.x,dz=pR.z-pL.z,len=Math.hypot(dx,dz)||1;
      const trim=Math.min(2.0,len*.10);
      const seg=connectCliffPassWall(
        sim,owner,
        {x:pL.x+(dx/len)*trim,z:pL.z+(dz/len)*trim},
        {x:pR.x-(dx/len)*trim,z:pR.z-(dz/len)*trim},
        center,{complete,withGate:true,withTower:towers}
      );
      placed.walls.push(...seg.walls);
      placed.gates.push(...seg.gates);
      placed.towers.push(...seg.towers);
    }
  }
  if(includeResources)seedValleyResources(sim,center,{radius,keepOutAngles:openAngles,seedOffset:seedOffset+97});
  return placed;
}

/** Backwards-compatible alias forwarding cleanly to our regional valley architect. */
export function buildWalledCitadel(sim,owner,center,opts={}){
  return buildNaturalFortifiedBase(sim,owner,center,opts);
}

/**
 * Generates authentic, continent-wide geological cliff escarpments, mountain bluffs,
 * alpine passes, and woodland ridges across the ENTIRE map so EVERY biome feels
 * alive, varied, and tactically rich — never flat empty plains with isolated rings!
 */
export function scatterBiomeCliffs(sim,{count=4,ridgeLen=26,withMassifs=true,keepClear=[],passes=[],seedOffset=0}={}){
  const rng=seededRandom((sim.options?.seed||2026)+5113+seedOffset);
  const h=sim.halfWorld;
  const placed=[];

  // 1. Natural map-border mountain headlands anchoring the outer horizon (symmetric & fair)
  if(withMassifs){
    const borderSpots=[
      {x:-h*.82,z:-h*.76},{x:h*.82,z:h*.76},
      {x:-h*.80,z:h*.12},{x:h*.80,z:-h*.12},
    ];
    for(let i=0;i<borderSpots.length;i++){
      const pt=borderSpots[i];
      placed.push(...addMountainMassif(sim,pt.x,pt.z,{
        radius:Math.min(15,h*.14),peaks:4,passes,keepClear,seedOffset:seedOffset+i*29,withTrees:true,
      }));
    }
  }

  // 2. Mirrored organic geological cliff bluffs across midfield & flanks
  //    (mirrored across origin so competitive 1v1 / team maps remain 100% fair!)
  const pairs=Math.max(1,Math.floor(count/2));
  for(let p=0;p<pairs;p++){
    const dist=h*(.26+rng()*.46);
    const ang=rng()*Math.PI;
    const dir=ang+(rng()-.5)*1.4;
    const halfSeg=ridgeLen*(.38+rng()*.24);
    const sx=Math.cos(ang)*dist,sz=Math.sin(ang)*dist;
    const dx=Math.cos(dir)*halfSeg,dz=Math.sin(dir)*halfSeg;
    for(const sign of [1,-1]){
      const a={x:sx*sign-dx*sign,z:sz*sign-dz*sign};
      const b={x:sx*sign+dx*sign,z:sz*sign+dz*sign};
      placed.push(...addCliffRidge(sim,a,b,{
        step:3.6,width:1,radius:2.9,height:4.3,wobble:2.2,passes,keepClear,
        seedOffset:seedOffset+p*41+(sign>0?1:2),withMountains:true,foothillTrees:true,
      }));
    }
  }
  return placed;
}

/**
 * Generates authentic continent-wide natural geography across ALL Skirmish & Custom Battle maps:
 *  - Sweeping alpine mountain ranges, branching cliff spurs, dense ancient Blackwood tracts,
 *    natural regional valley coves (Bastion), and geological cliff bluffs on every biome!
 */
export function applyMapGeography(sim){
  const map=sim.options?.map;
  if(!map)return;
  const bases=(sim.players||[]).map((p,owner)=>p?.start?{x:p.start.x,z:p.start.z,owner}:null).filter(Boolean);
  // Generous clearance around every starting TC, tutorial build pad, shrines & center bridges
  const keepClear=[
    ...bases.map(b=>({x:b.x,z:b.z,r:23})),
    {x:-36,z:49,r:9},
  ];
  const h=sim.halfWorld;

  if(map==='ironpass'){
    // Classic AoE2/AoE4 Mountain Pass: Sweeping multi-branch alpine mountain chains spanning the entire continent!
    const passes=[
      {x:0,z:0,r:10.5},
      {x:-h*.42,z:-h*.42,r:10},
      {x:h*.42,z:h*.42,r:10},
    ];
    addCurvedCliffChain(sim,[
      {x:-h+5,z:-h+6},{x:-h*.52,z:-h*.46},{x:0,z:0},{x:h*.52,z:h*.46},{x:h-5,z:h-6},
    ],{step:3.4,width:2,radius:3.2,height:5.1,wobble:2.8,passes,keepClear,seedOffset:11,foothillTrees:true});
    // Branching outer mountain ridges & foothill valleys across both halves of the realm
    addCurvedCliffChain(sim,[{x:-h*.86,z:h*.16},{x:-h*.55,z:h*.08},{x:-h*.24,z:h*.06}],{step:3.5,width:1,radius:3.0,height:4.5,wobble:2.2,passes,keepClear,seedOffset:23,foothillTrees:true});
    addCurvedCliffChain(sim,[{x:h*.24,z:-h*.06},{x:h*.55,z:-h*.08},{x:h*.86,z:-h*.16}],{step:3.5,width:1,radius:3.0,height:4.5,wobble:2.2,passes,keepClear,seedOffset:37,foothillTrees:true});
    addMountainMassif(sim,-h*.78,h*.74,{radius:13,peaks:4,passes,keepClear,seedOffset:41});
    addMountainMassif(sim,h*.78,-h*.74,{radius:13,peaks:4,passes,keepClear,seedOffset:43});
    for(const [mx,mz,t] of [[-12,-14,'gold'],[12,14,'gold'],[-16,10,'stone'],[16,-10,'stone']]){
      if(!barrierCollision(sim,'mine',mx,mz,2)&&!sim.isWater(mx,mz))sim.addNaturalResource(t,mx,mz,2200);
    }
  }else if(map==='blackwood'){
    // Classic AoE2 Black Forest: Sprawling ancient forest belts & granite outcrops covering the whole world!
    const passes=[
      {x:0,z:0,r:10},
      {x:-h*.38,z:-h*.38,r:9.5},
      {x:h*.38,z:h*.38,r:9.5},
    ];
    addDenseForestBelt(sim,{x:-h+6,z:-h+6},{x:h-6,z:h-6},{step:2.45,thickness:4,passes,keepClear,seedOffset:41});
    addDenseForestBelt(sim,{x:-h+8,z:h*.22},{x:-h*.25,z:h*.12},{step:2.6,thickness:3,passes,keepClear,seedOffset:47});
    addDenseForestBelt(sim,{x:h*.25,z:-h*.12},{x:h-8,z:-h*.22},{step:2.6,thickness:3,passes,keepClear,seedOffset:53});
    scatterBiomeCliffs(sim,{count:4,ridgeLen:20,withMassifs:true,keepClear,passes,seedOffset:59});
  }else if(map==='bastion'){
    // Authentic AoE4 Altai / French Pass Fortified Valleys:
    // Continent-wide mountain ranges, forested coves, and central contested ridges —
    // each kingdom sits backed naturally against a real mountain massif with straight curtain walls sealing ONLY its valley mouth!
    const bastionR=sim.worldSize>=240?30:25;
    for(const base of bases){
      buildNaturalFortifiedBase(sim,base.owner,base,{
        radius:bastionR,
        towers:true,
        complete:true,
        wallGaps:true,
        includeResources:true,
        keepClear:bases.filter(o=>o.owner!==base.owner).map(o=>({x:o.x,z:o.z,r:bastionR+6})),
        seedOffset:base.owner*19,
        backToBorder:true,
      });
    }
    // Sweeping mid-continent mountain ridges & natural contested canyons across the open center!
    const centerKeep=[...bases.map(b=>({x:b.x,z:b.z,r:bastionR+8})),{x:0,z:0,r:13}];
    const centerPasses=[{x:0,z:0,r:13}];
    addCurvedCliffChain(sim,[{x:-h*.84,z:-h*.80},{x:-h*.46,z:-h*.52},{x:-h*.18,z:-h*.34}],{step:3.5,width:1,radius:3.1,height:4.8,wobble:2.4,passes:centerPasses,keepClear:centerKeep,seedOffset:61,foothillTrees:true});
    addCurvedCliffChain(sim,[{x:h*.18,z:h*.34},{x:h*.46,z:h*.52},{x:h*.84,z:h*.80}],{step:3.5,width:1,radius:3.1,height:4.8,wobble:2.4,passes:centerPasses,keepClear:centerKeep,seedOffset:67,foothillTrees:true});
    addMountainMassif(sim,-h*.76,h*.14,{radius:12,peaks:3,passes:centerPasses,keepClear:centerKeep,seedOffset:71});
    addMountainMassif(sim,h*.76,-h*.14,{radius:12,peaks:3,passes:centerPasses,keepClear:centerKeep,seedOffset:73});
  }else if(['highland','volcanic','canyon','arid','tundra'].includes(map)){
    // Rugged Rocky / Mesa / Volcanic / Alpine Biomes: Rich dramatic continent-wide cliff formations & mountain ridges!
    const passes=[{x:0,z:0,r:14},{x:-26,z:0,r:12},{x:26,z:0,r:12}];
    addCurvedCliffChain(sim,[{x:-h*.74,z:-h*.18},{x:-h*.45,z:-h*.22},{x:-h*.20,z:-h*.14}],{step:3.6,width:1,radius:3.0,height:4.6,wobble:2.4,passes,keepClear,seedOffset:81,foothillTrees:map!=='arid'&&map!=='volcanic'});
    addCurvedCliffChain(sim,[{x:h*.20,z:h*.14},{x:h*.45,z:h*.22},{x:h*.74,z:h*.18}],{step:3.6,width:1,radius:3.0,height:4.6,wobble:2.4,passes,keepClear,seedOffset:83,foothillTrees:map!=='arid'&&map!=='volcanic'});
    scatterBiomeCliffs(sim,{count:6,ridgeLen:24,withMassifs:true,keepClear,passes,seedOffset:89});
  }else if(['highlands','woodland','winter','desert'].includes(map)){
    // Classic Open & Woodland Biomes (Arabia / Emerald Highlands / Deepwood / Winterwood):
    // Realistic natural cliff bluffs & border mountain headlands so players can scout & wall between cliffs & forests!
    const passes=[{x:0,z:0,r:15}];
    scatterBiomeCliffs(sim,{count:4,ridgeLen:20,withMassifs:true,keepClear,passes,seedOffset:101});
  }
}
