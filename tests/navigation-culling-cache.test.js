import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {Simulation} from '../src/simulation.js';
import {planFortification} from '../src/ai-fortifications.js';
import {GroundCover} from '../src/ground-cover.js';
import {TerrainDetails} from '../src/terrain-details.js';
import {Landscape} from '../src/landscape.js';

test('landBase water cache matches uncached grids and reuses resource data across non-resource changes',()=>{
  for(const map of ['valley','coast']){
    const mode=map==='coast'?'tides':'skirmish';
    const cached=new Simulation({mode,map,seed:2026}),uncached=new Simulation({mode,map,seed:2026});
    const baseWater=uncached.isWater.bind(uncached);
    uncached.isWater=(x,z)=>baseWater(x,z);
    assert.deepEqual(cached.grid(0),uncached.grid(0),`${map} cached base water grid matches uncached output`);
  }

  const sim=new Simulation({mode:'skirmish',map:'valley',seed:2026});
  sim.grid(0);
  const initialData=sim.grids.landBase.data;

  // Adding buildings/units and demolishing buildings must reuse landBase.data.
  const house=sim.addBuilding('house',0,-35,25,true);
  sim.grid(0);
  assert.equal(sim.grids.landBase.data,initialData,'addBuilding reuses landBase without rebuilding resources');

  sim.addUnit('spearman',0,-35,30);
  sim.demolish(house.id,0);
  sim.grid(0);
  assert.equal(sim.grids.landBase.data,initialData,'addUnit + demolish reuse landBase without rebuilding resources');

  // A second team on the same revision must take the O(1) landBase fast path
  // without entering the resource-hash scan (which reads resource.water).
  const probe=sim.entities.find(e=>e.hp>0&&e.kind==='resource'&&!e.water&&e.type==='wood');
  let waterReads=0;
  Object.defineProperty(probe,'water',{configurable:true,enumerable:true,get(){waterReads++;return false;}});
  sim.grid(1);
  assert.equal(waterReads,0,'same-revision team lookup skips the landBase resource hash scan');
  assert.equal(sim.grids.landBase.data,initialData);
  sim.revision++;
  sim.grid(1);
  assert.equal(waterReads,1,'new revision runs the resource hash scan once and still reuses landBase');
  assert.equal(sim.grids.landBase.data,initialData);
  delete probe.water;

  // Adding or depleting a blocking resource must rebuild landBase.
  const added=sim.addResource('wood',-32,26,220);
  sim.grid(0);
  assert.notEqual(sim.grids.landBase.data,initialData,'adding a blocking resource rebuilds landBase');
  const afterAddData=sim.grids.landBase.data,cell=sim.cell(added.x,added.z);
  assert.equal(afterAddData[cell.z*sim.gridSize+cell.x],1);

  added.hp=0;added.amount=0;sim.revision++;
  sim.grid(0);
  assert.notEqual(sim.grids.landBase.data,afterAddData,'depleting a blocking resource rebuilds landBase');
});

test('plannedSimulation reuses landBase without aliasing and lazily warms parent landBase',()=>{
  const sim=new Simulation({mode:'skirmish',map:'valley',seed:2026});
  const base=sim.owned(1,'building','towncenter')[0];
  sim.players[1].resources={food:2000,wood:2000,gold:2000,stone:2000};
  sim.addBuilding('tower',1,base.x-10,base.z+10,true);
  sim.grid(1);

  const simLandBase=sim.grids.landBase,origGrid=Object.getPrototypeOf(sim).grid;
  let previewFirstCalls=0,reused=0,rebuilt=0,aliased=0;
  Object.getPrototypeOf(sim).grid=function(owner,naval=false){
    const isPreview=this!==sim,isFirst=isPreview&&!naval&&this.grids[owner]?.revision!==this.revision;
    const beforeData=this.grids?.landBase?.data;
    if(isFirst&&this.grids.landBase===simLandBase)aliased++;
    const result=origGrid.call(this,owner,naval);
    if(isFirst){
      previewFirstCalls++;
      if(this.grids.landBase.data===beforeData)reused++;else rebuilt++;
    }
    return result;
  };
  try{
    const plan=planFortification(sim,{fortifications:[]},1,base,sim.owned(1,'building'));
    assert.ok(plan,'fortification plan is found');
    assert.ok(previewFirstCalls>=1);
    assert.equal(reused,previewFirstCalls,'every preview reuses sim landBase data');
    assert.equal(rebuilt,0,'no preview rebuilds landBase when resources are unchanged');
    assert.equal(aliased,0,'preview shallow-copies the landBase wrapper instead of aliasing it');
  }finally{
    Object.getPrototypeOf(sim).grid=origGrid;
  }

  // When sim.grids starts empty, preview lazily populates sim.grids.landBase.
  sim.grids={};
  const planCold=planFortification(sim,{fortifications:[]},1,base,sim.owned(1,'building'));
  assert.ok(planCold);
  assert.equal(sim.grids.landBase?.revision,sim.revision,'cold preview warms parent landBase for reuse');
});

