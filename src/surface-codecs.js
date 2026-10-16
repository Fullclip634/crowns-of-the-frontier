import {LoadingManager} from 'three';
import {KTX2Loader} from 'three/addons/loaders/KTX2Loader.js';

const decoderJs=new URL('../node_modules/three/examples/jsm/libs/basis/basis_transcoder.js',import.meta.url).href;
const decoderWasm=new URL('../node_modules/three/examples/jsm/libs/basis/basis_transcoder.wasm',import.meta.url).href;
let loader=null,pending=0,fallbacks=0;
export function compressedSurfaceSupport(renderer){return !!renderer?.extensions&&(renderer.extensions.has('EXT_texture_compression_bptc')||renderer.extensions.has('WEBGL_compressed_texture_astc'));}
export async function loadCompressedSurface(url,renderer){
  if(!url||!compressedSurfaceSupport(renderer))return null;
  if(!loader){const manager=new LoadingManager();manager.setURLModifier(url=>url.endsWith('/basis_transcoder.js')?decoderJs:url.endsWith('/basis_transcoder.wasm')?decoderWasm:url);loader=new KTX2Loader(manager).setTranscoderPath('/frontier-basis/').setWorkerLimit(1).detectSupport(renderer);}
  const current=loader;pending++;
  try{return await current.loadAsync(url);}catch(error){fallbacks++;console.warn('A compressed surface could not load; using its original image:',error.message);return null;}
  finally{pending--;if(!pending&&loader===current){current.dispose();loader=null;}}
}
export function surfaceCodecState(){return {codecFallbacks:fallbacks,codecPending:pending};}
export function releaseSurfaceCodec(){loader?.dispose();loader=null;}
