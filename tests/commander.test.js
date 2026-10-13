import test from 'node:test';
import assert from 'node:assert/strict';
import {Simulation,distance} from '../src/simulation.js';
import {DEFAULT_BINDINGS,readBindings,bindingErrors,controlForKey,heldControl} from '../src/controls.js';
import {rememberVisibleEnemies,chooseArmyUnit,AI_PROFILES,coastalArmyOrders} from '../src/commander-ai.js';
import {battlePreset} from '../src/custom-battle.js';
const advance=(s,seconds)=>{for(let i=0;i<seconds*10;i++)s.tick(.1);};

test('remapped controls resolve consistently and invalid saved bindings recover safely',()=>{
  const custom={...DEFAULT_BINDINGS,attackmove:'t',panUp:'z'};
  assert.equal(bindingErrors(custom).length,0);assert.equal(controlForKey('T',custom),'attackmove');assert.equal(controlForKey('f',custom),null);
  assert.ok(heldControl(new Set(['z']),'panUp',custom));assert.equal(controlForKey('ArrowUp',custom),'panUp');
  assert.match(bindingErrors({...custom,guard:'t'}).join(' '),/both use T/);
  assert.deepEqual(readBindings({...custom,guard:'1'}),DEFAULT_BINDINGS);assert.deepEqual(readBindings({attackmove:42}),DEFAULT_BINDINGS);
});
test('patrol returns to its origin, yields to queued orders, and persists through saves',()=>{
  const s=new Simulation({mode:'sandbox',seed:512}),u=s.addUnit('spearman',0,0,20);s.stop(s.owned(0,'unit','villager').map(e=>e.id));
  assert.ok(s.patrol([u.id],12,20));advance(s,5);assert.equal(u.order.type,'patrol');assert.equal(u.order.x,0);
  const loaded=Simulation.restore(JSON.parse(JSON.stringify(s.serialize()))),v=loaded.get(u.id);assert.equal(v.order.originX,12);
  loaded.command([v.id],{type:'move',x:0,z:35},true);advance(loaded,20);assert.equal(v.order,null);assert.ok(distance(v,{x:0,z:35})<2);
});
test('guards follow friendly units, reject enemy targets, and engage nearby attackers',()=>{
  const s=new Simulation({mode:'sandbox'}),ally=s.addUnit('ram',0,0,25),guard=s.addUnit('spearman',0,-6,25),enemy=s.addUnit('scout',1,9,25);
  enemy.stance='hold';assert.equal(s.guard([guard.id],enemy.id),false);assert.ok(s.guard([guard.id],ally.id));
  advance(s,8);assert.ok(enemy.hp<enemy.maxHp);enemy.hp=0;s.command([ally.id],{type:'move',x:0,z:45});advance(s,12);
  assert.ok(distance(guard,ally)<9);assert.equal(guard.order.type,'guard');ally.hp=0;advance(s,1);assert.equal(guard.order,null);
});
test('unreachable land orders report a blocked route instead of succeeding at a partial endpoint',()=>{
  const s=new Simulation({mode:'sandbox',map:'coast'}),u=s.addUnit('spearman',0,-25,60);s.stop(s.owned(0,'unit','villager').map(e=>e.id));
  s.command([u.id],{type:'move',x:30,z:60});advance(s,35);assert.ok(u.x<0);assert.equal(u.pathStatus,'blocked');assert.equal(u.order,null);
  assert.ok(s.events.some(e=>e.type==='order-blocked'&&e.entity.id===u.id));
});
test('a newly opened route resumes movement and formation destinations avoid foundations',()=>{
  const s=new Simulation({mode:'sandbox'}),u=s.addUnit('scout',0,0,25),house=s.addBuilding('house',0,8,25,true);
  s.command([u.id],{type:'move',x:8,z:25});const cell=s.cell(u.order.x,u.order.z);assert.equal(s.grid(0)[cell.z*80+cell.x],0);
  house.hp=0;s.revision++;s.command([u.id],{type:'move',x:8,z:25});advance(s,4);assert.ok(distance(u,{x:8,z:25})<2);
});
test('queued orders remain bounded and holding clears pending commands',()=>{
  const s=new Simulation({mode:'sandbox'}),u=s.addUnit('scout',0,0,20);s.patrol([u.id],10,20);
  for(let i=0;i<45;i++)s.command([u.id],{type:'move',x:i,z:30},true);assert.equal(u.orders.length,32);
  assert.equal(s.setStance([u.id],'hold',1),false);assert.ok(s.setStance([u.id],'hold'));assert.equal(u.order,null);assert.equal(u.orders.length,0);
});

