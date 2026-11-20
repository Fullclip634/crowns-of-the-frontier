import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as THREE from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {MeshoptDecoder} from 'three/addons/libs/meshopt_decoder.module.js';
import {registerSharedTrees,clearAuthoredAssets} from '../src/authored-assets.js';
import {registerBiomeArtwork,clearBiomeArtwork,biomeVolcanicTreeModel} from '../src/biome-art.js';
import {volcanicSnagModel,forestTransform} from '../src/realm-3d.js';
import {GroundCover} from '../src/ground-cover.js';
import {Landscape} from '../src/landscape.js';
import {createAtmosphereUniforms} from '../src/atmosphere-uniforms.js';
import {weatherAt} from '../src/weather.js';

const readGlb=name=>fs.readFileSync(new URL(`../src/assets3d/frontier-${name}.glb`,import.meta.url));
const decodeGlb=bytes=>new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'');

function measureObject(root){
  root.updateMatrixWorld(true);
  const size=new THREE.Box3().setFromObject(root).getSize(new THREE.Vector3());
  let tris=0;const materials=new Set();
  root.traverse(part=>{
    if(!part.isMesh)return;
    const index=part.geometry.index;
    tris+=(index?index.count:part.geometry.attributes.position.count)/3;
    if(part.userData.assetMaterial)materials.add(part.userData.assetMaterial);
  });
  return {width:Math.max(size.x,size.z),height:size.y,tris:Math.round(tris),materials};
}

test('Shared Blender trees retain biome silhouettes within their distant triangle budgets',async()=>{
  const nearBytes=readGlb('near'),balancedBytes=readGlb('balanced'),treesBytes=readGlb('trees');
  assert.ok(balancedBytes.byteLength<nearBytes.byteLength,'Balanced catalogue remains strictly smaller than High');
  assert.ok(treesBytes.byteLength<1_600_000,'Shared trees archive stays compact under 1.6 MB');
  const trees=registerSharedTrees(await decodeGlb(treesBytes));
  try{
    for(let v=0;v<4;v++){
      const meadowNear=measureObject(trees.templates.get('tree:highlands:'+v+':near'));
      const meadowFar=measureObject(trees.templates.get('tree:highlands:'+v+':far'));
      assert.ok(meadowFar.tris<900,'meadow conifers use the distant triangle budget');
      assert.ok(Math.abs(meadowFar.width/meadowNear.width-1)<.05,'distant conifers keep the crown width');
      assert.ok(Math.abs(meadowFar.height/meadowNear.height-1)<.03,'distant conifers keep the trunk and crown height');
      assert.deepEqual(meadowFar.materials,meadowNear.materials,'distant conifers retain bark and two leaf tones');

      const dNear=measureObject(trees.templates.get(`tree:desert:${v}:near`));
      const dFar=measureObject(trees.templates.get(`tree:desert:${v}:far`));
      assert.ok(dNear.tris<=2400,`desert:${v}:near should stay <= 2400 tris (got ${dNear.tris})`);
      assert.ok(dFar.tris>=600&&dFar.tris<=1100,`desert:${v}:far should stay in 600..1100 tris (got ${dFar.tris})`);
      assert.ok(dNear.width>=dNear.height*.72,`desert:${v} reads as a wide umbrella acacia`);

      const wNear=measureObject(trees.templates.get(`tree:winter:${v}:near`));
      const wFar=measureObject(trees.templates.get(`tree:winter:${v}:far`));
      assert.ok(wNear.tris<=2400,`winter:${v}:near should stay <= 2400 tris (got ${wNear.tris})`);
      assert.ok(wFar.tris>=600&&wFar.tris<=1200,`winter:${v}:far should stay in 600..1200 tris (got ${wFar.tris})`);
      assert.ok(wNear.height>=wNear.width*1.05,`winter:${v} keeps an upright alpine spruce silhouette`);
      assert.ok(wNear.materials.has('snow'),`winter:${v} carries drooping snow-laden boughs`);
    }
  }finally{clearAuthoredAssets();}
});

test('Phase 3 volcanic dead snags stay lean, leafless and carry subtle root ember clefts',()=>{
  const materials={
    trunk:new THREE.MeshStandardMaterial({color:0x282220}),
    wood:new THREE.MeshStandardMaterial({color:0x4a3828}),
    leaf:new THREE.MeshStandardMaterial({color:0x446633}),
    glow:new THREE.MeshStandardMaterial({color:0xff7a2a,emissive:0xff5511}),
  };
  for(let v=0;v<4;v++){
    const near=volcanicSnagModel({materials},v,false),far=volcanicSnagModel({materials},v,true);
    let nearTris=0,farTris=0,hasLeaf=false,hasGlow=false;
    near.traverse(p=>{if(!p.isMesh)return;nearTris+=(p.geometry.index?p.geometry.index.count:p.geometry.attributes.position.count)/3;if(p.material===materials.leaf)hasLeaf=true;if(p.material===materials.glow)hasGlow=true;});
    far.traverse(p=>{if(!p.isMesh)return;farTris+=(p.geometry.index?p.geometry.index.count:p.geometry.attributes.position.count)/3;});
    assert.ok(nearTris>=120&&nearTris<=380,`volcanic snag near tris ${nearTris} stays crisp and ultra-lean`);
    assert.ok(farTris>=60&&farTris<nearTris,`volcanic snag far tris ${farTris} is lighter than near`);
    assert.equal(hasLeaf,false,'volcanic snags carry no lush leaves');
    assert.equal(hasGlow,true,'near volcanic snags include subtle smoldering ember clefts');
  }
  for(const m of Object.values(materials))m.dispose();
});

