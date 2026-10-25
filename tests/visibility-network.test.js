import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import WebSocket from 'ws';
import {attachRooms} from '../server/rooms.js';
import {battlePreset,visibilityFor} from '../src/custom-battle.js';
import {VisibilityReceiver} from '../src/network-visibility.js';
import {UNITS} from '../src/data.js';

const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function until(predicate){const deadline=Date.now()+5000;while(!predicate()){assert.ok(Date.now()<deadline,'server condition timed out');await pause(20);}}
class Inbox {
  constructor(ws){this.items=[];this.waiters=[];ws.on('message',raw=>{const packet=JSON.parse(raw),index=this.waiters.findIndex(w=>w.type===packet.type);if(index<0)this.items.push(packet);else{const [waiter]=this.waiters.splice(index,1);clearTimeout(waiter.timer);waiter.resolve(packet);}});}
  next(type){const index=this.items.findIndex(packet=>packet.type===type);if(index>=0)return Promise.resolve(this.items.splice(index,1)[0]);return new Promise((resolve,reject)=>{const waiter={type,resolve,timer:setTimeout(()=>reject(new Error(`Missing ${type}`)),7000)};this.waiters.push(waiter);});}
  clear(){this.items=this.items.filter(packet=>packet.type!=='state');}
}
async function fixture(t,shareVision=true){
  const server=http.createServer(),service=attachRooms(server),clients=[];
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  t.after(async()=>{for(const client of clients)client.terminate();service.close();await new Promise(resolve=>server.close(resolve));});
  const connect=async()=>{const ws=new WebSocket(`ws://127.0.0.1:${server.address().port}/socket`),inbox=new Inbox(ws);clients.push(ws);await new Promise(resolve=>ws.once('open',resolve));return {ws,inbox,send:packet=>ws.send(JSON.stringify(packet))};};
  const host=await connect(),slots=battlePreset('4v4');slots[1].controller='human';
  host.send({type:'create',protocol:2,options:{mode:'custom',map:'highlands',mapSize:'huge',seed:512,shareVision,slots}});
  const session=await host.inbox.next('session'),legacy=await connect();
  legacy.send({type:'join',code:session.code,slot:2});const guestSession=await legacy.inbox.next('session');legacy.send({type:'ready',ready:true});
  while(!(await host.inbox.next('lobby')).canStart){}host.send({type:'start'});
  const begin=(await host.inbox.next('begin')).state,oldBegin=(await legacy.inbox.next('begin')).state,room=service.rooms.get(session.code);
  // Isolate transport and fog from economy/combat timing.
  room.sim.tick=()=>{};
  const receiver=new VisibilityReceiver();assert.ok(receiver.read(begin));
  return {room,host,legacy,connect,session,guestSession,receiver,begin,oldBegin};
}
async function applyNext(client,receiver){const state=(await client.inbox.next('state')).state;assert.ok(receiver.read(state),'every accepted snapshot follows the last delivered baseline');return state;}
async function atTime(client,time,receiver=null){let state;do{state=receiver?await applyNext(client,receiver):(await client.inbox.next('state')).state;}while(state.time<time);return state;}

test("shared current vision preserves each commander's separate exploration history",async t=>{
  const {room,host,legacy,receiver}=await fixture(t),unseen=[];
  for(let cell=0;cell<receiver.visible.length&&unseen.length<2;cell++)if(!receiver.explored[cell]&&!room.explored[1][cell])unseen.push(cell);
  assert.equal(unseen.length,2);room.explored[0][unseen[0]]=1;room.explored[1][unseen[1]]=1;room.sim.time++;
  await atTime(host,room.sim.time,receiver);const other=await atTime(legacy,room.sim.time);
  assert.deepEqual(other.visible,[...receiver.visible]);
  assert.equal(receiver.explored[unseen[0]],1);assert.equal(receiver.explored[unseen[1]],0);
  assert.equal(other.explored[unseen[1]],1);assert.equal(other.explored[unseen[0]],0);
});

test("allied commanders with shared vision disabled cannot see one another's scouting",async t=>{
  const {room,host,legacy,receiver}=await fixture(t,false),sim=room.sim,scout=sim.owned(1,'unit','scout')[0],enemy=sim.owned(4,'unit','scout')[0];
  scout.x=0;scout.z=0;enemy.x=2;enemy.z=0;sim.time++;sim.revision++;sim.updateFog();
  const own=await atTime(host,sim.time,receiver),ally=await atTime(legacy,sim.time),cell=sim.cell(0,0),index=cell.z*sim.gridSize+cell.x;
  assert.equal(receiver.visible[index],0);assert.equal(ally.visible[index],1);
  assert.equal(own.entities.some(e=>e.id===enemy.id),false);assert.ok(ally.entities.some(e=>e.id===enemy.id));
});

