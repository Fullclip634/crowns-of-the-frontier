import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {biomeAtmosphere,biomeAtmosphereKey,createSkyDome,updateSkyDome,disposeSkyDome} from '../src/sky-atmosphere.js';
import {MeshStandardNodeMaterial,MeshBasicNodeMaterial,terrain,unitPalette,structurePalette,water,skyDome} from '../src/render-nodes.js';
import {installNodeRuntime} from '../src/render-runtime.js';
import {shaderPreview} from '../src/shader-preparation.js';
import {Landscape} from '../src/landscape.js';
import {applyTerrainShading} from '../src/terrain-surface.js';
import {configureWaterSurface} from '../src/water-surface.js';

test('biomeAtmosphere assigns distinct palettes for winter, arid, volcanic, coastal and temperate biomes',()=>{
  assert.equal(biomeAtmosphereKey('winter'),'winter');
  assert.equal(biomeAtmosphereKey('tundra'),'winter');
  assert.equal(biomeAtmosphereKey('arid'),'arid');
  assert.equal(biomeAtmosphereKey('volcanic'),'volcanic');
  assert.equal(biomeAtmosphereKey('archipelago'),'coastal');
  assert.equal(biomeAtmosphereKey('coast'),'coastal');
  assert.equal(biomeAtmosphereKey('highlands'),'temperate');
  const winter=biomeAtmosphere('winter'),volcanic=biomeAtmosphere('volcanic'),arid=biomeAtmosphere('arid');
  assert.notEqual(winter.skyHex,volcanic.skyHex);
  assert.notEqual(arid.zenithHex,volcanic.zenithHex);
});

test('createSkyDome and updateSkyDome track camera, horizon fog color, weather clouds and night transition',()=>{
  const scene=new THREE.Scene();scene.background=new THREE.Color(0xa4b9c2);
  const camera=new THREE.PerspectiveCamera(46,16/9,.5,500);camera.position.set(18,24,-12);
  const sun=new THREE.DirectionalLight(0xffe4bd,2.7);sun.position.set(-40,70,25);sun.target.position.set(8,0,-7);
  const view={scene,camera,sun,sim:{options:{map:'arid'}},weather:{cloudiness:0},lightingState:{night:0}};
  const dome=createSkyDome(view);
  assert.equal(dome.material.side,THREE.BackSide);assert.equal(dome.material.depthWrite,false);assert.equal(dome.material.fog,false);
  assert.equal(createSkyDome(view),dome,'reuses existing sky dome');

  updateSkyDome(view);
  assert.deepEqual(dome.position.toArray(),[18,24,-12]);
  assert.equal(dome.scale.x,425);
  const u=dome.material.frontierSkyUniforms;
  assert.ok(u.horizon.value.equals(scene.background));
  const dayZenith=u.zenith.value.clone();
  const expectedDir=new THREE.Vector3(-48,70,32).normalize();
  assert.ok(u.sunDir.value.distanceTo(expectedDir)<1e-6);

  scene.background.setHex(0x142540);view.lightingState.night=1;view.weather.cloudiness=.8;
  updateSkyDome(view);
  assert.equal(u.night.value,1);assert.equal(u.clouds.value,.8);
  assert.ok(u.zenith.value.getHSL({}).l<dayZenith.getHSL({}).l,'night sky darkens the zenith');

  disposeSkyDome(view);
  assert.equal(view.skyDome,null);assert.equal(scene.children.length,0);
});

