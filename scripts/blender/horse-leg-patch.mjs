import assert from 'node:assert/strict';
import {readGlb,writeGlb} from './glb-catalogue.mjs';
import {composeQualityCatalogue} from './quality-catalogue.mjs';
import {modelFingerprint} from './model-patch.mjs';

const limb=node=>node.mesh!==undefined&&['horseleg','horseknee','horsehoof'].includes(node.extras?.motion?.type);
function bodyFingerprint(bytes,key){const {json,bin}=readGlb(bytes),root=json.nodes.find(n=>n.extras?.assetKey===key);root.children=root.children.filter(id=>!limb(json.nodes[id]));delete root.extras.model3d.horseLegRevision;return modelFingerprint(writeGlb(json,bin),key);}

// Preserve every rider, saddle, horse body, surface and unrelated model from
// the released catalogue; import only the new closed-solid limb meshes.
export function replaceHorseLegs(base,patch,keys){
  const original=readGlb(base),replacement=readGlb(patch),all=original.json.nodes.filter(n=>n.extras?.assetKey).map(n=>n.extras.assetKey),other=all.filter(key=>!keys.includes(key));
  assert.equal(all.length,126);assert.equal(other.length,123);
  assert.deepEqual(replacement.json.nodes.filter(n=>n.extras?.assetKey).map(n=>n.extras.assetKey).sort(),keys.slice().sort());
  for(const key of keys){
    const a=original.json.nodes.find(n=>n.extras?.assetKey===key),b=replacement.json.nodes.find(n=>n.extras?.assetKey===key);
    for(const field of ['matrix','translation','rotation','scale'])assert.deepEqual(a[field],b[field],key+' root transform');
    assert.ok(a.children.filter(id=>limb(original.json.nodes[id])).length>=8,key+' original limbs');
    a.children=a.children.filter(id=>!limb(original.json.nodes[id]));
    assert.equal(b.children.length,12,key+' four upper legs, lower legs and hooves');
    assert.ok(b.children.every(id=>limb(replacement.json.nodes[id])&&replacement.json.nodes[id].extras.horseLegPart),'Only authored limbs may be exported');
    a.extras.assetKey='horse-body:'+key;b.extras.assetKey='horse-legs:'+key;
  }
  const combined=composeQualityCatalogue([{bytes:writeGlb(original.json,original.bin),keys:all.map(key=>keys.includes(key)?'horse-body:'+key:key)},{bytes:writeGlb(replacement.json,replacement.bin),keys:keys.map(key=>'horse-legs:'+key)}]),result=readGlb(combined);
  for(const key of keys){
    const body=result.json.nodes.find(n=>n.extras?.assetKey==='horse-body:'+key),legs=result.json.nodes.find(n=>n.extras?.assetKey==='horse-legs:'+key),id=result.json.nodes.indexOf(legs);
    body.extras.assetKey=key;body.extras.model3d.horseLegRevision='articulated-hooves-v1';body.children.push(...legs.children);
    result.json.scenes[0].nodes=result.json.scenes[0].nodes.filter(index=>index!==id);delete legs.extras.assetKey;legs.children=[];
  }
  const bytes=writeGlb(result.json,result.bin);assert.equal(result.json.nodes.filter(n=>n.extras?.assetKey).length,126);
  for(const key of other)assert.equal(modelFingerprint(bytes,key),modelFingerprint(base,key),'Unrelated model: '+key);
  for(const key of keys)assert.equal(bodyFingerprint(bytes,key),bodyFingerprint(base,key),'Released mounted body: '+key);
  return {bytes,unchangedModels:other.length,unchangedBodies:keys.length};
}
