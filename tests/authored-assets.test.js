import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import * as THREE from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {MeshoptDecoder} from 'three/addons/libs/meshopt_decoder.module.js';
import {WorldView} from '../src/world.js';
import {BUILDINGS,UNITS} from '../src/data.js';
import {buildingModel,unitModel,treeModel,resourceModel} from '../src/models-3d.js';
import {registerAuthoredAssets,clearAuthoredAssets,workerVisualTask} from '../src/authored-assets.js';
import {animatePart} from '../src/world-polish.js';
import {UnitActions} from '../src/unit-actions.js';
import {mergeUnitModel} from '../src/unit-palette.js';
import {packBuildingModel} from '../src/structure-palette.js';

async function catalogue(detail){
  const bytes=await fs.readFile(new URL(`../src/assets3d/frontier-${detail==='high'?'near':'low'}.glb`,import.meta.url));
  const gltf=await new GLTFLoader().setMeshoptDecoder(MeshoptDecoder)
    .parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'');
  return registerAuthoredAssets(gltf,detail,bytes.length);
}
function fixture(catalogue,faction='alder',owner=0){
  const view=Object.create(WorldView.prototype);
  view.materials={};for(const template of catalogue.templates.values())template.traverse(part=>{
    if(part.isMesh&&part.userData.assetMaterial&&!['team','teamRoof'].includes(part.userData.assetMaterial))
      view.materials[part.userData.assetMaterial]??=part.material.clone();
  });
  view.materials.water??=new THREE.MeshStandardMaterial();
  view.teamMaterials=Array.from({length:8},(_,i)=>new THREE.MeshStandardMaterial({color:i?0x9a687d:0x397f8c}));
  view.roofMaterials=view.teamMaterials.map(mat=>mat.clone());
  view.geo={box:new THREE.BoxGeometry(1,1,1),sphere:new THREE.IcosahedronGeometry(1,0),cylinder:new THREE.CylinderGeometry(1,1,1,10),cone:new THREE.ConeGeometry(1,1,7)};
  view.sim={players:Array.from({length:8},()=>({faction,age:3})),options:{seed:512,map:'highlands'},isWater:(x,z)=>z>5};
  return view;
}
function triangles(catalogue){let count=0;for(const geometry of catalogue.geometries)count+=(geometry.index?.count??geometry.attributes.position.count)/3;return count;}
function solid(root){
  const size=new THREE.Box3().setFromObject(root).getSize(new THREE.Vector3());
  assert.ok(size.x>0&&size.y>0&&size.z>0);
  root.traverse(part=>{if(!part.isMesh)return;for(const attr of ['position','normal','uv','color'])assert.ok(part.geometry.attributes[attr]);assert.ok(part.geometry.attributes.position.array.every(Number.isFinite));});
}

