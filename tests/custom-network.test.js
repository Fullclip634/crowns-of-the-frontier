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
    for(const player of state.players.slice(1)){const owner=room.sim.players.findIndex(value=>value.name===player.name);assert.notEqual(owner,-1);if(room.sim.allied(i,owner))assert.deepEqual(player.resources,room.sim.players[owner].resources,`allied supplies are visible to ${state.players[0].name}`);else assert.ok(Object.values(player.resources).every(value=>value===0),'enemy supplies remain private');}assert.equal(state.aiStates,null);assert.equal(state.commanderAI,null);assert.deepEqual(state.teamAlarms,{});
    assert.equal(state.entities.filter(e=>e.hp>0&&e.kind==='unit'&&state.players[e.owner]?.team!==state.players[0].team).length,0);
  }
  for(const player of players)player.inbox.items=[];
  const donor=room.sim.players[0].resources.wood,receiver=room.sim.players[1].resources.wood,enemyTreasury={...room.sim.players[4].resources};
  host.send({type:'action',method:'donateResources',args:[0,1,'wood',125]});
  await until(()=>room.sim.players[0].resources.wood===donor-125&&room.sim.players[1].resources.wood===receiver+125);
  await until(()=>players[0].inbox.items.some(message=>message.type==='donation')&&players[1].inbox.items.some(message=>message.type==='donation'));
  assert.deepEqual(room.sim.players[4].resources,enemyTreasury,'enemy treasuries cannot be changed by an allied gift');
  assert.ok(players[0].inbox.items.some(message=>message.type==='donation'&&message.from==='Host'&&message.to==='Commander 2'&&message.amount===125&&message.resource==='wood'));
  assert.ok(players[1].inbox.items.some(message=>message.type==='donation'&&message.from==='Host'&&message.to==='Commander 2'&&message.amount===125&&message.resource==='wood'));
  host.send({type:'action',method:'donateResources',args:[0,4,'gold',100]});assert.match((await host.inbox.next('error')).message,/gift could not be sent/);assert.equal(room.sim.players[4].resources.gold,enemyTreasury.gold);
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
  for(const field of ['options','gridSize','worldSize','spawnPositions','rngState'])assert.equal(state[field],undefined,`live custom updates omit unchanged ${field}`);
  assert.equal(state.aiStates,null);assert.equal(state.commanderAI,null);assert.deepEqual(state.teamAlarms,{});assert.deepEqual(state.intel,{});
  for(const field of ['entities','players','time','visible','explored','stats','revealedOwners','visualProjectiles','resourceUpdates'])assert.ok(field in state,`live custom updates retain ${field}`);
  const liveBytes=Buffer.byteLength(JSON.stringify(state)),beginBytes=Buffer.byteLength(JSON.stringify(beginnings[7].state));assert.ok(liveBytes*2<beginBytes,'a live update is less than half the full reconnect snapshot');t.diagnostic(`custom multiplayer JSON snapshot: live ${liveBytes} B, full reconnect ${beginBytes} B`);
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

test('network shelter enforces ownership, keeps occupants and return jobs private, and releases actual villagers',async t=>{
  const {service,connect}=await fixture(t),slots=battlePreset('2v2');slots[2].controller='human';const host=await connect();host.send({type:'create',name:'Host',faction:'alder',options:{mode:'custom',map:'highlands',seed:512,slots}});const session=await host.inbox.next('session'),guest=await connect();guest.send({type:'join',name:'Enemy',slot:3,code:session.code});await guest.inbox.next('session');guest.send({type:'ready',ready:true});while(!(await host.inbox.next('lobby')).canStart){}host.send({type:'start'});await host.inbox.next('begin');await guest.inbox.next('begin');
  const sim=service.rooms.get(session.code).sim,tick=sim.tick;sim.tick=()=>{};
  try{
    const tc=sim.owned(0,'building','towncenter')[0],worker=sim.owned(0,'unit','villager')[0],scout=sim.owned(2,'unit','scout')[0];worker.x=tc.x+7;worker.z=tc.z;scout.x=tc.x+17;scout.z=tc.z;sim.revision++;sim.updateFog();
    guest.send({type:'action',method:'townBell',args:[tc.id]});guest.send({type:'action',method:'seekShelter',args:[[worker.id],tc.id]});await pause(100);assert.equal(worker.order?.type==='garrison',false);
    host.send({type:'action',method:'townBell',args:[tc.id]});await until(()=>worker.order?.type==='garrison');sim.tickUnit(worker,.1);assert.equal(worker.shelter,tc.id);
    let privateState;for(let i=0;i<30;i++){const message=await guest.inbox.next('state');if(message.state.entities.find(e=>e.id===tc.id)?.garrisonCount===1){privateState=message.state;break;}}
    assert.ok(privateState);assert.equal(privateState.entities.some(e=>e.id===worker.id),false);const known=privateState.entities.find(e=>e.id===tc.id);assert.equal(known.garrison,undefined);assert.ok(privateState.entities.every(e=>e.shelterWork===undefined));
    guest.send({type:'action',method:'returnToWork',args:[tc.id]});await pause(100);assert.equal(worker.embarked,true);host.send({type:'action',method:'returnToWork',args:[tc.id]});await until(()=>!worker.embarked);assert.equal(worker.shelter,undefined);assert.equal(tc.garrison.length,0);
  }finally{sim.tick=tick;}
});

