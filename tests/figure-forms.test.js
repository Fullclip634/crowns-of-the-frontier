import test from 'node:test';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import {validateFigureCatalogue} from '../scripts/blender/validate-figure-forms.mjs';

test('authored figures keep solid clothing, grounded feet, mobile geometry budgets and attached working tools in every tier',async()=>{
  const report=await validateFigureCatalogue(fileURLToPath(new URL('../src/assets3d/',import.meta.url)));
  assert.equal(report.models.length,45);assert.equal(report.workPoses,492);assert.equal(report.clothingClearances,315);assert.equal(report.passed,true);
});