test('building batching keeps solid bounds, team surfaces and moving pivots while sharing repeat geometry',async()=>{
  try{
    const assets=await catalogue('low');
    for(const faction of ['alder','sun','raven']){
      const view=fixture(assets,faction);view.settings={quality:'low'};view.foundationHeights=new Map();
      view.materials.wood.map=new THREE.Texture();view.materials.stone.map=new THREE.Texture();
      for(const roof of view.roofMaterials)roof.map=new THREE.Texture();
      for(const [type,data] of Object.entries(BUILDINGS)){
        const e={kind:'building',type,owner:0,r:data.r,x:0,z:0},raw=buildingModel(view,e);
        const bounds=new THREE.Box3().setFromObject(raw),before=[];raw.traverse(p=>{if(p.isMesh)before.push(p);});
        const packed=packBuildingModel(view,raw,e),after=[];packed.traverse(p=>{if(p.isMesh)after.push(p);});solid(packed);
        const changed=new THREE.Box3().setFromObject(packed);assert.ok(bounds.min.distanceTo(changed.min)<.001&&bounds.max.distanceTo(changed.max)<.001,type+' keeps its footprint');
        assert.ok(after.length<before.length,type+' reduces draw calls');
        assert.ok(after.length<=6,type+' remains a small number of draws');
        const staticMesh=after.find(p=>p.userData.structureSurface);
        assert.ok(staticMesh.geometry.index);assert.ok(staticMesh.geometry.attributes.structureEmission.array.every(Number.isFinite));
        if(type==='house'){
          const surfaces=staticMesh.geometry.attributes.structureSurface;
          assert.ok(Array.from({length:surfaces.count},(_,i)=>surfaces.getZ(i)).includes(4),'batched roofs retain their tile surface');
          assert.equal(staticMesh.material.frontierUniforms.roof.value,view.roofMaterials[0].map);
        }
        const again=view.makeBuilding(e),other=[];again.traverse(p=>{if(p.userData.structureSurface)other.push(p);});
        assert.equal(other[0].geometry,staticMesh.geometry,type+' shares geometry');
        assert.equal(view.mergeModel(packed),packed);
        if(type==='gate'){
          assert.ok(packed.userData.portcullis.children.some(p=>p.userData.structureSurface));
          const before=new THREE.Box3().setFromObject(packed.userData.portcullis);packed.userData.portcullis.position.y+=2.5;
          assert.ok(Math.abs(new THREE.Box3().setFromObject(packed.userData.portcullis).min.y-before.min.y-2.5)<.001);
        }
        if(type==='mill'){let rotor;packed.traverse(p=>{if(p.userData.windmill)rotor=p;});assert.ok(rotor.children.some(p=>p.userData.structureSurface));}
        let disposed=false;staticMesh.geometry.addEventListener('dispose',()=>disposed=true);view.releaseNode(packed);assert.equal(disposed,false);
      }
      const a=view.makeBuilding({kind:'building',type:'house',owner:0,x:0,z:0}),b=view.makeBuilding({kind:'building',type:'house',owner:1,x:0,z:0});
      let ga,gb;a.traverse(p=>{if(p.userData.structureSurface)ga=p.geometry;});b.traverse(p=>{if(p.userData.structureSurface)gb=p.geometry;});
      assert.notEqual(ga,gb);assert.notDeepEqual(ga.attributes.color.array,gb.attributes.color.array);
      // Construction clipping must preserve the same PBR shader callback.
      const building={progress:.4,r:2.3},node=a;view.renderer={};
      view.updateConstruction(building,node);for(const [mesh,original] of node.userData.construction.restore)assert.equal(mesh.material.onBeforeCompile,original.onBeforeCompile);
      building.progress=1;view.updateConstruction(building,node);assert.equal(node.userData.construction,undefined);
    }
  }finally{clearAuthoredAssets();}
});

test('Blender catalogues cover all civilizations, buildings, troops, resources and forest detail levels',async()=>{
  try{
    for(const detail of ['low','high']){
      const assets=await catalogue(detail);assert.equal(assets.templates.size,126);
      const manifest=JSON.parse(await fs.readFile(new URL('../src/assets3d/catalogue.json',import.meta.url),'utf8'));
      assert.deepEqual([...assets.templates.keys()].sort(),manifest.models.map(model=>model.key).sort());
      for(const faction of ['alder','sun','raven']){
        const view=fixture(assets,faction);
        for(const [type,data] of Object.entries(BUILDINGS)){
          const model=buildingModel(view,{kind:'building',type,owner:0,r:data.r,x:0,z:0});
          assert.equal(model.userData.model3d.authored,true,`${type} is loaded from Blender`);
          solid(model);view.mergeModel(model);solid(model);
        }
        for(const type of Object.keys(UNITS)){
          const model=unitModel(view,{kind:'unit',type,owner:0,id:51});
          assert.equal(model.userData.model3d.authored,true);solid(model);view.mergeModel(model);solid(model);
        }
      }
      const view=fixture(assets);
      for(const biome of ['highlands','winter','desert'])for(let variant=0;variant<4;variant++)for(const far of [false,true])solid(treeModel(view,biome,variant,far));
      for(const type of ['food','gold','stone']){
        const model=resourceModel(view,{kind:'resource',id:51,type});solid(model);
        if(type==='food')continue;
        const parts=[];model.traverse(part=>{if(part.isMesh)parts.push(part);});
        const natural=type==='gold'?view.materials.oreRock:view.materials.rock;
        assert.ok(parts.some(part=>part.material===natural),'deposits use natural rock rather than a masonry wall');
        assert.ok(parts.every(part=>![view.materials.stone,view.materials.stoneDark].includes(part.material)));
        if(type==='gold')assert.ok(parts.some(part=>part.material===view.materials.oreGold),'metallic inclusions remain separate solid parts');
      }
      solid(resourceModel(view,{kind:'resource',id:52,type:'food',water:true}));
      solid(resourceModel(view,{kind:'shrine',id:53}));
    }
  }finally{clearAuthoredAssets();}
});

