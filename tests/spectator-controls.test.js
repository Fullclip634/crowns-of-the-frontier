import test from 'node:test';
import assert from 'node:assert/strict';
import {isSpectatingAI,spectatorActionAllowed} from '../src/spectator-controls.js';

test('spectator restrictions apply only while the AI battle is actually being watched',()=>{
  const sim={options:{mode:'custom',spectator:true,multiplayer:false}};
  assert.equal(isSpectatingAI(true,sim),true);assert.equal(isSpectatingAI(false,sim),false,'the main menu must allow opening another custom battle');
  assert.equal(isSpectatingAI(true,{options:{...sim.options,multiplayer:true}}),false);assert.equal(isSpectatingAI(true,{options:{mode:'custom',spectator:false}}),false);assert.equal(isSpectatingAI(false,null),false);
});

test('observers can apply settings and recover graphics while army commands remain disabled',()=>{
  for(const action of ['settings','apply-settings','pause','menu','restart','save','camera-left','camera-farther','inspect','retry-battlefield','reload-battlefield','retry-graphics','copy-graphics-report'])assert.equal(spectatorActionAllowed(action),true,action);
  for(const action of ['build','wall-build','attackmove','stop','patrol','guard','send-donation','resign','unload','auto-work','unknown-command'])assert.equal(spectatorActionAllowed(action),false,action);
});
