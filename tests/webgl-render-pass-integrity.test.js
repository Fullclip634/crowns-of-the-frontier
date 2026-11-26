import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {Simulation} from '../src/simulation.js';
import {WorldView} from '../src/world.js';
import {refreshGroundSurface} from '../src/landscape.js';

function fakeCanvas(){
  const ctx={
    fillStyle:'',strokeStyle:'',lineWidth:1,lineCap:'',lineJoin:'',globalAlpha:1,globalCompositeOperation:'source-over',
    fillRect(){},strokeRect(){},clearRect(){},drawImage(){},save(){},restore(){},translate(){},scale(){},rotate(){},
    beginPath(){},moveTo(){},lineTo(){},bezierCurveTo(){},quadraticCurveTo(){},closePath(){},arc(){},ellipse(){},rect(){},clip(){},fill(){},stroke(){},
    createRadialGradient(){return {addColorStop(){}};},
    createLinearGradient(){return {addColorStop(){}};},
    createImageData:(w,h)=>({width:w,height:h,data:new Uint8ClampedArray(w*h*4)}),
    putImageData(){},
  };
  return {width:0,height:0,style:{},getContext:()=>ctx,getBoundingClientRect:()=>({left:0,top:0,width:800,height:600}),addEventListener(){},removeEventListener(){}};
}

test('WebGL 2 disables fog mipmaps, draws ground ahead of buildings/stumps, and pre-uploads dynamic textures before render pass',()=>{
  const prevDoc=globalThis.document,prevWin=globalThis.window,prevDpr=globalThis.devicePixelRatio,prevIW=globalThis.innerWidth,prevIH=globalThis.innerHeight,prevImageData=globalThis.ImageData,prevMM=globalThis.matchMedia;
  globalThis.document={createElement:()=>fakeCanvas(),getElementById:()=>null,hidden:false};
  globalThis.window={addEventListener(){},removeEventListener(){}};
  globalThis.matchMedia=()=>({matches:false});
  globalThis.devicePixelRatio=1;globalThis.innerWidth=800;globalThis.innerHeight=600;
  globalThis.ImageData=class ImageData{constructor(data,w,h){this.data=data;this.width=w;this.height=h;}};
  try{
    const order=[];
    const fakeRenderer={
      domElement:fakeCanvas(),
      shadowMap:{enabled:true,type:THREE.PCFShadowMap,autoUpdate:true,needsUpdate:false},
      setPixelRatio(){},setSize(){},
      initTexture(tex){order.push(['initTexture',tex]);tex.onUpdate?.();},
      render(){order.push(['render']);},
    };
    const container={clientWidth:800,clientHeight:600,appendChild(){}};
    const view=new WorldView(container,{quality:'medium',fog:true,cameraPreset:'balanced'},fakeRenderer);

    // 1. Fog mask must disable mipmaps so mobile tile GPUs never invoke mid-pass gl.generateMipmap.
    assert.equal(view.fogTexture.generateMipmaps,false,'fogTexture disables mipmaps');
    assert.equal(view.fogTexture.minFilter,THREE.LinearFilter,'fogTexture uses LinearFilter minFilter');
    assert.equal(view.fogTexture.magFilter,THREE.LinearFilter,'fogTexture uses LinearFilter magFilter');

    // 2. Attach a real simulation and verify opaque draw-order hierarchy.
    const sim=new Simulation({mode:'skirmish',map:'highlands',worldSize:160,seed:7});
    view.attach(sim);
    assert.ok(view.skyDome.renderOrder<view.groundSurface.renderOrder,'skyDome renders before groundSurface');
    assert.equal(view.groundSurface.renderOrder,-1,'groundSurface renders ahead of buildings and stumps');
    refreshGroundSurface(view);
    assert.equal(view.groundSurface.renderOrder,-1,'refreshGroundSurface preserves groundSurface renderOrder');

    // 3. Trigger a fog change and dirty rigid unit pose, then render one frame.
    sim.visible[0]=sim.visible[0]?0:1;
    sim.fogRevision++;
    order.length=0;
    view.render(0.016,false);

    const renderIdx=order.findIndex(e=>e[0]==='render');
    const fogIdx=order.findIndex(e=>e[0]==='initTexture'&&e[1]===view.fogTexture);
    assert.ok(renderIdx>0,'renderer.render() ran');
    assert.ok(fogIdx>=0&&fogIdx<renderIdx,'dirty fogTexture pre-uploads strictly BEFORE WebGL 2 render pass opens');

    // Check any visible rigid unit batch also pre-uploaded its pose texture before render().
    const visibleRigs=[];
    for(const batch of view.unitBatches.values()){
      for(const part of batch.parts)if(part.visible&&part.userData?.rigidRig?.texture)visibleRigs.push(part.userData.rigidRig);
    }
    if(visibleRigs.length){
      assert.ok(visibleRigs.every(r=>!r.fullUpload&&r.dirtyRows.size===0),'visible rigid rig textures flushed before render pass');
    }

    // 4. Unchanged next frame must NOT re-upload fogTexture.
    order.length=0;
    view.render(0.016,false);
    assert.equal(order.filter(e=>e[0]==='initTexture'&&e[1]===view.fogTexture).length,0,'unchanged fogTexture skips upload');
  }finally{
    globalThis.document=prevDoc;globalThis.window=prevWin;globalThis.devicePixelRatio=prevDpr;
    globalThis.innerWidth=prevIW;globalThis.innerHeight=prevIH;globalThis.ImageData=prevImageData;globalThis.matchMedia=prevMM;
  }
});