test('remembered enemy walls keep their last observed connections until the area is scouted again',async t=>{
  const {room,host,receiver}=await fixture(t),sim=room.sim,scout=sim.owned(0,'unit','scout')[0],home={x:scout.x,z:scout.z},wall=sim.addBuilding('wall',4,0,0,true);
  const advance=()=>{sim.time++;sim.revision++;sim.updateFog();return atTime(host,sim.time,receiver);};
  scout.x=0;scout.z=0;let state=await advance();assert.deepEqual(state.entities.find(e=>e.id===wall.id).wallLinks,[]);
  Object.assign(scout,home);state=await advance();const cell=sim.cell(0,0);assert.equal(receiver.visible[cell.z*sim.gridSize+cell.x],0);
  const neighbor=sim.addBuilding('wall',4,2.85,0,true);assert.ok(wall.wallLinks.includes(neighbor.id));state=await advance();
  assert.deepEqual(state.entities.find(e=>e.id===wall.id).wallLinks,[],'hidden construction cannot mutate fog memory');
  assert.equal(state.entities.some(e=>e.id===neighbor.id),false);
  scout.x=0;scout.z=0;state=await advance();assert.ok(state.entities.find(e=>e.id===wall.id).wallLinks.includes(neighbor.id));assert.ok(state.entities.some(e=>e.id===neighbor.id));
});

test('commanders retain different last-seen wall states after scouting together',async t=>{
  const {room,host,legacy,receiver}=await fixture(t,false),sim=room.sim,scout=sim.owned(0,'unit','scout')[0],ally=sim.owned(1,'unit','scout')[0],home={x:scout.x,z:scout.z},wall=sim.addBuilding('wall',4,0,0,true);
  scout.x=ally.x=0;scout.z=ally.z=0;sim.time++;sim.revision++;sim.updateFog();
  let own=await atTime(host,sim.time,receiver),other=await atTime(legacy,sim.time);
  assert.deepEqual(own.entities.find(e=>e.id===wall.id).wallLinks,[]);assert.deepEqual(other.entities.find(e=>e.id===wall.id).wallLinks,[]);
  Object.assign(scout,home);const neighbor=sim.addBuilding('wall',4,2.85,0,true);sim.time++;sim.revision++;sim.updateFog();
  own=await atTime(host,sim.time,receiver);other=await atTime(legacy,sim.time);
  assert.deepEqual(own.entities.find(e=>e.id===wall.id).wallLinks,[],'an ally seeing new construction cannot rewrite this commander\'s fog memory');
  assert.ok(other.entities.find(e=>e.id===wall.id).wallLinks.includes(neighbor.id));
  assert.equal(own.entities.some(e=>e.id===neighbor.id),false);assert.ok(other.entities.some(e=>e.id===neighbor.id));
});

test('negotiated fog updates preserve allied scouting, private enemies and legacy clients on a Huge eight-kingdom map',async t=>{
  const {room,host,legacy,receiver,begin,oldBegin}=await fixture(t),sim=room.sim;
  assert.equal(begin.visible.length,40000);assert.equal(begin.visibilitySequence,0);assert.equal(oldBegin.visibilitySequence,undefined);
  let state=await applyNext(host,receiver);assert.ok(state.visibilityDelta);assert.equal(state.visible,undefined);assert.equal(state.explored,undefined);
  const legacyState=(await legacy.inbox.next('state')).state;
  assert.equal(legacyState.visible.length,40000);assert.equal(legacyState.visibilityDelta,undefined);
  const compactBytes=Buffer.byteLength(JSON.stringify(state)),fullGridBytes=Buffer.byteLength(JSON.stringify({...state,visibilityDelta:undefined,visible:[...receiver.visible],explored:[...receiver.explored]}));
  assert.ok(compactBytes<fullGridBytes*.4,'fog traffic does not scale with all 40,000 cells during normal play');
  t.diagnostic(`Huge eight-kingdom JSON update: delta ${compactBytes} B; same state with full fog grids ${fullGridBytes} B (before WebSocket compression)`);
  const ally=sim.owned(1,'unit','scout')[0],enemy=sim.owned(4,'unit','scout')[0];
  ally.x=0;ally.z=0;enemy.x=2;enemy.z=0;sim.revision++;sim.updateFog();
  do{state=await applyNext(host,receiver);}while(!state.entities.some(entity=>entity.id===enemy.id));
  const explored=room.explored[0].slice(),expected=visibilityFor(sim,0,explored,false);
  assert.deepEqual(receiver.visible,expected);assert.deepEqual(receiver.explored,explored);
  const cell=sim.cell(0,0),index=cell.z*sim.gridSize+cell.x;assert.equal(receiver.visible[index],1);assert.equal(receiver.explored[index],1);
  assert.ok(Object.values(state.players[4].resources).every(value=>value===0));assert.deepEqual(state.teamAlarms,{});
  ally.x=sim.players[1].start.x;ally.z=sim.players[1].start.z;sim.revision++;sim.updateFog();
  do{state=await applyNext(host,receiver);}while(receiver.visible[index]);
  assert.equal(receiver.explored[index],1,'explored territory survives the scout leaving');
  assert.equal(state.entities.some(entity=>entity.id===enemy.id),false,'hidden enemy units leave the snapshot');
  const resource=sim.entities.find(entity=>entity.kind==='resource'&&expected[sim.cell(entity.x,entity.z).z*sim.gridSize+sim.cell(entity.x,entity.z).x]&&!receiver.visible[sim.cell(entity.x,entity.z).z*sim.gridSize+sim.cell(entity.x,entity.z).x]);
  assert.ok(resource);resource.amount-=100;
  state=await applyNext(host,receiver);assert.equal(state.resourceUpdates.some(update=>update.id===resource.id),false,'hidden supplies do not leak through changed-cell updates');
});

