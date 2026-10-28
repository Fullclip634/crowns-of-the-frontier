import test from 'node:test';
import assert from 'node:assert/strict';
import {LanClient} from '../src/network.js';

test('the actual client negotiates fog deltas, requests resync once and delivers only complete ordered snapshots',t=>{
  const sockets=[],priorSocket=globalThis.WebSocket,priorLocation=globalThis.location;
  class Socket extends EventTarget {
    static OPEN=1;
    constructor(){super();this.readyState=1;this.sent=[];sockets.push(this);}
    send(raw){this.sent.push(JSON.parse(raw));}
    close(){this.readyState=3;}
    emit(type,packet){const event=new Event(type);if(packet)Object.defineProperty(event,'data',{value:JSON.stringify(packet)});this.dispatchEvent(event);}
  }
  globalThis.WebSocket=Socket;globalThis.location={protocol:'http:',host:'localhost:4173'};
  t.after(()=>{globalThis.WebSocket=priorSocket;globalThis.location=priorLocation;});
  t.mock.timers.enable({apis:['setTimeout','setInterval']});
  const states=[],beginnings=[],client=new LanClient({notice(){},begin:state=>beginnings.push(state),state:(...args)=>states.push(args)});
  t.after(()=>client.leave());
  client.connect({type:'create',options:{mode:'custom'}});const socket=sockets[0];socket.emit('open');assert.equal(socket.sent[0].protocol,2);
  socket.emit('message',{type:'begin',code:'ABCDEF',state:{visible:[1,0,0],explored:[1,0,0],visibilitySequence:0}});
  assert.equal(client.active,true);assert.equal(beginnings.length,1);assert.ok(beginnings[0].visible instanceof Uint8Array);
  socket.emit('message',{type:'state',state:{time:1,visibilityDelta:{sequence:1,visible:[0,3],explored:[1]}},effects:[],waiting:false});
  assert.equal(states.length,1);assert.deepEqual([...states[0][0].visible],[0,1,0]);assert.equal(states[0][0].time,1);
  socket.emit('message',{type:'state',state:{time:3,visibilityDelta:{sequence:3,visible:[5],explored:[2]}}});
  socket.emit('message',{type:'state',state:{time:4,visibilityDelta:{sequence:4,visible:[],explored:[]}}});
  assert.equal(states.length,1,'entities and resources must not advance with a rejected fog state');
  assert.equal(socket.sent.filter(packet=>packet.type==='visibility-resync').length,1);
  assert.deepEqual([...states[0][0].visible],[0,1,0]);
  socket.emit('message',{type:'state',state:{time:5,visible:[0,0,1],explored:[1,1,1],visibilitySequence:0},effects:[{type:'complete'}],waiting:true});
  assert.equal(states.length,2);assert.deepEqual([...states[1][0].visible],[0,0,1]);assert.deepEqual(states[1][1],[{type:'complete'}]);assert.equal(states[1][2],true);
  socket.emit('message',{type:'state',state:{time:6,visibilityDelta:{sequence:1,visible:[1,99],explored:[]}}});
  assert.equal(states.length,2);assert.equal(socket.sent.filter(packet=>packet.type==='visibility-resync').length,2);
  assert.deepEqual([...states[1][0].visible],[0,0,1],'a malformed packet cannot reveal even its valid first cell');
  client.connect({type:'resume',code:'ABCDEF',token:'private'});const resumed=sockets[1];resumed.emit('open');assert.equal(resumed.sent[0].protocol,2);
  resumed.emit('message',{type:'begin',code:'ABCDEF',state:{visible:[1,1,0],explored:[1,1,1],visibilitySequence:0}});
  resumed.emit('message',{type:'state',state:{visibilityDelta:{sequence:1,visible:[3],explored:[]}},effects:[]});
  assert.equal(beginnings.length,2);assert.equal(states.length,3);assert.deepEqual([...states[2][0].visible],[1,1,0]);
  socket.emit('message',{type:'state',state:{visible:[0,0,0],explored:[1,1,1]}});assert.equal(states.length,3,'replaced sockets cannot change a resumed match');
});

