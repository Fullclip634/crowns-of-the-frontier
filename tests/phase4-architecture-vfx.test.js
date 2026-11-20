import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as THREE from 'three';
import {packBuildingModel,bakeBuildingVertexAO} from '../src/structure-palette.js';
import {strengthenArchitecture} from '../src/architecture-age.js';
import {meleeMinClearance,buildingClearanceStep,meleeSurfaceDistance} from '../src/melee-contact.js';
import {Simulation} from '../src/simulation.js';
import {crossedPlumeGeometry,fireTongueTexture,smokePlumeTexture,craterScorchTexture,dustPuffTexture,FlightEffects,ImpactEffects} from '../src/battle-effects.js';

function borderAlphaMax(tex){
  const {data,width,height}=tex.image;
  let maxA=0;
  for(let x=0;x<width;x++){
    maxA=Math.max(maxA,data[x*4+3],data[((height-1)*width+x)*4+3]);
  }
  for(let y=0;y<height;y++){
    maxA=Math.max(maxA,data[(y*width)*4+3],data[(y*width+width-1)*4+3]);
  }
  return maxA;
}

test('Phase 4 structurePalette binds roof slate PBR maps within 16 samplers and smooths conical roofs',()=>{
  const map=new THREE.DataTexture(new Uint8Array(4),1,1);
  const view={
    settings:{quality:'high'},
    sim:{options:{map:'riverland'},players:[{faction:'alder',age:2}]},
    materials:{
      wood:new THREE.MeshStandardMaterial({map,normalMap:map,roughnessMap:map}),
      darkwood:new THREE.MeshStandardMaterial({map}),
      timberEdge:new THREE.MeshStandardMaterial({map}),
      stone:new THREE.MeshStandardMaterial({map,normalMap:map,roughnessMap:map}),
      stoneDark:new THREE.MeshStandardMaterial({map}),
      brick:new THREE.MeshStandardMaterial({map}),
      plaster:new THREE.MeshStandardMaterial({map,normalMap:map,roughnessMap:map}),
      glass:new THREE.MeshStandardMaterial(),
    },
    teamMaterials:[new THREE.MeshStandardMaterial({color:0x397f8c})],
    roofMaterials:[new THREE.MeshStandardMaterial({color:0x687982,map})],
    geo:{},
  };
  // Build an 8-sided flat-faceted cone roof (like a keep turret) and verify smoothing.
  const cone=new THREE.ConeGeometry(1.5,2.4,8,1,false).toNonIndexed();
  cone.computeVertexNormals();
  const root=new THREE.Group();
  const roofMesh=new THREE.Mesh(cone,view.roofMaterials[0]);
  roofMesh.name='part_40';
  root.add(roofMesh);
  root.userData.model3d={kind:'building',type:'tower',architectureAge:2};
  const packed=packBuildingModel(view,root,{id:1,kind:'building',type:'tower',owner:0,r:2.5});
  const mesh=packed.children.find(c=>c.isMesh);
  assert.ok(mesh.material.frontierUniforms.roofNormal,'structurePalette exposes roofNormal uniform');
  assert.ok(mesh.material.frontierUniforms.roofArm,'structurePalette exposes roofArm uniform');
  assert.ok(mesh.material.frontierUniforms.roofPbr,'structurePalette exposes roofPbr uniform');

  // Verify injected custom samplers stay strictly <= 12 (leaving headroom for shadowMap + envMap + normalMap <= 16).
  const shader={uniforms:{},vertexShader:THREE.ShaderLib.standard.vertexShader,fragmentShader:THREE.ShaderLib.standard.fragmentShader};
  mesh.material.onBeforeCompile(shader);
  const customSamplers=(shader.fragmentShader.match(/uniform\s+sampler2D\s+frontier\w+/g)||[]).length;
  assert.ok(customSamplers<=12,`structurePalette custom fragment samplers (${customSamplers}) must stay <= 12 (<= 16 total)`);
  assert.match(shader.fragmentShader,/frontierStructureroofNormal/,'samples real roof slate normal map');
  assert.match(shader.fragmentShader,/frontierStructureroofArm/,'samples real roof slate ARM roughness/AO');

  // Side vertices sharing the same cone seam position (excluding flat bottom cap) should have smooth normals.
  const pos=mesh.geometry.attributes.position,nrm=mesh.geometry.attributes.normal;
  let sharedSmoothPairs=0;
  for(let i=0;i<pos.count;i++){
    if(nrm.getY(i)<.1||pos.getY(i)>1.1)continue;
    for(let j=i+1;j<pos.count;j++){
      if(nrm.getY(j)<.1)continue;
      if(Math.hypot(pos.getX(i)-pos.getX(j),pos.getY(i)-pos.getY(j),pos.getZ(i)-pos.getZ(j))<.001){
        const dot=nrm.getX(i)*nrm.getX(j)+nrm.getY(i)*nrm.getY(j)+nrm.getZ(i)*nrm.getZ(j);
        if(dot>.99)sharedSmoothPairs++;
      }
    }
  }
  assert.ok(sharedSmoothPairs>=8,`conical turret roof seams smooth seamlessly around circumference (${sharedSmoothPairs})`);
  mesh.geometry.dispose();mesh.material.dispose();map.dispose();
});

