// Starting woodlines are real resources on the same two-meter lattice as
// navigation. Adjacent occupied cells make a continuous natural barrier.
const INNER = 28, OUTER = 32, RESERVED = 36, LANE_HALF = 6;

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
    const entrances=forestEntrances(sim,base);
    for(let z=Math.floor((base.z-OUTER+sim.halfWorld)/2);z<=Math.ceil((base.z+OUTER+sim.halfWorld)/2);z++)
      for(let x=Math.floor((base.x-OUTER+sim.halfWorld)/2);x<=Math.ceil((base.x+OUTER+sim.halfWorld)/2);x++) {
        const nx=x*2-sim.halfWorld+1, nz=z*2-sim.halfWorld+1, dx=nx-base.x, dz=nz-base.z, radius=Math.hypot(dx,dz);
        if(radius<INNER||radius>OUTER||Math.abs(nx)>sim.halfWorld-4||Math.abs(nz)>sim.halfWorld-4||sim.isWater(nx,nz))continue;
        if(entrances.some(dir=>dx*dir.x+dz*dir.z>0&&Math.abs(dx*dir.z-dz*dir.x)<LANE_HALF))continue;
        // Never invade another settlement's build space or its entrances.
        if(bases.some(other=>other!==base&&(Math.hypot(nx-other.x,nz-other.z)<INNER||Math.hypot(nx-other.x,nz-other.z)<RESERVED&&inLane(sim,other,nx,nz))))continue;
        if(sim.startClearing(nx,nz)||obstacles.some(e=>Math.hypot(e.x-nx,e.z-nz)<e.r+(e.kind==='building'?3:e.kind==='unit'?2:2.1)))continue;
        if(sim.entities.some(e=>e.type==='wood'&&Math.hypot(e.x-nx,e.z-nz)<1.8))continue;
        const tree=sim.addResource('wood',nx,nz,300);tree.startForest=base.owner;
      }
  }
}
