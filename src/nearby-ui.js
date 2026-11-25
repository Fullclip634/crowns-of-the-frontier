// Offline "Nearby" multiplayer presentation and flow control.
//
// The host's browser runs the room (see local-host.js) and friends pair by
// scanning QR codes (see local-pairing.js). This module owns the lobby invite
// panel, the guest join dialog and their camera/wake-lock lifecycles.
import {LocalRoomHost,hostTransport,guestTransport} from './local-host.js';
import {createInvite,answerInvite} from './local-pairing.js';
import {qrSvg} from './qr-code.js';
import {startQrScanner,cameraAvailable} from './qr-scan.js';

const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const svg=(body,extra='')=>`<svg class="nearby-icon" viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"${extra}>${body}</svg>`;
export const NEARBY_ICONS={
  wifi:svg('<path d="M5 12.55a11 11 0 0 1 14 0"/><path d="M1.42 9a16 16 0 0 1 21.16 0"/><path d="M8.53 16.11a6 6 0 0 1 6.95 0"/><circle cx="12" cy="20" r="1"/>'),
  globe:svg('<circle cx="12" cy="12" r="10"/><path d="M2 12h20"/><path d="M12 2a15.3 15.3 0 0 1 0 20a15.3 15.3 0 0 1 0-20"/>'),
  camera:svg('<path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3z"/><circle cx="12" cy="13" r="3"/>'),
  copy:svg('<rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>'),
  share:svg('<circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><path d="m8.6 13.5 6.8 4M15.4 6.5l-6.8 4"/>'),
  qr:svg('<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><path d="M14 14h3v3h-3zM20 14v.01M14 20h.01M17 20h4v-3"/>'),
};
const spinner='<span class="nearby-spinner" aria-hidden="true"></span>';

