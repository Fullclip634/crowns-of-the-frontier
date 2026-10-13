import assert from 'node:assert/strict';

export function readGlb(bytes){
  assert.equal(bytes.readUInt32LE(0),0x46546c67);assert.equal(bytes.readUInt32LE(4),2);assert.equal(bytes.readUInt32LE(8),bytes.length);
  const jsonLength=bytes.readUInt32LE(12);assert.equal(bytes.readUInt32LE(16),0x4e4f534a);
  const json=JSON.parse(bytes.subarray(20,20+jsonLength).toString('utf8')),at=20+jsonLength;
  assert.equal(bytes.readUInt32LE(at+4),0x004e4942);const bin=bytes.subarray(at+8,at+8+bytes.readUInt32LE(at));
  assert.equal(at+8+bin.length,bytes.length);return {json,bin};
}
export function writeGlb(json,bin){
  const text=Buffer.from(JSON.stringify(json)),jsonBytes=Buffer.alloc(Math.ceil(text.length/4)*4,32),binary=Buffer.alloc(Math.ceil(bin.length/4)*4);text.copy(jsonBytes);bin.copy(binary);
  const header=Buffer.alloc(20);header.writeUInt32LE(0x46546c67,0);header.writeUInt32LE(2,4);header.writeUInt32LE(28+jsonBytes.length+binary.length,8);header.writeUInt32LE(jsonBytes.length,12);header.writeUInt32LE(0x4e4f534a,16);
  const binHeader=Buffer.alloc(8);binHeader.writeUInt32LE(binary.length,0);binHeader.writeUInt32LE(0x004e4942,4);return Buffer.concat([header,jsonBytes,binHeader,binary]);
}

// These project catalogues use material colors, compressed meshes and nested
// joint extras. Keep the existing compressed geometry byte-for-byte; replacing
// resources must never simplify unrelated troops or buildings a second time.
export function replaceCatalogueResources(baseBytes,patchBytes){
  const base=readGlb(baseBytes),patch=readGlb(patchBytes),out=structuredClone(base.json),p=patch.json;
  for(const document of [out,p]){
    for(const key of ['images','textures','skins','animations','cameras'])assert.ok(!document[key]?.length,'Unsupported catalogue '+key);
    assert.ok(!document.buffers[0].uri);assert.ok(document.buffers[0].byteLength<= (document===out?base.bin.length:patch.bin.length));
    for(const buffer of document.buffers.slice(1))assert.ok(buffer.extensions?.EXT_meshopt_compression?.fallback&&!buffer.uri,'Only meshopt fallback buffers are supported');
    for(const node of document.nodes)assert.ok(!node.extensions&&node.skin===undefined&&node.camera===undefined,'Unsupported node references');
  }
  const shift={},fields=['nodes','meshes','materials','accessors','bufferViews'];for(const field of fields){out[field]??=[];shift[field]=out[field].length;}
  const binOffset=base.bin.length,buffers=p.buffers.map((buffer,index)=>index===0?0:out.buffers.length+index-1);
  out.buffers.push(...structuredClone(p.buffers.slice(1)));out.buffers[0].byteLength=binOffset+patch.bin.length;
  const views=structuredClone(p.bufferViews).map(view=>{
    const original=view.buffer;view.buffer=buffers[original];if(original===0)view.byteOffset=(view.byteOffset||0)+binOffset;
    for(const name of Object.keys(view.extensions||{}))assert.equal(name,'EXT_meshopt_compression');
    const compressed=view.extensions?.EXT_meshopt_compression;if(compressed){const original=compressed.buffer;compressed.buffer=buffers[original];if(original===0)compressed.byteOffset=(compressed.byteOffset||0)+binOffset;}
    return view;
  });out.bufferViews.push(...views);
  out.accessors.push(...structuredClone(p.accessors).map(accessor=>{
    if(accessor.bufferView!==undefined)accessor.bufferView+=shift.bufferViews;
    if(accessor.sparse){accessor.sparse.indices.bufferView+=shift.bufferViews;accessor.sparse.values.bufferView+=shift.bufferViews;}return accessor;
  }));
  out.materials.push(...structuredClone(p.materials));
  out.meshes.push(...structuredClone(p.meshes).map(mesh=>{
    for(const primitive of mesh.primitives){assert.ok(!primitive.extensions,'Unsupported primitive extensions');
      for(const key of Object.keys(primitive.attributes))primitive.attributes[key]+=shift.accessors;
      if(primitive.indices!==undefined)primitive.indices+=shift.accessors;if(primitive.material!==undefined)primitive.material+=shift.materials;
      for(const target of primitive.targets||[])for(const key of Object.keys(target))target[key]+=shift.accessors;
    }return mesh;
  }));
  out.nodes.push(...structuredClone(p.nodes).map(node=>{if(node.mesh!==undefined)node.mesh+=shift.meshes;if(node.children)node.children=node.children.map(index=>index+shift.nodes);return node;}));
  const replacements=new Map(),keys=[];
  for(let index=0;index<p.nodes.length;index++){
    const key=p.nodes[index].extras?.assetKey;if(!/^resource:(food|gold|stone):/.test(key||''))continue;
    const previous=base.json.nodes.findIndex(node=>node.extras?.assetKey===key);assert.ok(previous>=0,'Resource does not exist in the complete roster');
    const replacement=index+shift.nodes;for(const field of ['matrix','translation','rotation','scale'])assert.deepEqual(out.nodes[previous][field],out.nodes[replacement][field],'Resource root transforms remain compatible');
    replacements.set(previous,replacement);keys.push(key);
  }
  assert.equal(replacements.size,12,'All food, gold and stone variants are required');
  for(const index of replacements.keys()){out.nodes[index].extras.supersededAssetKey=out.nodes[index].extras.assetKey;delete out.nodes[index].extras.assetKey;}
  for(let index=0;index<p.nodes.length;index++){const node=out.nodes[index+shift.nodes];if(node.extras?.assetKey&&!keys.includes(node.extras.assetKey)){node.extras.unusedPreviewKey=node.extras.assetKey;delete node.extras.assetKey;}}
  for(const node of out.nodes)if(node.children)node.children=node.children.map(index=>replacements.get(index)??index);
  for(const scene of out.scenes)scene.nodes=scene.nodes.map(index=>replacements.get(index)??index);
  for(const field of ['extensionsUsed','extensionsRequired'])out[field]=[...new Set([...(out[field]||[]),...(p[field]||[])])];
  out.asset.generator='Crowns of the Frontier: original Blender resource composition';
  return {bytes:writeGlb(out,Buffer.concat([base.bin,patch.bin])),keys};
}
