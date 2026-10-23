import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import WebSocket from 'ws';
import {attachRooms} from '../server/rooms.js';
import {battlePreset} from '../src/custom-battle.js';

const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function until(predicate){const deadline=Date.now()+5000;while(!predicate()){assert.ok(Date.now()<deadline,'room lifecycle condition timed out');await pause(20);}}
class Inbox {
  constructor(ws){this.items=[];this.waiters=[];ws.on('message',raw=>{const packet=JSON.parse(raw),index=this.waiters.findIndex(waiter=>waiter.type===packet.type);if(index<0)this.items.push(packet);else{const [waiter]=this.waiters.splice(index,1);clearTimeout(waiter.timer);waiter.resolve(packet);}});}
  next(type){const index=this.items.findIndex(packet=>packet.type===type);if(index>=0)return Promise.resolve(this.items.splice(index,1)[0]);return new Promise((resolve,reject)=>{const waiter={type,resolve,timer:setTimeout(()=>reject(new Error('Missing '+type)),6000)};this.waiters.push(waiter);});}
}
async function fixture(t,mode='custom',start=true){
  const server=http.createServer(),service=attachRooms(server,{maxRooms:1}),clients=[];
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  t.after(async()=>{for(const ws of clients)ws.terminate();service.close();await new Promise(resolve=>server.close(resolve));});
  const connect=async()=>{const ws=new WebSocket(`ws://127.0.0.1:${server.address().port}/socket`),inbox=new Inbox(ws);clients.push(ws);await new Promise((resolve,reject)=>{ws.once('open',resolve);ws.once('error',reject);});return {ws,inbox,send:packet=>ws.send(JSON.stringify(packet))};};
  const host=await connect(),slots=battlePreset('2v2');slots[2].controller='human';
  host.send({type:'create',protocol:2,name:'Host',options:{mode,map:'highlands',mapSize:'spacious',seed:512,slots}});const session=await host.inbox.next('session');
  const guest=await connect();guest.send({type:'join',protocol:2,name:'Guest',code:session.code,slot:3});const guestSession=await guest.inbox.next('session');guest.send({type:'ready',ready:true});
  while(!(await host.inbox.next('lobby')).canStart){}if(start){host.send({type:'start'});await host.inbox.next('begin');await guest.inbox.next('begin');}
  const room=service.rooms.get(session.code);if(room.sim)room.sim.tick=()=>{};
  return {service,connect,host,guest,session,guestSession,room};
}

test('a short custom battle releases the single server slot as soon as all humans leave',async t=>{
  const {service,connect,host,guest,session,room}=await fixture(t);
  host.send({type:'leave'});await until(()=>room.players[0].conceded);assert.ok(service.rooms.has(session.code),'the other commander remains in the match');
  guest.send({type:'leave'});await until(()=>room.players[1].conceded);
  assert.equal(room.sim.ended,null,'AI allies on opposing teams can still be alive when all people depart');
  assert.equal(service.rooms.has(session.code),false,'explicit departures must not wait for the 150-second orphan timeout');
  const next=await connect();next.send({type:'create',options:{mode:'skirmish',map:'highlands',seed:513}});const fresh=await next.inbox.next('session');assert.notEqual(fresh.code,session.code);assert.equal(service.rooms.size,1);
});

test('a classic match preserves the result viewer and frees capacity after the last commander leaves',async t=>{
  const {service,connect,host,guest,session,room}=await fixture(t,'skirmish');
  host.send({type:'leave'});await until(()=>room.sim.ended);assert.ok(service.rooms.has(session.code));
  let result;do{result=(await guest.inbox.next('state')).state;}while(!result.ended);assert.equal(result.ended.won,true);
  guest.send({type:'leave'});await until(()=>room.players.every(player=>player.conceded));assert.equal(service.rooms.has(session.code),false);
  // Reuse the existing socket, as well as a fresh connection in the custom test.
  guest.send({type:'create',options:{mode:'skirmish',map:'highlands',seed:514}});await guest.inbox.next('session');assert.equal(service.rooms.size,1);
  const other=await connect();other.send({type:'create',options:{mode:'skirmish'}});assert.match((await other.inbox.next('error')).message,/busy/);
});

