import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import * as THREE from 'three';
import {Simulation} from '../src/simulation.js';
import {battlePreset} from '../src/custom-battle.js';
import {shipClearance,navalPairClearance} from '../src/naval-spacing.js';
import {applySurfaceMaterials} from '../src/surface-assets.js';
import {installNodeRuntime} from '../src/render-runtime.js';
import * as renderNodes from '../src/render-nodes.js';

const advance=(sim,seconds)=>{for(let i=0;i<seconds*10;i++)sim.tick(.1);};

test('harbors spawn trained ships into distinct clear water berths instead of stacking',()=>{
  const sim=new Simulation({mode:'tides',seed:512});
  sim.tickAI=()=>{};
  sim.players[0].age=3;
  sim.players[0].resources={food:5000,wood:5000,gold:5000,stone:5000};
  const dock=sim.owned(0,'building','dock')[0];
  for(let i=0;i<4;i++)assert.ok(sim.train(dock.id,'warship'));
  advance(sim,200);
  const warships=sim.owned(0,'unit','warship');
  assert.equal(warships.length,4);
  for(const ship of warships)assert.ok(sim.isWater(ship.x,ship.z),'every trained warship stays on water');
  for(let i=0;i<warships.length;i++)for(let j=i+1;j<warships.length;j++){
    const gap=Math.hypot(warships[i].x-warships[j].x,warships[i].z-warships[j].z);
    assert.ok(gap>=navalPairClearance(warships[i],warships[j])-.25,`warships keep hull clearance (got ${gap.toFixed(2)}m)`);
  }
});

test('stacked idle or firing ships separate smoothly without leaving navigable water',()=>{
  const sim=new Simulation({mode:'sandbox',map:'coast',seed:512});
  sim.tickAI=()=>{};
  const ships=Array.from({length:5},()=>sim.addUnit('warship',0,0,0));
  for(const ship of ships)ship.stance='hold';
  advance(sim,5);
  for(const ship of ships)assert.ok(sim.isWater(ship.x,ship.z),'de-crowding keeps every ship strictly on water');
  for(let i=0;i<ships.length;i++)for(let j=i+1;j<ships.length;j++){
    const gap=Math.hypot(ships[i].x-ships[j].x,ships[i].z-ships[j].z);
    assert.ok(gap>=navalPairClearance(ships[i],ships[j])-.3,`stacked warships separate cleanly (got ${gap.toFixed(2)}m)`);
  }
});

test('fleet move orders near a coastline and rallied harbor ships keep clean hull spacing',()=>{
  const sim=new Simulation({mode:'sandbox',map:'coast',seed:512});
  sim.tickAI=()=>{};
  sim.players[0].age=3;
  sim.players[0].resources={food:5000,wood:5000,gold:5000,stone:5000};
  const fleet=Array.from({length:6},(_,i)=>sim.addUnit('warship',0,0,-20+i*4));
  // Click close to the western shoreline: all 6 warships must receive distinct water berths.
  sim.command(fleet.map(s=>s.id),{type:'move',x:-12,z:0});
  for(let i=0;i<fleet.length;i++)for(let j=i+1;j<fleet.length;j++){
    const a=fleet[i].order,b=fleet[j].order;
    const gap=Math.hypot(a.x-b.x,a.z-b.z);
    assert.ok(gap>=navalPairClearance(fleet[i],fleet[j])-.2,`formation slots stay clear (${gap.toFixed(2)}m)`);
    assert.ok(sim.isWater(a.x,a.z)&&sim.isWater(b.x,b.z),'every formation slot stays on water');
  }

  // Ships individually sent to the same occupied water coordinate park cleanly without oscillating.
  const a=sim.addUnit('galley',0,2,30),b=sim.addUnit('galley',0,2,42);
  sim.command([b.id],{type:'move',x:2,z:30});
  advance(sim,8);
  assert.equal(b.order,null,'arriving ship settles cleanly beside an already-parked ally');
  assert.ok(Math.hypot(a.x-b.x,a.z-b.z)>=navalPairClearance(a,b)-.35);
});

test('ships in narrow river channels separate along the waterway without clipping onto dry banks',()=>{
  const sim=new Simulation({mode:'custom',map:'rivers',seed:512,slots:battlePreset('1v1')});
  sim.tickAI=()=>{};
  const boats=[sim.addUnit('fishingboat',0,-19,20),sim.addUnit('fishingboat',0,-19,20),sim.addUnit('fishingboat',0,-19,20)];
  advance(sim,4);
  for(const boat of boats)assert.ok(sim.isWater(boat.x,boat.z),'narrow-river boats stay strictly in water');
  for(let i=0;i<boats.length;i++)for(let j=i+1;j<boats.length;j++){
    assert.ok(Math.hypot(boats[i].x-boats[j].x,boats[i].z-boats[j].z)>=shipClearance('fishingboat')*2-.3);
  }
});

