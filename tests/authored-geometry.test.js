import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {canonicalGeometry} from '../src/authored-assets.js';

test('full precision catalogue attributes keep their shared buffers and exact drawable geometry',()=>{
  const geometry=new THREE.BufferGeometry(),position=new THREE.BufferAttribute(new Float32Array([.12345679,0,0,1.9876543,0,0,0,2.3456788,0]),3),normal=new THREE.Float32BufferAttribute([0,0,1,0,0,1,0,0,1],3),uv=new THREE.Float32BufferAttribute([0,0,1,0,0,1],2),color=new THREE.Float32BufferAttribute([1,.25,0,.1,.2,.3,0,.75,1],3);
  for(const [name,attribute]of Object.entries({position,normal,uv,color}))geometry.setAttribute(name,attribute);geometry.setIndex([0,1,2]);const index=geometry.index,expected=Array.from(position.array);
  canonicalGeometry(geometry);
  for(const [name,attribute]of Object.entries({position,normal,uv,color})){assert.equal(geometry.getAttribute(name),attribute);assert.equal(geometry.getAttribute(name).array.buffer,attribute.array.buffer);}
  assert.deepEqual(Array.from(geometry.attributes.position.array),expected);assert.equal(geometry.index,index);assert.ok(geometry.boundingBox.max.y>2.34);assert.ok(Number.isFinite(geometry.boundingSphere.radius));
  geometry.dispose();
});

test('normalized, interleaved and RGBA catalogue data still converts to complete float attributes',()=>{
  const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute([0,0,0,1,0,0,0,1,0],3));
  const packed=new THREE.InterleavedBuffer(new Int16Array([0,0,32767,9,32767,0,0,9,0,-32767,0,9]),4),normal=new THREE.InterleavedBufferAttribute(packed,3,0,true),color=new THREE.BufferAttribute(new Uint8Array([255,128,0,255,0,255,64,128,32,0,255,0]),4,true);
  geometry.setAttribute('normal',normal);geometry.setAttribute('color',color);canonicalGeometry(geometry);
  assert.deepEqual(Array.from(geometry.attributes.normal.array),[0,0,1,1,0,0,0,-1,0]);assert.equal(geometry.attributes.normal.isInterleavedBufferAttribute,undefined);assert.equal(geometry.attributes.normal.normalized,false);
  assert.equal(geometry.attributes.color.itemSize,3);assert.equal(geometry.attributes.color.array.length,9);assert.ok(Math.abs(geometry.attributes.color.getY(0)-128/255)<1e-7);assert.equal(geometry.attributes.color.getZ(2),1);
  assert.equal(geometry.attributes.uv.count,3);assert.deepEqual(Array.from(packed.array),[0,0,32767,9,32767,0,0,9,0,-32767,0,9]);assert.equal(color.itemSize,4);
  assert.ok(Object.values(geometry.attributes).every(attribute=>attribute.array instanceof Float32Array&&attribute.array.every(Number.isFinite)));geometry.dispose();
});
