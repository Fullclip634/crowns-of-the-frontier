import {graphicsNeedsReload} from './graphics-failure.js';

const key='crowns-compatible-graphics';

// A failed native device is remembered only in this tab. Explicit renderer
// links still let a player try WebGPU again after updating their browser.
export function preferredRenderer(href,storage){
  const requested=new URL(href).searchParams.get('renderer');
  if(requested==='webgpu'||requested==='webgl')return requested;
  try{if(storage?.getItem(key)==='webgl')return 'webgl';}catch{}
  return 'webgpu';
}

export function compatibleGraphicsURL(href,storage){
  const url=new URL(href);url.searchParams.set('renderer','webgl');
  try{storage?.setItem(key,'webgl');}catch{}
  return url.href;
}

export function startupCompatibilityURL({failure,backend,playing,network,modal,href,storage}){
  // Do not reload over a match, room connection, or unfinished menu form.
  // WebGL failures require manual recovery, preventing automatic reload loops.
  if(playing||network||modal||backend!=='webgpu'||!graphicsNeedsReload(failure))return null;
  return compatibleGraphicsURL(href,storage);
}
