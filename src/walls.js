export const WALL_SPACING=2.85;
const fortification=e=>e.kind==='building'&&(e.type==='wall'||e.type==='gate');
const axis=e=>({x:Math.cos(e.wallAngle||0),z:-Math.sin(e.wallAngle||0)});
const length=(a,b)=>Math.hypot(a.x-b.x,a.z-b.z);

export function wallSupport(entity,sim,owner){
  return entity.hp>0&&(entity.kind==='resource'&&!entity.water&&['wood','stone','gold'].includes(entity.type)
    ||entity.kind==='building'&&entity.type!=='farm'&&!fortification(entity)&&entity.progress>=1&&sim.allied(owner,entity.owner));
}

// Snap the drag length to complete sections instead of stretching a fixed
// number of sections apart. A section's half-width covers the final cursor.
export function wallLinePoints(from,to,exactEnd=false){
  if(![from.x,from.z,to.x,to.z].every(Number.isFinite))return[];
  const d=length(from,to),steps=Math.min(200,Math.round(d/WALL_SPACING)),dx=d?(to.x-from.x)/d:1,dz=d?(to.z-from.z)/d:0;
  const spacing=exactEnd&&steps?d/steps:WALL_SPACING;
  // Anchored endpoints must both meet their supports, while adjacent wall
  // foundations retain the same overlap and linking limits as normal lines.
  if(exactEnd&&(!steps||spacing<2.7-1e-8||spacing>3.35+1e-8))return[];
  return Array.from({length:steps+1},(_,i)=>({x:from.x+dx*i*spacing,z:from.z+dz*i*spacing}));
}

export function wallEndpointTree(sim,point){
  return sim.entities.filter(e=>e.hp>0&&e.kind==='resource'&&e.type==='wood'&&!e.water&&length(e,point)<=e.r+1.58&&length(e,point)>=e.r+.7).sort((a,b)=>length(a,point)-length(b,point)||a.id-b.id)[0];
}

function available(e,other,entities){
  const d=length(e,other);if(!d)return false;const dx=(other.x-e.x)/d,dz=(other.z-e.z)/d;
  if(e.type==='gate'&&Number.isFinite(e.wallAngle)){const a=axis(e);if(Math.abs(dx*a.x+dz*a.z)<.82)return false;}
  return !(e.wallLinks||[]).some(id=>{const linked=entities.find(p=>p.id===id);if(!linked||linked.hp<=0)return false;const n=length(e,linked);return n>0&&(dx*(linked.x-e.x)+dz*(linked.z-e.z))/n>.5;});
}

// Store actual neighbors. A destroyed corner must not connect its surviving
// neighbors diagonally and silently repair the breach, including after reload.
export function connectWall(e,entities){
  if(!fortification(e))return;e.wallLinks??=[];
  if(e.hp<=0)return;
  const candidates=entities.filter(other=>other!==e&&other.hp>0&&fortification(other)&&other.owner===e.owner&&(e.type==='wall'||other.type==='wall')&&length(e,other)<=(e.type==='gate'||other.type==='gate'?6.5:3.35)).sort((a,b)=>length(e,a)-length(e,b)||a.id-b.id);
  for(const other of candidates){other.wallLinks??=[];if(e.wallLinks.includes(other.id)||!available(e,other,entities)||!available(other,e,entities))continue;
    e.wallAngle??=-Math.atan2(other.z-e.z,other.x-e.x);other.wallAngle??=e.wallAngle;
    e.wallLinks.push(other.id);other.wallLinks.push(e.id);
  }
}

// A planned perimeter has an exact ring order. Rebuild only those intended
// links so construction order can never leave a gate choking on a diagonal
// chord or a corner with three neighbours.
export function linkPlannedWalls(entities,nodes){
  const alive=nodes.filter(node=>node&&node.hp>0),ids=new Set(alive.map(node=>node.id));
  for(const node of alive)node.wallLinks=(node.wallLinks||[]).filter(id=>!ids.has(id));
  for(let index=0;index<nodes.length;index++){
    const a=nodes[index],b=nodes[(index+1)%nodes.length];if(!a||!b||a.id===b.id||a.hp<=0||b.hp<=0)continue;
    if(length(a,b)>(a.type==='gate'||b.type==='gate'?6.5:3.35)+1e-6)continue;
    a.wallLinks??=[];b.wallLinks??=[];
    if(!a.wallLinks.includes(b.id))a.wallLinks.push(b.id);
    if(!b.wallLinks.includes(a.id))b.wallLinks.push(a.id);
  }
}

