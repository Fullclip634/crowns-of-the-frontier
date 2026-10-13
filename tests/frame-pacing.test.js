import test from 'node:test';
import assert from 'node:assert/strict';
import {FramePacer,targetFrameRate,normalizeFrameRate} from '../src/frame-pacing.js';

test('frame targets are separate from visual quality and old settings migrate to automatic',()=>{
  for(const quality of ['low','medium','high']){assert.equal(targetFrameRate({quality},false),60);assert.equal(targetFrameRate({quality},true),30);assert.equal(targetFrameRate({quality,frameRate:'60'},true),60);}
  assert.equal(normalizeFrameRate('bad'),'auto');assert.equal(normalizeFrameRate(30),'30');
});

test('60 FPS pacing survives fractional display ticks, while 30 FPS preserves its lower-power cadence',()=>{
  for(const fps of [30,60]){
    const pacer=new FramePacer();let rendered=0;
    for(let i=0;i<600;i++)if(pacer.due(i*1000/60+(i%2?.12:-.12),1000/fps))rendered++;
    assert.ok(Math.abs(rendered-fps*10)<=1,{fps,rendered});
    assert.equal(pacer.due(12000,1000/fps),true);assert.equal(pacer.due(12000.1,1000/fps),false);
    assert.equal(pacer.due(12000.2,1000),true);assert.equal(pacer.due(12100,1000),false);
    assert.equal(pacer.due(100,1000/fps),true,'a reset animation clock recovers');
  }
});