test('Phase 3 curved ribbon grass uses skyward bent normals, synchronized wind and biome accent scatter',()=>{
  const landscape=new Landscape(512,'riverland',180,[{x:-30,z:30}],[]);
  const atmo=createAtmosphereUniforms();
  atmo.wind.value.set(1.2,0,-1.2);
  const camera=new THREE.PerspectiveCamera(45,16/9,1,300);
  camera.position.set(0,48,46);camera.lookAt(0,0,0);camera.updateMatrixWorld(true);camera.updateProjectionMatrix();
  const view={
    sim:{options:{seed:512,map:'riverland'},worldSize:180,entities:[],isExplored:()=>true},
    landscape,camera,target:new THREE.Vector3(0,0,0),zoom:52,clock:2.4,
    settings:{quality:'high',fog:false,reducedMotion:false},
    weatherState:weatherAt(512,'riverland',97,'clear'),
    atmosphereUniforms:atmo,
    battleFog:{mask:{value:new THREE.DataTexture(new Uint8Array(4),1,1)},scale:{value:1/180},enabled:{value:0},tint:{value:new THREE.Color(0x0c131d)}},
    renderer:{isWebGPURenderer:false},
    terrain:new THREE.Group(),
  };
  const cover=new GroundCover(view);
  cover.update(false);
  const pos=cover.mesh.geometry.attributes.position,nrm=cover.mesh.geometry.attributes.normal,idx=cover.mesh.geometry.index;
  const tris=(idx?idx.count:pos.count)/3;
  assert.ok(tris<=60,`High ribbon tuft stays <= 60 tris (got ${tris})`);
  let avgNy=0;
  for(let i=0;i<nrm.count;i++)avgNy+=nrm.getY(i);
  avgNy/=nrm.count;
  assert.ok(avgNy>=0.70,`Bent skyward normals keep average normal.y >= 0.70 (got ${avgNy.toFixed(3)})`);
  assert.ok(Math.abs(cover.wind.dir.value.x-.707)<.01&&Math.abs(cover.wind.dir.value.y+.707)<.01,'Grass wind direction syncs with shared atmosphere wind');
  assert.ok(cover.accents&&cover.accents.count>0,'High quality scatters biome wildflowers/shrubs');
  view.settings.quality='low';
  cover.update(false);
  assert.equal(cover.accents.count,0,'Low quality hides optional biome accent scatter');
  cover.dispose();
});

test('Phase 3 forestTransform responds to shared atmosphere wind without skewing matrix determinant',()=>{
  const base=new THREE.Matrix4().makeTranslation(12,3,8);
  const atmo=createAtmosphereUniforms();
  atmo.wind.value.set(.8,.6,1.8,0);
  const view={clock:1.1,settings:{quality:'high',reducedMotion:false},weatherState:weatherAt(512,'highlands',97,'storm'),atmosphereUniforms:atmo};
  const pose=forestTransform(view,base,9,true).clone();
  assert.ok(Math.abs(pose.determinant()-1)<1e-4,'Forest sway remains a pure orthogonal rotation');
  assert.deepEqual(new THREE.Vector3().setFromMatrixPosition(pose).toArray(),[12,3,8]);
  assert.notDeepEqual(pose.elements,base.elements);
  view.settings.reduceFoliage=true;
  assert.deepEqual(forestTransform(view,base,9,true).elements,base.elements);
  assert.notDeepEqual(forestTransform(view,base,9,true,{at:0}).elements,base.elements,'harvested trees still fall');
});

test('Phase 3 forest-floor shadow stain uses transparent radial alpha map and never opaque white cards',()=>{
  const src=fs.readFileSync(new URL('../src/realm-3d.js',import.meta.url),'utf8');
  assert.match(src,/standardMaterial\(\{\s*map:view\.forestShadowMap/s,'forestShadow passes options directly as first arg to standardMaterial');
  assert.match(src,/transparent:true,opacity:shadowOpacity[\s\S]*depthWrite:false/,'forestShadow disables depthWrite and stays transparent');
});

test('Phase 3 Blender frontier-biome-art.glb ships all 8 sculpted volcanic dead trees with lean budgets',async()=>{
  const bytes=fs.readFileSync(new URL('../src/assets3d/frontier-biome-art.glb',import.meta.url));
  const gltf=await decodeGlb(bytes);
  registerBiomeArtwork(gltf.scene);
  const materials={trunk:new THREE.MeshStandardMaterial(),wood:new THREE.MeshStandardMaterial(),glow:new THREE.MeshStandardMaterial()};
  try{
    for(let v=0;v<4;v++){
      const near=biomeVolcanicTreeModel({materials},v,false),far=biomeVolcanicTreeModel({materials},v,true);
      assert.ok(near&&far,`Blender volcanic tree variant ${v} near/far loads`);
      const mNear=measureObject(near),mFar=measureObject(far);
      assert.ok(mNear.tris>=180&&mNear.tris<=900,`Blender volcanic:${v}:near tris ${mNear.tris} stays lean`);
      assert.ok(mFar.tris>=80&&mFar.tris<mNear.tris,`Blender volcanic:${v}:far tris ${mFar.tris} is lighter than near`);
      assert.ok(mNear.materials.has('glow'),`Blender volcanic:${v}:near includes ember cleft`);
    }
  }finally{
    clearBiomeArtwork();
    for(const m of Object.values(materials))m.dispose();
  }
});
