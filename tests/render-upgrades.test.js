import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as THREE from 'three';
import {WorldView} from '../src/world.js';
import {DayNightLighting} from '../src/day-night.js';
import {WeatherRenderer} from '../src/weather.js';
import {shadeBattlefieldFog} from '../src/fog-surface.js';
import {configureWaterSurface,animateWaterSurface} from '../src/water-surface.js';
import {buildingSiteKey} from '../src/ground-cover.js';
import {installNodeRuntime} from '../src/render-runtime.js';
import {MeshStandardNodeMaterial,battlefieldFog,grassWind,water,unitPalette,structurePalette} from '../src/render-nodes.js';

test('HUD health layer stays strictly behind objectives and HUD panels in DOM and CSS',()=>{
  const mainSource=fs.readFileSync(new URL('../src/main.js',import.meta.url),'utf8');
  const styleSource=fs.readFileSync(new URL('../src/style.css',import.meta.url),'utf8');
  const designSource=fs.readFileSync(new URL('../src/interface-design.css',import.meta.url),'utf8');
  const healthIdx=mainSource.indexOf('<div id="health-layer"></div>');
  const objectivesIdx=mainSource.indexOf('<aside id="objectives"');
  const bottomHudIdx=mainSource.indexOf('<div class="bottom-hud">');
  assert.ok(healthIdx>0&&objectivesIdx>healthIdx&&bottomHudIdx>healthIdx,'#health-layer precedes objectives and bottom HUD in DOM');
  assert.match(designSource,/#health-layer\{[^}]*z-index:0/);
  assert.match(styleSource,/\.objective-panel\{[^}]*z-index:8/);
  assert.match(styleSource,/#alert-line\{[^}]*z-index:8/);
});

test('WorldView.project reuses scratch vector and respects pre-read rect without reflows',()=>{
  let rectCalls=0;
  const camera=new THREE.PerspectiveCamera(45,16/9,1,200);
  camera.position.set(0,30,30);camera.lookAt(0,0,0);camera.updateMatrixWorld();
  const fakeView={
    camera,
    entityHeight:()=>0,
    renderer:{domElement:{getBoundingClientRect(){rectCalls++;return {left:0,top:0,width:1000,height:500};}}},
  };
  const rect={left:10,top:20,width:1200,height:600};
  const entity={kind:'unit',type:'villager',x:0,z:0};
  const a=WorldView.prototype.project.call(fakeView,entity,rect);
  const vec=fakeView.projectVec;
  const b=WorldView.prototype.project.call(fakeView,entity,rect);
  assert.equal(rectCalls,0,'passing cached rect avoids calling getBoundingClientRect');
  assert.equal(fakeView.projectVec,vec,'project reuses a single scratch Vector3');
  assert.deepEqual(a,b);
  assert.equal(a.visible,true);
});

test('DayNightLighting reuses scratch snapshots across frames with zero object churn',()=>{
  const v={
    settings:{lighting:'night'},sim:{time:0},
    scene:{background:new THREE.Color(0xa5b4ad),fog:{color:new THREE.Color()},environmentIntensity:.3},
    hemi:{groundColor:new THREE.Color(0x52633a),color:new THREE.Color(0xc7def1),intensity:.9},
    sun:{color:new THREE.Color(0xffe4bd),intensity:2.7},renderer:{toneMappingExposure:1.1},
    fogTint:new THREE.Color(0x13201e),
    materials:{structurePalette:{frontierUniforms:{night:{value:0}}}},
  };
  const lighting=new DayNightLighting(v);
  const {frameBase,written,currentSnap}=lighting;
  for(let i=0;i<30;i++)lighting.update(.016);
  assert.equal(lighting.frameBase,frameBase);
  assert.equal(lighting.written,written);
  assert.equal(lighting.currentSnap,currentSnap);
  lighting.dispose();
  assert.equal(lighting.hasWritten,false);
});

test('WeatherRenderer skips clear-sky cloud uploads and resolves integer roof heights',()=>{
  const view={
    sim:{options:{seed:7,map:'highlands'},time:0,revision:1,entities:[{id:1,kind:'building',owner:0,x:6,z:-9,r:3,hp:200,progress:1}],isWater:()=>false,isVisible:()=>true},
    settings:{quality:'high',weather:'clear',lighting:'day',fog:true},
    scene:Object.assign(new THREE.Scene(),{background:new THREE.Color(0xa5b4ad),fog:new THREE.Fog(0xa5b4ad,100,220),environmentIntensity:.3}),
    sun:new THREE.DirectionalLight(0xffe4bd,2.7),
    hemi:new THREE.HemisphereLight(0xc7def1,0x52633a,.9),
    camera:new THREE.PerspectiveCamera(45,16/9,1,200),
    target:new THREE.Vector3(),
    zoom:40,
    dynamicScale:1,
    groundSurface:{material:new THREE.MeshStandardMaterial({color:0xffffff})},
    renderer:{toneMappingExposure:1.1},
    fogTint:new THREE.Color(0x13201e),
    materials:{},
    groundHeight:()=>0,
    entityHeight:()=>1,
  };
  const weather=new WeatherRenderer(view);
  weather.update(.016,false);
  const cloudVersion=weather.clouds.instanceMatrix.version;
  for(let i=0;i<10;i++)weather.update(.016,false);
  assert.equal(weather.clouds.count,0);
  assert.equal(weather.clouds.instanceMatrix.version,cloudVersion,'clear skies never re-upload empty cloud matrices');
  weather.updateRoofs();
  assert.ok(weather.surface(6,-9)>4,'building roof height is resolved via integer cell keys');
  assert.equal(weather.surface(60,60),0);
  weather.dispose();
  view.groundSurface.material.dispose();
});

test('5-tap fog smoothing, analytical water glint, metallic sheen and grass wind work on WebGL2 and WebGPU nodes',()=>{
  const fogMask=new THREE.DataTexture(new Uint8Array([0,0,0,255]),1,1);
  const fog={mask:{value:fogMask},scale:{value:1/160},enabled:{value:1},tint:{value:new THREE.Color(0x13201e)}};
  const glMat=new THREE.MeshStandardMaterial();
  shadeBattlefieldFog(glMat,{battleFog:fog});
  const fogShader={uniforms:{},vertexShader:THREE.ShaderLib.standard.vertexShader,fragmentShader:THREE.ShaderLib.standard.fragmentShader};
  glMat.onBeforeCompile(fogShader);
  assert.equal((fogShader.fragmentShader.match(/texture2D\(frontierFogMask,/g)||[]).length,5,'WebGL2 fog uses 5 rotated taps');
  assert.match(glMat.customProgramCacheKey(),/:battlefield-fog-v2$/);

  const waterMat=new THREE.MeshStandardMaterial({color:0x6a9fa6,transparent:true,opacity:.85});
  configureWaterSurface(waterMat);
  const waterShader={uniforms:{},vertexShader:THREE.ShaderLib.standard.vertexShader,fragmentShader:THREE.ShaderLib.standard.fragmentShader};
  waterMat.onBeforeCompile(waterShader);
  assert.equal(waterShader.uniforms.frontierWaterSunDir,waterMat.frontierWaterSunDir);
  assert.equal(waterShader.uniforms.frontierWaterSunColor,waterMat.frontierWaterSunColor);
  assert.match(waterShader.fragmentShader,/frontierGlint/);
  const sun=new THREE.DirectionalLight(0xffeedd,2.7);sun.position.set(10,20,0);sun.target.position.set(0,0,0);
  animateWaterSurface({materials:{water:waterMat},settings:{quality:'high'},clock:1,scene:{background:new THREE.Color(0xaabbcc)},sun,hemi:{intensity:.9},waterMeshes:[{}]});
  assert.ok(Math.abs(waterMat.frontierWaterSunDir.value.length()-1)<1e-6);
  assert.ok(waterMat.frontierWaterSunColor.value.equals(sun.color));

  assert.equal(typeof buildingSiteKey(12,-18),'number');
  assert.notEqual(buildingSiteKey(12,-18),buildingSiteKey(32,-18));

  const tex=new THREE.DataTexture(new Uint8Array([128,128,255,255]),1,1);
  installNodeRuntime({battlefieldFog,grassWind,water,unitPalette,structurePalette,MeshStandardNodeMaterial});
  try{
    const nodeFog=new MeshStandardNodeMaterial();
    shadeBattlefieldFog(nodeFog,{battleFog:fog});
    assert.ok(nodeFog.outputNode,'WebGPU 5-tap fog sets outputNode');

    const nodeGrass=new MeshStandardNodeMaterial();
    grassWind(nodeGrass,{time:{value:1},strength:{value:.06}});
    assert.ok(nodeGrass.positionNode,'WebGPU grass wind sets positionNode');

    const nodeWater=new MeshStandardNodeMaterial({color:0x6a9fa6,transparent:true,opacity:.85});
    configureWaterSurface(nodeWater);
    assert.ok(nodeWater.outputNode&&nodeWater.frontierWaterSunDir&&nodeWater.frontierWaterSunColor);

    const nodeUnit=new MeshStandardNodeMaterial();
    unitPalette(nodeUnit,{
      wood:{value:null},teams:{value:Array.from({length:8},()=>new THREE.Color(0x397f8c))},
      roofs:{value:Array.from({length:8},()=>new THREE.Color(0x5a6c66))},
      characterColor:{value:tex},characterNormal:{value:tex},characterReady:{value:1},characterDetail:{value:1},
    });
    assert.ok(nodeUnit.outputNode,'WebGPU unitPalette attaches metallic sky-sheen outputNode');

    const nodeStruct=new MeshStandardNodeMaterial();
    structurePalette(nodeStruct,{
      wood:{value:tex},stone:{value:tex},plaster:{value:tex},roof:{value:tex},
      woodNormal:{value:tex},stoneNormal:{value:tex},plasterNormal:{value:tex},
      woodArm:{value:tex},stoneArm:{value:tex},plasterArm:{value:tex},
      normalAvailable:{value:new THREE.Vector3(1,1,1)},armAvailable:{value:new THREE.Vector3(1,1,1)},
      detail:{value:2},night:{value:0},snow:{value:0},
    });
    assert.ok(nodeStruct.outputNode,'WebGPU structurePalette attaches metallic sky-sheen outputNode');
    for(const m of [nodeFog,nodeGrass,nodeWater,nodeUnit,nodeStruct])m.dispose();
  }finally{
    installNodeRuntime(null);
    fogMask.dispose();tex.dispose();glMat.dispose();waterMat.dispose();
  }
});
