// Serverless WebRTC pairing for offline "Nearby" matches.
//
// With no internet there is no signaling server, so the two session
// descriptions travel between devices as QR codes (or copy/paste text):
//   1. The host creates an offer and shows it as an invite.
//   2. The guest scans it, creates an answer and shows it as a reply.
//   3. The host scans the reply and a direct data channel opens over the
//      shared Wi-Fi or phone hotspot.
// Devices on one local network reach each other through host ICE candidates,
// so no STUN/TURN servers are needed (and none could be reached offline).
import {deflateSync,inflateSync} from 'three/addons/libs/fflate.module.js';

const PREFIX='CF1',GATHER_TIMEOUT=5000;
// JSON can escape each of the 12,000 SDP characters as six bytes.
const MAX_SIGNAL_BYTES=80*1024;
export const PAIRING_TIMEOUT=180000;

const toBase64Url=bytes=>{let binary='';for(let i=0;i<bytes.length;i+=0x8000)binary+=String.fromCharCode(...bytes.subarray(i,i+0x8000));return btoa(binary).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');};
const fromBase64Url=text=>{const binary=atob(text.replace(/-/g,'+').replace(/_/g,'/')+'==='.slice((text.length+3)%4));const bytes=new Uint8Array(binary.length);for(let i=0;i<binary.length;i++)bytes[i]=binary.charCodeAt(i);return bytes;};

// TCP candidates never help on a local network and only enlarge the QR code.
export function compactSdp(sdp){
  let candidates=0;
  return String(sdp).split(/\r?\n/).filter(line=>{
    if(!line)return false;
    if(line.startsWith('a=candidate:')){if(/ tcp /i.test(line))return false;return ++candidates<=8;}
    return true;
  }).join('\r\n')+'\r\n';
}

export async function encodeSignal(signal){
  const bytes=new TextEncoder().encode(JSON.stringify(signal));
  const compressed=deflateSync(bytes);
  if(compressed.length<bytes.length)return `${PREFIX}z.${toBase64Url(compressed)}`;
  return `${PREFIX}j.${toBase64Url(bytes)}`;
}

export async function decodeSignal(text){
  const value=String(text||'').trim().replace(/\s+/g,'');
  const match=/^CF1([zj])\.([A-Za-z0-9_-]+)$/.exec(value);
  if(!match)throw new Error('That is not a Crowns of the Frontier nearby code.');
  if(match[2].length>Math.ceil(MAX_SIGNAL_BYTES*4/3))throw new Error('That nearby code is too large. Create a fresh code.');
  let bytes;try{bytes=fromBase64Url(match[2]);}catch{throw new Error('That nearby code is incomplete. Copy or scan it again.');}
  if(match[1]==='z'){
    // Use the shipped codec on iOS 15 and browsers without raw deflate streams.
    try{bytes=inflateSync(bytes,{out:new Uint8Array(MAX_SIGNAL_BYTES+1)});}catch{throw new Error('That nearby code is incomplete. Copy or scan it again.');}
    if(bytes.length>MAX_SIGNAL_BYTES)throw new Error('That nearby code is too large. Create a fresh code.');
  }
  let signal;try{signal=JSON.parse(new TextDecoder().decode(bytes));}catch{throw new Error('That nearby code is damaged. Copy or scan it again.');}
  if(!signal||signal.v!==1||!['offer','answer'].includes(signal.k)||typeof signal.sdp!=='string'||signal.sdp.length>12000)throw new Error('That nearby code is from an incompatible version of the game.');
  if(signal.k==='offer'&&!/^[A-Z0-9]{6}$/.test(String(signal.room||'')))throw new Error('That invite does not name a room.');
  return signal;
}

function waitForCandidates(pc,timeout=GATHER_TIMEOUT){
  if(pc.iceGatheringState==='complete')return Promise.resolve();
  return new Promise(resolve=>{
    let settle=0;
    const done=()=>{clearTimeout(timer);clearTimeout(settle);pc.removeEventListener('icegatheringstatechange',check);pc.removeEventListener('icecandidate',candidate);resolve();};
    const check=()=>{if(pc.iceGatheringState==='complete')done();};
    const candidate=event=>{if(!event.candidate){done();return;}if(/ udp /i.test(event.candidate.candidate)){clearTimeout(settle);settle=setTimeout(done,350);}};
    const timer=setTimeout(done,timeout);
    pc.addEventListener('icegatheringstatechange',check);pc.addEventListener('icecandidate',candidate);
  });
}

const NETWORK_HELP='Check that both devices are on the same Wi-Fi or phone hotspot. Some public or guest networks block devices from reaching each other; a phone hotspot is the most reliable choice.';
function localDescription(pc){
  const sdp=compactSdp(pc.localDescription?.sdp||'');
  if(!/a=candidate:/.test(sdp))throw new Error(`No local network was found. Turn on Wi-Fi or a phone hotspot and try again. ${NETWORK_HELP}`);
  return sdp;
}

export function channelOpen(channel,pc,timeout=30000){
  if(channel.readyState==='open')return Promise.resolve(channel);
  return new Promise((resolve,reject)=>{
    const cleanup=()=>{clearTimeout(timer);channel.removeEventListener('open',opened);channel.removeEventListener('close',failed);pc.removeEventListener('connectionstatechange',state);};
    const opened=()=>{cleanup();resolve(channel);};
    const failed=()=>{cleanup();reject(new Error(`The devices could not connect. ${NETWORK_HELP}`));};
    const state=()=>{if(['failed','closed'].includes(pc.connectionState))failed();};
    const timer=setTimeout(failed,timeout);
    channel.addEventListener('open',opened);channel.addEventListener('close',failed);pc.addEventListener('connectionstatechange',state);
  });
}

function requireWebRtc(){if(typeof RTCPeerConnection!=='function')throw new Error('This browser cannot make direct device connections. Use a current version of Chrome, Edge, Safari or Firefox.');}
const peer=()=>new RTCPeerConnection({iceServers:[]});

// Host side: one invite admits one guest.
export async function createInvite(room){
  requireWebRtc();
  const pc=peer(),channel=pc.createDataChannel('crowns-frontier',{ordered:true});
  try{
    await pc.setLocalDescription(await pc.createOffer());
    await waitForCandidates(pc);
    const code=await encodeSignal({v:1,k:'offer',room,sdp:localDescription(pc)});
    let settled=false;
    return {code,
      get used(){return settled;},
      async accept(text){
        if(settled)throw new Error('This invite has already been used. Create a new invite.');
        const signal=await decodeSignal(text);
        if(signal.k!=='answer')throw new Error('Scan the reply shown on your friend\'s screen, not your own invite.');
        settled=true;
        await pc.setRemoteDescription({type:'answer',sdp:signal.sdp});
        await channelOpen(channel,pc,30000);
        return {channel,pc,name:String(signal.name||'Commander').slice(0,24)};
      },
      cancel(){if(channel.readyState!=='open'){try{pc.close();}catch{}}}};
  }catch(error){try{pc.close();}catch{}throw error;}
}

// Guest side: answer a scanned invite and wait for the host to scan the reply.
export async function answerInvite(text,{name='Commander'}={}){
  requireWebRtc();
  const signal=await decodeSignal(text);
  if(signal.k!=='offer')throw new Error('Scan the invite on the host\'s screen, not a reply code.');
  const pc=peer();
  try{
    const incoming=new Promise(resolve=>pc.addEventListener('datachannel',event=>resolve(event.channel),{once:true}));
    await pc.setRemoteDescription({type:'offer',sdp:signal.sdp});
    await pc.setLocalDescription(await pc.createAnswer());
    await waitForCandidates(pc);
    const code=await encodeSignal({v:1,k:'answer',sdp:localDescription(pc),name:String(name).slice(0,24)});
    let timer;
    const connected=Promise.race([
      incoming.then(channel=>channelOpen(channel,pc,PAIRING_TIMEOUT)),
      new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error(`The host did not finish connecting. ${NETWORK_HELP}`)),PAIRING_TIMEOUT);}),
      new Promise((_,reject)=>pc.addEventListener('connectionstatechange',()=>{if(pc.connectionState==='failed')reject(new Error(`The devices could not connect. ${NETWORK_HELP}`));}))
    ]).finally(()=>clearTimeout(timer));
    connected.catch(()=>{try{pc.close();}catch{}});
    return {code,room:signal.room,pc,connected,cancel(){try{pc.close();}catch{}}};
  }catch(error){try{pc.close();}catch{}throw error;}
}
