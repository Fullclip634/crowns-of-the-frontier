export function registerOfflineGame(runtime=globalThis){
  if(!runtime.navigator?.serviceWorker)return false;
  const install=()=>runtime.navigator.serviceWorker.register('/sw.js').catch(()=>null);
  // Artwork decoding may finish after load. In that case waiting for another
  // load event would leave this page permanently without an offline cache.
  if(runtime.document.readyState==='complete')install();
  else runtime.window.addEventListener('load',install,{once:true});
  return true;
}
