import {BUILDINGS,UNITS} from './data.js';

const distance=(a,b)=>Math.hypot(a.x-b.x,a.z-b.z);
const centers=(sim,owner)=>sim.owned(owner,'building','towncenter');
const busy=worker=>worker.embarked||['build','repair','garrison'].includes(worker.order?.type);
const hostileMemory=(state)=>Object.values(state.known||{});

// Decisions use observed resource quantities and last-seen enemy positions.
// Hidden depletion or enemy movement must not update this intelligence.
export function rememberDeposits(sim,state,owner){
  state.deposits??={};
  for(const resource of sim.entities)if(resource.kind==='resource'&&!resource.water&&sim.canSee(owner,resource)){
    if(resource.hp>0&&resource.amount>0)state.deposits[resource.id]={id:resource.id,type:resource.type,x:resource.x,z:resource.z,amount:resource.amount,lastSeen:sim.time};
    else delete state.deposits[resource.id];
  }
}

export function economicDanger(state,point,margin=0){
  return hostileMemory(state).some(enemy=>{
    const definition=enemy.kind==='building'?BUILDINGS[enemy.type]:UNITS[enemy.type];
    if(!definition?.damage||enemy.type==='scout')return false;
    return distance(enemy,point)<(enemy.kind==='building'?(definition.range||0)+16:25)+margin;
  });
}

export function settlementThreats(sim,owner,visible,buildings){
  const assets=buildings.filter(b=>b.progress>=1&&!['wall','gate','house'].includes(b.type));
  return visible.filter(enemy=>enemy.kind==='unit'&&UNITS[enemy.type]?.damage>0&&!UNITS[enemy.type].naval&&assets.some(base=>distance(enemy,base)<(base.type==='towncenter'?30:22)));
}

function expansionCandidates(sim,state,owner){
  const own=centers(sim,owner),friendly=sim.entities.filter(e=>e.hp>0&&e.type==='towncenter'&&sim.allied(owner,e.owner));
  const deposits=Object.values(state.deposits||{}).filter(source=>source.amount>100);
  const candidates=[];
  for(const source of deposits){
    const home=Math.min(...own.map(base=>distance(base,source)));
    if(home<35||home>110||economicDanger(state,source,12))continue;
    const nearby=deposits.filter(other=>distance(source,other)<25),value=nearby.reduce((n,other)=>n+Math.min(other.amount,900)*(other.type==='gold'?1.5:other.type==='stone'?1.15:1),0);
    if(value<900)continue;
    for(let i=0;i<16;i++){
      const angle=i*Math.PI/4,r=i<8?14:22,point={x:source.x+Math.cos(angle)*r,z:source.z+Math.sin(angle)*r};
      if(friendly.some(base=>distance(base,point)<44)||Math.min(...own.map(base=>distance(base,point)))>105||economicDanger(state,point,12)||!sim.buildValid('towncenter',point.x,point.z,owner))continue;
      // Water-separated sites need an actual land route; expansion does not
      // assume a transport, create a distant foundation, or teleport builders.
      candidates.push({...point,source:source.id,score:value/(35+Math.min(...own.map(base=>distance(base,point))))});
    }
  }
  return candidates.sort((a,b)=>b.score-a.score||a.source-b.source||a.x-b.x||a.z-b.z);
}

export function manageExpansion(sim,state,owner,workers,threats){
  if(sim.options.mode!=='custom')return;
  const player=sim.players[owner],bases=centers(sim,owner),limit=['hard','brutal'].includes(sim.difficulty(owner))?3:2;
  let plan=state.expansion;
  const release=()=>{const worker=plan&&sim.get(plan.worker);if(worker?.order?.aiExpansion){sim.command([worker.id],{type:'move',x:bases[0].x+8,z:bases[0].z-6});}state.expansion=null;state.nextExpansion=sim.time+35;plan=null;};
  if(plan){
    const worker=sim.get(plan.worker);
    if(!worker||worker.owner!==owner||worker.aiFleeing||sim.time>plan.until||threats.length||economicDanger(state,plan,8)||distance(worker,plan)>12&&!worker.order?.aiExpansion){release();return;}
    if(distance(worker,plan)>12)return;
    if(!sim.canSee(owner,plan)||!sim.buildValid('towncenter',plan.x,plan.z,owner)){release();return;}
    if(!sim.canAfford(sim.cost(BUILDINGS.towncenter.cost,owner,'building'),owner))return;
    const site=sim.build('towncenter',plan.x,plan.z,[worker.id],owner);if(!site)return;
    const helpers=workers.filter(w=>w!==worker&&!busy(w)&&!w.aiFleeing).sort((a,b)=>distance(a,site)-distance(b,site)).slice(0,2);
    if(helpers.length)sim.command(helpers.map(w=>w.id),{type:'build',target:site.id});
    state.expansionsBuilt=(state.expansionsBuilt||0)+1;state.expansion=null;state.nextExpansion=sim.time+90;return;
  }
  if(player.age<2||workers.length<22||bases.length>=limit||bases.some(base=>base.progress<1)||threats.length||sim.time<(state.nextExpansion||0))return;
  const cost=sim.cost(BUILDINGS.towncenter.cost,owner,'building');
  if(!sim.canAfford({...cost,wood:(cost.wood||0)+180,food:150},owner))return;
  state.nextExpansion=sim.time+20;
  const builders=workers.filter(w=>!busy(w)&&!w.aiFleeing&&w.order?.type!=='move');
  for(const point of expansionCandidates(sim,state,owner).slice(0,24)){
    const worker=builders.slice().sort((a,b)=>distance(a,point)-distance(b,point))[0];if(!worker)return;
    const route=sim.pathTo(worker,point);if(worker.pathStatus==='blocked'||!route.length||distance(route.at(-1),point)>8)continue;
    state.expansion={x:point.x,z:point.z,source:point.source,worker:worker.id,until:sim.time+100};
    sim.command([worker.id],{type:'move',x:point.x,z:point.z,aiExpansion:true});return;
  }
}

