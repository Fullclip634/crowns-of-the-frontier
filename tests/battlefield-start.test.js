import {test} from 'node:test';
import assert from 'node:assert/strict';
import {Simulation} from '../src/simulation.js';
import {BATTLE_SIZES,battlePreset} from '../src/custom-battle.js';
import {clearSegment,navigationRegions} from '../src/navigation.js';
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

function testEnclosure(sim,owner,gates){
  const enemy=sim.players.findIndex((_,i)=>sim.hostile(owner,i));
  const friendlyGrid=sim.grid(owner),hostileGrid=sim.grid(enemy);
  const open=(point,grid)=>{
    const cell=sim.cell(point.x,point.z);
    return !sim.isWater(point.x,point.z)&&!grid[cell.z*sim.gridSize+cell.x];
  };
  const center=sim.players[owner].start;
  for(const gate of gates){
    assert.equal(gate.wallLinks.length,2);
    const x=Math.sin(gate.wallAngle),z=Math.cos(gate.wallAngle);
    const inward=(center.x-gate.x)*x+(center.z-gate.z)*z>0?1:-1;
    const approach=side=>[7,8,9,10,6,5,11,12].map(d=>({x:gate.x+x*d*side,z:gate.z+z*d*side}))
      .find(point=>open(point,friendlyGrid)&&open(point,hostileGrid));
    const from=approach(-inward),to=approach(inward);
    assert.ok(from&&to,`${sim.options.mode}/${owner} keeps both sides of the gate open`);
    const scout={...from,type:'scout',owner,r:.65};
    assert.deepEqual(sim.pathTo(scout,to).at(-1),to);
    assert.equal(scout.pathStatus,'ready');
    const hostile={...scout,owner:enemy};
    sim.pathTo(hostile,to);
    assert.equal(hostile.pathStatus,'blocked',`${sim.options.mode}/${owner} keeps enemies outside the fort`);
  }
}

test('compact Bastion still has independent fortified starts for all eight kingdoms',()=>{
  for(const startAge of [0,3]){
    const sim=new Simulation({mode:'custom',map:'bastion',mapSize:'spacious',seed:2026,startAge,slots:battlePreset('4v4')});
    assertDryStart(sim);
    for(const owner of sim.players.keys()){
      const gates=sim.owned(owner,'building','gate');
      assert.equal(gates.length,2);
      const {x,z}=sim.players[owner].start;
      const walls=sim.owned(owner,'building','wall');
      assert.ok(walls.length>0&&walls.every(wall=>
        (wall.x-x)*x+(wall.z-z)*z<0),'walls close the approaches facing the battlefield');
      testEnclosure(sim,owner,gates);
    }
    const edgeTrees=sim.entities.filter(e=>e.type==='wood'&&e.startForest===1&&e.x<-sim.halfWorld+2);
    assert.ok(edgeTrees.some(e=>e.z<0)&&edgeTrees.some(e=>e.z>0),'both woodland shoulders reach the map edge');
  }
});

test('peaceful and wave-defense modes only fortify their starting settlement',()=>{
  for(const mode of ['tutorial','sandbox','survival']){
    const sim=new Simulation({mode,map:'bastion',mapSize:'spacious'});
    assert.equal(sim.owned(0,'building','gate').length,2);
    assert.equal(sim.owned(1,'building').length,0,`${mode} should not add a rival base`);
  }
});

test('crowded coastal settlements keep their land buildings clear of fixed docks',()=>{
  for(const [count,seed,startAge] of [[8,512,2],[7,818,3]]){
    const slots=battlePreset('ffa8').map((slot,index)=>({...slot,enabled:index<count}));
    const sim=new Simulation({mode:'custom',map:'coast',mapSize:'spacious',seed,startAge,slots});
    assertDryStart(sim);
    for(const dock of sim.entities.filter(e=>e.hp>0&&e.type==='dock')){
      for(const e of sim.entities.filter(e=>e.hp>0&&e.kind==='building'&&e!==dock)){
        assert.ok(distance(e,dock)>=e.r+dock.r,`${count} kingdoms: ${e.type} overlaps a dock`);
      }
    }
  }
});

test('compact Bastion keeps the direct gate approaches clear of scenic cliffs',()=>{
  const slots=battlePreset('ffa8').map((slot,index)=>({...slot,enabled:index<7}));
  const sim=new Simulation({mode:'custom',map:'bastion',mapSize:'spacious',seed:818,startAge:3,slots});
  for(const owner of sim.players.keys()){
    const gates=sim.owned(owner,'building','gate'),grid=sim.grid(owner);
    testEnclosure(sim,owner,gates);
    for(const gate of gates)for(const distance of [-7,7]){
      const cell=sim.cell(gate.x+Math.sin(gate.wallAngle)*distance,gate.z+Math.cos(gate.wallAngle)*distance);
      assert.equal(grid[cell.z*sim.gridSize+cell.x],0);
    }
  }
});

test('scripted fort and war-camp routes and protected supplies agree with their walls',()=>{
  for(const [number,owners] of [[5,[1]],[8,[1]],[15,[1,2]],[17,[1,2,3]],[19,[2,3,4,5]]]){
    const sim=new Simulation({mode:'campaign'+number,seed:4300+number,difficulty:'story'});
    for(const owner of owners){
      const gates=sim.owned(owner,'building','gate');
      assert.equal(gates.length,number===15||number===17&&owner!==3?1:2);
      testEnclosure(sim,owner,gates);
      if(![15,17].includes(number)||owner>2)continue;
      const worker=sim.owned(owner,'unit','villager')[0];
      const enemy=sim.players.findIndex((_,i)=>sim.hostile(owner,i)),grid=sim.grid(enemy);
      const labels=navigationRegions(sim,grid),from=sim.cell(worker.x,worker.z),inside=labels[from.z*sim.gridSize+from.x];
      assert.ok(inside);
      for(const type of ['wood','food','gold','stone']){
        const reserves=sim.entities.filter(e=>e.hp>0&&e.kind==='resource'&&!e.water&&e.type===type&&distance(e,sim.players[owner].start)<42);
        assert.ok(reserves.some(e=>{
          const range=gatheringPathRange(worker,e),path=sim.pathTo(worker,e,range),end=path.at(-1)||worker;
          const cell=sim.cell(end.x,end.z);
          return worker.pathStatus==='ready'&&distance(end,e)<=range+1e-6&&labels[cell.z*sim.gridSize+cell.x]===inside;
        }),`${sim.options.mode}/${owner} worker can gather ${type} inside the wall`);
      }
    }
  }
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
  const earlierFort=new Simulation({mode:'campaign5',seed:4305,replay:true,battlefieldLayout:1});
  const gate=earlierFort.owned(1,'building','gate')[0];
  assert.equal(earlierFort.owned(1,'building','gate').length,1);
  assert.deepEqual([gate.x,gate.z],[102,-61]);
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
