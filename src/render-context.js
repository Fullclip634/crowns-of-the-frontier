import {WebGLRenderer} from 'three';
import {installNodeRuntime} from './render-runtime.js';

// Probe texture support on the actual game context without allocating the
// full-size backbuffer until its artwork has finished preparing.
export function createWorldRenderer(){return new WebGLRenderer({antialias:true,alpha:false,powerPreference:'high-performance'});}

// Opt-in during visual and performance qualification. A failed WebGPU startup
// creates a fresh legacy canvas; a canvas cannot switch context types safely.
export async function initializeWorldRenderer({backend='webgl',onFallback=()=>{}}={}){
  if(backend!=='webgpu')return createWorldRenderer();
  if(!globalThis.navigator?.gpu){onFallback(new Error('WebGPU is unavailable in this browser or connection.'));return createWorldRenderer();}
  let renderer;
  try{
    const runtime=await import('./render-nodes.js');
    renderer=new runtime.WebGPURenderer({antialias:true,alpha:false,powerPreference:'high-performance'});
    await renderer.init();
    // The classic renderer retains the game's tested GLSL path. Do not install
    // node materials on the node renderer's automatic WebGL compatibility path.
    if(!renderer.backend.isWebGPUBackend)throw new Error('WebGPU is unavailable; using the compatibility renderer.');
    installNodeRuntime(runtime);return renderer;
  }catch(error){
    try{await renderer?.dispose();}catch{}
    installNodeRuntime(null);onFallback(error);return createWorldRenderer();
  }
}

export function rendererBackend(renderer){return renderer?.isWebGPURenderer?(renderer.backend?.isWebGPUBackend?'webgpu':'nodes-webgl'):'webgl';}

export function watchRendererDevice(view){
  const renderer=view.renderer;if(!renderer?.isWebGPURenderer)return;
  const previous=renderer.onDeviceLost;
  renderer.onDeviceLost=info=>{
    previous?.call(renderer,info);
    if(view.renderingReleased)return;
    view.graphicsSceneValid=false;
    view.graphicsFatal={deviceLost:true,message:info.message||'The graphics device was disconnected.',quality:view.renderQuality};
  };
}
