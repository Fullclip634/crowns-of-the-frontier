import {multiplayerEndpoint} from './multiplayer-endpoint.js';
import {VisibilityReceiver} from './network-visibility.js';
// Leave a small margin inside the server's two-minute reservation. A socket
// opening is not recovery until the server returns a lobby or full snapshot.
const RECONNECT_WINDOW=115000,RECONNECT_DELAYS=[2000,3000,5000,8000,10000],RESUME_TIMEOUT=15000;
export class LanClient {
  constructor(callbacks){this.callbacks=callbacks;this.active=false;this.retry=0;this.socket=null;this.ping=0;this.session=null;try{this.session=JSON.parse(sessionStorage.getItem('crowns-lan'));}catch{};}
  scheduleReconnect(){
    if(this.leaving||!this.session)return;
    clearTimeout(this.reconnectTimer);
    if(!this.reconnectUntil)this.reconnectUntil=Date.now()+RECONNECT_WINDOW;
    const remaining=this.reconnectUntil-Date.now();
    if(remaining<=0){this.reconnectStopped();return;}
    const delay=Math.min(remaining,RECONNECT_DELAYS[Math.min(this.retry++,RECONNECT_DELAYS.length-1)]);
    this.reconnectTimer=setTimeout(()=>{if(this.leaving||!this.session)return;if(Date.now()>=this.reconnectUntil){this.reconnectStopped();return;}this.connect({type:'resume',...this.session},{automatic:true});},delay);
  }
  reconnectStopped(){this.callbacks.notice(this.active?'Automatic reconnection stopped. Open the pause menu to try reconnecting again.':'Automatic reconnection stopped. Open Play with friends to try reconnecting again.');}
  recovered(){clearTimeout(this.handshakeTimer);this.reconnectUntil=0;this.retry=0;}
  connect(message,{automatic=false}={}){clearTimeout(this.reconnectTimer);clearTimeout(this.handshakeTimer);clearInterval(this.pinger);this.commandReady=false;if(!automatic){this.reconnectUntil=0;this.retry=0;}this.intent=message;this.leaving=false;let endpoint;try{endpoint=multiplayerEndpoint(location,import.meta.env?.VITE_MULTIPLAYER_URL||'',import.meta.env?.VITE_STATIC_HOST==='true');if(!endpoint){this.callbacks.notice('AI battles are ready. Online multiplayer has not been enabled on this hosted game yet.');return;}this.socket?.close();this.socket=new WebSocket(endpoint);}catch(error){if(this.session&&message.type==='resume'){if(!automatic)this.callbacks.notice('Connection interrupted. Trying to reconnect.');this.scheduleReconnect();}else this.callbacks.notice(error.message);return;}const socket=this.socket;
    this.visibility=new VisibilityReceiver();this.visibilityResync=false;
    if(message.type==='resume')this.handshakeTimer=setTimeout(()=>{if(this.socket===socket)socket.close();},RESUME_TIMEOUT);
    socket.addEventListener('open',()=>{if(this.socket!==socket)return;this.send({...message,protocol:2});clearInterval(this.pinger);this.pinger=setInterval(()=>this.send({type:'ping',stamp:Date.now()}),3000);});
    socket.addEventListener('message',event=>{if(this.socket!==socket)return;const data=JSON.parse(event.data);if(data.type==='session'){this.session={code:data.code,token:data.token};try{sessionStorage.setItem('crowns-lan',JSON.stringify(this.session));}catch{}}
      if(data.type==='lobby'){this.recovered();this.callbacks.lobby(data);}
      if(data.type==='begin'){const state=this.visibility.read(data.state);if(!state){socket.close();return;}this.recovered();this.visibilityResync=false;this.active=true;this.commandReady=true;this.waiting=!!data.waiting;this.code=data.code;this.callbacks.begin(state);this.callbacks.chatSession?.(data.code,data.chat||{selfSide:0,messages:[]});this.callbacks.connection?.(true);}
      if(data.type==='chat')this.callbacks.chat?.(data.message);
      if(data.type==='chat-error')this.callbacks.chatError?.(data.message);
      if(data.type==='donation')this.callbacks.donation?.(data);
      if(data.type==='state'){if(data.waiting===true)this.waiting=true;const state=this.visibility.read(data.state);if(state){this.visibilityResync=false;this.waiting=!!data.waiting;this.callbacks.state(state,data.effects,data.waiting);}else if(!this.visibilityResync){this.visibilityResync=this.send({type:'visibility-resync'});}}
      if(data.type==='error'){if(this.intent?.type==='resume'&&(data.code==='session-ended'||data.message==='That network session has ended.')){this.leave();this.callbacks.closed?.();}this.callbacks.notice(data.message);}
      if(data.type==='closed'){this.leave();this.callbacks.closed?.();this.callbacks.notice(data.message);}
      if(data.type==='pong')this.ping=Date.now()-data.stamp;
    });
    socket.addEventListener('close',()=>{if(this.socket!==socket)return;clearTimeout(this.handshakeTimer);clearInterval(this.pinger);this.commandReady=false;this.callbacks.connection?.(false);if(this.leaving)return;if(!this.reconnectUntil)this.callbacks.notice(this.active?'Connection interrupted. The match waits while you reconnect.':'Could not connect to multiplayer. The server may be waking up; try again shortly.');this.scheduleReconnect();});
    socket.addEventListener('error',()=>{if(this.socket===socket&&!this.reconnectUntil)this.callbacks.notice('Could not reach the multiplayer server. Please try again shortly.');});
  }
  send(message){if(this.socket?.readyState===WebSocket.OPEN){this.socket.send(JSON.stringify(message));return true;}return false;}
  chat(text,channel,requestId){return this.send({type:'chat',text,channel,requestId});}
  action(method,args){const normalized=args.map(arg=>arg?.id!==undefined?arg.id:arg),sent=this.commandReady&&!this.waiting&&this.send({type:'action',method,args:normalized});if(!sent)this.callbacks.notice(this.commandReady&&this.waiting?'The match is waiting for another commander to reconnect.':'Orders cannot be sent until the room reconnects.');return !!sent;}
  bind(sim){for(const method of ['build','buildWallLine','train','research','cancelQueue','trade','donateResources','smartCommand','stop','unload','demolish','assignWorker','patrol','guard','setStance','resign','townBell','returnToWork','seekShelter'])sim[method]=(...args)=>{const sent=method==='buildWallLine'?this.action(method,[args[0]?.x,args[0]?.z,args[1]?.x,args[1]?.z,args[2]]):this.action(method,args);if(sent&&['smartCommand','patrol','guard'].includes(method))sim.emit('order',{order:{}});return sent;};}
  leave(){this.leaving=true;this.active=false;this.commandReady=false;this.waiting=false;clearTimeout(this.reconnectTimer);clearTimeout(this.handshakeTimer);this.reconnectUntil=0;this.retry=0;this.send({type:'leave'});this.socket?.close();clearInterval(this.pinger);this.session=null;this.callbacks.chatReset?.();try{sessionStorage.removeItem('crowns-lan');}catch{}}
}
