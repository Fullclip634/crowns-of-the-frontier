import test from 'node:test';
import assert from 'node:assert/strict';
import {graphicsSelection,applyGraphicsChoice} from '../src/graphics-settings.js';
import {WorldView} from '../src/world.js';

test('an explicit quality stays fixed under frame pressure while automatic graphics remain opt-in',()=>{
  const settings={quality:'low',autoQuality:true,frameRate:'60'};
  assert.equal(graphicsSelection(settings),'auto');assert.equal(applyGraphicsChoice(settings,'high','low'),'high');assert.equal(settings.autoQuality,false);assert.equal(graphicsSelection(settings),'high');
  const view={settings,dynamicScale:1,frameAverage:.016,performanceClock:0,renderer:{shadowMap:{enabled:true}},quality(){throw new Error('Manual graphics must never downgrade automatically.');}};
  for(let frame=0;frame<100;frame++)WorldView.prototype.adapt.call(view,.5);
  assert.equal(settings.quality,'high');assert.equal(view.dynamicScale,1);assert.equal(view.renderer.shadowMap.enabled,true);assert.equal(settings.frameRate,'60');
  assert.equal(applyGraphicsChoice(settings,'auto','medium'),'medium');assert.equal(settings.autoQuality,true);assert.equal(graphicsSelection(settings),'auto');
});

test('automatic native graphics account for held GPU submissions at both frame targets',()=>{
  const original=globalThis.devicePixelRatio;globalThis.devicePixelRatio=1;
  try{for(const frameRate of ['30','60']){
    const changes=[],view={settings:{quality:'high',autoQuality:true,frameRate},dynamicScale:1,frameAverage:1/60,performanceClock:0,renderFlight:{submitted:0,skipped:0},renderer:{backend:{isWebGPUBackend:true}},quality(value){changes.push(value);this.settings.quality=value;}};
    for(let i=0;i<301;i++){WorldView.prototype.adapt.call(view,1/60);if(i%2)view.renderFlight.skipped++;else view.renderFlight.submitted++;}
    assert.deepEqual(changes,['medium']);assert.ok(view.graphicsPressure.held>0);assert.ok(view.graphicsPressure.effectiveFrameSeconds>1/Number(frameRate)*1.6);assert.equal(view.settings.frameRate,frameRate);
    view.settings.autoQuality=false;for(let i=0;i<301;i++){view.renderFlight.skipped++;WorldView.prototype.adapt.call(view,1/60);}assert.deepEqual(changes,['medium']);assert.equal(view.renderPressure,null);
  }}finally{if(original===undefined)delete globalThis.devicePixelRatio;else globalThis.devicePixelRatio=original;}
});

test('native pressure windows reset during graphics work and tolerate replaced counters',()=>{
  const original=globalThis.devicePixelRatio;globalThis.devicePixelRatio=1;
  try{
    const changes=[],view={settings:{quality:'high',autoQuality:true,frameRate:'60'},dynamicScale:1,frameAverage:1/60,performanceClock:0,renderFlight:{submitted:100,skipped:100},renderer:{backend:{isWebGPUBackend:true}},quality:value=>changes.push(value)};
    WorldView.prototype.adapt.call(view,1/60);view.graphicsLoading=true;view.renderFlight.skipped+=1000;WorldView.prototype.adapt.call(view,1);assert.equal(view.renderPressure,null);assert.equal(view.performanceClock,0);
    view.graphicsLoading=false;view.renderFlight={submitted:0,skipped:0};for(let i=0;i<301;i++){view.renderFlight.submitted++;WorldView.prototype.adapt.call(view,1/60);}assert.deepEqual(changes,[]);assert.equal(view.graphicsPressure.held,0);
    for(let i=0;i<301;i++){view.renderFlight.skipped++;WorldView.prototype.adapt.call(view,1/60);}assert.deepEqual(changes,['medium']);assert.equal(view.graphicsPressure.submitted,0);assert.ok(Number.isFinite(view.graphicsPressure.effectiveFrameSeconds));
  }finally{if(original===undefined)delete globalThis.devicePixelRatio;else globalThis.devicePixelRatio=original;}
});
