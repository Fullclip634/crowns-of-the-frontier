import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import * as THREE from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {MeshoptDecoder} from 'three/addons/libs/meshopt_decoder.module.js';
import {Simulation} from '../src/simulation.js';
import {WorldView} from '../src/world.js';
import {BUILDINGS,UNITS} from '../src/data.js';
import {buildingModel} from '../src/models-3d.js';
import {registerAuthoredAssets,clearAuthoredAssets} from '../src/authored-assets.js';
import {
  registerEarlyAgeArtwork,clearEarlyAgeArtwork,earlyAgeArtworkState,
  earlyAgeBuildingKey,earlyAgeBuildingTemplate,
} from '../src/early-ages-art.js';
import {packBuildingModel} from '../src/structure-palette.js';
import {architectureOutdated} from '../src/architecture-age.js';
import {groundBuildingFoundation,groundGatePortcullis,updateGatePortcullis} from '../src/building-grounding.js';
import {Landscape} from '../src/landscape.js';
import {WallVisuals} from '../src/wall-visuals.js';
import {gateConversionPlan,gatePlacementPlan} from '../src/gate-conversion.js';
import {WALL_SPACING,wallConnections,isWallCorner} from '../src/walls.js';
import {clearSegment} from '../src/navigation.js';
import {wallTier,wallBuildCost,wallDisplayName,PALISADE_WALL_HP,PALISADE_GATE_HP} from '../src/fortified-walls.js';
import {installNodeRuntime} from '../src/render-runtime.js';
import * as nodeRuntimeModule from '../src/render-nodes.js';
import {dynamicEconomyWeights,rebalanceEconomy,manageFarming} from '../src/commander-ai.js';
import {adaptivePerimeterLayouts} from '../src/ai-wall-layout.js';
import {planFortification} from '../src/ai-fortifications.js';
import {battlePreset,normalizeBattle} from '../src/custom-battle.js';
import {BattleRemains} from '../src/battle-remains.js';
import {AudioEngine} from '../src/audio.js';
import {synthesizeWarHorn,ATTACK_ANNOUNCE_COOLDOWN} from '../src/voice-system.js';

async function loadGLB(relPath){
  const bytes=await fs.readFile(new URL(relPath,import.meta.url));
  const gltf=await new GLTFLoader().setMeshoptDecoder(MeshoptDecoder)
    .parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'');
  return {gltf,bytes};
}

function makeView(baseCatalogue,faction='alder',age=0,tech={}){
  const view=Object.create(WorldView.prototype);
  view.materials={};
  for(const template of baseCatalogue.templates.values())template.traverse(part=>{
    if(part.isMesh&&part.userData.assetMaterial&&!['team','teamRoof'].includes(part.userData.assetMaterial))
      view.materials[part.userData.assetMaterial]??=part.material.clone();
  });
  for(const extra of ['wood','darkwood','plaster','stone','stoneDark','brick','straw','canvas','soil','trunk','leaf','leafDark','snow','iron','steel','gold','glow','glass','grain','fruit','water']){
    view.materials[extra]??=new THREE.MeshStandardMaterial({color:0x998877});
  }
  view.materials.wood.map=new THREE.Texture();
  view.materials.stone.map=new THREE.Texture();
  view.materials.plaster.map=new THREE.Texture();
  view.teamMaterials=Array.from({length:8},(_,i)=>new THREE.MeshStandardMaterial({color:i?0x9a687d:0x397f8c}));
  view.roofMaterials=view.teamMaterials.map(mat=>{const m=mat.clone();m.map=new THREE.Texture();return m;});
  view.geo={box:new THREE.BoxGeometry(1,1,1),sphere:new THREE.IcosahedronGeometry(1,0),cylinder:new THREE.CylinderGeometry(1,1,1,10),cone:new THREE.ConeGeometry(1,1,7)};
  view.sim={players:Array.from({length:8},()=>({faction,age,tech:{...tech}})),options:{seed:512,map:'highlands'},isWater:(x,z)=>x>4};
  view.settings={quality:'high'};
  view.foundationHeights=new Map();
  return view;
}

