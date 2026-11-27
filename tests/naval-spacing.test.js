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

test('WebGPU structurePalette and coolAshlarStone match WebGL2 brown-to-silver stone progression and vivid team roofs',async()=>{
  const src=await fs.readFile(new URL('../src/render-nodes.js',import.meta.url),'utf8');
  assert.match(src,/coolAshlar\s*=\s*mix\(stoneSample,vec3\(stoneLuma\.mul\(1\.28\),stoneLuma\.mul\(1\.30\),stoneLuma\.mul\(1\.34\)\)/,'WebGPU structurePalette matches WebGL2 silver ashlar stonework for Imperial & Fortified stone');
  assert.match(src,/warmBrownStone\s*=\s*stoneSample\.mul\(vec3\(1\.14,1,\.84\)\)/,'WebGPU structurePalette matches WebGL2 warm brown stonework for Castle Age & earlier stone');
  assert.match(src,/roofDetail\s*=\s*mix\(vec3\(roofLuma\.mul\(1\.95\)\.add\(\.28\)\),roofSample\.mul\(1\.46\),\.25\)/,'WebGPU structurePalette preserves vivid team roof color');

  const webgpu=await import('three/webgpu');
  const renderer=new renderNodes.WebGPURenderer({canvas:{width:1280,height:720,style:{},addEventListener(){},removeEventListener(){}}});
  renderer._initialized=true;
  renderer.backend.hasFeature=()=>true;
  renderer.backend.has=()=>true;
  renderer.backend.compatibilityMode=false;
  renderer.backend.device={limits:{maxUniformBufferBindingSize:65536,maxStorageBufferBindingSize:134217728}};

  // Compile coolAshlarStone on BOTH a plain Mesh (bridge) and an InstancedMesh with instanceColor (WallVisuals).
  const stoneMat=new webgpu.MeshStandardNodeMaterial({color:0xe5e0d4});
  stoneMat.map=new THREE.DataTexture(new Uint8Array([148,128,102,255]),1,1);
  renderNodes.coolAshlarStone(stoneMat);
  const mesh=new THREE.Mesh(new THREE.BoxGeometry(1,1,1),stoneMat);
  const builder=new webgpu.WGSLNodeBuilder(mesh,renderer);
  builder.camera=new THREE.PerspectiveCamera();builder.scene=new THREE.Scene();
  builder.build();
  assert.match(builder.fragmentShader,/1\.06|0\.84/,'plain stone mesh compiles warm brown stone into WGSL');
  const instMesh=new THREE.InstancedMesh(new THREE.BoxGeometry(1,1,1),stoneMat,2);
  instMesh.setColorAt(0,new THREE.Color(0xffffff));
  instMesh.setColorAt(1,new THREE.Color(0xa9b0bd));
  const instBuilder=new webgpu.WGSLNodeBuilder(instMesh,renderer);
  instBuilder.camera=new THREE.PerspectiveCamera();instBuilder.scene=new THREE.Scene();
  instBuilder.build();
  assert.match(instBuilder.fragmentShader,/1\.28|1\.34/,'instanced wall connectors compile brown-to-silver stone transition into WGSL');
  stoneMat.map.dispose();stoneMat.dispose();mesh.geometry.dispose();instMesh.geometry.dispose();instMesh.dispose();

  // Also compile structurePalette itself through WGSLNodeBuilder to prove Castle/Wall/Gate WGSL builds cleanly.
  const structMat=new webgpu.MeshStandardNodeMaterial({vertexColors:true,roughness:.9});
  const tex=new THREE.DataTexture(new Uint8Array([148,128,102,255]),1,1);
  const structU={wood:{value:tex},stone:{value:tex},plaster:{value:tex},roof:{value:tex},woodNormal:{value:null},stoneNormal:{value:null},plasterNormal:{value:null},roofNormal:{value:null},woodArm:{value:null},stoneArm:{value:null},roofArm:{value:null},normalAvailable:{value:new THREE.Vector3()},armAvailable:{value:new THREE.Vector3()},roofPbr:{value:new THREE.Vector3()},detail:{value:0},night:{value:0},snow:{value:0}};
  renderNodes.structurePalette(structMat,structU);
  const sGeo=new THREE.BoxGeometry(1,1,1),nVerts=sGeo.attributes.position.count;
  sGeo.setAttribute('color',new THREE.BufferAttribute(new Float32Array(nVerts*3).fill(1),3));
  sGeo.setAttribute('structureSurface',new THREE.BufferAttribute(new Float32Array(nVerts*3).fill(2),3));
  sGeo.setAttribute('structureEmission',new THREE.BufferAttribute(new Float32Array(nVerts*3),3));
  sGeo.setAttribute('structureNightGlow',new THREE.BufferAttribute(new Float32Array(nVerts).fill(-1),1));
  const structMesh=new THREE.Mesh(sGeo,structMat);
  const sBuilder=new webgpu.WGSLNodeBuilder(structMesh,renderer);
  sBuilder.camera=new THREE.PerspectiveCamera();sBuilder.scene=new THREE.Scene();
  sBuilder.build();
  assert.match(sBuilder.fragmentShader,/1\.28|1\.34/,'WebGPU structurePalette compiles brown-to-silver stonework into WGSL');
  tex.dispose();structMat.dispose();sGeo.dispose();

  // Verify WebGL2 applyCoolAshlarStone preserves m.stone.color and injects brown-to-silver logic into map_fragment.
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
    assert.match(shader.vertexShader,/varying float vFrontierSilver;/,'WebGL2 stone vertex shader declares silver varying');
    assert.match(shader.vertexShader,/#ifdef USE_INSTANCING_COLOR[\s\S]*vFrontierSilver\s*=\s*smoothstep\(0\.02,\s*0\.07,\s*instanceColor\.b\s*-\s*instanceColor\.r\);[\s\S]*#else[\s\S]*vFrontierSilver\s*=\s*0\.0;[\s\S]*#endif/,'WebGL2 computes fortified silver mask in vertex stage where Three.js defines USE_INSTANCING_COLOR');
    assert.match(shader.fragmentShader,/varying float vFrontierSilver;[\s\S]*frontierWarmStone[\s\S]*frontierSilverStone[\s\S]*mix\(frontierWarmStone,\s*frontierSilverStone,\s*vFrontierSilver\)/,'WebGL2 standalone stone fragment shader mixes warm-to-silver using vFrontierSilver');
    assert.doesNotMatch(shader.fragmentShader,/USE_INSTANCING_COLOR/,'WebGL2 fragment shader never guards on vertex-only USE_INSTANCING_COLOR');
    const darkShader={fragmentShader:THREE.ShaderLib.standard.fragmentShader,vertexShader:THREE.ShaderLib.standard.vertexShader,uniforms:{}};
    glStoneDark.onBeforeCompile(darkShader);
    assert.match(darkShader.vertexShader,/vFrontierSilver\s*=\s*smoothstep\(0\.02,\s*0\.07,\s*instanceColor\.b\s*-\s*instanceColor\.r\)/,'WebGL2 stoneDark foundation also receives fortified silver mask');
    assert.doesNotMatch(darkShader.fragmentShader,/USE_INSTANCING_COLOR/,'WebGL2 stoneDark fragment shader never guards on vertex-only USE_INSTANCING_COLOR');
    for(const m of Object.values(fakeView.materials))m.dispose();
  }finally{installNodeRuntime(null);}
});

test('Castle Age stone stays warm brown, Imperial & Fortified stone upgrades to silver, and team roofs stay vivid',async()=>{
  const {packBuildingModel}=await import('../src/structure-palette.js');
  const makeView=(age,roofHex)=>{
    const stone=new THREE.MeshStandardMaterial({color:0xe5e0d4});stone.map=new THREE.Texture();
    const stoneDark=new THREE.MeshStandardMaterial({color:0x8c9288});
    const wood=new THREE.MeshStandardMaterial({color:0x756046});wood.map=new THREE.Texture();
    const plaster=new THREE.MeshStandardMaterial({color:0xe6d5b4});plaster.map=new THREE.Texture();
    const glass=new THREE.MeshStandardMaterial({color:0x99aabb});
    const roof=new THREE.MeshStandardMaterial({color:roofHex});roof.map=new THREE.Texture();
    return {
      sim:{players:[{faction:'alder',age}],options:{map:'highlands'}},
      settings:{quality:'low'},
      geo:{box:new THREE.BoxGeometry(1,1,1)},
      materials:{stone,stoneDark,wood,darkwood:wood,timberEdge:wood,plaster,brick:stone,glass},
      teamMaterials:[new THREE.MeshStandardMaterial({color:roofHex})],
      roofMaterials:[roof],
    };
  };
  const buildPacked=(age,type,tier,roofHex)=>{
    const view=makeView(age,roofHex),root=new THREE.Group();
    root.userData.model3d={kind:'building',type,architectureAge:age,wallTier:tier};
    root.add(new THREE.Mesh(new THREE.BoxGeometry(2,2,2),view.materials.stone));
    root.add(new THREE.Mesh(new THREE.BoxGeometry(2,1,2),view.roofMaterials[0]));
    root.add(new THREE.Mesh(new THREE.BoxGeometry(.5,.5,.5),view.materials.glass));
    const packed=packBuildingModel(view,root,{id:1,kind:'building',type,owner:0});
    const surf=packed.children.find(c=>c.userData.structureSurface);
    return {view,geo:surf.geometry};
  };
  const avgAttr=(geo,mode,attrName)=>{
    const s=geo.attributes.structureSurface,a=geo.attributes[attrName];
    let n=0,sum=a.itemSize===1?0:[0,0,0];
    for(let i=0;i<s.count;i++){
      if(s.getZ(i)!==mode)continue;
      n++;
      if(a.itemSize===1)sum+=a.getX(i);
      else{sum[0]+=a.getX(i);sum[1]+=a.getY(i);sum[2]+=a.getZ(i);}
    }
    return a.itemSize===1?sum/n:sum.map(v=>v/n);
  };

  // Castle Age (2) stone stays brown (nightGlow = 0); Imperial Age (3) & Fortified Walls become silver (nightGlow = -1).
  const keepCastle=buildPacked(2,'keep','stone',0xe6c064);
  const keepImperial=buildPacked(3,'keep','stone',0xe6c064);
  const wallStone=buildPacked(2,'wall','stone',0xe6c064);
  const wallFortified=buildPacked(2,'wall','fortified',0xe6c064);
  assert.equal(avgAttr(keepCastle.geo,2,'structureNightGlow'),0,'Castle Age keep uses warm brown stone');
  assert.equal(avgAttr(keepImperial.geo,2,'structureNightGlow'),-1,'Imperial Age keep upgrades to silver ashlar stone');
  assert.equal(avgAttr(wallStone.geo,2,'structureNightGlow'),0,'Unfortified stone wall uses warm brown stone');
  assert.equal(avgAttr(wallFortified.geo,2,'structureNightGlow'),-1,'Fortified wall upgrades to silver ashlar stone');
  assert.equal(avgAttr(keepImperial.geo,0,'structureNightGlow'),1,'Glass windows keep positive night glow');

  // Yellow (0xe6c064) and Orange (0xe69b58) Castle Age roofs remain vividly team-colored and clearly distinct.
  const yellowRoof=avgAttr(keepCastle.geo,4,'color');
  const orangePacked=buildPacked(2,'keep','stone',0xe69b58);
  const orangeRoof=avgAttr(orangePacked.geo,4,'color');
  assert.ok(yellowRoof[0]>yellowRoof[2]*1.8&&yellowRoof[1]>yellowRoof[2]*1.5,'Yellow team roof stays unmistakably yellow in Castle Age');
  assert.ok(orangeRoof[0]>orangeRoof[1]*1.5&&orangeRoof[0]>orangeRoof[2]*2.2,'Orange team roof stays unmistakably orange in Castle Age');
  assert.ok(yellowRoof[1]-orangeRoof[1]>.10,'Yellow and Orange roofs are cleanly distinguishable in Castle Age');
});
