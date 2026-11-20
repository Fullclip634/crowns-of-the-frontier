import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as THREE from 'three';
import {createCloudShadowTexture,createAtmosphereUniforms,applyAnalyticIblToMaterial} from '../src/atmosphere-uniforms.js';
import {applyBiomeAtmosphere,biomeAtmosphere} from '../src/sky-atmosphere.js';
import {WeatherRenderer} from '../src/weather.js';
import {NightAtmosphere} from '../src/night-atmosphere.js';
import {applyTerrainShading} from '../src/terrain-surface.js';
import {Landscape} from '../src/landscape.js';
import {installNodeRuntime} from '../src/render-runtime.js';
import {MeshStandardNodeMaterial,terrain,unitPalette,structurePalette,createBloomPipeline} from '../src/render-nodes.js';

test('WorldView uses native Three.js AgXToneMapping and creates shared atmosphere uniforms',()=>{
  const source=fs.readFileSync(new URL('../src/world.js',import.meta.url),'utf8');
  assert.match(source,/toneMapping=THREE\.AgXToneMapping/);
  assert.match(source,/atmosphereUniforms=createAtmosphereUniforms\(\)/);
});

test('cloud shadow DataTexture is seamless across tile edges with organic contrast',()=>{
  const size=64,tex=createCloudShadowTexture(size),data=tex.image.data;
  let min=255,max=0,edgeDiffX=0,edgeDiffY=0;
  for(let y=0;y<size;y++){
    edgeDiffX+=Math.abs(data[(y*size+0)*4]-data[(y*size+(size-1))*4]);
    for(let x=0;x<size;x++){
      const v=data[(y*size+x)*4];
      if(v<min)min=v;if(v>max)max=v;
    }
  }
  for(let x=0;x<size;x++){
    edgeDiffY+=Math.abs(data[x*4]-data[((size-1)*size+x)*4]);
  }
  assert.ok(max-min>120,`cloud texture spans sunlit and shaded values (${min}..${max})`);
  assert.ok(edgeDiffX/size<20,`horizontal tile wrap is seamless (avg diff ${(edgeDiffX/size).toFixed(1)})`);
  assert.ok(edgeDiffY/size<20,`vertical tile wrap is seamless (avg diff ${(edgeDiffY/size).toFixed(1)})`);
  tex.dispose();
});

test('applyBiomeAtmosphere synchronizes analytic IBL uniforms per biome',()=>{
  const scene=new THREE.Scene();scene.background=new THREE.Color();scene.fog=new THREE.Fog();
  const sun=new THREE.DirectionalLight();sun.position.set(-48,62,32);sun.target.position.set(0,0,0);
  const view={scene,sun,hemi:new THREE.HemisphereLight(),renderer:{},sim:{options:{map:'highlands'}}};
  applyBiomeAtmosphere(view);
  assert.ok(view.atmosphereUniforms,'creates shared atmosphere uniforms');
  const tempSky=view.atmosphereUniforms.iblSky.value.getHex();
  assert.equal(tempSky,biomeAtmosphere('highlands').iblSkyHex);
  view.sim.options.map='volcanic';
  applyBiomeAtmosphere(view);
  assert.equal(view.atmosphereUniforms.iblSky.value.getHex(),biomeAtmosphere('volcanic').iblSkyHex);
  assert.notEqual(view.atmosphereUniforms.iblSky.value.getHex(),tempSky);
});