export function restoreWallLinks(entities){
  const legacy=entities.filter(e=>fortification(e)&&!Array.isArray(e.wallLinks));for(const e of legacy)e.wallLinks=[];for(const e of legacy)connectWall(e,entities);
}

// Detect walls where two or more connected wall runs meet at an angle (90° L-corners,
// bends <= ~145°, T-junctions, and 4-way crossroads) so they upgrade visually into
// square castle-like corner bastions (like AoE2 / AoE4).
export function isWallCorner(sim,entity){
  if(!entity||entity.kind!=='building'||entity.type!=='wall'||entity.hp<=0)return false;
  const links=entity.wallLinks;
  if(!links||links.length<2)return false;
  const dirs=[];
  for(const id of links){
    const other=typeof sim?.get==='function'?sim.get(id):sim?.entities?.find(item=>item.id===id);
    if(!other||other.hp<=0||!fortification(other))continue;
    const dx=other.x-entity.x,dz=other.z-entity.z,d=Math.hypot(dx,dz);
    if(d<1e-6)continue;
    dirs.push({x:dx/d,z:dz/d});
  }
  if(dirs.length<2)return false;
  if(dirs.length>=3)return true;
  return dirs[0].x*dirs[1].x+dirs[0].z*dirs[1].z>-.82;
}

function gatePoint(gate,other){const a=axis(gate),sign=Math.sign((other.x-gate.x)*a.x+(other.z-gate.z)*a.z)||1;return {x:gate.x+a.x*sign*2.76,z:gate.z+a.z*sign*2.76};}
function wallEdge(wall,other){const d=length(wall,other),dx=(other.x-wall.x)/d,dz=(other.z-wall.z)/d,a=axis(wall),along=Math.abs(dx*a.x+dz*a.z),across=Math.abs(-dx*a.z+dz*a.x),extent=Math.min(along>1e-8?1.425/along:Infinity,across>1e-8?.725/across:Infinity);return {x:wall.x+dx*extent,z:wall.z+dz*extent};}

export function wallConnections(entities){
  const alive=new Map(entities.filter(e=>e.hp>0&&fortification(e)).map(e=>[e.id,e])),connections=[];
  for(const a of alive.values())for(const id of a.wallLinks||[]){const b=alive.get(id);if(!b||a.id>=b.id||a.owner!==b.owner)continue;
    const start=a.type==='gate'?gatePoint(a,b):wallEdge(a,b),end=b.type==='gate'?gatePoint(b,a):wallEdge(b,a),dx=b.x-a.x,dz=b.z-a.z;
    // Overlapping stone bodies already form a continuous wall.
    const gap=(end.x-start.x)*dx+(end.z-start.z)*dz;
    connections.push({a,b,start,end,gap:gap>0?length(start,end):0,collisionStart:a.type==='gate'?start:a,collisionEnd:b.type==='gate'?end:b});
  }return connections;
}