test('frontier-early-ages.glb provides all 48 low-poly grounded models, zero brown wood in Frontier/Palisades, taller walls, and leaves Age 3 & Age 4 untouched',async()=>{
  const [{gltf:baseGltf,bytes:baseBytes},{gltf:earlyGltf,bytes:earlyBytes}]=await Promise.all([
    loadGLB('../src/assets3d/frontier-low.glb'),
    loadGLB('../src/assets3d/frontier-early-ages.glb'),
  ]);
  const baseAssets=registerAuthoredAssets(baseGltf,'low',baseBytes.length);
  registerEarlyAgeArtwork(earlyGltf.scene);
  try{
    assert.ok(earlyBytes.length<1_800_000,`early-age GLB stays lightweight for phones (${earlyBytes.length} bytes)`);
    assert.equal(earlyAgeArtworkState().models,48);

    // Harbor, Fishing Boat, and Transport unlock in Frontier Age (Age 0) while Galley unlocks in Feudal Age.
    assert.equal(BUILDINGS.dock.age,0,'Harbor (dock) is buildable in Frontier Age');
    assert.equal(UNITS.fishingboat.age,0,'Fishing boat is trainable in Frontier Age');
    assert.equal(UNITS.transport.age,0,'Transport ship is trainable in Frontier Age');
    assert.equal(UNITS.galley.age,1,'Galley unlocks in Feudal Age');

    // Age 3 (Castle) and Age 4 (Imperial) must NEVER resolve early-age overrides.
    for(const type of ['towncenter','house','barracks','mill','range','stable','blacksmith','market','tower','dock','keep','wall','gate']){
      for(const faction of ['alder','sun','raven']){
        assert.equal(earlyAgeBuildingKey(type,faction,2,'stone'),null,`Castle Age ${type} stays unchanged`);
        assert.equal(earlyAgeBuildingKey(type,faction,3,'stone'),null,`Imperial Age ${type} stays unchanged`);
        assert.equal(earlyAgeBuildingKey(type,faction,3,'fortified'),null,`Fortified ${type} stays unchanged`);
      }
    }

    // Verify ZERO brown wood ('wood' or 'darkwood') exists on ANY Frontier Age or Palisade model!
    for(const key of ['building:wall:palisade','building:gate:palisade','building:wallcorner:palisade','building:towncenter:frontier','building:house:frontier','building:barracks:frontier','building:mill:frontier','building:camp:frontier','building:mine:frontier','building:dock:frontier']){
      let root=null;
      earlyGltf.scene.traverse(n=>{if(n.userData?.assetKey===key)root=n;});
      assert.ok(root,`early-age GLB contains ${key}`);
      root.traverse(part=>{
        if(part.isMesh)assert.ok(!['wood','darkwood'].includes(part.userData.assetMaterial),`${key} uses weathered silver-driftwood instead of brown wood (${part.userData.assetMaterial})`);
      });
    }

    // Verify taller Palisade Wall (>= 3.10m) and Palisade Corner Bastion (>= 4.00m)!
    {
      const palView=makeView(baseAssets,'alder',0);
      const palWall=buildingModel(palView,{id:9901,kind:'building',type:'wall',owner:0,x:0,z:0,r:BUILDINGS.wall.r,progress:1});
      const palBox=new THREE.Box3().setFromObject(palWall);
      assert.ok(palBox.max.y>=3.10,`Palisade wall stands tall (${palBox.max.y.toFixed(2)}m >= 3.10m)`);
    }

    // Verify every single early-age building loads, has finite grounded geometry, and packs to 1 static draw call.
    const frontierTypes=['towncenter','house','barracks','mill','camp','mine','dock'];
    const feudalTypes=['towncenter','house','barracks','mill','camp','mine','range','stable','blacksmith','market','tower','dock'];

    for(const type of frontierTypes){
      const view=makeView(baseAssets,'alder',0);
      const entity={id:1,kind:'building',type,owner:0,x:0,z:0,r:BUILDINGS[type].r,progress:1};
      const raw=buildingModel(view,entity);
      assert.equal(raw.userData.model3d.authoredAgeVariant,true,`Age 1 ${type} uses dedicated Frontier model`);
      assert.equal(raw.userData.model3d.architectureAge,0);
      const rawBox=new THREE.Box3().setFromObject(raw);
      assert.ok(rawBox.min.y<=-0.42,`Age 1 ${type} is grounded below -0.42 (${rawBox.min.y.toFixed(2)})`);
      const packed=packBuildingModel(view,raw,entity);
      const staticSurfaces=packed.children.filter(c=>c.isMesh&&c.userData.structureSurface);
      assert.equal(staticSurfaces.length,1,`Age 1 ${type} packs to 1 static draw`);
      assert.ok(staticSurfaces[0].geometry.attributes.position.array.every(Number.isFinite));
      assert.ok(staticSurfaces[0].geometry.attributes.normal.array.every(Number.isFinite));
      assert.equal(architectureOutdated({players:[{age:1}]},entity,packed),true,`Age 1 ${type} upgrades automatically at Age 2`);
    }

    // Verify Age 2 Feudal regional models for all 3 civilizations are distinct from Age 1, Age 3, and each other!
    const houseProfiles={};
    for(const faction of ['alder','sun','raven']){
      for(const type of feudalTypes){
        const view=makeView(baseAssets,faction,1);
        const entity={id:2,kind:'building',type,owner:0,x:0,z:0,r:BUILDINGS[type].r,progress:1};
        const raw=buildingModel(view,entity);
        assert.equal(raw.userData.model3d.authoredAgeVariant,true,`Age 2 ${faction} ${type} uses Feudal regional model`);
        assert.equal(raw.userData.model3d.architectureAge,1);
        const roles=new Set();
        raw.traverse(p=>{if(p.isMesh&&p.userData.surfaceRole)roles.add(p.userData.surfaceRole);});
        const box=new THREE.Box3().setFromObject(raw);
        if(type==='dock'){
          assert.ok(box.min.y<=-1.95,`Feudal ${faction} dock pilings extend underwater (${box.min.y.toFixed(2)})`);
        }else{
          assert.ok(box.min.y<=-0.42,`Feudal ${faction} ${type} is grounded (${box.min.y.toFixed(2)})`);
        }
        const packed=packBuildingModel(view,raw,entity);
        assert.equal(packed.children.filter(c=>c.isMesh&&c.userData.structureSurface).length,1,`Age 2 ${faction} ${type} packs to 1 static draw`);
        assert.equal(architectureOutdated({players:[{age:2}]},entity,packed),true,`Age 2 ${faction} ${type} upgrades at Castle Age`);
        if(type==='house')houseProfiles[faction]={maxY:box.max.y,roles};
      }
    }

    // Distinct Feudal regional silhouettes & materials:
    // - Alder: half-timbered plaster + brick chimney
    // - Sunward: flat-roof desert adobe (shorter than pitched roofs, NO Castle domes!)
    // - Raven: horizontal log cabin (wood walls, NO plaster!) + steepest Nordic roof!
    assert.ok(houseProfiles.alder.roles.has('plaster')&&houseProfiles.alder.roles.has('darkwood'),'Alder Feudal uses half-timbered plaster');
    assert.ok(houseProfiles.sun.roles.has('plaster')&&houseProfiles.sun.roles.has('brick'),'Sunward Feudal uses warm golden sandstone and terracotta mudbrick');
    assert.ok(!houseProfiles.raven.roles.has('plaster')&&houseProfiles.raven.roles.has('wood'),'Raven Feudal uses log timber walls, not plaster');
    assert.ok(houseProfiles.raven.maxY>houseProfiles.alder.maxY,'Raven steep Nordic roof rises higher than Alder');
    assert.ok(houseProfiles.alder.maxY>houseProfiles.sun.maxY,'Sunward flat adobe roof stays flatter than pitched roofs');

    // Architectural height progression across Age 1 -> Age 2 -> Age 3 (Castle) -> Age 4 (Imperial)
    const tcHeights=[];
    for(const age of [0,1,2,3]){
      const view=makeView(baseAssets,'alder',age);
      const tc=buildingModel(view,{id:10+age,kind:'building',type:'towncenter',owner:0,x:0,z:0,r:BUILDINGS.towncenter.r,progress:1});
      tcHeights.push(new THREE.Box3().setFromObject(tc).max.y);
      if(age>=2)assert.equal(tc.userData.model3d.authoredAgeVariant,undefined,`Age ${age+1} TC keeps original Castle/Imperial art`);
    }
    assert.ok(tcHeights[0]<tcHeights[1],'Age 1 TC is humbler than Age 2 TC');
    assert.ok(tcHeights[1]<tcHeights[2],'Age 2 TC is humbler than Age 3 Castle TC');
  }finally{
    clearEarlyAgeArtwork();
    clearAuthoredAssets();
  }
});

