import assert from 'node:assert/strict';
import fs from 'node:fs';
import WebSocket from 'ws';
import {RELEASE} from '../src/data.js';
const base=process.env.QA_URL||'http://localhost:4173/',page=await fetch(base);assert.equal(page.status,200);const html=await page.text(),asset=html.match(/\bsrc="([^"]+\.js)"/)[1],bundle=await(await fetch(new URL(asset,base))).text();assert.ok(bundle.includes(RELEASE));
const socketURL=new URL('socket',base);socketURL.protocol=socketURL.protocol==='https:'?'wss:':'ws:';const ws=new WebSocket(socketURL);
try{
  await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(new Error('WebSocket connection timed out')),5000);ws.once('open',()=>{clearTimeout(timer);resolve();});ws.once('error',error=>{clearTimeout(timer);reject(error);});});
  const stamp=Date.now(),reply=new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(new Error('WebSocket ping timed out')),5000);ws.once('message',raw=>{clearTimeout(timer);resolve(JSON.parse(raw));});});ws.send(JSON.stringify({type:'ping',stamp}));assert.deepEqual(await reply,{type:'pong',stamp});
  const health=await fetch(new URL('health',base));assert.equal(health.status,200);assert.equal((await health.json()).ok,true);const result={version:JSON.parse(fs.readFileSync('package.json','utf8')).version,url:base,http:true,websocket:true,health:true,checked:new Date().toISOString()};fs.writeFileSync('artifacts/live-server-check.json',JSON.stringify(result,null,2));console.log(JSON.stringify(result));
}finally{ws.close();}