test('workers switch solid tools with their current job and nested joints preserve a rigid pose',async()=>{
  try{
    const assets=await catalogue('low'),view=fixture(assets);view.unitActions=new UnitActions();
    const e={kind:'unit',id:51,type:'villager',owner:0,moving:false,carryType:'wood',hp:40,x:0,z:0,work:0};
    view.sim.get=id=>id===undefined?null:({type:{1:'gold',2:'stone',3:'farm',4:'food',5:'wood'}[id]||'house',kind:id===3||id===6?'building':'resource',hp:10,maxHp:100,progress:id===3?1:.2,amount:100,x:0,z:0,r:1});
    for(const [order,variant] of [[{type:'gather',target:1},'mine'],[{type:'gather',target:2},'mine'],[{type:'gather',target:3},'food'],[{type:'gather',target:4},'food'],[{type:'gather',target:5},'wood'],[{type:'build',target:6},'build'],[{type:'repair',target:6},'build']]){
      e.order=order;assert.equal(workerVisualTask(view,e),variant);
      const model=view.mergeModel(unitModel(view,e));solid(model);
      assert.equal(model.userData.model3d.figure,'adult');assert.equal(model.userData.model3d.variant,variant);
      let tool;model.traverse(part=>{if(part.userData.motion?.type==='workerTool')tool=part;});
      // Merged parts keep the complete wrist -> shoulder -> torso pose chain.
      const parts=[];model.traverse(part=>{if(part.userData.motion?.type==='forearm')parts.push(part);});
      assert.ok(parts.length);assert.ok(tool,'the tool has an independent wrist grip');assert.equal(tool.userData.motion.parent.type,'forearm');assert.equal(tool.userData.motion.parent.parent.type,'arm');assert.equal(tool.userData.motion.parent.parent.parent.type,'torso');
      view.clock=view.sim.time=e.work=.1;view.unitActions.update(view,e,1);const first=animatePart(view,tool,e,new THREE.Matrix4()).clone();view.clock=view.sim.time=e.work=.4;view.unitActions.update(view,e,1);
      const second=animatePart(view,tool,e,new THREE.Matrix4()).clone();
      assert.notDeepEqual(first.elements,second.elements);assert.ok(second.elements.every(Number.isFinite));assert.ok(Math.abs(second.determinant()-1)<.001);
    }
    assert.equal(workerVisualTask(view,{...e,type:'knight'}),'standard');
    for(const [activity,gatherType,expected] of [['gather','gold','mine'],['gather','food','food'],['build',null,'build'],['repair',null,'build']]){
      const observed={...e,order:undefined,activity,gatherType,carryType:null};assert.equal(workerVisualTask(view,observed),expected);
      const local={...observed,activity:undefined,order:{type:activity}},model=mergeUnitModel(view,unitModel(view,observed));let right;model.traverse(part=>{if(part.userData.motion?.type==='forearm'&&part.userData.motion.side>0)right=part;});assert.ok(right);
      assert.deepEqual(animatePart(view,right,observed,new THREE.Matrix4()).clone().elements,animatePart(view,right,local,new THREE.Matrix4()).clone().elements,'observed allied work uses the same solid tool and joint pose');
    }
  }finally{clearAuthoredAssets();}
});

