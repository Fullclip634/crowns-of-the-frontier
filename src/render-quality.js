// Shadow-map presence changes the material program, not just a light uniform.
// Three.js requires needsUpdate when this feature is toggled after a render.
export function setShadowEnabled(view,enabled){
  const shadows=view.renderer.shadowMap;
  if(shadows.enabled===enabled)return false;
  shadows.enabled=enabled;shadows.needsUpdate=true;
  const materials=new Set();
  const collect=value=>{if(Array.isArray(value))for(const material of value)collect(material);else if(value?.isMaterial)materials.add(value);};
  for(const value of Object.values(view.materials||{}))collect(value);
  collect(view.teamMaterials);collect(view.roofMaterials);
  view.scene?.traverse(object=>collect(object.material));
  for(const material of materials)material.needsUpdate=true;
  return true;
}

export function applyRendererQuality(view,quality){
  view.dynamicScale=1;setShadowEnabled(view,quality!=='low');
  const size=quality==='high'?2048:1024,shadow=view.sun.shadow;
  if(shadow.map&&(quality==='low'||shadow.mapSize.x!==size)){shadow.map.dispose();shadow.map=null;}
  if(shadow.mapSize.x!==size)shadow.mapSize.set(size,size);
  view.renderer.setPixelRatio(Math.min(globalThis.devicePixelRatio||1,quality==='high'?2:quality==='low'?1:1.25));
  view.performanceClock=0;view.frameAverage=.016;view.renderQuality=quality;view.updateCamera?.();
}

// Decode the replacement art before allocating larger rendering targets.
// A later selection owns the transition even if an earlier load finishes last.
export async function transitionRendererQuality(view,quality,prepare,rebuild){
  const request=view.graphicsRequest=(view.graphicsRequest||0)+1;view.graphicsLoading=quality;
  try{
    await prepare();
    if(request!==view.graphicsRequest||view.settings.quality!==quality||!view.sim)return false;
    rebuild();applyRendererQuality(view,quality);return true;
  }finally{if(request===view.graphicsRequest)view.graphicsLoading=null;}
}
