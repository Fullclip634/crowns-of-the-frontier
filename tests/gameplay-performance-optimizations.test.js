import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {Simulation} from '../src/simulation.js';
import {battlePreset} from '../src/custom-battle.js';
import {Landscape} from '../src/landscape.js';
import {applyTerrainShading} from '../src/terrain-surface.js';
import {MeshStandardNodeMaterial,terrain as nodeTerrain} from '../src/render-nodes.js';
import {installNodeRuntime} from '../src/render-runtime.js';
import {BattleRemains} from '../src/battle-remains.js';
import {WeatherRenderer} from '../src/weather.js';
import {renderHealthBars} from '../src/health-layer.js';
import {updateContacts} from '../src/visual-depth.js';
import {WallVisuals} from '../src/wall-visuals.js';
import {FORTIFIED_WALL_TECH} from '../src/fortified-walls.js';
import {updateFogTexture} from '../src/fog-texture.js';
import {takeFromResource,revealResourceChanges} from '../src/resource-vision.js';
import {pruneFootPlacements} from '../src/foot-placement.js';
import {WorldView} from '../src/world.js';

function fakeCanvasDom(){
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

test('compile-time terrain biome specialization omits dead biome code on WebGL2 and builds cleanly on WebGPU',()=>{
  const restore=fakeCanvasDom();
  const tex=()=>new THREE.DataTexture(new Uint8Array([128,128,255,255]),1,1);
  const surfaces=Object.fromEntries(['grass','soil','rock','paving'].map(role=>[role,Object.fromEntries(['color','normal','arm'].map(kind=>[kind,tex()]))]));
  installNodeRuntime({terrain:nodeTerrain,MeshStandardNodeMaterial});
  try{
    const expectations={
      highlands:{has:['cloverDapple'],lacks:['snowSparkle','sandRipple','ashDrift','swashRipple','frontierVolcanicFissure(vTerrainWorldPos)']},
      winter:{has:['snowSparkle'],lacks:['cloverDapple','sandRipple','ashDrift','swashRipple','frontierVolcanicFissure(vTerrainWorldPos)']},
      arid:{has:['sandRipple'],lacks:['cloverDapple','snowSparkle','ashDrift','swashRipple','frontierVolcanicFissure(vTerrainWorldPos)']},
      volcanic:{has:['ashDrift','frontierVolcanicFissure(vTerrainWorldPos)'],lacks:['cloverDapple','snowSparkle','sandRipple','swashRipple']},
      coast:{has:['cloverDapple','swashRipple'],lacks:['snowSparkle','sandRipple','ashDrift','frontierVolcanicFissure(vTerrainWorldPos)']},
    };
    for(const [map,spec] of Object.entries(expectations)){
      const land=new Landscape(512,map);
      const glMat=new THREE.MeshStandardMaterial();
      applyTerrainShading(glMat,land,'high',surfaces,{grass:2,soil:1.5,rock:65,paving:2});
      const shader={uniforms:{},vertexShader:THREE.ShaderLib.standard.vertexShader,fragmentShader:THREE.ShaderLib.standard.fragmentShader};
      glMat.onBeforeCompile(shader);
      for(const token of spec.has)assert.ok(shader.fragmentShader.includes(token),`${map} WebGL2 shader includes ${token}`);
      for(const token of spec.lacks)assert.ok(!shader.fragmentShader.includes(token),`${map} WebGL2 shader omits dead ${token}`);
      for(const owned of glMat.frontierOwnedTextures||[])owned.dispose();
      glMat.dispose();

      const nodeMat=new MeshStandardNodeMaterial();
      applyTerrainShading(nodeMat,land,'high',surfaces,{grass:2,soil:1.5,rock:65,paving:2});
      assert.ok(nodeMat.colorNode&&nodeMat.normalNode&&nodeMat.roughnessNode&&nodeMat.aoNode,`${map} WebGPU node terrain builds all PBR outputs`);
      for(const owned of nodeMat.frontierOwnedTextures||[])owned.dispose();
      nodeMat.dispose();
    }
  }finally{
    installNodeRuntime(null);
    restore();
    for(const set of Object.values(surfaces))for(const t of Object.values(set))t.dispose();
  }
});

test('BattleRemains skips idle GPU uploads when empty and uploads only active prefix ranges when populated',()=>{
  const geometry=new THREE.BoxGeometry(.7,2,.4),material=new THREE.MeshStandardMaterial({color:0x397f8c});
  const view={
    clock:0,scene:new THREE.Scene(),settings:{quality:'high'},sim:{entities:[],isVisible:()=>true},groundHeight:()=>1,materials:{},
    makeUnit(){const g=new THREE.Group(),m=new THREE.Mesh(geometry,material);m.position.y=1;g.add(m);return g;},
    mergeModel:WorldView.prototype.mergeModel,releaseNode(m){m.traverse(c=>c.geometry?.dispose());},
  };
  const pool=new BattleRemains(view);
  pool.update();
  const initialVersions=[pool.rubble.instanceMatrix.version,pool.piers.instanceMatrix.version,pool.timbers.instanceMatrix.version];
  for(let i=0;i<10;i++){view.clock+=.1;pool.update();}
  assert.deepEqual(
    [pool.rubble.instanceMatrix.version,pool.piers.instanceMatrix.version,pool.timbers.instanceMatrix.version],
    initialVersions,
    'empty remains pools never re-upload matrices while idle'
  );

  pool.spawn({id:10,owner:0,type:'house',kind:'building',x:4,z:4,r:2.2});
  view.clock+=.2;pool.update();
  assert.deepEqual(pool.rubble.instanceMatrix.updateRanges,[{start:0,count:pool.rubble.count*16}]);
  assert.deepEqual(pool.rubble.instanceColor.updateRanges,[{start:0,count:pool.rubble.count*3}]);
  assert.deepEqual(pool.piers.instanceMatrix.updateRanges,[{start:0,count:pool.piers.count*16}]);
  assert.deepEqual(pool.timbers.instanceMatrix.updateRanges,[{start:0,count:pool.timbers.count*16}]);

  pool.dispose();geometry.dispose();material.dispose();
});

test('WeatherRenderer uses prefix upload ranges, building shortlist and bounded particle surface cache',()=>{
  let entityScans=0,groundCalls=0;
  const building={id:1,kind:'building',owner:0,x:4,z:4,r:3,hp:300,progress:1};
  const view={
    sim:{
      options:{seed:7,map:'highlands'},time:10,revision:1,
      get entities(){entityScans++;return [building];},
      candidatesFor(kind){return kind==='building'?[building]:[];},
      isWater:()=>false,isVisible:()=>true,
    },
    settings:{quality:'low',weather:'storm',lighting:'day',fog:true},
    scene:Object.assign(new THREE.Scene(),{background:new THREE.Color(0xa5b4ad),fog:new THREE.Fog(0xa5b4ad,100,220),environmentIntensity:.3}),
    sun:new THREE.DirectionalLight(0xffe4bd,2.7),
    hemi:new THREE.HemisphereLight(0xc7def1,0x52633a,.9),
    camera:new THREE.PerspectiveCamera(45,16/9,1,200),
    target:new THREE.Vector3(),zoom:40,dynamicScale:1,
    groundSurface:{material:new THREE.MeshStandardMaterial({color:0xffffff})},
    renderer:{toneMappingExposure:1.1},
    fogTint:new THREE.Color(0x13201e),materials:{},
    groundHeight:()=>{groundCalls++;return 1;},
    entityHeight:()=>1,
  };
  const weather=new WeatherRenderer(view);
  for(let i=0;i<6;i++){view.sim.time+=.2;weather.update(.2,false);}
  assert.equal(entityScans,0,'updateRoofs and NightAtmosphere use candidatesFor(building) instead of full sim.entities');
  assert.ok(weather.rain.count>0);
  assert.deepEqual(weather.rain.instanceMatrix.updateRanges,[{start:0,count:weather.rain.count*16}]);
  assert.deepEqual(weather.clouds.instanceMatrix.updateRanges,[{start:0,count:weather.clouds.count*16}]);
  assert.deepEqual(weather.clouds.instanceColor.updateRanges,[{start:0,count:weather.clouds.count*3}]);
  const cachedBefore=weather.surfaceCache.size;
  assert.ok(cachedBefore>0&&cachedBefore<=4096);
  const callsBefore=groundCalls;
  weather.particleSurface(4.1,4.2);
  weather.particleSurface(4.8,4.9);
  assert.ok(groundCalls-callsBefore<=1,'particleSurface caches 1m terrain/roof cells');
  view.sim.revision++;
  weather.updateRoofs();
  assert.equal(weather.surfaceCache.size,0,'revision change clears particleSurface cache alongside roofs');
  // Negative dt from rAF vs performance.now clock skew must never yield negative counts or update ranges.
  weather.strength=0;
  weather.update(-0.02,false);
  assert.ok(weather.rain.count>=0&&weather.snow.count>=0&&weather.ripples.count>=0,'weather counts stay non-negative on negative dt');
  weather.dispose();view.groundSurface.material.dispose();
});

test('renderHealthBars caches canvasRect when view opts in via null and re-measures after invalidation',()=>{
  const children=[];
  const makeNode=()=>({className:'',style:{},textContent:'',hidden:false,children:[],append(...items){this.children.push(...items);},remove(){const i=children.indexOf(this);if(i>=0)children.splice(i,1);}});
  const layer={children,ownerDocument:{createElement:()=>makeNode()},append(...items){children.push(...items);}};
  const unit={id:1,kind:'unit',owner:0,x:0,z:0,hp:50,maxHp:100};
  const sim={entities:[unit],candidatesFor:k=>k==='unit'?[unit]:[],isVisible:()=>true,hostile:()=>false};
  let rectReads=0;
  const view={
    canvasRect:null,
    selection:new Set(),
    renderer:{domElement:{getBoundingClientRect(){rectReads++;return {left:0,top:0,width:1280,height:720};}}},
    project:(e,rect)=>({x:rect.width*.5,y:rect.height*.5,visible:true}),
  };
  renderHealthBars(layer,sim,view,{width:1280,height:720});
  renderHealthBars(layer,sim,view,{width:1280,height:720});
  renderHealthBars(layer,sim,view,{width:1280,height:720});
  assert.equal(rectReads,1,'opt-in canvasRect caches layout rect across frames');
  view.canvasRect=null;
  renderHealthBars(layer,sim,view,{width:1280,height:720});
  assert.equal(rectReads,2,'clearing canvasRect on resize triggers a fresh measurement');
});

test('updateContacts clears stale updateRanges before adding a new dirty matrix slice',()=>{
  const mesh=new THREE.InstancedMesh(new THREE.PlaneGeometry(1,1),new THREE.MeshBasicMaterial(),16);
  const unit={id:1,kind:'unit',type:'villager',owner:0,x:2,z:3,r:.5,hp:40,maxHp:40};
  const view={
    contactShadows:mesh,contactSlots:[],contactCache:new Map(),contactDummy:new THREE.Object3D(),clock:0,
    sim:{entities:[unit],isVisible:()=>true,isExplored:()=>true,get:id=>id===1?unit:null},
    groundHeight:()=>0,
  };
  for(let i=0;i<5;i++){
    unit.x+=1;
    updateContacts(view,true);
  }
  assert.equal(mesh.instanceMatrix.updateRanges.length,1,'updateRanges never accumulates stale slices across frames');
  mesh.geometry.dispose();mesh.material.dispose();mesh.dispose();
});

test('WallVisuals uses integer tier hash and skips full entity scans when no walls exist',()=>{
  let entityScans=0;
  const view={
    objects:new THREE.Group(),
    geo:{box:new THREE.BoxGeometry(1,1,1)},
    materials:{stone:new THREE.MeshStandardMaterial(),stoneDark:new THREE.MeshStandardMaterial()},
    fogTexture:{version:1},
    entityHeight:()=>0,groundHeight:()=>0,
    sim:{
      revision:1,
      players:[{tech:{[FORTIFIED_WALL_TECH]:0}},{tech:{[FORTIFIED_WALL_TECH]:0}}],
      get entities(){entityScans++;return [];},
      candidatesFor:()=>[],
      isVisible:()=>true,
    },
  };
  const visuals=new WallVisuals(view);
  visuals.update(false);
  const afterFirst=entityScans;
  view.sim.revision=2;
  visuals.update(false);
  // Only identity check `this.entities!==v.sim.entities` and assignment read `entities`, never scanning it via wallTreeConnections.
  assert.equal(visuals.links.length,0);
  const prevTier=visuals.lastTierVersion;
  view.sim.players[1].tech[FORTIFIED_WALL_TECH]=1;
  visuals.update(false);
  assert.notEqual(visuals.lastTierVersion,prevTier,'fortified wall tech upgrade invalidates integer tier hash immediately');
  assert.ok(afterFirst<=2);
  visuals.dispose();view.geo.box.dispose();view.materials.stone.dispose();view.materials.stoneDark.dispose();
});

test('fog exploredRevision and resourceRevision track explored mask changes and resource depletion accurately',()=>{
  const size=4;
  const sim={gridSize:size,visible:new Uint8Array(size*size),explored:new Uint8Array(size*size),options:{multiplayer:false,spectator:false},isVisible:()=>false,isExplored:()=>true};
  const pixels=new Uint8ClampedArray(size*size*4);
  const view={
    sim,
    fogCanvas:{width:size,height:size},
    fogCtx:{createImageData:(w,h)=>({width:w,height:h,data:pixels}),putImageData(){}},
    fogTexture:{needsUpdate:false,dispose(){}},
  };
  sim.visible[0]=1;sim.explored[0]=1;
  updateFogTexture(view);
  assert.equal(view.exploredRevision,1);
  // Toggling between visible and already-explored does NOT bump exploredRevision.
  sim.visible[0]=0;
  updateFogTexture(view);
  assert.equal(view.exploredRevision,1,'visibility change within explored territory keeps exploredRevision stable');
  // Exploring a brand-new cell bumps exploredRevision.
  sim.explored[5]=1;
  updateFogTexture(view);
  assert.equal(view.exploredRevision,2,'exploring a new cell increments exploredRevision');

  const tree={id:77,kind:'resource',type:'wood',x:2,z:2,hp:1,amount:10};
  assert.equal(takeFromResource(sim,tree,10),true);
  assert.equal(sim.resourceRevision,1,'depleting a resource increments resourceRevision');
  sim.isVisible=()=>true;
  revealResourceChanges(sim);
  assert.equal(sim.resourceRevision,2,'revealing a fog-depleted resource increments resourceRevision');
});

test('pruneFootPlacements uses O(1) sim.get fast path without scanning sim.entities',()=>{
  let entityScans=0;
  const sim={
    get entities(){entityScans++;return [];},
    get:id=>id===1?{id:1,hp:40}:null,
  };
  const view={footPoses:new Map([[1,{x:0,z:0}],[2,{x:5,z:5}]])};
  pruneFootPlacements(view,sim);
  assert.equal(entityScans,0);
  assert.equal(view.footPoses.has(1),true);
  assert.equal(view.footPoses.has(2),false);
});

test('Simulation shrine shortlist, custom victory, and visibility remain exact',()=>{
  const sim=new Simulation({mode:'dominion',map:'highlands',seed:42});
  const shrines=sim.candidatesFor('shrine');
  assert.ok(shrines.length>0,'dominion map populates shrine shortlist');
  assert.equal(shrines.length,sim.entities.filter(e=>e.kind==='shrine').length);
  sim.tick(0.1);
  assert.ok(sim.fogRevision>0);

  const custom=new Simulation({mode:'custom',map:'highlands',mapSize:'small',seed:77,slots:battlePreset('1v1')});
  custom.checkVictory();
  assert.equal(custom.ended,null);
});
