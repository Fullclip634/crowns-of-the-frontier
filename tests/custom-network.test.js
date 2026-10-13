import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import WebSocket from 'ws';
import {attachRooms} from '../server/rooms.js';
import {battlePreset} from '../src/custom-battle.js';
class Inbox{
  constructor(ws){this.items=[];this.waiters=[];ws.on('message',raw=>{const message=JSON.parse(raw),index=this.waiters.findIndex(w=>w.type===message.type);if(index>=0){const [waiter]=this.waiters.splice(index,1);clearTimeout(waiter.timer);waiter.resolve(message);}else this.items.push(message);});}
  next(type){const i=this.items.findIndex(message=>message.type===type);if(i>=0)return Promise.resolve(this.items.splice(i,1)[0]);return new Promise((resolve,reject)=>{const waiter={type,resolve,timer:setTimeout(()=>reject(new Error('Missing '+type)),8000)};this.waiters.push(waiter);});}
}
async function fixture(t){const server=http.createServer(),service=attachRooms(server),clients=[];await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));t.after(async()=>{for(const ws of clients)ws.terminate();service.close();await new Promise(resolve=>server.close(resolve));});return {service,connect:async()=>{const ws=new WebSocket(`ws://127.0.0.1:${server.address().port}/socket`),inbox=new Inbox(ws);clients.push(ws);await new Promise(resolve=>ws.once('open',resolve));return {ws,inbox,send:message=>ws.send(JSON.stringify(message))};}};}
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function until(predicate){const deadline=Date.now()+4000;while(!predicate()){assert.ok(Date.now()<deadline,'authoritative command should complete');await pause(25);}}