test('server-side skipped snapshots retain both fog and resource baselines until a frame is actually sent',async t=>{
  const {room,host,receiver}=await fixture(t),sim=room.sim;
  await applyNext(host,receiver);const player=room.players[0],socket=player.ws;
  Object.defineProperty(socket,'bufferedAmount',{configurable:true,get:()=>1500000});
  const baseline=room.visibility[0],resource=sim.entities.find(e=>e.kind==='resource'&&receiver.visible[sim.cell(e.x,e.z).z*sim.gridSize+sim.cell(e.x,e.z).x]);assert.ok(resource);
  const resourceBaseline=room.resources[0].get(resource.id),scout=sim.owned(0,'unit','scout')[0];scout.x=0;scout.z=0;resource.amount-=71;sim.revision++;sim.updateFog();
  await pause(550);host.inbox.clear();
  assert.equal(room.visibility[0],baseline,'skipped snapshots cannot advance the sequence or visibility baseline');
  assert.equal(room.resources[0].get(resource.id),resourceBaseline,'skipped snapshots cannot consume resource updates');
  delete socket.bufferedAmount;
  const state=await applyNext(host,receiver);assert.equal(state.visibilityDelta.sequence,baseline.sequence+1);
  assert.ok(state.resourceUpdates.some(update=>update.id===resource.id&&update.amount===Math.ceil(resource.amount)));
  assert.deepEqual(receiver.visible,room.visibility[0].visible);assert.deepEqual(receiver.explored,room.visibility[0].explored);
});

test('congested links retain scouting and paid commands without preparing discarded actor states',async t=>{
  const {room,host,receiver}=await fixture(t),sim=room.sim;
  await applyNext(host,receiver);const sockets=room.players.map(player=>player.ws),baseline=room.visibility[0];
  for(const socket of sockets)Object.defineProperty(socket,'bufferedAmount',{configurable:true,get:()=>1500000});
  const scout=sim.owned(0,'unit','scout')[0],home={x:scout.x,z:scout.z},orders=scout.orders;let actorReads=0;
  Object.defineProperty(scout,'orders',{configurable:true,enumerable:true,get(){actorReads++;return orders;}});
  const wall=sim.addBuilding('wall',4,0,0,true);scout.x=0;scout.z=0;sim.revision++;sim.updateFog();
  await until(()=>room.known[0].has(wall.id)&&room.known[1].has(wall.id));
  const town=sim.owned(0,'building','towncenter')[0],food=sim.players[0].resources.food;
  host.send({type:'action',method:'train',args:[town.id,'villager']});await until(()=>town.queue.some(item=>item.type==='villager'));
  assert.equal(sim.players[0].resources.food,food-UNITS.villager.cost.food,'incoming paid orders continue during outgoing congestion');
  Object.assign(scout,home);const neighbor=sim.addBuilding('wall',4,2.85,0,true);sim.revision++;sim.updateFog();
  await pause(350);
  assert.equal(actorReads,0,'held updates must not project full actor records');
  assert.equal(room.visibility[0],baseline,'a held update cannot commit a new wire baseline');
  assert.deepEqual(room.known[0].get(wall.id).wallLinks,[],'later hidden construction cannot change remembered observations');
  for(const socket of sockets)delete socket.bufferedAmount;
  sim.time++;let state=await atTime(host,sim.time,receiver);const cell=sim.cell(0,0),index=cell.z*sim.gridSize+cell.x;
  assert.ok(actorReads>0,'normal delivery still projects current actors');
  assert.equal(receiver.visible[index],0);assert.equal(receiver.explored[index],1,'scouting seen entirely during congestion survives recovery');
  assert.deepEqual(state.entities.find(e=>e.id===wall.id).wallLinks,[]);assert.equal(state.entities.some(e=>e.id===neighbor.id),false);
  assert.ok(state.entities.find(e=>e.id===town.id).queue.some(item=>item.type==='villager'));
  assert.equal(state.players[0].resources.food,food-UNITS.villager.cost.food);
  for(const socket of sockets)Object.defineProperty(socket,'bufferedAmount',{configurable:true,get:()=>1500000});
  scout.x=0;scout.z=0;sim.entities=sim.entities.filter(e=>e.id!==wall.id&&e.id!==neighbor.id);sim.revision++;sim.updateFog();
  await until(()=>!room.known[0].has(wall.id));
  for(const socket of sockets)delete socket.bufferedAmount;
  sim.time++;state=await atTime(host,sim.time,receiver);assert.equal(state.entities.some(e=>e.id===wall.id),false,'observed empty ground clears obsolete fog memory while updates are held');
});

