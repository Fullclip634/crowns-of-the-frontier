import test from 'node:test';
import assert from 'node:assert/strict';
import {installBattleZoomGuard} from '../src/battle-zoom-guard.js';

function emit(target,type,properties={}){
  const event=new Event(type,{cancelable:true});Object.assign(event,properties);target.dispatchEvent(event);return event.defaultPrevented;
}

test('active battles cancel native Safari gestures, multi-touch and browser zoom shortcuts',()=>{
  const target=new EventTarget(),dispose=installBattleZoomGuard(target,()=>true);
  for(const type of ['gesturestart','gesturechange','gestureend'])assert.equal(emit(target,type),true,type);
  for(const type of ['touchstart','touchmove'])assert.equal(emit(target,type,{touches:[{},{}]}),true,type);
  assert.equal(emit(target,'wheel',{ctrlKey:true}),true);
  for(const key of ['+','=','-','0'])for(const modifier of ['ctrlKey','metaKey'])assert.equal(emit(target,'keydown',{key,[modifier]:true}),true);
  dispose();assert.equal(emit(target,'gesturestart'),false);
});

test('single-finger panel scrolling, normal input and menu gestures retain their defaults',()=>{
  const target=new EventTarget();let playing=true;installBattleZoomGuard(target,()=>playing);
  assert.equal(emit(target,'touchmove',{touches:[{}]}),false);assert.equal(emit(target,'wheel',{ctrlKey:false}),false);
  assert.equal(emit(target,'keydown',{key:'c',ctrlKey:true}),false);assert.equal(emit(target,'keydown',{key:'+'}),false);
  playing=false;assert.equal(emit(target,'gesturechange'),false);assert.equal(emit(target,'touchstart',{touches:[{},{}]}),false);assert.equal(emit(target,'wheel',{ctrlKey:true}),false);
});
