import {CHAT_LENGTH,CHAT_HISTORY,CHAT_BURST,CHAT_WINDOW,cleanChatText} from '../src/chat-protocol.js';

// Room-owned, bounded memory only. No database, disk log or simulation state.
export class BattleChat {
  constructor(){this.messages=[];this.sequence=0;this.rates=new WeakMap();}
  team(room,side){return room.sim.players[side]?.team??side;}
  allowed(room,side,message){return message.channel==='all'||message.team===this.team(room,side);}
  packet(message){const {team,...publicMessage}=message;return publicMessage;}
  session(room,player){return {selfSide:player.side,messages:this.messages.filter(message=>this.allowed(room,player.side,message)).map(message=>this.packet(message))};}
  accept(room,player,input,now=Date.now()){
    if(!['all','team'].includes(input.channel))return {error:'Choose All or Team.'};
    const text=cleanChatText(input.text);
    if(!text)return {error:'Write a message first.'};
    if(Array.from(text).length>CHAT_LENGTH)return {error:`Keep messages within ${CHAT_LENGTH} characters.`};
    const requestId=typeof input.requestId==='string'&&/^[a-z0-9-]{1,64}$/i.test(input.requestId)?input.requestId:null;
    const existing=requestId&&this.messages.find(message=>message.senderSide===player.side&&message.requestId===requestId);
    if(existing)return existing.text===text&&existing.channel===input.channel?{message:existing,duplicate:true}:{error:'That message identifier has already been used.'};
    const recent=(this.rates.get(player)||[]).filter(stamp=>now-stamp<CHAT_WINDOW);
    if(recent.length>=CHAT_BURST)return {error:'Please wait a few seconds before sending more messages.'};
    recent.push(now);this.rates.set(player,recent);
    const message={id:++this.sequence,channel:input.channel,senderSide:player.side,senderName:Array.from(cleanChatText(player.name)).slice(0,24).join('')||'Commander',text,sentAt:now,team:this.team(room,player.side),requestId};
    this.messages.push(message);if(this.messages.length>CHAT_HISTORY)this.messages.shift();
    return {message};
  }
}
