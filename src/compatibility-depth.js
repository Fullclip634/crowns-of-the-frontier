import {NearestFilter} from 'three';
const configured=new WeakSet();

// Compatibility Mode forbids fragment textureLoad on texture_depth_2d. Three
// exposes a non-comparison depth binding as texture_2d<f32>, allowing its texel
// load and our manual PCF depth comparison to remain valid.
export function prepareManualDepthTexture(texture){
  if(texture.compareFunction!==null||texture.minFilter!==NearestFilter||texture.magFilter!==NearestFilter){
    texture.compareFunction=null;texture.minFilter=texture.magFilter=NearestFilter;texture.needsUpdate=true;
  }
  return texture;
}

export function configureCompatibilityShadow(light,renderer,filter){
  if(!renderer.backend?.isWebGPUBackend||!renderer.backend.compatibilityMode||configured.has(light)||light.shadow.filterNode)return false;
  light.shadow.filterNode=inputs=>{prepareManualDepthTexture(inputs.depthTexture);return filter(inputs);};
  configured.add(light);return true;
}
