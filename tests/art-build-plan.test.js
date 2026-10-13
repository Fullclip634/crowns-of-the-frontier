import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import {artBuildPlan} from '../scripts/blender/build-plan.mjs';

test('candidate and partial art exports cannot target the playable model directory',()=>{
  const project=path.resolve('.'),live=artBuildPlan(project);
  assert.equal(live.outputDirectory,path.join(project,'src','assets3d'));
  for(const args of [['--stage'],['--stage','--resources-only']]){
    const plan=artBuildPlan(project,args);assert.notEqual(plan.outputDirectory,live.outputDirectory);assert.notEqual(plan.rawDirectory,live.rawDirectory);
    assert.ok(plan.outputDirectory.startsWith(path.join(project,'.tools','art-candidate')+path.sep));
    if(plan.resources)assert.notEqual(plan.sourceDirectory,live.sourceDirectory);
  }
});
test('partial previews and invalid options fail before any output can overwrite the complete roster',()=>{
  const project=path.resolve('.');for(const args of [['--resources-only'],['--output','../dist'],['--stage','--stage'],['--stgae']])assert.throws(()=>artBuildPlan(project,args));
});
