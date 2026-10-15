import test from 'node:test';
import assert from 'node:assert/strict';
import {Simulation,distance} from '../src/simulation.js';
import {battlePreset} from '../src/custom-battle.js';
import {forestSettlements,forestEntrances} from '../src/starting-forests.js';
import {clearSegment} from '../src/navigation.js';

const maps=['highlands','desert','winter','canyon','valley','rivers','coast'];
const treesFor=(sim,owner)=>sim.entities.filter(e=>e.kind==='resource'&&e.startForest===owner);
const cellBlocked=(sim,owner,point)=>{const cell=sim.cell(point.x,point.z);return sim.grid(owner)[cell.z*sim.gridSize+cell.x];};

test('dense starting forests retain open approaches and local resources for all eight slots',()=>{
  for(const seed of [512,2026,4302])for(const map of maps)for(const mapSize of ['spacious','large','huge','vast','epic']) {
    const sim=new Simulation({mode:'custom',map,mapSize,seed,slots:battlePreset('4v4')});
    for(const base of forestSettlements(sim)) {
      const trees=treesFor(sim,base.owner),scout=sim.owned(base.owner,'unit','scout')[0];
      assert.ok(trees.length>=45,`${seed}/${map}/${mapSize}/${base.owner}: a usable dense forest`);
      assert.ok(trees.length<=200,'bounded tree count per settlement');
      const connected=trees.filter(tree=>[[2,0],[-2,0],[0,2],[0,-2]].some(([dx,dz])=>trees.some(other=>Math.abs(other.x-tree.x-dx)<.001&&Math.abs(other.z-tree.z-dz)<.001)));
      assert.ok(connected.length>=trees.length*.85,`${map}/${base.owner}: woodlines must not be isolated decorative trees`);
      const depths=trees.map(tree=>distance(tree,base));assert.ok(Math.max(...depths)-Math.min(...depths)>8,`${map}/${base.owner}: irregular groves have depth instead of a narrow circular band`);
      for(const type of ['wood','food','gold','stone'])assert.ok(sim.entities.some(e=>e.kind==='resource'&&e.type===type&&!e.water&&distance(e,base)<36),`${map}/${base.owner}: nearby ${type}`);
      for(const [type,count]of [['food',7],['gold',5],['stone',5]])assert.equal(sim.entities.filter(e=>e.startDeposit===base.owner&&e.type===type).length,count,`${seed}/${map}/${mapSize}/${base.owner}: fair ${type}`);
      for(const deposit of sim.entities.filter(e=>e.startDeposit===base.owner))assert.ok(sim.entities.filter(e=>e.kind==='building').every(e=>distance(e,deposit)>=e.r+3),`${seed}/${map}/${mapSize}/${base.owner}: deposits keep all buildings clear, including coastal docks`);
      for(const dir of forestEntrances(sim,base)) {
        const point={x:base.x+dir.x*37,z:base.z+dir.z*37};
        if(sim.isWater(point.x,point.z))continue;
        sim.pathTo(scout,point);assert.equal(scout.pathStatus,'ready',`${map}/${mapSize}/${base.owner}: base exit`);
      }
      for(const tree of trees) {
        assert.equal(sim.isWater(tree.x,tree.z),false);
        assert.equal(cellBlocked(sim,base.owner,tree),1);
        assert.ok(sim.owned(base.owner).every(e=>distance(e,tree)>=e.r+(e.kind==='building'?3:2)),'clear starting buildings and troops');
      }
    }
  }
});

test('woodlines block direct crossings but allow armies to route through the entrances',()=>{
  const sim=new Simulation({mode:'custom',seed:512}),base=forestSettlements(sim)[0],scout=sim.owned(0,'unit','scout')[0];
  const tree=treesFor(sim,0).find(e=>treesFor(sim,0).filter(other=>distance(e,other)<4.1).length>=6),dx=tree.x-base.x,dz=tree.z-base.z,length=Math.hypot(dx,dz);
  const inside={x:base.x+dx/length*(length-5),z:base.z+dz/length*(length-5)},outside={x:base.x+dx/length*(length+5),z:base.z+dz/length*(length+5)};
  assert.equal(clearSegment(sim,sim.grid(0),inside,outside),false,'a forest substitutes for part of the defensive wall');
  scout.x=inside.x;scout.z=inside.z;
  const route=sim.pathTo(scout,outside);assert.equal(scout.pathStatus,'ready');assert.ok(route.length>3,'army routes around the woodline');
});

