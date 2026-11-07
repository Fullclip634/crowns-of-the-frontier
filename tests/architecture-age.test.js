import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import * as THREE from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {MeshoptDecoder} from 'three/addons/libs/meshopt_decoder.module.js';
import {WorldView} from '../src/world.js';
import {BUILDINGS} from '../src/data.js';
import {buildingModel} from '../src/models-3d.js';
import {registerAuthoredAssets,clearAuthoredAssets} from '../src/authored-assets.js';
import {packBuildingModel} from '../src/structure-palette.js';
import {AGE_STYLED_BUILDINGS,isAgeStyled,architectureStyle,architectureAge,architectureOutdated,applyArchitectureAge} from '../src/architecture-age.js';

const node=(age,type='keep')=>({kind:'building',type,owner:0,r:BUILDINGS[type].r,x:0,z:0,
  userData:{model3d:{architectureAge:age}}});

test('landmark list covers civic, military and economic buildings but not the Town Center or walls',()=>{
  for(const type of ['house','keep','tower','barracks','wonder','monastery','market','workshop','stable','range','blacksmith','mill','camp','mine']){
    assert.ok(isAgeStyled(type),type+' is age styled');
    assert.ok(BUILDINGS[type],type+' exists in the building catalogue');
  }
  assert.equal(isAgeStyled('towncenter'),false,'Town Center keeps its four authored variants');
  assert.equal(isAgeStyled('wall'),false);
  assert.equal(isAgeStyled('gate'),false);
  assert.equal(new Set(AGE_STYLED_BUILDINGS).size,AGE_STYLED_BUILDINGS.length,'no duplicates');
});

test('architecture styles are monotonic, bounded and read as progressively heavier masonry',()=>{
  const styles=[0,1,2,3].map(architectureStyle);
  assert.equal(architectureStyle(-4),styles[0]);
  assert.equal(architectureStyle(99),styles[3]);
  for(let i=1;i<styles.length;i++){
    assert.ok(styles[i].height>styles[i-1].height);
    assert.ok(styles[i].width>styles[i-1].width);
    assert.ok(styles[i].ornaments>styles[i-1].ornaments);
    assert.ok(styles[i].tint[0]<styles[i-1].tint[0],'stone darkens with age');
  }
  assert.deepEqual([...styles.map(s=>s.label)].sort(),['castle','feudal','frontier','imperial']);
  for(const style of styles)for(const v of style.tint)assert.ok(v>.7&&v<=1,'tint stays subtle');
  assert.equal(styles[0].ornaments,0,'Dark Age adds no ornamentation');
});

test('visual age is per owner and clamped to the four canonical ages',()=>{
  const sim={players:[{age:2},{age:7}]};
  assert.equal(architectureAge(sim,{owner:0}),2);
  assert.equal(architectureAge(sim,{owner:1}),3);
  assert.equal(architectureAge(sim,{owner:5}),0);
  assert.equal(architectureAge(null,{owner:0}),0);
});

test('a node rebuilds exactly once when its owner advances an age',()=>{
  const sim={players:[{age:1},{age:3}]};
  const untagged={kind:'building',type:'keep',owner:0,userData:{model3d:{}}};
  assert.equal(architectureOutdated(sim,{...untagged,userData:{model3d:{}}},{userData:{model3d:{}}}),true,'untagged node rebuilds once');
  assert.equal(architectureOutdated(sim,untagged,node(1)),false,'tagged node is stable');
  assert.equal(architectureOutdated(sim,untagged,node(2)),true,'age advance rebuilds');
  assert.equal(architectureOutdated(sim,{...untagged,type:'towncenter'},node(1)),false);
  assert.equal(architectureOutdated(sim,{...untagged,type:'towncenter'},node(2)),true);
  assert.equal(architectureOutdated(sim,{...untagged,type:'farm'},node(2)),false,'unstyled buildings never rebuild for age');
  assert.equal(architectureOutdated(sim,{...untagged,type:'wall'},node(2)),false);
  assert.equal(architectureOutdated({players:[{age:3}]},{...untagged,type:'keep',owner:0},node(2)),true);
});

