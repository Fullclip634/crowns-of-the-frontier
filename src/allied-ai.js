import {UNITS,DIFFICULTIES} from './data.js';
const distance=(a,b)=>Math.hypot(a.x-b.x,a.z-b.z);
const strength=unit=>(UNITS[unit.type]?.damage||0)/(UNITS[unit.type]?.cooldown||1.2)*Math.max(0,unit.hp/Math.max(1,unit.maxHp));
const fieldFighter=unit=>unit?.hp>0&&!unit.embarked&&unit.hp>unit.maxHp*.28&&UNITS[unit.type]?.damage>0&&!UNITS[unit.type].naval&&!['worker','fisher','quest','siege'].includes(UNITS[unit.type].role)&&!['king','scout'].includes(unit.type)&&unit.order?.type!=='board';

// Starting positions are public in the custom setup. Scout the nearest rival
// front instead of treating the first opponent in the slot list as a target.
export function customAttackTarget(sim,owner,state,tc,knownBuildings){
  const unseen=sim.spawnPositions.map((point,i)=>({...point,owner:i,unscouted:true})).filter(point=>sim.hostile(owner,point.owner)&&!sim.players[point.owner].defeated&&!state.scoutedSpawns?.[point.owner]);
  const targets=[...knownBuildings,...unseen];
  targets.sort((a,b)=>(distance(tc,a)+(a.unscouted?10:a.type==='towncenter'?-20:0))-(distance(tc,b)+(b.unscouted?10:b.type==='towncenter'?-20:0)));
  return targets[0]||sim.spawnPositions.map((point,i)=>({...point,owner:i})).filter(point=>sim.hostile(owner,point.owner)&&!sim.players[point.owner].defeated).sort((a,b)=>distance(tc,a)-distance(tc,b))[0]||tc;
}

export const AI_PACES={balanced:{name:'Balanced · build up, then battle',factor:1,army:1},patient:{name:'Grand war · longer buildup',factor:1.5,army:1.3},aggressive:{name:'Aggressive · early pressure',factor:0,army:.65}};
export function customOpening(sim,owner,profile){
  const pace=AI_PACES[sim.options.aiPace]||AI_PACES.balanced,difficulty=sim.difficulty(owner),age=sim.options.startAge||0;
  // Small battles must leave room for workers, support and the coastal fleet.
  const limit=sim.options.populationLimit||80,armyBudget=limit<80?Math.max(limit===10&&sim.options.map==='coast'?2:4,Math.floor(limit*.4)-(sim.options.map==='coast'?11:0)):Infinity;
  if(!pace.factor)return {earliest:DIFFICULTIES[difficulty].attack,army:Math.min(armyBudget,profile.raid,6+sim.players[owner].age*3),workers:0,age:0};
  const floor={story:420,normal:300,hard:240,brutal:210}[difficulty];
  return {earliest:Math.max(DIFFICULTIES[difficulty].attack,floor*[1,.7,.45,.3][age]*pace.factor),army:Math.min(armyBudget,Math.ceil(profile.raid*pace.army)),workers:Math.min(age>=2?12:16,Math.max(4,Math.floor(limit*.4))),age:1};
}

// A teammate's damage report shares the threatened base, not hidden enemy data.
export function recordBaseAlarm(sim,target,attacker,damage){
  if(sim.options.mode!=='custom'||target.owner<0||!attacker||!sim.hostile(target.owner,attacker.owner)||damage<=0)return;
  if(target.kind!=='building'&&UNITS[target.type]?.role!=='worker')return;
  const sites=sim.owned(target.owner,'building').filter(b=>b.progress>=1&&!['wall','gate','farm'].includes(b.type));
  const perimeter=target.kind==='building'&&['wall','gate'].includes(target.type),radius=perimeter?48:24;
  const base=sites.filter(b=>distance(b,target)<radius).sort((a,b)=>(a.type==='towncenter'?-20:0)+distance(a,target)-(b.type==='towncenter'?-20:0)-distance(b,target))[0];
  if(!base)return;
  sim.teamAlarms??={};const key=target.owner+':'+base.id,old=sim.teamAlarms[key];
  sim.teamAlarms[key]={owner:target.owner,base:base.id,x:base.x,z:base.z,...(perimeter?{siteX:target.x,siteZ:target.z}:{}),at:sim.time,intensity:Math.min(500,(old&&sim.time-old.at<20?old.intensity:0)+damage)};
}

