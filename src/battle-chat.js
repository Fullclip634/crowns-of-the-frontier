import {CHAT_LENGTH,CHAT_HISTORY,cleanChatText} from './chat-protocol.js';
import {uiIcon} from './ui-icons.js';
import './battle-chat.css';

export function battleChatMarkup(){return `<button id="chat-toggle" type="button" hidden aria-label="Open battle chat" aria-controls="battle-chat" aria-expanded="false">${uiIcon('message-square')}<span>Chat</span><span id="chat-unread" hidden></span></button>
  <section id="battle-chat" hidden aria-label="Battle chat"><header><strong>Battle chat</strong><button id="chat-close" type="button" aria-label="Close battle chat">${uiIcon('x')}</button></header>
  <div id="chat-messages" role="log" aria-label="Battle messages" aria-live="polite" aria-relevant="additions"></div>
  <form id="chat-form"><label class="chat-sr" for="chat-channel">Message audience</label><select id="chat-channel"><option value="all">All</option><option value="team">Team</option></select><label class="chat-sr" for="chat-input">Message</label><input id="chat-input" type="text" maxlength="${CHAT_LENGTH}" placeholder="Write a message…" autocomplete="off" enterkeyhint="send"><button id="chat-send" type="submit">Send</button></form>
  <p id="chat-status" role="status">All: everyone in this battle.</p></section>`;}

export class BattleChatPanel {
  constructor(root,{send,onOpen=()=>{}}){
    this.root=root;this.send=send;this.onOpen=onOpen;this.panel=root.querySelector('#battle-chat');this.toggle=root.querySelector('#chat-toggle');this.input=root.querySelector('#chat-input');this.channel=root.querySelector('#chat-channel');this.log=root.querySelector('#chat-messages');this.status=root.querySelector('#chat-status');this.submit=root.querySelector('#chat-send');this.ids=new Set();this.unread=0;this.connected=false;this.room=null;this.pending=null;
    this.toggle.addEventListener('click',()=>this.open());root.querySelector('#chat-close').addEventListener('click',()=>this.close());
    root.querySelector('#chat-form').addEventListener('submit',event=>{event.preventDefault();this.post();});
    this.channel.addEventListener('change',()=>this.hint());
    this.panel.addEventListener('keydown',event=>{event.stopPropagation();if(event.key==='Escape'){event.preventDefault();this.close();}else if(event.key==='Enter'&&event.target===this.input&&!event.isComposing&&event.keyCode!==229){event.preventDefault();this.post();}});
    this.input.addEventListener('focus',()=>{this.onOpen();this.layout();});this.input.addEventListener('blur',()=>this.layout());
    window.visualViewport?.addEventListener('resize',()=>this.layout());window.visualViewport?.addEventListener('scroll',()=>this.layout());window.addEventListener('resize',()=>this.layout());
  }
  get opened(){return !this.panel.hidden;}
  reset(){clearTimeout(this.pendingTimer);this.pending=null;this.room=null;this.connected=false;this.ids.clear();this.log.replaceChildren();this.input.value='';this.channel.value='all';this.unread=0;this.close(false);this.toggle.hidden=true;this.refresh();}
  session(code,{selfSide,messages=[]}){
    if(this.room!==code)this.reset();this.room=code;this.selfSide=selfSide;this.toggle.hidden=false;this.connection(true);for(const message of messages)this.receive(message,true);
  }
  connection(connected){this.connected=connected;if(!connected){clearTimeout(this.pendingTimer);if(this.pending)this.pending.awaiting=false;}this.refresh();this.hint();}
  hint(){this.status.textContent=this.connected?(this.channel.value==='team'?'Team: only human allies in this battle.':'All: everyone in this battle.'):'Disconnected. Reconnect to send; your draft stays here.';}
  refresh(){this.submit.disabled=!this.connected||!!this.pending?.awaiting;const badge=this.root.querySelector('#chat-unread');badge.hidden=!this.unread;badge.textContent=this.unread>99?'99+':String(this.unread);this.toggle.setAttribute('aria-label',this.unread?`Open battle chat, ${this.unread} unread messages`:'Open battle chat');}
  open(focus=!matchMedia('(pointer:coarse)').matches){if(!this.room)return;this.onOpen();this.panel.hidden=false;this.toggle.hidden=true;this.toggle.setAttribute('aria-expanded','true');this.root.classList.add('chat-open');this.unread=0;this.refresh();this.layout();this.log.scrollTop=this.log.scrollHeight;if(focus)this.input.focus({preventScroll:true});}
  close(focus=true){const wasOpen=this.opened;this.panel.hidden=true;this.toggle.hidden=!this.room;this.toggle.setAttribute('aria-expanded','false');this.root.classList.remove('chat-open');if(this.panel.contains(document.activeElement))document.activeElement.blur();if(focus&&wasOpen)this.toggle.focus({preventScroll:true});}
  layout(){
    if(!this.opened)return;const viewport=window.visualViewport,height=viewport?.height||innerHeight,offset=viewport?.offsetTop||0,inset=Math.max(0,innerHeight-height-offset),keyboard=document.activeElement===this.input&&inset>80;
    this.panel.style.setProperty('--chat-bottom',keyboard?`${inset+8}px`:'');this.panel.style.setProperty('--chat-height',`${Math.max(96,height-(keyboard?16:124))}px`);
  }
  post(){
    if(!this.connected||this.pending?.awaiting)return;const text=cleanChatText(this.input.value);if(!text)return;
    const channel=this.channel.value,requestId=this.pending?.text===text&&this.pending.channel===channel?this.pending.requestId:`${Date.now().toString(36)}-${Math.random().toString(36).slice(2,10)}`,draft=this.input.value;
    if(!this.send(text,this.channel.value,requestId)){this.connection(false);return;}
    this.pending={requestId,draft,text,channel,awaiting:true};this.refresh();this.status.textContent='Sending…';
    this.pendingTimer=setTimeout(()=>{if(this.pending?.requestId!==requestId)return;this.pending.awaiting=false;this.refresh();this.status.textContent='Waiting for confirmation. Your draft is here; Send safely retries.';},5000);
  }
  error(message){clearTimeout(this.pendingTimer);this.pending=null;this.refresh();this.status.textContent=message;}
  receive(message,history=false){
    if(!message||!Number.isSafeInteger(message.id)||!['all','team'].includes(message.channel)||typeof message.text!=='string')return;
    if(this.pending&&message.senderSide===this.selfSide&&message.requestId===this.pending.requestId){if(this.input.value===this.pending.draft)this.input.value='';clearTimeout(this.pendingTimer);this.pending=null;this.refresh();this.hint();}
    if(this.ids.has(message.id))return;
    this.ids.add(message.id);const nearBottom=this.log.scrollHeight-this.log.scrollTop-this.log.clientHeight<32,row=document.createElement('p'),meta=document.createElement('span'),body=document.createElement('span');row.className=message.channel==='team'?'chat-message team':'chat-message';row.dataset.messageId=String(message.id);
    meta.className='chat-meta';meta.textContent=`${message.channel==='team'?'[Team] ':''}${message.senderName}${message.senderSide===this.selfSide?' (you)':''} · ${new Date(message.sentAt).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'})}`;body.textContent=message.text;row.append(meta,body);this.log.append(row);
    while(this.log.children.length>CHAT_HISTORY){this.ids.delete(Number(this.log.firstChild.dataset.messageId));this.log.firstChild.remove();}
    if(this.opened&&nearBottom)this.log.scrollTop=this.log.scrollHeight;else if(!history&&!this.opened&&message.senderSide!==this.selfSide){this.unread++;this.refresh();}
  }
}
