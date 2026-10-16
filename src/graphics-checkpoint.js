import {retainAuthoredAssets} from './authored-assets.js';

const cameraState=view=>({target:view.target.clone(),zoom:view.zoom,angle:view.angle,tilt:view.tilt});
function restoreCamera(view,state){view.target.copy(state.target);view.zoom=state.zoom;view.angle=state.angle;view.tilt=state.tilt;view.updateCamera();}

// Keep the simulation object live. Restoring visuals must never restore an old
// game snapshot or replace a newer match/network state with an earlier one.
export function graphicsCheckpoint(view){
  const artwork=retainAuthoredAssets(),quality=view.renderQuality,sim=view.sim,camera=cameraState(view);
  view.graphicsRecoveryQuality=quality;
  return {
    restore({superseded=false}={}){
      const selected=view.settings.quality,pose=view.sim===sim?camera:cameraState(view);
      view.settings.quality=quality;view.graphicsSceneValid=false;
      try{artwork.activate();view.attach(view.sim);restoreCamera(view,pose);view.graphicsSceneValid=true;}
      finally{view.settings.quality=superseded?selected:quality;}
    },
    release(){artwork.release();},
  };
}