export function alliedSupport(sim,owner,state,ready,visible,tc,ownThreats){
  if(sim.options.mode!=='custom'||sim.players[owner].controller!=='ai')return new Set();
  sim.teamAlarms??={};for(const [key,alarm] of Object.entries(sim.teamAlarms))if(sim.time-alarm.at>90||!sim.get(alarm.base)?.hp)delete sim.teamAlarms[key];
  const alertPoint=(base,alarm)=>Number.isFinite(alarm?.siteX)&&Number.isFinite(alarm?.siteZ)?{x:alarm.siteX,z:alarm.siteZ,r:1}:base;
  const dangers=(base,alarm)=>{const site=alertPoint(base,alarm);return visible.filter(e=>e.hp>0&&e.kind==='unit'&&UNITS[e.type]?.damage>0&&!UNITS[e.type].naval&&sim.hostile(owner,e.owner)&&(distance(e,site)<34||distance(e,base)<34));};
  for(const base of sim.entities.filter(e=>e.hp>0&&e.kind==='building'&&['towncenter','keep','dock'].includes(e.type)&&e.owner!==owner&&sim.allied(owner,e.owner)&&sim.canSee(owner,e))){
    const attackers=dangers(base).filter(e=>e.type!=='scout');
    if(attackers.length>=2||attackers.some(e=>UNITS[e.type].role==='siege')){const key=base.owner+':'+base.id;sim.teamAlarms[key]={owner:base.owner,base:base.id,x:base.x,z:base.z,at:sim.time,intensity:Math.max(attackers.length*25,sim.teamAlarms[key]?.intensity||0)};}
  }
  const combat=ready.filter(unit=>unit.owner===owner&&fieldFighter(unit)),reserve=new Set();
  // Keep a home guard, sized to a real local threat. A lone harasser no longer
  // recalls the entire relief army while the ally's capital is being razed.
  for(const shore of sim.options.map==='coast'?[-1,1]:[0]){
    const local=combat.filter(unit=>!shore||Math.sign(unit.x)===shore),homeNeed=ownThreats.filter(enemy=>!shore||Math.sign(enemy.x)===shore).reduce((sum,enemy)=>sum+strength(enemy),0)*1.15,minimum=Math.min(local.length,Math.max(local.length>=4?2:1,Math.ceil(local.length*.25)));
    let homePower=0,count=0;for(const unit of local.sort((a,b)=>distance(a,tc)-distance(b,tc))){if(count>=minimum&&homePower>=homeNeed)break;reserve.add(unit.id);count++;homePower+=strength(unit);}
  }
  const sameShore=(unit,base)=>sim.options.map!=='coast'||Math.sign(unit.x)===Math.sign(base.x);
  const relief=(base,alarm)=>{
    const available=combat.filter(unit=>!reserve.has(unit.id)&&sameShore(unit,base)),attackers=dangers(base,alarm),urgent=base.hp<base.maxHp*.6||(alarm?.intensity||0)>=Math.max(100,base.maxHp*.1)||attackers.length>=6;
    const average=available.reduce((sum,unit)=>sum+strength(unit),0)/Math.max(1,available.length),needed=attackers.length?Math.ceil(attackers.reduce((sum,enemy)=>sum+strength(enemy),0)*1.25/Math.max(1,average)):Math.ceil((alarm?.intensity||0)/30)+1;
    const count=Math.min(available.length,Math.max(2,Math.ceil(combat.length*(urgent?.65:.45))));
    return {available,urgent,count:Math.min(count,Math.max(2,urgent?count:needed))};
  };
  const destination=(base,alarm)=>{
    const site=alertPoint(base,alarm),attackers=dangers(base,alarm).sort((a,b)=>(distance(a,site)-(UNITS[a.type].role==='siege'?14:0))-(distance(b,site)-(UNITS[b.type].role==='siege'?14:0)));
    if(attackers.length)return {x:attackers[0].x,z:attackers[0].z,engaging:true};
    const d=Math.max(1,distance(tc,site));return {x:site.x+(tc.x-site.x)/d*(site.r+5),z:site.z+(tc.z-site.z)/d*(site.r+5),engaging:false};
  };
  const routeFor=(units,point)=>{
    for(const unit of units.slice(0,4)){const path=sim.pathTo(unit,point);if(unit.pathStatus==='blocked'||!path.length||distance(path.at(-1),point)>10)continue;let length=0,last=unit;for(const waypoint of path){length+=distance(last,waypoint);last=waypoint;}return {unit,length};}return null;
  };
  let duty=state.support;
  const release=()=>{
    const ids=(duty?.units||[]).filter(id=>{const unit=sim.get(id);return unit?.hp>0&&unit.owner===owner&&!unit.embarked;});
    sim.command(ids,{type:'move',x:tc.x+8,z:tc.z-6});
    state.support=null;duty=null;
  };
  if(duty){
    const base=sim.get(duty.base),alarm=sim.teamAlarms[duty.ally+':'+duty.base];
    duty.units=duty.units.filter(id=>{const u=sim.get(id);return u?.hp>0&&u.owner===owner&&!u.embarked&&u.hp>u.maxHp*.28;});
    const recalled=duty.units.filter(id=>reserve.has(id));if(recalled.length){sim.command(recalled,{type:'move',x:tc.x+8,z:tc.z-6});duty.units=duty.units.filter(id=>!reserve.has(id));}
    if(!base?.hp||!sim.allied(owner,duty.ally)||!duty.units.some(id=>fieldFighter(sim.get(id)))||sim.time>duty.until)release();
    else{
      if(alarm){if(Number.isFinite(alarm.siteX)&&Number.isFinite(alarm.siteZ)){duty.siteX=alarm.siteX;duty.siteZ=alarm.siteZ;}else{delete duty.siteX;delete duty.siteZ;}}
      if(alarm&&sim.time-alarm.at<20)duty.until=Math.max(duty.until,sim.time+25);
      const attention=alarm||duty,arrived=duty.units.some(id=>distance(sim.get(id),alertPoint(base,attention))<20),danger=dangers(base,attention).length>0;
      if(arrived&&!danger&&(!alarm||sim.time-alarm.at>18))release();
      else{
        const point=destination(base,attention),plan=relief(base,attention),fighters=duty.units.filter(id=>fieldFighter(sim.get(id)));
        if(alarm&&sim.time-alarm.at<30&&sim.time-(duty.lastReinforce??-10)>=6&&fighters.length<plan.count){
          const additions=plan.available.filter(unit=>!duty.units.includes(unit.id)).sort((a,b)=>distance(a,point)/UNITS[a.type].speed-distance(b,point)/UNITS[b.type].speed).slice(0,plan.count-fighters.length),route=routeFor(additions,point);duty.lastReinforce=sim.time;
          if(route){const ids=additions.map(unit=>unit.id);sim.command(ids,{type:'attackmove',x:point.x,z:point.z});duty.units.push(...ids);duty.until=Math.max(duty.until,sim.time+route.length/Math.min(...additions.map(unit=>UNITS[unit.type].speed))*1.5+30);sim.emit('ally-support',{owner,ally:duty.ally,count:ids.length,x:base.x,z:base.z});}
        }
        if(sim.time-(duty.lastOrder??0)>=6||point.engaging!==duty.engaging){sim.command(duty.units.filter(id=>UNITS[sim.get(id).type].damage),{type:'attackmove',x:point.x,z:point.z});Object.assign(duty,point,{lastOrder:sim.time});}
      }
    }
  }
  if(duty||sim.time-(state.lastSupport??-40)<8)return new Set(duty?.units||[]);
  const arrival=alarm=>{const site=alertPoint(alarm,alarm);return Math.min(...combat.filter(unit=>!reserve.has(unit.id)&&sameShore(unit,alarm)).map(unit=>distance(unit,site)/UNITS[unit.type].speed));};
  const candidates=Object.values(sim.teamAlarms).filter(alarm=>alarm.owner!==owner&&sim.allied(owner,alarm.owner)&&sim.time-alarm.at<30&&Number.isFinite(arrival(alarm))).sort((a,b)=>(arrival(a)-a.intensity*.025)-(arrival(b)-b.intensity*.025));
  // An urgent but unreachable base must not starve other allies of help.
  // Check candidates in priority order and commit only a viable assignment.
  for(const alarm of candidates){
    const base=sim.get(alarm.base),point=destination(base,alarm),plan=relief(base,alarm);if(plan.count<2)continue;
    const group=plan.available.sort((a,b)=>distance(a,point)/UNITS[a.type].speed-distance(b,point)/UNITS[b.type].speed).slice(0,plan.count);
    // Validate one leader before dispatch; the regular movement system then routes
    // every real unit, including friendly gates and bridges, without teleporting.
    const route=routeFor(group,point);if(!route)continue;
    const healer=ready.find(u=>u.owner===owner&&u.type==='monk'&&!u.embarked&&u.hp>u.maxHp*.5&&u.order?.type!=='board'&&sameShore(u,base)&&distance(u,point)<Math.max(240,distance(route.unit,point)+30)),units=group.map(u=>u.id);
    sim.command(units,{type:'attackmove',x:point.x,z:point.z});if(healer){sim.guard([healer.id],route.unit.id,false,owner);units.push(healer.id);}
    const travel=route.length/Math.min(...group.map(unit=>UNITS[unit.type].speed));
    state.support={ally:alarm.owner,base:alarm.base,units,...(Number.isFinite(alarm.siteX)&&Number.isFinite(alarm.siteZ)?{siteX:alarm.siteX,siteZ:alarm.siteZ}:{}),...point,until:sim.time+travel*1.5+30,lastOrder:sim.time,lastReinforce:sim.time};state.lastSupport=sim.time;
    sim.emit('ally-support',{owner,ally:alarm.owner,count:units.length,x:base.x,z:base.z});
    return new Set(units);
  }
  return new Set();
}
