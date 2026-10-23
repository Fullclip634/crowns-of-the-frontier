import test from 'node:test';
import assert from 'node:assert/strict';
import {WGSLNodeBuilder,DepthTexture,LessEqualCompare,LinearFilter,NearestFilter,DirectionalLight} from 'three/webgpu';
import {prepareManualDepthTexture,configureCompatibilityShadow} from '../src/compatibility-depth.js';

test('the Android shadow depth texture uses the legal compatibility binding and scalar texel channel',()=>{
  const depth=new DepthTexture(1024,1024);depth.compareFunction=LessEqualCompare;depth.minFilter=depth.magFilter=LinearFilter;
  const builder=Object.create(WGSLNodeBuilder.prototype);builder.renderer={backend:{compatibilityMode:true}};
  assert.equal(builder.generateTextureLoad(depth,'shadowMap','pixel','0u',null,null),'textureLoad( shadowMap, pixel, u32( 0u ) ).x');
  prepareManualDepthTexture(depth);assert.equal(depth.compareFunction,null);assert.equal(depth.minFilter,NearestFilter);assert.equal(depth.magFilter,NearestFilter);
  assert.equal(builder.generateTextureLoad(depth,'shadowMap','pixel','0u',null,null),'textureLoad( shadowMap, pixel, u32( 0u ) ).x','non-comparison compatibility binding returns a vector and requires this scalar channel');
  const version=depth.version;prepareManualDepthTexture(depth);assert.equal(depth.version,version,'repeat setup does not recreate the GPU resource');depth.dispose();
});

test('only compatibility renderers receive the manual PCF filter and preserve its shadow inputs',()=>{
  const light=new DirectionalLight(),renderer={backend:{isWebGPUBackend:true,compatibilityMode:true}},depth=new DepthTexture(16,16),inputs={depthTexture:depth,shadowCoord:{x:1},shadow:light.shadow,depthLayer:0};depth.compareFunction=LessEqualCompare;
  let received;const output={},filter=value=>{received=value;return output;};assert.equal(configureCompatibilityShadow(light,renderer,filter),true);const fn=light.shadow.filterNode;
  assert.equal(fn(inputs),output);assert.equal(received,inputs);assert.equal(depth.compareFunction,null);assert.equal(configureCompatibilityShadow(light,renderer,filter),false);assert.equal(light.shadow.filterNode,fn);
  for(const backend of [{isWebGPUBackend:true,compatibilityMode:false},{isWebGLBackend:true}]){const other=new DirectionalLight(),before=other.shadow.filterNode;assert.equal(configureCompatibilityShadow(other,{backend},filter),false);assert.equal(other.shadow.filterNode,before);}
  const custom=new DirectionalLight();custom.shadow.filterNode=filter;assert.equal(configureCompatibilityShadow(custom,renderer,filter),false);assert.equal(custom.shadow.filterNode,filter);depth.dispose();
});