test('a new client accepts full visibility snapshots from servers without delta negotiation',t=>{
  const priorSocket=globalThis.WebSocket,priorLocation=globalThis.location;let socket;
  class Socket extends EventTarget {static OPEN=1;constructor(){super();this.readyState=1;socket=this;}send(){}close(){}message(packet){const event=new Event('message');Object.defineProperty(event,'data',{value:JSON.stringify(packet)});this.dispatchEvent(event);}}
  globalThis.WebSocket=Socket;globalThis.location={protocol:'http:',host:'localhost:4173'};
  t.after(()=>{globalThis.WebSocket=priorSocket;globalThis.location=priorLocation;});
  const states=[],client=new LanClient({notice(){},begin(){},state:state=>states.push(state)});t.after(()=>client.leave());client.connect({type:'join',code:'ABCDEF'});
  socket.message({type:'begin',state:{visible:[1,0],explored:[1,0]}});
  socket.message({type:'state',state:{visible:[0,1],explored:[1,1]}});
  assert.equal(states.length,1);assert.deepEqual([...states[0].visible],[0,1]);
});

test('reconnection continues beyond eight attempts until a server-confirmed recovery or deadline',t=>{
  const priorSocket=globalThis.WebSocket,priorLocation=globalThis.location,sockets=[],notices=[];
  class Socket extends EventTarget{
    static OPEN=1;constructor(){super();this.readyState=0;this.sent=[];sockets.push(this);}
    send(raw){this.sent.push(JSON.parse(raw));}open(){this.readyState=1;this.dispatchEvent(new Event('open'));}
    close(){if(this.readyState===3)return;this.readyState=3;this.dispatchEvent(new Event('close'));}
    message(packet){const e=new Event('message');Object.defineProperty(e,'data',{value:JSON.stringify(packet)});this.dispatchEvent(e);}
  }
  globalThis.WebSocket=Socket;globalThis.location={protocol:'http:',host:'localhost:4173'};t.after(()=>{globalThis.WebSocket=priorSocket;globalThis.location=priorLocation;});
  t.mock.timers.enable({apis:['setTimeout','setInterval','Date'],now:1000000});
  const client=new LanClient({notice:text=>notices.push(text),begin(){},state(){},connection(){}});t.after(()=>client.leave());client.session={code:'ABCDEF',token:'private'};client.active=true;
  client.connect({type:'resume',...client.session});sockets[0].open();sockets[0].message({type:'begin',code:'ABCDEF',state:{visible:[1],explored:[1]}});sockets[0].close();
  for(let attempt=0;attempt<10;attempt++){const count=sockets.length;t.mock.timers.tick(10000);assert.equal(sockets.length,count+1);const socket=sockets.at(-1);socket.open();socket.close();}
  assert.ok(sockets.length>9,'the client remains able to recover after the former eight-attempt limit');assert.ok(client.retry>=10,'opening a socket alone does not reset the retry budget');
  t.mock.timers.tick(10000);const recovered=sockets.at(-1);recovered.open();recovered.message({type:'begin',code:'ABCDEF',state:{visible:[1],explored:[1]}});assert.equal(client.retry,0);assert.equal(client.reconnectUntil,0);assert.equal(client.active,true);
  recovered.close();t.mock.timers.tick(115000);assert.ok(notices.some(message=>message.includes('Automatic reconnection stopped')));assert.equal(client.session.code,'ABCDEF','a manual retry remains possible');
});

test('an ended resume clears the session and leaves the disconnected battle instead of retrying forever',t=>{
  const priorSocket=globalThis.WebSocket,priorLocation=globalThis.location,sockets=[],notices=[];let closed=0;
  class Socket extends EventTarget{static OPEN=1;constructor(){super();this.readyState=1;sockets.push(this);}send(){}close(){this.readyState=3;this.dispatchEvent(new Event('close'));}message(packet){const e=new Event('message');Object.defineProperty(e,'data',{value:JSON.stringify(packet)});this.dispatchEvent(e);}}
  globalThis.WebSocket=Socket;globalThis.location={protocol:'http:',host:'localhost:4173'};t.after(()=>{globalThis.WebSocket=priorSocket;globalThis.location=priorLocation;});
  t.mock.timers.enable({apis:['setTimeout','setInterval','Date'],now:1000000});
  const client=new LanClient({notice:text=>notices.push(text),closed(){closed++;},connection(){}});client.active=true;client.session={code:'ABCDEF',token:'private'};client.connect({type:'resume',...client.session});
  sockets[0].message({type:'error',code:'session-ended',message:'That network session has ended.'});assert.equal(client.active,false);assert.equal(client.session,null);assert.equal(closed,1);assert.match(notices.at(-1),/session has ended/);
  t.mock.timers.tick(120000);assert.equal(sockets.length,1,'ended sessions are not retried');
});

