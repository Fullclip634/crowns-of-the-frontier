import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as THREE from 'three';
import {renderReliefBase,drawMinimap} from '../src/minimap.js';
import {renderHealthBars,entityArmorTier} from '../src/health-layer.js';
import {shouldAutoCollapseObjectives,OBJECTIVE_AUTO_COLLAPSE_SECONDS} from '../src/compact-hud.js';
import {Landscape} from '../src/landscape.js';
import {Simulation} from '../src/simulation.js';
import {bridgeOuterHalfWidth} from '../src/bridge-layout.js';

function fakeCanvasContext(size){
  let imageData=null;
  const calls=[];
  return {
    get imageData(){return imageData;},
    calls,
    createImageData(w,h){return {width:w,height:h,data:new Uint8ClampedArray(w*h*4)};},
    putImageData(img){imageData=img;calls.push('putImageData');},
    fillRect(...a){calls.push(['fillRect',...a]);},
    strokeRect(...a){calls.push(['strokeRect',...a]);},
    clearRect(){},
    drawImage(){calls.push('drawImage');},
    beginPath(){},moveTo(){},lineTo(){},arc(){},closePath(){},stroke(){},fill(){},
  };
}

test('Phase 6 renderReliefBase produces directional hillshading, shoreline ink and bathymetry across biomes',()=>{
  for(const map of ['riverland','highland','archipelago','tundra','volcanic']){
    const sim=new Simulation({mode:'sandbox',map,seed:204});
    const land=new Landscape(204,map,sim.worldSize,sim.spawnPositions,sim.startingSites);
    const ctx=fakeCanvasContext(64);
    const usedRelief=renderReliefBase(ctx,64,sim,{landscape:land});
    assert.equal(usedRelief,true,`${map} uses directional relief shading`);
    assert.ok(ctx.imageData,'writes ImageData to cached base canvas');
    const data=ctx.imageData.data;
    let minLuma=255,maxLuma=0;
    for(let i=0;i<data.length;i+=4){
      assert.equal(data[i+3],255,'opaque minimap base pixel');
      const luma=data[i]*.3+data[i+1]*.59+data[i+2]*.11;
      minLuma=Math.min(minLuma,luma);maxLuma=Math.max(maxLuma,luma);
    }
    assert.ok(maxLuma-minLuma>18,`${map} relief base carries genuine hillshade/water tonal contrast (${(maxLuma-minLuma).toFixed(1)})`);
    if(map==='volcanic'||map==='highland'||map==='tundra'){
      let fakeWaterPixels=0;
      for(let i=0;i<data.length;i+=4){
        if(data[i]<120&&data[i+2]>data[i]+25&&data[i+1]>data[i]+18)fakeWaterPixels++;
      }
      assert.equal(fakeWaterPixels,0,`${map} dry valleys must never paint false blue water lakes on the minimap`);
    }
  }
});

test('the relief cache follows the actual landscape even when the seed is reused',()=>{
  const ctx=fakeCanvasContext(48);
  const canvas={width:48,height:48,getContext:()=>ctx};
  const camera=new THREE.PerspectiveCamera(45,16/9,1,200);
  camera.position.set(0,40,40);camera.lookAt(0,0,0);camera.updateMatrixWorld();camera.updateProjectionMatrix();
  const sim=new Simulation({mode:'sandbox',map:'highland',seed:101});
  const land=new Landscape(101,'highland',sim.worldSize,sim.spawnPositions,sim.startingSites);
  const view={landscape:land,camera,target:{x:0,z:0},groundHeight:()=>0};
  const prevDoc=globalThis.document;
  let baseBuilds=0;
  globalThis.document={createElement:()=>({width:48,height:48,getContext:()=>{baseBuilds++;return fakeCanvasContext(48);}})};
  try{
    drawMinimap(canvas,sim,view,{fog:false});
    drawMinimap(canvas,sim,view,{fog:false});
    assert.equal(baseBuilds,1,'same seed reuses cached relief base (0 per-frame hillshading)');
    view.landscape=new Landscape(101,'highland',sim.worldSize,[{x:14,z:26}],sim.startingSites);
    drawMinimap(canvas,sim,view,{fog:false});
    assert.equal(baseBuilds,2,'a new layout with the same seed refreshes the relief');
    sim.options.seed=202;
    drawMinimap(canvas,sim,view,{fog:false});
    assert.equal(baseBuilds,3,'new seed invalidates and rebakes relief base');
  }finally{globalThis.document=prevDoc;}
});

