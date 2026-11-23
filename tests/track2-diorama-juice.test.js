import {describe,it} from 'node:test';
import assert from 'node:assert/strict';
import {WorldView} from '../src/world.js';

describe('Track 2: Zero-Bloat Battlefield VFX Juice',()=>{
  it('celebrateBuild and celebrateAgeUp reuse pooled sparks & dust and obey reducedMotion',()=>{
    const emitted=[];
    const fakeView={
      settings:{quality:'high',reducedMotion:false},
      sim:{isVisible:()=>true},
      groundHeight:()=>0,
      sparks(...args){emitted.push(['sparks',...args]);},
      dust(...args){emitted.push(['dust',...args]);},
    };
    WorldView.prototype.celebrateBuild.call(fakeView,{owner:0,x:10,z:12,r:2.6});
    assert.equal(emitted.length,2,'spawns pooled sparks + dust on completion');
    assert.equal(emitted[0][0],'sparks');
    assert.equal(emitted[1][0],'dust');

    emitted.length=0;
    WorldView.prototype.celebrateAgeUp.call(fakeView,{owner:0,x:0,z:0,r:3.5});
    assert.equal(emitted.length,2,'spawns golden sparks + dust on age up');

    emitted.length=0;
    fakeView.settings.reducedMotion=true;
    WorldView.prototype.celebrateBuild.call(fakeView,{owner:0,x:10,z:12,r:2.6});
    WorldView.prototype.celebrateAgeUp.call(fakeView,{owner:0,x:0,z:0,r:3.5});
    assert.equal(emitted.length,0,'reducedMotion suppresses celebration particles');
  });
});