test('human villager gather retargeting falls back past 8 unreachable resources including blocked-cell starts',()=>{
  // Case 1: 10 closer trees across water on coast, 1 reachable tree on home shore.
  const coast=new Simulation({mode:'tides',seed:2026});
  coast.tickAI=()=>{};
  for(const e of coast.entities)if(e.kind==='resource'&&e.type==='wood'){e.hp=0;e.amount=0;}
  for(let i=0;i<10;i++)coast.addResource('wood',16+(i%2)*2,-9+i*2,220);
  const homeTree=coast.addResource('wood',-53,0,220);
  const deadTree=coast.addResource('wood',-18,0,1);deadTree.hp=0;deadTree.amount=0;
  const worker=coast.addUnit('villager',0,-16,0);
  worker.gatherType='wood';worker.order={type:'gather',target:deadTree.id};
  coast.revision++;
  coast.tickUnit(worker,.1);
  assert.equal(worker.order?.type,'gather');
  assert.equal(worker.order?.target,homeTree.id,'retargets to reachable home-shore tree past 8 far-shore trees');

  // Case 2: villager standing inside a 1-cell blocked barrier closer to the East region.
  const barrier=new Simulation({mode:'sandbox',map:'highlands',seed:2026});
  for(const e of barrier.entities)if(e.kind==='resource'&&e.type==='wood'){e.hp=0;e.amount=0;}
  barrier.isWater=(x)=>x>=0&&x<2;
  barrier.grids={};barrier.revision++;
  for(let i=0;i<9;i++)barrier.addResource('wood',-10+(i%3)*2,-2+Math.floor(i/3)*2,220);
  const eastTree=barrier.addResource('wood',20,0,220);
  const gone=barrier.addResource('wood',1.8,.5,1);gone.hp=0;gone.amount=0;
  const trapped=barrier.addUnit('villager',0,1.8,0);
  trapped.gatherType='wood';trapped.order={type:'gather',target:gone.id};
  barrier.revision++;
  barrier.tickUnit(trapped,.1);
  assert.equal(trapped.order?.type,'gather');
  assert.equal(trapped.order?.target,eastTree.id,'blocked-cell start defers to findPath nearest region instead of scanline order');
});

test('GroundCover and TerrainDetails throttle small pans, catch up after 50ms, refresh immediately on large pans, and invalidate buildingSites',()=>{
  const land=new Landscape(512,'highlands');
  const view={
    landscape:land,terrain:new THREE.Group(),
    settings:{quality:'high',fog:false},
    sim:{entities:[],isExplored:()=>true},
    clock:0,target:new THREE.Vector3(0,0,0),zoom:40,angle:0,tilt:.7
  };
  const cover=new GroundCover(view);
  view.groundCover=cover;
  const details=new TerrainDetails(view);

  try{
    // Revision-less mock in-place building hp=0 must invalidate buildingSites without force=true.
    const baseline=cover.mesh.count;
    const site={kind:'building',x:cover.entries[0].x,z:cover.entries[0].z,r:15,hp:100};
    view.sim.entities.push(site);
    view.clock=.5;cover.update(false,false);
    assert.ok(cover.mesh.count<baseline,'placed building clears grass beneath it');
    site.hp=0;
    view.clock=1.0;cover.update(false,false);
    assert.equal(cover.mesh.count,baseline,'in-place hp=0 restores grass on revision-less sim mocks');

    // Small pan (< 1.5m) throttles inside 50ms, catches up at >= 50ms, large pan (>= 1.5m) refreshes immediately.
    view.clock=2.0;cover.update(false,false);details.update(false,false);
    const coverLast=cover.last,detailsLast=details.last;
    view.target.x=.5;view.clock=2.016;
    cover.update(false,false);details.update(false,false);
    assert.equal(cover.last,coverLast,'GroundCover skips < 1.5m pan within 50ms');
    assert.equal(details.last,detailsLast,'TerrainDetails skips < 1.5m pan within 50ms');

    view.clock=2.055;
    cover.update(false,false);details.update(false,false);
    assert.equal(cover.last,2.055,'GroundCover catches up after 50ms');
    assert.equal(details.last,2.055,'TerrainDetails catches up after 50ms');

    view.target.x=2.5;view.clock=2.056;
    cover.update(false,false);details.update(false,false);
    assert.equal(cover.last,2.056,'GroundCover updates immediately on >= 1.5m pan');
    assert.equal(details.last,2.056,'TerrainDetails updates immediately on >= 1.5m pan');

    // Zoom delta >= 1 refreshes immediately even within 1ms.
    view.zoom=41.2;view.clock=2.057;
    cover.update(false,false);details.update(false,false);
    assert.equal(cover.last,2.057,'GroundCover updates immediately on >= 1 zoom delta');
    assert.equal(details.last,2.057,'TerrainDetails updates immediately on >= 1 zoom delta');
  }finally{
    cover.dispose();
    details.mesh.geometry.dispose();details.mesh.material.dispose();details.mesh.dispose();
  }
});
