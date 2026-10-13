import test from 'node:test';
import assert from 'node:assert/strict';
import {WorldView} from '../src/world.js';

test('automatic graphics responds to real slow-frame time and respects the manual-quality switch',()=>{
  const previous=globalThis.devicePixelRatio;globalThis.devicePixelRatio=1;
  try{
    const fixture=autoQuality=>({settings:{quality:'high',autoQuality},frameAverage:.016,performanceClock:0,dynamicScale:1,renderer:{shadowMap:{enabled:true},setPixelRatio(){}},quality(value){this.settings.quality=value;this.performanceClock=0;this.frameAverage=.016;}});
    const slow=fixture(true);
    // Two long frames must be sufficient to respond after five actual seconds.
    WorldView.prototype.adapt.call(slow,2.5);WorldView.prototype.adapt.call(slow,2.5);assert.equal(slow.settings.quality,'medium');
    for(let i=0;i<60;i++)WorldView.prototype.adapt.call(slow,.1);assert.equal(slow.settings.quality,'low');
    const manual=fixture(false);for(let i=0;i<60;i++)WorldView.prototype.adapt.call(manual,.1);assert.equal(manual.settings.quality,'high');assert.equal(manual.dynamicScale,1);
    const smooth=fixture(true);for(let i=0;i<400;i++)WorldView.prototype.adapt.call(smooth,.016);assert.equal(smooth.settings.quality,'high');
  }finally{if(previous===undefined)delete globalThis.devicePixelRatio;else globalThis.devicePixelRatio=previous;}
});
