import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import {attachRooms} from './rooms.js';
import {inspectRelease} from './release.js';

const types={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.svg':'image/svg+xml','.webmanifest':'application/manifest+json','.png':'image/png','.jpg':'image/jpeg','.woff2':'font/woff2'};
export function createGameServer({root,environment=process.env,roomOptions}={}){
  root=path.resolve(root);const readiness=inspectRelease(root,environment);
  const server=http.createServer((request,response)=>{try{
    const pathname=decodeURIComponent(new URL(request.url,'http://localhost').pathname);
    if(pathname==='/health'){response.writeHead(readiness.ready?200:503,{'Content-Type':'application/json','Cache-Control':'no-store'});response.end(JSON.stringify({ok:readiness.ready,service:'crowns-of-the-frontier',release:readiness.release,...(readiness.ready?{}:{failures:readiness.failures})}));return;}
    if(!readiness.ready){response.writeHead(503,{'Content-Type':'text/plain','Cache-Control':'no-store','Retry-After':'15'});response.end('The game update is not ready. Please try again shortly.');return;}
    const file=path.resolve(root,'.'+(pathname==='/'?'/index.html':pathname));
    if(!file.startsWith(root+path.sep)||!fs.existsSync(file)||!fs.statSync(file).isFile()){response.writeHead(404);response.end('Not found');return;}
    response.writeHead(200,{'Content-Type':types[path.extname(file)]||'application/octet-stream','Cache-Control':file.includes(path.sep+'assets'+path.sep)?'public, max-age=31536000, immutable':'no-cache'});
    const stream=fs.createReadStream(file);stream.on('error',()=>response.destroy());stream.pipe(response);
  }catch{response.writeHead(400);response.end('Invalid request');}});
  const rooms=readiness.ready?attachRooms(server,roomOptions):null;
  if(!readiness.ready)server.on('upgrade',(_request,socket)=>socket.destroy());
  return {server,rooms,readiness};
}
