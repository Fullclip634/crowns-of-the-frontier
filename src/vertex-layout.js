import {StaticDrawUsage,FloatType} from 'three';
import {interleaveAttributes} from 'three/addons/utils/BufferGeometryUtils.js';

// Share storage for immutable vertex channels before their first GPU upload.
// Keep per-instance and mutable data separate; no precision or channel is lost.
export function interleaveStaticVertices(geometry){
  const count=geometry.attributes.position?.count;if(!count)return false;
  const entries=Object.entries(geometry.attributes).filter(([,attribute])=>!attribute.isInstancedBufferAttribute&&!attribute.isInterleavedBufferAttribute&&attribute.array instanceof Float32Array&&attribute.count===count&&attribute.usage===StaticDrawUsage&&attribute.gpuType===FloatType);
  if(entries.length<2)return false;
  const packed=interleaveAttributes(entries.map(([,attribute])=>attribute));if(!packed)throw new Error('Static vertex channels could not share GPU storage.');
  entries.forEach(([name,source],i)=>{packed[i].name=source.name;packed[i].gpuType=source.gpuType;geometry.setAttribute(name,packed[i]);});
  geometry.userData.nativeVertexLayout={channels:entries.map(([name])=>name),staticBuffersBefore:entries.length,staticBuffersAfter:1,strideBytes:packed[0].data.stride*4};return true;
}