test('Palisade walls & gates ground cleanly on hillsides, animate portcullis, spend/refund wood, and upgrade to Stone at Castle Age',async()=>{
  const [{gltf:baseGltf,bytes:baseBytes},{gltf:earlyGltf}]=await Promise.all([
    loadGLB('../src/assets3d/frontier-low.glb'),
    loadGLB('../src/assets3d/frontier-early-ages.glb'),
  ]);
  const baseAssets=registerAuthoredAssets(baseGltf,'low',baseBytes.length);
  registerEarlyAgeArtwork(earlyGltf.scene);
  try{
    // 1. Gameplay economy: Age 1 & 2 build/repair/convert/demolish with wood!
    const sim=new Simulation({mode:'skirmish',map:'highlands',seed:512});
    for(const e of sim.entities)if(e.kind==='resource'||e.kind==='building')e.hp=0;
    sim.revision++;sim.visible.fill(1);
    sim.players[0].age=0;
    sim.players[0].resources={food:2000,wood:200,gold:2000,stone:0};
    const tc=sim.addBuilding('towncenter',0,-30,30,true);
    const worker=sim.addUnit('villager',0,0,15);

    const w1=sim.build('wall',-2.85,20,[worker.id],0);
    const w2=sim.build('wall',0,20,[worker.id],0,true);
    const w3=sim.build('wall',2.85,20,[worker.id],0,true);
    assert.ok(w1&&w2&&w3,'Age 1 palisade walls build with 0 stone');
    assert.equal(sim.players[0].resources.wood,200-24,'3 palisade walls spend 24 wood');
    assert.equal(sim.players[0].resources.stone,0,'palisades spend 0 stone');
    assert.equal(wallTier(sim,w1),'palisade');
    assert.equal(w1.maxHp,PALISADE_WALL_HP*1.2,'Alder palisade wall uses 400 base HP');
    assert.equal(wallDisplayName(sim,w1),'Palisade wall');

    for(const w of [w1,w2,w3]){w.progress=1;w.hp=w.maxHp;}
    // Convert 3 straight palisade walls to a Palisade Gate (35 - 24 = 11 wood!)
    const gPlan=gateConversionPlan(sim,w2.id,0);
    assert.ok(gPlan,'3 straight palisade walls convert cleanly to a palisade gate');
    assert.deepEqual(gPlan.cost,{wood:11});
    const gate=sim.convertWallToGate(w2.id,0);
    assert.ok(gate&&gate.type==='gate');
    assert.equal(gate.maxHp,PALISADE_GATE_HP*1.2);
    assert.equal(sim.players[0].resources.wood,200-24-11);
    assert.equal(wallDisplayName(sim,gate),'Palisade gate');

    // Palisade repair uses wood (succeeds with 0 stone!)
    gate.hp=gate.maxHp*.5;
    sim.command([worker.id],{type:'repair',target:gate.id});
    for(let i=0;i<30;i++)sim.tickUnit(worker,.2);
    assert.ok(gate.hp>gate.maxHp*.5,'damaged palisade gate repairs using wood even with 0 stone');

    // Palisade cancel/demolish refunds wood
    const woodBefore=sim.players[0].resources.wood;
    const temp=sim.build('wall',10,20,[worker.id],0);
    assert.ok(temp);
    sim.demolish(temp.id,0);
    assert.equal(sim.players[0].resources.wood,woodBefore-8+Math.floor(8*.7),'canceling unfinished palisade refunds wood');

    // 2. 3D Palisade Gate hillside grounding + animated timber gate leaf clearance
    const land=new Landscape(512,'canyon'),ground=land.geometry(land.renderSize,112);
    const view=makeView(baseAssets,'alder',0);
    view.landscape=land;
    const gateEntity={id:501,kind:'building',type:'gate',owner:0,x:0,z:40,r:BUILDINGS.gate.r,progress:1};
    const gateNode=packBuildingModel(view,buildingModel(view,gateEntity),gateEntity);
    gateNode.position.set(0,land.surfaceHeightAt(0,40),40);
    gateNode.userData.model3d={...gateNode.userData.model3d,type:'gate'};
    groundBuildingFoundation(gateNode,land);
    groundGatePortcullis(gateNode,land);
    const leaf=gateNode.userData.portcullis;
    assert.ok(leaf&&leaf.userData.terrainGate,'palisade gate has animated timber gate leaf');
    leaf.position.y=leaf.userData.terrainGate.openLift;
    updateGatePortcullis(leaf);
    assert.equal(leaf.visible,false,'opened palisade gate leaf retracts cleanly out of the passage');
    leaf.position.y=0;
    updateGatePortcullis(leaf);
    assert.equal(leaf.visible,true,'closed palisade gate leaf restores cleanly');
    ground.dispose();

    // 3. WallVisuals switches seamlessly from wooden palisade stakes -> brown stone -> silver fortified!
    const wSim=new Simulation({mode:'skirmish',map:'highlands',seed:512});
    wSim.entities=[];wSim.index=new Map();wSim.revision++;wSim.visible.fill(1);
    wSim.players[0].age=0;
    wSim.addBuilding('wall',0,0,20,true);
    wSim.addBuilding('wall',0,3,20,true);
    const wView={sim:wSim,objects:new THREE.Group(),geo:{box:new THREE.BoxGeometry()},materials:{stone:new THREE.MeshStandardMaterial(),stoneDark:new THREE.MeshStandardMaterial(),wood:new THREE.MeshStandardMaterial()},entityHeight:()=>0,groundHeight:()=>0};
    const visuals=new WallVisuals(wView);
    try{
      visuals.update(false);
      assert.ok(visuals.palisade.count>=4,'Age 1 palisade connectors render wooden stakes & crossbeams');
      assert.equal(visuals.stone.count,0,'Age 1 palisades use 0 stone connector instances');
      assert.equal(wView.wallDiagnostics.batches,1,'palisade connectors take only 1 draw batch');

      // Advance to Castle Age (age 2) -> palisade connectors swap cleanly to stone masonry!
      wSim.players[0].age=2;
      visuals.update(false);
      assert.equal(visuals.palisade.count,0,'Castle Age clears wooden palisade connectors');
      assert.ok(visuals.stone.count>=2,'Castle Age activates brown stone masonry connectors');
      assert.equal(wView.wallDiagnostics.batches,2,'Castle Age uses standard 2 stone batches');
    }finally{
      visuals.dispose();wView.geo.box.dispose();for(const m of Object.values(wView.materials))m.dispose();
    }
  }finally{
    clearEarlyAgeArtwork();
    clearAuthoredAssets();
  }
});

