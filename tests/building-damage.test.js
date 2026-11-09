import test from 'node:test';
import assert from 'node:assert/strict';
import {WorldView} from '../src/world.js';

// Damaged buildings used to look exactly like healthy ones: nothing in the
// scene changed until the entity vanished. The smoke pass is the signal, so its
// selection rules are what matter: only wounded buildings, only a few at once,
// and never more often than the cooldown allows.
function stub(entities,{visible=true}={}){
  const calls=[];
  const view={
    sim:{entities,isVisible:()=>visible},
    groundHeight:()=>0,
    smoke:(x,y,z,size)=>{calls.push({x,y,z,size});return true;},
    calls,
  };
  return view;
}
const building=(id,ratio,extra={})=>({id,kind:'building',hp:ratio*100,maxHp:100,progress:1,x:id,z:0,r:2,...extra});

test('only wounded buildings smoke, and worse damage smokes harder',()=>{
  const view=stub([building(1,1),building(2,.8),building(3,.5),building(4,.2)]);
  WorldView.prototype.damageSmoke.call(view,1);
  assert.equal(view.calls.length,2,'two of the four buildings are below sixty percent');
  assert.equal(view.calls[0].size,1,'light damage smokes lightly');
  assert.equal(view.calls[1].size,1.5,'critical damage smokes harder');
  assert.ok(view.calls[0].y>1,'smoke starts above the roof line, not on the ground');
});

test('unfinished, dead and hidden buildings never smoke',()=>{
  const view=stub([
    building(1,.1,{progress:.4}),
    building(2,0),
    building(3,.1),
  ],{visible:false});
  WorldView.prototype.damageSmoke.call(view,1);
  assert.equal(view.calls.length,0,'a construction site is not a burning building, and the unseen is not drawn');
});

test('smoke is rate limited and capped so a burning town cannot flood the effect budget',()=>{
  const many=Array.from({length:20},(_,i)=>building(i+1,.1));
  const view=stub(many);
  WorldView.prototype.damageSmoke.call(view,.1);
  assert.equal(view.calls.length,0,'the cooldown holds before the first emission');
  WorldView.prototype.damageSmoke.call(view,1);
  assert.ok(view.calls.length<=6,`at most six buildings smoke per burst, got ${view.calls.length}`);
  const first=view.calls.length;
  WorldView.prototype.damageSmoke.call(view,.1);
  assert.equal(view.calls.length,first,'a second call inside the cooldown emits nothing');
});
