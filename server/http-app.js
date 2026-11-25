import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import {attachRooms} from './rooms.js';
import {inspectRelease} from './release.js';
import {acceptsGzip,MODEL_GZIP_DIR,modelGzipName} from './model-transfer.js';

const types={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json; charset=utf-8','.svg':'image/svg+xml','.webmanifest':'application/manifest+json','.png':'image/png','.jpg':'image/jpeg','.webp':'image/webp','.woff2':'font/woff2','.glb':'model/gltf-binary','.gltf':'model/gltf+json','.ktx2':'image/ktx2','.wasm':'application/wasm','.wav':'audio/wav','.ogg':'audio/ogg','.mp3':'audio/mpeg','.txt':'text/plain; charset=utf-8'};
export function createGameServer({root,environment=process.env,roomOptions}={}){
  root=path.resolve(root);const readiness=inspectRelease(root,environment);
  const server=http.createServer((request,response)=>{try{
    const pathname=decodeURIComponent(new URL(request.url,'http://localhost').pathname);
    if(pathname==='/health'){response.writeHead(readiness.ready?200:503,{'Content-Type':'application/json','Cache-Control':'no-store'});response.end(JSON.stringify({ok:readiness.ready,service:'crowns-of-the-frontier',release:readiness.release,...(readiness.ready?{}:{failures:readiness.failures})}));return;}
    if(!readiness.ready){response.writeHead(503,{'Content-Type':'text/plain','Cache-Control':'no-store','Retry-After':'15'});response.end('The game update is not ready. Please try again shortly.');return;}
    const file=path.resolve(root,'.'+(pathname==='/'?'/index.html':pathname));
    const directory=path.relative(root,file).split(path.sep)[0].toLowerCase();
    if(!file.startsWith(root+path.sep)||directory===MODEL_GZIP_DIR){
      response.writeHead(404);response.end('Not found');return;
    }
    const original=fs.statSync(file,{throwIfNoEntry:false});
    if(!original?.isFile()){
      response.writeHead(404);response.end('Not found');return;
    }
    const extension=path.extname(file).toLowerCase();
    const headers={
      'Content-Type':types[extension]||'application/octet-stream',
      'Cache-Control':file.includes(path.sep+'assets'+path.sep)?'public, max-age=31536000, immutable':'no-cache',
    };
    let body=file;
    if(directory==='assets'&&extension==='.glb'){
      const size=original.size;
      headers['Content-Length']=size;
      const gzip=path.join(root,modelGzipName(file));
      const transfer=fs.statSync(gzip,{throwIfNoEntry:false});
      if(transfer?.isFile()&&transfer.size>0&&transfer.size<size){
        headers.Vary='Accept-Encoding';
        if((request.method==='GET'||request.method==='HEAD')&&!request.headers.range&&acceptsGzip(request.headers['accept-encoding'])){
          body=gzip;
          headers['Content-Encoding']='gzip';
          headers['Content-Length']=transfer.size;
          headers['X-Uncompressed-Length']=size;
        }
      }
    }
    response.writeHead(200,headers);
    if(request.method==='HEAD'){response.end();return;}
    const stream=fs.createReadStream(body);
    stream.on('error',()=>response.destroy());
    response.on('close',()=>stream.destroy());
    stream.pipe(response);
  }catch{response.writeHead(400);response.end('Invalid request');}});
  const rooms=readiness.ready?attachRooms(server,roomOptions):null;
  if(!readiness.ready)server.on('upgrade',(_request,socket)=>socket.destroy());
  return {server,rooms,readiness};
}
