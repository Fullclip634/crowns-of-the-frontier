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

function finger(identifier=1,x=20,y=30){return {identifier,clientX:x,clientY:y};}
function touch(target,type,time,touches,changedTouches=touches){
  const event=new Event(type,{cancelable:true});Object.defineProperty(event,'timeStamp',{value:time});Object.assign(event,{touches,changedTouches});target.dispatchEvent(event);return event.defaultPrevented;
}
function tap(target,time,x=20,y=30){const point=finger(1,x,y);touch(target,'touchstart',time,[point]);return touch(target,'touchend',time+40,[],[point]);}

test('only a nearby second completed tap cancels page zoom and preserves its game action once',()=>{
  const target=new EventTarget(),actions=[];installBattleZoomGuard(target,()=>true,{onDoubleTap:(event,details)=>actions.push({event,details})});
  assert.equal(tap(target,1000),false);assert.equal(tap(target,1150),true);assert.equal(actions.length,1);assert.ok(Number.isFinite(actions[0].details.startedAt));
  assert.equal(tap(target,1300,100,200),false,'a different part of the page is not a double-tap');
  assert.equal(tap(target,2000,100,200),false,'slow taps retain native clicks');
});

test('scrolling, long presses, canceled gestures and multi-touch never become double taps',()=>{
  for(const interrupt of ['move','hold','cancel','multi']){
    const target=new EventTarget();installBattleZoomGuard(target,()=>true);tap(target,1000);
    touch(target,'touchstart',1100,[finger()]);
    if(interrupt==='move')touch(target,'touchmove',1120,[finger(1,50,30)]);
    if(interrupt==='cancel')touch(target,'touchcancel',1120,[],[finger()]);
    if(interrupt==='multi')touch(target,'touchstart',1120,[finger(),finger(2,80,30)]);
    assert.equal(touch(target,'touchend',interrupt==='hold'?1600:1150,[],[finger()]),false,interrupt);
    assert.equal(tap(target,1200),false,interrupt+' resets the double-tap candidate');
  }
});

test('menu taps and editable fields keep native defaults; disposing removes the fallback',()=>{
  const target=new EventTarget();let playing=false;const dispose=installBattleZoomGuard(target,()=>playing);
  assert.equal(tap(target,1000),false);assert.equal(tap(target,1100),false);playing=true;
  target.closest=()=>({});assert.equal(tap(target,1200),false);assert.equal(tap(target,1300),false);
  delete target.closest;dispose();assert.equal(tap(target,1400),false);assert.equal(tap(target,1500),false);
});