test('advanced-age starts retain deposits, construction room and reachable wood',()=>{
  for(const map of maps)for(const seed of [512,2026]) {
    const sim=new Simulation({mode:'custom',map,seed,mapSize:'spacious',startAge:3,slots:battlePreset('4v4')});
    sim.visible.fill(1);
    for(const base of forestSettlements(sim)) {
      for(const [type,count]of [['food',7],['gold',5],['stone',5]])assert.equal(sim.entities.filter(e=>e.startDeposit===base.owner&&e.type===type).length,count,`${map}/${seed}/${base.owner}: advanced ${type}`);
      const worker=sim.owned(base.owner,'unit','villager')[0];
      const reachable=treesFor(sim,base.owner).some(tree=>{const path=sim.pathTo(worker,tree);return worker.pathStatus==='ready'&&path.length&&distance(path.at(-1),tree)<2.85;});
      assert.ok(reachable,`${map}/${base.owner}: accessible inner woodline`);
      assert.ok(Array.from({length:24},(_,i)=>({x:base.x+Math.cos(i*Math.PI/12)*20,z:base.z+Math.sin(i*Math.PI/12)*20})).some(point=>sim.buildValid('house',point.x,point.z,base.owner)),`${map}/${base.owner}: room to expand the settlement`);
    }
  }
});

test('starting forests can be harvested and exhausted trees release their occupied cells',()=>{
  const sim=new Simulation({mode:'custom',seed:512});sim.tickCustomAI=()=>{};sim.stop(sim.owned(0,'unit').map(e=>e.id));
  const worker=sim.owned(0,'unit','villager')[0],target=treesFor(sim,0).sort((a,b)=>distance(worker,a)-distance(worker,b))[0];
  sim.pathTo(worker,target);assert.equal(worker.pathStatus,'ready');
  target.amount=6;const before=sim.players[0].resources.wood;sim.command([worker.id],{type:'gather',target:target.id});
  for(let i=0;i<600&&target.hp>0;i++)sim.tick(.1);
  assert.equal(target.hp,0,'worker reaches and chops the actual starting tree');
  for(let i=0;i<400&&worker.carry;i++)sim.tick(.1);
  assert.ok(sim.players[0].resources.wood>=before+5.99);
  assert.equal(cellBlocked(sim,0,target),0,'a harvested tree creates a real breach');
});

test('standard battles and campaign settlements receive forests without blocking starting units',()=>{
  for(const mode of ['skirmish','sandbox','tutorial','survival','regicide','dominion','tides','campaign1','campaign2','campaign3','campaign4','campaign5']) {
    const sim=new Simulation({mode,seed:512});
    for(const base of forestSettlements(sim)) {
      const trees=treesFor(sim,base.owner);assert.ok(trees.length>=45,`${mode}: forest`);
      for(const unit of sim.owned(base.owner,'unit').filter(e=>!e.embarked&&!['galley','transport','fishingboat','warship'].includes(e.type))) {
        assert.ok(trees.every(tree=>distance(tree,unit)>=unit.r+2),`${mode}: unit clearance`);
        const dir=forestEntrances(sim,base)[0],point={x:base.x+dir.x*37,z:base.z+dir.z*37};
        if(!sim.isWater(point.x,point.z)){sim.pathTo(unit,point);assert.equal(unit.pathStatus,'ready',`${mode}: ${unit.type} exit`);}
      }
    }
  }
});

test('fresh human multiplayer maps are deterministic and saving preserves chopped forest breaches',()=>{
  const options={mode:'custom',map:'rivers',seed:2026,slots:battlePreset('ffa8').map(slot=>({...slot,controller:'human'})),multiplayer:true};
  const a=new Simulation(options),b=new Simulation(options);
  assert.deepEqual(a.serialize(),b.serialize());
  const tree=treesFor(a,0)[0];tree.hp=0;tree.amount=0;a.revision++;
  const restored=Simulation.restore(JSON.parse(JSON.stringify(a.serialize())));
  assert.deepEqual(restored.entities,a.entities);assert.equal(restored.get(tree.id),null);
  assert.deepEqual(Array.from(restored.grid(0)),Array.from(a.grid(0)));
  const legacy=a.serialize();legacy.entities=legacy.entities.filter(e=>e.startForest===undefined);
  const loaded=Simulation.restore(JSON.parse(JSON.stringify(legacy)));
  assert.equal(loaded.entities.some(e=>e.startForest!==undefined),false,'existing saves keep their original layout');
});
