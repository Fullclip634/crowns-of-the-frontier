// Safari can deliver native gesture events in addition to pointer events.
// Cancel browser zoom while a match is open, including gestures over the HUD.
export function installBattleZoomGuard(target,isPlaying,{onDoubleTap=()=>{}}={}){
  const options={capture:true,passive:false},listeners=[];
  let tap=null,lastTap=null;
  const on=(name,handler)=>{target.addEventListener(name,handler,options);listeners.push([name,handler]);};
  const cancel=event=>{if(isPlaying()&&event.cancelable)event.preventDefault();};
  for(const name of ['gesturestart','gesturechange','gestureend'])on(name,cancel);
  on('touchstart',event=>{
    if(!isPlaying()){tap=lastTap=null;return;}
    if(event.touches?.length!==1){tap=lastTap=null;cancel(event);return;}
    const touch=event.touches[0];
    tap={id:touch.identifier,x:touch.clientX,y:touch.clientY,at:event.timeStamp,startedAt:performance.now()};
  });
  on('touchmove',event=>{
    if(event.touches?.length>1){tap=lastTap=null;cancel(event);return;}
    const touch=event.touches?.[0];
    if(tap&&touch&&Math.hypot(touch.clientX-tap.x,touch.clientY-tap.y)>12)tap=lastTap=null;
  });
  on('touchcancel',()=>{tap=lastTap=null;});
  on('touchend',event=>{
    const start=tap;tap=null;
    const touch=Array.from(event.changedTouches||[]).find(t=>t.identifier===start?.id);
    if(!isPlaying()||!start||!touch||event.touches?.length||event.timeStamp-start.at>350||Math.hypot(touch.clientX-start.x,touch.clientY-start.y)>12){lastTap=null;return;}
    // Retain native text focus, editing, selects and their accessibility actions.
    if(event.target?.closest?.('input,textarea,select,[contenteditable]:not([contenteditable="false"])')){lastTap=null;return;}
    const previous=lastTap;lastTap={at:event.timeStamp,x:touch.clientX,y:touch.clientY};
    if(previous&&event.timeStamp-previous.at<=320&&Math.hypot(touch.clientX-previous.x,touch.clientY-previous.y)<=32&&event.cancelable){
      // Older iOS versions can ignore manipulation for smart/double-tap zoom.
      // Only cancel the second completed tap; the caller preserves its action.
      event.preventDefault();onDoubleTap(event,{startedAt:start.startedAt});
    }
  });
  on('wheel',event=>{if(event.ctrlKey)cancel(event);});
  on('keydown',event=>{if((event.ctrlKey||event.metaKey)&&['+','=','-','0'].includes(event.key))cancel(event);});
  return ()=>{for(const [name,handler]of listeners)target.removeEventListener(name,handler,options);};
}
