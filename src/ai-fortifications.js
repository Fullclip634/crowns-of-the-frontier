import {BUILDINGS,UNITS} from './data.js';
import {WALL_SPACING,connectWall} from './walls.js';
import {clearSegment,findPath,unitNavigationGrid,navigationRegions} from './navigation.js';
import {perimeterLayout,adaptivePerimeterLayouts,naturalWallAnchor} from './ai-wall-layout.js';

const distance=(a,b)=>Math.hypot(a.x-b.x,a.z-b.z);
const reserve={food:180,wood:240,gold:80,stone:180};
const available=worker=>!worker.embarked&&!worker.aiFleeing&&!['build','repair','garrison'].includes(worker.order?.type)&&!worker.order?.aiExpansion&&!worker.order?.aiFortification;
const affordable=(sim,owner,cost)=>Object.entries(cost).every(([resource,amount])=>sim.players[owner].resources[resource]-amount>=(reserve[resource]||0));
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
      for(const gate of plan.pieces.filter(piece=>piece.type==='gate')){
        const angle=gate.angle??plan.angle,dx=point.x-gate.x,dz=point.z-gate.z,along=dx*Math.sin(angle)+dz*Math.cos(angle),across=dx*Math.cos(angle)-dz*Math.sin(angle);
        if(Math.abs(along)<10+definition.r&&Math.abs(across)<3+definition.r)return true;
      }
    }
  }
  return false;
}

