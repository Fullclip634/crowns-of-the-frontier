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

function isSiteBlockedForBarrier(sim,x,z,r,passes=[],keepClear=[],replaceStartForest=false){
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
    const protectedResource=e.kind==='resource'&&(e.startDeposit!==undefined||!replaceStartForest&&e.startForest!==undefined);
    const pad=e.kind==='building'?e.r+r+1.6:e.kind==='unit'?e.r+r+1.4:e.kind==='shrine'?e.r+r+4.5:protectedResource?e.r+r+.45:0;
    if(pad>0&&Math.hypot(e.x-x,e.z-z)<pad)return true;
  }
  return false;
}

/** Adds a single impassable Blender-authored cliffwall escarpment or alpine mountain peak. */
export function addNaturalBarrier(sim,x,z,{r=3.1,height=4.2,kind='cliffwall',angle=0,seed=0,passes=[],keepClear=[],replaceStartForest=false}={}){
  if(isSiteBlockedForBarrier(sim,x,z,r,passes,keepClear,replaceStartForest))return null;
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
    let t;
    if(sim.battlefieldLayout>=1){
      const inward=Math.sign(inX*sideX+inZ*sideZ)||1;
      for(const flank of [1,-1]){
        const x=midX+sideX*inward*6+dx/len*flank*6,z=midZ+sideZ*inward*6+dz/len*flank*6;
        if(barrierCollision(sim,'tower',x,z,2)||sim.entities.some(e=>e.hp>0&&e.kind==='building'&&Math.hypot(e.x-x,e.z-z)<e.r+2.25))continue;
        t=tryPlace('tower',x,z,0);
        if(t)break;
      }
    }else{
      const x=midX+inX/inLen*5.5+sideX*4.5,z=midZ+inZ/inLen*5.5+sideZ*4.5;
      t=tryPlace('tower',x,z,0);
    }
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

// Decorative spurs and loose woodland do not reliably close the side of a
// fortress. Interlock visible cliff pieces along its back and shoulders.
function closeValleyRim(sim,center,radius,front,left,right,keepClear,seedOffset){
  const edge=sim.halfWorld-4,arc=[right];
  for(let i=1;i<10;i++){
    const a=i/10*(2*Math.PI-1.56),angle=front+.78+a,reach=radius+12*Math.sin(a*Math.PI/(2*Math.PI-1.56));
    arc.push({
      x:Math.max(-edge,Math.min(edge,center.x+Math.cos(angle)*reach)),
      z:Math.max(-edge,Math.min(edge,center.z+Math.sin(angle)*reach)),
    });
  }
  arc.push(left);
  const barriers=[];
  for(let i=0;i<arc.length-1;i++){
    const from=arc[i],to=arc[i+1],dx=to.x-from.x,dz=to.z-from.z;
    const count=Math.max(1,Math.ceil(Math.hypot(dx,dz)/3.4)),angle=Math.atan2(-dz,dx);
    for(let j=0;j<=count;j++){
      const x=from.x+dx*j/count,z=from.z+dz*j/count;
      const barrier=addNaturalBarrier(sim,x,z,{
        r:3.65,height:3.9,angle,seed:seedOffset*109+i*31+j+1,keepClear,replaceStartForest:true,
      });
      if(barrier)barriers.push(barrier);
    }
  }
  return barriers;
}

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
  compactForest=false,
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

    // Lush natural forest-and-mountain cove: massive mossy cliff headlands framing the shoulders +
    // thick sweeping ancient woodland tracts wrapping the rear & flanks (never a bare grey rock bowl!)
    placed.barriers.push(...addCurvedCliffChain(sim,[lOuter,lJaw,lBack],{
      step:3.5,width:1,radius:3.2,height:4.7,wobble:2.3,keepClear:rimKeep,seedOffset:seedOffset+3,foothillTrees:!compactForest,
    }));
    placed.barriers.push(...addCurvedCliffChain(sim,[rBack,rJaw,rOuter],{
      step:3.5,width:1,radius:3.2,height:4.7,wobble:2.3,keepClear:rimKeep,seedOffset:seedOffset+9,foothillTrees:!compactForest,
    }));
    placed.barriers.push(...addMountainMassif(sim,backPeak.x,backPeak.z,{
      radius:10,peaks:3,keepClear:rimKeep,seedOffset:seedOffset+13,withTrees:!compactForest,
    }));
    // Dense sprawling ancient forests weaving naturally behind the cove & out into the wilderness
    const beltStep=compactForest?4.6:2.4,beltThick=compactForest?1:3,flankThick=compactForest?1:2;
    addDenseForestBelt(sim,lBack,backPeak,{step:beltStep,thickness:beltThick,keepClear:rimKeep,seedOffset:seedOffset+17});
    addDenseForestBelt(sim,backPeak,rBack,{step:beltStep,thickness:beltThick,keepClear:rimKeep,seedOffset:seedOffset+23});
    addDenseForestBelt(sim,lBack,lOuter,{step:beltStep+.2,thickness:flankThick,keepClear:rimKeep,seedOffset:seedOffset+29});
    addDenseForestBelt(sim,rBack,rOuter,{step:beltStep+.2,thickness:flankThick,keepClear:rimKeep,seedOffset:seedOffset+31});

    // Anchor twin mountain promontories at the valley mouth shoulders
    const mL=addNaturalBarrier(sim,lJaw.x,lJaw.z,{r:3.9,height:6.2,kind:'mountain',angle:towardCenter,seed:seedOffset+41,keepClear:rimKeep});
    const mR=addNaturalBarrier(sim,rJaw.x,rJaw.z,{r:3.9,height:6.2,kind:'mountain',angle:towardCenter,seed:seedOffset+43,keepClear:rimKeep});
    if(mL)placed.barriers.push(mL);
    if(mR)placed.barriers.push(mR);

    // 2. Seal ONLY the open valley mouth with proud angled Stone Curtain Walls + 2 Gatehouses!
    if(wallGaps){
      if(sim.battlefieldLayout>=1)placed.barriers.push(...closeValleyRim(sim,center,radius,towardCenter,lJaw,rJaw,rimKeep,seedOffset));
      // Central rocky knoll / bastion pivot splitting the front into 2 realistic castle curtain walls
      const midFront={
        x:cx+Math.cos(towardCenter)*(radius+3.5),
        z:cz+Math.sin(towardCenter)*(radius+3.5),
      };
      const midCrag=addNaturalBarrier(sim,midFront.x,midFront.z,{r:3.3,height:5.0,kind:'mountain',angle:towardCenter+Math.PI*.5,seed:seedOffset+53,keepClear:rimKeep,replaceStartForest:sim.battlefieldLayout>=1});
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
    // Clear stray random field trees from the inner building courtyard so players have a HUGE open
    // uncompressed buildable town plaza while sheltered outer groves & mines sit cleanly along the rim!
    const clearInnerR=Math.max(18,radius-10);
    for(const e of sim.entities){
      if(e.hp>0&&e.kind==='resource'&&e.type==='wood'&&Math.hypot(e.x-cx,e.z-cz)<clearInnerR)e.hp=0;
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
 * Authentic Age of Empires IV Woodland Glade Architect (inspired by lush forested valleys):
 *
 *  - Leaves a WIDE, OPEN, SUNLIT MEADOW GLADE (gladeRadius 28–36m!) around the base so
 *    players have generous open ground to build a grand city with zero crowding.
 *  - Surrounds ~65% of the glade with THICK, SWEEPING ANCIENT WOODLAND LOBES (4–6 trees deep)
 *    blending organically into the wider wilderness, plus ONE dramatic mossy granite bluff
 *    massif anchoring one flank!
 *  - Leaves ONLY 2–3 narrow open meadow passes (14–18m wide) so players can lock down a
 *    HUGE territory with just a handful of short forest-to-cliff or forest-to-forest walls!
 */
export function buildWoodlandGladePocket(sim,center,{
  gladeRadius=30,
  passes=3,
  bluffSide=null,
  keepClear=[],
  seedOffset=0,
  includeResources=true,
}={}){
  const rng=seededRandom((sim.options?.seed||2026)+8849+seedOffset);
  const cx=center.x,cz=center.z;
  const towardCenter=Math.atan2(-cz,-cx);
  // 2–3 natural narrow meadow corridors opening cleanly toward the wider battlefield
  const openAngles=passes===2
    ?[towardCenter-.48,towardCenter+.48]
    :[towardCenter,towardCenter-1.08,towardCenter+1.08];
  const passHalf=Math.max(.24,Math.min(.34,7.8/Math.max(18,gladeRadius)));
  const angleDiff=(a,b)=>Math.abs(((a-b+Math.PI*3)%(Math.PI*2))-Math.PI);

  // Clear stray random field trees inside the sunny central building meadow so players get a HUGE
  // clean sunlit glade (just like AoE4!) surrounded by thick ancient woodlands on the outer rim!
  const clearInnerR=Math.max(20,gladeRadius-6.5);
  for(const e of sim.entities){
    if(e.hp>0&&e.kind==='resource'&&e.type==='wood'&&Math.hypot(e.x-cx,e.z-cz)<clearInnerR)e.hp=0;
  }

  // Place ONE dramatic mossy granite bluff massif organically on one shoulder of the glade
  const bluffAngle=bluffSide??(towardCenter-Math.PI*.62);
  const bluffDist=gladeRadius+6.5;
  const bx=cx+Math.cos(bluffAngle)*bluffDist,bz=cz+Math.sin(bluffAngle)*bluffDist;
  const bluffKeep=[{x:cx,z:cz,r:gladeRadius-2.5},...keepClear];
  const barriers=addMountainMassif(sim,bx,bz,{
    radius:11,peaks:4,keepClear:bluffKeep,seedOffset:seedOffset+11,withTrees:true,
  });

  // Plant thick, organic multi-row ancient woodland tracts around all non-pass, non-bluff arcs
  const ringSteps=Math.max(36,Math.round((2*Math.PI*gladeRadius)/2.6));
  let trees=0;
  for(let i=0;i<ringSteps;i++){
    const a=(i/ringSteps)*Math.PI*2-Math.PI;
    if(openAngles.some(oa=>angleDiff(a,oa)<passHalf))continue;
    if(angleDiff(a,bluffAngle)<.36)continue;
    const edgeWobble=Math.sin(a*3+seedOffset)*3.0+Math.cos(a*5-seedOffset)*1.8;
    const depthLayers=3+Math.floor((Math.sin(a*2.3+seedOffset)*.5+.5)*3); // 3 to 5 trees deep!
    for(let layer=0;layer<depthLayers;layer++){
      const rad=gladeRadius+edgeWobble+layer*2.7+(rng()-.5)*1.4;
      const tx=cx+Math.cos(a)*rad+(rng()-.5)*1.2;
      const tz=cz+Math.sin(a)*rad+(rng()-.5)*1.2;
      if(Math.abs(tx)>sim.halfWorld-4||Math.abs(tz)>sim.halfWorld-4||sim.isWater(tx,tz))continue;
      if(bridgeFootprint(sim.options?.map,tx,tz,4.5))continue;
      if(keepClear.some(p=>Math.hypot(tx-p.x,tz-p.z)<(p.r||20)))continue;
      if(sim.barriers?.some(b=>Math.hypot(b.x-tx,b.z-tz)<b.r+1.5))continue;
      if(sim.entities.some(e=>e.hp>0&&(e.kind==='building'&&Math.hypot(e.x-tx,e.z-tz)<e.r+2.4||e.kind==='unit'&&Math.hypot(e.x-tx,e.z-tz)<e.r+1.5||e.kind==='resource'&&Math.hypot(e.x-tx,e.z-tz)<1.85)))continue;
      sim.addNaturalResource('wood',tx,tz,280);
      trees++;
    }
  }
  if(includeResources)seedValleyResources(sim,center,{radius:gladeRadius-1,keepOutAngles:openAngles,seedOffset:seedOffset+53});
  return {barriers,trees,openAngles};
}

/**
 * Generates authentic continent-wide natural geography across ALL Skirmish & Custom Battle maps:
 *  - Sweeping alpine mountain ranges, lush AoE4 Timbervale forest glades with mossy bluffs,
 *    dense ancient Blackwood tracts, regional valley coves (Bastion), and geological cliff bluffs!
 */
export function applyMapGeography(sim){
  const map=sim.options?.map;
  if(!map)return;
  const bases=(sim.players||[]).map((p,owner)=>p?.start?{x:p.start.x,z:p.start.z,owner}:null).filter(Boolean);
  // Generous clearance around every starting TC, tutorial build pad, shrines & center bridges
  const keepClear=[
    ...bases.map(b=>({x:b.x,z:b.z,r:24})),
    {x:-36,z:49,r:9},
  ];
  const h=sim.halfWorld;
  let minBaseDist=Infinity;
  for(let i=0;i<bases.length;i++)for(let j=i+1;j<bases.length;j++){
    minBaseDist=Math.min(minBaseDist,Math.hypot(bases[i].x-bases[j].x,bases[i].z-bases[j].z));
  }
  const adaptiveGladeR=Math.round(Math.min(38,Math.max(26,Number.isFinite(minBaseDist)?minBaseDist*.38:38)));

  if(map==='timbervale'){
    // Authentic AoE4 Sunlit Woodland Glades:
    // Vast open sunny building meadows (38m radius = 76m wide!) framed by thick sprawling ancient forests + mossy granite bluffs,
    // leaving only 2–3 narrow grassy passes per glade so players save massive wall cost naturally!
    const gladeR=sim.worldSize>=240?Math.min(38,adaptiveGladeR):Math.min(30,adaptiveGladeR);
    for(const base of bases){
      const otherKeep=bases.filter(o=>o.owner!==base.owner).map(o=>({x:o.x,z:o.z,r:gladeR+4}));
      buildWoodlandGladePocket(sim,base,{
        gladeRadius:gladeR,
        passes:3,
        keepClear:[...otherKeep,{x:-36,z:49,r:10}],
        seedOffset:base.owner*41+13,
        includeResources:true,
      });
    }
    // Sweeping wilderness forest tracts & mossy cliff headlands across the open center & borders!
    const midKeep=[...bases.map(b=>({x:b.x,z:b.z,r:gladeR+2})),{x:0,z:0,r:16}];
    const midPasses=[{x:0,z:0,r:15},{x:-h*.35,z:-h*.35,r:12},{x:h*.35,z:h*.35,r:12}];
    addDenseForestBelt(sim,{x:-h*.86,z:-h*.76},{x:-h*.18,z:-h*.24},{step:2.55,thickness:3,passes:midPasses,keepClear:midKeep,seedOffset:211});
    addDenseForestBelt(sim,{x:h*.18,z:h*.24},{x:h*.86,z:h*.76},{step:2.55,thickness:3,passes:midPasses,keepClear:midKeep,seedOffset:217});
    addMountainMassif(sim,-h*.72,h*.10,{radius:12,peaks:4,passes:midPasses,keepClear:midKeep,seedOffset:223});
    addMountainMassif(sim,h*.72,-h*.10,{radius:12,peaks:4,passes:midPasses,keepClear:midKeep,seedOffset:229});
    addMountainMassif(sim,-h*.14,-h*.72,{radius:11,peaks:3,passes:midPasses,keepClear:midKeep,seedOffset:233});
    addMountainMassif(sim,h*.14,h*.72,{radius:11,peaks:3,passes:midPasses,keepClear:midKeep,seedOffset:239});
  }else if(map==='ironpass'){
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
    // Continent-wide mountain ranges, forested coves (36m radius = 72m wide!), and central contested ridges —
    // each kingdom sits backed naturally against a real mountain massif with straight curtain walls sealing ONLY its valley mouth!
    const bastionR=sim.worldSize>=240?Math.min(36,adaptiveGladeR):Math.min(29,adaptiveGladeR);
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
  }else if(map==='ironring'){
    // Campaign Ch. XI inspired — Ring of Iron:
    // Four sweeping alpine mountain chains radiate from a rich central highland arena
    // with 4 wide gateable passes (N/E/S/W), leaving vast buildable outer coves for 2–8 kingdoms!
    const ringR=Math.min(52,Math.max(30,h*.28));
    const ringKeep=[...bases.map(b=>({x:b.x,z:b.z,r:Math.min(38,adaptiveGladeR)})),{x:0,z:0,r:ringR-8},{x:0,z:-ringR,r:13},{x:ringR,z:0,r:13},{x:0,z:ringR,r:13},{x:-ringR,z:0,r:13}];
    const ringPasses=[{x:0,z:-ringR,r:12},{x:ringR,z:0,r:12},{x:0,z:ringR,r:12},{x:-ringR,z:0,r:12}];
    const diagAngles=[-Math.PI*.75,-Math.PI*.25,Math.PI*.25,Math.PI*.75];
    diagAngles.forEach((a,idx)=>{
      const inner={x:Math.cos(a)*ringR,z:Math.sin(a)*ringR};
      const mid={x:Math.cos(a)*(ringR+h*.22),z:Math.sin(a)*(ringR+h*.22)};
      const far={x:Math.cos(a)*(h*.72),z:Math.sin(a)*(h*.72)};
      addCurvedCliffChain(sim,[inner,mid,far],{step:3.5,width:2,radius:3.2,height:5.1,wobble:2.6,passes:ringPasses,keepClear:ringKeep,seedOffset:311+idx*29,foothillTrees:true});
      const arcL={x:Math.cos(a-.26)*ringR,z:Math.sin(a-.26)*ringR};
      const arcR={x:Math.cos(a+.26)*ringR,z:Math.sin(a+.26)*ringR};
      addCliffRidge(sim,arcL,arcR,{step:3.4,width:1,radius:3.1,height:4.9,wobble:1.3,passes:ringPasses,keepClear:ringKeep,seedOffset:323+idx*17,foothillTrees:true});
    });
    // Rich contested gold & stone seams inside the central Iron Ring basin
    for(const [mx,mz,t] of [[-16,-16,'gold'],[16,16,'gold'],[-16,16,'stone'],[16,-16,'stone'],[0,-22,'gold'],[0,22,'stone']]){
      if(!barrierCollision(sim,'mine',mx,mz,2)&&!sim.isWater(mx,mz)&&!bases.some(b=>Math.hypot(b.x-mx,b.z-mz)<22))sim.addNaturalResource(t,mx,mz,2400);
    }
    scatterBiomeCliffs(sim,{count:4,ridgeLen:24,withMassifs:true,keepClear:ringKeep,passes:ringPasses,seedOffset:341});
  }else if(map==='sunderedpass'){
    // Campaign Ch. XII inspired — Sundered Pass:
    // Colossal North-to-South continental mountain spine pierced by ONLY 3 narrow alpine passes
    // + lush sunlit woodland glades framing each kingdom's spacious starting valley!
    const passes=[{x:0,z:-h*.52,r:12.5},{x:0,z:0,r:13},{x:0,z:h*.52,r:12.5}];
    const spineKeep=[...bases.map(b=>({x:b.x,z:b.z,r:Math.min(36,adaptiveGladeR)})),...passes];
    addCurvedCliffChain(sim,[
      {x:-2,z:-h+7},{x:3,z:-h*.34},{x:-3,z:h*.34},{x:2,z:h-7},
    ],{step:3.4,width:2,radius:3.3,height:5.3,wobble:2.8,passes,keepClear:spineKeep,seedOffset:411,foothillTrees:true});
    // Lush sunlit woodland glade framing every kingdom with natural cheap-to-wall flanks
    for(const base of bases){
      const otherKeep=[...bases.filter(o=>o.owner!==base.owner).map(o=>({x:o.x,z:o.z,r:adaptiveGladeR+4})),...passes,{x:0,z:0,r:18}];
      buildWoodlandGladePocket(sim,base,{
        gladeRadius:Math.min(36,adaptiveGladeR),passes:3,keepClear:otherKeep,seedOffset:base.owner*37+421,includeResources:false,
      });
    }
    for(const [mx,mz,t] of [[-18,-h*.52,'gold'],[18,h*.52,'gold'],[-18,0,'stone'],[18,0,'stone']]){
      if(!barrierCollision(sim,'mine',mx,mz,2)&&!sim.isWater(mx,mz)&&!bases.some(b=>Math.hypot(b.x-mx,b.z-mz)<22))sim.addNaturalResource(t,mx,mz,2400);
    }
    scatterBiomeCliffs(sim,{count:4,ridgeLen:22,withMassifs:true,keepClear:spineKeep,passes,seedOffset:439});
  }else if(map==='oakhold'){
    // Campaign Ch. XIII & AoE4 inspired — Oakhold Glades:
    // Vast sunlit woodland clearings + mossy granite bluffs + crisscrossing ancient forest trails!
    for(const base of bases){
      const otherKeep=[...bases.filter(o=>o.owner!==base.owner).map(o=>({x:o.x,z:o.z,r:adaptiveGladeR+4})),{x:0,z:0,r:20},{x:-36,z:49,r:10}];
      buildWoodlandGladePocket(sim,base,{
        gladeRadius:adaptiveGladeR,passes:3,keepClear:otherKeep,seedOffset:base.owner*43+509,includeResources:false,
      });
    }
    const midKeep=[...bases.map(b=>({x:b.x,z:b.z,r:adaptiveGladeR+2})),{x:0,z:0,r:22}];
    const midPasses=[{x:0,z:0,r:18},{x:-h*.42,z:-h*.34,r:12},{x:h*.42,z:h*.34,r:12},{x:-h*.34,z:h*.42,r:12},{x:h*.34,z:-h*.42,r:12}];
    addDenseForestBelt(sim,{x:-h*.86,z:-h*.74},{x:h*.86,z:h*.74},{step:2.5,thickness:4,passes:midPasses,keepClear:midKeep,seedOffset:521});
    addDenseForestBelt(sim,{x:-h*.74,z:h*.82},{x:h*.74,z:-h*.82},{step:2.55,thickness:3,passes:midPasses,keepClear:midKeep,seedOffset:527});
    for(const [mx,mz,t] of [[-12,-10,'gold'],[12,10,'gold'],[-10,12,'stone'],[10,-12,'stone']]){
      if(!barrierCollision(sim,'mine',mx,mz,2)&&!sim.isWater(mx,mz)&&!bases.some(b=>Math.hypot(b.x-mx,b.z-mz)<22))sim.addNaturalResource(t,mx,mz,2400);
    }
    scatterBiomeCliffs(sim,{count:4,ridgeLen:20,withMassifs:true,keepClear:midKeep,passes:midPasses,seedOffset:541});
  }else if(map==='threecrowns'){
    // Campaign Ch. XIV inspired — Three Crowns Crossing:
    // Twin sapphire rivers + stone bridges + towering northern & southern granite cliff escarpments!
    const bridgeKeep=[...bases.map(b=>({x:b.x,z:b.z,r:Math.min(36,adaptiveGladeR)})),{x:-26,z:0,r:20},{x:26,z:0,r:20},{x:0,z:0,r:18}];
    addCliffRidge(sim,{x:-14,z:-h*.88},{x:14,z:-h*.46},{step:3.6,width:1,radius:3.2,height:5.0,wobble:2.2,keepClear:bridgeKeep,seedOffset:611,foothillTrees:true});
    addCliffRidge(sim,{x:-14,z:h*.46},{x:14,z:h*.88},{step:3.6,width:1,radius:3.2,height:5.0,wobble:2.2,keepClear:bridgeKeep,seedOffset:613,foothillTrees:true});
    for(const [mx,mz,t] of [[0,-26,'gold'],[0,26,'gold'],[-8,-16,'stone'],[8,16,'stone']]){
      if(!barrierCollision(sim,'mine',mx,mz,2)&&!sim.isWater(mx,mz))sim.addNaturalResource(t,mx,mz,2400);
    }
    scatterBiomeCliffs(sim,{count:6,ridgeLen:24,withMassifs:true,keepClear:bridgeKeep,passes:[{x:-26,z:0,r:20},{x:26,z:0,r:20}],seedOffset:619});
  }else if(map==='emberroad'){
    // Campaign Ch. VII inspired — The Ember Road:
    // Dramatic volcanic basalt cliff ranges carving a commanding central Ash Pass & twin scorched gorges!
    const passes=[{x:0,z:0,r:14},{x:-h*.46,z:-h*.42,r:12},{x:h*.46,z:h*.42,r:12}];
    const ashKeep=[...bases.map(b=>({x:b.x,z:b.z,r:Math.min(36,adaptiveGladeR)})),...passes];
    addCurvedCliffChain(sim,[{x:-h+7,z:-h+9},{x:-h*.48,z:-h*.44},{x:-16,z:-15}],{step:3.4,width:2,radius:3.3,height:5.2,wobble:2.5,passes,keepClear:ashKeep,seedOffset:711,foothillTrees:false});
    addCurvedCliffChain(sim,[{x:16,z:15},{x:h*.48,z:h*.44},{x:h-7,z:h-9}],{step:3.4,width:2,radius:3.3,height:5.2,wobble:2.5,passes,keepClear:ashKeep,seedOffset:713,foothillTrees:false});
    for(const [mx,mz,t] of [[-16,14,'gold'],[16,-14,'gold'],[-22,4,'stone'],[22,-4,'stone']]){
      if(!barrierCollision(sim,'mine',mx,mz,2)&&!sim.isWater(mx,mz))sim.addNaturalResource(t,mx,mz,2400);
    }
    scatterBiomeCliffs(sim,{count:6,ridgeLen:26,withMassifs:true,keepClear:ashKeep,passes,seedOffset:719});
  }else if(map==='frostvale'){
    // Campaign Ch. IX inspired — Frostmarch Vale:
    // Sheltered snowy alpine valley coves backed by snow-capped mountain spurs & blue-spruce belts
    // (unwalled natural coves so players build minimal walls across the cove mouth!).
    const coveR=Math.min(36,adaptiveGladeR);
    for(const base of bases){
      buildNaturalFortifiedBase(sim,base.owner,base,{
        radius:coveR,
        towers:false,
        complete:true,
        wallGaps:false,
        includeResources:false,
        keepClear:bases.filter(o=>o.owner!==base.owner).map(o=>({x:o.x,z:o.z,r:coveR+6})),
        seedOffset:base.owner*29+811,
        backToBorder:true,
      });
    }
    const snowKeep=[...bases.map(b=>({x:b.x,z:b.z,r:coveR+6})),{x:0,z:0,r:16}];
    scatterBiomeCliffs(sim,{count:6,ridgeLen:24,withMassifs:true,keepClear:snowKeep,passes:[{x:0,z:0,r:16}],seedOffset:823});
  }else if(map==='waterfallgorge'){
    // Epic Frontier — Waterfall Gorge (Images 4 & 10):
    // Towering waterfall headwater cliffs in the north, sweeping canyon shoulders, central stone bridge,
    // southern timber trestle bridge, and crossable shallow northern flank ford!
    const gorgeKeep=[...bases.map(b=>({x:b.x,z:b.z,r:Math.min(34,adaptiveGladeR)})),{x:0,z:0,r:20},{x:4,z:46,r:18},{x:0,z:-44,r:18}];
    const passes=[{x:0,z:0,r:18},{x:4,z:46,r:16},{x:0,z:-44,r:17}];
    addCurvedCliffChain(sim,[{x:-h*.68,z:-h*.84},{x:-26,z:-h*.76},{x:-16,z:-h*.62}],{step:3.5,width:2,radius:3.2,height:5.2,wobble:1.8,passes,keepClear:gorgeKeep,seedOffset:911,foothillTrees:true});
    addCurvedCliffChain(sim,[{x:16,z:-h*.62},{x:26,z:-h*.76},{x:h*.68,z:-h*.84}],{step:3.5,width:2,radius:3.2,height:5.2,wobble:1.8,passes,keepClear:gorgeKeep,seedOffset:913,foothillTrees:true});
    addCliffRidge(sim,{x:-22,z:14},{x:-20,z:32},{step:3.5,width:1,radius:3.0,height:4.6,wobble:1.4,passes,keepClear:gorgeKeep,seedOffset:915,foothillTrees:true});
    addCliffRidge(sim,{x:22,z:14},{x:20,z:32},{step:3.5,width:1,radius:3.0,height:4.6,wobble:1.4,passes,keepClear:gorgeKeep,seedOffset:917,foothillTrees:true});
    for(const [mx,mz,t] of [[-26,-44,'gold'],[26,-44,'gold'],[-28,46,'stone'],[28,46,'stone']]){
      if(!barrierCollision(sim,'mine',mx,mz,2)&&!sim.isWater(mx,mz))sim.addNaturalResource(t,mx,mz,2400);
    }
    scatterBiomeCliffs(sim,{count:5,ridgeLen:22,withMassifs:true,keepClear:gorgeKeep,passes,seedOffset:919});
    sim.battlefieldProps.push(
      {kind:'tent',x:-26,z:16,rot:.4},{kind:'campfire',x:-22,z:19},
      {kind:'tent',x:28,z:-16,rot:-2.5},{kind:'campfire',x:24,z:-19},
      {kind:'crates',x:-24,z:42},{kind:'crates',x:26,z:42},
    );
  }else if(map==='frostfallsiege'){
    // Epic Frontier — Frostfall Siege (Image 7):
    // Snow-capped waterfall cliffs, frozen gorge river with drifting ice floes, twin crossings & war-camps!
    const frostKeep=[...bases.map(b=>({x:b.x,z:b.z,r:Math.min(34,adaptiveGladeR)})),{x:-6,z:0,r:20},{x:-1,z:46,r:18},{x:-6,z:-48,r:18}];
    const passes=[{x:-6,z:0,r:18},{x:-1,z:46,r:16},{x:-6,z:-48,r:17}];
    addCurvedCliffChain(sim,[{x:-h*.76,z:-h*.84},{x:-34,z:-h*.74},{x:-20,z:-h*.60}],{step:3.4,width:2,radius:3.3,height:5.5,wobble:1.9,passes,keepClear:frostKeep,seedOffset:931,foothillTrees:true});
    addCurvedCliffChain(sim,[{x:12,z:-h*.60},{x:28,z:-h*.74},{x:h*.72,z:-h*.84}],{step:3.4,width:2,radius:3.3,height:5.5,wobble:1.9,passes,keepClear:frostKeep,seedOffset:933,foothillTrees:true});
    addMountainMassif(sim,-h*.72,h*.66,{radius:14,peaks:4,passes,keepClear:frostKeep,seedOffset:935});
    addMountainMassif(sim,h*.72,-h*.58,{radius:14,peaks:4,passes,keepClear:frostKeep,seedOffset:937});
    for(const [mx,mz,t] of [[-28,-22,'gold'],[24,22,'gold'],[-30,26,'stone'],[26,-26,'stone']]){
      if(!barrierCollision(sim,'mine',mx,mz,2)&&!sim.isWater(mx,mz))sim.addNaturalResource(t,mx,mz,2400);
    }
    scatterBiomeCliffs(sim,{count:6,ridgeLen:24,withMassifs:true,keepClear:frostKeep,passes,seedOffset:939});
    sim.battlefieldProps.push(
      {kind:'tent',x:24,z:-18,rot:-1.2},{kind:'tent',x:30,z:-12,rot:-2.1},{kind:'campfire',x:26,z:-13},
      {kind:'stakes',x:14,z:-10,rot:-1.5},{kind:'stakes',x:14,z:10,rot:-1.5},
      {kind:'crates',x:-26,z:16},{kind:'campfire',x:-28,z:12},
    );
  }else if(map==='deepwoodravine'){
    // Epic Frontier — Deepwood Ravine (Images 8 & 11):
    // Sheer rocky canyon carving through dense ancient forest, spanned by a contested timber trestle bridge!
    const ravPasses=[{x:0,z:0,r:14},{x:-4,z:-h*.56,r:12},{x:4,z:h*.56,r:12}];
    const ravKeep=[...bases.map(b=>({x:b.x,z:b.z,r:Math.min(34,adaptiveGladeR)})),...ravPasses];
    addCurvedCliffChain(sim,[{x:-16,z:-h*.86},{x:-11,z:-h*.34},{x:-11,z:h*.34},{x:-16,z:h*.86}],{step:3.4,width:1,radius:3.2,height:5.1,wobble:2.0,passes:ravPasses,keepClear:ravKeep,seedOffset:951,foothillTrees:true});
    addCurvedCliffChain(sim,[{x:16,z:-h*.86},{x:11,z:-h*.34},{x:11,z:h*.34},{x:16,z:h*.86}],{step:3.4,width:1,radius:3.2,height:5.1,wobble:2.0,passes:ravPasses,keepClear:ravKeep,seedOffset:953,foothillTrees:true});
    for(const base of bases){
      buildWoodlandGladePocket(sim,base,{gladeRadius:Math.min(34,adaptiveGladeR),passes:3,keepClear:[...bases.filter(o=>o.owner!==base.owner).map(o=>({x:o.x,z:o.z,r:36})),...ravPasses],seedOffset:base.owner*31+955,includeResources:false});
    }
    for(const [mx,mz,t] of [[-26,-34,'gold'],[26,34,'gold'],[-26,34,'stone'],[26,-34,'stone']]){
      if(!barrierCollision(sim,'mine',mx,mz,2)&&!sim.isWater(mx,mz))sim.addNaturalResource(t,mx,mz,2400);
    }
    sim.battlefieldProps.push(
      {kind:'brazier',x:-14,z:-6,burning:true},{kind:'brazier',x:14,z:6,burning:true},
      {kind:'stakes',x:-16,z:6,rot:1.57},{kind:'stakes',x:16,z:-6,rot:-1.57},
      {kind:'tent',x:28,z:-24,rot:-.8},{kind:'campfire',x:25,z:-20},{kind:'crates',x:-26,z:22},
    );
  }else if(map==='templelagoon'){
    // Epic Frontier — Temple Lagoon (Image 9):
    // Tropical jungle waterfall, coral turquoise coast, palm & banyan forests, ancient mossy stone temples!
    const lagPasses=[{x:-42,z:4,r:18},{x:24,z:0,r:18},{x:28,z:46,r:16},{x:24,z:-44,r:17}];
    const lagKeep=[...bases.map(b=>({x:b.x,z:b.z,r:Math.min(34,adaptiveGladeR)})),...lagPasses,{x:0,z:-h*.52,r:16}];
    addMountainMassif(sim,-56,-h*.74,{radius:14,peaks:4,passes:lagPasses,keepClear:lagKeep,seedOffset:971,withTrees:true});
    addMountainMassif(sim,-24,-h*.78,{radius:12,peaks:3,passes:lagPasses,keepClear:lagKeep,seedOffset:973,withTrees:true});
    addMountainMassif(sim,h*.74,h*.68,{radius:13,peaks:3,passes:lagPasses,keepClear:lagKeep,seedOffset:975,withTrees:true});
    for(const [mx,mz,t] of [[-8,-24,'gold'],[2,26,'gold'],[-10,20,'stone'],[6,-22,'stone']]){
      if(!barrierCollision(sim,'mine',mx,mz,2)&&!sim.isWater(mx,mz))sim.addNaturalResource(t,mx,mz,2400);
    }
    scatterBiomeCliffs(sim,{count:4,ridgeLen:20,withMassifs:true,keepClear:lagKeep,passes:lagPasses,seedOffset:977});
    sim.battlefieldProps.push(
      {kind:'campfire',x:-8,z:12},{kind:'crates',x:-12,z:16},
      {kind:'brazier',x:12,z:-6,burning:true},{kind:'stakes',x:12,z:8,rot:1.57},
    );
  }else if(map==='ironfall'){
    // Epic Frontier — Ironfall Pass (Images 7, 10, 11):
    // Cliff-locked Western Highland Sanctuary sealed by ONE narrow fortified waterfall bridgehead pass!
    const pass={x:-14,z:0,r:16};
    const ironKeep=[...bases.map(b=>({x:b.x,z:b.z,r:Math.min(34,adaptiveGladeR)})),pass,{x:-14,z:0,r:18}];
    addCurvedCliffChain(sim,[{x:-24,z:-h+6},{x:-18,z:-h*.52},{x:-22,z:-20}],{step:3.3,width:2,radius:3.4,height:5.5,wobble:1.8,passes:[pass],keepClear:ironKeep,seedOffset:991,foothillTrees:true});
    addCurvedCliffChain(sim,[{x:-22,z:20},{x:-18,z:h*.52},{x:-24,z:h-6}],{step:3.3,width:2,radius:3.4,height:5.5,wobble:1.8,passes:[pass],keepClear:ironKeep,seedOffset:993,foothillTrees:true});
    addCurvedCliffChain(sim,[{x:-4,z:-h+6},{x:0,z:-h*.52},{x:-2,z:-20}],{step:3.4,width:1,radius:3.2,height:5.1,wobble:1.6,passes:[pass],keepClear:ironKeep,seedOffset:995,foothillTrees:true});
    addCurvedCliffChain(sim,[{x:-2,z:20},{x:0,z:h*.52},{x:-4,z:h-6}],{step:3.4,width:1,radius:3.2,height:5.1,wobble:1.6,passes:[pass],keepClear:ironKeep,seedOffset:997,foothillTrees:true});
    // Rich sheltered gold & stone deposits inside the western valley so defenders can sustain long wars!
    for(const [mx,mz,t] of [[-52,-32,'gold'],[-52,32,'gold'],[-62,0,'stone'],[-42,-58,'stone'],[42,-36,'gold'],[42,36,'gold'],[54,0,'stone']]){
      if(Math.abs(mx)<h-12&&Math.abs(mz)<h-12&&!barrierCollision(sim,'mine',mx,mz,2)&&!sim.isWater(mx,mz))sim.addNaturalResource(t,mx,mz,2800);
    }
    sim.battlefieldProps.push(
      {kind:'stakes',x:-30,z:-9,rot:1.57},{kind:'stakes',x:-30,z:9,rot:1.57},
      {kind:'brazier',x:-28,z:-6,burning:true},{kind:'brazier',x:-28,z:6,burning:true},
      {kind:'tent',x:28,z:-22,rot:-1.2},{kind:'campfire',x:24,z:-18},{kind:'tent',x:28,z:22,rot:1.2},{kind:'campfire',x:24,z:18},
    );
  }else if(['highland','volcanic','arid','tundra'].includes(map)){
    // Rugged Rocky / Mesa / Volcanic / Alpine Biomes: Rich dramatic continent-wide cliff formations & mountain ridges!
    const passes=[{x:0,z:0,r:14},{x:-26,z:0,r:12},{x:26,z:0,r:12}];
    addCurvedCliffChain(sim,[{x:-h*.74,z:-h*.18},{x:-h*.45,z:-h*.22},{x:-h*.20,z:-h*.14}],{step:3.6,width:1,radius:3.0,height:4.6,wobble:2.4,passes,keepClear,seedOffset:81,foothillTrees:map!=='arid'&&map!=='volcanic'});
    addCurvedCliffChain(sim,[{x:h*.20,z:h*.14},{x:h*.45,z:h*.22},{x:h*.74,z:h*.18}],{step:3.6,width:1,radius:3.0,height:4.6,wobble:2.4,passes,keepClear,seedOffset:83,foothillTrees:map!=='arid'&&map!=='volcanic'});
    scatterBiomeCliffs(sim,{count:6,ridgeLen:24,withMassifs:true,keepClear,passes,seedOffset:89});
  }else if(map==='woodland'){
    // The Deepwood: Sunlit woodland glades surrounded by thick old-growth forests & mossy bluffs!
    const gladeR=sim.worldSize>=240?32:26;
    for(const base of bases){
      buildWoodlandGladePocket(sim,base,{
        gladeRadius:gladeR,passes:3,keepClear:[...bases.filter(o=>o.owner!==base.owner).map(o=>({x:o.x,z:o.z,r:gladeR+4})),{x:-36,z:49,r:10}],
        seedOffset:base.owner*31+91,includeResources:false,
      });
    }
    scatterBiomeCliffs(sim,{count:4,ridgeLen:20,withMassifs:true,keepClear:[...bases.map(b=>({x:b.x,z:b.z,r:gladeR+2})),{x:0,z:0,r:14}],passes:[{x:0,z:0,r:15}],seedOffset:97});
  }
}