test('age detailing reuses shared geometry and one opaque material without new assets',()=>{
  const box=new THREE.BoxGeometry(1,1,1);
  box.setAttribute('color',new THREE.Float32BufferAttribute(new Float32Array(box.attributes.position.count*3).fill(1),3));
  const stoneDark=new THREE.MeshStandardMaterial({color:0x888888});
  const view={geo:{box},materials:{stoneDark}};
  const entity={kind:'building',type:'keep',owner:0,r:2.5};
  const root=new THREE.Group();root.userData.model3d={kind:'building',type:'keep',authored:true};
  const base=new THREE.Mesh(box,stoneDark);root.add(base);
  assert.equal(applyArchitectureAge(view,root,entity,0),root);
  assert.equal(root.scale.x,1,'Dark Age leaves the authored base untouched');
  assert.equal(root.userData.model3d.architectureAge,undefined);
  applyArchitectureAge(view,root,entity,3);
  const ornaments=[];root.traverse(part=>{if(part.userData.architectureDetail)ornaments.push(part);});
  assert.equal(ornaments.length,architectureStyle(3).ornaments);
  assert.equal(root.userData.model3d.architectureAge,3);
  assert.equal(root.userData.model3d.architectureLabel,'imperial');
  assert.equal(root.userData.model3d.authored,true,'authored metadata survives styling');
  assert.equal(root.scale.y,architectureStyle(3).height);
  assert.equal(new Set(ornaments.map(o=>o.geometry)).size,1,'one shared box geometry');
  assert.equal(new Set(ornaments.map(o=>o.material)).size,1,'one shared opaque material');
  for(const part of ornaments){
    assert.ok(part.position.y>0&&part.position.y<3,'ornaments sit on the upper wall, not above the roofline');
    assert.ok(Math.hypot(part.position.x,part.position.z)>=.5,'ornaments ring the outside of the footprint');
    assert.ok(part.geometry.attributes.color,'ornaments carry the neutral colour attribute');
  }
});

test('age detailing is placed from the model bounds, so small buildings are not buried',()=>{
  // A fixed 2.6-unit height and a collision-radius ring works for a castle and
  // disappears inside a house, whose walls are wider than its gameplay radius.
  const box=new THREE.BoxGeometry(1,1,1);
  box.setAttribute('color',new THREE.Float32BufferAttribute(new Float32Array(box.attributes.position.count*3).fill(1),3));
  const material=new THREE.MeshStandardMaterial();
  const build=(w,h,d,type)=>{
    const root=new THREE.Group(),mesh=new THREE.Mesh(box,material);mesh.scale.set(w,h,d);root.add(mesh);
    applyArchitectureAge({geo:{box},materials:{stoneDark:material}},root,{kind:'building',type,owner:0,r:BUILDINGS[type].r},3);
    const ornaments=[];root.traverse(part=>{if(part.userData.architectureDetail)ornaments.push(part);});
    return {root,ornaments,bounds:new THREE.Box3().setFromObject(root)};
  };
  const house=build(4,5.6,3.5,'house'),castle=build(9.6,14,9.6,'keep');
  const ring=model=>Math.hypot(model.ornaments[0].position.x,model.ornaments[0].position.z);
  assert.ok(ring(house)>2,'a 4-wide house keeps its detailing outside the walls');
  assert.ok(ring(castle)>ring(house),'a larger building gets a wider ring');
  assert.ok(house.ornaments[0].position.y<house.bounds.max.y,'house detailing stays below the roofline');
  assert.ok(castle.ornaments[0].scale.y>house.ornaments[0].scale.y,'larger buildings get proportionally larger detailing');
});

