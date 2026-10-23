import test from 'node:test';
import assert from 'node:assert/strict';
import {Simulation,distance} from '../src/simulation.js';
import {battlePreset} from '../src/custom-battle.js';
import {unitNavigationGrid,clearSegment} from '../src/navigation.js';
import {SpatialBuckets} from '../src/spatial-buckets.js';

function fixture(options={}){
  const sim=new Simulation({mode:'sandbox',seed:512,...options});
  sim.entities=[];sim.index=new Map();sim.grids={};sim.revision++;sim.visible.fill(1);return sim;
}
function advance(sim,units,seconds){
  const buckets=new SpatialBuckets(4);sim.unitBuckets=buckets.columns;
  for(let i=0;i<seconds*10;i++){
    buckets.reset();for(const unit of units)if(unit.hp>0&&!unit.embarked)buckets.add(unit);
    for(const unit of units){const before={x:unit.x,z:unit.z},wasEmbarked=unit.embarked;sim.tickUnit(unit,.1);
      if(!wasEmbarked&&!unit.embarked)assert.ok(distance(unit,before)<2,'escape must use smooth movement, not teleportation');
    }
    sim.time+=.1;
  }
}

test('a knight covered by a house escapes the isolated pocket and boards its transport',()=>{
  const sim=fixture({mode:'custom',map:'coast',slots:battlePreset('4v4')}),owner=7;
  sim.addBuilding('barracks',owner,51,127,true);sim.addBuilding('stable',owner,50,136,true);
  const knight=sim.addUnit('knight',owner,54,132),house=sim.addBuilding('house',owner,56.556839713326426,131.92033091367554),ship=sim.addUnit('transport',owner,8.917046624963245,136.03347930844618),cell=sim.cell(knight.x,knight.z),normal=sim.grid(owner),before=normal.slice();
  assert.equal(normal[cell.z*sim.gridSize+cell.x],1);
  const escape=unitNavigationGrid(sim,knight);assert.notEqual(escape,normal);assert.equal(escape[cell.z*sim.gridSize+cell.x],0);assert.deepEqual(normal,before);
  sim.command([knight.id],{type:'board',target:ship.id});advance(sim,[knight],25);
  assert.equal(knight.embarked,true);assert.deepEqual(ship.passengers,[knight.id]);assert.equal(house.hp,house.maxHp*.12);
  assert.equal(sim.events.some(event=>event.type==='order-blocked'),false);
  const outsider=sim.addUnit('spearman',owner,70,132);
  assert.equal(unitNavigationGrid(sim,outsider),normal,'the building stays solid for other units');
  assert.equal(clearSegment(sim,normal,outsider,{x:45,z:132}),false);
});

test('leaving a foundation preserves queued commands and works after saving',()=>{
  const sim=fixture(),unit=sim.addUnit('scout',0,0,20);sim.addBuilding('house',0,0,20);
  sim.command([unit.id],{type:'move',x:15,z:20});sim.command([unit.id],{type:'move',x:25,z:34},true);advance(sim,[unit],.2);
  const saved=JSON.parse(JSON.stringify(sim.serialize()));assert.equal(saved.unitEscapeGrids,undefined);
  const restored=Simulation.restore(saved),mover=restored.get(unit.id);advance(restored,[mover],15);
  assert.ok(distance(mover,{x:25,z:34})<1.6);assert.equal(mover.order,null);assert.deepEqual(mover.orders,[]);assert.equal(mover.pathNavigationKey,'');
});

test('foundation escape keeps water, resources, neighboring buildings and wall bodies blocked',()=>{
  const sim=fixture({map:'coast'}),unit=sim.addUnit('spearman',0,20,40),house=sim.addBuilding('house',0,20,40),ore=sim.addResource('gold',20,42,300),wall=sim.addBuilding('wall',0,22,40,true);
  const normal=sim.grid(0),base=sim.grids.landBase.data,escape=unitNavigationGrid(sim,unit);
  for(let i=0;i<base.length;i++)if(base[i])assert.equal(escape[i],1,'resources and water must stay solid');
  for(const obstacle of [ore,wall]){const cell=sim.cell(obstacle.x,obstacle.z);assert.equal(escape[cell.z*sim.gridSize+cell.x],1);}
  sim.pathTo(unit,{x:-25,z:40});assert.equal(unit.pathStatus,'blocked');
  assert.equal(normal[sim.cell(house.x,house.z).z*sim.gridSize+sim.cell(house.x,house.z).x],1);
  const other=fixture(),trapped=other.addUnit('spearman',0,0,20);other.addBuilding('house',0,0,20);other.addBuilding('stable',0,6.8,20,true);
  const adjusted=unitNavigationGrid(other,trapped),cell=other.cell(3,21);assert.equal(adjusted[cell.z*other.gridSize+cell.x],1,'a neighboring building is not opened beyond the containing footprints');
});

