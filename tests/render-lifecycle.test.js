import test from 'node:test';
import assert from 'node:assert/strict';
import {releaseRenderers} from '../src/render-lifecycle.js';

test('navigation frees battlefield and portrait GPU contexts once',()=>{
  const calls=[],renderer=name=>({dispose:()=>calls.push(name+' dispose'),forceContextLoss:()=>calls.push(name+' context')}),view={renderer:renderer('field'),modelPortrait:{renderer:renderer('portrait')}};
  assert.equal(releaseRenderers(view),true);assert.deepEqual(calls,['field dispose','field context','portrait dispose','portrait context']);assert.equal(releaseRenderers(view),false);assert.equal(calls.length,4);
});

test('shared or missing renderers do not duplicate disposal and context loss is optional',()=>{
  let disposed=0;const renderer={dispose:()=>disposed++},view={renderer,modelPortrait:{renderer}};
  assert.equal(releaseRenderers(undefined),false);assert.equal(releaseRenderers(view),true);assert.equal(disposed,1);
});