test('eight human commanders ready, receive private team perspectives, reconnect, and win as an alliance',async t=>{
  const {service,connect}=await fixture(t),players=[],sessions=[],slots=battlePreset('4v4').map(slot=>({...slot,controller:'human'}));
  const host=await connect();players.push(host);host.send({type:'create',name:'Host',faction:'alder',options:{mode:'custom',map:'highlands',mapSize:'huge',seed:512,slots,aiPace:'patient'}});const session=await host.inbox.next('session');sessions.push(session);const code=session.code;
  for(let i=1;i<8;i++){const player=await connect();players.push(player);player.send({type:'join',name:`Commander ${i+1}`,faction:['alder','sun','raven'][i%3],code});sessions.push(await player.inbox.next('session'));}
  host.send({type:'start'});assert.match((await host.inbox.next('error')).message,/ready/);
  for(const player of players)player.send({type:'ready',ready:true});while(!(await host.inbox.next('lobby')).canStart){}host.send({type:'start'});
  const beginnings=await Promise.all(players.map(player=>player.inbox.next('begin'))),room=service.rooms.get(code);assert.equal(room.sim.players.length,8);assert.equal(room.sim.worldSize,400);
  for(let i=0;i<8;i++){
    const state=beginnings[i].state;assert.equal(state.players[0].name,i===0?'Host':`Commander ${i+1}`);assert.equal(state.entities.filter(e=>e.hp>0&&e.owner===0&&e.kind==='unit').length,9);assert.equal(state.visible.length,40000);
    assert.equal(state.options.aiPace,'patient');
    assert.ok(state.players.slice(1).every(player=>Object.values(player.resources).every(value=>value===0)));assert.equal(state.aiStates,null);assert.equal(state.commanderAI,null);assert.deepEqual(state.teamAlarms,{});
    assert.equal(state.entities.filter(e=>e.hp>0&&e.kind==='unit'&&state.players[e.owner]?.team!==state.players[0].team).length,0);
  }
  for(const player of players)player.inbox.items=[];
  room.sim.teamAlarms={private:{owner:1,base:123,x:20,z:25,at:0,intensity:40}};
  room.sim.emit('ally-support',{owner:1,ally:0,count:4,x:room.sim.players[0].start.x,z:room.sim.players[0].start.z});
  await until(()=>players.slice(0,4).every(player=>player.inbox.items.some(message=>message.type==='state'&&message.effects.some(effect=>effect.type==='ally-support'))));
  await until(()=>players.every(player=>player.inbox.items.some(message=>message.type==='state')));
  for(let i=0;i<8;i++){
    const states=players[i].inbox.items.filter(message=>message.type==='state'),notices=states.flatMap(message=>message.effects.filter(effect=>effect.type==='ally-support').map(effect=>({effect,state:message.state})));
    for(const message of states)assert.deepEqual(message.state.teamAlarms,{});
    if(i<4){assert.equal(notices.length,1);const {effect,state}=notices[0];assert.equal(state.players[effect.owner].name,'Commander 2');assert.equal(state.players[effect.ally].name,'Host');}
    else assert.equal(notices.length,0,'enemy commanders never receive an allied support notice');
  }
  const guest=players[7],own=room.sim.owned(7,'building','barracks')[0],enemy=room.sim.owned(0,'building','barracks')[0];guest.send({type:'action',method:'train',args:[enemy.id,'spearman']});await pause(100);assert.equal(enemy.queue.length,0);
  guest.send({type:'action',method:'train',args:[own.id,'spearman']});await until(()=>own.queue.length>0);assert.equal(own.queue[0]?.type,'spearman');
  const state=(await guest.inbox.next('state')).state;assert.ok(state.compactResources);assert.equal(state.entities.filter(e=>e.kind==='resource').length,0);
  const alliedWorker=room.sim.owned(6,'unit','villager')[0];assert.equal(alliedWorker.order.type,'gather');guest.inbox.items=[];const animation=(await guest.inbox.next('state')).state.entities.find(e=>e.id===alliedWorker.id);assert.equal(animation.activity,'gather');assert.equal(animation.order,undefined);assert.deepEqual(animation.orders,[]);
  guest.ws.terminate();await until(()=>!room.players[7].ws);const stopped=room.sim.time;await pause(200);assert.equal(room.sim.time,stopped);
  const rejoined=await connect();rejoined.send({...sessions[7],type:'resume'});const resumed=(await rejoined.inbox.next('begin')).state;assert.equal(resumed.players[0].name,'Commander 8');assert.ok(resumed.entities.some(e=>e.id===own.id&&e.queue[0]?.type==='spearman'));
  // Host defeat is not the end of a multiplayer war: surviving teammates continue.
  room.sim.eliminateKingdom(0,'Test capital assault');room.sim.checkVictory();assert.equal(room.sim.ended,null);
  for(let owner=4;owner<8;owner++)room.sim.eliminateKingdom(owner,'Test final assault');room.sim.checkVictory();assert.equal(room.sim.ended.winningTeam,1);
  const endedState=async inbox=>{let state;do{state=(await inbox.next('state')).state;}while(!state.ended);return state;};
  host.inbox.items=[];rejoined.inbox.items=[];const finalHost=await endedState(host.inbox),finalEnemy=await endedState(rejoined.inbox);assert.equal(finalHost.ended.won,true);assert.equal(finalEnemy.ended.won,false);
});

test('custom rooms mix humans and AI, preserve assigned slots, and treat leaving as a concession',async t=>{
  const {service,connect}=await fixture(t),slots=battlePreset('3v3');slots[4].controller='human';slots[1].difficulty='brutal';const host=await connect();host.send({type:'create',name:'Host',faction:'alder',options:{mode:'custom',map:'highlands',seed:601,slots}});const session=await host.inbox.next('session');
  const guest=await connect();guest.send({type:'join',name:'Guest',faction:'raven',slot:5,code:session.code});await guest.inbox.next('session');guest.send({type:'ready',ready:true});while(!(await host.inbox.next('lobby')).canStart){}host.send({type:'start'});await host.inbox.next('begin');await guest.inbox.next('begin');const room=service.rooms.get(session.code);
  assert.equal(room.players[1].side,4);assert.equal(room.sim.players[4].controller,'human');assert.equal(room.sim.players[1].controller,'ai');
  await until(()=>room.sim.aiStates[1]?.decision>=1);assert.equal(room.sim.aiStates[4],undefined);
  guest.send({type:'leave'});await until(()=>room.sim.players[4].defeated);assert.equal(room.sim.ended,null);const before=room.sim.time;await until(()=>room.sim.time>before);
});
