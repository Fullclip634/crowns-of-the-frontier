import {test} from 'node:test';
import assert from 'node:assert/strict';
import {Simulation} from '../src/simulation.js';
import {BATTLE_SIZES,battlePreset} from '../src/custom-battle.js';
import {clearSegment} from '../src/navigation.js';
import {gatheringPathRange} from '../src/work-ranges.js';

const distance=(a,b)=>Math.hypot(a.x-b.x,a.z-b.z);

function assertDryStart(sim){
  const ordinary=sim.entities.filter(e=>e.hp>0&&e.kind==='building'&&!['wall','gate','dock'].includes(e.type));
  for(let i=0;i<ordinary.length;i++){
    const a=ordinary[i];
    for(const dx of [-a.r,0,a.r])for(const dz of [-a.r,0,a.r]){
      assert.equal(sim.isWater(a.x+dx,a.z+dz),false,`${a.type} footprint on ${sim.options.map}`);
    }
    for(const b of ordinary.slice(i+1)){
      assert.ok(distance(a,b)>=a.r+b.r,`${a.type} overlaps ${b.type}`);
    }
  }
  for(const e of sim.entities){
    if(e.hp<=0||e.kind!=='unit'||sim.unitDefinition(e).naval)continue;
    assert.equal(sim.isWater(e.x,e.z),false,`${e.type} begins in water`);
    const cell=sim.cell(e.x,e.z);
    assert.equal(sim.grid(e.owner)[cell.z*sim.gridSize+cell.x],0,`${e.type} starts in blocked ground`);
  }
}

function testGateRoutes(sim,owner,enemy){
  const gates=sim.owned(owner,'building','gate');
  assert.equal(gates.length,2,`${sim.options.mode} ${sim.options.mapSize}`);
  for(const gate of gates){
    const dx=7*Math.sin(gate.wallAngle),dz=7*Math.cos(gate.wallAngle);
    const sign=(sim.players[owner].start.x-gate.x)*dx+(sim.players[owner].start.z-gate.z)*dz>0?1:-1;
    const outside={x:gate.x-sign*dx,z:gate.z-sign*dz},inside={x:gate.x+sign*dx,z:gate.z+sign*dz};
    const scout={type:'scout',owner,r:.65,...outside};
    const route=sim.pathTo(scout,inside);
    assert.equal(scout.pathStatus,'ready','friendly scout can cross the gate');
    assert.deepEqual(route.at(-1),inside);
    const hostile={...scout,owner:enemy};
    assert.equal(clearSegment(sim,sim.grid(enemy),outside,inside),false,'gate itself blocks enemies');
    sim.pathTo(hostile,inside);
    assert.equal(hostile.pathStatus,'blocked','hostile scout cannot bypass the perimeter');
  }
}

test('Castle Siege starts with separate buildings and a sealed but usable fort at all five sizes',()=>{
  for(const mapSize of Object.keys(BATTLE_SIZES)){
    const sim=new Simulation({mode:'siege',mapSize,seed:2026});
    assertDryStart(sim);
    testGateRoutes(sim,0,1);
  }
});

test('Bastion and the survival campaign connect their gatehouses to continuous visible defenses',()=>{
  for(const mapSize of Object.keys(BATTLE_SIZES)){
    const sim=new Simulation({mode:'skirmish',map:'bastion',mapSize,seed:2026});
    testGateRoutes(sim,0,1);
    testGateRoutes(sim,1,0);
  }
  testGateRoutes(new Simulation({mode:'campaign3',seed:4303}),0,1);
});

test('advanced starts on compact rivers keep troops dry and all four supplies accessible',()=>{
  for(const map of ['riverland','threecrowns','templelagoon']){
    const sim=new Simulation({mode:'custom',map,mapSize:'spacious',startAge:3,slots:battlePreset('4v4'),seed:2026});
    assertDryStart(sim);
    for(const [owner,player] of sim.players.entries()){
      const worker=sim.owned(owner,'unit','villager')[0];
      for(const type of ['wood','food','gold','stone']){
        const nearby=sim.entities.filter(e=>e.hp>0&&e.kind==='resource'&&!e.water&&e.type===type&&distance(e,player.start)<42);
        assert.ok(nearby.some(e=>{
          const range=gatheringPathRange(worker,e),path=sim.pathTo(worker,e,range);
          return worker.pathStatus==='ready'&&distance(path.at(-1)||worker,e)<=range+1e-6;
        }),`${map} owner ${owner} has no reachable opening ${type}`);
      }
    }
  }
});

test('saved matches and new replays keep their opening layout and older replays keep their original coordinates',()=>{
  const sim=new Simulation({mode:'siege',mapSize:'large'});
  const replay=new Simulation({...sim.options,replay:true});
  assert.deepEqual(replay.entities,sim.entities);
  const saved=JSON.parse(JSON.stringify(sim.serialize()));
  const restored=Simulation.restore(saved);
  assert.equal(restored.options.battlefieldLayout,sim.options.battlefieldLayout);
  assert.deepEqual(restored.owned(0,'building').map(e=>[e.id,e.x,e.z]),sim.owned(0,'building').map(e=>[e.id,e.x,e.z]));
  const previous=new Simulation({mode:'siege',mapSize:'large',replay:true});
  const center=previous.owned(0,'building','towncenter')[0],keep=previous.owned(0,'building','keep')[0];
  assert.equal(keep.x-center.x,11);
  assert.equal(keep.z-center.z,-10);
});

test('campaigns store shared cliffs once while preserving the actual checkpoint terrain',()=>{
  const sim=new Simulation({mode:'campaign3',seed:4303});
  const save=JSON.parse(JSON.stringify(sim.serialize()));
  assert.ok(save.campaignCheckpoint.sharedBarriers);
  assert.equal(save.campaignCheckpoint.barriers,undefined);
  assert.deepEqual(Simulation.restore(save).campaignCheckpoint.barriers,sim.barriers);
  sim.barriers.push({x:20,z:20,r:3.5,height:4,kind:'cliffwall',angle:0,seed:1});
  const changed=JSON.parse(JSON.stringify(sim.serialize()));
  assert.deepEqual(changed.campaignCheckpoint.barriers,sim.campaignCheckpoint.barriers);
  assert.deepEqual(Simulation.restore(changed).campaignCheckpoint.barriers,sim.campaignCheckpoint.barriers);
});
