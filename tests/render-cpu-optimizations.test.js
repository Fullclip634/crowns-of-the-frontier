import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {Simulation} from '../src/simulation.js';
import {updateContacts} from '../src/visual-depth.js';
import {WorldInteractions} from '../src/world-interactions.js';
import {takeFromResource} from '../src/resource-vision.js';
import {prepareViewport} from '../src/render-batches.js';
import {LocalMotion} from '../src/motion-smoothing.js';
import {entityGroundHeight} from '../src/entity-ground.js';
import {beginJointPose,endJointPose,animatePart} from '../src/world-polish.js';
import {UnitLocomotion} from '../src/locomotion.js';
import {UnitActions} from '../src/unit-actions.js';

function collectShadowSignatures(mesh){
  const m=new THREE.Matrix4(),out=[];
  for(let i=0;i<mesh.count;i++){
    mesh.getMatrixAt(i,m);
    out.push(Array.from(m.elements,v=>v.toFixed(4)).join(','));
  }
  return out.sort();
}

test('spatial updateContacts matches full-entity scan matrix-for-matrix on a real Simulation and reuses static shadows across stationary frames',()=>{
  const sim=new Simulation({mode:'skirmish',faction:'alder',difficulty:'normal',map:'highlands',seed:2026});
  const tc=sim.owned(0,'building','towncenter')[0];
  const camera=new THREE.PerspectiveCamera(46,16/9,.5,400);
  camera.position.set(tc.x+28,28,tc.z+28);
  camera.lookAt(tc.x,0,tc.z);
  camera.updateMatrixWorld();

  const makeView=(forceFull)=>{
    let samples=0;
    const view={
      sim,camera,clock:0,
      forceFullContactScan:forceFull,
      contactDummy:new THREE.Object3D(),
      contactShadows:new THREE.InstancedMesh(new THREE.PlaneGeometry(),new THREE.MeshBasicMaterial(),1024),
      groundHeight:(x,z)=>{samples++;return Math.sin(x*.05)*Math.cos(z*.05);},
      localMotion:new LocalMotion(),
      localBlend:1,
      get samples(){return samples;},
    };
    prepareViewport(view);
    return view;
  };

  const fullView=makeView(true);
  const fastView=makeView(false);
  updateContacts(fullView,false);
  updateContacts(fastView,false);

  assert.ok(fullView.contactShadows.count>5,'viewport sees multiple contact shadows');
  assert.equal(fastView.contactShadows.count,fullView.contactShadows.count,'exact same visible shadow count');
  assert.deepEqual(
    collectShadowSignatures(fastView.contactShadows),
    collectShadowSignatures(fullView.contactShadows),
    'every contact shadow matrix matches full scan identically'
  );

  // Stationary second frame: zero GPU uploads and zero ground resampling
  const samplesBefore=fastView.samples;
  const versionBefore=fastView.contactShadows.instanceMatrix.version;
  updateContacts(fastView,false);
  assert.equal(fastView.samples,samplesBefore,'stationary frame performs zero ground samples');
  assert.equal(fastView.contactShadows.instanceMatrix.version,versionBefore,'stationary frame skips GPU upload');
  assert.equal(fastView.contactDiagnostics.matrixUploadBytes,0);

  // Moving a unit updates its shadow immediately even while static shadows stay cached
  const unit=sim.owned(0,'unit')[0];
  unit.x+=1.5;
  updateContacts(fullView,false);
  updateContacts(fastView,false);
  assert.deepEqual(
    collectShadowSignatures(fastView.contactShadows),
    collectShadowSignatures(fullView.contactShadows),
    'moved unit shadow stays identical to full scan'
  );

  const foundation=sim.addBuilding('house',0,tc.x+4,tc.z+4);
  const revision=sim.revision;
  updateContacts(fastView,false);
  const beforeConstruction=fastView.contactShadows.count;
  const activeSite={...foundation,progress:.25};
  sim.entities[sim.entities.indexOf(foundation)]=activeSite;
  sim.index.set(activeSite.id,activeSite);
  updateContacts(fullView,false);
  updateContacts(fastView,false);
  assert.equal(sim.revision,revision);
  assert.equal(fastView.contactShadows.count,beforeConstruction+1);
  assert.deepEqual(collectShadowSignatures(fastView.contactShadows),collectShadowSignatures(fullView.contactShadows));

  // Panning the camera refreshes spatial cells cleanly
  camera.position.set(tc.x+52,28,tc.z+12);
  camera.lookAt(tc.x+24,0,tc.z-16);
  camera.updateMatrixWorld();
  prepareViewport(fullView);
  prepareViewport(fastView);
  updateContacts(fullView,false);
  updateContacts(fastView,false);
  assert.deepEqual(
    collectShadowSignatures(fastView.contactShadows),
    collectShadowSignatures(fullView.contactShadows),
    'panned camera contact shadows match full scan identically'
  );

  for(const v of [fullView,fastView]){
    v.contactShadows.geometry.dispose();
    v.contactShadows.material.dispose();
    v.contactShadows.dispose();
  }
});

