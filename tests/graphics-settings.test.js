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
