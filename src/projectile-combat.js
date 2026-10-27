import {UNITS,BUILDINGS} from './data.js';
import {GARRISONS,garrisonArrows} from './garrison.js';
import {projectileWeapon,siegeProjectile,attackInterval,releaseDelay,flightDuration} from './combat-timing.js';
import {projectileActor as actor,restoreProjectileState,nextProjectileId} from './projectile-state.js';
const distance=(a,b)=>Math.hypot(a.x-b.x,a.z-b.z);
const clone=value=>JSON.parse(JSON.stringify(value));
const targetAllowed=(sim,shot,target)=>target?.hp>0&&!target.embarked&&sim.hostile(shot.owner,target.owner);

function release(sim,shot){
  const source=sim.get(shot.source),target=sim.get(shot.target);
  if(!source||source.owner!==shot.owner||source.embarked||!targetAllowed(sim,shot,target)||source.moving||source.order?.type==='move'||source.order?.type==='garrison')return false;
  if((source.order?.type||null)!==shot.orderType)return false;
  if(source.order?.type==='attack'&&source.order.target!==target.id)return false;
  const def=source.kind==='building'?BUILDINGS[source.type]:UNITS[source.type],range=source.kind==='building'?def.range+target.r:Math.max(def.range+(def.role==='ranged'?sim.players[source.owner].tech.ranged:0)+target.r,target.kind==='building'?target.r+3:0);
  if(distance(source,target)>range+.15)return false;
  source.heading=Math.atan2(target.x-source.x,target.z-source.z);
  shot.stage='flight';shot.entity=actor(source);shot.victim=actor(target);shot.aim={x:target.x,z:target.z};
  // Divide the existing building damage across its visible base volley; the
  // faster reload strengthens defenses without multiplying damage per arrow.
  const baseArrows=source.kind==='building'?Math.max(1,def.volley||1):1;
  shot.damage=sim.attackDamage(source,target)/baseArrows;shot.siege=siegeProjectile(source);shot.releasedAt=sim.time;shot.duration=flightDuration(source,distance(source,target));shot.impactAt=sim.time+shot.duration;
  shot.bonus=Array(baseArrows-1).fill(shot.damage);
  if(source.kind==='building'&&GARRISONS[source.type])for(let i=0;i<garrisonArrows(sim,source);i++){
    const armor=target.kind==='unit'?sim.unitArmor(target):5,damage=GARRISONS[source.type].damage*(1+(sim.players[source.owner].tech.fortification||0)*.15);shot.bonus.push(Math.max(1,damage-armor));
  }
  for(let i=0;i<=shot.bonus.length;i++)sim.emit('attack',{entity:{...shot.entity},target:{...shot.victim},damage:i?shot.bonus[i-1]:shot.damage,garrisonArrow:i,projectile:shot.id,pendingImpact:true,flightDuration:shot.duration,releasedAt:shot.releasedAt,aimX:shot.aim.x,aimZ:shot.aim.z});
  return true;
}

function impact(sim,shot){
  const target=sim.get(shot.target),source=shot.entity;let struck=null,damage=0;
  if(!shot.siege){
    if(!targetAllowed(sim,shot,target))return;
    struck=target;const before=target.hp;sim.hurt(target,shot.damage,source);for(const amount of shot.bonus||[])if(target.hp>0)sim.hurt(target,amount,source);damage=before-target.hp;
  }else{
    if(targetAllowed(sim,shot,target)&&distance(target,shot.aim)<=target.r+.8){struck=target;const before=target.hp;sim.hurt(target,shot.damage,source);damage=before-target.hp;}
    for(const nearby of sim.entities)if(nearby.kind==='unit'&&nearby!==struck&&targetAllowed(sim,shot,nearby)&&distance(nearby,shot.aim)<4)sim.hurt(nearby,shot.damage*.6,source);
  }
  const point=shot.siege?shot.aim:struck;
  sim.emit('projectile-impact',{entity:source,target:{...(struck?actor(struck):shot.victim),x:point.x,z:point.z},projectile:shot.id,damage,siege:shot.siege});
}

export function projectileVisualEvents(shots,time){
  return (shots||[]).filter(shot=>shot.stage==='flight'&&shot.impactAt>time).flatMap(shot=>Array.from({length:1+(shot.bonus?.length||0)},(_,i)=>({type:'attack',entity:{...shot.entity},target:{...shot.victim},projectile:shot.id,garrisonArrow:i,pendingImpact:true,flightDuration:shot.duration,releasedAt:shot.releasedAt,flightAge:Math.max(0,time-shot.releasedAt),aimX:shot.aim.x,aimZ:shot.aim.z})));
}

export function installProjectileCombat(Simulation){
  const p=Simulation.prototype,hit=p.hit,stop=p.stop,serialize=p.serialize,restore=Simulation.restore;
  p.stop=function(ids){
    if(this.projectiles?.length){const stopped=new Set(ids);this.projectiles=this.projectiles.filter(shot=>shot.stage!=='prepare'||!stopped.has(shot.source));}
    return stop.call(this,ids);
  };
  p.hit=function(entity,target){
    if(!projectileWeapon(entity))return hit.call(this,entity,target);
    if(entity.hp<=0||entity.cooldown>0||entity.embarked||!targetAllowed(this,{owner:entity.owner},target))return;
    entity.heading=Math.atan2(target.x-entity.x,target.z-entity.z);entity.cooldown=attackInterval(entity);
    const shot={id:nextProjectileId(this),source:entity.id,target:target.id,owner:entity.owner,stage:'prepare',releaseAt:this.time+releaseDelay(entity),orderType:entity.order?.type||null};
    if(releaseDelay(entity)===0&&!release(this,shot))return;
    (this.projectiles??=[]).push(shot);
  };
  p.tickProjectiles=function(){
    if(!this.projectiles?.length)return;const pending=[];
    for(const shot of this.projectiles){
      if(shot.stage==='prepare'&&this.time+1e-8>=shot.releaseAt&&!release(this,shot))continue;
      if(shot.stage==='flight'&&this.time+1e-8>=shot.impactAt)impact(this,shot);else pending.push(shot);
    }
    this.projectiles=pending;
  };
  p.serialize=function({omitProjectiles=false}={}){return {...serialize.call(this),projectiles:omitProjectiles?[]:clone(this.projectiles||[]),nextProjectileId:omitProjectiles?0:this.nextProjectileId||0};};
  Simulation.restore=function(data){const sim=restore.call(this,data);Object.assign(sim,restoreProjectileState(data,sim));if(sim.options.multiplayer)sim.visualProjectiles=clone(Array.isArray(data.visualProjectiles)?data.visualProjectiles:[]);return sim;};
}
