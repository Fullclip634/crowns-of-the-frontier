import test from 'node:test';
import assert from 'node:assert/strict';
import {frameMessage,FrameReader,FRAME_CHUNK} from '../src/channel-frames.js';
import {LocalRoomHost,hostTransport,guestTransport,GUEST_MESSAGE_LIMIT} from '../src/local-host.js';
import {encodeSignal,decodeSignal,compactSdp} from '../src/local-pairing.js';
import {qrSvg} from '../src/qr-code.js';
import jsQR from 'jsqr';
import {LanClient} from '../src/network.js';
import {battlePreset} from '../src/custom-battle.js';
import {customHostOptions} from '../src/custom-host.js';

// An in-memory stand-in for a connected pair of RTCDataChannels.
function channelPair(){
  const a=new EventTarget(),b=new EventTarget();
  for(const [self,other]of [[a,b],[b,a]]){
    self.readyState='open';self.bufferedAmount=0;self.sent=0;
    self.send=data=>{if(self.readyState!=='open')throw new Error('closed');self.sent++;queueMicrotask(()=>{const event=new Event('message');event.data=data;other.dispatchEvent(event);});};
    self.close=()=>{if(self.readyState==='closed')return;self.readyState='closed';other.readyState='closed';queueMicrotask(()=>{self.dispatchEvent(new Event('close'));other.dispatchEvent(new Event('close'));});};
  }
  return [a,b];
}
const until=async(check,label,timeout=8000)=>{const end=Date.now()+timeout;while(!check()){if(Date.now()>end)throw new Error(`Timed out waiting for ${label}`);await new Promise(resolve=>setTimeout(resolve,20));}};
function client(){
  const record={lobbies:[],begins:[],states:[],notices:[],closed:0};
  const lan=new LanClient({lobby:room=>record.lobbies.push(room),begin:state=>record.begins.push(state),state:(...args)=>record.states.push(args),notice:message=>record.notices.push(message),closed:()=>record.closed++});
  return {lan,record};
}

test('data-channel frames split large snapshots and reassemble them in order',()=>{
  let id=1;const small=JSON.stringify({type:'ping',stamp:1}),large=JSON.stringify({type:'state',blob:'x'.repeat(FRAME_CHUNK*3+17)});
  assert.deepEqual(frameMessage(small,()=>id++),['F'+small]);
  const frames=frameMessage(large,()=>id++);assert.equal(frames.length,4);
  const reader=new FrameReader();let out=null;for(const frame of frames)out=reader.read(frame)??out;
  assert.equal(out,large);
  // Guest links reject oversize commands just like the hosted server's payload cap.
  const guest=new FrameReader(GUEST_MESSAGE_LIMIT);
  assert.equal(guest.read('F'+'y'.repeat(GUEST_MESSAGE_LIMIT+1)),null);
  for(const frame of frames)assert.equal(guest.read(frame),null);
  // Out-of-order or forged chunks are discarded rather than spliced together.
  const strict=new FrameReader();assert.equal(strict.read(frames[1]),null);assert.equal(strict.read('Cbad'),null);assert.equal(strict.read('Zjunk'),null);
});

test('nearby pairing codes round-trip compactly and reject foreign text',async()=>{
  const sdp=['v=0','o=- 1 2 IN IP4 127.0.0.1','a=candidate:1 1 udp 2122260223 192.168.1.4 51000 typ host','a=candidate:2 1 tcp 1518280447 192.168.1.4 9 typ host tcptype active','a=fingerprint:sha-256 AA:BB',''].join('\r\n');
  const compact=compactSdp(sdp);assert.match(compact,/udp/);assert.doesNotMatch(compact,/ tcp /);
  const code=await encodeSignal({v:1,k:'offer',room:'ABC123',sdp:compact});
  assert.match(code,/^CF1[zj]\.[A-Za-z0-9_-]+$/);
  const signal=await decodeSignal(`  ${code}\n`);assert.equal(signal.room,'ABC123');assert.equal(signal.sdp,compact);
  await assert.rejects(decodeSignal('hello'),/not a Crowns of the Frontier nearby code/);
  await assert.rejects(decodeSignal('CF1z.AAAA'),/incomplete|damaged/);
  await assert.rejects(decodeSignal(await encodeSignal({v:1,k:'offer',room:'bad',sdp:compact})),/does not name a room/);
  const svg=qrSvg(code,'Invite <code>');
  assert.match(svg,/^<svg class="qr-svg"[^>]+aria-label="Invite &lt;code&gt;"/);
  // Rasterize the SVG module grid and confirm the bundled jsQR scanner reads it back.
  const total=Number(/viewBox="0 0 (\d+) \1"/.exec(svg)[1]),scale=4,size=total*scale;
  const rgba=new Uint8ClampedArray(size*size*4).fill(255);
  for(const match of svg.matchAll(/M(\d+) (\d+)h1v1h-1z/g)){
    const mx=Number(match[1])*scale,my=Number(match[2])*scale;
    for(let dy=0;dy<scale;dy++)for(let dx=0;dx<scale;dx++){const i=((my+dy)*size+mx+dx)*4;rgba[i]=rgba[i+1]=rgba[i+2]=17;}
  }
  assert.equal(jsQR(rgba,size,size)?.data,code,'rendered QR SVG must decode back to the exact invite code');
});

