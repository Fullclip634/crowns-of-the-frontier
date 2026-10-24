// Safari can deliver native gesture events in addition to pointer events.
// Cancel browser zoom while a match is open, including gestures over the HUD.
export function installBattleZoomGuard(target,isPlaying){
  const options={capture:true,passive:false},listeners=[];
  const on=(name,handler)=>{target.addEventListener(name,handler,options);listeners.push([name,handler]);};
  const cancel=event=>{if(isPlaying()&&event.cancelable)event.preventDefault();};
  for(const name of ['gesturestart','gesturechange','gestureend'])on(name,cancel);
  for(const name of ['touchstart','touchmove'])on(name,event=>{if(event.touches?.length>1)cancel(event);});
  on('wheel',event=>{if(event.ctrlKey)cancel(event);});
  on('keydown',event=>{if((event.ctrlKey||event.metaKey)&&['+','=','-','0'].includes(event.key))cancel(event);});
  return ()=>{for(const [name,handler]of listeners)target.removeEventListener(name,handler,options);};
}
