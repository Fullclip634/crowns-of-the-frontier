import test from 'node:test';
import assert from 'node:assert/strict';
import {mergeSnapshotEntities} from '../src/snapshot-entities.js';

test('compact updates retain resources, ignore unknown IDs and resume units from their displayed positions',()=>{
  const troop={id:1,kind:'unit',x:5,z:6,renderX:4,renderZ:5},gold={id:2,kind:'resource',amount:500,hp:1},wood={id:3,kind:'resource',amount:300,hp:1};
  const incoming={id:1,kind:'unit',x:8,z:9},spawn={id:4,kind:'unit',x:10,z:11},packet={entities:[incoming,spawn],compactResources:true,resourceUpdates:[{id:2,amount:0,hp:0},{id:999,amount:7},{id:1,hp:0}]};
  const result=mergeSnapshotEntities([troop,gold,wood],packet,1234);
  assert.deepEqual(result.entities,[incoming,spawn,gold,wood]);assert.equal(result.index.get(2),gold);assert.equal(result.index.get(1),incoming);
  assert.equal(gold.amount,0);assert.equal(gold.hp,0);assert.equal(wood.amount,300);assert.equal(troop.hp,undefined);assert.equal(result.index.has(999),false);
  assert.equal(incoming.renderFromX,4);assert.equal(incoming.renderFromZ,5);assert.equal(incoming.snapshotAt,1234);assert.equal(spawn.snapshotAt,undefined);assert.deepEqual(packet.entities,[incoming,spawn]);
});

test('full snapshots replace resources and share one timestamp across existing units',()=>{
  const previous=[{id:1,kind:'unit',x:2,z:3},{id:2,kind:'unit',x:4,z:5},{id:3,kind:'resource',amount:90}],entities=[{id:1,kind:'unit',x:6,z:7},{id:2,kind:'unit',x:8,z:9},{id:4,kind:'resource',amount:200}];
  const result=mergeSnapshotEntities(previous,{entities,resourceUpdates:[{id:3,amount:0}]},500);
  assert.deepEqual(result.entities,entities);assert.equal(result.index.has(3),false);assert.equal(previous[2].amount,90);
  for(const unit of entities.slice(0,2))assert.equal(unit.snapshotAt,500);assert.equal(entities[0].renderFromX,2);assert.equal(entities[1].renderFromZ,5);
});
