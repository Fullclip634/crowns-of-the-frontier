import {graphicsNeedsReload} from './graphics-failure.js';

const key='crowns-compatible-graphics';

// A failed native device is remembered only in this tab. Explicit renderer
// links still let a player try WebGPU again after updating their browser.
// Touch devices default to battle-tested WebGL 2 unless WebGPU is explicitly requested.
export function preferredRenderer(href,storage,options={}){
  const requested=new URL(href).searchParams.get('renderer');
  if(requested==='webgpu'||requested==='webgl')return requested;
  try{if(storage?.getItem(key)==='webgl')return 'webgl';}catch{}
  return options?.mobile?'webgl':'webgpu';
}

// iOS Safari and Firefox omit navigator.deviceMemory; defaulting unknown-memory
// phones and <=6 GB Android devices to Performance ('low') prevents thermal and
// OOM crashes while leaving High/Medium intact on desktop and flagship tablets.
export function detectRecommendedQuality({deviceMemory,hardwareConcurrency,coarsePointer}={}){
  const cores=typeof hardwareConcurrency==='number'&&hardwareConcurrency>0?hardwareConcurrency:8;
  const hasMemory=typeof deviceMemory==='number'&&deviceMemory>0;
  if(coarsePointer){
    if(!hasMemory||deviceMemory<8||cores<=4)return 'low';
    return 'medium';
  }
  return (hasMemory&&deviceMemory<=4)||cores<=4?'low':'high';
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
