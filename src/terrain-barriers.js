import {seededRandom} from './data.js';

/**
 * Authoritative Natural Terrain Barrier & Human-Crafted Fortified Valley System.
 *
 * Generates impassable Blender 4.5 LTS stepped stone cliff walls, towering alpine
 * mountain crags, dense Blackwood forest belts, and organic Age of Empires IV-style
 * fortified valley bases where short stone walls + gatehouses tie directly into
 * cliffs and woodlines — keeping buildings spacious and all starting resources
 * safely protected INSIDE the perimeter.
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
  // Walls tie snugly right into cliff faces so players seal passes with zero leaky gaps.
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
  if(Math.abs(x)>sim.halfWorld-3.5||Math.abs(z)>sim.halfWorld-3.5)return true;
  if(sim.isWater(x,z))return true;
  for(const pass of passes){
    if(Math.hypot(x-pass.x,z-pass.z)<(pass.r||10)+r*.65)return true;
  }
  for(const pt of keepClear){
    if(Math.hypot(x-pt.x,z-pt.z)<(pt.r||18)+r)return true;
  }
  for(const e of sim.entities){
    if(e.hp<=0)continue;
    const pad=e.kind==='building'?e.r+r+1.6:e.kind==='unit'?e.r+r+1.4:e.kind==='shrine'?e.r+r+4:0;
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
export function addCliffRidge(sim,from,to,{step=3.5,width=1,radius=3.1,height=4.4,wobble=2.2,passes=[],keepClear=[],seedOffset=0,withMountains=true}={}){
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
    const wave=Math.sin(t*Math.PI*2.4+seedOffset)*.5*wobble+(rng()-.5)*wobble*.45;
    const cx=from.x+dx*t+nx*wave,cz=from.z+dz*t+nz*wave;
    let placedThisStep=false;
    for(let layer=0;layer<width;layer++){
      const lat=(layer-(width-1)/2)*(radius*1.08);
      const bx=cx+nx*lat+(rng()-.5)*.6,bz=cz+nz*lat+(rng()-.5)*.6;
      const nearEnd=i===0||i===count||!prevPlaced;
      const isMountain=withMountains&&layer===0&&(nearEnd||(i%5===0&&rng()<.55));
      const kind=isMountain?'mountain':'cliffwall';
      const r=radius*(isMountain?1.24:.92+rng()*.24);
      const h=height*(isMountain?1.42:.92+rng()*.28);
      const ang=ridgeAngle+(rng()-.5)*.32;
      const b=addNaturalBarrier(sim,bx,bz,{r,height:h,kind,angle:ang,seed:Math.floor(rng()*99999),passes,keepClear});
      if(b){added.push(b);placedThisStep=true;}
    }
    prevPlaced=placedThisStep;
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
    const cx=from.x+dx*t,cz=from.z+dz*t;
    for(let row=-thickness;row<=thickness;row++){
      const bx=cx+nx*(row*2.3+(rng()-.5)*1.0)+(rng()-.5)*.7;
      const bz=cz+nz*(row*2.3+(rng()-.5)*1.0)+(rng()-.5)*.7;
      if(Math.abs(bx)>sim.halfWorld-4||Math.abs(bz)>sim.halfWorld-4||sim.isWater(bx,bz))continue;
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

const DIR_ANGLES={east:0,south:Math.PI/2,west:Math.PI,north:-Math.PI/2,ne:-Math.PI/4,se:Math.PI/4,sw:Math.PI*3/4,nw:-Math.PI*3/4};

function angleDiff(a,b){
  let d=(a-b)%Math.PI*2;
  d=((a-b+Math.PI*3)%(Math.PI*2))-Math.PI;
  return Math.abs(d);
}

/**
 * Connects two natural cliff/mountain jaw anchors with a short, human-crafted
 * Stone Wall + central Gatehouse + optional backing Watchtower, saving huge
 * stone cost and tying walls seamlessly into the impassable rock perimeter.
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
    // Tuck a backing watchtower safely inside the gate covering the pass approach
    const inX=center.x-midX,inZ=center.z-midZ,inLen=Math.hypot(inX,inZ)||1;
    const sideX=-dz/len,sideZ=dx/len;
    const tx=midX+(inX/inLen)*5.5+sideX*4.5,tz=midZ+(inZ/inLen)*5.5+sideZ*4.5;
    const t=tryPlace('tower',tx,tz,0);
    if(t)placed.towers.push(t);
  }
  return placed;
}

/**
 * Human-Crafted Natural Fortified Valley Architect (AoE4 "Helm's Deep" & AoE2 style):
 *
 *  - Cradles the base inside a spacious organic valley perimeter formed ~75% by
 *    impassable Blender-authored sheer cliff walls, alpine mountain peaks, and
 *    dense inner woodlines (NEVER a cramped geometric square box!).
 *  - Ties short stone walls + twin-turret gatehouses directly from cliff jaw to
 *    cliff jaw across ONLY the 2–3 narrow valley mouths.
 *  - Places safe woodline timber, gold mines, stone quarries, and berry bushes
 *    100% INSIDE the fortified perimeter so villagers never wander outside the gates!
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
}={}){
  const rng=seededRandom((sim.options?.seed||2026)+4409+owner*137+seedOffset);
  const cx=center.x,cz=center.z;
  const openAngles=gates.map(g=>typeof g==='number'?g:(DIR_ANGLES[g]??0));
  const passHalfAngle=Math.max(.22,Math.min(.36,7.8/Math.max(16,radius)));
  const organicR=a=>radius+Math.sin(a*3+seedOffset)*2.1+Math.cos(a*2-seedOffset)*1.3;
  const placed={walls:[],gates:[],towers:[],barriers:[]};

  // Keep center courtyard clear so cliffs stay strictly on the spacious outer valley rim
  const rimKeep=[{x:cx,z:cz,r:Math.max(14,radius-6.5)},...keepClear];
  const jawPairs=[];

  // 1. Place exact symmetric towering mountain jaws framing every valley mouth FIRST,
  //    so every Gatehouse + short Stone Wall sits dead-square perpendicular to its pass with ZERO gap!
  for(let k=0;k<openAngles.length;k++){
    const oa=openAngles[k];
    const rPass=organicR(oa);
    const aL=oa-passHalfAngle,aR=oa+passHalfAngle;
    const jawL={x:cx+Math.cos(aL)*rPass,z:cz+Math.sin(aL)*rPass};
    const jawR={x:cx+Math.cos(aR)*rPass,z:cz+Math.sin(aR)*rPass};
    const passTangent=Math.atan2(-(jawR.z-jawL.z),jawR.x-jawL.x);
    const bL=addNaturalBarrier(sim,jawL.x,jawL.z,{r:3.8,height:6.2,kind:'mountain',angle:passTangent+(rng()-.5)*.2,seed:Math.floor(rng()*99999),keepClear:rimKeep});
    const bR=addNaturalBarrier(sim,jawR.x,jawR.z,{r:3.8,height:6.2,kind:'mountain',angle:passTangent+(rng()-.5)*.2,seed:Math.floor(rng()*99999),keepClear:rimKeep});
    if(bL)placed.barriers.push(bL);
    if(bR)placed.barriers.push(bR);
    jawPairs.push({left:jawL,right:jawR});
  }

  // 2. Sculpt dense interlocking sheer Blender cliff walls & periodic alpine spires along the remaining rim
  const samples=Math.max(32,Math.round((2*Math.PI*radius)/3.15));
  const jawPad=passHalfAngle+Math.min(.14,2.8/Math.max(16,radius));
  for(let i=0;i<samples;i++){
    const a=(i/samples)*Math.PI*2-Math.PI;
    if(openAngles.some(oa=>angleDiff(a,oa)<jawPad))continue;
    const r=organicR(a);
    const px=cx+Math.cos(a)*r,pz=cz+Math.sin(a)*r;
    const tangent=Math.atan2(-Math.cos(a),-Math.sin(a));
    const kind=(i%8===0&&rng()<.5)?'mountain':'cliffwall';
    const bRad=kind==='mountain'?3.6:3.2;
    const bH=kind==='mountain'?5.8:4.0+rng()*1.1;
    const b=addNaturalBarrier(sim,px,pz,{r:bRad,height:bH,kind,angle:tangent+(rng()-.5)*.18,seed:Math.floor(rng()*99999),keepClear:rimKeep});
    if(b)placed.barriers.push(b);
  }

  // 3. Seal ONLY the narrow valley mouths with short dead-straight mountain-to-mountain Stone Walls + Gatehouse!
  if(wallGaps){
    for(let k=0;k<openAngles.length;k++){
      const jawL=jawPairs[k].left,jawR=jawPairs[k].right;
      // Tuck end walls slightly inside the mountain rock shoulders for a 100% seamless stone-to-cliff join
      const dx=jawR.x-jawL.x,dz=jawR.z-jawL.z,len=Math.hypot(dx,dz)||1;
      const trim=Math.min(1.65,len*.11);
      const startPt={x:jawL.x+(dx/len)*trim,z:jawL.z+(dz/len)*trim};
      const endPt={x:jawR.x-(dx/len)*trim,z:jawR.z-(dz/len)*trim};
      const seg=connectCliffPassWall(sim,owner,startPt,endPt,center,{complete,withGate:true,withTower:towers});
      placed.walls.push(...seg.walls);
      placed.gates.push(...seg.gates);
      placed.towers.push(...seg.towers);
    }
  }

  // Protected Economy 100% INSIDE the natural cliff-and-wall valley perimeter!
  if(includeResources){
    // Find sheltered cliff arcs (away from the open gate passes) to tuck wood, gold, stone & berries safely inside
    const safeAngles=[];
    for(let i=0;i<32;i++){
      const a=(i/32)*Math.PI*2-Math.PI;
      if(openAngles.every(oa=>angleDiff(a,oa)>passHalfAngle+.18))safeAngles.push(a);
    }
    const pickSafe=(idx)=>safeAngles.length?safeAngles[idx%safeAngles.length]:(openAngles[0]+Math.PI);
    const innerR=Math.max(12,radius-8.0);
    const tryResource=(type,x,z,amt)=>{
      if(Math.abs(x)>sim.halfWorld-5||Math.abs(z)>sim.halfWorld-5||sim.isWater(x,z))return false;
      if(Math.hypot(x-cx,z-cz)>radius-4.6)return false;
      if(sim.barriers?.some(b=>Math.hypot(b.x-x,b.z-z)<b.r+1.6))return false;
      if(sim.entities.some(e=>e.hp>0&&(e.kind==='building'&&Math.hypot(e.x-x,e.z-z)<e.r+2.2||e.kind==='unit'&&Math.hypot(e.x-x,e.z-z)<e.r+1.4||e.kind==='resource'&&Math.hypot(e.x-x,e.z-z)<1.85)))return false;
      sim.addNaturalResource(type,x,z,amt);
      return true;
    };
    const placeCluster=(type,baseAngle,offsets,amt)=>{
      let placedCount=0;
      const radialSteps=[innerR-.6,innerR-2.8,innerR+1.2,innerR-5.2];
      const angleSteps=[0,.16,-.16,.34,-.34,.55,-.55,Math.PI*.5,-Math.PI*.5,Math.PI];
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

    // 1. Safe Inner Woodline Grove tucked against the back cliff face (14-18 trees inside the walls!)
    const woodA=pickSafe(0);
    for(let t=-4;t<=4;t++){
      const a=woodA+t*.105;
      for(const ring of [innerR+1.4,innerR-1.1]){
        tryResource('wood',cx+Math.cos(a)*ring+(rng()-.5)*1.1,cz+Math.sin(a)*ring+(rng()-.5)*1.1,280);
      }
    }
    // 2. Protected Inner Gold Vein (4 rich deposits inside the walls!)
    const goldA=pickSafe(Math.floor(safeAngles.length*.26));
    placeCluster('gold',goldA,[[-1.3,-1.3],[1.3,-1.3],[-1.3,1.3],[1.3,1.3]],2200);
    // 3. Protected Inner Stone Quarry (4 rich deposits inside the walls!)
    const stoneA=pickSafe(Math.floor(safeAngles.length*.74));
    placeCluster('stone',stoneA,[[-1.3,-1.3],[1.3,-1.3],[-1.3,1.3],[1.3,1.3]],2200);
    // 4. Protected Berry Bush Patch inside the valley floor
    const foodA=pickSafe(Math.max(1,Math.floor(safeAngles.length*.5)));
    placeCluster('food',foodA,[[0,0],[2.3,0],[-2.3,0],[1.1,2.1],[-1.1,-2.1]],400);
  }

  return placed;
}

/** Backwards-compatible alias forwarding cleanly to our human-crafted organic fortified valley builder. */
export function buildWalledCitadel(sim,owner,center,opts={}){
  return buildNaturalFortifiedBase(sim,owner,center,opts);
}

