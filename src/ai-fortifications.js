import {BUILDINGS,UNITS} from './data.js';
import {WALL_SPACING,connectWall} from './walls.js';
import {clearSegment,findPath,unitNavigationGrid,navigationRegions} from './navigation.js';

const distance=(a,b)=>Math.hypot(a.x-b.x,a.z-b.z);
const reserve={food:180,wood:240,gold:80,stone:180};
const available=worker=>!worker.embarked&&!worker.aiFleeing&&!['build','repair','garrison'].includes(worker.order?.type)&&!worker.order?.aiExpansion;
const affordable=(sim,owner,cost)=>Object.entries({...reserve,...cost}).every(([resource])=>sim.players[owner].resources[resource]-(cost[resource]||0)>=reserve[resource]);
const totalCost=(sim,owner,pieces)=>pieces.reduce((cost,piece)=>{
  for(const [resource,amount]of Object.entries(sim.cost(BUILDINGS[piece.type].cost,owner,'building')))cost[resource]=(cost[resource]||0)+amount;
  return cost;
},{});

export function fortificationReserved(sim,type,x,z,owner){
  const definition=BUILDINGS[type];if(!definition)return false;
  const point={x,z};
  for(const [commander,state]of Object.entries(sim.aiStates||{})){
    if(!sim.allied(owner,Number(commander)))continue;
    for(const plan of state.fortifications||[]){
      if(!sim.get(plan.base))continue;
      if(plan.pieces.some(piece=>!sim.get(piece.id)&&distance(point,piece)<definition.r+BUILDINGS[piece.type].r+.8))return true;
      const gate=plan.pieces[0],dx=point.x-gate.x,dz=point.z-gate.z,along=dx*Math.sin(plan.angle)+dz*Math.cos(plan.angle),across=dx*Math.cos(plan.angle)-dz*Math.sin(plan.angle);
      if(Math.abs(along)<10+definition.r&&Math.abs(across)<3+definition.r)return true;
    }
  }
  return false;
}

// Validate a complete, linked layout on private scratch state before paying for
// its first foundation. Walls stay solid; only allied gates provide passage.
function plannedSimulation(sim,plan,owner){
  const entities=sim.entities.map(entity=>['wall','gate'].includes(entity.type)?{...entity,wallLinks:[...(entity.wallLinks||[])]}:entity),added=[];
  for(const [index,piece]of plan.pieces.entries())if(!sim.get(piece.id)){
    const entity={...piece,id:-index-1,owner,kind:'building',hp:1,r:BUILDINGS[piece.type].r,wallAngle:plan.angle,wallLinks:[]};
    entities.push(entity);added.push(entity);
  }
  for(const entity of added)connectWall(entity,entities);
  const preview=Object.create(sim);
  Object.assign(preview,{entities,index:new Map(entities.map(entity=>[entity.id,entity])),grids:{},unitEscapeGrids:new Map(),pathScratch:null,regionQueue:null,entityBuckets:null,unitBuckets:null});
  return preview;
}

function routable(sim,unit,target,range=0){
  const grid=unitNavigationGrid(sim,unit),from=sim.cell(unit.x,unit.z),to=sim.cell(target.x,target.z),start=from.z*sim.gridSize+from.x,end=to.z*sim.gridSize+to.x;
  if(!range&&!grid[start]&&!grid[end]){const regions=navigationRegions(sim,grid);return regions[start]===regions[end];}
  const probe={...unit,stuckTime:0};findPath(sim,probe,target,range);return probe.pathStatus==='ready';
}

export function fortificationRoutesSafe(sim,plan,owner){
  const base=sim.get(plan.base);if(!base)return false;
  const preview=plannedSimulation(sim,plan,owner),gate=plan.pieces[0],normal={x:Math.sin(plan.angle),z:Math.cos(plan.angle)};
  const inside={x:gate.x-normal.x*9,z:gate.z-normal.z*9},outside={x:gate.x+normal.x*9,z:gate.z+normal.z*9};
  if(!clearSegment(preview,preview.grid(owner),inside,outside))return false;
  const spawn=preview.spawnPoint(base);if(!spawn)return false;
  const probe={type:'spearman',owner,r:.65,...spawn};if(!routable(preview,probe,outside))return false;
  const walls=plan.pieces.filter(piece=>piece.type==='wall'&&!sim.get(piece.id));
  for(const unit of sim.entities){
    if(unit.hp<=0||unit.kind!=='unit'||unit.embarked||UNITS[unit.type].naval||!sim.allied(owner,unit.owner)||distance(unit,gate)>48)continue;
    if(walls.some(wall=>distance(unit,wall)<BUILDINGS.wall.r+unit.r+.12))return false;
    if(routable(sim,unit,outside)&&!routable(preview,unit,outside))return false;
  }
  for(const building of sim.entities){
    if(building.hp<=0||building.kind!=='building'||building.progress<1||!sim.allied(owner,building.owner)||distance(building,gate)>48||!Object.values(UNITS).some(unit=>!unit.naval&&unit.at.includes(building.type)))continue;
    const origin=preview.spawnPoint(building);if(!origin||!routable(preview,{...probe,owner:building.owner,...origin},outside))return false;
  }
  return true;
}

