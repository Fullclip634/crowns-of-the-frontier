import test from 'node:test';
import assert from 'node:assert/strict';
import {Simulation,distance} from '../src/simulation.js';
import {battlePreset} from '../src/custom-battle.js';
import {SpatialBuckets} from '../src/spatial-buckets.js';

function fixture(map='coast'){const sim=new Simulation({mode:'custom',map,mapSize:'huge',slots:battlePreset('4v4'),seed:512});sim.entities=[];sim.index=new Map();sim.grids={};sim.revision++;sim.visible.fill(1);return sim;}
function advance(sim,worker,crowd,seconds){const buckets=new SpatialBuckets(4);sim.unitBuckets=buckets.columns;
  for(let i=0;i<seconds*10;i++){buckets.reset();for(const unit of [worker,...crowd])buckets.add(unit);const before={x:worker.x,z:worker.z};sim.tickUnit(worker,.1);assert.ok(distance(worker,before)<1,'workers must walk rather than teleport');sim.time+=.1;}
}

test('human and AI mining crews share a close deposit and deliver repeated loads without losing resources',()=>{
  for(const type of ['gold','stone'])for(const owner of [0,1]){
    const sim=fixture('highlands'),ore=sim.addResource(type,.25,20.75,4000),mine=sim.addBuilding('mine',owner,-12,20,true),bank=sim.players[owner].resources[type];
    const workers=Array.from({length:10},(_,i)=>{const a=i*Math.PI/5,w=sim.addUnit('villager',owner,ore.x+Math.sin(a)*9,ore.z+Math.cos(a)*9);w.order={type:'gather',target:ore.id};w.gatherType=type;return w;});
    const buckets=new SpatialBuckets(4);sim.unitBuckets=buckets.columns;
    for(let n=0;n<600;n++){buckets.reset();for(const w of workers)buckets.add(w);for(const w of workers)sim.tickUnit(w,.1);sim.time+=.1;}
    const delivered=sim.players[owner].resources[type]-bank,carried=workers.reduce((n,w)=>n+w.carry,0);
    assert.ok(delivered>180,'the crew makes multiple deliveries');assert.ok(workers.every(w=>w.work>20&&w.order?.target===ore.id),'every miner keeps working');
    assert.ok(Math.abs(4000-ore.amount-delivered-carried)<.0001,'all mined resources are carried or deposited exactly once');
    assert.equal(sim.events.some(event=>event.type==='order-blocked'),false);assert.equal(sim.nearestDrop(workers[0],type),mine);
  }
});

test('a woodcutter finishes the last half-meter of its route and deposits the harvested load',()=>{
  const sim=fixture(),worker=sim.addUnit('villager',0,52.541230840764094,166.97878982412027),camp=sim.addBuilding('camp',0,41.650936932135785,164.63988958019442,true);
  for(const [type,x,z]of [['wood',58.57524120947346,158.21050303289667],['wood',55.923047764226794,164.90249879052863],['wood',62.084043003153056,165.07145553221926],['wood',57.52924586646259,156.53674270119518],['wood',60.369679236318916,161.70476312935352],['wood',57.06997075583786,166.93519118893892],['wood',57.12025169702247,164.39547680690885],['food',49.457710763206705,171.72234100406058],['food',49.87375002913177,168.02266054111533],['food',45.54878494492732,173.64010115060955],['food',51.30487139383331,172.57929874234833],['food',49.268441177206114,167.86912339786068],['food',48.96046050195582,170.4359127865173]])sim.addResource(type,x,z,300);
  const tree=sim.addResource('wood',55.6310678422451,166.07616207003593,300),bank=sim.players[0].resources.wood;
  sim.command([worker.id],{type:'gather',target:tree.id});advance(sim,worker,[],30);
  assert.ok(tree.amount<282,'the assigned tree is actually harvested');assert.ok(sim.players[0].resources.wood>=bank+18,'the load reaches a real drop site');assert.equal(sim.nearestDrop(worker,'wood'),camp);
  assert.equal(sim.events.some(event=>event.type==='order-blocked'&&event.entity.id===worker.id),false);
});

test('a returning farmer takes another approach to a crowded town center without losing cargo',()=>{
  for(const startX of [-144.00780312886593,-143.92]){
  const sim=fixture();for(const [type,x,z]of [['towncenter',-136,0],['house',-146,-8],['mill',-147,10],['house',-152.43901295429072,-9.52674409694423],['tower',-141.53088427633273,-10.649381161448547]])sim.addBuilding(type,0,x,z,true);
  const farm=sim.addBuilding('farm',0,-147.81656182151647,-2.0901834173772746,true),worker=sim.addUnit('villager',0,startX,-1.4398301390459687),positions=[[-143.4546186654818,-.7747879089874659],[-143.24017180153342,-1.3166590249236432],[-143.5510976658754,-.7413297812664954],[-143.38920218046778,-1.5085913562497695],[-143.21906823693706,-1.889712643550559],[-143.26439908571322,-1.0294237841649985]],crowd=positions.map(([x,z])=>sim.addUnit('villager',0,x,z)),bank=sim.players[0].resources.food;
  worker.carry=18;worker.carryType='food';worker.gatherType='food';worker.order={type:'gather',target:farm.id,returning:true};advance(sim,worker,crowd,20);
  assert.ok(sim.players[0].resources.food>=bank+18,'all carried food must be credited');assert.equal(worker.order?.target,farm.id);assert.ok(worker.work>0,'the farmer resumes harvesting after delivery');
  assert.equal(sim.events.some(event=>event.type==='order-blocked'&&event.entity.id===worker.id),false);
  assert.ok(crowd.every((unit,i)=>unit.x===positions[i][0]&&unit.z===positions[i][1]),'routing does not teleport nearby workers');
  }
});

