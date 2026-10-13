import test from 'node:test';
import assert from 'node:assert/strict';
import {SpatialBuckets} from '../src/spatial-buckets.js';
import {Simulation} from '../src/simulation.js';

test('reused spatial cells retain insertion order, negative coordinates and release old entities',()=>{
  const index=new SpatialBuckets(4),a={id:1,x:-.01,z:3.99},b={id:2,x:-2,z:2},c={id:3,x:4,z:4};index.add(a,true);index.add(b);index.add(c,true);
  const cell=index.columns.get(-1).get(0);assert.deepEqual([...cell],[a,b]);assert.deepEqual(cell.combat,[a]);assert.equal(index.active.length,2);assert.equal(index.columns.get(1).get(1)[0],c);
  index.reset();assert.equal(cell.length,0);assert.equal(cell.combat.length,0);assert.equal(index.active.length,0);
  b.x=-3;index.add(b,true);assert.equal(index.columns.get(-1).get(0),cell,'array is reused');assert.deepEqual([...cell],[b]);assert.deepEqual(cell.combat,[b]);assert.equal(index.columns.get(1).get(1).length,0,'previous occupants do not remain candidates');
  index.reset();assert.equal(cell.length,0);assert.equal(cell.combat.length,0);
});

test('tick indexes follow moved, embarked, dead and restored troops without entering saves',()=>{
  const s=new Simulation({mode:'sandbox',seed:512});s.stop(s.owned(0,'unit').map(e=>e.id));const e=s.addUnit('spearman',0,-20,30);e.stance='hold';s.tick(.1);
  const prior=s.unitBuckets.get(-5).get(7),storage=s.unitSpatial;assert.ok(prior.includes(e));
  e.x=40;e.z=-40;s.tick(.1);assert.equal(s.unitSpatial,storage);assert.ok(!prior.includes(e));assert.ok(s.unitBuckets.get(10).get(-10).includes(e));
  e.embarked=true;e.transport=null;s.tick(.1);assert.ok(!s.unitBuckets.get(10).get(-10).includes(e));assert.equal(s.get(e.id),null,'missing transport still applies the existing passenger-death rule');
  const save=s.serialize();for(const key of ['entitySpatial','unitSpatial','entityBuckets','unitBuckets'])assert.equal(save[key],undefined);
  const restored=Simulation.restore(save);assert.equal(restored.unitSpatial,undefined);restored.tick(.1);assert.ok(restored.unitSpatial instanceof SpatialBuckets);assert.ok([...restored.unitSpatial.active].every(bucket=>bucket.every(unit=>unit.hp>0&&!unit.embarked)));
});
