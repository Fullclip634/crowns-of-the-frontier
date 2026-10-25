import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {WorldInteractions} from '../src/world-interactions.js';
import {prepareViewport} from '../src/render-batches.js';

test('depleting ore keeps its navigable footprint, ground position and resource quantities',()=>{
  const nodes=new Map(),entities=['gold','stone'].map((type,id)=>({id,kind:'resource',type,hp:1,x:0,z:0,amount:1200,initialAmount:1200}));
  const view={scene:new THREE.Scene(),geo:{box:new THREE.BoxGeometry(),cylinder:new THREE.CylinderGeometry(),rock3d:new THREE.DodecahedronGeometry(),capsule:new THREE.CapsuleGeometry()},materials:Object.fromEntries(['wood','canvas','gold','stone','trunk'].map(role=>[role,new THREE.MeshStandardMaterial()])),nodes,clock:0,sim:{entities,isVisible:()=>true,isExplored:()=>true}};
  for(const e of entities){const node=new THREE.Mesh(new THREE.BoxGeometry(3.4,1.5,3.4));node.geometry.translate(0,.75,0);node.position.set(4,2,8);nodes.set(e.id,node);}
  const interactions=new WorldInteractions(view);
  for(const fraction of [1,.5,.05,.00001]){
    for(const e of entities)e.amount=e.initialAmount*fraction;
    interactions.update(.016,false);
    for(const e of entities){const node=nodes.get(e.id),bounds=new THREE.Box3().setFromObject(node),size=bounds.getSize(new THREE.Vector3());assert.ok(Math.abs(size.x-3.4)<1e-6&&Math.abs(size.z-3.4)<1e-6,'workers keep the same rock footprint to approach');assert.ok(size.y>1.2&&size.y<=1.5,'the pick still has an exposed face to strike');assert.equal(bounds.min.y,2,'depletion remains grounded');assert.equal(e.amount,1200*fraction);}
  }
  interactions.dispose();for(const node of nodes.values()){node.geometry.dispose();node.material.dispose();}for(const geometry of Object.values(view.geo))geometry.dispose();for(const material of Object.values(view.materials))material.dispose();
});

test('harvested remains reuse stationary poses while fog, removal and movement repack correct instances',()=>{
  const first={id:1,type:'wood',hp:0,x:1,z:2},second={id:2,type:'wood',hp:0,x:8,z:3},worker={id:3,kind:'unit',type:'villager',hp:10,x:4,z:5,carry:18,carryType:'wood',owner:0};
  let reveal=false,samples=0;
  const view={camera:new THREE.PerspectiveCamera(45,1,.1,1000),scene:new THREE.Scene(),geo:{box:new THREE.BoxGeometry(),cylinder:new THREE.CylinderGeometry(),rock3d:new THREE.DodecahedronGeometry(),capsule:new THREE.CapsuleGeometry()},materials:Object.fromEntries(['wood','canvas','gold','stone','trunk'].map(role=>[role,new THREE.MeshStandardMaterial()])),nodes:new Map(),clock:0,
    groundHeight:()=>{samples++;return 1;},entityHeight:()=>1,sim:{entities:[first,second,worker],time:0,isVisible:()=>true,isExplored:x=>x<5||reveal}};
  const interactions=new WorldInteractions(view);interactions.update(.016,false);const initial=interactions.stumps.instanceMatrix.version,terrainSamples=samples;
  assert.equal(interactions.stumps.count,1);assert.equal(view.interactionDiagnostics.matrixUploadBytes,128);
  assert.deepEqual(interactions.cargo.wood.instanceMatrix.updateRanges,[{start:0,count:16}]);
  const carried=new THREE.Matrix4();view.footPoses=new Map([[worker.id,{x:worker.x,z:worker.z,bodyOffset:-.2}]]);interactions.alignCargoFeet();interactions.cargo.wood.getMatrixAt(0,carried);assert.ok(Math.abs(carried.elements[13]-2.04)<1e-6,'cargo follows a body adjustment computed later in the current frame');
  view.footPoses.get(worker.id).bodyOffset=-.1;interactions.alignCargoFeet();interactions.cargo.wood.getMatrixAt(0,carried);assert.ok(Math.abs(carried.elements[13]-2.14)<1e-6,'alignment applies the latest offset once without accumulating it');
  view.clock=.1;interactions.update(.016,false);assert.equal(interactions.stumps.instanceMatrix.version,initial);assert.equal(samples,terrainSamples,'idle remains do not resample the same terrain');assert.equal(view.interactionDiagnostics.matrixUploadBytes,64);
  reveal=true;view.clock=.2;interactions.update(.016,false);assert.equal(interactions.stumps.count,2);assert.ok(interactions.stumps.instanceMatrix.version>initial);assert.deepEqual(interactions.stumps.instanceMatrix.updateRanges,[{start:0,count:32}]);
  view.sim.entities=[second,worker];view.clock=3;interactions.update(.016,false);const matrix=new THREE.Matrix4();interactions.stumps.getMatrixAt(0,matrix);assert.equal(matrix.elements[12],second.x);assert.equal(matrix.elements[14],second.z);assert.equal(view.interactionDiagnostics.cachedStumps,1,'removed entities leave no retained pose');
  second.x=9;view.clock=3.1;interactions.update(.016,false);interactions.stumps.getMatrixAt(0,matrix);assert.equal(matrix.elements[12],9,'changed positions invalidate the cached matrix');
  view.camera.position.set(0,30,40);view.camera.lookAt(0,0,0);prepareViewport(view);worker.x=500;interactions.update(.016,false);assert.equal(interactions.cargo.wood.count,0);assert.equal(view.interactionDiagnostics.culledCargo,1);assert.equal(view.interactionDiagnostics.matrixUploadBytes,0);
  view.camera.position.set(500,30,40);view.camera.lookAt(500,0,0);prepareViewport(view);interactions.update(.016,false);assert.equal(interactions.cargo.wood.count,1);interactions.cargo.wood.getMatrixAt(0,matrix);assert.equal(matrix.elements[12],500);assert.equal(view.interactionDiagnostics.culledCargo,0);
  worker.carry=0;view.sim.entities=[];view.clock=6;interactions.update(.016,false);assert.equal(view.interactionDiagnostics.matrixUploadBytes,0);assert.equal(view.interactionDiagnostics.cachedStumps,0);assert.equal(interactions.stumps.count,0);
  interactions.dispose();for(const geometry of Object.values(view.geo))geometry.dispose();for(const material of Object.values(view.materials))material.dispose();
});