test('unexpected disconnection reserves a match for reconnect and expired final links release capacity',async t=>{
  const {service,connect,host,guest,session,guestSession,room}=await fixture(t);
  guest.ws.terminate();await until(()=>!room.players[1].ws);host.send({type:'leave'});await until(()=>room.players[0].conceded);
  room.players[1].disconnected=Date.now()-60000;await pause(220);assert.ok(service.rooms.has(session.code),'a genuine interruption retains the two-minute grace');
  const blocked=await connect();blocked.send({type:'create',options:{mode:'skirmish'}});assert.match((await blocked.inbox.next('error')).message,/busy/);
  const resumed=await connect();resumed.send({type:'resume',protocol:2,code:session.code,token:guestSession.token});const state=(await resumed.inbox.next('begin')).state;assert.equal(state.players[0].name,'Guest');assert.equal(room.players[1].conceded,undefined);
  resumed.ws.terminate();await until(()=>!room.players[1].ws);room.players[1].disconnected=Date.now()-120001;
  await until(()=>room.players[1].conceded);assert.equal(service.rooms.has(session.code),false,'no extra 30-second capacity delay follows the reconnect deadline');
});

test('connected resigned observers keep their match until they close or explicitly leave',async t=>{
  const {service,host,guest,session,room}=await fixture(t);
  for(const client of [host,guest])client.send({type:'action',method:'resign',args:[]});await until(()=>room.players.every(player=>player.conceded));await pause(220);
  assert.ok(service.rooms.has(session.code),'resignation is not an explicit exit from the observer view');assert.equal(room.sim.ended,null);
  host.ws.terminate();await until(()=>!room.players[0].ws);assert.ok(service.rooms.has(session.code),'the other observer is still connected');
  guest.ws.terminate();await until(()=>!service.rooms.has(session.code));
});

test('replaced connections cannot issue late commands or concede a resumed commander',async t=>{
  const {connect,guest,guestSession,session,room}=await fixture(t),player=room.players[1],oldSocket=player.ws;
  const resumed=await connect();resumed.send({type:'resume',protocol:2,code:session.code,token:guestSession.token});await resumed.inbox.next('begin');const currentSocket=player.ws;
  assert.notEqual(currentSocket,oldSocket);const tc=room.sim.owned(player.side,'building','towncenter')[0],queue=tc.queue.length;
  // Inject messages queued on the old connection during takeover/close.
  oldSocket.emit('message',Buffer.from(JSON.stringify({type:'action',method:'train',args:[tc.id,'villager']})));
  oldSocket.emit('message',Buffer.from(JSON.stringify({type:'leave'})));
  assert.equal(tc.queue.length,queue,'only the current connection may spend the commander’s resources');assert.equal(player.ws,currentSocket);assert.equal(player.conceded,undefined);
  resumed.send({type:'action',method:'train',args:[tc.id,'villager']});await until(()=>tc.queue.length===queue+1);guest.ws.terminate();
});

test('an interrupted lobby host can resume, but an expired host closes the unusable lobby and frees capacity',async t=>{
  const {service,connect,host,guest,session,room}=await fixture(t,'custom',false);
  host.ws.terminate();await until(()=>!room.players[0].ws);room.players[0].disconnected=Date.now()-60000;await pause(220);assert.ok(service.rooms.has(session.code));
  const resumed=await connect();resumed.send({type:'resume',protocol:2,code:session.code,token:session.token});assert.equal((await resumed.inbox.next('lobby')).host,true);
  resumed.ws.terminate();await until(()=>!room.players[0].ws);room.players[0].disconnected=Date.now()-120001;
  assert.match((await guest.inbox.next('closed')).message,/host.*reconnect/i);assert.equal(service.rooms.has(session.code),false);
  const next=await connect();next.send({type:'create',options:{mode:'skirmish'}});await next.inbox.next('session');assert.equal(service.rooms.size,1);
});

test('an expired lobby guest releases its human slot so a replacement can join and start',async t=>{
  const {service,connect,host,guest,session,guestSession,room}=await fixture(t,'custom',false);
  guest.ws.terminate();await until(()=>!room.players[1].ws);room.players[1].disconnected=Date.now()-60000;await pause(220);assert.equal(room.players.length,2);
  room.players[1].disconnected=Date.now()-120001;await until(()=>room.players.length===1);assert.ok(service.rooms.has(session.code));
  const replacement=await connect();replacement.send({type:'join',protocol:2,name:'Replacement',code:session.code,slot:3});await replacement.inbox.next('session');
  replacement.send({type:'resume',code:session.code,token:guestSession.token}); // A joined client cannot use an expired token to take over another slot.
  replacement.send({type:'ready',ready:true});while(!(await host.inbox.next('lobby')).canStart){}host.send({type:'start'});await host.inbox.next('begin');assert.equal((await replacement.inbox.next('begin')).state.players[0].name,'Replacement');
  const expired=await connect();expired.send({type:'resume',code:session.code,token:guestSession.token});assert.match((await expired.inbox.next('error')).message,/session has ended/);
});