test('a browser-hosted nearby room runs a full match for the host and a data-channel guest',async t=>{
  const room=new LocalRoomHost({useWorker:false});
  const host=client(),guest=client();
  t.after(()=>{host.lan.leave();guest.lan.leave();room.teardown();});
  host.lan.useTransport(hostTransport(room));
  host.lan.connect({type:'create',name:'Aria',faction:'alder',options:{mode:'skirmish',map:'highlands',seed:7}});
  await until(()=>host.record.lobbies.length,'host lobby');
  const code=host.record.lobbies.at(-1).code;assert.match(code,/^[A-Z0-9]{6}$/);
  assert.equal(host.lan.session.code,code,'nearby sessions stay in memory for resume');

  const [hostEnd,guestEnd]=channelPair();
  room.addChannel(hostEnd,null,{name:'Bram'});assert.equal(room.peerCount,1);
  guest.lan.useTransport(guestTransport(guestEnd,null));
  guest.lan.connect({type:'join',name:'Bram',faction:'raven',code});
  await until(()=>host.record.lobbies.at(-1)?.canStart,'both commanders in the lobby');
  assert.deepEqual(host.record.lobbies.at(-1).players.map(player=>player.name),['Aria','Bram']);

  host.lan.send({type:'start'});
  await until(()=>host.record.begins.length&&guest.record.begins.length,'match begin on both devices');
  await until(()=>host.record.states.length>1&&guest.record.states.length>1,'snapshots streaming');
  assert.ok(hostEnd.sent>guestEnd.sent,'the host streams snapshots while the guest sends only commands');
  assert.ok(guest.lan.active&&host.lan.active);

  // A lost data channel keeps the guest's session for a resume after re-pairing.
  hostEnd.close();
  await until(()=>guest.record.notices.some(message=>/Lost contact with the nearby host/.test(message)),'guest loss notice');
  assert.equal(guest.lan.session?.code,code);
  await until(()=>host.record.states.at(-1)?.[2]===true,'host match waiting for the guest');

  const [hostAgain,guestAgain]=channelPair();
  room.addChannel(hostAgain,null);
  guest.lan.useTransport(guestTransport(guestAgain,null));
  const resumed=guest.record.begins.length;
  guest.lan.connect({type:'resume',...guest.lan.session});
  await until(()=>guest.record.begins.length>resumed,'guest resumed after re-pairing');
  await until(()=>host.record.states.at(-1)?.[2]===false,'match continues after resume');
});

