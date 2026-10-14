import assert from 'node:assert/strict';
import {readGlb,writeGlb} from './glb-catalogue.mjs';

// Copy only selected complete model hierarchies and their referenced buffers.
// The original compressed geometry and Blender joint metadata stay intact.
export function composeQualityCatalogue(sources){
  const out={asset:{version:'2.0',generator:'Crowns of the Frontier: original Blender balanced catalogue'},scene:0,scenes:[{nodes:[]}],nodes:[],meshes:[],materials:[],accessors:[],bufferViews:[],buffers:[{byteLength:0}]},chunks=[],keys=new Set();let length=0;
  const append=bytes=>{const offset=length;chunks.push(bytes);length+=bytes.length;const pad=(4-length%4)%4;if(pad){chunks.push(Buffer.alloc(pad));length+=pad;}return offset;};
  for(const source of sources){
    const {json:j,bin}=readGlb(source.bytes),maps={nodes:new Map(),meshes:new Map(),materials:new Map(),accessors:new Map(),bufferViews:new Map(),buffers:new Map([[0,0]])};
    for(const field of ['images','textures','skins','animations','cameras'])assert.ok(!j[field]?.length,'Unsupported catalogue '+field);
    assert.ok(j.buffers.every((b,i)=>!b.uri&&(i===0||b.extensions?.EXT_meshopt_compression?.fallback)),'Only embedded and meshopt fallback buffers are supported');
    const bytesAt=(offset,count)=>{assert.ok(Number.isInteger(offset)&&Number.isInteger(count)&&offset>=0&&count>=0&&offset+count<=bin.length,'Invalid binary range');return bin.subarray(offset,offset+count);};
    const fallback=index=>{if(!maps.buffers.has(index)){assert.ok(index>0&&j.buffers[index]?.extensions?.EXT_meshopt_compression?.fallback);maps.buffers.set(index,out.buffers.length);out.buffers.push(structuredClone(j.buffers[index]));}return maps.buffers.get(index);};
    const view=index=>{
      if(maps.bufferViews.has(index))return maps.bufferViews.get(index);
      const v=structuredClone(j.bufferViews[index]);assert.ok(v,'Missing buffer view');
      for(const extension of Object.keys(v.extensions||{}))assert.equal(extension,'EXT_meshopt_compression');
      if(v.buffer===0)v.byteOffset=append(bytesAt(v.byteOffset||0,v.byteLength));else v.buffer=fallback(v.buffer);
      const compressed=v.extensions?.EXT_meshopt_compression;
      if(compressed){assert.equal(compressed.buffer,0);compressed.byteOffset=append(bytesAt(compressed.byteOffset||0,compressed.byteLength));}
      const id=out.bufferViews.length;maps.bufferViews.set(index,id);out.bufferViews.push(v);return id;
    };
    const accessor=index=>{
      if(maps.accessors.has(index))return maps.accessors.get(index);
      const a=structuredClone(j.accessors[index]);assert.ok(a,'Missing accessor');if(a.bufferView!==undefined)a.bufferView=view(a.bufferView);
      if(a.sparse){a.sparse.indices.bufferView=view(a.sparse.indices.bufferView);a.sparse.values.bufferView=view(a.sparse.values.bufferView);}
      const id=out.accessors.length;maps.accessors.set(index,id);out.accessors.push(a);return id;
    };
    const material=index=>{if(!maps.materials.has(index)){assert.ok(j.materials[index]);maps.materials.set(index,out.materials.length);out.materials.push(structuredClone(j.materials[index]));}return maps.materials.get(index);};
    const mesh=index=>{
      if(maps.meshes.has(index))return maps.meshes.get(index);
      const m=structuredClone(j.meshes[index]);assert.ok(m,'Missing mesh');
      for(const p of m.primitives){assert.ok(!p.extensions,'Unsupported primitive extensions');for(const key of Object.keys(p.attributes))p.attributes[key]=accessor(p.attributes[key]);if(p.indices!==undefined)p.indices=accessor(p.indices);if(p.material!==undefined)p.material=material(p.material);for(const target of p.targets||[])for(const key of Object.keys(target))target[key]=accessor(target[key]);}
      const id=out.meshes.length;maps.meshes.set(index,id);out.meshes.push(m);return id;
    };
    const node=index=>{
      if(maps.nodes.has(index))return maps.nodes.get(index);
      const n=structuredClone(j.nodes[index]);assert.ok(n&&!n.extensions&&n.skin===undefined&&n.camera===undefined,'Unsupported model node');
      const id=out.nodes.length;maps.nodes.set(index,id);out.nodes.push(n);
      if(n.mesh!==undefined)n.mesh=mesh(n.mesh);if(n.children)n.children=n.children.map(node);return id;
    };
    const roots=new Map(j.nodes.flatMap((n,i)=>n.extras?.assetKey?[[n.extras.assetKey,i]]:[]));
    for(const key of source.keys){assert.ok(!keys.has(key),'Duplicate model '+key);assert.ok(roots.has(key),'Missing model '+key);keys.add(key);out.scenes[0].nodes.push(node(roots.get(key)));}
    for(const field of ['extensionsUsed','extensionsRequired'])out[field]=[...new Set([...(out[field]||[]),...(j[field]||[])])];
  }
  out.buffers[0].byteLength=length;
  return writeGlb(out,Buffer.concat(chunks));
}