test('Age 1, Age 2 regional buildings, and Palisade WallVisuals compile cleanly on WebGPU (WGSLNodeBuilder)',async()=>{
  const [{gltf:baseGltf,bytes:baseBytes},{gltf:earlyGltf}]=await Promise.all([
    loadGLB('../src/assets3d/frontier-low.glb'),
    loadGLB('../src/assets3d/frontier-early-ages.glb'),
  ]);
  const baseAssets=registerAuthoredAssets(baseGltf,'low',baseBytes.length);
  registerEarlyAgeArtwork(earlyGltf.scene);
  installNodeRuntime(nodeRuntimeModule);
  try{
    const webgpu=await import('three/webgpu');
    const renderer=new nodeRuntimeModule.WebGPURenderer({canvas:{width:1280,height:720,style:{},addEventListener(){},removeEventListener(){}}});
    renderer._initialized=true;
    renderer.backend.hasFeature=()=>true;
    renderer.backend.has=()=>true;
    renderer.backend.compatibilityMode=false;
    renderer.backend.device={limits:{maxUniformBufferBindingSize:65536,maxStorageBufferBindingSize:134217728}};
    const compileWGSL=object=>{
      const builder=new webgpu.WGSLNodeBuilder(object,renderer);
      builder.camera=new THREE.PerspectiveCamera();
      builder.scene=new THREE.Scene();
      builder.build();
      assert.ok(builder.vertexShader.length>100&&builder.fragmentShader.length>100,'WGSL vertex & fragment shaders built cleanly');
    };

    for(const [faction,age,type]of [['alder',0,'house'],['alder',0,'wall'],['alder',1,'house'],['sun',1,'towncenter'],['raven',1,'barracks']]){
      const view=makeView(baseAssets,faction,age);
      const e={id:700+age,kind:'building',type,owner:0,x:0,z:0,r:BUILDINGS[type].r,progress:1};
      const packed=packBuildingModel(view,buildingModel(view,e),e);
      const mesh=packed.children.find(c=>c.isMesh&&c.userData.structureSurface);
      assert.ok(mesh.material.isNodeMaterial,'WebGPU structurePalette uses MeshStandardNodeMaterial');
      compileWGSL(mesh);
    }

    // Verify instanced wooden palisade connector batch compiles cleanly on WebGPU!
    const sim=new Simulation({mode:'skirmish',map:'highlands',seed:512});
    sim.entities=[];sim.index=new Map();sim.revision++;sim.visible.fill(1);
    sim.players[0].age=0;
    sim.addBuilding('wall',0,0,20,true);sim.addBuilding('wall',0,3,20,true);
    const woodMat=new nodeRuntimeModule.MeshStandardNodeMaterial({color:0x756046,roughness:.88});
    const stoneMat=new nodeRuntimeModule.MeshStandardNodeMaterial({color:0xc1b9a4,roughness:.88});
    const darkMat=new nodeRuntimeModule.MeshStandardNodeMaterial({color:0x8c9288,roughness:.88});
    const view={sim,objects:new THREE.Group(),geo:{box:new THREE.BoxGeometry()},materials:{stone:stoneMat,stoneDark:darkMat,wood:woodMat},entityHeight:()=>0,groundHeight:()=>0};
    const visuals=new WallVisuals(view);
    try{
      visuals.update(false);
      assert.ok(visuals.palisade.count>0);
      compileWGSL(visuals.palisade);
    }finally{
      visuals.dispose();view.geo.box.dispose();woodMat.dispose();stoneMat.dispose();darkMat.dispose();
    }
  }finally{
    installNodeRuntime(null);
    clearEarlyAgeArtwork();
    clearAuthoredAssets();
  }
});