test('Phase 4 volumetric fire, smoke, feathered scorch craters and cavalry dust textures fade cleanly to transparent edges',()=>{
  const textures=[
    ['fire',fireTongueTexture()],
    ['smoke',smokePlumeTexture()],
    ['crater',craterScorchTexture()],
    ['dust',dustPuffTexture()],
  ];
  for(const [label,tex] of textures){
    assert.ok(tex.isDataTexture,`${label} is a procedural DataTexture`);
    assert.ok(borderAlphaMax(tex)<=4,`${label} edges fade cleanly to transparent (max border alpha ${borderAlphaMax(tex)})`);
    let peakA=0;
    for(let i=3;i<tex.image.data.length;i+=4)peakA=Math.max(peakA,tex.image.data[i]);
    assert.ok(peakA>=150,`${label} has visible core opacity (${peakA})`);
    tex.dispose();
  }
  const plume=crossedPlumeGeometry(1.3,2.0,.7);
  assert.equal((plume.index?plume.index.count:plume.attributes.position.count)/3,6,'crossed 3-plane plume uses 6 triangles');
  assert.ok(plume.attributes.uv,'plume carries UVs');
  plume.dispose();

  const pool=new ImpactEffects();
  const crater=pool.acquire('crater'),dust=pool.acquire('dust');
  assert.ok(crater.material.map?.isDataTexture,'crater uses feathered scorch DataTexture');
  assert.equal(crater.material.polygonOffset,true,'crater prevents z-fighting via polygonOffset');
  assert.ok(dust.material.map?.isDataTexture,'dust uses soft dust puff DataTexture');
  pool.release(crater);pool.release(dust);pool.dispose();

  const flights=new FlightEffects();
  flights.geometry.arrow.computeBoundingBox();
  assert.ok(flights.geometry.arrow.boundingBox.min.z<-1.0,'arrow geometry includes wind-streak tracer tail');
  flights.dispose();
});

test('Phase 4 WebGPU render-nodes mirrors roof slate PBR and heraldic unit readability without main-chunk imports',()=>{
  const src=fs.readFileSync(new URL('../src/render-nodes.js',import.meta.url),'utf8');
  assert.match(src,/roofPbr/,'WebGPU structurePalette mirrors roof PBR maps');
  assert.match(src,/herald/,'WebGPU unitPalette mirrors crisp heraldic team readability');
  assert.doesNotMatch(src,/surface-assets\.js|atmosphere-uniforms\.js/,'render-nodes remains chunk-independent');
});

