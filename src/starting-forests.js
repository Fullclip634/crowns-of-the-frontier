import {seededRandom} from './data.js';
// Dense, overlapping lobes form natural woodlines on the navigation lattice.
// Their depth, orientation and edge vary independently of distance to the base.
const INNER = 25, OUTER = 46, RESERVED = 36, LANE_HALF = 6;

function groveShape(sim,base){
  const random=seededRandom((sim.options.seed||0)+9011+(base.owner+1)*7919),front=forestEntrances(sim,base)[0],heading=Math.atan2(front.z,front.x);
  return [0,1,2].map(layer=>[0,1,2].map(i=>{
    const angle=heading+Math.PI/3+i*Math.PI*2/3+(layer===1?.32:layer===2?-.32:0)+(random()-.5)*.32,radius=(layer===1?33:layer===2?26:29)+random()*6,rotation=angle+(random()-.5)*2.2;
    return {x:base.x+Math.cos(angle)*radius,z:base.z+Math.sin(angle)*radius,c:Math.cos(rotation),s:Math.sin(rotation),a:9+random()*3,b:6+random()*2,phase:random()*Math.PI*2};
  }));
}

function inGrove(groves,x,z){
  return groves.some(grove=>{
    const dx=x-grove.x,dz=z-grove.z,u=(dx*grove.c+dz*grove.s)/grove.a,v=(-dx*grove.s+dz*grove.c)/grove.b,angle=Math.atan2(v,u);
    const edge=1+.13*Math.sin(angle*3+grove.phase)+.07*Math.cos(angle*5-grove.phase);
    return u*u+v*v<edge*edge;
  });
}

export function forestSettlements(sim) {
  return sim.options.mode === 'custom'
    ? sim.players.map((player, owner) => ({...sim.spawnPositions[owner], owner}))
    : sim.entities.filter(e => e.type === 'towncenter' && e.hp > 0).map(e => ({x:e.x,z:e.z,owner:e.owner}));
}

export function forestEntrances(sim, base) {
  // Coastal bases keep their direct harbor approach; other bases face the
  // central battlefield. Two flank entrances prevent a single choke point.
  const angle = sim.options.map === 'coast'
    ? (base.x < 0 ? 0 : Math.PI)
    : Math.atan2(-base.z, -base.x);
  return [0, 1, -1].map(i => ({x:Math.cos(angle+i*Math.PI*2/3),z:Math.sin(angle+i*Math.PI*2/3)}));
}

function inLane(sim, base, x, z) {
  const dx=x-base.x, dz=z-base.z;
  return forestEntrances(sim,base).some(dir => dx*dir.x+dz*dir.z>0 && Math.abs(dx*dir.z-dz*dir.x)<LANE_HALF);
}

export function reservedStartingLand(sim, x, z) {
  return forestSettlements(sim).some(base => Math.hypot(x-base.x,z-base.z)<RESERVED);
}

export function plantStartingForests(sim) {
  const bases=forestSettlements(sim), obstacles=sim.entities.filter(e=>e.hp>0 && (e.kind==='building'||e.kind==='unit'||e.kind==='resource'&&!e.water));
  for(const base of bases) {
    const entrances=forestEntrances(sim,base),layers=groveShape(sim,base);let planted=0;
    // Tight eight-player starts may clip a grove against a neighbor or harbor.
    // Add separate lobes only there, keeping a useful wood supply for every slot.
    for(const [layer,groves] of layers.entries()){
    if(layer>0&&planted>=60)break;
    for(let z=Math.floor((base.z-OUTER+sim.halfWorld)/2);z<=Math.ceil((base.z+OUTER+sim.halfWorld)/2);z++)
      for(let x=Math.floor((base.x-OUTER+sim.halfWorld)/2);x<=Math.ceil((base.x+OUTER+sim.halfWorld)/2);x++) {
        const nx=x*2-sim.halfWorld+1, nz=z*2-sim.halfWorld+1, dx=nx-base.x, dz=nz-base.z, radius=Math.hypot(dx,dz);
        if(radius<INNER||radius>OUTER||!inGrove(groves,nx,nz)||Math.abs(nx)>sim.halfWorld-4||Math.abs(nz)>sim.halfWorld-4||sim.isWater(nx,nz))continue;
        if(entrances.some(dir=>dx*dir.x+dz*dir.z>0&&Math.abs(dx*dir.z-dz*dir.x)<LANE_HALF))continue;
        // Never invade another settlement's build space or its entrances.
        if(bases.some(other=>other!==base&&(Math.hypot(nx-other.x,nz-other.z)<INNER||Math.hypot(nx-other.x,nz-other.z)<RESERVED&&inLane(sim,other,nx,nz))))continue;
        if(sim.startClearing(nx,nz)||obstacles.some(e=>Math.hypot(e.x-nx,e.z-nz)<e.r+(e.kind==='building'?3:e.kind==='unit'?2:2.1)))continue;
        if(sim.entities.some(e=>e.type==='wood'&&Math.hypot(e.x-nx,e.z-nz)<1.8))continue;
        const tree=sim.addResource('wood',nx,nz,300);tree.startForest=base.owner;planted++;
      }
    }
  }
}