test('Phase 6 renderHealthBars adds high-contrast building, selected and low-HP classes while keeping DOM pooling',()=>{
  const children=[];
  const makeNode=()=>({className:'',style:{},textContent:'',hidden:false,children:[],append(...items){this.children.push(...items);},remove(){const i=children.indexOf(this);if(i>=0)children.splice(i,1);}});
  const layer={children,ownerDocument:{createElement:()=>makeNode()},append(...items){children.push(...items);}};
  const unit={id:1,kind:'unit',owner:0,x:0,z:0,hp:20,maxHp:100};
  const enemyKeep={id:2,kind:'building',owner:1,x:6,z:0,hp:400,maxHp:1000,progress:1};
  const sim={entities:[unit,enemyKeep],isVisible:()=>true,hostile:(a,b)=>a!==b};
  const view={selection:new Set([1]),project:e=>({x:100+e.id*30,y:120,visible:true})};

  renderHealthBars(layer,sim,view,{width:1280,height:720});
  assert.equal(layer.children.length,2);
  assert.match(layer.children[0].className,/^world-health\b.*\bselected\b.*\blow\b/);
  assert.match(layer.children[1].className,/^world-health rival\b.*\bbuilding\b.*\bmid\b/);

  const css=fs.readFileSync(new URL('../src/interface-design.css',import.meta.url),'utf8');
  assert.match(css,/#health-layer\{[^}]*z-index:0/,'#health-layer keeps z-index:0 behind HUD panels');
  assert.match(css,/\.world-health\.building\{/,'buildings get distinct wider health bars');
  assert.match(css,/\.world-health \.armor-pips/,'forged armor pips CSS is defined');
  assert.match(css,/@media\(pointer:coarse\)\{[\s\S]*?\.objective-toggle\{[^}]*min-height:44px/,'coarse touch devices keep >=44px objective toggle targets');
  assert.match(css,/@media\(pointer:coarse\)\{[\s\S]*?backdrop-filter:none/,'touch devices avoid costly canvas backdrop-filter blur');
});

test('Phase 6 forged armor/shield pips scale cleanly by defense tier and objectives auto-collapse after read window',()=>{
  const children=[];
  const makeNode=()=>({className:'',style:{},textContent:'',hidden:false,children:[],append(...items){this.children.push(...items);},remove(){const i=children.indexOf(this);if(i>=0)children.splice(i,1);}});
  const layer={children,ownerDocument:{createElement:()=>makeNode()},append(...items){children.push(...items);}};
  const villager={id:1,kind:'unit',type:'villager',owner:0,x:0,z:0,hp:30,maxHp:40};
  const knight={id:2,kind:'unit',type:'knight',owner:0,x:4,z:0,hp:100,maxHp:180};
  const keep={id:3,kind:'building',type:'keep',owner:1,x:10,z:0,hp:900,maxHp:1200,progress:1};
  const sim={
    entities:[villager,knight,keep],
    isVisible:()=>true,
    hostile:(a,b)=>a!==b,
    unitArmor:u=>u.type==='knight'?7:0,
  };
  const view={selection:new Set([1,2]),project:e=>({x:100+e.id*35,y:120,visible:true})};
  renderHealthBars(layer,sim,view,{width:1280,height:720});
  assert.equal(entityArmorTier(sim,villager),0);
  assert.equal(entityArmorTier(sim,knight),3);
  assert.equal(entityArmorTier(sim,keep),3);
  assert.equal(layer.children[0].children[2].hidden,true,'unarmored villager hides armor pips');
  assert.equal(layer.children[1].children[2].hidden,false,'armored knight shows tier-3 armor pips');
  assert.equal(layer.children[1].children[2].textContent,'◆◆◆');
  assert.equal(layer.children[2].children[2].textContent,'◆◆◆','fortified keep shows masonry shield pips');

  // Auto-collapsible objectives behavior
  assert.equal(shouldAutoCollapseObjectives({mode:'skirmish',simTime:4,userToggled:false,changedAt:0}),false,'stays open during initial read window');
  assert.equal(shouldAutoCollapseObjectives({mode:'skirmish',simTime:OBJECTIVE_AUTO_COLLAPSE_SECONDS+1,userToggled:false,changedAt:0}),true,'auto-collapses after read window');
  assert.equal(shouldAutoCollapseObjectives({mode:'skirmish',simTime:30,userToggled:true,changedAt:0}),false,'respects manual player toggle');
  assert.equal(shouldAutoCollapseObjectives({mode:'tutorial',simTime:60,userToggled:false,changedAt:0}),false,'tutorial objectives never auto-collapse');
  assert.equal(shouldAutoCollapseObjectives({mode:'custom',simTime:60,userToggled:false,changedAt:0}),false,'custom battle roster stays open');
});

test('relief samples the rendered terrain and shows the actual bridge deck',()=>{
  const size=80,sim={worldSize:160,options:{map:'valley'},isWater:()=>false};
  const ctx=fakeCanvasContext(size);
  let samples=0;
  const terrain={
    heightAt(){throw new Error('Use the rendered surface when it exists');},
    surfaceHeightAt(x,z){samples++;return x*.04+z*.02;},
  };
  assert.equal(renderReliefBase(ctx,size,sim,{landscape:terrain}),true);
  assert.equal(samples,size*size);
  assert.deepEqual(ctx.calls.filter(call=>Array.isArray(call)&&call[0]==='fillRect'),[
    ['fillRect',33.5,(80-bridgeOuterHalfWidth)*.5,13,bridgeOuterHalfWidth],
  ]);
});