test('node materials maintain WebGPU/WebGL2 shader parity hooks and clear disabled quality nodes',()=>{
  const original=globalThis.document,context={fillRect(){},beginPath(){},moveTo(){},lineTo(){},stroke(){}};
  globalThis.document={createElement:()=>({getContext:()=>context})};
  const tex=()=>new THREE.DataTexture(new Uint8Array([128,128,255,255]),1,1);
  const surfaces=Object.fromEntries(['grass','soil','rock'].map(role=>[role,Object.fromEntries(['color','normal','arm'].map(kind=>[kind,tex()]))]));
  const nodeMat=new MeshStandardNodeMaterial(),land=new Landscape(512,'highlands');
  try{
    const uniforms={
      grass:{value:surfaces.grass.color},soil:{value:surfaces.soil.color},rock:{value:surfaces.rock.color},
      grassNormal:{value:surfaces.grass.normal},soilNormal:{value:surfaces.soil.normal},rockNormal:{value:surfaces.rock.normal},
      grassArm:{value:surfaces.grass.arm},soilArm:{value:surfaces.soil.arm},rockArm:{value:surfaces.rock.arm},
      scale:{value:new THREE.Vector3(100,120,2)},amount:{value:1},tint:{value:new THREE.Color(0xe2e7da)},
      grassTint:{value:new THREE.Color(0x94c58b)},macroReference:{value:new THREE.Color(0x5b874f)},macroStrength:{value:1},
      cliffTint:{value:new THREE.Color(0x82847b)},roads:{value:tex()},
    };
    terrain(nodeMat,uniforms);
    assert.ok(nodeMat.colorNode&&nodeMat.normalNode&&nodeMat.roughnessNode);
    uniforms.grassNormal.value=null;uniforms.grassArm.value=null;
    terrain(nodeMat,uniforms);
    assert.equal(nodeMat.normalNode,null);assert.equal(nodeMat.roughnessNode,null);

    const basic=new MeshBasicNodeMaterial({side:THREE.BackSide,depthWrite:false,fog:false});
    skyDome(basic,{horizon:{value:new THREE.Color(0xa4b9c2)},zenith:{value:new THREE.Color(0x3b6c9e)},sunDir:{value:new THREE.Vector3(-1,1,1)},sunColor:{value:new THREE.Color(0xffe4bd)},night:{value:0},clouds:{value:0}});
    const scene=new THREE.Scene();scene.add(new THREE.Mesh(new THREE.BoxGeometry(),basic));
    const preview=shaderPreview(scene),copy=preview.materials.get(basic);
    assert.equal(copy.colorNode,basic.colorNode);assert.equal(copy.side,THREE.BackSide);
    preview.dispose();basic.dispose();

    installNodeRuntime({water,terrain,unitPalette,structurePalette,skyDome,MeshStandardNodeMaterial,MeshBasicNodeMaterial});
    const waterMat=new MeshStandardNodeMaterial({color:0x6a9fa6,transparent:true,opacity:.85});
    configureWaterSurface(waterMat);
    assert.ok(waterMat.positionNode&&waterMat.colorNode&&waterMat.opacityNode&&waterMat.normalNode&&waterMat.outputNode);
    waterMat.dispose();

    const unitMat=new MeshStandardNodeMaterial();
    unitPalette(unitMat,{
      wood:{value:null},teams:{value:Array.from({length:8},()=>new THREE.Color(0x397f8c))},
      roofs:{value:Array.from({length:8},()=>new THREE.Color(0x5a6c66))},
      characterColor:{value:tex()},characterNormal:{value:tex()},characterReady:{value:1},characterDetail:{value:1},
    });
    assert.ok(unitMat.colorNode&&unitMat.roughnessNode&&unitMat.metalnessNode&&unitMat.normalNode);
    unitMat.dispose();

    const structMat=new MeshStandardNodeMaterial();
    structurePalette(structMat,{
      wood:{value:tex()},stone:{value:tex()},plaster:{value:tex()},roof:{value:tex()},
      woodNormal:{value:tex()},stoneNormal:{value:tex()},plasterNormal:{value:tex()},
      woodArm:{value:tex()},stoneArm:{value:tex()},plasterArm:{value:tex()},
      normalAvailable:{value:new THREE.Vector3(1,1,1)},armAvailable:{value:new THREE.Vector3(1,1,1)},
      detail:{value:2},night:{value:1},
    });
    assert.ok(structMat.colorNode&&structMat.roughnessNode&&structMat.aoNode&&structMat.normalNode&&structMat.emissiveNode);
    structMat.dispose();
  }finally{
    installNodeRuntime(null);
    globalThis.document=original;
    nodeMat.dispose();
    for(const maps of Object.values(surfaces))for(const t of Object.values(maps))t.dispose();
  }
});
