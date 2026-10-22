import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {interleaveStaticVertices,indexExactVertices,ensureModelIndices} from '../src/vertex-layout.js';
import {WorldView} from '../src/world.js';
import {mergeUnitModel} from '../src/unit-palette.js';

test('native vertex storage preserves exact floats, channels, topology and independent instance updates',()=>{
  const geometry=new THREE.BoxGeometry(),attributes={};for(const [name,attribute]of Object.entries(geometry.attributes))attributes[name]={array:attribute.array.slice(),itemSize:attribute.itemSize,normalized:attribute.normalized};
  geometry.setAttribute('unitSurface',new THREE.Float32BufferAttribute(new Float32Array(geometry.attributes.position.count*3).fill(.37),3));geometry.setAttribute('unitTeamMask',new THREE.Float32BufferAttribute(new Float32Array(geometry.attributes.position.count).fill(1),1));
  for(const name of ['unitSurface','unitTeamMask']){const a=geometry.attributes[name];attributes[name]={array:a.array.slice(),itemSize:a.itemSize,normalized:a.normalized};}
  const owners=new THREE.InstancedBufferAttribute(new Float32Array(1280),1).setUsage(THREE.DynamicDrawUsage),index=geometry.index,groups=structuredClone(geometry.groups);geometry.setAttribute('instanceOwner',owners);
  assert.equal(interleaveStaticVertices(geometry),true);const storage=new Set(Object.values(geometry.attributes).map(a=>a.isInterleavedBufferAttribute?a.data:a));assert.equal(storage.size,2);assert.equal(geometry.attributes.instanceOwner,owners);assert.equal(geometry.index,index);assert.deepEqual(geometry.groups,groups);
  for(const [name,source]of Object.entries(attributes)){const current=geometry.attributes[name];assert.equal(current.itemSize,source.itemSize);assert.equal(current.normalized,source.normalized);const restored=new Float32Array(source.array.length);for(let i=0;i<current.count;i++)for(let k=0;k<current.itemSize;k++)restored[i*current.itemSize+k]=current.getComponent(i,k);assert.deepEqual(new Uint32Array(restored.buffer),new Uint32Array(source.array.buffer));}
  const before=geometry.attributes.position.data.array.slice();owners.setX(0,7);assert.equal(owners.getX(0),7);assert.deepEqual(geometry.attributes.position.data.array,before);geometry.dispose();
});

test('packing keeps mutable and integer channels separate and does not repack an existing layout',()=>{
  const geometry=new THREE.BoxGeometry(),dynamic=new THREE.Float32BufferAttribute(new Float32Array(geometry.attributes.position.count),1).setUsage(THREE.DynamicDrawUsage),integer=new THREE.Uint16BufferAttribute(new Uint16Array(geometry.attributes.position.count),1);geometry.setAttribute('mutable',dynamic);geometry.setAttribute('integer',integer);
  assert.equal(interleaveStaticVertices(geometry),true);const buffer=geometry.attributes.position.data;assert.equal(geometry.attributes.mutable,dynamic);assert.equal(geometry.attributes.integer,integer);assert.equal(interleaveStaticVertices(geometry),false);assert.equal(geometry.attributes.position.data,buffer);geometry.dispose();
});

test('exact indexing preserves every triangle channel, hard edge, joint, float bit and draw range',()=>{
  const geometry=new THREE.BoxGeometry().toNonIndexed(),count=geometry.attributes.position.count;
  geometry.setAttribute('color',new THREE.Float32BufferAttribute(new Float32Array(count*3).fill(.37),3));geometry.setAttribute('unitJoint',new THREE.Float32BufferAttribute(new Float32Array(count),1));
  const color=geometry.attributes.color;new Uint32Array(color.array.buffer)[3*3]++;color.setY(3,-0);color.name='Original tint';color.normalized=true;geometry.attributes.unitJoint.setX(4,1);
  geometry.setDrawRange(3,30);const originals=Object.fromEntries(Object.entries(geometry.attributes).map(([name,a])=>[name,{array:a.array.slice(),itemSize:a.itemSize,normalized:a.normalized,name:a.name}])),groups=structuredClone(geometry.groups),range={...geometry.drawRange};
  assert.equal(indexExactVertices(geometry),true);assert.ok(geometry.attributes.position.count<count);assert.equal(geometry.index.count,count);assert.deepEqual(geometry.groups,groups);assert.deepEqual(geometry.drawRange,range);
  for(const [name,source]of Object.entries(originals)){
    const current=geometry.attributes[name],expanded=new Float32Array(source.array.length);assert.equal(current.normalized,source.normalized);assert.equal(current.name,source.name);
    for(let i=0;i<count;i++){const index=geometry.index.getX(i);expanded.set(current.array.subarray(index*source.itemSize,(index+1)*source.itemSize),i*source.itemSize);}
    assert.deepEqual(new Uint32Array(expanded.buffer),new Uint32Array(source.array.buffer),name+' remains bit-identical in triangle order');
  }
  assert.ok(geometry.userData.exactVertexReuse.vertexBytesAfter+geometry.userData.exactVertexReuse.indexBytes<geometry.userData.exactVertexReuse.vertexBytesBefore);geometry.dispose();
});

test('different vertices with the same hash remain distinct, while exact repeats share storage',()=>{
  // Two finite Float32 triples collide under the production hash. Equality must
  // inspect all words rather than allowing the hash to remove a real vertex.
  const a=[1065209115,1057465844,1058533672],b=[1060796229,1057078444,1058054374],words=Uint32Array.from([...a,...b,...a,...b,...a,...b]),geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.BufferAttribute(new Float32Array(words.buffer),3));
  assert.equal(indexExactVertices(geometry),true);assert.equal(geometry.attributes.position.count,2);assert.deepEqual(Array.from(geometry.index.array),[0,1,0,1,0,1]);assert.deepEqual(new Uint32Array(geometry.attributes.position.array.buffer),Uint32Array.from([...a,...b]));geometry.dispose();
});