test('WebGPU structurePalette and coolAshlarStone match WebGL2 silver-grey stonework and compile cleanly to WGSL',async()=>{
  const src=await fs.readFile(new URL('../src/render-nodes.js',import.meta.url),'utf8');
  assert.match(src,/coolAshlar\s*=\s*mix\(stoneSample,vec3\(stoneLuma\.mul\(1\.22\),stoneLuma\.mul\(1\.23\),stoneLuma\.mul\(1\.26\)\)/,'WebGPU structurePalette applies WebGL2 coolAshlar silver stonework');

  const webgpu=await import('three/webgpu');
  const renderer=new renderNodes.WebGPURenderer({canvas:{width:1280,height:720,style:{},addEventListener(){},removeEventListener(){}}});
  renderer._initialized=true;
  renderer.backend.hasFeature=()=>true;
  renderer.backend.has=()=>true;
  renderer.backend.compatibilityMode=false;

  const stoneMat=new webgpu.MeshStandardNodeMaterial({color:0xe5e0d4});
  stoneMat.map=new THREE.DataTexture(new Uint8Array([148,128,102,255]),1,1);
  renderNodes.coolAshlarStone(stoneMat);
  const mesh=new THREE.Mesh(new THREE.BoxGeometry(1,1,1),stoneMat);
  const builder=new webgpu.WGSLNodeBuilder(mesh,renderer);
  builder.camera=new THREE.PerspectiveCamera();builder.scene=new THREE.Scene();
  builder.build();
  assert.match(builder.fragmentShader,/1\.22|1\.26/,'coolAshlarStone compiles cool silver ashlar transform into WGSL');
  stoneMat.map.dispose();stoneMat.dispose();mesh.geometry.dispose();

  // Also compile structurePalette itself through WGSLNodeBuilder to prove Castle/Wall/Gate WGSL builds cleanly.
  const structMat=new webgpu.MeshStandardNodeMaterial({vertexColors:true,roughness:.9});
  const tex=new THREE.DataTexture(new Uint8Array([148,128,102,255]),1,1);
  const structU={wood:{value:tex},stone:{value:tex},plaster:{value:tex},roof:{value:tex},woodNormal:{value:null},stoneNormal:{value:null},plasterNormal:{value:null},roofNormal:{value:null},woodArm:{value:null},stoneArm:{value:null},roofArm:{value:null},normalAvailable:{value:new THREE.Vector3()},armAvailable:{value:new THREE.Vector3()},roofPbr:{value:new THREE.Vector3()},detail:{value:0},night:{value:0},snow:{value:0}};
  renderNodes.structurePalette(structMat,structU);
  const sGeo=new THREE.BoxGeometry(1,1,1),nVerts=sGeo.attributes.position.count;
  sGeo.setAttribute('color',new THREE.BufferAttribute(new Float32Array(nVerts*3).fill(1),3));
  sGeo.setAttribute('structureSurface',new THREE.BufferAttribute(new Float32Array(nVerts*3).fill(2),3));
  sGeo.setAttribute('structureEmission',new THREE.BufferAttribute(new Float32Array(nVerts*3),3));
  sGeo.setAttribute('structureNightGlow',new THREE.BufferAttribute(new Float32Array(nVerts),1));
  const structMesh=new THREE.Mesh(sGeo,structMat);
  const sBuilder=new webgpu.WGSLNodeBuilder(structMesh,renderer);
  sBuilder.camera=new THREE.PerspectiveCamera();sBuilder.scene=new THREE.Scene();
  sBuilder.build();
  assert.match(sBuilder.fragmentShader,/1\.22|1\.26/,'WebGPU structurePalette compiles silver-grey coolAshlar into WGSL');
  tex.dispose();structMat.dispose();sGeo.dispose();

  // Verify WebGL2 applyCoolAshlarStone preserves m.stone.color and injects coolAshlar into map_fragment.
  installNodeRuntime(renderNodes);
  try{
    const glStone=new THREE.MeshStandardMaterial({color:0xe5e0d4});
    const glStoneDark=new THREE.MeshStandardMaterial({color:0x8c9288});
    const fakeView={
      settings:{quality:'low'},
      renderer:{capabilities:{getMaxAnisotropy:()=>4}},
      materials:{stone:glStone,stoneDark:glStoneDark,brick:new THREE.MeshStandardMaterial(),plaster:new THREE.MeshStandardMaterial(),wood:new THREE.MeshStandardMaterial(),darkwood:new THREE.MeshStandardMaterial(),timberEdge:new THREE.MeshStandardMaterial(),rock:new THREE.MeshStandardMaterial(),oreRock:new THREE.MeshStandardMaterial(),gold:new THREE.MeshStandardMaterial(),iron:new THREE.MeshStandardMaterial()},
    };
    applySurfaceMaterials(fakeView);
    assert.equal(glStone.userData.coolAshlarStone,true);
    assert.equal(glStoneDark.userData.coolAshlarStone,true);
    assert.equal(glStone.color.getHex(),0xe5e0d4,'m.stone base color stays intact for structurePalette baking');
    const shader={fragmentShader:THREE.ShaderLib.standard.fragmentShader,vertexShader:THREE.ShaderLib.standard.vertexShader,uniforms:{}};
    glStone.onBeforeCompile(shader);
    assert.match(shader.fragmentShader,/frontierStoneLuma/,'WebGL2 standalone stone material applies silver-grey coolAshlar');
    for(const m of Object.values(fakeView.materials))m.dispose();
  }finally{installNodeRuntime(null);}
});
