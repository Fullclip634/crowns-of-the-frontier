import {createRoomPort} from './local-room-port.js';
import {frameMessage,FrameReader} from './channel-frames.js';

// Offline "Nearby" multiplayer transports.
//
// The host's browser runs the authoritative room (normally in a Worker). The
// host's own LanClient talks to it through an in-page loopback socket and each
// nearby guest through a WebRTC data channel. Every link presents the same
// WebSocket-like surface LanClient already uses for the hosted server.

// Guests send small commands only. Match the hosted server's 24 KB payload cap.
export const GUEST_MESSAGE_LIMIT=24000;

export class LinkSocket extends EventTarget {
  constructor({send,close}={}){super();this.readyState=0;this.bufferedAmount=0;this.sendText=send;this.closeLink=close;}
  opened(){if(this.readyState!==0)return;this.readyState=1;this.dispatchEvent(new Event('open'));}
  deliver(text){if(this.readyState!==1)return;const event=new Event('message');event.data=text;this.dispatchEvent(event);}
  send(text){if(this.readyState!==1)throw new Error('This connection is not open.');this.sendText(text);}
  // Local close (LanClient replaced or left the link).
  close(){if(this.readyState>=2)return;this.readyState=3;try{this.closeLink?.();}catch{}queueMicrotask(()=>this.dispatchEvent(new Event('close')));}
  // Remote close (room closed the link or the peer disappeared).
  ended(){if(this.readyState===3)return;this.readyState=3;this.dispatchEvent(new Event('close'));}
}

const sendFramed=(channel,text,nextId)=>{for(const frame of frameMessage(text,nextId))channel.send(frame);};