test('commands are not reported as sent while the socket is disconnected or awaiting the restored snapshot',t=>{
  const priorSocket=globalThis.WebSocket,priorLocation=globalThis.location,sockets=[],notices=[],events=[];
  class Socket extends EventTarget{static OPEN=1;constructor(){super();this.readyState=1;this.sent=[];sockets.push(this);}send(raw){this.sent.push(JSON.parse(raw));}close(){if(this.readyState===3)return;this.readyState=3;this.dispatchEvent(new Event('close'));}message(packet){const e=new Event('message');Object.defineProperty(e,'data',{value:JSON.stringify(packet)});this.dispatchEvent(e);}}
  globalThis.WebSocket=Socket;globalThis.location={protocol:'http:',host:'localhost:4173'};t.after(()=>{globalThis.WebSocket=priorSocket;globalThis.location=priorLocation;});
  t.mock.timers.enable({apis:['setTimeout','setInterval','Date'],now:1000000});
  const client=new LanClient({notice:text=>notices.push(text),begin(){},state(){},connection(){}}),sim={emit:(...args)=>events.push(args)};t.after(()=>client.leave());client.session={code:'ABCDEF',token:'private'};client.active=true;client.bind(sim);client.connect({type:'resume',...client.session});
  assert.equal(sim.smartCommand([1],null,2,3),false);assert.equal(events.length,0);assert.equal(sockets[0].sent.length,0);
  sockets[0].message({type:'begin',code:'ABCDEF',state:{visible:[1],explored:[1]}});assert.equal(sim.smartCommand([1],null,2,3),true);assert.equal(events.length,1);assert.equal(sockets[0].sent.at(-1).method,'smartCommand');
  sockets[0].message({type:'state',state:{visible:[1],explored:[1]},waiting:true});assert.equal(sim.train(4,'villager'),false);assert.match(notices.at(-1),/another commander/);
  sockets[0].message({type:'state',state:{visible:[1],explored:[1]},waiting:false});assert.equal(sim.train(4,'villager'),true);
  sockets[0].close();assert.equal(sim.build('house',2,3,[1]),false);assert.match(notices.at(-1),/until the room reconnects/);
  t.mock.timers.tick(2000);sockets[1].dispatchEvent(new Event('open'));assert.equal(sim.train(4,'villager'),false,'opening the link is not the same as restoring the match');
  sockets[1].message({type:'begin',code:'ABCDEF',state:{visible:[1],explored:[1]}});assert.equal(sim.train(4,'villager'),true);assert.equal(sockets[1].sent.at(-1).method,'train');
});

test('a stalled resume is closed and retried, and leaving cancels further attempts',t=>{
  const priorSocket=globalThis.WebSocket,priorLocation=globalThis.location,sockets=[];
  class Socket extends EventTarget{static OPEN=1;constructor(){super();this.readyState=0;sockets.push(this);}send(){}close(){if(this.readyState===3)return;this.readyState=3;this.dispatchEvent(new Event('close'));}}
  globalThis.WebSocket=Socket;globalThis.location={protocol:'http:',host:'localhost:4173'};t.after(()=>{globalThis.WebSocket=priorSocket;globalThis.location=priorLocation;});
  t.mock.timers.enable({apis:['setTimeout','setInterval','Date'],now:1000000});const client=new LanClient({notice(){},connection(){}});client.session={code:'ABCDEF',token:'private'};client.connect({type:'resume',...client.session});
  t.mock.timers.tick(15000);assert.equal(sockets[0].readyState,3);t.mock.timers.tick(2000);assert.equal(sockets.length,2);client.leave();t.mock.timers.tick(120000);assert.equal(sockets.length,2);
});
