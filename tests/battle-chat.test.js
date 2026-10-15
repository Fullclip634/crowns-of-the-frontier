import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import WebSocket from 'ws';
import {attachRooms} from '../server/rooms.js';
import {BattleChat} from '../server/battle-chat.js';
import {battlePreset} from '../src/custom-battle.js';
import {CHAT_HISTORY,CHAT_WINDOW} from '../src/chat-protocol.js';

async function until(predicate){const deadline=Date.now()+5000;while(!predicate()&&Date.now()<deadline)await new Promise(resolve=>setTimeout(resolve,20));assert.ok(predicate(),'Chat did not arrive within 5 seconds');}
async function serviceFor(t){
  const server=http.createServer(),service=attachRooms(server),clients=[];await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  t.after(async()=>{for(const ws of clients)ws.terminate();service.close();await new Promise(resolve=>server.close(resolve));});
  const connect=async()=>{const ws=new WebSocket(`ws://127.0.0.1:${server.address().port}/socket`),messages=[];clients.push(ws);ws.on('message',bytes=>{const message=JSON.parse(bytes);if(message.type!=='state')messages.push(message);});await new Promise(resolve=>ws.once('open',resolve));return {ws,messages,send:message=>ws.send(JSON.stringify(message)),async next(type){await until(()=>messages.some(message=>message.type===type));return messages.splice(messages.findIndex(message=>message.type===type),1)[0];}};};
  return {service,connect};
}

test('custom battle chat enforces identity, team and room boundaries, including reconnect history',async t=>{
  const {service,connect}=await serviceFor(t),host=await connect(),slots=battlePreset('2v2');for(const i of [0,1,2])slots[i].controller='human';
  host.send({type:'create',name:'Host',options:{mode:'custom',seed:2026,mapSize:'large',slots}});const hostSession=await host.next('session');await host.next('lobby');
  const ally=await connect();ally.send({type:'join',name:'Ally',code:hostSession.code,slot:2});const allySession=await ally.next('session');await ally.next('lobby');
  const enemy=await connect();enemy.send({type:'join',name:'Enemy',code:hostSession.code,slot:3});await enemy.next('session');await enemy.next('lobby');
  const outsider=await connect();outsider.send({type:'create',name:'Other room',options:{mode:'skirmish'}});const otherSession=await outsider.next('session');await outsider.next('lobby');
  const unauthenticated=await connect();unauthenticated.send({type:'chat',channel:'all',text:'Unauthenticated'});
  ally.send({type:'ready',ready:true});enemy.send({type:'ready',ready:true});await until(()=>service.rooms.get(hostSession.code).players.every(player=>player.ready));host.send({type:'start'});
  await host.next('begin');const begin=await ally.next('begin');await enemy.next('begin');assert.equal(begin.chat.selfSide,1);assert.deepEqual(begin.chat.messages,[]);
  host.send({type:'chat',channel:'team',text:'\nDefend   the north!\u202e',senderSide:2,senderName:'Forged enemy',requestId:'request-1'});
  const own=(await host.next('chat')).message,received=(await ally.next('chat')).message;assert.equal(received.text,'Defend the north!');assert.equal(received.senderName,'Host');assert.equal(received.senderSide,0);assert.equal(own.requestId,'request-1');
  host.send({type:'chat',channel:'team',text:'Defend the north!',requestId:'request-1'});assert.equal((await host.next('chat')).message.id,own.id);host.send({type:'ping',stamp:555});await host.next('pong');assert.equal(ally.messages.filter(message=>message.type==='chat').length,0,'retry acknowledges the original without broadcasting it twice');
  enemy.send({type:'chat',channel:'all',text:'Good luck 👋'});assert.equal((await host.next('chat')).message.text,'Good luck 👋');assert.equal((await ally.next('chat')).message.channel,'all');assert.equal((await enemy.next('chat')).message.text,'Good luck 👋');
  assert.equal(enemy.messages.filter(message=>message.type==='chat').length,0,'enemy never receives the team message');assert.equal(outsider.messages.filter(message=>message.type==='chat').length,0);assert.equal(unauthenticated.messages.filter(message=>message.type==='chat').length,0);
  ally.ws.terminate();await until(()=>service.rooms.get(hostSession.code).players[1].ws===null);host.send({type:'chat',channel:'team',text:'Wait for our ally'});await host.next('chat');
  const resumed=await connect();resumed.send({...allySession,type:'resume'});const restored=await resumed.next('begin');assert.deepEqual(restored.chat.messages.map(message=>message.text),['Defend the north!','Good luck 👋','Wait for our ally']);assert.equal(restored.chat.selfSide,1);
  const enemyPlayer=service.rooms.get(hostSession.code).players[2];assert.deepEqual(service.rooms.get(hostSession.code).chat.session(service.rooms.get(hostSession.code),enemyPlayer).messages.map(message=>message.text),['Good luck 👋']);
  assert.deepEqual(service.rooms.get(otherSession.code).chat,undefined);
});