test('AI intelligence uses observed positions, expires troop sightings, and retains remembered buildings',()=>{
  const s=new Simulation(),state={known:{}};assert.equal(rememberVisibleEnemies(s,state).length,0);assert.deepEqual(state.known,{});
  const enemy=s.addUnit('knight',0,33,-20),outpost=s.addBuilding('tower',0,20,-20,true);rememberVisibleEnemies(s,state);
  assert.equal(state.known[enemy.id].x,33);assert.ok(state.known[outpost.id]);
  for(const unit of s.owned(1,'unit')){unit.x=70;unit.z=-70;}for(const b of s.owned(1,'building')){b.x=70;b.z=-70;}
  enemy.x=-70;enemy.z=70;s.time+=20;
  rememberVisibleEnemies(s,state);assert.equal(state.known[enemy.id].x,33,'unseen movement must not update intelligence');
  s.time+=AI_PROFILES.normal.memory+1;rememberVisibleEnemies(s,state);assert.equal(state.known[enemy.id],undefined);assert.ok(state.known[outpost.id]);
});
test('AI counter production is affordable and respects the actual civilization roster and ages',()=>{
  const s=new Simulation(),b=s.owned(1,'building','barracks')[0],state={known:{1:{kind:'unit',type:'knight'}}};
  assert.equal(chooseArmyUnit(s,b,state),'spearman');s.players[1].resources.food=0;assert.equal(chooseArmyUnit(s,b,state),null);
  s.players[1].resources={food:1000,wood:1000,gold:1000,stone:1000};const stable=s.addBuilding('stable',1,60,-10,true);
  assert.equal(chooseArmyUnit(s,stable,state),null);s.players[1].age=2;assert.equal(chooseArmyUnit(s,stable,state),'knight');
});
test('AI does not create unpaid units or buildings and restores planning clocks with its scouting state',()=>{
  const s=new Simulation();s.players[1].resources={food:0,wood:0,gold:0,stone:0};const count=s.entities.length;s.tickAI();assert.equal(s.entities.length,count);
  assert.ok(s.owned(1,'building').every(b=>b.queue.length===0));s.aiClock=1.3;s.fogClock=.2;
  const restored=Simulation.restore(JSON.parse(JSON.stringify(s.serialize())));assert.deepEqual(restored.commanderAI,s.commanderAI);assert.equal(restored.aiClock,1.3);assert.equal(restored.fogClock,.2);
  s.tickAI();restored.tickAI();assert.deepEqual(restored.commanderAI,s.commanderAI);
});

test('AI uses paid market trade to recover from a timber shortage without creating supplies',()=>{
  const sim=new Simulation(),owner=1;sim.players[owner].age=1;sim.players[owner].resources={food:1000,wood:0,gold:1000,stone:300};sim.addBuilding('market',owner,60,-60,true);
  const trade=sim.trade.bind(sim),transactions=[];sim.trade=(resource,buy,side)=>{const before={...sim.players[side].resources},result=trade(resource,buy,side);transactions.push({resource,buy,side,before,after:{...sim.players[side].resources},result});return result;};sim.tickAI();
  assert.equal(transactions.length,1);const transaction=transactions[0];assert.equal(transaction.resource,'wood');assert.equal(transaction.side,owner);assert.equal(transaction.after.gold,transaction.before.gold-130);assert.equal(transaction.after.wood,transaction.before.wood+100);assert.ok(transaction.result);
});

