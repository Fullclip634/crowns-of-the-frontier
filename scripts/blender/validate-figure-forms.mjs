import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import * as THREE from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {MeshoptDecoder} from 'three/addons/libs/meshopt_decoder.module.js';
import {bindWorkerToolJoints} from '../../src/worker-tool-rig.js';
import {animatePart} from '../../src/world-polish.js';

const humans=['archer','king','knight','marksman','monk','outrider','scout','sentinel','spearman','swordsman','villager'];
const expectedKeys=[...humans.map(type=>'unit:'+type),...['build','food','mine','wood'].map(task=>'unit:villager:'+task)].sort();
const triangles=geometry=>(geometry.index?.count||geometry.attributes.position.count)/3;
const ray=new THREE.Raycaster(),down=new THREE.Vector3(0,0,-1);
function front(mesh,x,y){ray.set(new THREE.Vector3(x,y,1.2),down);return ray.intersectObject(mesh,false)[0]?.distance;}
function volume(geometry){const p=geometry.attributes.position,i=geometry.index,a=new THREE.Vector3(),b=new THREE.Vector3(),c=new THREE.Vector3();let total=0;for(let n=0;n<(i?.count||p.count);n+=3){a.fromBufferAttribute(p,i?i.getX(n):n);b.fromBufferAttribute(p,i?i.getX(n+1):n+1);c.fromBufferAttribute(p,i?i.getX(n+2):n+2);total+=a.dot(b.cross(c))/6;}return total;}