test('chat rejects invalid payloads and flooding while preserving the live connection',async t=>{
  const {connect}=await serviceFor(t),host=await connect();host.send({type:'create',name:'Host',options:{mode:'skirmish',seed:67}});const session=await host.next('session');const guest=await connect();guest.send({type:'join',code:session.code});await guest.next('session');host.send({type:'start'});await host.next('begin');await guest.next('begin');
  for(const payload of [{channel:'all',text:'   \n\t'},{channel:'all',text:'a'.repeat(241)},{channel:'private',text:'Invalid channel'},{channel:'all',text:{message:'Object'}}]){host.send({type:'chat',...payload});assert.ok((await host.next('chat-error')).message);}
  for(let i=0;i<5;i++){host.send({type:'chat',channel:'all',text:`Order ${i}`});await host.next('chat');await guest.next('chat');}
  host.send({type:'chat',channel:'all',text:'Too fast'});assert.match((await host.next('chat-error')).message,/wait/i);
  host.send({type:'ping',stamp:123});assert.equal((await host.next('pong')).stamp,123);assert.equal(guest.messages.filter(message=>message.type==='chat').length,0);
});

test('room memory is bounded, expires flood counts and never serializes chat into gameplay saves',()=>{
  const chat=new BattleChat(),player={side:0,name:'Commander'},room={sim:{players:[{team:1},{team:2}]}};
  for(let i=0;i<CHAT_HISTORY+20;i++){const result=chat.accept(room,player,{channel:i%2?'team':'all',text:`Message ${i}`},i*CHAT_WINDOW);assert.ok(result.message);}
  assert.equal(chat.messages.length,CHAT_HISTORY);assert.equal(chat.messages[0].id,21);assert.equal(chat.session(room,{side:1}).messages.length,CHAT_HISTORY/2);assert.equal(room.sim.chat,undefined);
  assert.equal(chat.accept(room,player,{channel:'all',text:'👍'.repeat(240)},(CHAT_HISTORY+21)*CHAT_WINDOW).message.text.length,480);
  assert.ok(chat.accept(room,player,{channel:'all',text:'👍'.repeat(241)},(CHAT_HISTORY+22)*CHAT_WINDOW).error);
});

test('valid application heartbeats keep a connection alive even when control pong replies are delayed',async t=>{
  const server=http.createServer(),service=attachRooms(server,{heartbeatInterval:100});await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const ws=new WebSocket(`ws://127.0.0.1:${server.address().port}/socket`,{autoPong:false});let pongs=0,closed=false;ws.on('message',bytes=>{if(JSON.parse(bytes).type==='pong')pongs++;});ws.on('close',()=>closed=true);await new Promise(resolve=>ws.once('open',resolve));
  let timer=setInterval(()=>ws.readyState===1&&ws.send(JSON.stringify({type:'ping',stamp:Date.now()})),25);
  t.after(async()=>{clearInterval(timer);ws.terminate();service.close();await new Promise(resolve=>server.close(resolve));});
  await new Promise(resolve=>setTimeout(resolve,650));assert.equal(closed,false);assert.ok(pongs>5,'the server is still processing real application traffic');
  clearInterval(timer);timer=null;await until(()=>closed);assert.equal(closed,true,'a silent peer still times out');
});

test('snapshot backpressure preserves chat delivery and bounds an overloaded socket',async t=>{
  const {service,connect}=await serviceFor(t),host=await connect();host.send({type:'create',name:'Host',options:{mode:'skirmish',seed:67}});const session=await host.next('session'),guest=await connect();guest.send({type:'join',code:session.code});await guest.next('session');host.send({type:'start'});await host.next('begin');await guest.next('begin');
  const peer=service.rooms.get(session.code).players.find(player=>player.side===1).ws;let backlog=1100000;Object.defineProperty(peer,'bufferedAmount',{get:()=>backlog});
  host.send({type:'chat',channel:'all',text:'Keep defending',requestId:'congested-1'});assert.equal((await guest.next('chat')).message.text,'Keep defending');await host.next('chat');
  backlog=4100000;host.send({type:'chat',channel:'all',text:'Overloaded connection'});await host.next('chat');await until(()=>guest.ws.readyState===3);
});
