import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {GroundCover,grassTuftGeometry} from '../src/ground-cover.js';
import {Landscape} from '../src/landscape.js';
import {Simulation} from '../src/simulation.js';
import {nearViewport,prepareViewport} from '../src/render-batches.js';
import {roadDistance} from '../src/terrain-layout.js';

test('grass blades are closed solids with outward-facing surfaces and finite normals',()=>{
  const geometry=grassTuftGeometry(),edges=new Map(),index=geometry.index.array;
  for(let i=0;i<index.length;i+=3)for(let k=0;k<3;k++){const a=index[i+k],b=index[i+(k+1)%3],key=Math.min(a,b)+':'+Math.max(a,b);edges.set(key,(edges.get(key)||0)+1);}
  assert.ok([...edges.values()].every(count=>count===2));
  const positions=geometry.attributes.position,a=new THREE.Vector3(),b=new THREE.Vector3(),c=new THREE.Vector3();
  for(let blade=0;blade<6;blade++){
    let volume=0;
    for(let i=blade*30;i<(blade+1)*30;i+=3){
      a.fromBufferAttribute(positions,index[i]);b.fromBufferAttribute(positions,index[i+1]);c.fromBufferAttribute(positions,index[i+2]);
      volume+=a.dot(b.cross(c))/6;
    }
    assert.ok(volume>0,'each closed blade faces outward');
  }
  assert.ok(geometry.boundingBox.max.y>.4);assert.ok(geometry.boundingBox.max.z-geometry.boundingBox.min.z>.1);
  assert.ok(geometry.attributes.normal.array.every(Number.isFinite));assert.equal(geometry.index.count/3,60);geometry.dispose();
});

test('seeded ground cover obeys terrain, exploration and newly built foundations with one draw call',()=>{
  const land=new Landscape(512,'highlands'),view={landscape:land,terrain:new THREE.Group(),settings:{quality:'low',fog:true},sim:{entities:[],isExplored:()=>false},clock:0,target:new THREE.Vector3(),zoom:40,angle:0,tilt:.7};
  const cover=new GroundCover(view),copy=new GroundCover({...view,terrain:new THREE.Group()});
  assert.deepEqual(cover.entries,copy.entries);assert.ok(cover.entries.length>400);
  cover.update(false,true);assert.equal(cover.mesh.count,0);
  view.sim.isExplored=()=>true;cover.update(false,true);const count=cover.mesh.count;assert.ok(count>400);assert.equal(view.groundCoverDiagnostics.drawCalls,1);
  const matrixVersion=cover.mesh.instanceMatrix.version,colorVersion=cover.mesh.instanceColor.version;
  cover.update(false,true);
  assert.equal(cover.mesh.instanceMatrix.version,matrixVersion);
  assert.equal(cover.mesh.instanceColor.version,colorVersion);
  const e=cover.entries[0];view.sim.entities.push({kind:'building',x:e.x,z:e.z,r:15,hp:100});cover.update(false,true);assert.ok(cover.mesh.count<count);
  const matrix=new THREE.Matrix4();for(let i=0;i<cover.mesh.count;i++){cover.mesh.getMatrixAt(i,matrix);assert.ok(Math.hypot(matrix.elements[12]-e.x,matrix.elements[14]-e.z)>=15.99);}
  for(const item of [cover,copy]){item.mesh.geometry.dispose();item.mesh.material.dispose();item.mesh.dispose();}
});

