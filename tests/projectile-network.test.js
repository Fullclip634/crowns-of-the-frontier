import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import WebSocket from 'ws';
import {attachRooms} from '../server/rooms.js';
import {battlePreset} from '../src/custom-battle.js';
import {Simulation} from '../src/simulation.js';

const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function until(predicate){const deadline=Date.now()+8000;while(!predicate()){assert.ok(Date.now()<deadline,'network combat update should arrive');await pause(20);}}
class Inbox{
 constructor(ws){this.items=[];ws.on('message',raw=>this.items.push(JSON.parse(raw)));}
 async next(type){await until(()=>this.items.some(message=>message.type===type));return this.items.splice(this.items.findIndex(message=>message.type===type),1)[0];}
 async state(predicate){await until(()=>this.items.some(message=>message.type==='state'&&predicate(message)));return this.items.find(message=>message.type==='state'&&predicate(message));}
}

test('real room snapshots keep pending damage private, remap cosmetic owners and restore flights on reconnect',async t=>{
 const server=http.createServer(),service=attachRooms(server),clients=[];await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 t.after(async()=>{for(const client of clients)client.terminate();service.close();await new Promise(resolve=>server.close(resolve));});
 async function connect(){const ws=new WebSocket(`ws://127.0.0.1:${server.address().port}/socket`),inbox=new Inbox(ws);clients.push(ws);await new Promise(resolve=>ws.once('open',resolve));return {ws,inbox,send:message=>ws.send(JSON.stringify(message))};}
 const slots=battlePreset('2v2');slots[2].controller='human';const host=await connect();host.send({type:'create',name:'Host',options:{mode:'custom',map:'highlands',seed:512,shareVision:false,slots}});
 const session=await host.inbox.next('session'),guest=await connect();guest.send({type:'join',name:'Guest',code:session.code,slot:3});const guestSession=await guest.inbox.next('session');guest.send({type:'ready',ready:true});while(!(await host.inbox.next('lobby')).canStart){}host.send({type:'start'});
 await host.inbox.next('begin');await guest.inbox.next('begin');const room=service.rooms.get(session.code),sim=room.sim;sim.tick=()=>{};
 const source=sim.addUnit('archer',0,0,20),victim=sim.addUnit('knight',3,9,20),observer=sim.addUnit('archer',2,-16,20);sim.sightCache=null;
 assert.ok(sim.canSee(2,source));assert.equal(sim.canSee(2,victim),false);
 host.inbox.items=[];guest.inbox.items=[];sim.hit(source,victim);sim.time+=.2;sim.tickProjectiles();const shot=sim.projectiles[0],hp=victim.hp;
 const launch=await guest.inbox.state(message=>message.state.visualProjectiles.some(e=>e.projectile===shot.id));
 assert.deepEqual(launch.state.projectiles,[]);assert.equal(launch.state.nextProjectileId,0);assert.equal(launch.state.entities.some(e=>e.id===victim.id),false);
 const visual=launch.state.visualProjectiles.find(e=>e.projectile===shot.id);assert.equal(launch.state.players[visual.entity.owner].name,'Host');assert.deepEqual(visual.target,{kind:'ground',owner:-1,x:9,z:20,r:0});assert.equal(visual.damage,undefined);
 const effect=launch.effects.find(e=>e.projectile===shot.id);assert.ok(effect);assert.equal(effect.target.id,undefined);assert.equal(effect.target.hp,undefined);assert.equal(effect.damage,undefined);
 guest.ws.terminate();await until(()=>!room.players[1].ws);const resumed=await connect();resumed.send({...guestSession,type:'resume'});const begin=(await resumed.inbox.next('begin')).state;
 assert.deepEqual(begin.projectiles,[]);const restored=Simulation.restore(begin);assert.equal(restored.projectiles.length,0);assert.equal(restored.visualProjectiles.length,1);assert.equal(restored.visualProjectiles[0].projectile,shot.id);assert.equal(begin.players[0].name,'Guest');
 resumed.inbox.items=[];sim.time+=.6;sim.tickProjectiles();assert.equal(victim.hp,hp-shot.damage);
 await resumed.inbox.state(()=>true);assert.equal(resumed.inbox.items.some(m=>m.effects?.some(e=>e.type==='projectile-impact'&&e.projectile===shot.id)),false,'hidden impact is not sent to the observer');
 // A different shot lands on this commander's troop while its siege shooter
 // stays beyond that troop's vision. Only the visible impact is transmitted.
 observer.hp=0;const siege=sim.addUnit('catapult',0,-24,20),own=sim.addUnit('knight',2,0,20);sim.sightCache=null;assert.equal(sim.canSee(2,siege),false);
 resumed.inbox.items=[];sim.hit(siege,own);sim.time+=.4;sim.tickProjectiles();const second=sim.projectiles[0];assert.equal(second.stage,'flight');
 const hidden=await resumed.inbox.state(()=>true);assert.equal(hidden.state.visualProjectiles.some(e=>e.projectile===second.id),false);assert.equal(hidden.effects.some(e=>e.projectile===second.id),false);
 resumed.inbox.items=[];const ownHP=own.hp;sim.time+=1;sim.tickProjectiles();
 const landed=await resumed.inbox.state(message=>message.effects.some(e=>e.type==='projectile-impact'&&e.projectile===second.id)),impact=landed.effects.find(e=>e.projectile===second.id);
 assert.equal(landed.state.entities.find(e=>e.id===own.id).owner,0);assert.ok(own.hp<ownHP);assert.equal(impact.target.owner,0);assert.equal(impact.entity.id,undefined);assert.equal(impact.entity.owner,-1);assert.equal(impact.entity.x,own.x);assert.equal(impact.entity.z,own.z);assert.equal(impact.entity.type,'stone');
 assert.deepEqual(landed.state.projectiles,[]);assert.equal(landed.state.nextProjectileId,0);
});

