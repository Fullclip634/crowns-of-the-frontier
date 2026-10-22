const qualities=new Set(['high','medium','low']);

export function rendererStatus({requested='webgpu',active='webgl',secure=true}){
  if(active==='webgpu')return 'WebGPU is active.';
  if(requested==='webgpu')return secure?'WebGPU could not start on this device. Compatible graphics (WebGL 2) is active.':'This address cannot use WebGPU. Open the deployed HTTPS address to try it. Compatible graphics (WebGL 2) is active.';
  return 'Compatible graphics (WebGL 2) is active.';
}

export function graphicsSelection(settings){return settings.autoQuality===false&&qualities.has(settings.quality)?settings.quality:'auto';}

export function applyGraphicsChoice(settings,choice,recommended='medium'){
  settings.autoQuality=choice==='auto';
  settings.quality=qualities.has(choice)?choice:qualities.has(recommended)?recommended:'medium';
  return settings.quality;
}