test('WeatherRenderer uses lightweight crossed rain streaks, 2-tri splash discs, smooth wetness and NightAtmosphere',()=>{
  const view={
    sim:{options:{seed:11,map:'highlands'},time:10,revision:1,entities:[
      {id:1,kind:'building',type:'towncenter',owner:0,x:0,z:0,r:3.6,hp:800,maxHp:800,progress:1},
      {id:2,kind:'building',type:'blacksmith',owner:0,x:8,z:4,r:2.6,hp:400,maxHp:400,progress:1},
    ],isWater:()=>false,isVisible:()=>true},
    settings:{quality:'high',weather:'storm',lighting:'night',fog:true},
    scene:Object.assign(new THREE.Scene(),{background:new THREE.Color(0xa9bec8),fog:new THREE.Fog(0xa9bec8,100,220),environmentIntensity:.48}),
    sun:new THREE.DirectionalLight(0xffe7c4,3.2),
    hemi:new THREE.HemisphereLight(0xd5e8f8,0x7c8a62,1.4),
    camera:new THREE.PerspectiveCamera(46,16/9,.5,300),
    target:new THREE.Vector3(0,0,0),
    zoom:44,dynamicScale:1,
    groundSurface:{material:new THREE.MeshStandardMaterial({color:0xffffff})},
    renderer:{toneMappingExposure:1.12},
    fogTint:new THREE.Color(0x13201e),
    materials:{},
    groundHeight:()=>0,entityHeight:()=>0,
  };
  view.camera.position.set(0,30,35);view.camera.lookAt(0,0,0);view.camera.updateMatrixWorld();
  const forge=new THREE.Group();
  forge.position.set(8,2,4);forge.userData.chimneyOutlet=new THREE.Vector3(-.8,6,-.4);
  view.nodes=new Map([[2,forge]]);
  const weather=new WeatherRenderer(view);
  const rainTris=(weather.rain.geometry.index?weather.rain.geometry.index.count:weather.rain.geometry.attributes.position.count)/3;
  const rippleTris=(weather.ripples.geometry.index?weather.ripples.geometry.index.count:weather.ripples.geometry.attributes.position.count)/3;
  assert.equal(rainTris,4,'crossed-quad rain streak costs 4 triangles per drop');
  assert.equal(rippleTris,2,'soft splash disc costs 2 triangles per ripple');

  for(let i=0;i<20;i++){view.sim.time+=.25;weather.update(.25,false);}
  assert.ok(weather.wetness>.5,'rain storm ramps surface wetness');
  assert.equal(view.atmosphereUniforms.wetness.value,weather.wetness);
  assert.ok(view.atmosphereUniforms.cloudOffset.value.length()>0,'cloud shadows drift over time');
  assert.equal(weather.nightAtmosphere.groundGlows.count,2,'night ground glows illuminate both completed buildings');
  assert.equal(weather.nightAtmosphere.chimneySmoke.count,4,'only the building with a chimney emits hearth smoke');
  assert.ok(weather.nightAtmosphere.hearthSparks.count===2,'the forge emits a few sparks at night');
  assert.equal(view.weatherDiagnostics.hearthSparks,weather.nightAtmosphere.hearthSparks.count);

  view.settings.weather='clear';view.settings.lighting='day';
  const peakWet=weather.wetness;
  for(let i=0;i<12;i++){view.sim.time+=.5;weather.update(.5,false);}
  assert.ok(weather.wetness<peakWet,'surfaces gradually dry when clear weather returns');
  assert.equal(weather.nightAtmosphere.groundGlows.count,0,'daytime healthy buildings do not emit night glow');

  weather.dispose();
  view.groundSurface.material.dispose();
});

