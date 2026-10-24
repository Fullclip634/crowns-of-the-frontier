import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {Landscape} from '../src/landscape.js';
import {terrainGridCoordinate} from '../src/terrain-grid.js';

test('terrain concentrates the existing vertex budget inside the battlefield and retains world-space texture coordinates',()=>{
  for(const worldSize of [160,320,400,560])for(const segments of [112,160]){
    const land=new Landscape(512,'highlands',worldSize),geometry=land.geometry(),full=land.geometry(land.renderSize,segments),p=full.attributes.position,uv=full.attributes.uv,axis=land.grid.axis;
    assert.equal(p.count,(segments+1)**2);assert.equal(full.index.count,segments*segments*6);
    assert.equal(axis[0],-worldSize);assert.equal(axis[segments],worldSize);
    assert.ok(axis.filter(value=>Math.abs(value)<=worldSize/2).length>=segments*.74,'most rows serve the playable square');
    for(let index=0;index<=segments;index++){
      assert.ok(Math.abs(terrainGridCoordinate(axis[index],land.grid)-index)<1e-10);
      if(index<segments){const middle=(axis[index]+axis[index+1])/2;assert.ok(Math.abs(terrainGridCoordinate(middle,land.grid)-index-.5)<1e-10);assert.ok(axis[index+1]>axis[index]);}
    }
    for(let i=0;i<p.count;i+=19){assert.ok(Math.abs(uv.getX(i)-(p.getX(i)+worldSize)/(worldSize*2))<1e-7);assert.ok(Math.abs(uv.getY(i)-(1-(p.getZ(i)+worldSize)/(worldSize*2)))<1e-7);}
    full.dispose();geometry.dispose();
  }
});

test('unit grounding and terrain commands agree with raycast triangles on the focused grid',()=>{
  for(const segments of [112,160])for(const map of ['highlands','canyon','rivers']){
    const land=new Landscape(91,map,560),geometry=land.geometry(land.renderSize,segments),material=new THREE.MeshBasicMaterial({side:THREE.DoubleSide}),mesh=new THREE.Mesh(geometry,material),raycaster=new THREE.Raycaster();
    mesh.updateMatrixWorld();
    for(const [x,z]of [[-279.1,-279.3],[279.3,279.1],[-141.17,89.13],[33.1,55.7],[279.1,-91.3],[-91.3,279.1],[0,0]]){
      raycaster.set(new THREE.Vector3(x,100,z),new THREE.Vector3(0,-1,0));const hit=raycaster.intersectObject(mesh)[0];assert.ok(hit);
      assert.ok(Math.abs(hit.point.y-land.surfaceHeightAt(x,z))<1e-5,`${map}/${segments} grounding follows visible triangles`);
      if(map!=='rivers'||Math.abs(x)>35){const command=land.rayPoint(raycaster.ray);assert.ok(command);assert.ok(Math.abs(command.y-hit.point.y)<.002,'commands hit the same visible ground');}
    }
    geometry.dispose();material.dispose();
  }
});
