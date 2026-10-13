import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {Landscape} from '../src/landscape.js';
import {prepareTerrainGeometry,terrainWeights,roadDistance} from '../src/terrain-layout.js';
import {GroundCover} from '../src/ground-cover.js';
import {TerrainDetails,pebbleGeometry} from '../src/terrain-details.js';

test('terrain material transitions preserve roads and form normalized finite weights over all biomes',()=>{
  for(const map of ['highlands','winter','desert','canyon','valley','rivers','coast']){
    const land=new Landscape(512,map,400),geometry=land.geometry(800,112),prepared=prepareTerrainGeometry(geometry,land);
    assert.equal(prepared.weights.length,geometry.attributes.position.count*3);assert.ok(prepared.diagnostics.heightRange.max-prepared.diagnostics.heightRange.min>15);
    for(let i=0;i<prepared.weights.length;i+=3){const values=prepared.weights.slice(i,i+3);assert.ok(values.every(value=>Number.isFinite(value)&&value>=0&&value<=1));assert.ok(Math.abs(values[0]+values[1]+values[2]-1)<1e-6);}
    const town=land.settlements[0],end=land.map==='coast'?{x:Math.sign(town.x)*20,z:town.z}:{x:town.x*.2,z:0},x=(town.x+end.x)/2,z=(town.z+end.z)/2;
    assert.ok(roadDistance(x,z,land)<1e-8);assert.ok(terrainWeights(land,x,1,z,1).soil>.85);
    assert.ok(terrainWeights(land,60,8,60,.65).rock>terrainWeights(land,60,1,60,1).rock);
    assert.equal(land.heightAt(town.x,town.z),.65,'settlement construction keeps a flat starting area');geometry.dispose();
  }
});

test('solid terrain pebbles are bounded, seeded, hidden by fog and cleared beneath live foundations',()=>{
  const geometry=pebbleGeometry(),edges=new Map(),p=geometry.attributes.position;
  const key=i=>[p.getX(i),p.getY(i),p.getZ(i)].map(value=>value.toFixed(5)).join(':');
  for(let i=0;i<p.count;i+=3)for(let j=0;j<3;j++){const pair=[key(i+j),key(i+(j+1)%3)].sort().join('|');edges.set(pair,(edges.get(pair)||0)+1);}
  assert.ok([...edges.values()].every(count=>count===2));assert.ok(geometry.boundingBox.max.y-geometry.boundingBox.min.y>.3);assert.ok(p.array.every(Number.isFinite));geometry.dispose();
  const land=new Landscape(512,'highlands'),ground=land.geometry(320,112),view={landscape:land,terrain:new THREE.Group(),settings:{quality:'low',fog:true},sim:{entities:[],isExplored:()=>false},clock:0,target:new THREE.Vector3(),zoom:40,angle:0,tilt:.7};
  view.groundCover=new GroundCover(view);const details=new TerrainDetails(view),copy=new TerrainDetails({...view,terrain:new THREE.Group()});
  const textured=new TerrainDetails({...view,terrain:new THREE.Group(),materials:{rock:new THREE.MeshStandardMaterial({vertexColors:true})}});assert.equal(textured.mesh.material.vertexColors,false,'uncolored pebbles use instance colors without missing baked attributes');textured.mesh.geometry.dispose();textured.mesh.material.dispose();textured.mesh.dispose();
  assert.deepEqual(details.entries,copy.entries);assert.ok(details.entries.length>20&&details.entries.length<=120);
  details.update(false,true);assert.equal(details.mesh.count,0);view.sim.isExplored=()=>true;details.update(false,true);const before=details.mesh.count;
  const e=details.entries[0];view.sim.entities.push({kind:'building',x:e.x,z:e.z,r:15,hp:100});view.groundCover.update(false,true);details.update(false,true);assert.ok(details.mesh.count<before);
  const matrix=new THREE.Matrix4();for(let i=0;i<details.mesh.count;i++){details.mesh.getMatrixAt(i,matrix);assert.ok(Math.hypot(matrix.elements[12]-e.x,matrix.elements[14]-e.z)>=15.99);}
  assert.equal(view.terrainDetailDiagnostics.drawCalls,1);assert.ok(view.terrainDetailDiagnostics.capacity<=120);
  for(const item of [details,copy]){item.mesh.geometry.dispose();item.mesh.material.dispose();item.mesh.dispose();}view.groundCover.mesh.geometry.dispose();view.groundCover.mesh.material.dispose();view.groundCover.mesh.dispose();ground.dispose();
});