test('AI economy rebalancing shifts surplus food farmers to starved wood (e.g. 32k food vs 115 wood)',()=>{
  const w=dynamicEconomyWeights({age:3,resources:{food:32000,wood:115,gold:2000,stone:2000}});
  assert.ok(w.wood>.65,`starved wood gets priority weight (${w.wood.toFixed(2)})`);
  assert.ok(w.food<.10,`bloated 32k food stockpile is sharply throttled (${w.food.toFixed(2)})`);

  const sim=new Simulation({mode:'skirmish',map:'highlands',seed:512});
  for(const e of sim.entities)if(e.kind==='resource'||e.kind==='building'||e.kind==='unit')e.hp=0;
  sim.revision++;sim.visible.fill(1);
  const owner=1;
  sim.players[owner].age=3;
  sim.players[owner].resources={food:32000,wood:115,gold:2000,stone:2000};
  const tc=sim.addBuilding('towncenter',owner,20,20,true);
  const farms=[];
  for(let i=0;i<6;i++)farms.push(sim.addBuilding('farm',owner,8+i*7,32,true));
  for(let i=0;i<5;i++)sim.addResource('wood',34+i*3,10,400);
  const workers=[];
  for(let i=0;i<8;i++){
    const v=sim.addUnit('villager',owner,12+i*2,26);
    v.gatherType='food';
    v.carry=6;v.carryType='food';
    v.order={type:'gather',target:farms[i%farms.length].id};
    workers.push(v);
  }
  const state={known:{},lastRebalance:-20};
  const moved=rebalanceEconomy(sim,state,owner,workers);
  assert.ok(moved>=3,`rebalanceEconomy moves surplus farmers onto wood (moved ${moved})`);
  assert.ok(workers.filter(v=>v.gatherType==='wood').length>=3,'at least 3 former food gatherers now harvest wood');

  // manageFarming must NOT steal wood gatherers or spend scarce wood on new farms when food is bloated.
  const woodBefore=workers.filter(v=>v.gatherType==='wood').length;
  const builtFarm=manageFarming(sim,owner,workers,sim.owned(owner,'building'),[tc]);
  assert.equal(builtFarm,false,'do not build extra farms when food=32000 and wood=115');
  assert.equal(workers.filter(v=>v.gatherType==='wood').length,woodBefore,'do not steal wood gatherers back onto farms');
});

test('kingdom under attack announcement speaks calmly with human voice and war horn uses warm non-sawtooth harmonics',()=>{
  // Verify procedural war horn no longer uses harsh buzzing sawtooth oscillators.
  const oscs=[];
  const mockParam=()=>({value:0,setValueAtTime(){},exponentialRampToValueAtTime(){}});
  const ctx={
    currentTime:10,state:'running',
    createOscillator(){const o={type:'sine',frequency:mockParam(),connect(){},start(){},stop(){}};oscs.push(o);return o;},
    createBiquadFilter(){return {type:'lowpass',frequency:mockParam(),Q:mockParam(),connect(){}};},
    createGain(){return {gain:mockParam(),connect(){}};},
  };
  synthesizeWarHorn(ctx,174.61);
  assert.equal(oscs.length,6);
  assert.ok(oscs.every(o=>o.type!=='sawtooth'),'war horn eliminates harsh sawtooth buzz');

  // Verify announceAttack uses real human speech synthesis when available and respects cooldown.
  const spoken=[];
  const origSynth=globalThis.speechSynthesis,origUtt=globalThis.SpeechSynthesisUtterance;
  globalThis.SpeechSynthesisUtterance=class{constructor(text){this.text=text;}};
  globalThis.speechSynthesis={
    getVoices:()=>[{name:'Google US English',lang:'en-US'}],
    cancel(){},
    speak(u){spoken.push(u);},
  };
  try{
    const audio=new AudioEngine({volume:.7,music:false,unitVoices:true,warHorns:true});
    audio.context=ctx;audio.master=ctx.createGain();
    assert.equal(audio.announceAttack('Your kingdom is under attack.'),true);
    assert.equal(spoken.length,1);
    assert.equal(spoken[0].text,'Your kingdom is under attack.');
    // Cooldown prevents ear-fatiguing repeated spam.
    assert.equal(audio.announceAttack('Your kingdom is under attack.'),false);
    assert.equal(spoken.length,1);
    ctx.currentTime+=ATTACK_ANNOUNCE_COOLDOWN+1;
    assert.equal(audio.announceAttack('Your kingdom is under attack.'),true);
    assert.equal(spoken.length,2);
  }finally{
    globalThis.speechSynthesis=origSynth;
    globalThis.SpeechSynthesisUtterance=origUtt;
  }
});

test('AI adaptive perimeter walls stay strictly orthogonal without 45-degree corner twists, and gates tower over walls',async()=>{
  // 1. Check AI detour perimeter layout angles are strictly orthogonal (0° or 90° relative to plan.angle).
  const sim=new Simulation({mode:'custom',map:'highlands',mapSize:'large',slots:battlePreset('2v2'),startAge:2,populationLimit:80,seed:512});
  sim.entities=[];sim.index=new Map();sim.grids={};sim.revision++;sim.time=650;sim.tickCustomAI=()=>{};
  const owner=1,base=sim.addBuilding('towncenter',owner,-40,0,true);
  sim.addBuilding('towncenter',0,-75,-50,true);sim.addBuilding('towncenter',2,65,65,true);sim.addBuilding('towncenter',3,80,50,true);
  sim.addBuilding('tower',owner,-25,0,true);sim.addBuilding('barracks',owner,-42,12,true);
  sim.players[owner].resources={food:1500,wood:1800,gold:1200,stone:5000};
  const state={known:{},decision:0};
  const front=planFortification(sim,state,owner,base,sim.owned(owner,'building'));
  assert.ok(front);
  for(const piece of front.pieces){const b=sim.addBuilding(piece.type,owner,piece.x,piece.z,true,{angle:piece.angle??front.angle});piece.id=b.id;}
  // Place buildings on the flanks to force adaptive detour routing.
  const gate=front.pieces[0],n={x:Math.sin(front.angle),z:Math.cos(front.angle)},t={x:n.z,z:-n.x};
  for(const sign of [-1,1])sim.addBuilding('house',owner,gate.x+t.x*sign*17.1-n.x*19.95,gate.z+t.z*sign*17.1-n.z*19.95,true);
  const adapted=adaptivePerimeterLayouts(sim,front,owner).next().value;
  assert.ok(adapted,'adaptive perimeter finds a clean detour');
  for(const piece of adapted.pieces){
    const diff=Math.abs((((piece.angle??front.angle)-front.angle)%Math.PI+Math.PI)%Math.PI);
    const ortho=Math.min(diff,Math.abs(diff-Math.PI/2),Math.abs(diff-Math.PI));
    assert.ok(ortho<1e-6,`wall piece angle stays strictly orthogonal (drift ${ortho.toFixed(4)} rad)`);
  }

  // 2. Verify Gatehouses stand visibly taller and grander than connecting walls across all 3 tiers.
  const [{gltf:baseGltf,bytes:baseBytes},{gltf:earlyGltf}]=await Promise.all([
    loadGLB('../src/assets3d/frontier-low.glb'),
    loadGLB('../src/assets3d/frontier-early-ages.glb'),
  ]);
  const baseAssets=registerAuthoredAssets(baseGltf,'low',baseBytes.length);
  registerEarlyAgeArtwork(earlyGltf.scene);
  try{
    const heightOf=(age,tech,type)=>{
      const v=makeView(baseAssets,'alder',age,tech);
      const m=buildingModel(v,{id:800,kind:'building',type,owner:0,x:0,z:0,r:BUILDINGS[type].r,progress:1});
      return new THREE.Box3().setFromObject(m).max.y;
    };
    assert.ok(heightOf(0,{},'gate')>heightOf(0,{},'wall')+2.0,'Palisade gate towers well over palisade wall');
    assert.ok(heightOf(2,{},'gate')>heightOf(2,{},'wall')+1.2,'Stone gatehouse towers over stone wall');
    assert.ok(heightOf(3,{fortifiedWall:1},'gate')>heightOf(3,{fortifiedWall:1},'wall')+1.0,'Fortified gatehouse towers over fortified wall');
  }finally{
    clearEarlyAgeArtwork();
    clearAuthoredAssets();
  }
});