test('the nearby room refuses a second room and closes guests when the host leaves',async t=>{
  const room=new LocalRoomHost({useWorker:false});
  const host=client(),other=client(),guest=client();
  t.after(()=>{guest.lan.leave();room.teardown();});
  host.lan.useTransport(hostTransport(room));
  host.lan.connect({type:'create',name:'Aria',faction:'alder',options:{mode:'skirmish'}});
  await until(()=>host.record.lobbies.length,'host lobby');
  const code=host.record.lobbies.at(-1).code;
  other.lan.useTransport({kind:'nearby-host',reconnectable:true,open:()=>room.openLoopback()});
  other.lan.connect({type:'create',name:'Extra',faction:'alder',options:{mode:'skirmish'}});
  await until(()=>other.record.notices.some(message=>/match slots are busy/.test(message)),'single-room refusal');
  other.lan.transport=null;other.lan.leaving=true;other.lan.socket?.close();

  const [hostEnd,guestEnd]=channelPair();room.addChannel(hostEnd,null);
  guest.lan.useTransport(guestTransport(guestEnd,null));
  guest.lan.connect({type:'join',name:'Bram',faction:'raven',code});
  await until(()=>guest.record.lobbies.length,'guest lobby');
  host.lan.leave();
  await until(()=>guest.record.closed===1,'guest told the room closed');
  assert.ok(guest.record.notices.some(message=>/host closed this room/i.test(message)));
  assert.equal(guest.lan.transport,null,'leaving a closed nearby room releases its transport');
});


test('custom Nearby battles start with two connected humans and AI kingdoms',async t=>{
  const room=new LocalRoomHost({useWorker:false}),host=client(),guest=client();
  t.after(()=>{host.lan.leave();guest.lan.leave();room.teardown();});
  const slots=battlePreset('2v2');slots[1].controller='human';
  const options=customHostOptions({map:'highlands',seed:512,playerSlot:1,slots});
  host.lan.useTransport(hostTransport(room));
  host.lan.connect({type:'create',name:'Host',faction:'alder',options});
  await until(()=>host.record.lobbies.length,'custom Nearby lobby');
  const lobby=host.record.lobbies.at(-1);
  assert.deepEqual(lobby.slots.map(slot=>slot.controller),['human','human','ai','ai']);
  assert.equal(lobby.canStart,false);
  const [hostEnd,guestEnd]=channelPair();room.addChannel(hostEnd);
  guest.lan.useTransport(guestTransport(guestEnd,null));
  guest.lan.connect({type:'join',name:'Ally',faction:'raven',code:lobby.code,slot:2});
  await until(()=>guest.record.lobbies.length,'guest enters custom lobby');
  guest.lan.send({type:'ready',ready:true});
  await until(()=>host.record.lobbies.at(-1)?.canStart,'human slots ready');
  host.lan.send({type:'start'});
  await until(()=>host.record.begins.length&&guest.record.begins.length,'match starts with AI');
  assert.equal(host.record.begins[0].players.length,4);
  assert.equal(host.record.begins[0].options.slots.filter(slot=>slot.controller==='ai').length,2);
  await until(()=>host.record.states.some(([state])=>state.time>0),'match advances');
});

test('a Nearby host can watch a friend fight an AI kingdom with custom health',async t=>{
  const room=new LocalRoomHost({useWorker:false}),host=client(),guest=client();
  t.after(()=>{host.lan.leave();guest.lan.leave();room.teardown();});
  const slots=battlePreset('2v2');slots[1].controller='human';slots[0].aiHealth=80;
  const options=customHostOptions({map:'highlands',mapSize:'spacious',seed:512,playerSlot:0,spectator:true,slots});
  host.lan.useTransport(hostTransport(room));host.lan.connect({type:'create',name:'Host observer',options});
  await until(()=>host.record.lobbies.length,'spectator lobby');
  const lobby=host.record.lobbies.at(-1);
  assert.equal(lobby.spectator,true);
  const [hostEnd,guestEnd]=channelPair();room.addChannel(hostEnd);
  guest.lan.useTransport(guestTransport(guestEnd,null));guest.lan.connect({type:'join',name:'Friend',code:lobby.code,slot:2});
  await until(()=>guest.record.lobbies.length,'friend joins');
  guest.lan.send({type:'ready',ready:true});
  await until(()=>host.record.lobbies.at(-1)?.canStart,'one friend ready');
  host.lan.send({type:'start'});
  await until(()=>host.record.begins.length&&guest.record.begins.length,'observed Nearby match');
  const watched=host.record.begins[0],played=guest.record.begins[0];
  assert.equal(watched.options.spectator,true);assert.equal(played.options.spectator,false);
  assert.equal(watched.players[0].aiHealth,80);
  assert.equal(host.lan.action('resign',[]),false);
  await until(()=>host.record.states.some(([state])=>state.time>0),'spectator receives ongoing battle');
});
