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

function holdRenderer(view,failure){
  if(view.renderingReleased)return;
  view.graphicsSceneValid=false;
  if(view.graphicsFatal?.deviceLost||view.graphicsFatal?.backendError&&!failure.deviceLost)return;
  view.graphicsFatal={...failure,quality:view.renderQuality};
}

export function watchRendererDevice(view){
  view.releaseRendererWatch?.();
  const renderer=view.renderer;if(!renderer?.isWebGPURenderer||view.renderingReleased)return;
  const previous=renderer.onDeviceLost,previousError=renderer.onError;
  const loss=info=>{
    holdRenderer(view,{deviceLost:true,message:String(info?.message||'The graphics device was disconnected.').slice(0,1000)});
    previous?.call(renderer,info);
  };
  const error=info=>{
    holdRenderer(view,{backendError:true,type:String(info?.type||'GPUError').slice(0,80),message:String(info?.message||'The graphics backend could not render the battlefield.').slice(0,1000)});
    previousError?.call(renderer,info);
  };
  renderer.onDeviceLost=loss;renderer.onError=error;
  // Portraits share the device. Each engine backend replaces its property
  // handler, so the battlefield also needs an independent device listener.
  const device=renderer.backend?.device,gpuError=event=>holdRenderer(view,{backendError:true,type:String(event.error?.constructor?.name||'GPUError').slice(0,80),message:String(event.error?.message||'The graphics backend could not render the battlefield.').slice(0,1000)});
  device?.addEventListener?.('uncapturederror',gpuError);let active=true;
  const release=()=>{
    if(!active)return;active=false;device?.removeEventListener?.('uncapturederror',gpuError);
    if(renderer.onDeviceLost===loss)renderer.onDeviceLost=previous;
    if(renderer.onError===error)renderer.onError=previousError;
    if(view.releaseRendererWatch===release)view.releaseRendererWatch=null;
  };
  view.releaseRendererWatch=release;return release;
}