export function fortifySettlements(sim,state,owner,workers,buildings,threats){
  const player=sim.players[owner];
  if(player.age<1||workers.length<14||buildings.some(b=>['tower','keep'].includes(b.type)&&b.progress<1)||state.expansion||player.resources.wood<260)return;
  const bases=buildings.filter(b=>b.type==='towncenter'&&b.progress>=1);
  for(const base of bases){
    const nearby=buildings.filter(b=>b.type==='tower'&&distance(b,base)<30),wanted=player.age>=3&&workers.length>=28?2:1;
    if(nearby.length>=wanted)continue;
    const enemy=threats.slice().sort((a,b)=>distance(a,base)-distance(b,base))[0]||hostileMemory(state).filter(e=>e.kind==='building').sort((a,b)=>distance(a,base)-distance(b,base))[0]||{x:0,z:0};
    const angle=Math.atan2(enemy.z-base.z,enemy.x-base.x)+(nearby.length?Math.PI*.65:0),point={x:base.x+Math.cos(angle)*15,z:base.z+Math.sin(angle)*15};
    if(sim.commanderBuild('tower',point,owner))return;
  }
  if(player.age>=2&&workers.length>=26&&!buildings.some(b=>b.type==='keep')&&player.resources.wood>=420&&player.resources.stone>=800){
    const base=bases[0];if(base)sim.commanderBuild('keep',{x:base.x*.88,z:base.z*.88},owner);
  }
}

export function staffSettlements(sim,state,owner,workers,buildings){
  // Reclaim abandoned paid foundations, and keep multi-center economies useful
  // without exceeding the difficulty's global worker target.
  for(const site of buildings.filter(b=>b.progress<1)){
    if(workers.some(w=>w.order?.type==='build'&&w.order.target===site.id))continue;
    const worker=workers.filter(w=>!busy(w)&&!w.aiFleeing&&!w.order?.aiExpansion).sort((a,b)=>distance(a,site)-distance(b,site))[0];
    if(worker&&!economicDanger(state,site))sim.command([worker.id],{type:'build',target:site.id});
    break;
  }
  state.staffedCenters??=[];
  for(const base of buildings.filter(b=>b.type==='towncenter'&&b.progress>=1)){
    if(state.staffedCenters.includes(base.id))continue;state.staffedCenters.push(base.id);
    if(centers(sim,owner)[0]?.id===base.id)continue;
    const nearby=workers.filter(w=>distance(w,base)<25).length,helpers=workers.filter(w=>!busy(w)&&!w.aiFleeing&&!w.order?.aiExpansion&&distance(w,base)>=25).sort((a,b)=>distance(a,base)-distance(b,base)).slice(0,Math.max(0,5-nearby));
    if(helpers.length)sim.command(helpers.map(w=>w.id),{type:'move',x:base.x+8,z:base.z-6});
  }
}

export function protectWorkers(sim,state,owner,workers,buildings,visible){
  const enemies=visible.filter(e=>e.kind==='unit'&&UNITS[e.type]?.damage>0&&!UNITS[e.type].naval),shelters=buildings.filter(b=>b.progress>=1&&BUILDINGS[b.type].damage);
  for(const worker of workers){
    if(worker.embarked||worker.order?.type==='garrison')continue;
    const danger=enemies.filter(enemy=>distance(worker,enemy)<Math.min(25,(UNITS[enemy.type].range||2)+8)).sort((a,b)=>distance(a,worker)-distance(b,worker))[0];
    if(!danger)continue;
    const safe=shelters.flatMap(base=>{
      const d=Math.max(1,distance(base,danger)),point={x:base.x+(base.x-danger.x)/d*(base.r+5),z:base.z+(base.z-danger.z)/d*(base.r+5)};
      return distance(worker,point)<85&&!sim.isWater(point.x,point.z)&&!enemies.some(enemy=>distance(enemy,point)<(UNITS[enemy.type].range||2)+5)?[{...point,score:distance(worker,point)}]:[];
    }).sort((a,b)=>a.score-b.score)[0];
    if(!safe)continue;
    if(worker.order?.aiEvade&&distance(worker.order,safe)<8){worker.aiFleeing=sim.time+12;continue;}
    const route=sim.pathTo(worker,safe);if(worker.pathStatus==='blocked'||!route.length||distance(route.at(-1),safe)>8)continue;
    worker.aiFleeing=sim.time+12;
    sim.command([worker.id],{type:'move',x:safe.x,z:safe.z,aiEvade:true});
  }
}