test('multiplayer wall drags finish the paid connected line and reject foreign workers and hidden terrain',async t=>{
  const {service,connect}=await fixture(t),slots=battlePreset('2v2');slots[1].controller='human';const host=await connect();host.send({type:'create',name:'Wall builder',faction:'alder',options:{mode:'custom',map:'highlands',seed:512,startAge:1,slots}});const session=await host.inbox.next('session');
  const guest=await connect();guest.send({type:'join',name:'Ally',slot:2,code:session.code});await guest.inbox.next('session');guest.send({type:'ready',ready:true});while(!(await host.inbox.next('lobby')).canStart){}host.send({type:'start'});await host.inbox.next('begin');await guest.inbox.next('begin');
  const sim=service.rooms.get(session.code).sim,tick=sim.tick;sim.tick=()=>{};
  try{const tc=sim.owned(0,'building','towncenter')[0],worker=sim.owned(0,'unit','villager')[0],foreign=sim.owned(1,'unit','villager')[0],from={x:tc.x+12,z:tc.z+14},to={x:from.x+5.7,z:from.z};worker.x=from.x;worker.z=from.z-4;sim.players[0].resources.stone=1000;
    for(const e of sim.entities)if(e.kind==='resource'&&Math.hypot(e.x-from.x,e.z-from.z)<20)e.hp=0;sim.revision++;
    host.send({type:'action',method:'buildWallLine',args:[from.x,from.z,to.x,to.z,[foreign.id]]});await pause(100);assert.equal(sim.owned(0,'building','wall').length,0);assert.equal(sim.players[0].resources.stone,1000);
    host.send({type:'action',method:'buildWallLine',args:[from.x,from.z,to.x,to.z,[worker.id]]});await until(()=>sim.owned(0,'building','wall').length===3);const walls=sim.owned(0,'building','wall');assert.equal(sim.players[0].resources.stone,934);assert.deepEqual(walls[1].wallLinks.sort((a,b)=>a-b),[walls[0].id,walls[2].id]);
    const hidden={x:sim.halfWorld-12,z:sim.halfWorld-12};host.send({type:'action',method:'buildWallLine',args:[hidden.x,hidden.z,hidden.x-6,hidden.z,[worker.id]]});await pause(100);assert.equal(sim.owned(0,'building','wall').length,3);assert.equal(sim.players[0].resources.stone,934);
    assert.equal(worker.order.target,walls[0].id);assert.equal(worker.orders.length,2,'the server preserves every following wall assignment');
    host.send({type:'action',method:'build',args:['wall',from.x+10,from.z,[worker.id]]});await until(()=>sim.owned(0,'building','wall').length===4);
    host.send({type:'action',method:'buildWallLine',args:[from.x,from.z+6,to.x,from.z+6,[worker.id]]});await until(()=>sim.owned(0,'building','wall').length===7);
    host.send({type:'action',method:'build',args:['wall',from.x+10,from.z+6,[worker.id]]});await until(()=>sim.owned(0,'building','wall').length===8);
    const canceled=sim.get(worker.order.target),refund=sim.players[0].resources.stone;
    host.send({type:'action',method:'demolish',args:[canceled.id]});await until(()=>canceled.hp===0);assert.equal(sim.players[0].resources.stone,refund+Math.floor(22*.7));
    walls.splice(0,walls.length,...sim.owned(0,'building','wall'));
    for(let step=0;step<2000&&walls.some(wall=>wall.progress<1);step++)tick.call(sim,.1);
    assert.ok(walls.every(wall=>wall.progress===1),'all planted lines and individual sections finish after canceling the current wall, without another click');
    tick.call(sim,.1);tick.call(sim,.1);assert.notEqual(worker.order?.type,'build');assert.equal(worker.orders.length,0);
  }finally{sim.tick=tick;}
});

test('authoritative siege repairs charge the repairing commander and healers cannot refill a ram',async t=>{
  const {service,connect}=await fixture(t),slots=battlePreset('2v2');slots[1].controller='human';const host=await connect();host.send({type:'create',name:'Castle defender',faction:'alder',options:{mode:'custom',map:'highlands',seed:512,slots}});const session=await host.inbox.next('session'),ally=await connect();ally.send({type:'join',name:'Engineer ally',slot:2,code:session.code});await ally.inbox.next('session');ally.send({type:'ready',ready:true});while(!(await host.inbox.next('lobby')).canStart){}host.send({type:'start'});await host.inbox.next('begin');await ally.inbox.next('begin');
  const sim=service.rooms.get(session.code).sim,tick=sim.tick;sim.tick=()=>{};
  try{
    const tc=sim.owned(0,'building','towncenter')[0],ram=sim.addUnit('ram',0,tc.x+10,tc.z+10),worker=sim.addUnit('villager',1,ram.x+2,ram.z),monk=sim.addUnit('monk',0,ram.x+1,ram.z);ram.hp=100;sim.players[1].resources.wood=1000;sim.players[1].resources.gold=1000;sim.updateFog();
    host.send({type:'action',method:'smartCommand',args:[[worker.id],ram.id,ram.x,ram.z,false,false]});await pause(100);assert.equal(worker.order,null,'a commander cannot issue repairs using another player’s worker');
    const before={...sim.players[1].resources},hostWood=sim.players[0].resources.wood;
    ally.send({type:'action',method:'smartCommand',args:[[worker.id],ram.id,ram.x,ram.z,false,false]});await until(()=>worker.order?.type==='repair');sim.tickUnit(worker,1);assert.equal(ram.hp,123);assert.ok(sim.players[1].resources.wood<before.wood&&sim.players[1].resources.gold<before.gold);assert.equal(sim.players[0].resources.wood,hostWood);
    host.send({type:'action',method:'smartCommand',args:[[monk.id],ram.id,ram.x,ram.z,false,false]});await until(()=>monk.order);sim.tickUnit(monk,1);assert.equal(ram.hp,123,'networked healer orders cannot refill mechanical units');
  }finally{sim.tick=tick;}
});