test('WorldInteractions fast path tracks felled stumps, ore erosion (including recreated nodes), and villager cargo on a real Simulation',()=>{
  const sim=new Simulation({mode:'skirmish',faction:'alder',difficulty:'normal',map:'highlands',seed:303});
  const tc=sim.owned(0,'building','towncenter')[0];
  const camera=new THREE.PerspectiveCamera(46,16/9,.5,400);
  camera.position.set(tc.x+20,28,tc.z+20);
  camera.lookAt(tc.x,0,tc.z);
  camera.updateMatrixWorld();

  const gold=sim.entities.find(e=>e.kind==='resource'&&e.type==='gold'&&sim.isVisible(e.x,e.z))||sim.entities.find(e=>e.kind==='resource'&&e.type==='gold');
  const tree=sim.entities.find(e=>e.kind==='resource'&&e.type==='wood'&&sim.isVisible(e.x,e.z));
  const villager=sim.owned(0,'unit','villager')[0];
  assert.ok(gold&&tree&&villager);

  const nodes=new Map();
  const goldNode=new THREE.Group();
  nodes.set(gold.id,goldNode);

  const view={
    sim,camera,scene:new THREE.Scene(),nodes,clock:1,exploredRevision:0,
    geo:{box:new THREE.BoxGeometry(),cylinder:new THREE.CylinderGeometry(),rock3d:new THREE.DodecahedronGeometry(),capsule:new THREE.CapsuleGeometry()},
    materials:Object.fromEntries(['wood','canvas','gold','stone','trunk'].map(role=>[role,new THREE.MeshStandardMaterial()])),
    groundHeight:()=>0,entityHeight:()=>0,
  };
  prepareViewport(view);
  const interactions=new WorldInteractions(view);

  // Give villager cargo & erode gold deposit
  villager.x=tc.x+2;villager.z=tc.z+2;villager.carry=12;villager.carryType='wood';
  gold.initialAmount=1800;gold.amount=900;
  interactions.update(0.016,false);
  assert.equal(interactions.cargo.wood.count,1);
  assert.ok(Math.abs(goldNode.scale.y-(.85+.15*.5))<1e-6,'ore height reflects remaining amount');

  // If gold node is released offscreen and recreated fresh at scale 1, erosion reapplies immediately
  const freshGoldNode=new THREE.Group();
  nodes.set(gold.id,freshGoldNode);
  interactions.update(0.016,false);
  assert.ok(Math.abs(freshGoldNode.scale.y-(.85+.15*.5))<1e-6,'recreated ore node gets eroded scale');

  // Fell a visible tree -> stump count increases and treeFall starts
  tree.hp=0;tree.amount=0;sim.resourceRevision=(sim.resourceRevision||0)+1;
  interactions.update(0.016,false);
  const stumpVersion=interactions.stumps.instanceMatrix.version;
  assert.equal(interactions.stumps.count,1);
  assert.equal(view.treeFalls.has(tree.id),true);

  // Next frame with no resource/fog changes skips stump buffer re-upload
  view.clock=1.1;
  interactions.update(0.016,false);
  assert.equal(interactions.stumps.instanceMatrix.version,stumpVersion);

  const entityArray=sim.entities;
  const addedTree=sim.addResource('wood',tc.x+2,tc.z+2,220);
  assert.equal(sim.entities,entityArray);
  interactions.update(0.016,false);
  takeFromResource(sim,addedTree,addedTree.amount);
  interactions.update(0.016,false);
  assert.equal(interactions.stumps.count,2);
  assert.ok(view.treeFalls.has(addedTree.id));

  interactions.dispose();
  for(const g of Object.values(view.geo))g.dispose();
  for(const m of Object.values(view.materials))m.dispose();
});

test('hoisted beginJointPose and indexed jointPoseSlots match standalone animatePart bit-for-bit',()=>{
  const locomotion=new UnitLocomotion();
  const unitActions=new UnitActions();
  const root=new THREE.Matrix4().makeTranslation(12,1,-8);
  const parentJoint={type:'torso',pivot:[0,1.2,0]};
  const armJoint={type:'arm',side:1,pivot:[.4,1.45,0],parent:parentJoint};
  const forearmJoint={type:'forearm',side:1,pivot:[.45,1.1,0],parent:armJoint};
  const parts=[parentJoint,armJoint,forearmJoint].map(motion=>({userData:{motion}}));

  const entities=[
    {id:1,type:'spearman',moving:true,cooldown:0,x:12,z:-8,hp:60,maxHp:60},
    {id:2,type:'swordsman',moving:false,cooldown:.6,x:14,z:-8,hp:70,maxHp:70},
    {id:3,type:'archer',moving:false,cooldown:.4,order:{type:'attack',target:99},x:16,z:-8,hp:50,maxHp:50},
    {id:4,type:'villager',moving:false,cooldown:0,carry:0,x:10,z:-8,hp:40,maxHp:40},
  ];
  for(const e of entities)locomotion.update(e,e.x,e.z,0.05);

  const view={clock:3.25,sim:{time:3.25},combatTime:3.28,locomotion,unitActions,jointPoseSlots:[],jointPoseDiagnostics:{computed:0,reused:0}};
  for(const e of entities){
    // Compute reference outputs without beginJointPose (standalone path)
    const ref=parts.map(p=>animatePart(view,p,e,root).clone());
    // Compute cached outputs via beginJointPose / jointPoseSlots
    beginJointPose(view,e,root);
    const cached=parts.map(p=>animatePart(view,p,e,root).clone());
    endJointPose(view);
    for(let i=0;i<parts.length;i++){
      assert.deepEqual(Array.from(cached[i].elements),Array.from(ref[i].elements),`joint ${i} matches bit-for-bit for ${e.type}`);
    }
  }
  assert.ok(view.jointPoseDiagnostics.reused>0,'shared parent joints are reused via indexed slots');
});

test('entityGroundHeight retains cached samples across worker snapshot object replacement by entity id',()=>{
  let calls=0;
  const view={sim:{},landscape:{grid:{}},groundHeight:(x,z)=>{calls++;return x*.5+z*.25;}};
  const snap1={id:77,x:10,z:20};
  const snap2={id:77,x:10,z:20}; // fresh object clone from worker delta!
  assert.equal(entityGroundHeight(view,snap1,10,20),10);
  assert.equal(entityGroundHeight(view,snap2,10,20),10);
  assert.equal(calls,1,'same entity id at same coords reuses height across object clones');
});
