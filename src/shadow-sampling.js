import * as THREE from 'three';
import {targetFrameRate} from './frame-pacing.js';
import {periodicStride} from './distance-lod.js';
const offset=new THREE.Vector3(-48,62,32),right=new THREE.Vector3(0,1,0).cross(offset).normalize(),up=offset.clone().normalize().cross(right).normalize();

// Snapping in light space keeps masonry shadows stable during small pans.
export function positionShadowLight(view,span){
  const center=view.shadowCenter??=new THREE.Vector3(),step=2*span/view.sun.shadow.mapSize.x;
  center.copy(view.target);
  center.addScaledVector(right,Math.round(view.target.dot(right)/step)*step-view.target.dot(right));
  center.addScaledVector(up,Math.round(view.target.dot(up)/step)*step-view.target.dot(up));
  view.sun.target.position.copy(center);view.sun.position.copy(center).add(offset);
}

// Keep full-resolution shadow maps, but avoid repeating this second scene pass
// at every display refresh. Camera and structural changes refresh immediately.
export function scheduleShadows(view){
  const map=view.renderer.shadowMap;map.autoUpdate=false;if(view.renderer.isWebGPURenderer)view.sun.shadow.autoUpdate=false;
  if(!map.enabled){view.shadowSampling=null;return false;}
  const state=view.shadowSampling??={at:-Infinity,updates:0,skipped:0,hasCamera:false},t=view.target,aspect=view.camera.aspect,quality=view.settings.quality,mapSize=view.sun.shadow.mapSize.x;
  const cameraChanged=!state.hasCamera||state.tx!==t.x||state.ty!==t.y||state.tz!==t.z||state.zoom!==view.zoom||state.angle!==view.angle||state.tilt!==view.tilt||state.aspect!==aspect||state.quality!==quality||state.mapSize!==mapSize;
  const baseInterval=(view.renderQuality||view.settings.quality)==='high'?1/30:1/20;
  // A second shadow pass is pure GPU cost. When timer queries prove the GPU is
  // the bottleneck, refresh less often instead of letting the frame overrun.
  const budgetMs=1000/targetFrameRate(view.settings);
  const stride=periodicStride(view.frameTimeMs??null,budgetMs,{base:1,maximum:3});
  const interval=baseInterval*stride;
  const due=map.needsUpdate||state.sim!==view.sim||state.revision!==view.sim.revision||cameraChanged||view.clock-state.at>=interval-1e-7||view.clock<state.at;
  if(due){map.needsUpdate=!view.renderer.isWebGPURenderer;if(view.renderer.isWebGPURenderer)view.sun.shadow.needsUpdate=true;state.at=view.clock;state.sim=view.sim;state.revision=view.sim.revision;state.hasCamera=true;state.tx=t.x;state.ty=t.y;state.tz=t.z;state.zoom=view.zoom;state.angle=view.angle;state.tilt=view.tilt;state.aspect=aspect;state.quality=quality;state.mapSize=mapSize;state.updates++;}else state.skipped++;
  view.shadowDiagnostics={updates:state.updates,skipped:state.skipped,refreshRate:1/interval,frameMs:view.frameTimeMs??null,gpuTimerEnabled:!!view.gpuTimer,gpuStride:stride,mapSize:view.sun.shadow.mapSize.x};return due;
}
