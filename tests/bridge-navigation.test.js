import test from 'node:test';
import assert from 'node:assert/strict';
import {Simulation} from '../src/simulation.js';
import {Landscape} from '../src/landscape.js';
import {bridgeSpans,bridgeRoadHalfWidth} from '../src/bridge-layout.js';
import {bridgeStepClear,bridgePointClear,bridgeNavigationGrid,bridgeUnitClearance} from '../src/bridge-navigation.js';
import {unitNavigationGrid,constructionNavigationGrid} from '../src/navigation.js';
import {formationSlot} from '../src/tactics.js';

function fixture(map='valley',mapSize='standard'){
  const sim=new Simulation({mode:'sandbox',map,mapSize,seed:512});
  sim.entities=[];sim.index=new Map();sim.grids={};sim.revision++;return sim;
}

test('troops and siege use the entrances on every bridge instead of climbing the side walls',()=>{
  for(const map of ['valley','rivers'])for(const span of bridgeSpans(map))for(const side of [-1,1])for(const type of ['villager','spearman','knight','ram','catapult']){
    const sim=fixture(map),x=span.center+span.halfLength*.8,start={x,z:side*11},target={x,z:side*2},unit=sim.addUnit(type,0,start.x,start.z),land=new Landscape(512,map),ground=land.geometry(land.renderSize,112);
    let done=false,previous=land.walkableHeightAt(unit.x,unit.z),maximum=0,enteredAtEnd=false;
    for(let i=0;i<3500;i++){
      const before={x:unit.x,z:unit.z};sim.time+=.05;done=sim.move(unit,target,.05,0,true);
      assert.ok(bridgeStepClear(map,before.x,before.z,unit.x,unit.z,bridgeUnitClearance(unit)),'actual movement preserves side clearance');
      if(Math.abs(before.z)>bridgeRoadHalfWidth&&Math.abs(unit.z)<=bridgeRoadHalfWidth)enteredAtEnd ||= Math.abs(unit.x-span.center)>span.halfLength;
      const height=land.walkableHeightAt(unit.x,unit.z);maximum=Math.max(maximum,Math.abs(height-previous));previous=height;if(done)break;
    }
    assert.ok(done,`${map} ${span.center} ${side} ${type} reaches the road`);assert.ok(enteredAtEnd,'the unit uses an approach');
    assert.ok(maximum<.4,`no bank-to-deck teleport: ${map} ${type} ${maximum}`);ground.dispose();
    sim.stop([unit.id]);let returned=false;for(let i=0;i<3500;i++){sim.time+=.05;if(sim.move(unit,start,.05,0,true)){returned=true;break;}}
    assert.ok(returned,'the reverse trip also reaches the bank');
  }
});

test('central crossings remain open for heavy siege on large and epic river maps',()=>{
  for(const map of ['valley','rivers'])for(const mapSize of ['huge','epic'])for(const span of bridgeSpans(map)){
    const sim=fixture(map,mapSize),unit=sim.addUnit('catapult',0,span.center-span.halfLength-8,0),target={x:span.center+span.halfLength+8,z:0};
    let done=false;for(let i=0;i<2000;i++){sim.time+=.1;if(sim.move(unit,target,.1,0,true)){done=true;break;}}
    assert.ok(done,`${map} ${mapSize} ${span.center} remains crossable`);
  }
});