test('a legacy saved blocked return retries the approach and preserves its next queued command',()=>{
  const sim=fixture(),town=sim.addBuilding('towncenter',0,-136,0,true),tree=sim.addResource('wood',-160,-15,6),worker=sim.addUnit('villager',0,-150,0),queued={type:'move',x:-120,z:15},bank=sim.players[0].resources.food;
  worker.carry=4.9383;worker.carryType='food';worker.order={type:'gather',target:tree.id,returning:true};worker.orders=[queued];worker.pathStatus='blocked';worker.pathRevision=sim.revision;worker.pathTargetX=town.x;worker.pathTargetZ=town.z;worker.repath=1;worker.stuckTime=5.9;
  const restored=Simulation.restore(JSON.parse(JSON.stringify(sim.serialize()))),mover=restored.get(worker.id);advance(restored,mover,[],35);
  assert.ok(restored.players[0].resources.food>=bank+4.9383);assert.equal(restored.get(tree.id),null);assert.ok(distance(mover,queued)<1.6);assert.equal(mover.order,null);assert.deepEqual(mover.orders,[]);
  assert.equal(restored.events.some(event=>event.type==='order-blocked'&&event.entity.id===mover.id),false);
});

test('an AI worker changing resource type first delivers its existing cargo to the correct goal',()=>{
  const sim=fixture(),town=sim.addBuilding('towncenter',1,-136,0,true),farm=sim.addBuilding('farm',1,-150,-10,true),tree=sim.addResource('wood',-165,-12,300),other=sim.addUnit('villager',1,-150,-10),worker=sim.addUnit('villager',1,-150,0),bank=sim.players[1].resources.food;
  other.gatherType='food';other.order={type:'gather',target:farm.id};worker.carry=4.9383;worker.carryType='food';worker.gatherType='food';sim.assignWorker(worker);assert.equal(worker.order?.target,tree.id);
  const before=distance(worker,town);advance(sim,worker,[other],.1);assert.ok(distance(worker,town)<before,'the first movement heads toward the drop site rather than the new forest');
  advance(sim,worker,[other],8);assert.ok(sim.players[1].resources.food>=bank+4.9383);assert.equal(worker.order?.target,tree.id);assert.equal(sim.events.some(event=>event.type==='order-blocked'&&event.entity.id===worker.id),false);
});

test('alternate drop-site approaches cannot cross water, connected walls or hostile gates',()=>{
  for(const barrier of ['water','wall']){
    const sim=fixture(barrier==='water'?'coast':'highlands'),town=sim.addBuilding('towncenter',0,25,20,true),farm=sim.addBuilding('farm',0,35,20,true),worker=sim.addUnit('villager',0,barrier==='water'?-25:0,20),bank=sim.players[0].resources.food;
    if(barrier==='wall'){for(let z=-sim.halfWorld+1;z<=sim.halfWorld-1;z+=2.85)sim.addBuilding('wall',4,12,z,true);sim.addBuilding('gate',4,12,20,true);}
    worker.carry=18;worker.carryType='food';worker.order={type:'gather',target:farm.id,returning:true};advance(sim,worker,[],12);
    assert.equal(sim.players[0].resources.food,bank);assert.equal(worker.carry,18,'unreachable delivery preserves carried food');assert.ok(worker.x<(barrier==='water'?0:12));assert.ok(distance(worker,town)>town.r+2.6);
  }
});

test('active gathering, construction, repair and delivery face the actual 3D work target',()=>{
  for(const type of ['food','wood','gold','stone']){const sim=fixture('highlands'),worker=sim.addUnit('villager',0,0,20),source=sim.addResource(type,2,20,300);worker.order={type:'gather',target:source.id};sim.tickUnit(worker,.1);assert.ok(worker.carry>0);assert.equal(worker.moving,false);assert.equal(worker.heading,Math.PI/2);}
  for(const action of ['build','repair']){const sim=fixture('highlands'),worker=sim.addUnit('villager',0,0,20),building=sim.addBuilding('house',0,-4,20,action==='repair');if(action==='repair')building.hp-=25;const before=building.hp;worker.order={type:action,target:building.id};sim.tickUnit(worker,.1);assert.ok(building.hp>before);assert.equal(worker.heading,-Math.PI/2);}
  const sim=fixture('highlands'),town=sim.addBuilding('towncenter',0,0,24,true),source=sim.addResource('wood',12,20,300),worker=sim.addUnit('villager',0,0,20),bank=sim.players[0].resources.wood;worker.order={type:'gather',target:source.id,returning:true};worker.carry=18;worker.carryType='wood';worker.heading=Math.PI;sim.tickUnit(worker,.1);assert.equal(sim.players[0].resources.wood,bank+18);assert.equal(worker.heading,0);assert.equal(sim.nearestDrop(worker,'wood'),town);
});
