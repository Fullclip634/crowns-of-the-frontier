import test from 'node:test';
import assert from 'node:assert/strict';
import {SimulationPacer,SIMULATION_STEP} from '../src/simulation-pacing.js';

test('foreground simulation retains one-times speed through low and uneven render cadence',()=>{
  for(const schedule of [Array(240).fill(.125),Array(1800).fill(1/60),Array.from({length:300},(_,i)=>i%2?.16:.04)]){
    const pacer=new SimulationPacer();let steps=0;for(const elapsed of schedule)steps+=pacer.advance(elapsed);
    assert.equal(steps,300);assert.ok(pacer.accumulator<1e-8);assert.equal(pacer.discardedSeconds,0);assert.equal(steps*SIMULATION_STEP,30);
  }
});

test('a long stall and accelerated overload bound recovery while retaining a bounded backlog',()=>{
  const pacer=new SimulationPacer();assert.equal(pacer.advance(30),2);assert.ok(Math.abs(pacer.accumulator-.05)<1e-8);assert.equal(pacer.discardedSeconds,29.75);
  pacer.reset();assert.equal(pacer.advance(.25,3),3);assert.ok(Math.abs(pacer.accumulator-.2)<1e-8);assert.equal(pacer.discardedSeconds,.25);
  for(let i=0;i<100;i++){assert.ok(pacer.advance(.25,3)<=3);assert.ok(pacer.accumulator<=.2+1e-8);}assert.ok(pacer.discardedSeconds>0);
});

test('normal acceleration, pause reset and invalid timestamps preserve a finite fixed-step clock',()=>{
  const pacer=new SimulationPacer();let steps=0;for(let i=0;i<600;i++)steps+=pacer.advance(1/60,2);assert.equal(steps,200);assert.equal(pacer.discardedSeconds,0);
  pacer.advance(.075);pacer.reset();assert.equal(pacer.advance(.016),0);assert.ok(Math.abs(pacer.accumulator-.016)<1e-8);
  for(const elapsed of [NaN,Infinity,-1])assert.equal(pacer.advance(elapsed),0);assert.ok(Number.isFinite(pacer.accumulator));assert.ok(Number.isFinite(pacer.discardedSeconds));
});
