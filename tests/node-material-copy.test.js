import test from 'node:test';import assert from 'node:assert/strict';
import * as THREE from 'three';
import {MeshStandardNodeMaterial} from '../src/render-nodes.js';
import {shaderPreview} from '../src/shader-preparation.js';
import {materialColor,float} from 'three/tsl';

test('node material variants and shader previews preserve PBR maps, tint and node graphs',()=>{
  const map=new THREE.DataTexture(new Uint8Array([128,128,255,255]),1,1),source=new MeshStandardNodeMaterial({color:0x835c24,map,normalMap:map,roughnessMap:map,roughness:.32,metalness:.6});source.normalScale.set(.3,.45);
  source.colorNode=materialColor;
  source.aoNode=float(.6);
  const scene=new THREE.Scene(),mesh=new THREE.Mesh(new THREE.BoxGeometry(),source);scene.add(mesh);
  const preview=shaderPreview(scene),copy=preview.materials.get(source),variant=source.clone();
  for(const material of [copy,variant]){
    assert.equal(material.map,map);assert.equal(material.normalMap,map);assert.equal(material.roughnessMap,map);assert.equal(material.color.getHex(),source.color.getHex());assert.notEqual(material.color,source.color);
    assert.equal(material.roughness,.32);assert.equal(material.metalness,.6);assert.deepEqual(material.normalScale.toArray(),[.3,.45]);
    assert.equal(material.colorNode,source.colorNode);
    assert.equal(material.aoNode,source.aoNode);
  }
  variant.color.setHex(0x33aa55);assert.equal(source.color.getHex(),0x835c24,'placement tint must remain independent');
  preview.dispose();variant.dispose();source.dispose();mesh.geometry.dispose();map.dispose();
});