export function planFortification(sim,state,owner,base,buildings){
  const defense=buildings.filter(building=>['tower','keep'].includes(building.type)&&building.progress>=1&&distance(building,base)<30).sort((a,b)=>distance(a,base)-distance(b,base))[0];
  if(!defense)return null;
  const enemies=Object.values(state.known||{}).filter(enemy=>enemy.kind==='building').sort((a,b)=>distance(a,base)-distance(b,base));
  const target=enemies[0]||{x:0,z:0},heading=Math.atan2(target.x-base.x,target.z-base.z);
  for(const offset of [0,Math.PI/6,-Math.PI/6,Math.PI/3,-Math.PI/3])for(const depth of [24,30,20]){
    const headingOffset=heading+offset,normal={x:Math.sin(headingOffset),z:Math.cos(headingOffset)},tangent={x:normal.z,z:-normal.x},gate={type:'gate',x:base.x+normal.x*depth,z:base.z+normal.z*depth};
    if(distance(gate,defense)>22||!sim.canSee(owner,gate)||!sim.buildValid('gate',gate.x,gate.z,owner))continue;
    const pieces=[gate];let valid=true;
    for(const sign of [-1,1])for(let index=0;index<4;index++){
      const along=sign*(2+index)*WALL_SPACING,point={type:'wall',x:gate.x+tangent.x*along,z:gate.z+tangent.z*along};
      if(!sim.canSee(owner,point)){valid=false;break;}
      if(!sim.buildValid('wall',point.x,point.z,owner)){
        // A natural woodline can terminate an established flank. Do not place
        // foundations on its resources or treat another building as a forest.
        const natural=index>=2&&sim.entities.some(entity=>entity.hp>0&&entity.kind==='resource'&&!entity.water&&['wood','gold','stone'].includes(entity.type)&&distance(entity,point)<entity.r+BUILDINGS.wall.r+.8);
        if(!natural)valid=false;break;
      }
      pieces.push(point);
    }
    const plan={base:base.id,angle:headingOffset,pieces,created:sim.time};
    if(valid&&pieces.filter(piece=>piece.type==='wall').length>=4&&affordable(sim,owner,totalCost(sim,owner,pieces))&&fortificationRoutesSafe(sim,plan,owner))return plan;
  }
  return null;
}

export function fortifyKingdomWalls(sim,state,owner,workers,buildings,threats){
  const player=sim.players[owner];
  if(sim.options.mode!=='custom'||player.controller!=='ai'||player.age<1||workers.length<18||state.expansion||threats.length||sim.time<180||sim.time<(state.nextFortification||0))return false;
  if(sim.difficulty(owner)==='story'&&(player.age<2||sim.time<420))return false;
  state.fortifications??=[];
  state.fortifications=state.fortifications.filter(plan=>sim.get(plan.base)?.owner===owner);
  if(state.fortifications.some(plan=>plan.pieces.some(piece=>{const building=sim.get(piece.id);return building&&building.progress<1;})))return false;
  let plan=state.fortifications.find(plan=>sim.time>=(plan.retryAt||0)&&plan.pieces.some(piece=>!sim.get(piece.id)));
  if(!plan){
    state.nextFortification=sim.time+30;
    if(!affordable(sim,owner,totalCost(sim,owner,[{type:'gate'},...Array.from({length:4},()=>({type:'wall'}))])))return false;
    for(const base of buildings.filter(building=>building.type==='towncenter'&&building.progress>=1&&!state.fortifications.some(plan=>plan.base===building.id))){
      if(buildings.some(building=>['wall','gate'].includes(building.type)&&distance(building,base)<42))continue;
      plan=planFortification(sim,state,owner,base,buildings);if(plan){state.fortifications.push(plan);break;}
    }
    if(!plan)return false;
  }
  const piece=plan.pieces.find(piece=>!sim.get(piece.id));if(!piece)return false;
  const cost=sim.cost(BUILDINGS[piece.type].cost,owner,'building');
  if(!affordable(sim,owner,cost)||!sim.canSee(owner,piece)||!sim.buildValid(piece.type,piece.x,piece.z,owner)||!fortificationRoutesSafe(sim,plan,owner)){plan.retryAt=sim.time+30;state.nextFortification=sim.time+3;return false;}
  const builders=workers.filter(available).sort((a,b)=>distance(a,piece)-distance(b,piece));
  const worker=builders.find(worker=>routable(sim,worker,piece));if(!worker){plan.retryAt=sim.time+20;return false;}
  const building=sim.build(piece.type,piece.x,piece.z,[worker.id],owner);if(!building)return false;
  building.wallAngle=plan.angle;piece.id=building.id;delete plan.retryAt;state.nextFortification=sim.time+3;
  return true;
}