test('terrain, standalone IBL materials and WebGPU nodes compose cloud shadows and analytic IBL without errors',()=>{
  const original=globalThis.document,context={fillRect(){},beginPath(){},moveTo(){},lineTo(){},stroke(){}};
  globalThis.document={createElement:()=>({getContext:()=>context})};
  const tex=()=>new THREE.DataTexture(new Uint8Array([128,128,255,255]),1,1);
  const surfaces=Object.fromEntries(['grass','soil','rock'].map(role=>[role,Object.fromEntries(['color','normal','arm'].map(kind=>[kind,tex()]))]));
  const atm=createAtmosphereUniforms();
  try{
    const glTerrain=new THREE.MeshStandardMaterial(),land=new Landscape(512,'highlands');
    applyTerrainShading(glTerrain,land,'high',surfaces,{},atm);
    const shader={uniforms:{},vertexShader:THREE.ShaderLib.standard.vertexShader,fragmentShader:THREE.ShaderLib.standard.fragmentShader};
    glTerrain.onBeforeCompile(shader);
    assert.match(shader.fragmentShader,/frontierCloudLight/);
    assert.equal(shader.uniforms.frontierTerrainwetness,atm.wetness);
    for(const t of glTerrain.frontierOwnedTextures||[])t.dispose();
    glTerrain.dispose();

    const oreMat=applyAnalyticIblToMaterial(new THREE.MeshStandardMaterial({metalness:.8,roughness:.25}),atm);
    const oreShader={uniforms:{},vertexShader:THREE.ShaderLib.standard.vertexShader,fragmentShader:THREE.ShaderLib.standard.fragmentShader};
    oreMat.onBeforeCompile(oreShader);
    assert.match(oreShader.fragmentShader,/frontierAnalyticIbl/);
    assert.equal(oreShader.uniforms.frontierIblIntensity,atm.iblIntensity);
    oreMat.dispose();

    installNodeRuntime({terrain,unitPalette,structurePalette,createBloomPipeline,MeshStandardNodeMaterial});
    const nodeTerrain=new MeshStandardNodeMaterial();
    applyTerrainShading(nodeTerrain,land,'high',surfaces,{},atm);
    assert.ok(nodeTerrain.colorNode&&nodeTerrain.roughnessNode&&nodeTerrain.normalNode);
    for(const t of nodeTerrain.frontierOwnedTextures||[])t.dispose();
    nodeTerrain.dispose();

    const nodeUnit=new MeshStandardNodeMaterial();
    unitPalette(nodeUnit,{
      wood:{value:null},teams:{value:Array.from({length:8},()=>new THREE.Color(0x397f8c))},
      roofs:{value:Array.from({length:8},()=>new THREE.Color(0x5a6c66))},
      characterColor:{value:tex()},characterNormal:{value:tex()},characterReady:{value:1},characterDetail:{value:1},
      atmosphere:atm,
    });
    assert.ok(nodeUnit.outputNode);
    nodeUnit.dispose();

    const nodeStruct=new MeshStandardNodeMaterial();
    structurePalette(nodeStruct,{
      wood:{value:tex()},stone:{value:tex()},plaster:{value:tex()},roof:{value:tex()},
      woodNormal:{value:tex()},stoneNormal:{value:tex()},plasterNormal:{value:tex()},
      woodArm:{value:tex()},stoneArm:{value:tex()},plasterArm:{value:tex()},
      normalAvailable:{value:new THREE.Vector3(1,1,1)},armAvailable:{value:new THREE.Vector3(1,1,1)},
      detail:{value:2},night:{value:1},snow:{value:0},atmosphere:atm,
    });
    assert.ok(nodeStruct.outputNode&&nodeStruct.emissiveNode);
    nodeStruct.dispose();
  }finally{
    installNodeRuntime(null);
    globalThis.document=original;
    for(const maps of Object.values(surfaces))for(const t of Object.values(maps))t.dispose();
  }
});

test('NightAtmosphere illuminates burning buildings during daylight and disposes cleanly',()=>{
  const group=new THREE.Group();
  const view={
    sim:{options:{spectator:false},entities:[
      {id:9,kind:'building',type:'house',owner:0,x:2,z:2,r:2.2,hp:80,maxHp:300,progress:1},
    ],isVisible:()=>true},
    settings:{quality:'medium',fog:true},
    camera:new THREE.PerspectiveCamera(46,16/9,.5,200),
    groundHeight:()=>0,
  };
  view.camera.position.set(2,25,25);view.camera.lookAt(2,0,2);view.camera.updateMatrixWorld();
  const house=new THREE.Group();
  house.position.set(2,3,2);house.userData.chimneyOutlet=new THREE.Vector3(-.5,4,-.5);
  view.nodes=new Map([[9,house]]);
  const atm=new NightAtmosphere(view,group);
  atm.update(1,0,1,.5,false);
  assert.equal(atm.groundGlows.count,1,'burning building gets warm firelight pool even during daytime');
  assert.equal(atm.chimneySmoke.count,0,'damage smoke replaces the normal chimney wisps');
  view.sim.entities[0].hp=300;
  atm.update(1,0,1,.5,false);
  assert.equal(atm.groundGlows.count,0);
  assert.equal(atm.hearthSparks.count,0);
  assert.equal(atm.chimneySmoke.count,2);
  const matrix=new THREE.Matrix4();
  atm.chimneySmoke.getMatrixAt(0,matrix);
  const position=new THREE.Vector3().setFromMatrixPosition(matrix);
  assert.ok(position.y>=7&&position.y<=9.8,'smoke begins at the visible chimney outlet above the foundation');
  view.settings.reducedMotion=true;
  atm.update(1,0,1,.5,false);
  assert.equal(atm.chimneySmoke.count,0);
  atm.dispose();
  assert.equal(group.children.length,0);
});
