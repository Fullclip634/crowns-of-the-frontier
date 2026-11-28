import {handleWorkerMessage} from './sim-worker-protocol.js';

let session=null;
const post=(message,transfer)=>{
  if(transfer&&transfer.length)self.postMessage(message,transfer);
  else self.postMessage(message);
};

self.addEventListener('message',event=>{
  try{
    session=handleWorkerMessage(session,event.data,post);
  }catch(error){
    post({type:'error',message:error?.message||String(error)});
  }
});

post({type:'ready'});