// A short masonry end cap meets a live trunk at a wall endpoint. Connections
// are derived from the current trees, so chopping a tree opens the same gap in
// rendering and pathfinding, including after saving or in multiplayer.
export function wallTreeConnections(entities){
  const walls=entities.filter(wall=>wall.hp>0&&wall.kind==='building'&&wall.type==='wall');if(!walls.length)return[];
  const buckets=new Map(),size=8;
  for(const tree of entities)if(tree.hp>0&&tree.kind==='resource'&&tree.type==='wood'&&!tree.water){const key=Math.floor(tree.x/size)+':'+Math.floor(tree.z/size);if(!buckets.has(key))buckets.set(key,[]);buckets.get(key).push(tree);}
  const links=[];
  for(const wall of walls){
    const a=axis(wall),bx=Math.floor(wall.x/size),bz=Math.floor(wall.z/size),best=new Map();
    for(let x=bx-1;x<=bx+1;x++)for(let z=bz-1;z<=bz+1;z++)for(const tree of buckets.get(x+':'+z)||[]){
      const dx=tree.x-wall.x,dz=tree.z-wall.z,along=dx*a.x+dz*a.z,across=Math.abs(-dx*a.z+dz*a.x),d=Math.hypot(dx,dz);
      if(Math.abs(along)<1.35||Math.abs(along)>1.425+tree.r+.18||across>.55||d<1e-6)continue;
      const side=Math.sign(along),previous=best.get(side);if(!previous||d<previous.d||d===previous.d&&tree.id<previous.tree.id)best.set(side,{tree,d});
    }
    for(const {tree,d} of best.values()){
      const start=wallEdge(wall,tree),end={x:tree.x-(tree.x-wall.x)/d*.18,z:tree.z-(tree.z-wall.z)/d*.18},gap=Math.max(0,(end.x-start.x)*(tree.x-wall.x)/d+(end.z-start.z)*(tree.z-wall.z)/d);
      links.push({a:wall,b:tree,start,end,gap,collisionStart:wall,collisionEnd:tree,natural:true});
    }
  }
  return links;
}

export function wallSupportConnections(entities){
  const attached=entities.filter(wall=>wall.hp>0&&wall.type==='wall'&&wall.wallSupports?.length);
  if(!attached.length)return[];
  const supports=new Map(entities.filter(e=>e.hp>0).map(e=>[e.id,e])),links=[];
  for(const wall of attached)for(const id of wall.wallSupports){
    const support=supports.get(id);
    if(!support)continue;
    const d=length(wall,support);
    if(!d)continue;
    const start=wallEdge(wall,support),radius=support.r-.1;
    const end={x:support.x+(wall.x-support.x)*radius/d,z:support.z+(wall.z-support.z)*radius/d};
    const gap=length(wall,end)-length(wall,start);
    if(gap>0)links.push({a:wall,b:support,start,end,gap,collisionStart:wall,collisionEnd:support});
  }
  return links;
}

function blockWallSegment(sim,grid,a,b){
  const from=sim.cell(Math.min(a.x,b.x)-.85,Math.min(a.z,b.z)-.85),to=sim.cell(Math.max(a.x,b.x)+.85,Math.max(a.z,b.z)+.85),dx=b.x-a.x,dz=b.z-a.z,squared=dx*dx+dz*dz;
  for(let z=from.z;z<=to.z;z++)for(let x=from.x;x<=to.x;x++){const wx=x*2-sim.halfWorld+1,wz=z*2-sim.halfWorld+1,t=squared?Math.max(0,Math.min(1,((wx-a.x)*dx+(wz-a.z)*dz)/squared)):0;
    if(Math.hypot(wx-a.x-t*dx,wz-a.z-t*dz)<.85)grid[z*sim.gridSize+x]=1;
  }
}

export function blockWallConnections(sim,grid){
  const buildings=typeof sim.candidatesFor==='function'?sim.candidatesFor('building'):sim.entities;
  let hasWall=false,hasGate=false;
  for(const e of buildings)if(e.hp>0&&e.kind==='building'){if(e.type==='wall'){hasWall=true;break;}if(e.type==='gate')hasGate=true;}
  if(!hasWall&&!hasGate){
    if(sim.wallTreeLinkCache?.entities!==sim.entities||sim.wallTreeLinkCache.revision!==sim.revision)sim.wallTreeLinkCache={entities:sim.entities,revision:sim.revision,links:[]};
    return;
  }
  if(sim.wallTreeLinkCache?.entities!==sim.entities||sim.wallTreeLinkCache.revision!==sim.revision)sim.wallTreeLinkCache={entities:sim.entities,revision:sim.revision,links:hasWall?[...wallTreeConnections(sim.entities),...wallSupportConnections(sim.entities)]:[]};
  for(const {collisionStart:a,collisionEnd:b} of wallConnections(buildings))blockWallSegment(sim,grid,a,b);
  for(const {collisionStart:a,collisionEnd:b} of sim.wallTreeLinkCache.links)blockWallSegment(sim,grid,a,b);
}