test('large exact indices cannot overflow 16 bits or wrap the last canonical vertex',()=>{
  const unique=65536,array=new Float32Array(unique*2*3);for(let repeat=0;repeat<2;repeat++)for(let i=0;i<unique;i++){array[(repeat*unique+i)*3]=i;array[(repeat*unique+i)*3+2]=i%5;}
  const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.BufferAttribute(array,3));assert.equal(indexExactVertices(geometry),true);assert.ok(geometry.index.array instanceof Uint32Array);assert.equal(geometry.attributes.position.count,unique);assert.equal(geometry.index.getX(unique-1),65535);assert.equal(geometry.index.getX(unique),0);geometry.dispose();
});

test('exact indexing leaves unsupported mutable, integer, morph and previously indexed layouts untouched',()=>{
  for(const type of ['dynamic','integer','morph','indexed']){const geometry=type==='indexed'?new THREE.BoxGeometry():new THREE.BoxGeometry().toNonIndexed(),position=geometry.attributes.position,index=geometry.index;
    if(type==='dynamic')position.setUsage(THREE.DynamicDrawUsage);if(type==='integer')geometry.setAttribute('flags',new THREE.Uint16BufferAttribute(new Uint16Array(position.count),1));if(type==='morph')geometry.morphAttributes.position=[position.clone()];
    assert.equal(indexExactVertices(geometry),false);assert.equal(geometry.attributes.position,position);assert.equal(geometry.index,index);geometry.dispose();
  }
});

test('static model merging reuses solid vertices without modifying shared originals or moving gate parts',()=>{
  const geometry=new THREE.BoxGeometry(),material=new THREE.MeshStandardMaterial(),group=new THREE.Group(),solid=new THREE.Mesh(geometry,material),gate=new THREE.Group(),bar=new THREE.Mesh(geometry,material);solid.position.set(4,2,-3);gate.userData.gate=true;gate.add(bar);group.add(solid,gate);const original=geometry.attributes.position.array.slice();
  WorldView.prototype.mergeModel.call({materials:{}},group);const merged=group.children.find(child=>child.isMesh);assert.ok(merged.geometry.index);assert.equal(merged.geometry.attributes.position.count,geometry.attributes.position.count);assert.equal(gate.children[0],bar);assert.equal(bar.geometry,geometry);assert.deepEqual(geometry.attributes.position.array,original);
  const flat=geometry.toNonIndexed();for(let i=0;i<merged.geometry.index.count;i++){const actual=new THREE.Vector3().fromBufferAttribute(merged.geometry.attributes.position,merged.geometry.index.getX(i)),expected=new THREE.Vector3().fromBufferAttribute(flat.attributes.position,i).add(solid.position);assert.deepEqual(actual.toArray(),expected.toArray());}
  flat.dispose();merged.geometry.dispose();geometry.dispose();material.dispose();
});

test('indexed model inputs retain their original sharing and unshared triangles get identity indices',()=>{
  const geometry=new THREE.BoxGeometry(),index=geometry.index,position=geometry.attributes.position;assert.equal(ensureModelIndices(geometry),false);assert.equal(geometry.index,index);assert.equal(geometry.attributes.position,position);
  const triangle=new THREE.BufferGeometry();triangle.setAttribute('position',new THREE.Float32BufferAttribute([0,0,0,1,0,0,0,1,0],3));const original=triangle.attributes.position;assert.equal(ensureModelIndices(triangle),true);assert.deepEqual(Array.from(triangle.index.array),[0,1,2]);assert.equal(triangle.attributes.position,original);geometry.dispose();triangle.dispose();
});

test('palette baking preserves indexed face order, team masks and independent surface materials',()=>{
  const team=new THREE.MeshStandardMaterial({color:0x84b7dd}),metal=new THREE.MeshStandardMaterial({color:0x667788,roughness:.3,metalness:.7}),wood=new THREE.MeshStandardMaterial(),first=new THREE.Mesh(new THREE.BoxGeometry(),team),second=new THREE.Mesh(new THREE.BoxGeometry(),metal),model=new THREE.Group();first.position.x=2;second.position.x=-2;model.add(first,second);
  const view={materials:{wood},teamMaterials:[team],roofMaterials:[]},merged=mergeUnitModel(view,model,true),geometry=merged.children[0].geometry;
  assert.equal(geometry.index.count,72);assert.equal(geometry.attributes.position.count,48);
  for(let i=0;i<72;i++){const source=i<36?first:second,sourceIndex=source.geometry.index.getX(i%36),index=geometry.index.getX(i),actual=new THREE.Vector3().fromBufferAttribute(geometry.attributes.position,index),expected=new THREE.Vector3().fromBufferAttribute(source.geometry.attributes.position,sourceIndex).add(source.position);assert.deepEqual(actual.toArray(),expected.toArray());assert.equal(geometry.attributes.unitTeamMask.getX(index),i<36?1:0);assert.equal(geometry.attributes.unitSurface.getX(index),Math.fround(source.material.roughness));assert.equal(geometry.attributes.unitSurface.getY(index),Math.fround(source.material.metalness));const color=i<36?[1,1,1]:metal.color.toArray();for(let k=0;k<3;k++)assert.equal(geometry.attributes.color.getComponent(index,k),Math.fround(color[k]));}
  geometry.dispose();first.geometry.dispose();second.geometry.dispose();for(const material of [team,metal,wood,view.materials.unitPalette])material.dispose();
});