export async function validateFigureCatalogue(directory){
  const manifest=JSON.parse(fs.readFileSync(path.join(directory,'catalogue.json')));assert.equal(manifest.figureRevision,'field-forms-v1');
  const report={passed:false,models:[],files:[],workPoses:0,clothingClearances:0};
  for(const detail of ['low','balanced','near']){
    const bytes=fs.readFileSync(path.join(directory,`frontier-${detail}.glb`));assert.equal(bytes.length,manifest.sizes[detail]);
    report.files.push({detail,bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex')});
    const gltf=await new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'');gltf.scene.updateMatrixWorld(true);
    const roots=new Map(),geometries=new Set(),materials=new Set();gltf.scene.traverse(node=>{if(node.userData.assetKey)roots.set(node.userData.assetKey,node);if(node.isMesh){geometries.add(node.geometry);materials.add(node.material);}});
    try{
      assert.deepEqual([...roots.keys()].sort(),manifest.models.map(model=>model.key).sort());assert.equal(roots.size,126);
      const figures=[...roots].filter(([key])=>expectedKeys.includes(key));assert.deepEqual(figures.map(([key])=>key).sort(),expectedKeys);
      for(const [key,root]of figures){
        assert.equal(root.userData.model3d.figureRevision,'field-forms-v1',key);const parts=[];root.traverse(part=>{if(part.isMesh)parts.push(part);});
        let count=0;for(const part of parts){count+=triangles(part.geometry);if(!part.userData.figurePart)continue;
          for(const attribute of ['position','normal','uv','color']){const a=part.geometry.attributes[attribute];assert.ok(a,key+' '+attribute);for(let n=0;n<a.count;n++)for(let c=0;c<a.itemSize;c++)assert.ok(Number.isFinite(a.getComponent(n,c)),key+' finite '+attribute);}
          const normal=part.geometry.attributes.normal,v=new THREE.Vector3();for(let n=0;n<normal.count;n++){v.fromBufferAttribute(normal,n);assert.ok(v.lengthSq()>.94&&v.lengthSq()<1.06,key+' normalized exported normals');}
          assert.ok(volume(part.geometry)>0,key+' outward closed figure surface');
          assert.ok(part.userData.motion?.type,key+' retains articulation');
        }
        const bounds=new THREE.Box3().setFromObject(root),riding=['knight','scout','outrider'].includes(key.split(':')[1]);
        assert.ok(bounds.min.y>=-.005&&bounds.min.y<=(riding?.055:.025),key+' retains its ground contact');
        const offset=riding?.78:0,head=parts.find(part=>part.userData.figurePart?.startsWith('Head')),boots=parts.filter(part=>part.userData.figurePart?.startsWith('Boot'));
        const headBounds=new THREE.Box3().setFromObject(head),bootBounds=new THREE.Box3();for(const boot of boots)bootBounds.union(new THREE.Box3().setFromObject(boot));
        assert.ok(headBounds.max.y>2.4+offset&&headBounds.max.y<2.6+offset,key+' human head proportions');assert.ok(Math.abs(bootBounds.min.y-offset)<.002,key+' boots retain their floor or stirrup height');
        assert.ok(count<=(detail==='near'?5500:riding?2200:1800),key+' '+detail+' triangle budget: '+count);
        if(key.startsWith('unit:villager')){
          const apron=parts.find(part=>part.userData.figurePart?.startsWith('Apron')),shirt=parts.find(part=>part.userData.figurePart?.startsWith('Tunic')),seat=parts.find(part=>part.userData.figurePart?.startsWith('Trousers shaped seat'));
          assert.ok(apron&&shirt&&seat,key+' full clothing forms');
          for(const y of [1.2,1.4,1.65,1.85])for(const x of [-.13,0,.13]){const a=front(apron,x,y),s=front(shirt,x,y);assert.ok(Number.isFinite(a)&&Number.isFinite(s),key+' clothing ray');assert.ok(a+.002<s,`${key} ${detail}: apron clears shirt at ${x},${y}: ${a},${s}`);report.clothingClearances++;}
          for(const y of [1.12,1.2,1.28])for(const x of [-.12,0,.12]){const s=front(shirt,x,y),p=front(seat,x,y);assert.ok(Number.isFinite(s)&&Number.isFinite(p));assert.ok(s+.002<p,key+' tunic covers trousers without crossing');report.clothingClearances++;}
          assert.ok(parts.some(part=>part.userData.figurePart==='Unchanged apron straps and pouch patch'),key+' retains equipment straps');
        }
        report.models.push({detail,key,triangles:count,parts:parts.length,minY:bounds.min.y,maxY:bounds.max.y});
      }
      for(const task of ['wood','mine','build','food']){
        const model=roots.get('unit:villager:'+task).clone(true);assert.ok(bindWorkerToolJoints(model)>=2);let left,right,tool;
        model.traverse(part=>{const m=part.userData.motion;if(part.userData.assetMaterial==='skin'&&m?.type==='forearm'){if(m.side>0)right=part;else left=part;}if(m?.type==='workerTool')tool=part;});assert.ok(left&&right&&tool);
        const state={task,blend:1,phase:0},view={clock:0,unitActions:{get:()=>state}},entity={id:1,type:'villager',moving:false,cooldown:0},base=new THREE.Matrix4().makeRotationY(.73).setPosition(3,1,-8),grip=new THREE.Vector3(...tool.userData.motion.pivot);
        for(let n=0;n<=40;n++){state.phase=n/40;const hand=animatePart(view,right,entity,base).clone(),held=animatePart(view,tool,entity,base).clone();assert.ok(hand.elements.every(Number.isFinite)&&held.elements.every(Number.isFinite));assert.ok(grip.clone().applyMatrix4(hand).distanceTo(grip.clone().applyMatrix4(held))<1e-6,'the tool remains attached through '+task);report.workPoses++;
          if(task==='wood'){const supportGrip=new THREE.Box3().setFromObject(left).getCenter(new THREE.Vector3()),rightGrip=new THREE.Box3().setFromObject(right).getCenter(new THREE.Vector3()),support=rightGrip.applyMatrix4(hand).addScaledVector(new THREE.Vector3(0,1,0).transformDirection(held),-.15),actual=supportGrip.applyMatrix4(animatePart(view,left,entity,base));assert.ok(actual.distanceTo(support)<.01,'both chopping hands stay on the handle');}
        }
      }
    }finally{for(const item of [...geometries,...materials])item.dispose();}
  }
  report.passed=true;return report;
}

if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href){
  const directory=path.resolve(process.argv[2]||'.tools/art-candidate/figure-forms/full'),report=await validateFigureCatalogue(directory);
  fs.writeFileSync(path.join(directory,'figure-validation.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({passed:report.passed,models:report.models.length,workPoses:report.workPoses,clothingClearances:report.clothingClearances}));
}
