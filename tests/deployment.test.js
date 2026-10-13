import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import WebSocket from 'ws';
import {multiplayerEndpoint} from '../src/multiplayer-endpoint.js';
import {originAllowed} from '../server/origins.js';
import {attachRooms} from '../server/rooms.js';
import {LanClient} from '../src/network.js';

test('single-service and static-host deployment resolve appropriate secure multiplayer endpoints',()=>{
  assert.equal(multiplayerEndpoint({protocol:'http:',host:'192.168.1.6:4173'}),'ws://192.168.1.6:4173/socket');
  const page={protocol:'https:',host:'crowns.onrender.com'};assert.equal(multiplayerEndpoint(page),'wss://crowns.onrender.com/socket');assert.equal(multiplayerEndpoint(page,'',true),null);
  assert.equal(multiplayerEndpoint(page,'https://battle.example.com'),'wss://battle.example.com/socket');assert.equal(multiplayerEndpoint(page,'wss://battle.example.com/socket',true),'wss://battle.example.com/socket');
  for(const url of ['ws://battle.example.com/socket','https://user:pass@battle.example.com','ftp://battle.example.com','https://battle.example.com/?secret=1'])assert.throws(()=>multiplayerEndpoint(page,url));
});

test('external frontends require exact configured origins rather than a wildcard',()=>{
  const allow=['https://crowns.netlify.app'];assert.ok(originAllowed('https://crowns.netlify.app','server.onrender.com',allow));assert.ok(originAllowed('https://server.onrender.com','server.onrender.com',allow));assert.ok(originAllowed(undefined,'localhost:4173',allow));
  for(const value of ['https://evil.netlify.app','https://crowns.netlify.app.evil.example','null','file://server.onrender.com','https://crowns.netlify.app/path'])assert.equal(originAllowed(value,'server.onrender.com',allow),false);
});

test('a real cross-origin WebSocket frontend connects only when explicitly allowed',async t=>{
  const server=http.createServer(),service=attachRooms(server,{allowedOrigins:['https://crowns.netlify.app']}),clients=[];await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));t.after(async()=>{clients.forEach(ws=>ws.terminate());service.close();await new Promise(resolve=>server.close(resolve));});
  const endpoint=`ws://127.0.0.1:${server.address().port}/socket`,good=new WebSocket(endpoint,{origin:'https://crowns.netlify.app'});clients.push(good);await new Promise((resolve,reject)=>{good.once('open',resolve);good.once('error',reject);});
  const pong=new Promise(resolve=>good.once('message',raw=>resolve(JSON.parse(raw))));good.send(JSON.stringify({type:'ping',stamp:42}));assert.deepEqual(await pong,{type:'pong',stamp:42});
  const bad=new WebSocket(endpoint,{origin:'https://unapproved.netlify.app'});clients.push(bad);const denied=await new Promise(resolve=>{bad.once('open',()=>resolve(false));bad.once('error',()=>resolve(true));});assert.ok(denied);
});

test('leaving a disconnected match cancels a pending automatic reconnect',t=>{
  const sockets=[];class FakeSocket extends EventTarget{static OPEN=1;constructor(){super();this.readyState=1;sockets.push(this);}send(){}close(){this.readyState=3;this.dispatchEvent(new Event('close'));}}
  const prior=globalThis.WebSocket,priorLocation=globalThis.location;globalThis.WebSocket=FakeSocket;globalThis.location={protocol:'http:',host:'localhost:4173'};t.after(()=>{globalThis.WebSocket=prior;globalThis.location=priorLocation;});t.mock.timers.enable({apis:['setTimeout','setInterval']});
  const client=new LanClient({notice(){}});client.session={code:'ABCDEF',token:'test'};client.connect({type:'resume',...client.session});sockets[0].close();client.leave();t.mock.timers.tick(2500);assert.equal(sockets.length,1);assert.equal(client.session,null);
});
