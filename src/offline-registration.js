export function registerOfflineGame(runtime=globalThis){
  if(!runtime.navigator?.serviceWorker)return false;
  const install=()=>runtime.navigator.serviceWorker.register('/sw.js').catch(()=>null);
  // Artwork decoding may finish after load. In that case waiting for another
  // load event would leave this page permanently without an offline cache.
  if(runtime.document.readyState==='complete')install();
  else runtime.window.addEventListener('load',install,{once:true});
  return true;
}

export async function loadStartupGraphics(quality, urls, load, runtime=globalThis){
  if(quality==='low'){await load(quality);return quality;}

  // Only a controlling service worker can deliver the cached game assets.
  const cached=async url=>{
    if(!url||!runtime.navigator?.serviceWorker?.controller)return false;
    try{return !!await runtime.caches?.match(url);}catch{return false;}
  };
  const cachedLow=async()=>await cached(urls.low)&&await cached(urls.trees);
  if(runtime.navigator?.onLine===false&&!await cached(urls[quality])&&await cachedLow()){
    await load('low');
    return 'low';
  }
  try{
    await load(quality);
    return quality;
  }catch(error){
    // A hotspot may have a network link even when it cannot reach the site.
    if(!await cachedLow())throw error;
    await load('low');
    return 'low';
  }
}