test('resync recovers missed resource updates and reconnect negotiates a fresh baseline in either direction',async t=>{
  const {room,host,legacy,receiver,connect,session,guestSession}=await fixture(t),sim=room.sim;
  await applyNext(host,receiver);
  const resource=sim.entities.find(e=>e.kind==='resource'&&receiver.visible[sim.cell(e.x,e.z).z*sim.gridSize+sim.cell(e.x,e.z).x]);assert.ok(resource);resource.amount-=63;
  let dropped;do{dropped=(await host.inbox.next('state')).state;}while(!dropped.resourceUpdates.some(update=>update.id===resource.id));
  assert.equal(receiver.read((await host.inbox.next('state')).state),null,'a client that missed a state rejects the next delta');
  host.send({type:'visibility-resync'});
  let full;do{full=(await host.inbox.next('state')).state;}while(!full.visible);
  assert.ok(receiver.read(full));assert.equal(full.visibilitySequence,0);
  assert.ok(full.resourceUpdates.some(update=>update.id===resource.id&&update.amount===Math.ceil(resource.amount)),'resync also restores resource patches the client missed');
  await applyNext(host,receiver);
  host.ws.terminate();await until(()=>!room.players[0].ws);
  const resumed=await connect();resumed.send({type:'resume',protocol:2,code:session.code,token:session.token});
  const begin=(await resumed.inbox.next('begin')).state,newReceiver=new VisibilityReceiver();assert.ok(newReceiver.read(begin));assert.equal(begin.visibilitySequence,0);
  assert.equal(begin.entities.find(entity=>entity.id===resource.id).amount,resource.amount);await applyNext(resumed,newReceiver);
  legacy.ws.terminate();await until(()=>!room.players[1].ws);
  const upgraded=await connect();upgraded.send({type:'resume',protocol:2,code:guestSession.code,token:guestSession.token});
  const upgradedReceiver=new VisibilityReceiver();assert.ok(upgradedReceiver.read((await upgraded.inbox.next('begin')).state));assert.ok((await applyNext(upgraded,upgradedReceiver)).visibilityDelta);
  resumed.ws.terminate();await until(()=>!room.players[0].ws);
  const downgraded=await connect();downgraded.send({type:'resume',code:session.code,token:session.token});
  assert.equal((await downgraded.inbox.next('begin')).state.visibilitySequence,undefined);
  const oldState=(await downgraded.inbox.next('state')).state;assert.equal(oldState.visible.length,40000);assert.equal(oldState.visibilityDelta,undefined);
});

test('defeated alliances receive complete observer vision without an oversized changed-cell packet',async t=>{
  const {room,host,receiver}=await fixture(t);await applyNext(host,receiver);
  for(let owner=0;owner<4;owner++)room.sim.players[owner].defeated=true;
  let state;do{state=await applyNext(host,receiver);}while(!receiver.visible.every(value=>value===1));
  assert.ok(state.visible,'a large observer reveal uses the smaller full-grid form');assert.equal(state.visibilityDelta,undefined);
  assert.ok(receiver.explored.every(value=>value===1));await applyNext(host,receiver);
});