test('AI market recovery has no dead zone between the real trade price and a reserve threshold',()=>{
  for(const gold of [50,200]){const sim=new Simulation();sim.players[1].age=1;sim.players[1].resources={food:2000,wood:0,gold,stone:300};sim.addBuilding('market',1,60,-60,true);const calls=[],trade=sim.trade.bind(sim);sim.trade=(resource,buy,owner)=>{calls.push({resource,buy,owner});return trade(resource,buy,owner);};sim.tickAI();assert.equal(calls.length,1);assert.equal(calls[0].resource,gold>=130?'wood':'food');assert.equal(calls[0].buy,gold>=130);}
});
test('AI repairs its damaged buildings and retreats badly injured troops',()=>{
  const s=new Simulation(),tc=s.owned(1,'building','towncenter')[0],soldier=s.owned(1,'unit','spearman')[0];tc.hp=tc.maxHp*.5;soldier.x=0;soldier.z=0;soldier.hp=soldier.maxHp*.15;
  s.tickAI();assert.ok(s.owned(1,'unit','villager').some(w=>w.order?.type==='repair'&&w.order.target===tc.id));
  assert.equal(soldier.order.type,'move');assert.ok(distance(soldier.order,tc)<15);
});
test('AI transport departure cancels unboarded reservations instead of making infantry chase it across the sea',()=>{
  const s=new Simulation({mode:'tides'}),tc=s.owned(1,'building','towncenter')[0],ship=s.owned(1,'unit','transport')[0],army=s.owned(1,'unit','spearman');
  ship.loadingSince=s.time-30;ship.passengers=army.slice(0,4).map(e=>e.id);for(const e of army.slice(0,4)){e.embarked=true;e.transport=ship.id;}
  const waiting=army[4];s.command([waiting.id],{type:'board',target:ship.id});s.commanderNavy({},[],[],army,tc);
  assert.equal(waiting.order.type,'move');assert.ok(waiting.order.x>0);assert.equal(ship.order.type,'move');assert.ok(ship.order.x<0);
});

test('custom naval transports release waiting troops when departing for an opposing shore',()=>{
  const sim=new Simulation({mode:'custom',map:'coast',slots:battlePreset('2v2'),seed:512}),owner=2,tc=sim.owned(owner,'building','towncenter')[0],ship=sim.owned(owner,'unit','transport')[0],army=sim.owned(owner,'unit','spearman');
  ship.passengers=army.slice(0,4).map(unit=>unit.id);for(const unit of army.slice(0,4)){unit.embarked=true;unit.transport=ship.id;}const waiting=army[4]||sim.addUnit('spearman',owner,tc.x,tc.z);if(!army.includes(waiting))army.push(waiting);sim.command([waiting.id],{type:'board',target:ship.id});
  sim.commanderNavy({},[],[],army,tc,owner);assert.equal(waiting.order.type,'move');assert.equal(Math.sign(waiting.order.x),Math.sign(tc.x));assert.equal(Math.sign(ship.order.x),-Math.sign(tc.x));assert.ok(ship.landing);
});

test('custom naval AI pays to rebuild a destroyed harbor and assigns a builder',()=>{
  const sim=new Simulation({mode:'custom',map:'coast',slots:battlePreset('2v2'),seed:512}),owner=2,dock=sim.owned(owner,'building','dock')[0],before=sim.players[owner].resources.wood;
  sim.hurt(dock,dock.hp+1,sim.owned(0,'unit','galley')[0]);sim.tickCustomAI(4);const replacement=sim.owned(owner,'building','dock')[0];assert.ok(replacement);assert.ok(replacement.progress<1);assert.ok(sim.players[owner].resources.wood<before);assert.ok(sim.owned(owner,'unit','villager').some(unit=>unit.order?.type==='build'&&unit.order.target===replacement.id));
});

