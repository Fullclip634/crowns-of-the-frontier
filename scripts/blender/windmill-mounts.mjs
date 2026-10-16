import assert from 'node:assert/strict';
import {readGlb,writeGlb} from './glb-catalogue.mjs';
import {composeQualityCatalogue} from './quality-catalogue.mjs';
import {modelFingerprint} from './model-patch.mjs';
export function composeWindmillMounts(baseBytes,patchBytes){
  const base=readGlb(baseBytes),keys=base.json.nodes.filter(n=>n.extras?.assetKey).map(n=>n.extras.assetKey);
  assert.equal(keys.length,126);
  const mounts=['alder','sun','raven'].map(faction=>'windmill-mount:'+faction);
  assert.deepEqual(readGlb(patchBytes).json.nodes.filter(n=>n.extras?.assetKey).map(n=>n.extras.assetKey).sort(),mounts.slice().sort());
  // Keep existing compressed roofs and blades byte-for-byte. Repeat authoring
  // replaces only the three mounts instead of accumulating duplicate meshes.
  const prune=node=>{if(node.children){node.children=node.children.filter(i=>!base.json.nodes[i].extras?.windmillMount);for(const i of node.children)prune(base.json.nodes[i]);}};
  for(const n of base.json.nodes.filter(n=>n.extras?.assetKey?.startsWith('building:mill:')))prune(n);
  const out=readGlb(composeQualityCatalogue([{bytes:writeGlb(base.json,base.bin),keys},{bytes:patchBytes,keys:mounts}]));
  for(const faction of ['alder','sun','raven']){
    const root=out.json.nodes.find(n=>n.extras?.assetKey===`building:mill:${faction}:0`),mount=out.json.nodes.find(n=>n.extras?.assetKey==='windmill-mount:'+faction);
    for(const field of ['matrix','translation','rotation','scale'])assert.deepEqual(mount[field],root[field],'Mount coordinate system');
    const rotors=[];const visit=n=>{if(n.extras?.windmill)rotors.push(n);for(const i of n.children||[])visit(out.json.nodes[i]);};visit(root);assert.equal(rotors.length,1);
    const rotor=rotors[0];assert.ok(!rotor.matrix&&rotor.translation&&Math.abs(rotor.translation[1]-5.7)<.001);rotor.translation[2]=2.65;
    root.children.push(...mount.children);root.extras.model3d.windmillRevision='axle-clearance-v1';
    out.json.scenes[0].nodes=out.json.scenes[0].nodes.filter(i=>out.json.nodes[i]!==mount);delete mount.extras.assetKey;
  }
  const bytes=writeGlb(out.json,out.bin);
  for(const key of keys.filter(key=>!key.startsWith('building:mill:')))assert.equal(modelFingerprint(bytes,key),modelFingerprint(baseBytes,key),'Unrelated model changed: '+key);
  return {bytes,unchangedModels:123,mills:3};
}
