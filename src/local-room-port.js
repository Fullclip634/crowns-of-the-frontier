import {createRoomCore} from './room-core.js';

// Runs one offline "Nearby" room authority. Used inside the dedicated room
// Worker and, when module Workers are unavailable, directly on the page.
//
// Page -> room: {type:'open',id} {type:'message',id,text} {type:'closed',id}
//               {type:'buffer',id,amount} {type:'shutdown'}
// Room -> page: {type:'send',id,text} {type:'close',id,code,reason}
export function createRoomPort(post,{tickInterval=100}={}){
  // A phone hosts one match at a time; a second create is refused cleanly.
  const core=createRoomCore({maxRooms:1,tickInterval}),links=new Map();
  function finish(id){const entry=links.get(id);if(!entry)return;links.delete(id);entry.socket.readyState=3;entry.link.close();}
  function open(id){
    if(links.has(id))return;
    const socket={readyState:1,bufferedAmount:0,alive:true,
      send(text){if(this.readyState===1)post({type:'send',id,text});},
      // Mirror WebSocket semantics: the close notification is asynchronous.
      close(code=1000,reason=''){if(this.readyState!==1)return;this.readyState=2;post({type:'close',id,code,reason});queueMicrotask(()=>finish(id));},
      terminate(){this.close(1006,'Connection terminated');}};
    links.set(id,{socket,link:core.connect(socket)});
  }
  return function receive(data){
    if(!data||typeof data!=='object')return;
    if(data.type==='open')open(data.id);
    else if(data.type==='message'){const entry=links.get(data.id);if(entry&&entry.socket.readyState===1&&typeof data.text==='string')entry.link.message(data.text);}
    else if(data.type==='closed')finish(data.id);
    else if(data.type==='buffer'){const entry=links.get(data.id);if(entry)entry.socket.bufferedAmount=Math.max(0,Number(data.amount)||0);}
    else if(data.type==='shutdown'){for(const id of [...links.keys()])finish(id);core.close();}
  };
}
