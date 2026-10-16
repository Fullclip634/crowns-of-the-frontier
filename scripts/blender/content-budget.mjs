import assert from 'node:assert/strict';
export const SOLID_SIEGE_LOW_BUDGET=4.125*1024*1024;
export function lowCatalogueBudget(manifest){
  const budget=manifest.siegeRevision==='solid-timber-v1'?SOLID_SIEGE_LOW_BUDGET:4*1024*1024;
  assert.ok(manifest.lowContentBudgetBytes===undefined||manifest.lowContentBudgetBytes===budget,'The declared Low budget must match its authored catalogue revision');
  return budget;
}
