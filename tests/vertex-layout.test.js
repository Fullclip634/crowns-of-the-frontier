import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {interleaveStaticVertices} from '../src/vertex-layout.js';

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
