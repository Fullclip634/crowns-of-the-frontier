import {WebSocketServer} from 'ws';
import {originAllowed} from './origins.js';
import {createRoomCore} from '../src/room-core.js';

// Hosted multiplayer: the shared room authority behind `ws` WebSockets. The
// same core also runs in a host's browser for offline "Nearby" matches.
export function attachRooms(server,{allowedOrigins=(process.env.ALLOWED_ORIGINS||'').split(',').map(value=>value.trim()).filter(Boolean),maxRooms=Math.max(1,Math.min(8,Number(process.env.MAX_ROOMS)||8)),heartbeatInterval=20000}={}){
  const wss=new WebSocketServer({noServer:true,maxPayload:24000,perMessageDeflate:{threshold:1024,serverNoContextTakeover:true,zlibDeflateOptions:{level:1}}});
  const core=createRoomCore({maxRooms});
  server.on('upgrade',(req,socket,head)=>{if(req.url!=='/socket'||!originAllowed(req.headers.origin,req.headers.host,allowedOrigins)){socket.destroy();return;}wss.handleUpgrade(req,socket,head,ws=>wss.emit('connection',ws,req));});
  wss.on('connection',ws=>{const link=core.connect(ws);ws.on('pong',()=>ws.alive=true);ws.on('message',raw=>link.message(raw));ws.on('close',()=>link.close());});
  const heartbeat=setInterval(()=>{for(const ws of wss.clients){try{if(!ws.alive){ws.terminate();continue;}ws.alive=false;ws.ping();}catch{try{ws.terminate();}catch{}}}},Math.max(50,Number(heartbeatInterval)||20000));
  return {rooms:core.rooms,close(){core.close();clearInterval(heartbeat);wss.close();}};
}