test('gates can be placed directly onto existing owned walls (AoE style) without walls blocking them',()=>{
  const makeSim=(age=0)=>{
    const s=new Simulation({mode:'sandbox',map:'highlands',seed:512});
    for(const e of s.entities)if(e.kind==='resource'||e.kind==='building')e.hp=0;
    s.revision++;s.visible.fill(1);
    s.players[0].age=age;
    s.players[0].resources={food:1000,wood:1000,gold:1000,stone:1000};
    return s;
  };

  // 1. Horizontal completed Palisade wall line in Age 1: wall never blocks gate, snaps & credits wall cost.
  const sim=makeSim(0),worker=sim.addUnit('villager',0,0,10);
  const line=[];
  for(let i=-3;i<=3;i++)line.push(sim.addBuilding('wall',0,i*WALL_SPACING,20,true));
  const mid=line[3];
  assert.equal(sim.buildValid('gate',mid.x,mid.z,0),true,'own walls must not block gate placement');
  assert.equal(sim.buildValid('gate',mid.x+.6,mid.z+.5,0),true,'near-wall click snaps cleanly onto wall line');
  const preview=gatePlacementPlan(sim,mid.x+.6,mid.z+.5,0);
  assert.equal(preview.valid,true);
  assert.equal(preview.x,mid.x);assert.equal(preview.z,mid.z);
  assert.equal(preview.sections.length,3);
  assert.equal(preview.cost.wood,11,'3 replaced palisade walls credit 24 wood from 35 wood palisade gate');
  const woodBefore=sim.players[0].resources.wood;
  const gate=sim.build('gate',mid.x+.6,mid.z+.5,[worker.id],0);
  assert.ok(gate,'gate builds directly on top of owned wall line');
  assert.equal(gate.x,mid.x);assert.equal(gate.z,mid.z);
  assert.equal(sim.players[0].resources.wood,woodBefore-11,'charged discounted net wood cost');
  assert.equal(line[2].hp,0);assert.equal(line[3].hp,0);assert.equal(line[4].hp,0);
  assert.ok(line[1].hp>0&&line[5].hp>0,'surviving outer walls remain standing');
  assert.equal(gate.wallLinks.length,2,'gate seamlessly links to both surviving outer walls');
  assert.ok(gate.wallLinks.includes(line[1].id)&&gate.wallLinks.includes(line[5].id));
  assert.equal(clearSegment(sim,sim.grid(0),{x:mid.x,z:13},{x:mid.x,z:27}),true,'allies pass through placed gate');
  assert.equal(clearSegment(sim,sim.grid(1),{x:mid.x,z:13},{x:mid.x,z:27}),false,'enemies remain blocked by gate');
  assert.equal(sim.buildValid('gate',gate.x,gate.z,0),false,'existing gate still blocks stacking another gate');

  // 2. Vertical Stone wall line (Castle Age) + unfinished wall blueprints + builder redirect!
  const vSim=makeSim(2),vWorker=vSim.addUnit('villager',0,-8,20),helper=vSim.addUnit('villager',0,-6,20);
  const vWalls=vSim.buildWallLine({x:10,z:0},{x:10,z:18},[helper.id],0);
  assert.ok(vWalls.length>=6&&vWalls.every(w=>w.progress<1),'unfinished wall blueprints created');
  const vMid=vWalls[3];
  helper.order={type:'build',target:vMid.id,wallConstruction:true};
  const stoneBefore=vSim.players[0].resources.stone,woodVBefore=vSim.players[0].resources.wood;
  const vGate=vSim.build('gate',vMid.x,vMid.z,[vWorker.id],0);
  assert.ok(vGate,'gate replaces unfinished vertical stone wall blueprints');
  assert.ok(Math.abs(Math.sin(vGate.wallAngle))>.999,'vertical gate auto-rotates to match vertical wall');
  assert.equal(vSim.players[0].resources.stone,stoneBefore-24,'3 stone walls credit 66 stone from 90 stone gatehouse');
  assert.equal(vSim.players[0].resources.wood,woodVBefore-30,'wood timber portion still paid');
  assert.equal(helper.order.target,vGate.id,'villager building replaced wall redirects to new gate');
  assert.equal(vGate.wallLinks.length,2,'vertical gate connects to upper and lower surviving walls');

  // 3. Diagonal wall line aligns gate to 45 degrees cleanly.
  const dSim=makeSim(2),dWorker=dSim.addUnit('villager',0,0,10);
  const dWalls=dSim.buildWallLine({x:0,z:0},{x:20,z:20},[dWorker.id],0);
  const dMid=dWalls[Math.floor(dWalls.length/2)];
  const dGate=dSim.build('gate',dMid.x,dMid.z,[dWorker.id],0);
  assert.ok(dGate,'diagonal wall allows gate overlay');
  assert.ok(Math.abs(Math.abs(dGate.wallAngle)-Math.PI/4)<.05,`diagonal gate aligns to 45 deg (${dGate.wallAngle.toFixed(3)})`);
  assert.equal(dGate.wallLinks.length,2);

  // 4. Safety checks: enemy walls & nearby non-wall buildings still block gates; standalone gate stays unrotated.
  const sSim=makeSim(2),sWorker=sSim.addUnit('villager',0,0,0);
  const enemyWall=sSim.addBuilding('wall',1,20,20,true);
  assert.equal(sSim.buildValid('gate',enemyWall.x,enemyWall.z,0),false,'enemy walls still block player gate');
  const blockedWall=sSim.addBuilding('wall',0,-20,20,true);
  sSim.addBuilding('house',0,-20,24,true);
  assert.equal(sSim.buildValid('gate',blockedWall.x,blockedWall.z,0),false,'non-wall building next to wall still blocks gate');
  const openGate=sSim.build('gate',-30,-30,[sWorker.id],0);
  assert.ok(openGate);
  assert.equal(openGate.wallAngle,undefined,'standalone gate on open land keeps flexible angle until walls join');
  assert.equal(wallConnections(sim.entities).length>=2,true);
});

