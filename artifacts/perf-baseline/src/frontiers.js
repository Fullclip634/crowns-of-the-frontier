import {UNITS,BUILDINGS,DIFFICULTIES,TECHS} from './data.js';
import {formationSlot} from './tactics.js';
const distance=(a,b)=>Math.hypot(a.x-b.x,a.z-b.z);

export function installFrontiers(Simulation){
  const p=Simulation.prototype,original={};
  for(const method of ['initialize','grid','buildValid','tickUnit','tickBuilding','hurt','smartCommand','assignWorker','tickAI','serialize','addUnit','addBuilding','addResource','addShrine'])original[method]=p[method];
  for(const method of ['addUnit','addBuilding','addResource','addShrine'])p[method]=function(...args){const entity=original[method].apply(this,args);this.index?.set(entity.id,entity);if(['unit','building'].includes(entity.kind))this.sightCache=null;if(entity.kind==='unit'&&UNITS[entity.type].naval)entity.r=entity.type==='warship'?2:1.6;return entity;};
  p.get=function(id){if(!this.index)this.index=new Map(this.entities.map(e=>[e.id,e]));const e=this.index.get(id);return e?.hp>0?e:null;};
  const restore=Simulation.restore;
  Simulation.restore=function(data){const sim=restore.call(this,data);sim.index=new Map(sim.entities.map(e=>[e.id,e]));sim.sightCache=null;for(const player of sim.players)for(const key of Object.keys(TECHS))player.tech[key]??=0;sim.intel=data.intel||{};return sim;};
  p.initialize=function(){this.intel={};if(this.options.mode==='tides')this.options.map='coast';original.initialize.call(this);
    this.players.forEach(player=>{player.tech.seamanship??=0;});
    if(this.options.map==='coast'){
      this.players.forEach(player=>{player.age=Math.max(1,player.age);player.resources.wood+=350;player.resources.gold+=180;});
      for(const owner of [0,1]){
        if(owner===1&&(['sandbox','tutorial','survival'].includes(this.options.mode)||this.mission?.survival))continue;
        const sign=owner===0?-1:1;this.addBuilding('dock',owner,sign*19,owner===0?25:-25,true);
        const boat=this.addUnit('fishingboat',owner,sign*10,owner===0?24:-24);
        this.addUnit('galley',owner,sign*9,owner===0?14:-14);this.addUnit('transport',owner,sign*10,owner===0?34:-34);
        boat.order={type:'gather',target:null};
      }
      for(let i=0;i<12;i++){const fish=this.addResource('food',(this.rng()-.5)*17,-66+i*12,2200);fish.water=true;fish.r=2.1;}
      for(const e of this.entities.filter(e=>e.kind==='unit'||e.kind==='building')){e.maxHp=this.maxHP(e);e.hp=e.maxHp;}
      for(const boat of this.entities.filter(e=>e.type==='fishingboat'))this.assignWorker(boat);
      this.updateFog();
    }
  };
  const water=p.isWater;
  p.isWater=function(x,z){return this.options.map==='coast'?Math.abs(x-Math.sin(z*.03)*2)<14:water.call(this,x,z);};
  p.grid=function(owner,naval=false){if(!naval)return original.grid.call(this,owner);const key='sea'+owner;if(this.grids[key]?.revision===this.revision)return this.grids[key].data;
    const size=this.gridSize,half=this.halfWorld,data=new Uint8Array(size*size);for(let z=0;z<size;z++)for(let x=0;x<size;x++)data[z*size+x]=this.isWater(x*2-half+1,z*2-half+1)?0:1;this.grids[key]={revision:this.revision,data};return data;
  };
  p.buildValid=function(type,x,z,owner=0){if(type!=='dock')return original.buildValid.call(this,type,x,z,owner);
    if(Math.abs(x)>this.halfWorld-6||Math.abs(z)>this.halfWorld-6||this.isWater(x,z)||owner===0&&!this.isVisible(x,z))return false;
    let shore=false;for(let i=0;i<16;i++)if(this.isWater(x+Math.cos(i*Math.PI/8)*7,z+Math.sin(i*Math.PI/8)*7))shore=true;
    return shore&&!this.entities.some(e=>e.hp>0&&(e.kind==='building'||e.kind==='resource'&&!e.water&&['wood','gold','stone'].includes(e.type))&&distance(e,{x,z})<e.r+BUILDINGS.dock.r+.8);
  };
  p.spawnPoint=function(building,naval=false){const grid=this.grid(building.owner,naval);let best=null,score=Infinity;
    for(let x=-14;x<=14;x+=2)for(let z=-14;z<=14;z+=2){const point={x:building.x+x,z:building.z+z},cell=this.cell(point.x,point.z),n=Math.hypot(x,z);if(n>=building.r+1&&Math.abs(point.x)<=this.halfWorld-3&&Math.abs(point.z)<=this.halfWorld-3&&!grid[cell.z*this.gridSize+cell.x]&&n<score){best=point;score=n;}}return best;
  };
  p.tickBuilding=function(e,dt){const before=this.nextId;original.tickBuilding.call(this,e,dt);for(let id=before;id<this.nextId;id++){const unit=this.get(id);if(unit?.kind!=='unit')continue;if(unit.owner>0)this.emit('stat-trained',{entity:unit});const spawn=this.spawnPoint(e,!!UNITS[unit.type].naval);if(spawn){unit.x=spawn.x;unit.z=spawn.z;unit.path=[];}
      if(unit.type==='fishingboat')this.assignWorker(unit);
    }
  };
  p.assignWorker=function(e){if(e.type==='fishingboat'){const fish=this.nearest(e,t=>t.kind==='resource'&&t.water&&t.amount>0);if(fish){e.gatherType='food';e.order={type:'gather',target:fish.id};e.path=[];}return;}original.assignWorker.call(this,e);};
  p.smartCommand=function(ids,target,x,z,append=false,attackMove=false,owner=0){
    if(!Number.isFinite(x)||!Number.isFinite(z)||Math.abs(x)>this.halfWorld||Math.abs(z)>this.halfWorld)return false;
    const units=ids.map(id=>this.get(id)).filter(e=>e?.owner===owner&&e.kind==='unit');if(this.allied(owner,target?.owner)&&target.kind==='unit'&&UNITS[target.type].naval&&target.type!=='transport'&&units.every(e=>e.type==='villager')){this.command(units.map(e=>e.id),{type:'repair',target:target.id},append);return;}
    if(target?.type==='transport'&&this.allied(owner,target.owner)){for(const e of units)if(!UNITS[e.type].naval)this.command([e.id],{type:'board',target:target.id},append);return;}
    const fishers=units.filter(e=>e.type==='fishingboat');if(target?.water){for(const e of fishers)this.command([e.id],{type:'gather',target:target.id},append);if(!fishers.length)this.fail('Only fishing boats can harvest fish shoals.',owner);return;}
    const legal=ids.filter(id=>{const e=this.get(id);return e?.kind!=='unit'||!!UNITS[e.type].naval===this.isWater(x,z)||target?.kind==='building'||this.hostile(owner,target?.owner);});
    if(legal.length<ids.length)this.fail('Ships sail on water. Land troops need a transport to cross the sea.',owner);
    original.smartCommand.call(this,legal,target,x,z,append,attackMove,owner);
  };
  p.unload=function(id,x,z,owner=0){const ship=this.get(id);if(!ship||ship.owner!==owner||ship.type!=='transport')return false;
    if(this.isWater(x,z)||distance(ship,{x,z})>11)return this.fail('Choose a shore within 11 meters of the transport.',owner);
    const cell=this.cell(x,z);if(this.grid(owner)[cell.z*this.gridSize+cell.x])return this.fail('Choose open land to disembark.',owner);
    const passengers=ship.passengers||[];passengers.forEach((pid,i)=>{const e=this.get(pid);if(!e)return;const point=formationSlot(this,e,{x:x+(i%3-1)*1.3,z:z+Math.floor(i/3)*1.3});e.embarked=false;e.transport=null;e.x=point.x;e.z=point.z;if(this.isWater(e.x,e.z)){e.x=x;e.z=z;}e.order=null;e.orders=[];e.path=[];});ship.passengers=[];this.emit('unload',{entity:ship});return true;
  };
  p.tickUnit=function(e,dt){
    if(e.embarked){const ship=this.get(e.transport);if(!ship){e.hp=0;return;}e.x=ship.x;e.z=ship.z;return;}
    if(e.order?.type==='board'){
      const ship=this.get(e.order.target);if(!ship||!this.allied(ship.owner,e.owner)||ship.type!=='transport'){this.finishOrder(e);return;}
      if((ship.passengers||[]).length>=8){this.finishOrder(e);return;}
      if(distance(e,ship)>6){this.move(e,ship,dt,5);return;}
      ship.passengers??=[];ship.passengers.push(e.id);e.embarked=true;e.transport=ship.id;e.order=null;e.path=[];this.emit('board',{entity:e,target:ship});return;
    }
    if(e.type==='fishingboat'){
      e.moving=false;e.cooldown=Math.max(0,e.cooldown-dt);const order=e.order;if(!order){if(e.stance!=='hold')this.assignWorker(e);return;}
      if(order.type!=='gather')return original.tickUnit.call(this,e,dt);
      const target=this.get(order.target);if(!target&&e.carry>0)order.returning=true;else if(!target){this.assignWorker(e);return;}
      if(e.carry>=75||order.returning){order.returning=true;const dock=this.nearestDrop(e,'food',true);if(!dock)return;if(distance(e,dock)>dock.r+5.5){this.move(e,dock,dt,dock.r+5);return;}
        this.players[e.owner].resources.food+=e.carry;this.emit('gathered',{owner:e.owner,amount:e.carry,resource:'food',source:'fishingboat'});if(e.owner===0)this.stats.gathered+=e.carry;e.carry=0;e.carryType=null;order.returning=false;e.path=[];return;}
      if(distance(e,target)>target.r+2){this.move(e,target,dt,target.r+1.5);return;}
      const n=Math.min(75-e.carry,target.amount,dt*4*(1+this.players[e.owner].tech.economy*.25));e.carry+=n;e.carryType='food';target.amount-=n;if(target.amount<=0){target.hp=0;order.returning=true;}return;
    }
    const site=e.order?.type==='build'?this.get(e.order.target):null,progress=site?.progress;
    original.tickUnit.call(this,e,dt);
    if(e.owner>0&&site&&progress<1&&site.progress>=1)this.emit('stat-complete',{entity:site});
    if(this.options.mode!=='custom'&&e.type==='transport'&&e.owner===1&&(e.passengers||[]).length){const shore={x:-18,z:30};if(distance(e,shore)<11&&this.unload(e.id,shore.x,shore.z,1))e.order={type:'move',x:10,z:-24};}
  };
  p.hurt=function(e,amount,attacker){const hp=e.hp;if(attacker?.owner>=0)e.lastAttacker=attacker.owner;original.hurt.call(this,e,amount,attacker);if(hp>0&&e.hp<=0&&e.kind==='unit'){this.revision--;for(const id of e.passengers||[]){const passenger=this.get(id);if(passenger)this.hurt(passenger,passenger.hp,attacker);}}};
  p.canSee=function(owner,entity){
    if(this.options.mode==='custom'&&entity.kind==='building'&&this.revealedOwners?.includes(entity.owner))return true;
    const shared=this.options.mode==='custom'&&this.options.shareVision,key=shared?'team:'+this.players[owner].team:'owner:'+owner;
    if(this.sightCache?.time!==this.time||this.sightCache?.revision!==this.revision)this.sightCache={time:this.time,revision:this.revision,teams:new Map()};
    let sight=this.sightCache.teams.get(key);if(!sight){sight={buckets:new Map(),range:0};for(const e of this.entities)if(e.hp>0&&!e.embarked&&(e.owner===owner||shared&&this.allied(owner,e.owner))&&(e.kind==='unit'||e.kind==='building'&&e.progress>0)){
      const cell=Math.floor(e.x/16)+':'+Math.floor(e.z/16);if(!sight.buckets.has(cell))sight.buckets.set(cell,[]);sight.buckets.get(cell).push(e);sight.range=Math.max(sight.range,e.kind==='unit'?UNITS[e.type].vision:BUILDINGS[e.type].vision||18);
    }this.sightCache.teams.set(key,sight);}
    const range=sight.range+(entity.r||0)+2;
    for(let x=Math.floor((entity.x-range)/16);x<=Math.floor((entity.x+range)/16);x++)for(let z=Math.floor((entity.z-range)/16);z<=Math.floor((entity.z+range)/16);z++)for(const source of sight.buckets.get(x+':'+z)||[])if(source.hp>0&&!source.embarked&&distance(source,entity)<(source.kind==='unit'?UNITS[source.type].vision:BUILDINGS[source.type].vision||18)+(entity.r||0))return true;return false;
  };
  p.tickAI=function(){if(this.options.multiplayer)return;original.tickAI.call(this);if(['sandbox','tutorial','survival'].includes(this.options.mode)||this.mission?.survival)return;
    const player=this.players[1],tc=this.owned(1,'building','towncenter')[0];if(!tc)return;
    const seen=this.owned(0,'unit').filter(e=>this.canSee(1,e));for(const e of seen)this.intel[e.type]=this.time;
    const threat=seen.filter(e=>e.type!=='villager'&&distance(e,tc)<32);
    const army=this.owned(1,'unit').filter(e=>!['villager','fishingboat','king'].includes(e.type)&&!e.embarked);
    if(threat.length){this.command(army.filter(e=>!UNITS[e.type].naval).map(e=>e.id),{type:'attackmove',x:threat[0].x,z:threat[0].z});}
    if(seen.some(e=>UNITS[e.type].role==='cavalry'))for(const b of this.owned(1,'building','barracks'))if(b.progress>=1&&b.queue.length<2)this.train(b.id,'spearman');
    if(seen.some(e=>UNITS[e.type].role==='ranged')&&player.age>=2)for(const b of this.owned(1,'building','stable'))if(b.progress>=1&&b.queue.length<2)this.train(b.id,'knight');
    for(const building of this.owned(1,'building').filter(b=>b.progress>=1&&b.hp<b.maxHp*.55)){
      const worker=this.owned(1,'unit','villager').find(v=>!['repair','build'].includes(v.order?.type));if(worker)this.command([worker.id],{type:'repair',target:building.id});break;
    }
    if(this.options.map==='coast'){
      const dock=this.owned(1,'building','dock').find(b=>b.progress>=1);if(!dock)return;
      if(dock.queue.length<2){const fish=this.owned(1,'unit','fishingboat').length,transports=this.owned(1,'unit','transport').length;this.train(dock.id,fish<3?'fishingboat':!transports?'transport':player.age>=3?'warship':'galley');}
      const ships=army.filter(e=>UNITS[e.type].naval&&UNITS[e.type].damage);
      const target=this.owned(0,'unit').find(e=>UNITS[e.type].naval&&this.canSee(1,e))||this.owned(0,'building','dock')[0];
      if(target&&this.time>50)this.command(ships.map(e=>e.id),{type:'attack',target:target.id});
      for(const ship of this.owned(1,'unit','transport')){ship.passengers??=[];if(ship.passengers.length>=4){ship.order={type:'move',x:-10,z:30};continue;}if(!ship.passengers.length&&ship.x<0){ship.order={type:'move',x:10,z:-24};continue;}const troops=army.filter(e=>!UNITS[e.type].naval&&!e.embarked&&distance(e,tc)<35&&e.order?.type!=='board').slice(0,8-ship.passengers.length);for(const e of troops)this.command([e.id],{type:'board',target:ship.id});}
    }
  };
  p.serialize=function(){return {...original.serialize.call(this),intel:this.intel};};
}
