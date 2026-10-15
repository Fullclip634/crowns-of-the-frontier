import {multiplayerEndpoint} from './multiplayer-endpoint.js';
export class LanClient {
  constructor(callbacks){this.callbacks=callbacks;this.active=false;this.retry=0;this.socket=null;this.ping=0;this.session=null;try{this.session=JSON.parse(sessionStorage.getItem('crowns-lan'));}catch{};}
  connect(message){clearTimeout(this.reconnectTimer);clearInterval(this.pinger);this.intent=message;this.leaving=false;let endpoint;try{endpoint=multiplayerEndpoint(location,import.meta.env?.VITE_MULTIPLAYER_URL||'',import.meta.env?.VITE_STATIC_HOST==='true');if(!endpoint){this.callbacks.notice('AI battles are ready. Online multiplayer has not been enabled on this hosted game yet.');return;}this.socket?.close();this.socket=new WebSocket(endpoint);}catch(error){this.callbacks.notice(error.message);return;}const socket=this.socket;
    socket.addEventListener('open',()=>{if(this.socket!==socket)return;this.retry=0;this.send(message);clearInterval(this.pinger);this.pinger=setInterval(()=>this.send({type:'ping',stamp:Date.now()}),3000);});
    socket.addEventListener('message',event=>{if(this.socket!==socket)return;const data=JSON.parse(event.data);if(data.type==='session'){this.session={code:data.code,token:data.token};try{sessionStorage.setItem('crowns-lan',JSON.stringify(this.session));}catch{}}
      if(data.type==='lobby')this.callbacks.lobby(data);
      if(data.type==='begin'){this.active=true;this.code=data.code;this.callbacks.begin(data.state);this.callbacks.chatSession?.(data.code,data.chat||{selfSide:0,messages:[]});this.callbacks.connection?.(true);}
      if(data.type==='chat')this.callbacks.chat?.(data.message);
      if(data.type==='chat-error')this.callbacks.chatError?.(data.message);
      if(data.type==='state')this.callbacks.state(data.state,data.effects,data.waiting);
      if(data.type==='error'){if(!this.active&&this.intent?.type==='resume'){this.session=null;try{sessionStorage.removeItem('crowns-lan');}catch{}}this.callbacks.notice(data.message);}
      if(data.type==='closed'){this.leave();this.callbacks.notice(data.message);}
      if(data.type==='pong')this.ping=Date.now()-data.stamp;
    });
    socket.addEventListener('close',()=>{if(this.socket!==socket)return;clearInterval(this.pinger);this.callbacks.connection?.(false);if(this.leaving)return;this.callbacks.notice(this.active?'Connection interrupted. The match waits while you reconnect.':'Could not connect to multiplayer. The server may be waking up; try again shortly.');if(this.session&&this.retry++<8)this.reconnectTimer=setTimeout(()=>this.connect({type:'resume',...this.session}),2000);});
    socket.addEventListener('error',()=>{if(this.socket===socket)this.callbacks.notice('Could not reach the multiplayer server. Please try again shortly.');});
  }
  send(message){if(this.socket?.readyState===WebSocket.OPEN){this.socket.send(JSON.stringify(message));return true;}return false;}
  chat(text,channel,requestId){return this.send({type:'chat',text,channel,requestId});}
  action(method,args){const normalized=args.map(arg=>arg?.id!==undefined?arg.id:arg);this.send({type:'action',method,args:normalized});return true;}
  bind(sim){for(const method of ['build','buildWallLine','train','research','cancelQueue','trade','smartCommand','stop','unload','demolish','assignWorker','patrol','guard','setStance','resign'])sim[method]=(...args)=>{if(method==='buildWallLine')return this.action(method,[args[0]?.x,args[0]?.z,args[1]?.x,args[1]?.z,args[2]]);if(['smartCommand','patrol','guard'].includes(method))sim.emit('order',{order:{}});return this.action(method,args);};}
  leave(){this.leaving=true;this.active=false;clearTimeout(this.reconnectTimer);this.send({type:'leave'});this.socket?.close();clearInterval(this.pinger);this.session=null;this.callbacks.chatReset?.();try{sessionStorage.removeItem('crowns-lan');}catch{}}
}
