import assert from 'node:assert/strict';
import {readGlb, writeGlb} from './glb-catalogue.mjs';
import {modelFingerprint} from './model-patch.mjs';
import {composeQualityCatalogue} from './quality-catalogue.mjs';

export const mountedFormRevision = 'shaped-horses-and-bridles-v1';
const mountedKeys = ['unit:knight', 'unit:outrider', 'unit:scout'];
const coatRoles = ['horse', 'mane', 'hair'];
const replacementRoles = [...coatRoles, 'leather'].sort();
const assetRoot = (json, key) => json.nodes.find(node => node.extras?.assetKey === key);
const isMountedForm = node => node.mesh !== undefined && !node.extras?.motion &&
  (node.extras?.mountedForm === true || coatRoles.includes(node.extras?.assetMaterial));

function retainedModel(bytes, key) {
  const {json, bin} = readGlb(bytes);
  const root = assetRoot(json, key);
  root.children = root.children.filter(index => !isMountedForm(json.nodes[index]));
  delete root.extras.model3d.mountedFormRevision;
  return modelFingerprint(writeGlb(json, bin), key);
}

export function replaceMountedForms(base, patch) {
  const original = readGlb(base);
  const replacement = readGlb(patch);
  const keys = original.json.nodes.filter(node => node.extras?.assetKey).map(node => node.extras.assetKey);
  const patchKeys = replacement.json.nodes.filter(node => node.extras?.assetKey).map(node => node.extras.assetKey);
  assert.deepEqual(patchKeys.sort(), mountedKeys);

  for (const key of mountedKeys) {
    const previous = assetRoot(original.json, key);
    const authored = assetRoot(replacement.json, key);
    assert.ok(previous, 'Mounted model ' + key);
    for (const property of ['matrix', 'translation', 'rotation', 'scale']) {
      assert.deepEqual(previous[property], authored[property], key + ' root transform');
    }
    const previousParts = previous.children.map(index => original.json.nodes[index]).filter(isMountedForm);
    assert.ok(coatRoles.every(role => previousParts.some(node => node.extras.assetMaterial === role)), key + ' released mount');
    const newParts = authored.children.map(index => replacement.json.nodes[index]);
    assert.deepEqual(newParts.map(node => node.extras?.assetMaterial).sort(), replacementRoles, key + ' authored surfaces');
    assert.ok(newParts.every(node => isMountedForm(node) && node.extras.mountedForm === true));
    previous.children = previous.children.filter(index => !isMountedForm(original.json.nodes[index]));
    authored.extras.assetKey = 'mounted-form:' + key;
  }

  const {json, bin} = readGlb(composeQualityCatalogue([
    {bytes: writeGlb(original.json, original.bin), keys},
    {bytes: writeGlb(replacement.json, replacement.bin), keys: mountedKeys.map(key => 'mounted-form:' + key)},
  ]));
  const temporaryRoots = new Set();
  for (const key of mountedKeys) {
    const root = assetRoot(json, key);
    const authored = assetRoot(json, 'mounted-form:' + key);
    root.extras.model3d.mountedFormRevision = mountedFormRevision;
    root.children.push(...authored.children);
    temporaryRoots.add(json.nodes.indexOf(authored));
    delete authored.extras.assetKey;
    authored.children = [];
  }
  json.scenes[0].nodes = json.scenes[0].nodes.filter(index => !temporaryRoots.has(index));

  const bytes = writeGlb(json, bin);
  for (const key of keys) {
    const fingerprint = mountedKeys.includes(key) ? retainedModel : modelFingerprint;
    assert.equal(fingerprint(bytes, key), fingerprint(base, key), 'Retained geometry and metadata for ' + key);
  }
  return {bytes, mounts: mountedKeys.length, unchangedModels: keys.length - mountedKeys.length};
}