test('side clearance handles fractional endpoints, large steps and restored units inside the margin',()=>{
  const map='valley';
  assert.equal(bridgeStepClear(map,10,-9,10,-4),false);
  assert.equal(bridgeStepClear(map,10,-4,10,-9),false);
  assert.equal(bridgeStepClear(map,14,-9,14,-4),false,'raised apron sides are protected');
  assert.equal(bridgeStepClear(map,0,0,20,0,3.3),true,'the entrance is open');
  assert.equal(bridgeStepClear(map,10,6.6,10,5),true,'legacy road occupant escapes inward');
  assert.equal(bridgeStepClear(map,10,7.1,10,9),true,'legacy bank occupant escapes outward');
  assert.equal(bridgeStepClear(map,10,7.1,30,0),false,'a long diagonal cannot escape across the side first');
  assert.equal(bridgeStepClear(map,10,6.6,30,15),false);
  for(const startZ of [6.5,7.1]){
    const sim=fixture(),unit=sim.addUnit('spearman',0,10,startZ),target={x:12,z:startZ<bridgeRoadHalfWidth?0:12};let done=false;
    for(let i=0;i<2000;i++){sim.time+=.05;if(sim.move(unit,target,.05,0,true)){done=true;break;}}
    assert.ok(done,`saved margin unit at ${startZ} can leave without getting trapped`);
  }
});

test('bridge clearance survives foundation overrides and formation slots respect siege width',()=>{
  const sim=fixture(),unit=sim.addUnit('catapult',0,10,0),normal=sim.grid(0),copy=normal.slice(),expanded=bridgeNavigationGrid(sim,unit,normal);
  assert.equal(bridgeNavigationGrid(sim,unit,normal),expanded,'heavy clearance grid is reused');assert.deepEqual(normal,copy,'shared grid remains unchanged');
  const slot=formationSlot(sim,unit,{x:10,z:5});assert.ok(bridgePointClear('valley',slot.x,slot.z,bridgeUnitClearance(unit)));
  const building=sim.addBuilding('house',0,10,0,true);sim.revision++;sim.grids={};
  for(const grid of [unitNavigationGrid(sim,unit),constructionNavigationGrid(sim,building,0)]){
    const cell=sim.cell(10,7);assert.equal(grid[cell.z*sim.gridSize+cell.x],1,'overrides never open the side wall');
  }
  assert.equal(sim.grid(0,true).naval,true,'boats identify their own movement surface');
});

test('old wide-bridge saves retain troop orders on the narrowed deck and current bank positions stay untouched',()=>{
  const sim=fixture(),unit=sim.addUnit('ram',0,4,8.5);unit.order={type:'move',x:25,z:0};unit.path=[{x:6,z:8.5}];
  const saved=JSON.parse(JSON.stringify(sim.serialize()));delete saved.bridgeRoadHalfWidth;
  const restored=Simulation.restore(saved),moved=restored.get(unit.id);
  assert.ok(Math.abs(moved.z)<4);assert.ok(bridgePointClear('valley',moved.x,moved.z,bridgeUnitClearance(moved)));
  assert.deepEqual(moved.order,unit.order);assert.deepEqual(moved.path,[]);assert.equal(moved.hp,unit.hp);
  const bank=restored.addUnit('spearman',0,10,9),again=Simulation.restore(JSON.parse(JSON.stringify(restored.serialize())));
  assert.equal(again.get(bank.id).z,9,'a current bank unit is not treated as an old deck occupant');
  assert.equal(again.get(unit.id).z,moved.z,'migration is not repeated');
});

test('crowd separation cannot push a unit out through the bridge parapet',()=>{
  const sim=fixture(),unit=sim.addUnit('spearman',0,10,6.5),crowd=[];
  for(let i=0;i<24;i++)crowd.push(sim.addUnit('spearman',0,10,5.8));
  const buckets=new Map();for(const other of crowd){const x=Math.floor(other.x/4),z=Math.floor(other.z/4);if(!buckets.has(x))buckets.set(x,new Map());const column=buckets.get(x);if(!column.has(z))column.set(z,[]);column.get(z).push(other);}sim.unitBuckets=buckets;
  const before={x:unit.x,z:unit.z};sim.move(unit,{x:10,z:0},.05,0,true);
  assert.ok(unit.z<=bridgeRoadHalfWidth,'the unit remains on the deck side');
  assert.ok(bridgeStepClear('valley',before.x,before.z,unit.x,unit.z,bridgeUnitClearance(unit)));
});
