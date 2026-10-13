const qualities=new Set(['high','medium','low']);

export function graphicsSelection(settings){return settings.autoQuality===false&&qualities.has(settings.quality)?settings.quality:'auto';}

export function applyGraphicsChoice(settings,choice,recommended='medium'){
  settings.autoQuality=choice==='auto';
  settings.quality=qualities.has(choice)?choice:qualities.has(recommended)?recommended:'medium';
  return settings.quality;
}