export function createNearby({net,showModal,closeModal,toast,getModal,onRoomEnded}){
  let host=null,lastRoom=null,invite={status:'idle'},join=null,stopScanner=null,scanRunId=0,scanActive=false,wakeLock=null,wakeWanted=false;

  // --- Screen wake lock: a sleeping host phone pauses every player's match.
  async function acquireWake(){wakeWanted=true;if(wakeLock||!navigator.wakeLock?.request||document.visibilityState!=='visible')return;try{wakeLock=await navigator.wakeLock.request('screen');wakeLock.addEventListener('release',()=>{wakeLock=null;});}catch{wakeLock=null;}}
  function releaseWake(){wakeWanted=false;const lock=wakeLock;wakeLock=null;lock?.release?.().catch(()=>{});}
  document.addEventListener('visibilitychange',()=>{if(wakeWanted&&document.visibilityState==='visible')acquireWake();});

  function scanStop(){scanRunId++;scanActive=false;const stop=stopScanner;stopScanner=null;try{stop?.();}catch{}}
  const root=()=>document.querySelector('#modal-root');

  // --- Host --------------------------------------------------------------
  function hostRoom(createMessage){
    // Leave any previous room first; leaving a nearby room resets this module.
    if(net.socket||net.transport)net.leave();
    end();
    const room=new LocalRoomHost({onFatal:message=>{if(host!==room)return;toast(message,'warning');net.leave();onRoomEnded();}});
    host=room;
    net.useTransport(hostTransport(room));
    invite={status:'idle'};
    showModal(`<div class="eyebrow">NEARBY · OFFLINE</div><h2>Raising your war room…</h2><p class="modal-intro">This device is becoming the host. No internet connection is needed.</p><div class="nearby-wait">${spinner}<span>Preparing the battlefield</span></div><button class="secondary" data-action="lan-leave">Cancel</button>`,'lan');
    net.connect(createMessage);
    acquireWake();
  }
  const isHosting=()=>!!host&&net.transport?.kind==='nearby-host';
  const isGuest=()=>net.transport?.kind==='nearby-guest';
  function openSlots(room){
    if(!room)return 1;
    if(room.options?.mode==='custom')return room.slots.filter(slot=>slot.controller==='human'&&!room.players.some(player=>player.side===slot.side)).length;
    return Math.max(0,2-room.players.length);
  }
  function inviteMarkup(inMatch){
    const room=lastRoom,free=inMatch?1:openSlots(room);
    const head=`<header class="nearby-head"><span class="nearby-badge">${NEARBY_ICONS.wifi} NEARBY · OFFLINE</span><h3>${inMatch?'Reconnect a nearby commander':'Invite nearby commanders'}</h3></header>`;
    if(invite.status==='preparing')return `${head}<div class="nearby-wait">${spinner}<span>Creating a secure invite…</span></div>`;
    if(invite.status==='connecting')return `${head}<div class="nearby-wait">${spinner}<span>Linking with your friend's device…</span></div>`;
    if(invite.status==='ready'){
      return `${head}<ol class="nearby-steps"><li><b>1</b><span>On your friend's device: <em>Play with friends → Nearby → Join a nearby room</em>, then scan this code.</span></li><li><b>2</b><span>Scan the reply code that appears on their screen.</span></li></ol>
<div class="qr-frame" data-qr="invite">${invite.svg}</div>
<div class="nearby-row"><button class="secondary" data-action="nearby-copy" data-copy="invite">${NEARBY_ICONS.copy} Copy code</button>${navigator.share?`<button class="secondary" data-action="nearby-share" data-copy="invite">${NEARBY_ICONS.share} Share</button>`:''}</div>
${invite.error?`<p class="nearby-error" role="alert">${esc(invite.error)}</p>`:''}
<div class="nearby-camera" ${invite.scanning?'':'hidden'}><video class="nearby-video" autoplay playsinline muted></video><span class="scan-reticle" aria-hidden="true"></span><div class="camera-status" aria-live="polite">${spinner}<span>Starting camera…</span></div></div>
${invite.scanning?'<p class="camera-hint">Point the camera at your friend\'s reply code.</p>':''}
${cameraAvailable()?`<button class="primary full" data-action="nearby-scan-reply">${NEARBY_ICONS.camera} ${invite.scanning?'Stop camera':'Scan your friend\'s reply'}</button>`:''}
<details class="nearby-paste" ${cameraAvailable()?'':'open'}><summary>${cameraAvailable()?'No camera? Paste the reply code':'Paste your friend\'s reply code'}</summary><textarea id="nearby-reply" rows="3" spellcheck="false" autocomplete="off" placeholder="CF1z.…" aria-label="Reply code"></textarea><button class="secondary full" data-action="nearby-accept-paste">Connect</button></details>
<button class="text-button" data-action="nearby-invite-cancel">Cancel this invite</button>`;
    }
    const error=invite.status==='error'?`<p class="nearby-error" role="alert">${esc(invite.error)}</p>`:'';
    if(!free)return `${head}${error}<p class="nearby-note">Every Human slot is filled. Start the battle when everyone is ready.</p>`;
    return `${head}<p class="nearby-note">Friends join without internet. Everyone must be on the same Wi-Fi, or on this phone's hotspot. Keep this screen on while you host.</p>${error}<button class="primary full" data-action="nearby-invite">${NEARBY_ICONS.qr} ${invite.status==='error'?'Create a new invite':inMatch?'Show reconnect invite':'Show invite code'}</button>`;
  }
  function renderInvite(){
    const slot=root()?.querySelector('.nearby-invite');if(!slot)return;
    slot.innerHTML=inviteMarkup(slot.dataset.match==='true');
  }
  // Called after every lobby render. Refreshes keep the panel; full rerenders
  // get it reinserted with its current state.
  function mountLobby(room){
    if(!isHosting()||!room?.host)return;
    lastRoom=room;
    const dialog=root()?.querySelector('.modal');if(!dialog)return;
    let slot=dialog.querySelector('.nearby-invite');
    if(!slot){slot=document.createElement('section');slot.className='nearby-invite nearby-panel';slot.setAttribute('aria-live','polite');const leave=dialog.querySelector('[data-action="lan-leave"]');leave?leave.before(slot):dialog.append(slot);renderInvite();}
    else if(invite.status==='idle'||invite.status==='error')renderInvite();
    const code=dialog.querySelector('#room-code');if(code&&!dialog.querySelector('.nearby-room-note')){code.insertAdjacentHTML('afterend','<p class="nearby-room-note">Hosted on this device · friends scan an invite below instead of typing the code.</p>');}
  }
  function showInviteModal(){
    if(!isHosting())return;
    showModal(`<div class="eyebrow">NEARBY HOST</div><h2>Bring a commander back</h2><p class="modal-intro">A friend who lost connection has two minutes to rejoin their kingdom. Show them an invite and scan their reply.</p><section class="nearby-invite nearby-panel" data-match="true" aria-live="polite"></section><button class="secondary full" data-action="close">Return to battle</button>`,'nearby-invite');
    renderInvite();
  }
  async function newInvite(){
    if(!isHosting()||invite.status==='preparing')return;
    cancelInvite(false);
    invite={status:'preparing'};renderInvite();
    try{
      const code=net.code||lastRoom?.code;
      const pending=await createInvite(code);
      if(!isHosting()){pending.cancel();return;}
      invite={status:'ready',pending,code:pending.code,svg:qrSvg(pending.code,'Nearby invite code')};
    }catch(error){invite={status:'error',error:error.message||'The invite could not be created.'};}
    renderInvite();
  }
  function cancelInvite(render=true){scanStop();invite.pending?.cancel();invite={status:'idle'};if(render)renderInvite();}
  async function acceptReply(text){
    const pending=invite.pending;if(!pending||invite.status!=='ready')return;
    scanStop();
    invite={...invite,status:'connecting',scanning:false,error:''};renderInvite();
    try{
      const link=await pending.accept(text);
      if(!isHosting()){try{link.channel.close();link.pc.close();}catch{}return;}
      host.addChannel(link.channel,link.pc,{name:link.name});
      toast(`${link.name} linked over your nearby network.`);
      invite={status:'idle'};
    }catch(error){
      // A mistyped or wrong code leaves the invite usable; a failed link does not.
      invite=pending.used?{status:'error',error:error.message}:{...invite,status:'ready',error:error.message};
    }
    renderInvite();
  }
  async function scanReply(){
    if(invite.status!=='ready')return;
    if(scanActive||stopScanner){scanStop();invite.scanning=false;renderInvite();return;}
    const runId=++scanRunId;scanActive=true;
    invite.scanning=true;invite.error='';renderInvite();
    const camBox=root()?.querySelector('.nearby-invite .nearby-camera');
    const video=camBox?.querySelector('.nearby-video');
    if(!video){scanStop();invite.scanning=false;renderInvite();return;}
    try{
      const stop=await startQrScanner(video,text=>{if(runId!==scanRunId)return;scanActive=false;stopScanner=null;acceptReply(text);},{onReady:()=>{if(runId===scanRunId)camBox?.classList.add('is-live');}});
      if(runId!==scanRunId||!video.isConnected){try{stop();}catch{}return;}
      stopScanner=stop;
    }catch(error){
      if(runId!==scanRunId)return;
      scanActive=false;invite.scanning=false;invite.error=error.message;renderInvite();
    }
  }

  // --- Guest -------------------------------------------------------------
  function joinMarkup(){
    const head=`<div class="eyebrow">NEARBY · OFFLINE</div><h2>${join.rejoin?'Rejoin the nearby battle':'Join a nearby battle'}</h2>`;
    const error=join.error?`<p class="nearby-error" role="alert">${esc(join.error)}</p>`:'';
    if(join.status==='answering')return `${head}<div class="nearby-panel"><div class="nearby-wait">${spinner}<span>Preparing your reply…</span></div></div><button class="text-button" data-action="nearby-join-cancel">Cancel</button>`;
    if(join.status==='reply')return `${head}<p class="modal-intro">Show this reply to the host. They scan it to let you in.</p><div class="nearby-panel"><ol class="nearby-steps"><li class="done"><b>✓</b><span>Invite scanned</span></li><li><b>2</b><span>Host scans this reply code</span></li></ol><div class="qr-frame">${join.svg}</div><div class="nearby-row"><button class="secondary" data-action="nearby-copy" data-copy="reply">${NEARBY_ICONS.copy} Copy reply</button>${navigator.share?`<button class="secondary" data-action="nearby-share" data-copy="reply">${NEARBY_ICONS.share} Share</button>`:''}</div><div class="nearby-wait">${spinner}<span>Waiting for the host to scan…</span></div></div>${error}<button class="text-button" data-action="nearby-join-cancel">Cancel</button>`;
    return `${head}<p class="modal-intro">Join the host's Wi-Fi or phone hotspot first. Then scan the invite on the host's screen. No internet is needed.</p><div class="nearby-panel">${cameraAvailable()?`<div class="nearby-camera" ${join.scanning?'':'hidden'}><video class="nearby-video" autoplay playsinline muted></video><span class="scan-reticle" aria-hidden="true"></span><div class="camera-status" aria-live="polite">${spinner}<span>Starting camera…</span></div></div>${join.scanning?'<p class="camera-hint">Point the camera at the host\'s invite code.</p>':''}<button class="primary full" data-action="nearby-join-scan">${NEARBY_ICONS.camera} ${join.scanning?'Stop camera':'Scan the host\'s invite'}</button>`:''}<details class="nearby-paste" ${cameraAvailable()?'':'open'}><summary>${cameraAvailable()?'No camera? Paste the invite code':'Paste the host\'s invite code'}</summary><textarea id="nearby-invite-text" rows="3" spellcheck="false" autocomplete="off" placeholder="CF1z.…" aria-label="Invite code"></textarea><button class="secondary full" data-action="nearby-join-paste">Continue</button></details></div>${error}<button class="text-button" data-action="nearby-join-cancel">Cancel</button>`;
  }
  function renderJoin(){if(getModal()!=='nearby-join'){showModal(joinMarkup(),'nearby-join');}else{const dialog=root()?.querySelector('.modal');if(!dialog)return;const close=dialog.querySelector('.modal-close');dialog.innerHTML='';if(close)dialog.append(close);dialog.insertAdjacentHTML('beforeend',joinMarkup());const heading=dialog.querySelector('h2');if(heading){heading.id='dialog-heading';dialog.setAttribute('aria-labelledby',heading.id);}}}
  function showJoin(profile,{rejoin=false}={}){
    scanStop();join?.pending?.cancel();
    // A fresh join leaves any other room; a rejoin keeps the nearby session.
    if(!rejoin&&(net.socket||net.transport))net.leave();
    join={status:'scan',profile:profile||join?.profile||{name:'Commander',faction:'raven',slot:0},rejoin};
    renderJoin();
    if(cameraAvailable())scanInvite();
  }
  async function scanInvite(){
    if(!join||join.status!=='scan')return;
    if(scanActive||stopScanner){scanStop();join.scanning=false;renderJoin();return;}
    const runId=++scanRunId;scanActive=true;
    join.scanning=true;join.error='';renderJoin();
    const camBox=root()?.querySelector('.nearby-camera');
    const video=camBox?.querySelector('.nearby-video');
    if(!video){scanStop();join.scanning=false;renderJoin();return;}
    try{
      const stop=await startQrScanner(video,text=>{if(runId!==scanRunId)return;scanActive=false;stopScanner=null;answer(text);},{onReady:()=>{if(runId===scanRunId)camBox?.classList.add('is-live');}});
      if(runId!==scanRunId||!video.isConnected){try{stop();}catch{}return;}
      stopScanner=stop;
    }catch(error){
      if(runId!==scanRunId)return;
      scanActive=false;if(join){join.scanning=false;join.error=error.message;renderJoin();}
    }
  }
  async function answer(text){
    if(!join)return;scanStop();
    const current=join;current.status='answering';current.scanning=false;current.error='';renderJoin();
    try{
      const pending=await answerInvite(text,{name:current.profile.name});
      if(join!==current){pending.cancel();return;}
      Object.assign(current,{status:'reply',pending,code:pending.code,svg:qrSvg(pending.code,'Nearby reply code')});renderJoin();
      const channel=await pending.connected;
      if(join!==current){try{channel.close();pending.pc.close();}catch{}return;}
      join=null;
      net.useTransport(guestTransport(channel,pending.pc));
      const resume=net.session&&net.session.code===pending.room;
      showModal(`<div class="eyebrow">NEARBY · OFFLINE</div><h2>${resume?'Rejoining your kingdom…':'Entering the war room…'}</h2><div class="nearby-wait">${spinner}<span>Linked with the host. Exchanging orders…</span></div><button class="secondary" data-action="lan-leave">Cancel</button>`,'lan');
      const {name,faction,slot}=current.profile;
      net.connect(resume?{type:'resume',...net.session}:{type:'join',name,faction,code:pending.room,slot});
      acquireWake();
    }catch(error){
      if(join!==current)return;
      current.pending?.cancel();Object.assign(current,{status:'scan',pending:null,error:error.message||'The invite could not be used.'});renderJoin();
    }
  }
  function cancelJoin(){scanStop();join?.pending?.cancel();join=null;closeModal();}

  // --- Shared ------------------------------------------------------------
  async function copyCode(which,share=false){
    const text=which==='reply'?join?.code:invite.code;if(!text)return;
    try{
      if(share&&navigator.share){await navigator.share({title:'Crowns of the Frontier',text});return;}
      await navigator.clipboard.writeText(text);toast('Code copied. Send it to the other device.');
    }catch(error){if(error?.name!=='AbortError')toast('Copy is unavailable here. Use the QR code instead.','warning');}
  }
  // Leave/close cleanup. Called when the nearby session ends for any reason.
  function end(){scanStop();invite.pending?.cancel();invite={status:'idle'};join?.pending?.cancel();join=null;host=null;lastRoom=null;releaseWake();}
  function modalClosed(kind){scanStop();invite.scanning=false;if(join){join.scanning=false;if(kind==='nearby-join'){join.pending?.cancel();join=null;}}}
  function handleAction(name,target){
    switch(name){
      case 'nearby-invite':newInvite();return true;
      case 'nearby-invite-cancel':cancelInvite();return true;
      case 'nearby-scan-reply':scanReply();return true;
      case 'nearby-accept-paste':{const text=root()?.querySelector('#nearby-reply')?.value||'';if(text.trim())acceptReply(text);return true;}
      case 'nearby-invite-modal':showInviteModal();return true;
      case 'nearby-join-scan':scanInvite();return true;
      case 'nearby-join-paste':{const text=root()?.querySelector('#nearby-invite-text')?.value||'';if(text.trim())answer(text);return true;}
      case 'nearby-join-cancel':cancelJoin();return true;
      case 'nearby-copy':copyCode(target?.dataset.copy,false);return true;
      case 'nearby-share':copyCode(target?.dataset.copy,true);return true;
    }
    return false;
  }
  return {hostRoom,showJoin,mountLobby,showInviteModal,handleAction,end,modalClosed,isHosting,isGuest};
}
