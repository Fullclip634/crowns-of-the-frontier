import assert from 'node:assert/strict';
import {readGlb,writeGlb} from './glb-catalogue.mjs';
import {composeQualityCatalogue} from './quality-catalogue.mjs';
import {modelFingerprint} from './model-patch.mjs';

const selected=(node,selectors)=>node.mesh!==undefined&&selectors.some(s=>node.extras?.assetMaterial===s.role&&node.extras?.motion?.type===s.joint&&(node.extras.motion.side||0)===s.side);
function retainedFingerprint(bytes,key,selectors){
  const {json,bin}=readGlb(bytes),root=json.nodes.find(n=>n.extras?.assetKey===key);root.children=root.children.filter(id=>!selected(json.nodes[id],selectors));delete root.extras.model3d.figureRevision;
  return modelFingerprint(writeGlb(json,bin),key);
}

// Replace only the selected surface/joint parts, preserving compressed world
// geometry and every unchanged figure part, including tools and motion extras.
export function replaceFigureParts(base,patch,author){
  assert.equal(author.revision,'field-forms-v1');assert.equal(author.keys.length,15);
  const original=readGlb(base),replacement=readGlb(patch),all=original.json.nodes.filter(n=>n.extras?.assetKey).map(n=>n.extras.assetKey),other=all.filter(key=>!author.keys.includes(key));assert.equal(all.length,126);assert.equal(other.length,111);
  assert.deepEqual(replacement.json.nodes.filter(n=>n.extras?.assetKey).map(n=>n.extras.assetKey).sort(),author.keys.slice().sort());
  let removed=0,inserted=0;
  for(const key of author.keys){
    const a=original.json.nodes.find(n=>n.extras?.assetKey===key),b=replacement.json.nodes.find(n=>n.extras?.assetKey===key),selectors=author.selectors[key];assert.ok(a&&b&&selectors.length);
    for(const field of ['matrix','translation','rotation','scale'])assert.deepEqual(b[field],a[field],key+' root transform');
    for(const selector of selectors)assert.ok(a.children.some(id=>selected(original.json.nodes[id],[selector])),key+' selected source part');
    const kept=a.children.filter(id=>!selected(original.json.nodes[id],selectors));removed+=a.children.length-kept.length;a.children=kept;
    assert.ok(b.children.length&&b.children.every(id=>selected(replacement.json.nodes[id],selectors)&&replacement.json.nodes[id].extras.figurePart),'Only authored figure parts may be exported');inserted+=b.children.length;
    a.extras.assetKey='figure-body:'+key;b.extras.assetKey='figure-parts:'+key;
  }
  const combined=composeQualityCatalogue([{bytes:writeGlb(original.json,original.bin),keys:all.map(key=>author.keys.includes(key)?'figure-body:'+key:key)},{bytes:writeGlb(replacement.json,replacement.bin),keys:author.keys.map(key=>'figure-parts:'+key)}]),result=readGlb(combined);
  for(const key of author.keys){
    const body=result.json.nodes.find(n=>n.extras?.assetKey==='figure-body:'+key),parts=result.json.nodes.find(n=>n.extras?.assetKey==='figure-parts:'+key),id=result.json.nodes.indexOf(parts);
    body.extras.assetKey=key;body.extras.model3d.figureRevision=author.revision;body.children.push(...parts.children);result.json.scenes[0].nodes=result.json.scenes[0].nodes.filter(index=>index!==id);delete parts.extras.assetKey;parts.children=[];
  }
  const bytes=writeGlb(result.json,result.bin);assert.equal(result.json.nodes.filter(n=>n.extras?.assetKey).length,126);
  for(const key of other)assert.equal(modelFingerprint(bytes,key),modelFingerprint(base,key),'Unrelated model: '+key);
  for(const key of author.keys)assert.equal(retainedFingerprint(bytes,key,author.selectors[key]),retainedFingerprint(base,key,author.selectors[key]),'Unchanged figure parts: '+key);
  return {bytes,unchangedModels:other.length,changedFigures:author.keys.length,removedParts:removed,insertedParts:inserted};
}
