import http from 'node:http';
import {fork} from 'node:child_process';
import {Session} from 'node:inspector';
import {monitorEventLoopDelay} from 'node:perf_hooks';
import fs from 'node:fs';
import WebSocket from 'ws';
// A synthetic late-match fixture. The server runs in its own process so its
// CPU report excludes client JSON parsing. Simulation and rendering are held;
// this measures snapshot preparation/transport, not match or device frame rate.
// Usage: node scripts/snapshot-profile.mjs [label]
const {attachRooms}=await import(process.env.SNAPSHOT_SERVER||'../server/rooms.js');
import {battlePreset} from '../src/custom-battle.js';

const pause=ms=>new Promise(r=>setTimeout(r,ms));
if(process.argv[2]==='server'){
 const server=http.createServer(),service=attachRooms(server);await new Promise(r=>server.listen(0,'127.0.0.1',r));process.send({port:server.address().port});
 process.on('message',async message=>{
  if(message.type==='setup'){
   const room=service.rooms.get(message.code),s=room.sim;s.tick=()=>{};s.entities=s.entities.filter(e=>e.kind!=='unit');
   for(let owner=0;owner<8;owner++){const base=s.players[owner].start;for(let i=0;i<160;i++){const e=s.addUnit(['villager','spearman','archer','knight'][i%4],owner,base.x+(i%16-8)*1.3,base.z+(Math.floor(i/16)-5)*1.3);e.order={type:'move',x:base.x+30,z:base.z+30};e.path=Array.from({length:32},(_,j)=>({x:base.x+j,z:base.z+j}));e.pathStatus='complete';e.pathTargetX=base.x+30;e.pathTargetZ=base.z+30;}for(let i=0;i<32;i++)s.addBuilding(i%5?'house':'barracks',owner,base.x+(i%8-4)*6,base.z+(Math.floor(i/8)-2)*7,true);}
   s.revision++;s.index=new Map(s.entities.map(e=>[e.id,e]));s.updateFog();room.effects=[];await pause(1000);process.send({ready:true,entities:s.entities.length});
  }
  if(message.type==='measure'){
   const inspector=new Session();inspector.connect();const post=(method,args={})=>new Promise((r,j)=>inspector.post(method,args,(e,v)=>e?j(e):r(v)));await post('Profiler.enable');await post('Profiler.start');const loop=monitorEventLoopDelay({resolution:10});loop.enable();const cpu=process.cpuUsage(),start=performance.now();process.send({measuring:true});await pause(8000);const usage=process.cpuUsage(cpu),wall=performance.now()-start,{profile}=await post('Profiler.stop');loop.disable();inspector.disconnect();const hits=new Map(profile.nodes.map(n=>[n.id,{name:n.callFrame.functionName||'(anonymous)',file:n.callFrame.url,hits:0}]));for(const id of profile.samples||[])hits.get(id).hits++;
   process.send({done:true,wall,cpuMs:(usage.user+usage.system)/1000,delayMeanMs:loop.mean/1e6,delayP99Ms:loop.percentile(99)/1e6,top:[...hits.values()].sort((a,b)=>b.hits-a.hits).slice(0,15)});
  }
  if(message.type==='close'){for(const room of service.rooms.values())for(const p of room.players)p.ws?.terminate();service.close();server.close(()=>process.exit(0));}
 });
}else{
 const label=process.argv[2]||'current';if(!/^[a-z0-9-]+$/i.test(label))throw Error('Use a simple alphanumeric report label.');
 const child=fork(new URL(import.meta.url),['server'],{execArgv:[],stdio:['ignore','ignore','inherit','ipc']}),clients=[],waiters=[],messages=[],exited=new Promise(resolve=>child.once('exit',resolve));
 child.on('message',message=>{const at=waiters.findIndex(w=>w.check(message));if(at>=0)waiters.splice(at,1)[0].resolve(message);else messages.push(message);});
 const next=check=>{const at=messages.findIndex(check);return at>=0?Promise.resolve(messages.splice(at,1)[0]):new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('profile timeout')),30000);waiters.push({check,resolve:m=>{clearTimeout(timer);resolve(m);}});});};
 let measure=false,frames=0,bytes=0;const connect=async port=>{const ws=new WebSocket(`ws://127.0.0.1:${port}/socket`,{perMessageDeflate:false}),queue=[],pending=[];clients.push(ws);ws.on('message',raw=>{const m=JSON.parse(raw);if(measure&&m.type==='state'){frames++;bytes+=raw.length;}const at=pending.findIndex(p=>p.type===m.type);if(at>=0)pending.splice(at,1)[0].resolve(m);else if(m.type!=='state')queue.push(m);});await new Promise((resolve,reject)=>{ws.once('open',resolve);ws.once('error',reject);});return {ws,send:m=>ws.send(JSON.stringify(m)),next:type=>{const at=queue.findIndex(m=>m.type===type);return at>=0?Promise.resolve(queue.splice(at,1)[0]):new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('Missing '+type)),15000);pending.push({type,resolve:m=>{clearTimeout(timer);resolve(m);}});});}};};
 try{const {port}=await next(m=>!!m.port),host=await connect(port),slots=battlePreset('4v4').map(s=>({...s,controller:'human'}));host.send({type:'create',protocol:2,options:{mode:'custom',map:'highlands',mapSize:'huge',populationLimit:160,seed:512,slots}});const {code}=await host.next('session');for(let i=1;i<8;i++){const p=await connect(port);p.send({type:'join',protocol:2,code});await p.next('session');p.send({type:'ready',ready:true});}while(!(await host.next('lobby')).canStart){}host.send({type:'start'});await host.next('begin');child.send({type:'setup',code});const setup=await next(m=>m.ready);child.send({type:'measure'});await next(m=>m.measuring);measure=true;const result=await next(m=>m.done);measure=false;const report={label,setup,frames,bytes,bytesPerFrame:bytes/frames,...result,cpuMsPerFrame:result.cpuMs/frames,scope:'Frozen simulation, eight external client sockets in parent process, server CPU only; no rendering or physical-device FPS.'};fs.mkdirSync('artifacts',{recursive:true});fs.writeFileSync('artifacts/snapshot-profile-'+label+'.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report));}
 finally{for(const ws of clients)ws.terminate();if(child.connected)child.send({type:'close'});const timer=setTimeout(()=>child.kill(),5000);await exited;clearTimeout(timer);}
}