test('custom transports retry canceled voyages and unload beside an occupied enemy harbor',()=>{
  const sim=new Simulation({mode:'custom',map:'coast',slots:battlePreset('2v2'),seed:512}),owner=2,tc=sim.owned(owner,'building','towncenter')[0],ship=sim.owned(owner,'unit','transport')[0],army=sim.owned(owner,'unit','spearman');ship.passengers=army.slice(0,4).map(unit=>unit.id);for(const unit of army.slice(0,4)){unit.embarked=true;unit.transport=ship.id;}
  ship.landing={...sim.players[0].start,sign:-1};ship.x=3;ship.z=ship.landing.z;ship.order=null;sim.commanderNavy({},[],[],army,tc,owner);assert.equal(ship.order.type,'move');assert.ok(ship.order.x<0);
  ship.x=Math.sin(ship.landing.z*.03)*2-12;ship.z=ship.landing.z;sim.commanderNavy({},[],[],army,tc,owner);assert.equal(ship.passengers.length,0);assert.equal(ship.landing,null);
  for(const unit of army.slice(0,4)){assert.equal(unit.embarked,false);assert.equal(sim.isWater(unit.x,unit.z),false);const cell=sim.cell(unit.x,unit.z);assert.equal(sim.grid(owner)[cell.z*sim.gridSize+cell.x],0);assert.equal(unit.order.type,'attackmove');}
});

test('a partially loaded custom transport departs after its boarding deadline',()=>{
  const sim=new Simulation({mode:'custom',map:'coast',slots:battlePreset('2v2'),seed:512}),owner=2,tc=sim.owned(owner,'building','towncenter')[0],ship=sim.owned(owner,'unit','transport')[0],army=sim.owned(owner,'unit','spearman');ship.passengers=army.slice(0,2).map(unit=>unit.id);for(const unit of army.slice(0,2)){unit.embarked=true;unit.transport=ship.id;}const waiting=army[2];sim.command([waiting.id],{type:'board',target:ship.id});ship.loadingSince=-100;
  sim.commanderNavy({},[],[],army,tc,owner);assert.ok(ship.landing);assert.equal(ship.order.type,'move');assert.equal(waiting.order.type,'move');assert.equal(ship.passengers.length,2);
});
test('melee patrols do not abandon land routes to chase unreachable ships',()=>{
  const s=new Simulation({mode:'sandbox',map:'coast'}),u=s.addUnit('spearman',0,-20,30),ship=s.addUnit('galley',1,-8,35);
  ship.stance='hold';ship.cooldown=100;s.patrol([u.id],-20,45);advance(s,3);assert.ok(u.z>35);advance(s,7);assert.equal(u.order.type,'patrol');
  assert.ok(!s.events.some(e=>e.type==='order-blocked'&&e.entity.id===u.id));
});
test('valid movement destinations in the same grid cell do not stall near its center',()=>{
  const s=new Simulation({mode:'sandbox',map:'coast'}),ship=s.addUnit('transport',0,11,-22.86);s.command([ship.id],{type:'move',x:10,z:-24});advance(s,3);
  assert.equal(ship.order,null);assert.ok(distance(ship,{x:10,z:-24})<1.5);assert.notEqual(ship.pathStatus,'blocked');
});
test('landed naval invasion troops regroup and retreat on their current shore',()=>{
  const s=new Simulation({mode:'tides',difficulty:'hard'}),landed=s.addUnit('spearman',1,-24,30);s.tickAI();
  assert.ok(!landed.order||landed.order.x<0,'a forward army must not receive a home-island move order');
  landed.hp=landed.maxHp*.1;s.tickAI();assert.equal(landed.order.type,'move');assert.ok(landed.order.x<0);
});

test('custom coastal armies pursue capitals on their own shore before replacement harbors',()=>{
  const sim=new Simulation({mode:'custom',map:'coast',slots:battlePreset('2v2'),seed:512}),owner=2,tc=sim.owned(owner,'building','towncenter')[0],enemy=sim.players[0].start;
  const landed=sim.addUnit('spearman',owner,-26,enemy.z),home=sim.addUnit('spearman',owner,tc.x,tc.z),orders=[];sim.command=(ids,order)=>orders.push({ids,order});
  const dock={kind:'building',type:'dock',x:-20,z:enemy.z},capital={kind:'building',type:'towncenter',...enemy};
  coastalArmyOrders(sim,owner,[landed,home],[],[dock,capital],'attack',tc,{scoutedSpawns:{0:true}});
  const invasion=orders.find(item=>item.ids.includes(landed.id));assert.equal(invasion.order.x,enemy.x);assert.equal(invasion.order.z,enemy.z);
  assert.ok(orders.filter(item=>item.ids.includes(home.id)).every(item=>item.order.x>0),'home troops cannot receive cross-sea land orders');
});

