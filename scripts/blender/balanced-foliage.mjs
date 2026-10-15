import assert from 'node:assert/strict';
import {readGlb,writeGlb} from './glb-catalogue.mjs';
import {composeQualityCatalogue} from './quality-catalogue.mjs';

export const foliageKeys=Object.freeze(['highlands','desert'].flatMap(biome=>Array.from({length:4},(_,i)=>`tree:${biome}:${i}:near`)));

export function augmentBalancedTrees(low,foliage,near){
  const patch=readGlb(foliage),roots=patch.json.nodes.filter(n=>n.extras?.assetKey);
  assert.deepEqual(roots.map(n=>n.extras.assetKey).sort(),foliageKeys.slice().sort(),'Expected only the eight authored broadleaf patches');
  for(const root of roots){assert.ok(root.children?.length&&root.mesh===undefined);root.extras.assetKey+=':leaf-patch';}
  const all=readGlb(low).json.nodes.filter(n=>n.extras?.assetKey).map(n=>n.extras.assetKey);assert.equal(all.length,126);
  const detailed=readGlb(near);
  // Retain the full authored canopy instead of exposing coarse, simplified
  // lobes between the sparse tips. Distant and evergreen trees stay Low.
  const prune=node=>{if(!node.children)return;node.children=node.children.filter(index=>detailed.json.nodes[index].extras?.foliageDetail!=='closed leaf tips');for(const index of node.children)prune(detailed.json.nodes[index]);if(!node.children.length)delete node.children;};
  for(const root of detailed.json.nodes.filter(n=>foliageKeys.includes(n.extras?.assetKey)))prune(root);
  const composed=readGlb(composeQualityCatalogue([{bytes:low,keys:all.filter(key=>!foliageKeys.includes(key))},{bytes:writeGlb(detailed.json,detailed.bin),keys:foliageKeys},{bytes:writeGlb(patch.json,patch.bin),keys:foliageKeys.map(key=>key+':leaf-patch')}]));
  const byKey=new Map(composed.json.nodes.flatMap((n,i)=>n.extras?.assetKey?[[n.extras.assetKey,{node:n,index:i}]]:[]));
  const removed=new Set();
  for(const key of foliageKeys){const base=byKey.get(key).node,addition=byKey.get(key+':leaf-patch');for(const field of ['matrix','translation','rotation','scale'])assert.deepEqual(addition.node[field],base[field],'Leaf patch must preserve the authored tree root transform: '+key);
    base.children=[...(base.children||[]),...addition.node.children];base.extras.balancedFoliage='volumetric-tips-v1';delete addition.node.extras.assetKey;removed.add(addition.index);
  }
  composed.json.scenes[0].nodes=composed.json.scenes[0].nodes.filter(index=>!removed.has(index));
  return writeGlb(composed.json,composed.bin);
}

export function composeBalancedCatalogue({near,low,foliage,models}){
  const richer=models.filter(m=>/^(building|resource):/.test(m.key)).map(m=>m.key),lighter=models.filter(m=>!richer.includes(m.key)).map(m=>m.key);assert.equal(richer.length+lighter.length,126);
  const trees=augmentBalancedTrees(low,foliage,near);
  return {bytes:composeQualityCatalogue([{bytes:near,keys:richer},{bytes:trees,keys:lighter}]),richer: richer.length,lighter:lighter.length};
}
