import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import WebSocket from 'ws';
import {attachRooms} from '../server/rooms.js';
async function until(predicate){const deadline=Date.now()+5000;while(!predicate()&&Date.now()<deadline)await new Promise(resolve=>setTimeout(resolve,20));assert.ok(predicate(),'server did not apply the command within 5 seconds');}
class Inbox {
  constructor(ws){this.messages=[];this.waiters=[];ws.on('message',raw=>{const message=JSON.parse(raw),i=this.waiters.findIndex(w=>w.type===message.type);if(i>=0){const [w]=this.waiters.splice(i,1);clearTimeout(w.timer);w.resolve(message);}else this.messages.push(message);});}
  next(type){const i=this.messages.findIndex(m=>m.type===type);if(i>=0)return Promise.resolve(this.messages.splice(i,1)[0]);return new Promise((resolve,reject)=>{const waiter={type,resolve,timer:setTimeout(()=>reject(new Error('Missing '+type)),3000)};this.waiters.push(waiter);});}
}
test('Wi-Fi rooms synchronize both players, enforce ownership, and reconnect',async t=>{
  const server=http.createServer(),service=attachRooms(server),clients=[];await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  t.after(async()=>{for(const ws of clients)ws.terminate();service.close();await new Promise(resolve=>server.close(resolve));});
  const connect=async()=>{const ws=new WebSocket(`ws://127.0.0.1:${server.address().port}/socket`);clients.push(ws);const inbox=new Inbox(ws);await new Promise(resolve=>ws.once('open',resolve));return {ws,inbox,send:data=>ws.send(JSON.stringify(data))};};
  const host=await connect();host.send({type:'create',name:'Host',faction:'alder',options:{mode:'skirmish',map:'highlands',seed:67}});const session=await host.inbox.next('session');const guest=await connect();guest.send({type:'join',name:'Guest',faction:'raven',code:session.code});const guestSession=await guest.inbox.next('session');host.send({type:'start'});
  const a=(await host.inbox.next('begin')).state,b=(await guest.inbox.next('begin')).state;
  assert.equal(a.entities.filter(e=>e.hp>0&&e.owner===0&&e.kind==='unit').length,b.entities.filter(e=>e.hp>0&&e.owner===0&&e.kind==='unit').length);
  assert.deepEqual(a.players[0].resources,b.players[0].resources);assert.equal(a.entities.find(e=>e.owner===0&&e.type==='towncenter').x,-b.entities.find(e=>e.owner===0&&e.type==='towncenter').x);assert.equal(b.players[0].faction,'raven');
  assert.equal(b.entities.filter(e=>e.owner===1&&e.kind==='unit').length,0);
  const room=service.rooms.get(session.code),enemyBarracks=room.sim.owned(0,'building','barracks')[0],ownBarracks=room.sim.owned(1,'building','barracks')[0];
  // Isolate perspective remapping from gameplay, which correctly resets
  // unoccupied sacred-site counters on its next tick.
  const tick=room.sim.tick;room.sim.tick=()=>{};
  try{
    room.sim.hold=12;room.sim.enemyHold=34;room.sim.wonderTime=[22,44];guest.inbox.messages=guest.inbox.messages.filter(m=>m.type!=='state');
    let timers;const deadline=Date.now()+5000;
    do{timers=(await guest.inbox.next('state')).state;}while(timers.hold!==34&&Date.now()<deadline);
    assert.equal(timers.hold,34);assert.deepEqual(timers.wonderTime,[44,22]);
  }finally{room.sim.tick=tick;}
  guest.send({type:'action',method:'train',args:[enemyBarracks.id,'spearman']});await new Promise(r=>setTimeout(r,80));assert.equal(enemyBarracks.queue.length,0);
  const houses=room.sim.owned(1,'building','house').length,worker=room.sim.owned(1,'unit','villager')[0];guest.send({type:'action',method:'build',args:['house',-70,-70,[worker.id]]});await guest.inbox.next('error');assert.equal(room.sim.owned(1,'building','house').length,houses);
  const house=room.sim.owned(1,'building','house')[0];guest.send({type:'action',method:'demolish',args:[house.id]});await until(()=>house.hp===0);assert.equal(house.hp,0);assert.equal(room.stats[0].kills,0);assert.equal(room.stats[1].lost,0);
  guest.send({type:'action',method:'train',args:[ownBarracks.id,'spearman']});await until(()=>ownBarracks.queue[0]?.type==='spearman');assert.equal(ownBarracks.queue[0]?.type,'spearman');
  const scout=room.sim.owned(1,'unit','scout')[0],ownTown=room.sim.owned(1,'building','towncenter')[0],hostTown=room.sim.owned(0,'building','towncenter')[0];
  guest.send({type:'action',method:'guard',args:[[scout.id],hostTown.id]});guest.send({type:'action',method:'train',args:[ownBarracks.id,'spearman']});await until(()=>ownBarracks.queue.length===2);assert.notEqual(scout.order?.type,'guard');
  guest.send({type:'action',method:'guard',args:[[scout.id],ownTown.id]});await until(()=>scout.order?.type==='guard');assert.equal(scout.order?.type,'guard');
  guest.send({type:'action',method:'patrol',args:[[scout.id],ownTown.x+10,ownTown.z+15]});await until(()=>scout.order?.type==='patrol');assert.equal(scout.order?.type,'patrol');
  guest.send({type:'action',method:'setStance',args:[[scout.id],'hold']});await until(()=>scout.order===null&&scout.stance==='hold');assert.equal(scout.order,null);assert.equal(scout.stance,'hold');
  guest.ws.terminate();await until(()=>room.players[1].ws===null);const paused=room.sim.time;await new Promise(r=>setTimeout(r,250));assert.equal(room.sim.time,paused);
  const resumed=await connect();resumed.send({...guestSession,type:'resume'});const restored=(await resumed.inbox.next('begin')).state;assert.equal(restored.players[0].faction,'raven');assert.equal(restored.time,paused);
});
