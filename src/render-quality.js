import {prepareScenePrograms} from './shader-preparation.js';

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

function configureShadows(view,quality){
  setShadowEnabled(view,quality!=='low');
  const size=quality==='high'?2048:1024,shadow=view.sun.shadow;
  if(shadow.map&&(quality==='low'||shadow.mapSize.x!==size)){shadow.map.dispose();shadow.map=null;}
  if(shadow.mapSize.x!==size)shadow.mapSize.set(size,size);
}

const qualityRank={low:0,medium:1,high:2};
const pixelLimit=quality=>Math.min(globalThis.devicePixelRatio||1,quality==='high'?2:quality==='low'?1:1.25);
function rendererTargets(view){return {ratio:view.renderer.getPixelRatio?.()??pixelLimit(view.renderQuality)*(view.dynamicScale??1),shadows:view.renderer.shadowMap.enabled,width:view.sun.shadow.mapSize.x,height:view.sun.shadow.mapSize.y};}
function shrinkRendererTargets(view,quality,previous){
  const ratio=Math.min(previous.ratio,pixelLimit(quality));if(ratio<previous.ratio)view.renderer.setPixelRatio(ratio);
  if(quality==='low')setShadowEnabled(view,false);
  const shadow=view.sun.shadow,size=quality==='high'?2048:1024;
  if(shadow.map&&(quality==='low'||shadow.mapSize.x>size)){shadow.map.dispose();shadow.map=null;}
  if(shadow.mapSize.x>size)shadow.mapSize.set(size,size);
}
function restoreRendererTargets(view,previous){
  setShadowEnabled(view,previous.shadows);const shadow=view.sun.shadow;
  if(shadow.map&&(shadow.mapSize.x!==previous.width||shadow.mapSize.y!==previous.height)){shadow.map.dispose();shadow.map=null;}
  shadow.mapSize.set(previous.width,previous.height);if(view.renderer.getPixelRatio?.()!==previous.ratio)view.renderer.setPixelRatio(previous.ratio);
}

export function applyRendererQuality(view,quality){
  view.dynamicScale=1;configureShadows(view,quality);
  view.renderer.setPixelRatio(pixelLimit(quality));
  view.performanceClock=0;view.frameAverage=.016;view.renderQuality=quality;view.updateCamera?.();
}

// Free larger targets before decoding a downgrade. Upgrades wait for their art.
// A later selection owns the transition even if an earlier load finishes last.
async function graphicsLock(view){
  const before=view.graphicsMutationTail||Promise.resolve();let unlock;
  const held=new Promise(resolve=>unlock=resolve),tail=before.then(()=>held);view.graphicsMutationTail=tail;
  await before;return ()=>{unlock();if(view.graphicsMutationTail===tail)view.graphicsMutationTail=null;};
}

export async function transitionRendererQuality(view,quality,prepare,rebuild,capture){
  if(!view.graphicsLoading&&!view.graphicsRebuilding)view.graphicsBaseline={...rendererTargets(view),quality:view.renderQuality};
  const previous=view.graphicsBaseline||{...rendererTargets(view),quality:view.renderQuality};
  const request=view.graphicsRequest=(view.graphicsRequest||0)+1;view.graphicsLoading=quality;
  const owns=()=>request===view.graphicsRequest,latest=()=>owns()&&view.settings.quality===quality&&!view.renderingReleased;
  const downgrade=qualityRank[quality]<qualityRank[previous.quality];let unlock,checkpoint,mutated=false,restored=false;
  const restore=()=>{
    if(restored)return;restored=true;
    try{checkpoint?.restore({superseded:!owns()});if(mutated||downgrade)restoreRendererTargets(view,previous);if(owns()){view.settings.quality=previous.quality;view.graphicsRestoredQuality=previous.quality;}if(mutated)view.graphicsSceneValid=true;}
    catch(error){view.graphicsSceneValid=false;view.graphicsFatal={message:error.message,quality:previous.quality};throw error;}
  };
  try{
    if(downgrade&&!view.graphicsRebuilding)shrinkRendererTargets(view,quality,previous);
    await prepare();
    if(!latest()||!view.sim)return false;
    unlock=await graphicsLock(view);if(!latest())return false;
    view.graphicsRebuilding=request;checkpoint=capture?.();mutated=true;view.graphicsSceneValid=false;await rebuild();view.graphicsSceneValid=true;
    if(!latest()){if(!view.renderingReleased)restore();return false;}
    configureShadows(view,quality);
    // Precompilation is optional: a rebuilt scene can also compile normally on
    // its first live frame. Restoring the old targets here would mislabel it.
    try{await prepareScenePrograms(view);if(request===view.graphicsRequest)view.graphicsWarmupError=null;}
    catch(error){if(request===view.graphicsRequest)view.graphicsWarmupError=error.message;}
    if(!latest()){if(!view.renderingReleased)restore();return false;}
    applyRendererQuality(view,quality);view.graphicsBaseline={...rendererTargets(view),quality};view.graphicsFatal=null;view.graphicsRestoredQuality=null;return true;
  }catch(error){
    if(!view.renderingReleased&&(mutated||owns())){try{restore();}catch(recovery){throw new AggregateError([error,recovery],'The graphics change and its recovery both failed.');}}
    throw error;
  }
  finally{checkpoint?.release();if(view.graphicsRebuilding===request)view.graphicsRebuilding=null;unlock?.();if(owns())view.graphicsLoading=null;}
}
