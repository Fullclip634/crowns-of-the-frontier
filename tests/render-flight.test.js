import test from 'node:test';
import assert from 'node:assert/strict';
import {canSubmitFrame,submittedFrame} from '../src/render-flight.js';

test('a busy WebGPU queue admits two frames and resumes after completion',async()=>{
  const done=[],view={renderer:{backend:{isWebGPUBackend:true,device:{queue:{onSubmittedWorkDone:()=>new Promise(resolve=>done.push(resolve))}}}}};
  assert.equal(canSubmitFrame(view),true);submittedFrame(view);
  assert.equal(canSubmitFrame(view),true);submittedFrame(view);
  assert.equal(canSubmitFrame(view),false);assert.equal(view.renderFlight.pending,2);
  done.shift()();await Promise.resolve();assert.equal(canSubmitFrame(view),true);
  submittedFrame(view);assert.equal(canSubmitFrame(view),false);
  done.forEach(resolve=>resolve());await Promise.resolve();assert.equal(view.renderFlight.pending,0);
});

test('device failure releases the frame budget without unhandled rejections',async()=>{
  const view={renderer:{backend:{isWebGPUBackend:true,device:{queue:{onSubmittedWorkDone:()=>Promise.reject(new Error('lost'))}}}}};
  submittedFrame(view);await Promise.resolve();assert.equal(view.renderFlight.pending,0);assert.equal(view.renderFlight.failed,1);
  view.renderer.backend.device.queue.onSubmittedWorkDone=()=>{throw Error('lost');};submittedFrame(view);assert.equal(view.renderFlight.pending,0);assert.equal(view.renderFlight.failed,2);
  const legacy={renderer:{backend:{isWebGLBackend:true}}};submittedFrame(legacy);assert.equal(canSubmitFrame(legacy),true);assert.equal(legacy.renderFlight,undefined);
});