test('Phase 4 baked building Vertex AO darkens eaves and ground bases while lived-in props stay one draw',()=>{
  const map=new THREE.DataTexture(new Uint8Array(4),1,1);
  const makeView=(biome='riverland',age=2)=>({
    settings:{quality:'high'},
    sim:{options:{map:biome},players:[{faction:'alder',age}]},
    materials:{
      wood:new THREE.MeshStandardMaterial({color:0x9c7248,map}),
      darkwood:new THREE.MeshStandardMaterial({color:0x66492d,map}),
      timberEdge:new THREE.MeshStandardMaterial({color:0x745435,map}),
      stone:new THREE.MeshStandardMaterial({color:0xb8b2a6,map}),
      stoneDark:new THREE.MeshStandardMaterial({color:0x7e7a72,map}),
      brick:new THREE.MeshStandardMaterial({color:0x9a5846,map}),
      plaster:new THREE.MeshStandardMaterial({color:0xdfd0b0,map}),
      glass:new THREE.MeshStandardMaterial({color:0x334455}),
    },
    teamMaterials:[new THREE.MeshStandardMaterial({color:0x397f8c})],
    roofMaterials:[new THREE.MeshStandardMaterial({color:0x687982,map})],
    geo:{box:new THREE.BoxGeometry(1,1,1),cylinder:new THREE.CylinderGeometry(1,1,1,8),cone:new THREE.ConeGeometry(1,1,6)},
  });
  const makeHouse=(view,age)=>{
    const root=new THREE.Group();
    const wall=new THREE.Mesh(new THREE.BoxGeometry(3.2,2.4,3.2),view.materials.plaster);
    wall.position.y=1.2;wall.userData.assetMaterial='plaster';root.add(wall);
    const roof=new THREE.Mesh(new THREE.ConeGeometry(2.8,1.8,4),view.roofMaterials[0]);
    roof.position.y=3.3;roof.userData.assetMaterial='teamRoof';root.add(roof);
    root.userData.model3d={kind:'building',type:'house',architectureAge:age};
    const e={id:1,kind:'building',type:'house',owner:0,r:2.4};
    strengthenArchitecture(view,root,e,age);
    return packBuildingModel(view,root,e);
  };
  const dry=makeHouse(makeView('riverland',2),2);
  const winter=makeHouse(makeView('tundra',2),2);
  const dryMesh=dry.children.find(c=>c.userData.structureSurface);
  const winterMesh=winter.children.find(c=>c.userData.structureSurface);
  assert.ok(dryMesh&&winterMesh,'both pack to one static structureSurface');
  assert.ok(winterMesh.geometry.attributes.position.count>dryMesh.geometry.attributes.position.count,'winter biome adds roof-eave icicles');
  // Directly verify bakeBuildingVertexAO darkens under-eave & ground vertices relative to open mid-wall on neutral white geometry.
  const aoGeo=dryMesh.geometry.clone();
  const white=new Float32Array(aoGeo.attributes.position.count*3).fill(1);
  aoGeo.setAttribute('color',new THREE.BufferAttribute(white,3));
  bakeBuildingVertexAO(aoGeo);
  const aoCol=aoGeo.attributes.color,aoPos=aoGeo.attributes.position,aoSurf=aoGeo.attributes.structureSurface;
  let underEaveSum=0,underEaveN=0,ridgeSum=0,ridgeN=0,baseSum=0,baseN=0;
  for(let i=0;i<aoPos.count;i++){
    const lum=aoCol.getX(i);
    assert.ok(Number.isFinite(lum)&&lum>=.65&&lum<=1.05,'baked AO factor stays bounded and finite');
    if(aoSurf.getZ(i)<3.5&&aoPos.getY(i)>1.95&&aoPos.getY(i)<2.45){underEaveSum+=lum;underEaveN++;}
    if(aoSurf.getZ(i)<3.5&&aoPos.getY(i)<=.15){baseSum+=lum;baseN++;}
    if(aoSurf.getZ(i)>3.5&&aoPos.getY(i)>3.8){ridgeSum+=lum;ridgeN++;}
  }
  assert.ok(underEaveN>0&&ridgeN>0&&baseN>0,'samples under-eave walls, ground base, and roof ridge');
  assert.ok(underEaveSum/underEaveN<.92,'under-eave vertices receive roof overhang shadow AO');
  assert.ok(baseSum/baseN<.94,'ground plinth base receives contact AO');
  assert.ok(ridgeSum/ridgeN>underEaveSum/underEaveN,'sky-facing roof ridge stays brighter than under-eave shadow');
  aoGeo.dispose();map.dispose();
});

test('Phase 4 melee building-collision clearance blocks inward wall clipping without trapping escaping units',()=>{
  const sim=new Simulation({mode:'sandbox',map:'highlands',seed:512});
  sim.entities=[];sim.index=new Map();sim.grids={};sim.revision++;sim.visible.fill(1);
  const house=sim.addBuilding('house',1,0,0,true);
  const soldier=sim.addUnit('swordsman',0,0,-6);
  const minGap=meleeMinClearance(soldier);
  assert.ok(minGap>=.48,'minimum wall clearance keeps melee bodies outside masonry');
  // Attempting to push inward across clearance boundary is clamped back out.
  const fromZ=-house.r-minGap-.15;
  const pushedIn=buildingClearanceStep(sim,soldier,0,fromZ,0,-house.r-.05);
  assert.ok(meleeSurfaceDistance(pushedIn,house)>=minGap-1e-3,'inward crowd push cannot embed troop inside building wall');
  // A unit already inside moving outward is never trapped.
  const escaping=buildingClearanceStep(sim,soldier,0,-house.r+.3,0,-house.r-.05);
  assert.ok(escaping.z<-house.r,'escaping unit moves freely outward');
});
