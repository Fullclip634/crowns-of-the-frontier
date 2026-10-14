import {UNITS,DIFFICULTIES} from './data.js';
const distance=(a,b)=>Math.hypot(a.x-b.x,a.z-b.z);

export const AI_PACES={balanced:{name:'Balanced · build up, then battle',factor:1,army:1},patient:{name:'Grand war · longer buildup',factor:1.5,army:1.3},aggressive:{name:'Aggressive · early pressure',factor:0,army:.65}};
export function customOpening(sim,owner,profile){
  const pace=AI_PACES[sim.options.aiPace]||AI_PACES.balanced,difficulty=sim.difficulty(owner),age=sim.options.startAge||0;
  if(!pace.factor)return {earliest:DIFFICULTIES[difficulty].attack,army:Math.min(profile.raid,6+sim.players[owner].age*3),workers:0,age:0};
  const floor={story:420,normal:300,hard:240,brutal:210}[difficulty];
  return {earliest:Math.max(DIFFICULTIES[difficulty].attack,floor*[1,.7,.45,.3][age]*pace.factor),army:Math.ceil(profile.raid*pace.army),workers:age>=2?12:16,age:1};
}

// A teammate's damage report shares the threatened base, not hidden enemy data.
export function recordBaseAlarm(sim,target,attacker,damage){
  if(sim.options.mode!=='custom'||target.owner<0||!attacker||!sim.hostile(target.owner,attacker.owner)||damage<=0)return;
  if(target.kind!=='building'&&UNITS[target.type]?.role!=='worker')return;
  const sites=sim.owned(target.owner,'building').filter(b=>b.progress>=1&&!['wall','gate','farm'].includes(b.type));
  const base=sites.filter(b=>distance(b,target)<24).sort((a,b)=>(a.type==='towncenter'?-20:0)+distance(a,target)-(b.type==='towncenter'?-20:0)-distance(b,target))[0];
  if(!base)return;
  sim.teamAlarms??={};const key=target.owner+':'+base.id,old=sim.teamAlarms[key];
  sim.teamAlarms[key]={owner:target.owner,base:base.id,x:base.x,z:base.z,at:sim.time,intensity:Math.min(500,(old&&sim.time-old.at<20?old.intensity:0)+damage)};
}

export function alliedSupport(sim,owner,state,ready,visible,tc,ownThreats){
  if(sim.options.mode!=='custom'||sim.players[owner].controller!=='ai')return new Set();
  sim.teamAlarms??={};for(const [key,alarm] of Object.entries(sim.teamAlarms))if(sim.time-alarm.at>90||!sim.get(alarm.base)?.hp)delete sim.teamAlarms[key];
  for(const base of sim.entities.filter(e=>e.hp>0&&e.kind==='building'&&['towncenter','keep','dock'].includes(e.type)&&e.owner!==owner&&sim.allied(owner,e.owner)&&sim.canSee(owner,e))){
    const attackers=visible.filter(e=>e.kind==='unit'&&e.type!=='scout'&&UNITS[e.type].damage>0&&distance(e,base)<24);
    if(attackers.length>=3){const key=base.owner+':'+base.id;sim.teamAlarms[key]={owner:base.owner,base:base.id,x:base.x,z:base.z,at:sim.time,intensity:Math.min(500,attackers.length*25+(sim.teamAlarms[key]?.intensity||0))};}
  }
  let duty=state.support;
  const release=()=>{
    const ids=(duty?.units||[]).filter(id=>{const unit=sim.get(id);return unit?.hp>0&&unit.owner===owner&&!unit.embarked;});
    sim.command(ids,{type:'move',x:tc.x+8,z:tc.z-6});
    state.support=null;duty=null;
  };
  if(duty){
    const base=sim.get(duty.base),alarm=sim.teamAlarms[duty.ally+':'+duty.base];
    duty.units=duty.units.filter(id=>{const u=sim.get(id);return u?.hp>0&&u.owner===owner&&!u.embarked&&u.hp>u.maxHp*.28;});
    if(ownThreats.length||!base?.hp||!sim.allied(owner,duty.ally)||!duty.units.length||sim.time>duty.until)release();
    else{
      if(alarm&&sim.time-alarm.at<20)duty.until=Math.max(duty.until,sim.time+25);
      const arrived=duty.units.some(id=>distance(sim.get(id),base)<20),danger=visible.some(e=>e.kind==='unit'&&UNITS[e.type].damage&&distance(e,base)<30);
      if(arrived&&!danger&&(!alarm||sim.time-alarm.at>18))release();
      else if(sim.time-(duty.lastOrder||0)>12){sim.command(duty.units.filter(id=>UNITS[sim.get(id).type].damage),{type:'attackmove',x:duty.x,z:duty.z});duty.lastOrder=sim.time;}
    }
  }
  if(duty||ownThreats.length||sim.time-(state.lastSupport||-40)<25)return new Set(duty?.units||[]);
  const candidates=Object.values(sim.teamAlarms).filter(alarm=>alarm.owner!==owner&&sim.allied(owner,alarm.owner)&&sim.time-alarm.at<30&&distance(tc,alarm)<240&&(sim.options.map!=='coast'||Math.sign(tc.x)===Math.sign(alarm.x))).sort((a,b)=>(distance(tc,a)-a.intensity*.08)-(distance(tc,b)-b.intensity*.08));
  const alarm=candidates[0];if(!alarm)return new Set();
  const sameShore=unit=>sim.options.map!=='coast'||Math.sign(unit.x)===Math.sign(alarm.x);
  const combat=ready.filter(u=>UNITS[u.type].damage>0&&UNITS[u.type].role!=='siege'&&!UNITS[u.type].naval&&u.order?.type!=='board'&&sameShore(u));
  const reserve=Math.max(2,Math.ceil(combat.length*.25)),count=Math.min(12,Math.max(2,Math.ceil(combat.length*.4)),combat.length-reserve);if(count<2)return new Set();
  const base=sim.get(alarm.base),d=Math.max(1,distance(tc,base)),point={x:base.x+(tc.x-base.x)/d*(base.r+6),z:base.z+(tc.z-base.z)/d*(base.r+6)};
  const group=combat.sort((a,b)=>distance(a,point)/UNITS[a.type].speed-distance(b,point)/UNITS[b.type].speed).slice(0,count);
  // Validate one leader before dispatch; the regular movement system then routes
  // every real unit, including friendly gates and bridges, without teleporting.
  const path=sim.pathTo(group[0],point);if(group[0].pathStatus==='blocked'||!path.length||distance(path.at(-1),point)>10)return new Set();
  const healer=ready.find(u=>u.type==='monk'&&u.hp>u.maxHp*.5&&distance(u,point)<240&&sameShore(u)),units=group.map(u=>u.id);
  sim.command(units,{type:'attackmove',...point});if(healer){sim.guard([healer.id],group[0].id,false,owner);units.push(healer.id);}
  const travel=distance(group[0],point)/UNITS[group[0].type].speed;
  state.support={ally:alarm.owner,base:alarm.base,units,...point,until:sim.time+Math.min(100,travel+25),lastOrder:sim.time};state.lastSupport=sim.time;
  sim.emit('ally-support',{owner,ally:alarm.owner,count:units.length,x:base.x,z:base.z});
  return new Set(units);
}
