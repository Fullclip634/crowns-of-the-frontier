import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import WebSocket from 'ws';
import {attachRooms} from '../server/rooms.js';
import {LanClient} from '../src/network.js';
import {battlePreset} from '../src/custom-battle.js';

const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function until(predicate,message){const deadline=Date.now()+8000;while(!predicate()){assert.ok(Date.now()<deadline,message);await pause(25);}}

test('actual clients recover a dropped match and clear a server-expired session',async t=>{
  const server=http.createServer(),service=attachRooms(server),priorSocket=globalThis.WebSocket,priorLocation=globalThis.location;
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));globalThis.WebSocket=WebSocket;globalThis.location={protocol:'http:',host:`127.0.0.1:${server.address().port}`};
  const hostState={begins:0},guestState={begins:0,closed:0,notices:[]};
  const callbacks=state=>({notice:message=>(state.notices??=[]).push(message),lobby:data=>{state.lobby=data;},begin:data=>{state.state=data;state.begins++;},state(){},connection(){},closed(){state.closed=(state.closed||0)+1;}});
  const host=new LanClient(callbacks(hostState)),guest=new LanClient(callbacks(guestState));
  t.after(async()=>{host.leave();guest.leave();service.close();await new Promise(resolve=>server.close(resolve));globalThis.WebSocket=priorSocket;globalThis.location=priorLocation;});
  const slots=battlePreset('2v2');slots[1].controller='human';host.connect({type:'create',name:'Host',options:{mode:'custom',map:'highlands',mapSize:'spacious',seed:512,slots}});
  await until(()=>host.session&&hostState.lobby,'host session and lobby');guest.connect({type:'join',name:'Guest',code:host.session.code,slot:2});
  await until(()=>guest.session&&guestState.lobby,'guest session and lobby');guest.send({type:'ready',ready:true});await until(()=>hostState.lobby?.canStart,'guest is ready');host.send({type:'start'});
  await until(()=>hostState.begins===1&&guestState.begins===1,'both commanders enter');const room=service.rooms.get(host.session.code);room.sim.tick=()=>{};
  guest.socket.terminate();await until(()=>!guest.commandReady&&!room.players[1].ws,'the server reserves the disconnected commander');
  assert.equal(guest.action('train',[1,'villager']),false);await until(()=>host.waiting,'the connected ally sees that the match is paused');assert.equal(host.action('train',[1,'villager']),false);
  await until(()=>guestState.begins===2&&guest.commandReady&&!host.waiting,'automatic reconnect restores the full snapshot and resumes the ally');
  assert.equal(guestState.state.players[0].name,'Guest');assert.equal(room.players[1].conceded,undefined);
  guest.socket.terminate();await until(()=>!room.players[1].ws,'second interruption');room.players[1].disconnected=Date.now()-120001;
  await until(()=>room.players[1].conceded,'server expires the reservation');await until(()=>guestState.closed===1,'client receives an explicit ended session');
  assert.equal(guest.active,false);assert.equal(guest.session,null);assert.ok(guestState.notices.some(message=>message.includes('session has ended')));
});