export class LocalRoomHost {
  constructor({useWorker=true,onFatal=null,tickInterval=100}={}){
    this.links=new Map();this.nextId=1;this.chunkId=1;this.queue=[];this.ready=false;this.disposed=false;this.onFatal=onFatal;this.tickInterval=tickInterval;
    this.bufferTimer=setInterval(()=>this.reportBuffers(),250);
    if(useWorker&&typeof Worker==='function'){
      try{
        const worker=new Worker(new URL('./local-room-worker.js',import.meta.url),{type:'module',name:'crowns-nearby-room'});
        this.worker=worker;
        worker.addEventListener('message',event=>{if(this.worker!==worker)return;if(event.data?.type==='ready'){this.ready=true;this.flush();return;}this.receive(event.data);});
        // Browsers without module Workers fail to load the script; run the room
        // on the page instead. A failure after start ends the hosted match.
        worker.addEventListener('error',event=>{event.preventDefault?.();if(this.worker!==worker)return;if(!this.ready)this.runInline();else this.fail('The nearby room stopped unexpectedly.');});
        return;
      }catch{}
    }
    this.runInline();
  }
  runInline(){
    try{this.worker?.terminate();}catch{}
    this.worker=null;
    const receive=createRoomPort(message=>queueMicrotask(()=>this.receive(message)),{tickInterval:this.tickInterval});
    this.inline=receive;this.ready=true;this.flush();
  }
  flush(){const queued=this.queue;this.queue=[];for(const message of queued)this.post(message);}
  post(message){
    if(this.disposed&&message.type!=='shutdown')return;
    if(!this.ready){this.queue.push(message);return;}
    if(this.worker)this.worker.postMessage(message);
    else if(this.inline){const receive=this.inline;queueMicrotask(()=>receive(message));}
  }
  get peerCount(){let count=0;for(const entry of this.links.values())if(entry.kind==='peer')count++;return count;}
  // The host's own game client.
  openLoopback(){
    const id=this.nextId++;
    const socket=new LinkSocket({send:text=>this.post({type:'message',id,text}),close:()=>{if(this.links.get(id)?.socket===socket){this.links.delete(id);this.post({type:'closed',id});}}});
    this.links.set(id,{kind:'loop',socket});this.post({type:'open',id});
    if(this.disposed)queueMicrotask(()=>socket.ended());else queueMicrotask(()=>socket.opened());
    return socket;
  }
  // A guest that completed the WebRTC handshake.
  addChannel(channel,pc,info={}){
    if(this.disposed){try{channel.close();pc?.close();}catch{}return null;}
    const id=this.nextId++,reader=new FrameReader(GUEST_MESSAGE_LIMIT),entry={kind:'peer',channel,pc,info};
    const drop=()=>{if(this.links.get(id)!==entry)return;this.links.delete(id);this.post({type:'closed',id});try{pc?.close();}catch{}};
    channel.addEventListener('message',event=>{if(this.links.get(id)!==entry||typeof event.data!=='string')return;const text=reader.read(event.data);if(text!==null)this.post({type:'message',id,text});});
    channel.addEventListener('close',drop);
    pc?.addEventListener?.('connectionstatechange',()=>{if(['failed','closed'].includes(pc.connectionState))drop();});
    this.links.set(id,entry);this.post({type:'open',id});
    return id;
  }
  receive(message){
    const entry=this.links.get(message?.id);if(!entry)return;
    if(message.type==='send'){
      if(entry.kind==='loop')entry.socket.deliver(message.text);
      else if(entry.channel.readyState==='open'){try{sendFramed(entry.channel,message.text,()=>this.chunkId++);}catch{try{entry.channel.close();}catch{}}}
    }else if(message.type==='close'){
      this.links.delete(message.id);
      if(entry.kind==='loop')entry.socket.ended();
      // Give the final "closed" notice time to leave before tearing down.
      else setTimeout(()=>{try{entry.channel.close();entry.pc?.close();}catch{}},600);
    }
  }
  reportBuffers(){for(const [id,entry]of this.links)if(entry.kind==='peer')this.post({type:'buffer',id,amount:entry.channel.bufferedAmount||0});}
  fail(message){if(this.disposed)return;const onFatal=this.onFatal;this.teardown();onFatal?.(message);}
  teardown(){
    this.disposed=true;clearInterval(this.bufferTimer);
    for(const entry of this.links.values()){if(entry.kind==='loop')entry.socket.ended();else{try{entry.channel.close();entry.pc?.close();}catch{}}}
    this.links.clear();
    try{this.post({type:'shutdown'});}catch{}
    try{this.worker?.terminate();}catch{}
    this.worker=null;this.inline=null;
  }
  // Leaving lets the room broadcast its "closed" notice before shutdown.
  dispose(){if(this.disposed)return;this.disposed=true;setTimeout(()=>{this.disposed=false;this.teardown();},700);}
}

export function hostTransport(host){
  return {kind:'nearby-host',reconnectable:true,lostMessage:'Your nearby room stopped. Create a new nearby room to keep playing.',open:()=>host.openLoopback(),dispose:()=>host.dispose()};
}

export function guestTransport(channel,pc){
  let socket=null,chunkId=1;const reader=new FrameReader();
  const lost=()=>{const current=socket;socket=null;current?.ended();};
  channel.addEventListener('message',event=>{if(typeof event.data!=='string')return;const text=reader.read(event.data);if(text!==null)socket?.deliver(text);});
  channel.addEventListener('close',lost);
  pc?.addEventListener?.('connectionstatechange',()=>{if(['failed','closed'].includes(pc.connectionState))lost();});
  return {kind:'nearby-guest',reconnectable:false,
    lostMessage:'Lost contact with the nearby host. Ask the host to show an invite, then scan it to rejoin within two minutes.',
    open(){
      if(channel.readyState!=='open')throw new Error('The nearby host is not connected. Scan a new invite from the host to rejoin.');
      const link=new LinkSocket({send:text=>sendFramed(channel,text,()=>chunkId++),close:()=>{if(socket===link)socket=null;}});
      socket=link;queueMicrotask(()=>link.opened());return link;
    },
    dispose(){socket=null;setTimeout(()=>{try{channel.close();pc?.close();}catch{}},400);}};
}
