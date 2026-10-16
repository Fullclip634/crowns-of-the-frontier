import {BUILDINGS,UNITS} from './data.js';
import {formationSlot} from './tactics.js';

export const GARRISONS={towncenter:{capacity:15,perArrow:3,damage:5},keep:{capacity:15,perArrow:3,damage:7},tower:{capacity:8,perArrow:3,damage:5}};
const distance=(a,b)=>Math.hypot(a.x-b.x,a.z-b.z);
const clone=value=>JSON.parse(JSON.stringify(value));
const eligible=(unit,owner)=>unit?.hp>0&&unit.owner===owner&&unit.type==='villager'&&!unit.embarked;
export const garrisonCount=(sim,site)=>(site.garrison||[]).filter(id=>{const u=sim.get(id);return u?.hp>0&&u.embarked&&u.shelter===site.id;}).length;
export const garrisonArrows=(sim,site)=>GARRISONS[site.type]?Math.ceil(garrisonCount(sim,site)/GARRISONS[site.type].perArrow):0;

export function installGarrison(Simulation){
  const p=Simulation.prototype,restore=Simulation.restore,base={tickUnit:p.tickUnit,assignWorker:p.assignWorker,hit:p.hit,hurt:p.hurt,command:p.command,tick:p.tick,serialize:p.serialize,demolish:p.demolish};
  p.seekShelter=function(ids,siteId=null,owner=0){
    const sites=this.owned(owner,'building').filter(b=>b.progress>=1&&GARRISONS[b.type]&&(siteId===null||b.id===siteId));let count=0;
    for(const id of [...new Set(ids)]){
      const unit=this.get(id);if(!eligible(unit,owner))continue;
      if(unit.order?.type==='garrison'&&(siteId===null||unit.order.target===siteId)){count++;continue;}
      const site=sites.filter(b=>garrisonCount(this,b)+this.owned(owner,'unit').filter(u=>!u.embarked&&u.id!==id&&u.order?.type==='garrison'&&u.order.target===b.id).length<GARRISONS[b.type].capacity).sort((a,b)=>distance(a,unit)-distance(b,unit)||a.id-b.id)[0];
      if(!site||distance(unit,site)>50)continue;
      const route=this.pathTo(unit,site,site.r+2);if(unit.pathStatus==='blocked'||route.length&&distance(route.at(-1),site)>site.r+3)continue;
      if(unit.order?.type!=='garrison')unit.shelterWork={order:unit.order?clone(unit.order):null,orders:clone(unit.orders||[]),stance:unit.stance};
      base.command.call(this,[unit.id],{type:'garrison',target:site.id});count++;
    }return count;
  };
  p.townBell=function(id,owner=0){
    const site=this.get(id);if(!site||site.owner!==owner||site.progress<1||!GARRISONS[site.type])return false;
    const ids=this.owned(owner,'unit','villager').filter(u=>eligible(u,owner)&&distance(u,site)<36).sort((a,b)=>distance(a,site)-distance(b,site)||a.id-b.id).map(u=>u.id);
    const sent=this.seekShelter(ids,id,owner);if(sent)this.emit('town-bell',{entity:site,count:sent});return sent;
  };
  p.returnToWork=function(id,owner=0){
    const site=this.get(id);if(!site||site.owner!==owner||!GARRISONS[site.type])return false;
    return release(this,site,false,true);
  };
  p.assignWorker=function(unit){if(unit.embarked)return;return base.assignWorker.call(this,unit);};
  p.command=function(ids,order,append=false){
    if(order.type==='attack'&&this.get(order.target)?.embarked)return false;
    // A later player order cancels a pending shelter reservation. Occupants use
    // Return to work rather than silently moving while still hidden inside.
    const available=ids.filter(id=>{const u=this.get(id);if(u?.shelter)return false;if(u?.order?.type==='garrison'&&order.type!=='garrison')delete u.shelterWork;return true;});
    return base.command.call(this,available,order,append);
  };
  p.tickUnit=function(unit,dt){
    if(unit.order?.type==='attack'&&this.get(unit.order.target)?.embarked)this.finishOrder(unit);
    if(unit.order?.type==='garrison'&&!unit.embarked){
      const site=this.get(unit.order.target);
      if(!site||site.owner!==unit.owner||site.progress<1||!GARRISONS[site.type]||garrisonCount(this,site)>=GARRISONS[site.type].capacity){restoreWork(this,unit);return;}
      if(distance(unit,site)>site.r+2.6){this.move(unit,site,dt,site.r+2.2);return;}
      site.garrison??=[];if(!site.garrison.includes(unit.id))site.garrison.push(unit.id);
      unit.shelter=site.id;unit.embarked=true;unit.transport=site.id;unit.x=site.x;unit.z=site.z;unit.order=null;unit.orders=[];unit.path=[];unit.aiFleeing=0;unit.moving=false;this.sightCache=null;this.emit('garrison',{entity:unit,target:site});return;
    }
    return base.tickUnit.call(this,unit,dt);
  };
  p.hit=function(entity,target){
    if(target.embarked||entity.embarked)return;
    const fire=entity.kind==='building'&&GARRISONS[entity.type]&&entity.cooldown<=0&&this.hostile(entity.owner,target.owner),arrows=fire?garrisonArrows(this,entity):0;
    base.hit.call(this,entity,target);
    for(let i=0;i<arrows&&target.hp>0;i++){
      const defense=target.kind==='unit'?this.unitArmor(target):5,bonus=GARRISONS[entity.type].damage*(1+(this.players[entity.owner].tech.fortification||0)*.15),amount=Math.max(1,bonus-defense);
      this.hurt(target,amount,entity);this.emit('attack',{entity,target,damage:amount,garrisonArrow:i+1});
    }
  };
  p.hurt=function(target,amount,attacker){
    if(target.embarked&&attacker&&this.get(target.transport))return;
    const alive=target.hp>0;base.hurt.call(this,target,amount,attacker);
    if(alive&&target.hp<=0&&target.kind==='building'&&GARRISONS[target.type])release(this,target,true,false);
    if(alive&&target.hp<=0&&target.shelter){const site=this.get(target.shelter);if(site?.garrison)site.garrison=site.garrison.filter(id=>id!==target.id);}
  };
  p.demolish=function(id,owner=0){const site=this.get(id),result=base.demolish.call(this,id,owner);if(result&&GARRISONS[site?.type])release(this,site,true,true,true);return result;};
  p.tick=function(dt){
    base.tick.call(this,dt);if(this.ended)return;
    this.shelterClock=(this.shelterClock||0)+dt;if(this.shelterClock<2)return;this.shelterClock=0;
    for(let owner=0;owner<this.players.length;owner++){
      if(this.players[owner].controller==='human'||owner===0&&this.players[0].controller!=='ai')continue;
      const hostiles=this.entities.filter(e=>e.hp>0&&e.kind==='unit'&&!e.embarked&&this.hostile(owner,e.owner)&&UNITS[e.type]?.damage>0),villagers=this.owned(owner,'unit','villager');
      for(const site of this.owned(owner,'building').filter(b=>b.progress>=1&&GARRISONS[b.type])){
        const danger=hostiles.filter(e=>distance(e,site)<BUILDINGS[site.type].range+9&&this.canSee(owner,e));
        if(danger.length){site.shelterSafeSince=null;const threatened=villagers.filter(u=>eligible(u,owner)&&u.order?.type!=='garrison'&&distance(u,site)<32&&danger.some(enemy=>distance(enemy,u)<(UNITS[enemy.type].range||2)+10));this.seekShelter(threatened.map(u=>u.id),site.id,owner);}
        else if(garrisonCount(this,site)||this.owned(owner,'unit').some(u=>u.order?.type==='garrison'&&u.order.target===site.id)){site.shelterSafeSince??=this.time;if(this.time-site.shelterSafeSince>12)this.returnToWork(site.id,owner);}
      }
    }
  };
  p.serialize=function(){return {...base.serialize.call(this),shelterClock:this.shelterClock||0};};
  Simulation.restore=function(data){const sim=restore.call(this,data);sim.shelterClock=data.shelterClock||0;return sim;};
}

