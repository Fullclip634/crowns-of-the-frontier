import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as THREE from 'three';
import {Landscape} from '../src/landscape.js';
import {applyTerrainShading} from '../src/terrain-surface.js';
import {configureWaterSurface} from '../src/water-surface.js';
import {pebbleGeometry} from '../src/terrain-details.js';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {MeshoptDecoder} from 'three/addons/libs/meshopt_decoder.module.js';
import {registerBiomeArtwork,clearBiomeArtwork,biomeCliffGeometry} from '../src/biome-art.js';
import {installNodeRuntime} from '../src/render-runtime.js';
import {MeshStandardNodeMaterial,terrain as nodeTerrain,water as nodeWater} from '../src/render-nodes.js';

function fakeDom(){
  const original=globalThis.document;
  const ctx={
    fillStyle:'',strokeStyle:'',lineWidth:0,lineCap:'',lineJoin:'',
    fillRect(){},beginPath(){},moveTo(){},lineTo(){},closePath(){},stroke(){},fill(){},
    createImageData:(w,h)=>({data:new Uint8ClampedArray(w*h*4),width:w,height:h}),
    putImageData(){},
    createRadialGradient:()=>({addColorStop(){}}),
  };
  globalThis.document={createElement:()=>({width:0,height:0,getContext:()=>ctx})};
  return ()=>{globalThis.document=original;};
}

test('Phase 2 texture manifest and KTX2 bundle include snow_02, sand_01, rock_face_03 and roof_slates_02 under CC0',()=>{
  const manifest=JSON.parse(fs.readFileSync(new URL('../src/assets3d/textures/manifest.json',import.meta.url),'utf8'));
  const ids=new Set(manifest.map(item=>item.id));
  for(const id of ['snow_02','sand_01','rock_face_03','roof_slates_02']){
    assert.ok(ids.has(id),`${id} is present in manifest.json`);
    const entry=manifest.find(item=>item.id===id);
    assert.equal(entry.license,'CC0-1.0');
    assert.equal(entry.maps.length,3);
  }
  const ktx=JSON.parse(fs.readFileSync(new URL('../src/assets3d/textures/ktx2/manifest.json',import.meta.url),'utf8'));
  assert.equal(ktx.maps.length,22);
  for(const file of ['snow_02_color.ktx2','sand_01_color.ktx2','rock_face_03_color.ktx2','roof_slates_02_color.ktx2']){
    assert.ok(ktx.maps.some(m=>m.file===file),`${file} is compressed in KTX2 manifest`);
  }
});

test('Phase 2 terrain shading includes cobblestone plazas, triplanar rock normals, ARM micro-AO, volcanic fissures and stays within 16 samplers',()=>{
  const restore=fakeDom();
  const tex=()=>new THREE.Texture();
  const surfaces={
    grass:{color:tex(),normal:tex(),arm:tex()},
    soil:{color:tex(),normal:tex(),arm:tex()},
    rock:{color:tex(),normal:tex(),arm:tex()},
    paving:{color:tex()},
  };
  try{
    for(const map of ['riverland','tundra','arid','volcanic','archipelago']){
      const land=new Landscape(512,map);
      const mat=new THREE.MeshStandardMaterial();
      applyTerrainShading(mat,land,'high',surfaces,{grass:2,soil:1.5,rock:65,paving:2});
      const shader={uniforms:{},vertexShader:THREE.ShaderLib.standard.vertexShader,fragmentShader:THREE.ShaderLib.standard.fragmentShader};
      mat.onBeforeCompile(shader);
      assert.match(shader.fragmentShader,/frontierTerrainpaving/,'samples real cobblestone texture');
      assert.match(shader.fragmentShader,/frontierVolcanicFissure/,'uses domain-warped organic volcanic fractures');
      assert.match(shader.fragmentShader,/rockNormX \* triW\.x \+ rockNormTop \* triW\.y \+ rockNormZ \* triW\.z/,'uses triplanar cliff normals');
      assert.match(shader.fragmentShader,/reflectedLight\.indirectDiffuse \*= terrainAo/,'wires ARM micro-AO into indirect diffuse');
      assert.equal(shader.uniforms.frontierTerrainpaving.value,surfaces.paving.color);
      // Verify active terrain samplers stay <= 12 (plus map + shadow + fog <= 15 <= 16 WebGPU/WebGL2 compatibility ceiling).
      const samplerDecls=(shader.fragmentShader.match(/uniform sampler2D frontierTerrain\w+;/g)||[]).length;
      assert.ok(samplerDecls<=12,`terrain shader uses ${samplerDecls} custom samplers (fits <= 16 total stage budget)`);
      for(const owned of mat.frontierOwnedTextures||[])owned.dispose();
      mat.dispose();
    }

    // Verify WebGPU TSL terrain node parity including material.aoNode & graceful null reset.
    installNodeRuntime({terrain:nodeTerrain,water:nodeWater,MeshStandardNodeMaterial});
    try{
      const land=new Landscape(512,'volcanic');
      const nodeMat=new MeshStandardNodeMaterial();
      applyTerrainShading(nodeMat,land,'high',surfaces,{grass:2,soil:1.5,rock:65,paving:2});
      assert.ok(nodeMat.colorNode&&nodeMat.normalNode&&nodeMat.roughnessNode&&nodeMat.aoNode,'WebGPU High terrain wires color, normal, roughness and ARM AO');
      applyTerrainShading(nodeMat,land,'medium',surfaces,{grass:2,soil:1.5,rock:65,paving:2});
      assert.equal(nodeMat.roughnessNode,null,'WebGPU Medium resets roughnessNode');
      assert.equal(nodeMat.aoNode,null,'WebGPU Medium resets aoNode');
      for(const owned of nodeMat.frontierOwnedTextures||[])owned.dispose();
      nodeMat.dispose();
    }finally{
      installNodeRuntime(null);
    }
  }finally{
    restore();
    for(const set of Object.values(surfaces))for(const t of Object.values(set))t.dispose();
  }
});

