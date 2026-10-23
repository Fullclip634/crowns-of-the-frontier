import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import WebSocket from 'ws';
import {attachRooms} from '../server/rooms.js';
import {battlePreset,visibilityFor} from '../src/custom-battle.js';
import {VisibilityReceiver} from '../src/network-visibility.js';

const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function until(predicate){const deadline=Date.now()+5000;while(!predicate()){assert.ok(Date.now()<deadline,'server condition timed out');await pause(20);}}
class Inbox {
  constructor(ws){this.items=[];this.waiters=[];ws.on('message',raw=>{const packet=JSON.parse(raw),index=this.waiters.findIndex(w=>w.type===packet.type);if(index<0)this.items.push(packet);else{const [waiter]=this.waiters.splice(index,1);clearTimeout(waiter.timer);waiter.resolve(packet);}});}
  next(type){const index=this.items.findIndex(packet=>packet.type===type);if(index>=0)return Promise.resolve(this.items.splice(index,1)[0]);return new Promise((resolve,reject)=>{const waiter={type,resolve,timer:setTimeout(()=>reject(new Error(`Missing ${type}`)),7000)};this.waiters.push(waiter);});}
  clear(){this.items=this.items.filter(packet=>packet.type!=='state');}
}
async function fixture(t){
  const server=http.createServer(),service=attachRooms(server),clients=[];
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  t.after(async()=>{for(const client of clients)client.terminate();service.close();await new Promise(resolve=>server.close(resolve));});
  const connect=async()=>{const ws=new WebSocket(`ws://127.0.0.1:${server.address().port}/socket`),inbox=new Inbox(ws);clients.push(ws);await new Promise(resolve=>ws.once('open',resolve));return {ws,inbox,send:packet=>ws.send(JSON.stringify(packet))};};
  const host=await connect(),slots=battlePreset('4v4');slots[1].controller='human';
  host.send({type:'create',protocol:2,options:{mode:'custom',map:'highlands',mapSize:'huge',seed:512,slots}});
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
