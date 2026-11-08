import test from 'node:test';
import assert from 'node:assert/strict';
import {grassTuftGeometry,tuftBlades} from '../src/ground-cover.js';

// Ground vegetation is the single largest triangle cost in a match: at full
// detail a tuft is eighty-four triangles and the high tier places up to 4,800 of
// them, which is more than every building in a town combined. The tiers that
// phones and older laptops use therefore draw thinner tufts rather than fewer
// patches, so coverage is unchanged while the cost drops by a third.
const triangles=geometry=>(geometry.index?geometry.index.count:geometry.attributes.position.count)/3;

test('the cheap tiers draw thinner grass instead of less grass',()=>{
  assert.equal(tuftBlades('high'),6,'the high tier keeps the full tuft');
  assert.equal(tuftBlades('balanced'),4);
  assert.equal(tuftBlades('low'),4);
  assert.equal(tuftBlades(undefined),4,'an unknown quality falls back to the cheap tuft');

  const full=triangles(grassTuftGeometry(tuftBlades('high'))),cheap=triangles(grassTuftGeometry(tuftBlades('balanced')));
  assert.equal(full,84);
  assert.equal(cheap,56);
  assert.ok(cheap/full<.7,'the cheap tuft is at least a third lighter');

  // The saving has to be worth having at the capacities the tiers actually use.
  const saved=1800*full-1800*cheap;
  assert.ok(saved>50000,`saves ${Math.round(saved)} triangles on the mid tier`);
  const midTotal=1800*cheap,highTotal=4800*full;
  assert.ok(midTotal<highTotal*.3,`the mid tier costs ${Math.round(midTotal)} against the high tier's ${Math.round(highTotal)}`);
});
