import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {Simulation} from '../src/simulation.js';
import {Landscape,buildLandscape} from '../src/landscape.js';
import {applyTerrainShading} from '../src/terrain-surface.js';
import {terrain,MeshStandardNodeMaterial} from '../src/render-nodes.js';
import {TerrainDetails,pebbleGeometry} from '../src/terrain-details.js';
import {GroundCover,grassTuftGeometry,tuftBlades} from '../src/ground-cover.js';

function fakeSurfaceMap(){
  const tex=new THREE.DataTexture(new Uint8Array([128,128,128,255]),1,1);
  tex.needsUpdate=true;
  return tex;
}

function fakeSurfaces({withNormal=true,withArm=true}={}){
  const makeRole=()=>{
    const color=fakeSurfaceMap();
    return {
      ready:true,
      color,
      normal:withNormal?fakeSurfaceMap():null,
      arm:withArm?fakeSurfaceMap():null
    };
  };
  return {grass:makeRole(),soil:makeRole(),stone:makeRole(),rock:makeRole(),boulder:makeRole()};
}

function installCanvasSpy(rich=true){
  const prevDoc=globalThis.document;
  const prevPath=globalThis.Path2D;
  const prevImageData=globalThis.ImageData;
  const draws=[];
  globalThis.Path2D=class Path2D{lineTo(){}};
  globalThis.ImageData=class ImageData{
    constructor(a,b,c){
      if(a instanceof Uint8ClampedArray){this.data=a;this.width=b;this.height=c??b;}
      else{this.width=a;this.height=b??a;this.data=new Uint8ClampedArray(this.width*this.height*4);}
    }
  };
  globalThis.document={
    createElement(tag){
      if(tag!=='canvas')return {};
      const canvas={width:0,height:0};
      const ctx={
        fillStyle:'',
        strokeStyle:'',
        lineWidth:0,
        lineCap:'',
        lineJoin:'',
        globalCompositeOperation:'source-over',
        fillRect(){},
        beginPath(){},
        moveTo(){},
        lineTo(){},
        ellipse(){},
        save(){},
        restore(){},
        translate(){},
        rotate(){},
        drawImage(){},
        putImageData(){},
        createImageData:(w,h)=>({data:new Uint8ClampedArray(w*h*4),width:w,height:h}),
        stroke(){draws.push({op:'stroke',style:this.strokeStyle,width:this.lineWidth,canvasWidth:canvas.width});},
        fill(){draws.push({op:'fill',style:this.fillStyle,canvasWidth:canvas.width});}
      };
      if(rich){
        ctx.arc=(x,y,r)=>draws.push({op:'arc',x,y,r,style:ctx.fillStyle});
        ctx.createRadialGradient=()=>({addColorStop(){}});
      }
      canvas.getContext=()=>ctx;
      return canvas;
    }
  };
  return {
    draws,
    restore(){
      if(prevDoc===undefined)delete globalThis.document;else globalThis.document=prevDoc;
      if(prevPath===undefined)delete globalThis.Path2D;else globalThis.Path2D=prevPath;
      if(prevImageData===undefined)delete globalThis.ImageData;else globalThis.ImageData=prevImageData;
    }
  };
}

function makeMockView(land,quality='high',sim={entities:[]}){
  const view={
    landscape:land,
    sim,
    settings:{quality,fog:false},
    terrain:new THREE.Group(),
    bridges:[],
    fogMesh:new THREE.Mesh(new THREE.PlaneGeometry(1,1),new THREE.MeshBasicMaterial()),
    materials:{
      water:new THREE.MeshStandardMaterial(),
      rock:new THREE.MeshStandardMaterial(),
      stone:new THREE.MeshStandardMaterial(),
      ground:new THREE.MeshStandardMaterial(),
      bridge:new THREE.MeshStandardMaterial()
    },
    target:new THREE.Vector3(),
    zoom:45,
    angle:0,
    tilt:1,
    clock:0,
    terrainDiagnostics:null,
    dispose(){
      this.terrain.traverse(o=>{o.geometry?.dispose?.();o.material?.dispose?.();});
      this.fogMesh.geometry.dispose();
      this.fogMesh.material.dispose();
    }
  };
  return view;
}

