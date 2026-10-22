import {StaticDrawUsage,FloatType,BufferAttribute} from 'three';
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

// Index exact duplicates before first upload. Joint, normal, UV, color and
// surface channels all participate: no tolerance-based welding or smoothing.
export function indexExactVertices(geometry){
  const count=geometry.attributes.position?.count,entries=Object.entries(geometry.attributes);
  if(!count||geometry.index||Object.keys(geometry.morphAttributes).length||entries.some(([,a])=>a.isInstancedBufferAttribute||a.isInterleavedBufferAttribute||!(a.array instanceof Float32Array)||a.count!==count||a.usage!==StaticDrawUsage||a.gpuType!==FloatType))return false;
  const attributes=entries.map(([,a])=>({source:a,words:new Uint32Array(a.array.buffer,a.array.byteOffset,a.array.length)})),heads=new Map(),next=new Uint32Array(count),sources=new Uint32Array(count),indices=new Uint32Array(count);let unique=0;
  for(let vertex=0;vertex<count;vertex++){
    let hash=2166136261;
    for(const {source,words}of attributes)for(let k=0;k<source.itemSize;k++)hash=Math.imul(hash^words[vertex*source.itemSize+k],16777619);
    let link=heads.get(hash)||0,match=-1;
    while(link){
      const candidate=link-1;let same=true;
      for(const {source,words}of attributes){for(let k=0;k<source.itemSize;k++)if(words[vertex*source.itemSize+k]!==words[candidate*source.itemSize+k]){same=false;break;}if(!same)break;}
      if(same){match=indices[candidate];break;}link=next[candidate];
    }
    if(match>=0){indices[vertex]=match;continue;}
    indices[vertex]=unique;sources[unique++]=vertex;next[vertex]=heads.get(hash)||0;heads.set(hash,vertex+1);
  }
  const components=attributes.reduce((n,{source})=>n+source.itemSize,0),Index=unique<=65535?Uint16Array:Uint32Array,before=count*components*4,after=unique*components*4,indexBytes=count*Index.BYTES_PER_ELEMENT;
  if(before<=after+indexBytes)return false;
  for(const [name,source]of entries){
    const array=new Float32Array(unique*source.itemSize),output=new Uint32Array(array.buffer),input=new Uint32Array(source.array.buffer,source.array.byteOffset,source.array.length);
    for(let i=0;i<unique;i++){const start=sources[i]*source.itemSize,target=i*source.itemSize;for(let k=0;k<source.itemSize;k++)output[target+k]=input[start+k];}
    const attribute=new BufferAttribute(array,source.itemSize,source.normalized);attribute.name=source.name;attribute.gpuType=source.gpuType;attribute.setUsage(source.usage);geometry.setAttribute(name,attribute);
  }
  geometry.setIndex(new BufferAttribute(new Index(indices),1));
  geometry.userData.exactVertexReuse={sourceVertices:count,uniqueVertices:unique,indexCount:count,indexBytes,vertexBytesBefore:before,vertexBytesAfter:after};return true;
}

// Retain the Blender/exporter's existing vertex sharing. Only genuinely flat
// sources need exact indexing; identity indices let mixed layouts merge safely.
export function ensureModelIndices(geometry){
  if(geometry.index)return false;
  if(indexExactVertices(geometry))return true;
  const count=geometry.attributes.position.count,Index=count<=65535?Uint16Array:Uint32Array,index=new Index(count);
  for(let i=0;i<count;i++)index[i]=i;
  geometry.setIndex(new BufferAttribute(index,1));return true;
}
