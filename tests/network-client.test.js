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