test('automatic corner bastions form cleanly at 90-degree corners & junctions across all 3 tiers and compile on WebGPU',async()=>{
  const [{gltf:baseGltf,bytes:baseBytes},{gltf:earlyGltf}]=await Promise.all([
    loadGLB('../src/assets3d/frontier-low.glb'),
    loadGLB('../src/assets3d/frontier-early-ages.glb'),
  ]);
  const baseAssets=registerAuthoredAssets(baseGltf,'low',baseBytes.length);
  registerEarlyAgeArtwork(earlyGltf.scene);
  try{
    // 1. Topology detection: straight runs stay walls; 90° L-corners & T-junctions become bastions; losing a leg reverts.
    const sim=new Simulation({mode:'sandbox',map:'highlands',seed:512});
    for(const e of sim.entities)if(e.kind==='resource'||e.kind==='building')e.hp=0;
    sim.revision++;sim.visible.fill(1);
    const w1=sim.addBuilding('wall',0,0,20,true);
    const corner=sim.addBuilding('wall',0,WALL_SPACING,20,true);
    const straight=sim.addBuilding('wall',0,WALL_SPACING*2,20,true);
    assert.equal(isWallCorner(sim,w1),false,'end wall stub is not a corner');
    assert.equal(isWallCorner(sim,corner),false,'straight wall run is not a corner');
    assert.equal(isWallCorner(sim,straight),false,'straight end is not a corner');

    // Attach perpendicular leg to corner -> T-junction becomes bastion!
    const perp=sim.addBuilding('wall',0,WALL_SPACING,20+WALL_SPACING,true);
    assert.equal(isWallCorner(sim,corner),true,'T-junction upgrades into corner bastion');

    // Demolish the straight continuation -> classic 90-degree L-corner stays a bastion!
    sim.hurt(straight,straight.hp+1,null);
    assert.equal(isWallCorner(sim,corner),true,'90-degree L-corner remains a corner bastion');

    // Verify all 3 Blender corner bastions (Palisade, Stone, Fortified): grounded, taller than straight walls, 1 static draw call!
    const tiers=[
      ['palisade',0,{}],
      ['stone',2,{}],
      ['fortified',3,{fortifiedWall:1}],
    ];
    for(const [tier,age,tech]of tiers){
      sim.players[0].age=age;sim.players[0].tech={...sim.players[0].tech,fortifiedWall:tech.fortifiedWall||0};
      const view=makeView(baseAssets,'alder',age,tech);
      view.sim=sim;
      const straightRaw=buildingModel(view,w1);
      const cornerRaw=buildingModel(view,corner);
      assert.equal(straightRaw.userData.model3d.wallCorner,false,`straight ${tier} wall keeps wallCorner=false`);
      assert.equal(cornerRaw.userData.model3d.wallCorner,true,`corner ${tier} wall gets wallCorner=true`);
      assert.equal(cornerRaw.userData.model3d.wallTier,tier);
      const sBox=new THREE.Box3().setFromObject(straightRaw);
      const cBox=new THREE.Box3().setFromObject(cornerRaw);
      assert.ok(cBox.min.y<=-0.42,`${tier} corner bastion is grounded below -0.42 (${cBox.min.y.toFixed(2)})`);
      assert.ok(cBox.max.y>sBox.max.y+.55,`${tier} corner bastion (${cBox.max.y.toFixed(2)}m) stands taller than straight wall (${sBox.max.y.toFixed(2)}m)`);
      const packedStraight=packBuildingModel(view,straightRaw,w1);
      const packedCorner=packBuildingModel(view,cornerRaw,corner);
      const cornerStaticMeshes=packedCorner.children.filter(c=>c.isMesh&&c.userData.structureSurface);
      assert.equal(cornerStaticMeshes.length,1,`${tier} corner bastion packs to 1 static draw call`);
      assert.notEqual(cornerStaticMeshes[0].geometry,packedStraight.children.find(c=>c.isMesh&&c.userData.structureSurface).geometry,'corner bastion does not collide with straight wall geometry cache');
    }

    // Demolishing the perpendicular leg reverts the corner cleanly back to a normal straight wall.
    sim.hurt(perp,perp.hp+1,null);
    assert.equal(isWallCorner(sim,corner),false,'removing perpendicular leg reverts corner back to normal wall');

    // 2. WebGPU WGSL compilation check across all 3 Corner Bastion tiers!
    installNodeRuntime(nodeRuntimeModule);
    try{
      const webgpu=await import('three/webgpu');
      const renderer=new nodeRuntimeModule.WebGPURenderer({canvas:{width:1280,height:720,style:{},addEventListener(){},removeEventListener(){}}});
      renderer._initialized=true;
      renderer.backend.hasFeature=()=>true;renderer.backend.has=()=>true;
      renderer.backend.compatibilityMode=false;
      renderer.backend.device={limits:{maxUniformBufferBindingSize:65536,maxStorageBufferBindingSize:134217728}};
      const perp2=sim.addBuilding('wall',0,WALL_SPACING,20-WALL_SPACING,true);
      assert.equal(isWallCorner(sim,corner),true);
      for(const [tier,age,tech]of tiers){
        sim.players[0].age=age;sim.players[0].tech={...sim.players[0].tech,fortifiedWall:tech.fortifiedWall||0};
        const view=makeView(baseAssets,'alder',age,tech);view.sim=sim;
        const packed=packBuildingModel(view,buildingModel(view,corner),corner);
        const mesh=packed.children.find(c=>c.isMesh&&c.userData.structureSurface);
        assert.ok(mesh.material.isNodeMaterial);
        const builder=new webgpu.WGSLNodeBuilder(mesh,renderer);
        builder.camera=new THREE.PerspectiveCamera();builder.scene=new THREE.Scene();
        builder.build();
        assert.ok(builder.vertexShader.length>100&&builder.fragmentShader.length>100,`${tier} corner bastion WGSL compiles cleanly`);
      }
      assert.ok(perp2.hp>0);
    }finally{
      installNodeRuntime(null);
    }
  }finally{
    clearEarlyAgeArtwork();
    clearAuthoredAssets();
  }
});