test('high-quality grass animates via GPU wind uniforms with zero stationary CPU matrix uploads',()=>{
  const land=new Landscape(512,'highlands');
  const view={landscape:land,terrain:new THREE.Group(),settings:{quality:'high',fog:false,reducedMotion:false},sim:{entities:[],isExplored:()=>true},weatherState:{amount:0},clock:1,target:new THREE.Vector3(),zoom:40,angle:0,tilt:.7};
  const cover=new GroundCover(view);
  assert.ok(cover.mesh.count>400);
  const shader={uniforms:{},vertexShader:THREE.ShaderLib.standard.vertexShader,fragmentShader:THREE.ShaderLib.standard.fragmentShader};
  cover.mesh.material.onBeforeCompile(shader);
  assert.equal(shader.uniforms.frontierGrassTime,cover.wind.time);
  assert.equal(shader.uniforms.frontierGrassStrength,cover.wind.strength);
  assert.match(shader.vertexShader,/frontierGrassTime/);

  const calmStrength=cover.wind.strength.value;
  const matrixVersion=cover.mesh.instanceMatrix.version;
  const colorVersion=cover.mesh.instanceColor.version;
  view.clock=2.5;view.weatherState={amount:1};
  cover.update(false,false);
  assert.equal(cover.wind.time.value,2.5,'GPU wind clock updates smoothly every frame');
  assert.ok(cover.wind.strength.value>calmStrength*2,'storm weather strengthens GPU grass sway');
  assert.equal(cover.mesh.instanceMatrix.version,matrixVersion,'stationary High grass never re-uploads instance matrices');
  assert.equal(cover.mesh.instanceColor.version,colorVersion,'stationary High grass never re-uploads instance colors');

  const fullGrass=[...cover.visibleEntries],fullAccents=[...cover.visibleAccents];
  const fullTriangles=view.groundCoverDiagnostics.triangles;
  view.settings.reduceFoliage=true;
  cover.update(false);
  assert.equal(cover.wind.strength.value,0);
  assert.equal(cover.wind.time.value,0);
  assert.ok(cover.mesh.count>0&&cover.mesh.count<fullGrass.length*.65);
  assert.ok(cover.accents.count>0&&cover.accents.count<fullAccents.length);
  assert.ok(view.groundCoverDiagnostics.triangles<fullTriangles*.65);
  assert.ok(cover.visibleEntries.every(entry=>fullGrass.includes(entry)));

  view.settings.reduceFoliage=false;
  cover.update(false);
  assert.ok(cover.wind.strength.value>0);
  assert.deepEqual(cover.visibleEntries,fullGrass);
  assert.deepEqual(cover.visibleAccents,fullAccents);

  view.settings.reducedMotion=true;view.clock=5;
  cover.update(false,false);
  assert.equal(cover.wind.time.value,0);
  assert.equal(cover.wind.strength.value,0,'reduced motion zeroes decorative grass wind');
  cover.mesh.geometry.dispose();cover.mesh.material.dispose();cover.mesh.dispose();
});

test('Epic river settlements keep dense verges and cull off-camera vegetation by cell',()=>{
  const sim=new Simulation({mode:'custom',map:'rivers',mapSize:'epic',seed:512,startAge:1});
  const land=new Landscape(sim.options.seed,sim.options.map,sim.worldSize,sim.spawnPositions,sim.startingSites);
  const town=sim.owned(0,'building','towncenter')[0],scout=sim.owned(0,'unit','scout')[0];
  Object.assign(scout,{x:town.x+18,z:town.z-6});sim.updateFog();
  const target=new THREE.Vector3(town.x+6,.65,town.z-2),camera=new THREE.PerspectiveCamera(46,1200/760,.5,400);
  camera.position.set(target.x+Math.sin(.48)*38,target.y+Math.tan(.76)*38,target.z+Math.cos(.48)*38);
  camera.lookAt(target);
  const view={landscape:land,terrain:new THREE.Group(),settings:{quality:'high',fog:true},sim,camera,clock:0,target,zoom:38,angle:.48,tilt:.76};
  prepareViewport(view);
  const cover=new GroundCover(view);
  cover.update(false,true);

  const verges=cover.visibleEntries.filter(e=>roadDistance(e.x,e.z,land)<6);
  assert.ok(verges.length>75,'viewed paths retain substantial vegetation on their shoulders');
  assert.ok(verges.every(e=>roadDistance(e.x,e.z,land,2.18)>=2.18),'cart tracks stay clear of grass');
  assert.equal(cover.mesh.instanceMatrix.count,4800);
  assert.equal(view.groundCoverDiagnostics.drawCalls,1);

  const frustum=view.frameFrustum,intersects=frustum.intersectsSphere.bind(frustum);
  let tests=0;
  frustum.intersectsSphere=sphere=>{tests++;return intersects(sphere);};
  const expected=new Set(cover.entries.filter(e=>nearViewport(view,e.x,e.y,e.z,6)&&sim.isExplored(e.x,e.z)&&!sim.entities.some(building=>{
    if(building.kind!=='building'||building.hp<=0)return false;
    const clearance=building.r+(building.type==='towncenter'?1.8:1.15);
    return (building.x-e.x)**2+(building.z-e.z)**2<clearance**2;
  })));
  tests=0;
  cover.update(false,true);
  assert.deepEqual(new Set(cover.visibleEntries),expected);
  assert.ok(tests<cover.entries.length*.5,'cells skip most individual frustum tests on an Epic map');

  cover.mesh.geometry.dispose();cover.mesh.material.dispose();cover.mesh.dispose();
});