test('buildLandscape populates terrainSites and roadMask uses 1024px rich R/G/B with pure shorelines',()=>{
  const sim=new Simulation({mode:'sandbox',map:'meadows',seed:512});
  const land=new Landscape(512,'meadows');
  const richSpy=installCanvasSpy(true);
  const view=makeMockView(land,'high',sim);
  const riverLand=new Landscape(512,'rivers');
  try{
    buildLandscape(view);
    assert.ok(land.terrainSites,'buildLandscape collects terrainSites for ground detailing');
    assert.ok(land.terrainSites.trees.length>0);
    assert.ok(land.terrainSites.quarries.length>0);
    assert.ok(land.terrainSites.buildings.length>0);
    riverLand.terrainSites=land.terrainSites;

    const mat=new THREE.MeshStandardMaterial();
    applyTerrainShading(mat,riverLand,'high',fakeSurfaces(),{grass:2,soil:1.3,rock:90,stone:2,cliff:3.9});
    const fakeShader={
      uniforms:{},
      vertexShader:'#include <color_vertex>\n#include <worldpos_vertex>',
      fragmentShader:'#include <map_fragment>\n#include <roughnessmap_fragment>\n#include <normal_fragment_maps>'
    };
    mat.onBeforeCompile(fakeShader);
    assert.equal(richSpy.draws.some(d=>d.canvasWidth===1024),true);
    assert.equal(richSpy.draws.some(d=>d.op==='stroke'&&d.style==='rgba(255,0,0,.95)'),true,'dual wheel ruts are painted into R');
    assert.equal(richSpy.draws.some(d=>d.op==='stroke'&&d.style==='rgba(0,0,255,.95)'),true,'water shorelines are painted into B');
    assert.equal(richSpy.draws.some(d=>d.op==='fill'&&d.style==='rgba(0,0,90,.28)'),false,'trees do not pollute wet shoreline B channel');
    assert.equal(richSpy.draws.some(d=>d.op==='fill'&&typeof d.style==='object'),true,'soft radial plaza and quarry aprons are drawn');
    assert.ok(fakeShader.fragmentShader.includes('frontierActive'),'active-only layer mask prevents inactive weight clipping');
    assert.ok(fakeShader.fragmentShader.includes('frontierUvCliff'),'side-projected cliff UVs are injected');
    assert.equal(fakeShader.fragmentShader.includes('frontierQuarryRock'),false,'riverbank B channel does not project cliff rock');
    assert.ok(fakeShader.uniforms.frontierTerrainscale.value.z>=riverLand.renderSize/10-1e-6,'oversized 90m rock tiling is clamped to <=10m');
    assert.ok(fakeShader.uniforms.frontierTerraindetailScale.value.x>0);
    assert.ok(fakeShader.uniforms.frontierTerraindetailScale.value.y>0);
    mat.dispose();
  }finally{
    view.dispose();
    richSpy.restore();
  }

  const simpleSpy=installCanvasSpy(false);
  try{
    const mat=new THREE.MeshStandardMaterial();
    applyTerrainShading(mat,riverLand,'low',fakeSurfaces({withNormal:false,withArm:false}),{grass:2,soil:1.3,rock:7.5,stone:2,cliff:3.9});
    assert.equal(simpleSpy.draws.some(d=>d.canvasWidth===512),true);
    mat.dispose();
  }finally{simpleSpy.restore();}
});