test('ranged and melee combat pose the actual nested rigs without changing volume or producing invalid transforms',async()=>{
  try{
    const assets=await catalogue('low'),view=fixture(assets);view.clock=1;
    const poses={};
    for(const type of ['archer','marksman','spearman','swordsman']){
      const entity={kind:'unit',id:51,type,owner:0,moving:false,cooldown:UNITS[type].cooldown||1.2,order:{type:'attack',target:9}},model=mergeUnitModel(view,unitModel(view,entity));
      const parts=[];model.traverse(part=>{if(part.userData.motion?.type==='forearm')parts.push(part);});assert.ok(parts.length>=2);
      const frames=[];for(const ratio of [1,.7,.3,0]){entity.cooldown=(UNITS[type].cooldown||1.2)*ratio;for(const part of parts){const matrix=animatePart(view,part,entity,new THREE.Matrix4()).clone();assert.ok(matrix.elements.every(Number.isFinite));assert.ok(Math.abs(matrix.determinant()-1)<.001);frames.push(matrix.elements);}}
      assert.notDeepEqual(frames[0],frames[2],type+' has a release/recovery pose');
      entity.cooldown=Math.max(0,(UNITS[type].cooldown||1.2)-.5);poses[type]=parts.map(part=>animatePart(view,part,entity,new THREE.Matrix4()).clone().elements);
    }
    assert.notDeepEqual(poses.archer,poses.swordsman,'bows do not use a sword swing');
    assert.notDeepEqual(poses.archer,poses.marksman,'the slower firing interval is represented');
  }finally{clearAuthoredAssets();}
});

test('Blender joints, gates, windmills, shore orientation and team surfaces retain gameplay semantics',async()=>{
  try{
    const assets=await catalogue('low'),view=fixture(assets),e={kind:'unit',id:51,type:'knight',owner:7,moving:true,cooldown:0};
    const model=view.mergeModel(unitModel(view,e));let joint;
    model.traverse(part=>{if(part.userData.motion?.type==='knee')joint=part;});assert.ok(joint);
    view.clock=.1;const first=animatePart(view,joint,e,new THREE.Matrix4()).clone();view.clock=.4;
    assert.notDeepEqual(first.elements,animatePart(view,joint,e,new THREE.Matrix4()).elements);
    let team=false;unitModel(view,{...e,type:'villager'}).traverse(part=>{if(part.material===view.teamMaterials[7])team=true;});assert.ok(team);
    const gate=view.mergeModel(buildingModel(view,{kind:'building',type:'gate',owner:0,r:2.5,x:0,z:0}));assert.ok(gate.userData.portcullis?.children.some(part=>part.isMesh));
    const mill=view.mergeModel(buildingModel(view,{kind:'building',type:'mill',owner:0,r:2.5,x:0,z:0}));let rotor;mill.traverse(part=>{if(part.userData.windmill)rotor=part;});assert.ok(rotor?.children.some(part=>part.isMesh));
    const dock=buildingModel(view,{kind:'building',type:'dock',owner:0,r:3.6,x:0,z:0});let pier;dock.traverse(part=>{if(part.userData.dockPier)pier=part;});assert.ok(pier);assert.ok(Math.abs(pier.rotation.y)>0);
  }finally{clearAuthoredAssets();}
});

