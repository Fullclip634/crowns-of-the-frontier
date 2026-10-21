import * as THREE from 'three';
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
  const state=view.shadowSampling??={at:-Infinity,updates:0,skipped:0},t=view.target;
  const key=[t.x,t.y,t.z,view.zoom,view.angle,view.tilt,view.camera.aspect,view.settings.quality,view.sun.shadow.mapSize.x].join(':');
  const interval=(view.renderQuality||view.settings.quality)==='high'?1/30:1/20;
  const due=map.needsUpdate||state.sim!==view.sim||state.revision!==view.sim.revision||state.camera!==key||view.clock-state.at>=interval-1e-7||view.clock<state.at;
  if(due){map.needsUpdate=!view.renderer.isWebGPURenderer;if(view.renderer.isWebGPURenderer)view.sun.shadow.needsUpdate=true;state.at=view.clock;state.sim=view.sim;state.revision=view.sim.revision;state.camera=key;state.updates++;}else state.skipped++;
  view.shadowDiagnostics={updates:state.updates,skipped:state.skipped,refreshRate:1/interval,mapSize:view.sun.shadow.mapSize.x};return due;
}
