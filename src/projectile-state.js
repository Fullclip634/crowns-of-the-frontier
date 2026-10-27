import {UNITS,BUILDINGS} from './data.js';
import {GARRISONS} from './garrison.js';
import {projectileWeapon,siegeProjectile} from './combat-timing.js';
const keys=['id','kind','type','owner','x','z','r','hp','maxHp','heading','cooldown'];
export const projectileActor=entity=>Object.fromEntries(keys.filter(key=>entity[key]!==undefined).map(key=>[key,entity[key]]));
const id=value=>Number.isSafeInteger(value)&&value>0;
const amount=value=>Number.isFinite(value)&&value>=0&&value<=1e6;
const point=(sim,value)=>value&&Number.isFinite(value.x)&&Number.isFinite(value.z)&&Math.abs(value.x)<=sim.halfWorld+16&&Math.abs(value.z)<=sim.halfWorld+16;
function actor(sim,value){
  if(!value||!id(value.id)||!Number.isInteger(value.owner)||!sim.players[value.owner]||!point(sim,value)||!Number.isFinite(value.hp)||value.hp<=0||!Number.isFinite(value.maxHp)||value.maxHp<=0)return null;
  if(!(value.kind==='unit'?UNITS[value.type]:value.kind==='building'?BUILDINGS[value.type]:null))return null;
  if(!Number.isFinite(value.r)||value.r<0||value.r>sim.worldSize||['heading','cooldown'].some(key=>value[key]!==undefined&&!Number.isFinite(value[key])))return null;
  return projectileActor(value);
}

// Corrupt optional projectile records must not turn a playable old kingdom into
// NaN damage, duplicate impacts or an unrenderable flight. Keep only finite,
// coherent records and copy their small, known fields.
export function restoreProjectileState(data,sim){
  const shots=[],seen=new Set();let highest=0;
  for(const input of Array.isArray(data.projectiles)?data.projectiles:[]){
    if(!input||!id(input.id)||seen.has(input.id)||!id(input.source)||!id(input.target)||!Number.isInteger(input.owner)||!sim.players[input.owner])continue;
    if(!Number.isFinite(input.releaseAt)||input.releaseAt<0||input.orderType!==null&&typeof input.orderType!=='string')continue;
    const shot={id:input.id,source:input.source,target:input.target,owner:input.owner,stage:input.stage,releaseAt:input.releaseAt,orderType:input.orderType};
    if(input.stage==='prepare'){
      const source=sim.get(input.source);if(!source||source.owner!==input.owner||!projectileWeapon(source)||input.releaseAt>sim.time+1)continue;
    }else if(input.stage==='flight'){
      const entity=actor(sim,input.entity),victim=actor(sim,input.victim),bonus=input.bonus??[];
      if(!entity||!victim||entity.id!==input.source||victim.id!==input.target||entity.owner!==input.owner||!projectileWeapon(entity)||!point(sim,input.aim)||!amount(input.damage))continue;
      if(!Number.isFinite(input.releasedAt)||input.releasedAt<0||input.releasedAt>sim.time+1e-7||!Number.isFinite(input.duration)||input.duration<.14||input.duration>1.4||!Number.isFinite(input.impactAt)||Math.abs(input.impactAt-input.releasedAt-input.duration)>1e-7)continue;
      const baseBonus=entity.kind==='building'?Math.max(0,(BUILDINGS[entity.type].volley||1)-1):0;
      const maxBonus=baseBonus+(GARRISONS[entity.type]?Math.ceil(GARRISONS[entity.type].capacity/GARRISONS[entity.type].perArrow):0);
      if(!Array.isArray(bonus)||bonus.length>maxBonus||!bonus.every(amount)||input.siege!==siegeProjectile(entity))continue;
      Object.assign(shot,{entity,victim,aim:{x:input.aim.x,z:input.aim.z},damage:input.damage,siege:input.siege,releasedAt:input.releasedAt,duration:input.duration,impactAt:input.impactAt,bonus:[...bonus]});
    }else continue;
    seen.add(shot.id);highest=Math.max(highest,shot.id);shots.push(shot);
  }
  return {projectiles:shots,nextProjectileId:Number.isSafeInteger(data.nextProjectileId)&&data.nextProjectileId>=highest?data.nextProjectileId:highest};
}

export function nextProjectileId(sim){
  let next=(sim.nextProjectileId||0)+1;
  if(!Number.isSafeInteger(next)||sim.projectileIdsRecycled){const used=new Set((sim.projectiles||[]).map(shot=>shot.id));if(!Number.isSafeInteger(next))next=1;while(used.has(next)){next++;if(!Number.isSafeInteger(next))next=1;}sim.projectileIdsRecycled=true;}
  return sim.nextProjectileId=next;
}