test('coastal armies scout unseen capitals and search beyond a cleared starting location',()=>{
  const sim=new Simulation({mode:'custom',map:'coast',slots:battlePreset('2v2'),seed:512}),owner=2,tc=sim.owned(owner,'building','towncenter')[0],enemy=sim.players[0].start,landed=sim.addUnit('spearman',owner,-26,enemy.z),orders=[];sim.command=(ids,order)=>orders.push(order);
  coastalArmyOrders(sim,owner,[landed],[],[{kind:'building',type:'dock',x:-20,z:enemy.z}],'attack',tc,{});assert.equal(orders[0].x,enemy.x);
  sim.time=400;orders.length=0;coastalArmyOrders(sim,owner,[landed],[],[],'attack',tc,{scoutedSpawns:{0:true,1:true}});assert.ok(orders[0].x<0);assert.ok(distance(orders[0],enemy)>10);assert.equal(sim.isWater(orders[0].x,orders[0].z),false);
});

test('AI records a capital scouting visit only after its location is visible',()=>{
  const sim=new Simulation({mode:'custom',map:'coast',slots:battlePreset('2v2'),seed:512}),owner=2,state={known:{}};rememberVisibleEnemies(sim,state,owner);assert.equal(state.scoutedSpawns[0],undefined);
  const point=sim.players[0].start;sim.addUnit('scout',owner,point.x+4,point.z+4);sim.revision++;rememberVisibleEnemies(sim,state,owner);assert.equal(state.scoutedSpawns[0],true);
  const saved=Simulation.restore(JSON.parse(JSON.stringify(sim.serialize())));assert.equal(saved.options.map,'coast');
});

test('coastal AI replaces lost transports before fishing boats and reserves population for the fleet',()=>{
  const sim=new Simulation({mode:'custom',map:'coast',slots:battlePreset('2v2'),seed:512}),owner=2,tc=sim.owned(owner,'building','towncenter')[0],dock=sim.owned(owner,'building','dock')[0];for(const unit of sim.owned(owner,'unit').filter(e=>['transport','fishingboat'].includes(e.type)))sim.hurt(unit,unit.hp+1,null);
  const before=sim.players[owner].resources.wood;sim.commanderNavy({},[],[],sim.owned(owner,'unit','spearman'),tc,owner);assert.equal(dock.queue[0]?.type,'transport');assert.equal(sim.players[owner].resources.wood,before-140);
  for(let i=sim.population(owner);i<sim.capacity(owner)-3;i++)sim.addUnit('spearman',owner,tc.x,tc.z);const trains=[],train=sim.train.bind(sim);sim.train=(id,type)=>{if(sim.get(id)?.owner===owner)trains.push(type);return train(id,type);};sim.tickCustomAI(4);assert.ok(!trains.some(type=>['spearman','archer'].includes(type)),'land queues must leave room for rebuilding the fleet');
});

test('custom invasions choose a flanking shore when the observed enemy harbor guards the direct landing',()=>{
  const sim=new Simulation({mode:'custom',map:'coast',slots:battlePreset('2v2'),seed:512}),owner=2,tc=sim.owned(owner,'building','towncenter')[0],ship=sim.owned(owner,'unit','transport')[0],army=sim.owned(owner,'unit','spearman'),enemy=sim.players.filter((p,i)=>sim.hostile(owner,i)).map(p=>p.start).sort((a,b)=>distance(a,tc)-distance(b,tc))[0];ship.passengers=army.map(e=>e.id);for(const unit of army){unit.embarked=true;unit.transport=ship.id;}
  sim.commanderNavy({},[],[{type:'dock',x:-20,z:enemy.z}],army,tc,owner);assert.ok(Math.abs(ship.landing.shoreZ-enemy.z)>35.99);assert.equal(ship.landing.z,enemy.z);assert.equal(ship.order.z,ship.landing.shoreZ);
});