test('every age-styled building, houses included, packs to one surface and changes with age',async()=>{
  const assets=await catalogue();
  try{
    for(const type of AGE_STYLED_BUILDINGS){
      const packed=[];
      for(const age of [0,3]){
        const view=fixture(assets,age),entity={kind:'building',type,owner:0,r:BUILDINGS[type].r,x:0,z:0};
        const raw=buildingModel(view,entity);
        assert.equal(raw.userData.model3d.authored,true,`${type} uses its authored base`);
        assert.equal(raw.userData.model3d.architectureAge,age,`${type} tags its visual age`);
        const model=packBuildingModel(view,raw,entity),meshes=[];
        model.traverse(part=>{if(part.isMesh)meshes.push(part);});
        // Moving pivots (the mill rotor, gate portcullis) pack separately, so a
        // building owns one or two merged surfaces and never one per age.
        const surfaces=meshes.filter(part=>part.userData.structureSurface).length;
        assert.ok(surfaces>=1&&surfaces<=2,`${type} keeps a bounded number of merged surfaces`);
        assert.ok(meshes.length<=8,`${type} keeps its draw batches bounded`);
        const surface=meshes.find(part=>part.userData.structureSurface);
        packed.push({size:new THREE.Box3().setFromObject(model).getSize(new THREE.Vector3()),colors:Array.from(surface.geometry.attributes.color.array),scale:model.scale.y});
      }
      assert.ok(packed[1].size.y>packed[0].size.y,`${type} grows taller in the Imperial Age`);
      assert.ok(packed[1].scale>packed[0].scale,`${type} carries the age massing`);
      assert.notDeepEqual(packed[0].colors,packed[1].colors,`${type} changes its masonry tint with age`);
    }
  }finally{clearAuthoredAssets();}
});
async function catalogue(){
  const bytes=await fs.readFile(new URL('../src/assets3d/frontier-low.glb',import.meta.url));
  const gltf=await new GLTFLoader().setMeshoptDecoder(MeshoptDecoder)
    .parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'');
  return registerAuthoredAssets(gltf,'low',bytes.length);
}
function fixture(assets,age){
  const view=Object.create(WorldView.prototype);
  view.materials={};for(const template of assets.templates.values())template.traverse(part=>{
    if(part.isMesh&&part.userData.assetMaterial&&!['team','teamRoof'].includes(part.userData.assetMaterial))
      view.materials[part.userData.assetMaterial]??=part.material.clone();
  });
  view.materials.water??=new THREE.MeshStandardMaterial();
  view.teamMaterials=Array.from({length:8},(_,i)=>new THREE.MeshStandardMaterial({color:i?0x9a687d:0x397f8c}));
  view.roofMaterials=view.teamMaterials.map(mat=>mat.clone());
  view.geo={box:new THREE.BoxGeometry(1,1,1),sphere:new THREE.IcosahedronGeometry(1,0),cylinder:new THREE.CylinderGeometry(1,1,1,10),cone:new THREE.ConeGeometry(1,1,7)};
  view.sim={players:Array.from({length:8},()=>({faction:'alder',age})),options:{seed:512,map:'highlands'},isWater:()=>false};
  view.settings={quality:'low'};view.foundationHeights=new Map();
  view.materials.wood.map=new THREE.Texture();view.materials.stone.map=new THREE.Texture();
  for(const roof of view.roofMaterials)roof.map=new THREE.Texture();
  return view;
}

test('packed Blender landmark keeps one draw batch and gains a distinct age silhouette',async()=>{
  const assets=await catalogue();
  try{
    const packed=[];
    for(const age of [0,3]){
      const view=fixture(assets,age);
      const raw=buildingModel(view,{kind:'building',type:'keep',owner:0,r:BUILDINGS.keep.r,x:0,z:0});
      assert.equal(raw.userData.model3d.authored,true);
      assert.equal(raw.userData.model3d.architectureAge,age);
      const bounds=new THREE.Box3().setFromObject(raw);
      const model=packBuildingModel(view,raw,{kind:'building',type:'keep',owner:0,r:BUILDINGS.keep.r,x:0,z:0});
      const after=[];model.traverse(part=>{if(part.isMesh)after.push(part);});
      assert.ok(after.length<=6,'age-styled keep still packs to a small number of draws');
      assert.equal(after.filter(part=>part.userData.structureSurface).length,1,'one merged static surface');
      const changed=new THREE.Box3().setFromObject(model);
      assert.ok(bounds.min.distanceTo(changed.min)<.001&&bounds.max.distanceTo(changed.max)<.001,'packing preserves the footprint');
      const surface=after.find(part=>part.userData.structureSurface);
      const colors=surface.geometry.attributes.color;
      assert.ok(colors&&colors.count>0);
      assert.ok(Array.from(colors.array).every(Number.isFinite),'baked colours remain finite');
      packed.push({geometry:surface.geometry,colors:Array.from(colors.array),scale:model.scale.y,size:changed.getSize(new THREE.Vector3())});
    }
    assert.notEqual(packed[0].geometry,packed[1].geometry,'each age gets its own cached geometry');
    assert.ok(packed[1].scale>packed[0].scale,'Imperial keep is taller');
    assert.ok(packed[1].size.y>packed[0].size.y,'silhouette actually changes');
    assert.notDeepEqual(packed[0].colors,packed[1].colors,'masonry tint changes with age');
  }finally{clearAuthoredAssets();}
});
