import test from 'node:test';
import assert from 'node:assert/strict';
import {applyVisibilityDelta,createVisibilityDelta,VisibilityReceiver} from '../src/network-visibility.js';

test('visibility deltas encode visible toggles and only newly explored cells',()=>{
  const previousVisible=Uint8Array.from([1,1,0,0,1]),previousExplored=Uint8Array.from([1,1,0,0,1]);
  const visible=Uint8Array.from([1,0,1,0,0]),explored=Uint8Array.from([1,1,1,0,1]);
  assert.deepEqual(createVisibilityDelta(previousVisible,previousExplored,visible,explored,7),{sequence:7,visible:[2,5,8],explored:[2]});
  assert.deepEqual([...previousVisible],[1,1,0,0,1]);assert.deepEqual([...previousExplored],[1,1,0,0,1]);
});

test('visibility deltas reconstruct the latest grids in place without disturbing explored territory',()=>{
  const visible=Uint8Array.from([1,1,0,0,1]),explored=Uint8Array.from([1,1,0,0,1]);
  const expectedVisible=Uint8Array.from([1,0,1,0,0]),expectedExplored=Uint8Array.from([1,1,1,0,1]);
  const delta=createVisibilityDelta(visible,explored,expectedVisible,expectedExplored,3),result=applyVisibilityDelta(visible,explored,delta);
  assert.equal(result.visible,visible);assert.equal(result.explored,explored);assert.equal(result.sequence,3);
  assert.deepEqual([...visible],[...expectedVisible]);assert.deepEqual([...explored],[...expectedExplored]);
});

test('visibility deltas reject mismatched grids and out-of-range cell updates',()=>{
  assert.throws(()=>createVisibilityDelta(new Uint8Array(1),new Uint8Array(1),new Uint8Array(2),new Uint8Array(2),1),RangeError);
  assert.throws(()=>applyVisibilityDelta(new Uint8Array(2),new Uint8Array(2),{sequence:1,visible:[4],explored:[]}),RangeError);
  assert.throws(()=>applyVisibilityDelta(new Uint8Array(2),new Uint8Array(2),{sequence:1,visible:[],explored:[2]}),RangeError);
});

test('invalid visibility packets cannot partially reveal the live grids',()=>{
  const visible=new Uint8Array(3),explored=new Uint8Array(3);
  assert.throws(()=>applyVisibilityDelta(visible,explored,{sequence:1,visible:[1,3],explored:[1,3]}),RangeError);
  assert.deepEqual([...visible],[0,0,0]);assert.deepEqual([...explored],[0,0,0]);
});

test('a missing update requires a full resync and legacy full snapshots remain supported',()=>{
  const receiver=new VisibilityReceiver();
  assert.equal(receiver.read({visibilityDelta:{sequence:1,visible:[],explored:[]}}),null);
  const first=receiver.read({visible:[1,0,0],explored:[1,0,0],visibilitySequence:0});
  const next=receiver.read({visibilityDelta:{sequence:1,visible:[0,3],explored:[1]}});
  assert.equal(next.visible,first.visible);assert.deepEqual([...next.visible],[0,1,0]);
  assert.equal(receiver.read({visibilityDelta:{sequence:3,visible:[5],explored:[2]}}),null);
  assert.equal(receiver.read({visibilityDelta:{sequence:1,visible:[5],explored:[2]}}),null,'duplicates cannot rewind the grids');
  assert.deepEqual([...next.visible],[0,1,0]);assert.deepEqual([...next.explored],[1,1,0]);
  const restored=receiver.read({visible:[0,0,1],explored:[1,1,1],visibilitySequence:0});
  assert.notEqual(restored.visible,next.visible);
  assert.ok(receiver.read({visibilityDelta:{sequence:1,visible:[],explored:[]}}));
  assert.ok(receiver.read({visible:[1,0,0],explored:[1,1,1]}));
  assert.equal(receiver.sequence,null);
  assert.ok(receiver.read({visible:[0,1,0],explored:[1,1,1]}),'old servers keep sending full snapshots');
  assert.equal(receiver.read({visible:[1,0],explored:[1]}),null);
  assert.equal(receiver.read({visible:[2],explored:[1]}),null);
});