/**
 * Generates map-specific natural stone cliffs, alpine mountain passes, dense
 * Blackwood forest corridors, and organic cliff-walled Bastion bases for Skirmish & Custom Battles.
 */
export function applyMapGeography(sim){
  const map=sim.options?.map;
  if(!map)return;
  const bases=(sim.players||[]).map((p,owner)=>p?.start?{x:p.start.x,z:p.start.z,owner}:null).filter(Boolean);
  const keepClear=bases.map(b=>({x:b.x,z:b.z,r:24}));
  const h=sim.halfWorld;

  if(map==='ironpass'){
    // Classic AoE2/AoE4 Mountain Pass: Towering sheer cliff walls & alpine peaks leaving 3 narrow passes
    const passes=[
      {x:0,z:0,r:10},
      {x:-h*.42,z:-h*.42,r:9.5},
      {x:h*.42,z:h*.42,r:9.5},
    ];
    addCliffRidge(sim,{x:-h+6,z:-h+6},{x:h-6,z:h-6},{step:3.4,width:2,radius:3.2,height:5.0,wobble:2.4,passes,keepClear,seedOffset:11});
    addCliffRidge(sim,{x:-h*.68,z:h*.10},{x:-h*.28,z:h*.04},{step:3.6,width:1,radius:2.9,height:4.2,wobble:1.8,passes,keepClear,seedOffset:23});
    addCliffRidge(sim,{x:h*.28,z:-h*.04},{x:h*.68,z:-h*.10},{step:3.6,width:1,radius:2.9,height:4.2,wobble:1.8,passes,keepClear,seedOffset:37});
    for(const [mx,mz,t] of [[-11,-13,'gold'],[11,13,'gold'],[-15,9,'stone'],[15,-9,'stone']]){
      if(!barrierCollision(sim,'mine',mx,mz,2)&&!sim.isWater(mx,mz))sim.addNaturalResource(t,mx,mz,2200);
    }
  }else if(map==='blackwood'){
    // Classic AoE2 Black Forest: Impenetrable ancient forest belts anchored by granite crags with narrow trails
    const passes=[
      {x:0,z:0,r:9.5},
      {x:-h*.38,z:-h*.38,r:9},
      {x:h*.38,z:h*.38,r:9},
    ];
    addDenseForestBelt(sim,{x:-h+8,z:-h+8},{x:h-8,z:h-8},{step:2.45,thickness:3,passes,keepClear,seedOffset:41});
    addNaturalBarrier(sim,-11,9,{r:3.6,height:5.6,kind:'mountain',passes,keepClear,seed:51});
    addNaturalBarrier(sim,11,-9,{r:3.6,height:5.6,kind:'mountain',passes,keepClear,seed:52});
  }else if(map==='bastion'){
    // Classic AoE4/AoE2 Fortified Valley Arena: Spacious natural cliff-and-forest bastions with ALL starting resources inside!
    const bastionR=sim.worldSize>=240?29:24;
    for(const base of bases){
      const towardCenter=Math.atan2(-base.z,-base.x);
      buildNaturalFortifiedBase(sim,base.owner,base,{
        radius:bastionR,
        gates:[towardCenter,towardCenter+Math.PI*.48],
        towers:true,
        complete:true,
        wallGaps:true,
        includeResources:true,
        seedOffset:base.owner*19,
      });
    }
    const centerKeep=[...keepClear,{x:0,z:0,r:14}];
    addCliffRidge(sim,{x:-24,z:-24},{x:-11,z:-27},{step:3.5,width:1,radius:2.9,height:4.2,wobble:1.4,keepClear:centerKeep,seedOffset:61});
    addCliffRidge(sim,{x:11,z:27},{x:24,z:24},{step:3.5,width:1,radius:2.9,height:4.2,wobble:1.4,keepClear:centerKeep,seedOffset:62});
  }else if(map==='highland'||map==='volcanic'){
    const passes=[{x:0,z:0,r:14},{x:-24,z:0,r:12},{x:24,z:0,r:12}];
    addCliffRidge(sim,{x:-h*.55,z:-h*.12},{x:-h*.22,z:-h*.18},{step:3.8,width:1,radius:2.9,height:4.4,wobble:2.0,passes,keepClear,seedOffset:71});
    addCliffRidge(sim,{x:h*.22,z:h*.18},{x:h*.55,z:h*.12},{step:3.8,width:1,radius:2.9,height:4.4,wobble:2.0,passes,keepClear,seedOffset:73});
  }
}
