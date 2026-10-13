import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import * as THREE from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {MeshoptDecoder} from 'three/addons/libs/meshopt_decoder.module.js';
import {artBuildPlan} from './build-plan.mjs';

const project=fileURLToPath(new URL('../../',import.meta.url)),args=process.argv.slice(2);
const plan=artBuildPlan(project,['--stage',...args]);
const manifest=JSON.parse(await fs.readFile(path.join(plan.outputDirectory,'catalogue.json'),'utf8'));
const live=JSON.parse(await fs.readFile(path.join(project,'src/assets3d/catalogue.json'),'utf8'));
const expected=live.models.filter(model=>!plan.resources||model.key.startsWith('resource:')).map(model=>model.key).sort();
assert.equal(manifest.stage,plan.stage);assert.equal(manifest.completeCatalogue,!plan.resources);
assert.deepEqual(manifest.models.map(model=>model.key).sort(),expected);
const reports=[];
for(const detail of ['near','low']){
  const bytes=await fs.readFile(path.join(plan.outputDirectory,`frontier-${detail}.glb`));
  const gltf=await new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'');
  const roots=new Map(),geometries=new Set();gltf.scene.traverse(node=>{if(node.userData.assetKey)roots.set(node.userData.assetKey,node);if(node.isMesh)geometries.add(node.geometry);});
  assert.deepEqual([...roots.keys()].sort(),expected);assert.equal(bytes.length,manifest.sizes[detail]);
  for(const [key,root]of roots){
    if(!/^resource:(food|gold|stone):/.test(key))continue;
    assert.equal(root.userData.model3d.resourceRevision,'field-resources-v1');
    const size=new THREE.Box3().setFromObject(root).getSize(new THREE.Vector3());
    assert.ok(size.x>1&&size.x<5&&size.y>.5&&size.y<3&&size.z>1&&size.z<5,key+' keeps a playable resource footprint');
    const roles=new Set();let leafVolume=0,triangles=0;
    root.updateMatrixWorld(true);
    root.traverse(part=>{
      if(!part.isMesh)return;roles.add(part.userData.assetMaterial);const g=part.geometry,p=g.attributes.position,index=g.index;
      for(const attribute of ['position','normal','uv','color']){const data=g.attributes[attribute];assert.ok(data,key+' has '+attribute);for(let i=0;i<data.count;i++)for(let c=0;c<data.itemSize;c++)assert.ok(Number.isFinite(data.getComponent(i,c)));}
      const count=index?.count??p.count;triangles+=count/3;
      if(part.userData.foliageDetail==='closed shrub leaflets'){
        const a=new THREE.Vector3(),b=new THREE.Vector3(),c=new THREE.Vector3();let volume=0;
        for(let i=0;i<count;i+=3){a.fromBufferAttribute(p,index?index.getX(i):i).applyMatrix4(part.matrixWorld);b.fromBufferAttribute(p,index?index.getX(i+1):i+1).applyMatrix4(part.matrixWorld);c.fromBufferAttribute(p,index?index.getX(i+2):i+2).applyMatrix4(part.matrixWorld);volume+=a.dot(b.cross(c))/6;}
        assert.ok(volume>0,key+' has outward closed leaf surfaces');leafVolume+=volume;
      }
      if(detail==='low')assert.ok(!part.userData.nearOnly,'Low omits near-only detail');
    });
    if(key.includes(':food:')){assert.ok(roles.has('trunk')&&roles.has('fruit')&&leafVolume>.0001);assert.ok(triangles<5500,'bush detail is bounded');}
    if(key.includes(':gold:'))assert.ok(roles.has('gold'),'gold seams survive export');
    reports.push({detail,key,size:size.toArray(),triangles,leafVolume});
  }
  for(const geometry of geometries)geometry.dispose();
}
await fs.writeFile(path.join(plan.outputDirectory,'validation.json'),JSON.stringify({passed:true,completeCatalogue:manifest.completeCatalogue,models:expected.length,reports},null,2));
console.log(JSON.stringify({passed:true,stage:plan.stage,models:expected.length,resources:reports.length}));
