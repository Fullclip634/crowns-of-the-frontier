import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {GroundCover,grassTuftGeometry} from '../src/ground-cover.js';
import {Landscape} from '../src/landscape.js';

test('grass blades are closed solid meshes with thickness and finite normals',()=>{
  const geometry=grassTuftGeometry(),edges=new Map(),index=geometry.index.array;
  for(let i=0;i<index.length;i+=3)for(let k=0;k<3;k++){const a=index[i+k],b=index[i+(k+1)%3],key=Math.min(a,b)+':'+Math.max(a,b);edges.set(key,(edges.get(key)||0)+1);}
  assert.ok([...edges.values()].every(count=>count===2));
  assert.ok(geometry.boundingBox.max.y>.4);assert.ok(geometry.boundingBox.max.z-geometry.boundingBox.min.z>.1);
  assert.ok(geometry.attributes.normal.array.every(Number.isFinite));assert.equal(geometry.index.count/3,84);geometry.dispose();
});

test('seeded ground cover obeys terrain, exploration and newly built foundations with one draw call',()=>{
  const land=new Landscape(512,'highlands'),view={landscape:land,terrain:new THREE.Group(),settings:{quality:'low',fog:true},sim:{entities:[],isExplored:()=>false},clock:0,target:new THREE.Vector3(),zoom:40,angle:0,tilt:.7};
  const cover=new GroundCover(view),copy=new GroundCover({...view,terrain:new THREE.Group()});
  assert.deepEqual(cover.entries,copy.entries);assert.ok(cover.entries.length>400);
  cover.update(false,true);assert.equal(cover.mesh.count,0);
  view.sim.isExplored=()=>true;cover.update(false,true);const count=cover.mesh.count;assert.ok(count>400);assert.equal(view.groundCoverDiagnostics.drawCalls,1);
  const e=cover.entries[0];view.sim.entities.push({kind:'building',x:e.x,z:e.z,r:15,hp:100});cover.update(false,true);assert.ok(cover.mesh.count<count);
  const matrix=new THREE.Matrix4();for(let i=0;i<cover.mesh.count;i++){cover.mesh.getMatrixAt(i,matrix);assert.ok(Math.hypot(matrix.elements[12]-e.x,matrix.elements[14]-e.z)>=15.99);}
  for(const item of [cover,copy]){item.mesh.geometry.dispose();item.mesh.material.dispose();item.mesh.dispose();}
});