test('a trapped unit cannot bypass a connected wall spanning the map',()=>{
  const sim=fixture(),unit=sim.addUnit('spearman',0,0,20);sim.addBuilding('house',0,0,20);
  for(let z=-79;z<=79;z+=2.85)sim.addBuilding('wall',1,12,z,true);
  sim.pathTo(unit,{x:25,z:20});assert.equal(unit.pathStatus,'blocked');
  const gate=sim.addBuilding('gate',1,0,20,true),cell=sim.cell(gate.x,gate.z),grid=unitNavigationGrid(sim,unit);assert.equal(grid[cell.z*sim.gridSize+cell.x],1,'enemy gates are never an escape exception');
});

test('a unit inside a building clearance escapes even when its rounded navigation cell is open',()=>{
  const sim=new Simulation({mode:'custom',map:'highlands',seed:512,mapSize:'vast',slots:battlePreset('2v2')}),unit=sim.addUnit('spearman',3,124.39982668964461,102.39982668964454);
  sim.addBuilding('mine',3,123.28876849395338,100.25172564898419);
  sim.tick(.1);assert.ok(sim.entityBuckets,'exercise the live spatial-index lookup');
  const cell=sim.cell(unit.x,unit.z),normal=sim.grid(3);assert.equal(normal[cell.z*sim.gridSize+cell.x],0,'this reproduces the open-cell edge case');
  assert.notEqual(unitNavigationGrid(sim,unit),normal,'nearby building overlap must activate the local escape grid');
  const route=sim.pathTo(unit,{x:101,z:125},1.4);assert.equal(unit.pathStatus,'ready');assert.ok(route.length);
});

test('escape grids share work inside one building, remain bounded and invalidate after construction changes',()=>{
  const sim=fixture(),first=sim.addUnit('spearman',0,0,20),second=sim.addUnit('spearman',0,.5,20),house=sim.addBuilding('house',0,0,20),grid=unitNavigationGrid(sim,first);
  assert.equal(unitNavigationGrid(sim,second),grid);
  sim.addResource('wood',0,20,300);const changed=unitNavigationGrid(sim,first);assert.notEqual(changed,grid);assert.equal(changed[sim.cell(0,20).z*sim.gridSize+sim.cell(0,20).x],1);
  for(let i=0;i<25;i++){const x=-65+(i%5)*25,z=-65+Math.floor(i/5)*25,unit=sim.addUnit('spearman',0,x,z);sim.addBuilding('house',0,x,z);unitNavigationGrid(sim,unit);}
  assert.ok(sim.unitEscapeGrids.size<=16,'retained full-map escape grids have a fixed memory bound');
  house.hp=0;sim.revision++;first.x=40;first.z=55;assert.equal(unitNavigationGrid(sim,first),sim.grid(0));
});

test('a boarding healer reroutes around workers crowding its next waypoint',()=>{
  const sim=fixture({mode:'custom',map:'coast',slots:battlePreset('4v4')}),owner=7;
  for(const [type,x,z]of [['mill',27,146],['camp',23.63915704997509,157.3631740918816],['house',20.43743441567735,143.2495717181338],['workshop',16.657683150241347,150.8494279850945],['towncenter',38,136],['dock',18.38676450283352,136]])sim.addBuilding(type,owner,x,z,true);
  const monk=sim.addUnit('monk',owner,29.80884649960819,149.06003800022253),ship=sim.addUnit('transport',owner,9.364869393121069,136.39502553821956);
  const positions=[[31.356728805866492,149.42075441841635],[31.048730582272885,148.83292391503397],[30.65654913478743,149.4748239521753],[30.739653843879648,149.41153389082484],[30.7260739974883,149.03407126584577],[30.33634075472763,148.58017914001695],[31.105914723157117,148.5646536902943],[30.56154172305612,148.90729843168756]],crowd=positions.map(([x,z])=>sim.addUnit('villager',owner,x,z));
  const original=sim.pathTo.bind(sim),routes=[];sim.pathTo=(unit,destination)=>{const route=original(unit,destination);if(unit===monk)routes.push({stuck:unit.stuckTime||0,first:route[0]});return route;};
  sim.command([monk.id],{type:'board',target:ship.id});
  const buckets=new SpatialBuckets(4);sim.unitBuckets=buckets.columns;
  for(let i=0;i<500&&!monk.embarked;i++){buckets.reset();for(const unit of [monk,...crowd])buckets.add(unit);const before={x:monk.x,z:monk.z};sim.tickUnit(monk,.1);if(!monk.embarked)assert.ok(distance(monk,before)<2);sim.time+=.1;}
  assert.equal(monk.embarked,true);assert.ok(routes.some(r=>r.stuck>=1.8&&r.first&&r.first.z>150),'stalled movement takes the uncrowded side of the mill');
  assert.equal(sim.events.some(event=>event.type==='order-blocked'&&event.entity.id===monk.id),false);
  assert.ok(crowd.every((unit,i)=>distance(unit,{x:positions[i][0],z:positions[i][1]})<.001),'routing must not overwrite other units or push them by teleportation');
});