// Validate a complete, linked layout on private scratch state before paying for
// its first foundation. Walls stay solid; only allied gates provide passage.
function plannedSimulation(sim,plan,owner){
  const entities=sim.entities.map(entity=>['wall','gate'].includes(entity.type)?{...entity,wallLinks:[...(entity.wallLinks||[])]}:entity),added=[];
  for(const [index,piece]of plan.pieces.entries())if(!sim.get(piece.id)&&!naturalWallAnchor(sim,piece)){
    const entity={...piece,id:-index-1,owner,kind:'building',hp:1,r:BUILDINGS[piece.type].r,wallAngle:piece.angle??plan.angle,wallLinks:[]};
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

export function fortificationRoutesSafe(sim,plan,owner,displaced=null,currentPiece=null){
  const base=sim.get(plan.base);if(!base)return false;
  const preview=plannedSimulation(sim,plan,owner),gate=plan.pieces[0],normal={x:Math.sin(plan.angle),z:Math.cos(plan.angle)};
  const inside={x:gate.x-normal.x*9,z:gate.z-normal.z*9},outside={x:gate.x+normal.x*9,z:gate.z+normal.z*9};
  for(const opening of plan.pieces.filter(piece=>piece.type==='gate')){
    const angle=opening.angle??plan.angle,n={x:Math.sin(angle),z:Math.cos(angle)},crossing=plan.layout==='perimeter'?5:9;
    const from={x:opening.x-n.x*crossing,z:opening.z-n.z*crossing},to={x:opening.x+n.x*crossing,z:opening.z+n.z*crossing};
    // Cross the actual portal; a developed base's road may bend beyond it.
    if(!clearSegment(preview,preview.grid(owner),from,to)||!routable(preview,{type:'spearman',owner,r:.65,...from},outside)||!routable(preview,{type:'spearman',owner,r:.65,...to},outside))return false;
  }
  const spawn=preview.spawnPoint(base);if(!spawn)return false;
  const probe={type:'spearman',owner,r:.65,...spawn};if(!routable(preview,probe,outside))return false;
  // Units move between foundations. During construction check their safety
  // against the next real piece; keep full-layout gate and production checks.
  const unitPreview=currentPiece?plannedSimulation(sim,{...plan,pieces:[currentPiece]},owner):preview;
  const walls=(currentPiece?[currentPiece]:plan.pieces).filter(piece=>piece.type==='wall'&&!sim.get(piece.id)&&!naturalWallAnchor(sim,piece));
  for(const unit of sim.entities){
    if(unit.hp<=0||unit.kind!=='unit'||unit.embarked||UNITS[unit.type].naval||!sim.allied(owner,unit.owner)||distance(unit,gate)>48)continue;
    if(walls.some(wall=>distance(unit,wall)<BUILDINGS.wall.r+unit.r+.12)||routable(sim,unit,outside)&&!routable(unitPreview,unit,outside)){
      if(displaced&&unit.owner===owner&&unit.type==='villager')displaced.push(unit.id);return false;
    }
  }
  for(const building of sim.entities){
    if(building.hp<=0||building.kind!=='building'||building.progress<1||!sim.allied(owner,building.owner)||distance(building,gate)>48||!Object.values(UNITS).some(unit=>!unit.naval&&unit.at.includes(building.type)))continue;
    const origin=preview.spawnPoint(building);if(!origin||!routable(preview,{...probe,owner:building.owner,...origin},outside))return false;
  }
  return true;
}

export function planPerimeterUpgrade(sim,plan,owner){
  const base=sim.get(plan.base);if(!base||plan.layout==='perimeter'||plan.pieces.some(piece=>!sim.get(piece.id)||sim.get(piece.id).progress<1))return null;
  const depth=(plan.pieces[0].x-base.x)*Math.sin(plan.angle)+(plan.pieces[0].z-base.z)*Math.cos(plan.angle);
  function* candidates(){
    for(const width of [5,6,7])for(const length of [14,16,18])if(depth-length*WALL_SPACING<=-9)yield perimeterLayout(plan,width,length);
    yield* adaptivePerimeterLayouts(sim,plan,owner);
  }
  for(const candidate of candidates()){
    const missing=candidate.pieces.filter(piece=>!sim.get(piece.id)&&!naturalWallAnchor(sim,piece));
    if(!affordable(sim,owner,totalCost(sim,owner,missing))||missing.some(piece=>!sim.canSee(owner,piece)||!sim.buildValid(piece.type,piece.x,piece.z,owner)))continue;
    if(!fortificationRoutesSafe(sim,candidate,owner))continue;
    const enemy=sim.players.findIndex((_,i)=>sim.hostile(owner,i));if(enemy<0)continue;
    const gate=candidate.pieces[0],normal={x:Math.sin(candidate.angle),z:Math.cos(candidate.angle)},inside={x:gate.x-normal.x*9,z:gate.z-normal.z*9},outside={x:gate.x+normal.x*9,z:gate.z+normal.z*9};
    const probe={type:'spearman',owner:enemy,r:.65,...outside};
    // A rectangle is useful only if enemies cannot walk around its ends.
    if(!routable(sim,probe,inside)||routable(plannedSimulation(sim,candidate,owner),probe,inside))continue;
    return candidate;
  }
  return null;
}

function clearWorkerSites(sim,plan,owner,workers,displaced=[],currentPiece=null){
  const walls=(currentPiece?[currentPiece]:plan.pieces).filter(piece=>piece.type==='wall'&&!sim.get(piece.id)&&!naturalWallAnchor(sim,piece));
  const blocked=workers.filter(worker=>displaced.includes(worker.id)||walls.some(wall=>distance(worker,wall)<BUILDINGS.wall.r+worker.r+.12));
  if(!blocked.length)return false;
  const base=sim.get(plan.base),points=[],future=plannedSimulation(sim,plan,owner),gate=plan.pieces[0],outside={x:gate.x+Math.sin(plan.angle)*9,z:gate.z+Math.cos(plan.angle)*9};
  for(const radius of [10,13,16])for(let i=0;i<16;i++){const angle=i*Math.PI/8;points.push({x:base.x+Math.sin(angle)*radius,z:base.z+Math.cos(angle)*radius});}
  for(const worker of blocked){
    if(!available(worker))continue;
    const grid=unitNavigationGrid(sim,worker),target=points.filter(point=>{const cell=sim.cell(point.x,point.z);return !grid[cell.z*sim.gridSize+cell.x]&&walls.every(wall=>distance(point,wall)>BUILDINGS.wall.r+worker.r+.5);}).sort((a,b)=>distance(worker,a)-distance(worker,b)).find(point=>routable(sim,worker,point)&&routable(future,{...worker,...point},outside));
    if(target)sim.command([worker.id],{type:'move',x:target.x,z:target.z,aiFortification:true});
  }
  return blocked.some(worker=>worker.order?.aiFortification);
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
  const player=sim.players[owner],populationLimit=sim.options.populationLimit||160,fortificationWorkers=Math.min(18,Math.floor(populationLimit*.45)),perimeterWorkers=Math.min(24,Math.floor(populationLimit*.5));
  if(sim.options.mode!=='custom'||player.controller!=='ai'||player.age<1||workers.length<fortificationWorkers||threats.length||sim.time<180||sim.time<(state.nextFortification||0))return false;
  if(sim.difficulty(owner)==='story'&&(player.age<2||sim.time<420))return false;
  state.fortifications??=[];
  state.fortifications=state.fortifications.filter(plan=>sim.get(plan.base)?.owner===owner);
  if(state.fortifications.some(plan=>plan.pieces.some(piece=>{const building=sim.get(piece.id);return building&&building.progress<1;})))return false;
  let plan=state.fortifications.find(plan=>sim.time>=(plan.retryAt||0)&&plan.pieces.some(piece=>!sim.get(piece.id)&&!naturalWallAnchor(sim,piece)));
  if(!plan&&workers.length>=perimeterWorkers&&sim.time>=300&&sim.time>=(state.nextPerimeter||0)){
    state.nextPerimeter=sim.time+60;
    for(const existing of state.fortifications){
      const upgraded=planPerimeterUpgrade(sim,existing,owner);
      if(upgraded){Object.assign(existing,upgraded);plan=existing;break;}
    }
  }
  if(!plan){
    state.nextFortification=sim.time+30;
    if(!affordable(sim,owner,totalCost(sim,owner,[{type:'gate'},...Array.from({length:4},()=>({type:'wall'}))])))return false;
    for(const base of buildings.filter(building=>building.type==='towncenter'&&building.progress>=1&&!state.fortifications.some(plan=>plan.base===building.id))){
      if(buildings.some(building=>['wall','gate'].includes(building.type)&&distance(building,base)<42))continue;
      plan=planFortification(sim,state,owner,base,buildings);if(plan){state.fortifications.push(plan);break;}
    }
    if(!plan)return false;
  }
  const piece=plan.pieces.find(piece=>!sim.get(piece.id)&&!naturalWallAnchor(sim,piece));if(!piece)return false;
  if(clearWorkerSites(sim,plan,owner,workers,[],piece)){state.nextFortification=sim.time+1;return false;}
  const cost=sim.cost(BUILDINGS[piece.type].cost,owner,'building');
  if(!affordable(sim,owner,cost)||!sim.canSee(owner,piece)||!sim.buildValid(piece.type,piece.x,piece.z,owner)){plan.retryAt=sim.time+30;state.nextFortification=sim.time+3;return false;}
  const displaced=[];
  if(!fortificationRoutesSafe(sim,plan,owner,displaced,piece)){
    if(clearWorkerSites(sim,plan,owner,workers,displaced,piece)){state.nextFortification=sim.time+1;return false;}
    plan.retryAt=sim.time+30;state.nextFortification=sim.time+3;return false;
  }
  const builders=workers.filter(available).sort((a,b)=>distance(a,piece)-distance(b,piece));
  const worker=builders.find(worker=>routable(sim,worker,piece));if(!worker){plan.retryAt=sim.time+20;return false;}
  const builderIds=[worker.id];
  if(plan.layout==='perimeter'){const helper=builders.find(other=>other.id!==worker.id&&routable(sim,other,piece));if(helper)builderIds.push(helper.id);}
  const building=sim.build(piece.type,piece.x,piece.z,builderIds,owner);if(!building)return false;
  building.wallAngle=piece.angle??plan.angle;piece.id=building.id;delete plan.retryAt;state.nextFortification=sim.time+3;
  return true;
}
