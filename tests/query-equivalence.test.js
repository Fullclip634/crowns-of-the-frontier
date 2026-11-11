import test from 'node:test';
import assert from 'node:assert/strict';
import {Simulation} from '../src/simulation.js';
import {battlePreset} from '../src/custom-battle.js';
import {UNITS,BUILDINGS} from '../src/data.js';

// count() replaced owned().length in the population, capacity and reservation
// queries because building an array just to read its length was the largest
// avoidable allocation in the tick. It must answer exactly what owned() did.
test('count answers exactly what owned().length answered',()=>{
  const sim=new Simulation({mode:'custom',map:'highlands',mapSize:'medium',seed:909,slots:battlePreset('2v2')});
  while(sim.time<180&&!sim.ended)sim.tick(.1);
  assert.ok(sim.entities.length>200,'the match has real content to count');
  const owners=[...sim.players.keys(),-1,99];
  const kinds=[undefined,'unit','building','resource'];
  for(const owner of owners)for(const kind of kinds){
    const types=new Set(sim.entities.filter(e=>!kind||e.kind===kind).map(e=>e.type));
    for(const type of [undefined,...types]){
      assert.equal(sim.count(owner,kind,type),sim.owned(owner,kind,type).length,`owner ${owner} ${kind||'any'} ${type||'any'}`);
    }
  }
});

test('population, capacity and reservations match their original definitions',()=>{
  const sim=new Simulation({mode:'custom',map:'highlands',mapSize:'medium',seed:512,slots:battlePreset('2v2'),populationLimit:80});
  while(sim.time<150&&!sim.ended)sim.tick(.1);
  for(const owner of sim.players.keys()){
    assert.equal(sim.population(owner),sim.owned(owner,'unit').length,`population ${owner}`);
    const expectedCapacity=Math.min(80,sim.owned(owner,'building').filter(e=>e.progress>=1).reduce((n,e)=>n+(BUILDINGS[e.type].cap||0),0));
    assert.equal(sim.capacity(owner),expectedCapacity,`capacity ${owner}`);
    const expectedReserved=sim.owned(owner,'building').reduce((n,e)=>n+e.queue.filter(q=>q.kind==='unit').length,0);
    assert.equal(sim.reservedPopulation(owner),expectedReserved,`reservations ${owner}`);
  }
});

// Sight buckets keyed on a packed integer instead of an "x:z" string. A packing
// collision would silently reveal or hide units, so check every query against a
// brute-force sweep of the same rule.
test('packed sight keys agree with a brute-force visibility sweep',()=>{
  const sim=new Simulation({mode:'custom',map:'highlands',mapSize:'medium',seed:777,slots:battlePreset('2v2'),shareVision:true});
  while(sim.time<90&&!sim.ended)sim.tick(.1);
  const shared=sim.options.mode==='custom'&&sim.options.shareVision;
  const reference=(owner,entity)=>sim.entities.some(source=>
    source.hp>0&&!source.embarked&&(source.owner===owner||shared&&sim.allied(owner,source.owner))&&
    (source.kind==='unit'||source.kind==='building'&&source.progress>0)&&
    Math.hypot(source.x-entity.x,source.z-entity.z)<(source.kind==='unit'?UNITS[source.type].vision:BUILDINGS[source.type].vision||18)+(entity.r||0));
  let checked=0;
  for(const owner of sim.players.keys())for(const entity of sim.entities.filter(e=>e.kind==='unit'||e.kind==='building')){
    if(sim.options.mode==='custom'&&entity.kind==='building'&&sim.revealedOwners?.includes(entity.owner))continue;
    assert.equal(sim.canSee(owner,entity),reference(owner,entity),`owner ${owner} sees ${entity.kind} ${entity.type} at ${entity.x.toFixed(0)},${entity.z.toFixed(0)}`);
    checked++;
  }
  assert.ok(checked>200,`the sweep covered real queries (${checked})`);
});