function restoreWork(sim,unit){
  const work=unit.shelterWork;delete unit.shelterWork;delete unit.aiFleeing;
  unit.order=work?.order||null;unit.orders=work?.orders||[];unit.stance=work?.stance||'aggressive';unit.path=[];unit.repath=0;
  if(unit.order?.target&&!sim.get(unit.order.target)){unit.order=null;unit.orders=[];}
  if(!unit.order)sim.assignWorker(unit);
}

function release(sim,site,destroyed,resume,demolished=false){
  const pending=sim.owned(site.owner,'unit','villager').filter(u=>u.order?.type==='garrison'&&u.order.target===site.id);for(const unit of pending)restoreWork(sim,unit);
  const reserved=[],remaining=[];let count=pending.length;
  for(const id of site.garrison||[]){
    const unit=sim.get(id);if(!unit||unit.shelter!==site.id)continue;
    let point=null;
    for(let ring=0;ring<4&&!point;ring++)for(let i=0;i<24;i++){
      const angle=i*Math.PI/12,r=destroyed?2+ring*2:site.r+2+ring*2,candidate={x:site.x+Math.cos(angle)*r,z:site.z+Math.sin(angle)*r};
      if(Math.abs(candidate.x)>sim.halfWorld-2||Math.abs(candidate.z)>sim.halfWorld-2||sim.isWater(candidate.x,candidate.z)||reserved.some(p=>distance(p,candidate)<1.35))continue;
      const cell=sim.cell(candidate.x,candidate.z);if(sim.grid(unit.owner)[cell.z*sim.gridSize+cell.x])continue;
      point=formationSlot(sim,unit,candidate,reserved);if(distance(point,candidate)>2)point=null;else break;
    }
    if(!point){if(destroyed)sim.hurt(unit,unit.hp,null);else remaining.push(id);continue;}
    reserved.push(point);unit.embarked=false;unit.transport=null;delete unit.shelter;unit.x=point.x;unit.z=point.z;unit.renderX=point.x;unit.renderZ=point.z;unit.path=[];unit.repath=0;unit.moving=false;
    if(destroyed&&!demolished){unit.hp=Math.max(1,unit.hp*.65);delete unit.shelterWork;unit.order=null;unit.orders=[];sim.assignWorker(unit);}else if(resume)restoreWork(sim,unit);count++;
  }
  site.garrison=remaining;sim.sightCache=null;if(count)sim.emit('ungarrison',{entity:site,count});return count;
}
