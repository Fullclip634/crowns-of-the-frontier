import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {replaceCatalogueResources} from './glb-catalogue.mjs';
import {lowCatalogueBudget} from './content-budget.mjs';

const project=fileURLToPath(new URL('../../',import.meta.url)),folder=path.join(project,'.tools/art-candidate/full/optimized'),resources=path.join(project,'.tools/art-candidate/resources/optimized');
const validation=JSON.parse(await fs.readFile(path.join(resources,'validation.json'),'utf8'));assert.equal(validation.passed,true);assert.equal(validation.models,14);
const manifest=JSON.parse(await fs.readFile(path.join(project,'src/assets3d/catalogue.json'),'utf8')),sizes={},resourcePatchHashes={};await fs.mkdir(folder,{recursive:true});
for(const detail of ['near','low']){
  const base=await fs.readFile(path.join(project,`src/assets3d/frontier-${detail}.glb`)),patch=await fs.readFile(path.join(resources,`frontier-${detail}.glb`));
  const hash=createHash('sha256').update(patch).digest('hex');resourcePatchHashes[detail]=hash;
  const bytes=manifest.resourcePatchHashes?.[detail]===hash?base:replaceCatalogueResources(base,patch).bytes;
  await fs.writeFile(path.join(folder,`frontier-${detail}.glb`),bytes);sizes[detail]=bytes.length;
}
assert.ok(sizes.low<=lowCatalogueBudget(manifest),'The full phone catalogue stays within its declared content budget');
await fs.writeFile(path.join(folder,'catalogue.json'),JSON.stringify({...manifest,sizes,stage:'full',completeCatalogue:true,resourceRevision:'field-resources-v1',resourcePatchHashes,composition:'Existing compressed geometry preserved; twelve original Blender resource variants replaced.'},null,2)+'\n');
console.log(JSON.stringify({models:manifest.models.length,sizes,staged:true,resourceVariants:12}));