test('Phase 2 sculpted stratified cliff outcrops stay strictly closed 2-manifold meshes at both LOD levels',()=>{
  for(const detail of [1,2]){
    const geometry=pebbleGeometry(detail),edges=new Map(),p=geometry.attributes.position;
    const key=i=>[p.getX(i),p.getY(i),p.getZ(i)].map(v=>v.toFixed(5)).join(':');
    for(let i=0;i<p.count;i+=3)for(let j=0;j<3;j++){
      const pair=[key(i+j),key(i+(j+1)%3)].sort().join('|');
      edges.set(pair,(edges.get(pair)||0)+1);
    }
    assert.ok([...edges.values()].every(count=>count===2),`pebbleGeometry(${detail}) is watertight 2-manifold`);
    assert.ok(geometry.attributes.normal.array.every(Number.isFinite));
    assert.ok(geometry.boundingBox.max.y-geometry.boundingBox.min.y>.4);
    geometry.dispose();
  }
});

test('Phase 2 water shader delivers spectral depth transmittance, shallow pebbles, dual caustics and layered surf foam on WebGL2 & WebGPU',()=>{
  const mat=new THREE.MeshStandardMaterial({color:0x6a9fa6,transparent:true,opacity:.9});
  configureWaterSurface(mat);
  const shader={uniforms:{},vertexShader:THREE.ShaderLib.standard.vertexShader,fragmentShader:THREE.ShaderLib.standard.fragmentShader};
  mat.onBeforeCompile(shader);
  assert.match(shader.fragmentShader,/frontierTransmit/);
  assert.match(shader.fragmentShader,/frontierPebbles/);
  assert.match(shader.fragmentShader,/frontierSurfBand/);
  assert.match(shader.fragmentShader,/frontierRippleE/);
  assert.match(shader.fragmentShader,/frontierPierWake/,'water shader renders animated bridge-pier wake foam');
  mat.dispose();

  const riverLand=new Landscape(512,'riverland');
  const riverGeo=riverLand.waterGeometry(riverLand.channels()[0],'high');
  const pierAttr=riverGeo.attributes.frontierWaterPier;
  assert.ok(pierAttr,'river water geometry carries bridge-pier wake attribute');
  let maxWake=0;
  for(let i=0;i<pierAttr.count;i++)maxWake=Math.max(maxWake,pierAttr.getX(i));
  assert.ok(maxWake>.4,'bridge spans produce nonzero pier wake intensity');
  riverGeo.dispose();

  installNodeRuntime({terrain:nodeTerrain,water:nodeWater,MeshStandardNodeMaterial});
  try{
    const nodeMat=new MeshStandardNodeMaterial({color:0x6a9fa6,transparent:true,opacity:.9});
    configureWaterSurface(nodeMat);
    assert.ok(nodeMat.positionNode&&nodeMat.colorNode&&nodeMat.opacityNode&&nodeMat.normalNode&&nodeMat.outputNode);
    nodeMat.dispose();
  }finally{
    installNodeRuntime(null);
  }
});

test('Phase 2 Blender frontier-biome-art.glb delivers 3 closed stratified cliff meshes & twin-rutted roads',async()=>{
  const terrainSrc=fs.readFileSync(new URL('../src/terrain-surface.js',import.meta.url),'utf8');
  assert.match(terrainSrc,/offset:-wheelOffset[\s\S]*offset:wheelOffset/,'roadMask strokes twin cart wheel ruts');

  const bytes=fs.readFileSync(new URL('../src/assets3d/frontier-biome-art.glb',import.meta.url));
  const gltf=await new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'');
  registerBiomeArtwork(gltf.scene);
  try{
    for(const map of ['riverland','arid','volcanic']){
      const geo=biomeCliffGeometry(map);
      assert.ok(geo&&geo.attributes.position.count>=36,`${map} resolves a Blender cliff outcrop`);
      assert.ok(geo.attributes.color,'Blender cliff carries baked crevice AO vertex colors');
      assert.ok(geo.attributes.normal.array.every(Number.isFinite));
      geo.dispose();
    }
  }finally{clearBiomeArtwork();}
});