test('WebGPU terrain TSL node attaches color, medium normal, and high roughness nodes cleanly',()=>{
  const makeUniforms=({withNormal,withArm})=>({
    scale:{value:new THREE.Vector3(18,14,7.5)},
    detailScale:{value:new THREE.Vector3(28,16,0)},
    roads:{value:fakeSurfaceMap()},
    grass:{value:fakeSurfaceMap()},
    soil:{value:fakeSurfaceMap()},
    stone:{value:fakeSurfaceMap()},
    rock:{value:fakeSurfaceMap()},
    boulder:{value:fakeSurfaceMap()},
    macroReference:{value:new THREE.Color(0x526f37)},
    macroStrength:{value:0.35},
    grassTint:{value:new THREE.Color(0xffffff)},
    tint:{value:new THREE.Color(0xffffff)},
    amount:{value:1},
    grassNormal:{value:withNormal?fakeSurfaceMap():null},
    soilNormal:{value:withNormal?fakeSurfaceMap():null},
    stoneNormal:{value:withNormal?fakeSurfaceMap():null},
    rockNormal:{value:withNormal?fakeSurfaceMap():null},
    boulderNormal:{value:withNormal?fakeSurfaceMap():null},
    grassArm:{value:withArm?fakeSurfaceMap():null},
    soilArm:{value:withArm?fakeSurfaceMap():null},
    stoneArm:{value:withArm?fakeSurfaceMap():null},
    rockArm:{value:withArm?fakeSurfaceMap():null},
    boulderArm:{value:withArm?fakeSurfaceMap():null}
  });

  const lowMat=new MeshStandardNodeMaterial();
  terrain(lowMat,makeUniforms({withNormal:false,withArm:false}));
  assert.ok(lowMat.colorNode);
  assert.equal(lowMat.normalNode,null);
  assert.equal(lowMat.roughnessNode,null);
  lowMat.dispose();

  const medMat=new MeshStandardNodeMaterial();
  terrain(medMat,makeUniforms({withNormal:true,withArm:false}));
  assert.ok(medMat.colorNode);
  assert.ok(medMat.normalNode);
  assert.equal(medMat.roughnessNode,null);
  medMat.dispose();

  const highMat=new MeshStandardNodeMaterial();
  terrain(highMat,makeUniforms({withNormal:true,withArm:true}));
  assert.ok(highMat.colorNode);
  assert.ok(highMat.normalNode);
  assert.ok(highMat.roughnessNode);
  highMat.dispose();
});

test('terrain details use manifold 3-stone clusters with stone colors and ground cover keeps AO gradient and triangle budget',()=>{
  const pebble=pebbleGeometry();
  assert.equal(pebble.attributes.position.count,648);
  assert.ok(pebble.attributes.normal.array.every(Number.isFinite));
  assert.ok(pebble.boundingSphere.radius>0);
  pebble.dispose();

  const land=new Landscape(512,'meadows');
  const lowView=makeMockView(land,'low');
  const highView=makeMockView(land,'high');
  const lowDetails=new TerrainDetails(lowView);
  const highDetails=new TerrainDetails(highView);
  assert.ok(lowDetails.entries.length<=120);
  assert.ok(highDetails.entries.length<=360);
  assert.ok(highDetails.entries.length>0);
  const c=new THREE.Color();
  for(const entry of highDetails.entries){
    c.setHex(entry.color);
    assert.ok(Math.abs(c.g-c.r)<0.15&&Math.abs(c.g-c.b)<0.22,'meadow stones use neutral limestone/slate hues instead of painted green');
  }
  lowDetails.mesh.geometry.dispose();
  highDetails.mesh.geometry.dispose();
  lowView.dispose();
  highView.dispose();

  const highTuft=grassTuftGeometry(tuftBlades('high'));
  const lowTuft=grassTuftGeometry(tuftBlades('low'));
  assert.equal(highTuft.index.count/3,84);
  assert.equal(lowTuft.index.count/3,56);
  assert.ok(highTuft.attributes.color,'tuft geometry includes root-to-tip AO vertex color');
  const pos=highTuft.attributes.position,col=highTuft.attributes.color;
  let minY=Infinity,maxY=-Infinity,minLum=0,maxLum=0;
  for(let i=0;i<pos.count;i++){
    const y=pos.getY(i),lum=(col.getX(i)+col.getY(i)+col.getZ(i))/3;
    if(y<minY){minY=y;minLum=lum;}
    if(y>maxY){maxY=y;maxLum=lum;}
  }
  assert.ok(maxLum>minLum,'grass tips are brighter than rooted base AO');
  highTuft.dispose();
  lowTuft.dispose();

  const coverView=makeMockView(land,'high');
  const cover=new GroundCover(coverView);
  assert.ok(cover.entries.length<=4800&&cover.entries.length>0);
  cover.mesh.geometry.dispose();
  coverView.dispose();
});