test('destroyed siege & ships keep dark timber wreckage instead of turning white, Frontier Age works on Coast, and attack voice falls back when speechSynthesis is blocked',async()=>{
  // 1. Destroyed ships & siege engines must NEVER turn bright white when PBR wood.map sets wood.color to pale 0xe4d7bf.
  const woodMat=new THREE.MeshStandardMaterial({color:0xe4d7bf,map:new THREE.Texture()});
  const view={
    clock:0,scene:new THREE.Scene(),settings:{quality:'high'},
    sim:{entities:[],isVisible:()=>true},groundHeight:()=>0,
    materials:{wood:woodMat},
    makeUnit(){
      const g=new THREE.Group(),m=new THREE.Mesh(new THREE.BoxGeometry(2,1,3),woodMat);
      m.userData.surfaceRole='wood';g.add(m);return g;
    },
    mergeModel:WorldView.prototype.mergeModel,
    releaseNode(m){m.traverse(p=>p.geometry?.dispose());},
  };
  const pool=new BattleRemains(view);
  try{
    for(const type of ['ram','catapult','galley','warship']){
      pool.spawn({id:900+type.length,owner:0,type,kind:'unit',x:5,z:5,heading:0});
      const batch=pool.batches.get(`0:${type}:standard`);
      assert.ok(batch,`${type} wreck batch created`);
      const arr=batch.mesh.geometry.attributes.color.array;
      let maxChannel=0;
      for(let i=0;i<arr.length;i++)if(arr[i]>maxChannel)maxChannel=arr[i];
      assert.ok(maxChannel<0.25,`${type} destroyed wreck stays deep linear charred timber (max linear channel ${maxChannel.toFixed(3)}, never pale or bleached white)`);
    }
  }finally{
    pool.dispose();woodMat.map.dispose();woodMat.dispose();
  }

  // 1b. Per-frame isWallCorner performance check: 400 walls + 2,000 entities stays O(1) (<5ms for 10 frames!).
  const bigSim=new Simulation({mode:'sandbox',map:'highlands',seed:512});
  bigSim.entities=[];bigSim.revision++;
  const walls=[];
  for(let i=0;i<400;i++){
    const e={id:i+1,kind:'building',type:'wall',owner:0,x:(i%20)*WALL_SPACING,z:Math.floor(i/20)*WALL_SPACING,hp:400,maxHp:400,r:1.4,wallLinks:[]};
    if(i>0)e.wallLinks.push(i);
    if(i<399)e.wallLinks.push(i+2);
    walls.push(e);bigSim.entities.push(e);
  }
  for(let i=0;i<1600;i++)bigSim.entities.push({id:1000+i,kind:'unit',type:'villager',owner:0,x:i,z:0,hp:50});
  bigSim.revision++;
  isWallCorner(bigSim,walls[0]); // warm revision cache
  const t0=performance.now();
  for(let frame=0;frame<10;frame++)for(const w of walls)isWallCorner(bigSim,w);
  const elapsedMs=performance.now()-t0;
  assert.ok(elapsedMs<15,`4,000 isWallCorner calls across 2,000 entities took ${elapsedMs.toFixed(2)}ms (<15ms O(1) lag-free)`);

  // 2. Frontier Age (startAge: 0) must stay selectable on Coast and every other map.
  for(const map of ['highlands','coast','rivers','winter','desert','archipelago']){
    const normalized=normalizeBattle({map,mapSize:'vast',startAge:0,slots:battlePreset('2v2')});
    assert.equal(normalized.startAge,0,`Frontier Age (0) stays selected on ${map}`);
  }

  // 3. When speechSynthesis silently drops speech (never calls onstart), watchdog triggers recorded human voice 'alarm'.
  const prevSynth=globalThis.speechSynthesis,prevUtt=globalThis.SpeechSynthesisUtterance;
  try{
    globalThis.SpeechSynthesisUtterance=class{constructor(t){this.text=t;}};
    globalThis.speechSynthesis={getVoices:()=>[{name:'Silent Mobile Voice',lang:'en-US'}],cancel(){},speak(){/* silently dropped by browser */}};
    const engine=new AudioEngine({volume:.7,unitVoices:true,warHorns:true});
    let playedAlarm=0;
    engine.play=name=>{if(name==='alarm')playedAlarm++;};
    engine.announceAttack('Your kingdom is under attack.');
    await new Promise(r=>setTimeout(r,280));
    assert.equal(playedAlarm,1,'watchdog triggers Web Audio human voice alarm when speechSynthesis silently drops');
  }finally{
    globalThis.speechSynthesis=prevSynth;globalThis.SpeechSynthesisUtterance=prevUtt;
  }
});
