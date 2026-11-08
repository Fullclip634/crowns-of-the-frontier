import assert from 'node:assert/strict';

// Download budget for the phone catalogue. The earlier 4.125 MiB ceiling was
// only reachable because gltfpack's default simplification error was large
// enough to delete small authored parts from 63 models - gold inclusions,
// town-centre finials, house details. Keeping every authored part costs about
// 0.6 MB, so the ceiling reflects the complete catalogue instead.
export const LOW_CATALOGUE_BUDGET=4.75*1024*1024;
// The siege stage introduced the first explicit ceiling and recorded it in the
// manifest; keep the name so that record stays meaningful.
export const SOLID_SIEGE_LOW_BUDGET=LOW_CATALOGUE_BUDGET;
export function lowCatalogueBudget(manifest){
  const budget=LOW_CATALOGUE_BUDGET;
  assert.ok(manifest.lowContentBudgetBytes===undefined||manifest.lowContentBudgetBytes===budget,'The declared Low budget must match its authored catalogue revision');
  return budget;
}