test('phone assets preserve the complete catalogue with smaller download and geometry budgets',async()=>{
  try{
    const high=await catalogue('high'),low=await catalogue('low');
    assert.deepEqual([...low.templates.keys()].sort(),[...high.templates.keys()].sort());
    assert.ok(low.bytes<high.bytes*.5);assert.ok(triangles(low)<triangles(high)*.6);
    // Solid timber siege engines add about 70 KiB to the previous 4 MiB roster.
    // Keep this bounded allowance and the original geometry ratio gate.
    assert.ok(low.bytes<4.125*1024*1024);
  }finally{clearAuthoredAssets();}
});

test('detailed broadleaf foliage has closed outward leaf tips and winter trees have separate boughs',async()=>{
  try{
    const high=await catalogue('high');
    for(const biome of ['highlands','desert'])for(let variant=0;variant<4;variant++){
      const root=high.templates.get(`tree:${biome}:${variant}:near`);let leaves=0;
      root.traverse(part=>{
        if(!part.isMesh||part.userData.foliageDetail!=='closed leaf tips')return;
        leaves++;const g=part.geometry,p=g.attributes.position,index=g.index;
        const a=new THREE.Vector3(),b=new THREE.Vector3(),c=new THREE.Vector3();let volume=0;
        for(let i=0;i<(index?.count??p.count);i+=3){
          a.fromBufferAttribute(p,index?index.getX(i):i);b.fromBufferAttribute(p,index?index.getX(i+1):i+1);c.fromBufferAttribute(p,index?index.getX(i+2):i+2);
          volume+=a.dot(b.cross(c))/6;
        }
        assert.ok(volume>.001,'leaf surfaces face outward around a positive closed volume');
      });
      assert.equal(leaves,2);solid(root);
    }
    for(const detail of ['high','low']){
      const assets=detail==='high'?high:await catalogue('low');
      const root=assets.templates.get('tree:winter:0:near');let boughs=0;
      root.traverse(part=>{if(part.isMesh&&part.name.includes('_Boughs'))boughs++;});assert.ok(boughs);solid(root);
      if(detail==='low')for(const root of assets.templates.values())root.traverse(part=>assert.notEqual(part.userData.foliageDetail,'closed leaf tips'));
    }
  }finally{clearAuthoredAssets();}
});

test('joint palette batching preserves team colors, metal, cloth and solid animated bounds',async()=>{
  try{
    const assets=await catalogue('low'),view=fixture(assets);
    for(const type of ['villager','knight','archer','galley']){
      const e={kind:'unit',id:54,type,owner:7,moving:true},raw=unitModel(view,e),before=new THREE.Box3().setFromObject(raw),old=view.mergeModel(unitModel(view,e)),packed=mergeUnitModel(view,raw);
      let prior=0,count=0,metal=false;const modes=new Set();old.traverse(part=>{if(part.isMesh)prior++;});
      packed.traverse(part=>{if(!part.isMesh)return;count++;if(part.material.transparent)return;const surface=part.geometry.attributes.unitSurface;assert.equal(surface.count,part.geometry.attributes.position.count);assert.ok(part.geometry.attributes.color.array.every(Number.isFinite));for(let i=0;i<surface.count;i++){if(surface.getY(i)>.3)metal=true;modes.add(surface.getZ(i));}});
      if(type==='villager')for(const mode of [2,3,4,5])assert.ok(modes.has(mode),'merged workers preserve every character surface role');
      solid(packed);const after=new THREE.Box3().setFromObject(packed);assert.ok(before.min.distanceTo(after.min)<.001);assert.ok(before.max.distanceTo(after.max)<.001);assert.ok(count<prior*.8,`${type} draws fewer surfaces`);
      if(type==='knight')assert.ok(metal);
      let moving;packed.traverse(part=>{if(part.userData.motion?.type==='arm')moving=part;});
      if(moving){view.clock=.1;const first=animatePart(view,moving,e,new THREE.Matrix4()).clone();view.clock=.4;assert.notDeepEqual(first.elements,animatePart(view,moving,e,new THREE.Matrix4()).elements);}
    }
  }finally{clearAuthoredAssets();}
});