test('visible transports keep carried troops and invasion plans private until a real unload',async t=>{
 const server=http.createServer(),service=attachRooms(server),clients=[];await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 t.after(async()=>{for(const ws of clients)ws.terminate();service.close();await new Promise(resolve=>server.close(resolve));});
 async function connect(){const ws=new WebSocket(`ws://127.0.0.1:${server.address().port}/socket`),inbox=new Inbox(ws);clients.push(ws);await new Promise(resolve=>ws.once('open',resolve));return {ws,inbox,send:message=>ws.send(JSON.stringify(message))};}
 const host=await connect();host.send({type:'create',name:'Host',options:{mode:'tides',map:'coast',seed:512}});const session=await host.inbox.next('session'),guest=await connect();guest.send({type:'join',name:'Guest',code:session.code});await guest.inbox.next('session');host.send({type:'start'});await host.inbox.next('begin');await guest.inbox.next('begin');
 const sim=service.rooms.get(session.code).sim;sim.tick=()=>{};const ship=sim.owned(0,'unit','transport')[0];ship.x=-10;ship.z=34;ship.landing={x:80,z:100,sign:1,shoreZ:100};ship.loadingSince=0;ship.navyAid=123;ship.pathTargetX=80;ship.pathTargetZ=100;
 const passenger=sim.addUnit('knight',0,-16,34);sim.addUnit('scout',1,-18,34);sim.command([passenger.id],{type:'board',target:ship.id});sim.tickUnit(passenger,.1);assert.equal(passenger.embarked,true);assert.ok(sim.canSee(1,ship));host.inbox.items=[];guest.inbox.items=[];
 const enemy=(await guest.inbox.state(message=>message.state.entities.some(e=>e.id===ship.id))).state,boat=enemy.entities.find(e=>e.id===ship.id);assert.equal(enemy.entities.some(e=>e.id===passenger.id),false);assert.equal(boat.passengerCount,1);for(const key of ['passengers','landing','loadingSince','navyAid','pathTargetX','pathTargetZ'])assert.equal(boat[key],undefined,key+' remains private');
 const owned=(await host.inbox.state(message=>message.state.entities.find(e=>e.id===ship.id)?.passengers?.length===1)).state;assert.deepEqual(owned.entities.find(e=>e.id===ship.id).passengers,[passenger.id]);assert.ok(owned.entities.some(e=>e.id===passenger.id));
 guest.inbox.items=[];assert.equal(sim.unload(ship.id,-18,34,0),true);
 const landed=await guest.inbox.state(message=>message.effects.some(e=>e.type==='unload'&&e.entity.id===ship.id));assert.ok(landed.state.entities.some(e=>e.id===passenger.id));const effect=landed.effects.find(e=>e.type==='unload');assert.equal(effect.entity.landing,undefined);assert.equal(effect.entity.passengers,undefined);assert.equal(effect.entity.pathTargetX,undefined);
});
