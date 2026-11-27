import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import * as THREE from 'three';
import {createSampleBank,AMBIENCE_SAMPLE_CUES,MUSIC_STEM_CUES} from '../src/sample-bank.js';
import {installSampledAudio} from '../src/sampled-audio.js';
import {Landscape} from '../src/landscape.js';
import {applyTerrainShading} from '../src/terrain-surface.js';
import {installNodeRuntime} from '../src/render-runtime.js';
import {renderModelPortrait} from '../src/portrait-3d.js';
import {BuildingDamageEffects} from '../src/battle-effects.js';
import {Simulation} from '../src/simulation.js';
import {battlePreset} from '../src/custom-battle.js';
import {triggerOakholdLiberation} from '../src/campaign-scenarios.js';
import {matchNeedsIronhold,matchNeedsBridge,ensureMatchArtwork} from '../src/match-artwork.js';

const audioDir=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../public/audio');
const manifest=JSON.parse(fs.readFileSync(path.join(audioDir,'manifest.json'),'utf8'));

function localAudioFetch(url){
  const name=decodeURIComponent(new URL(url).pathname.split('/').pop());
  const file=path.join(audioDir,name);
  if(!fs.existsSync(file))return Promise.resolve({ok:false});
  const bytes=fs.readFileSync(file);
  if(name==='manifest.json')return Promise.resolve({ok:true,json:async()=>JSON.parse(bytes.toString('utf8'))});
  return Promise.resolve({ok:true,arrayBuffer:async()=>bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength)});
}

function fakeAudioContext(){
  const nodes=[];
  const node=extra=>({connections:[],connect(out){this.connections.push(out);},disconnect(){this.disconnected=true;},start(){this.started=true;},stop(time){this.stopped=true;this.stoppedAt=time;},...extra});
  return {
    state:'running',currentTime:10,sampleRate:48000,destination:{},nodes,
    createGain(){const g=node({gain:{value:0,setTargetAtTime(v){this.value=v;}}});nodes.push(g);return g;},
    createBufferSource(){
      const source=node({loop:false,playbackRate:{value:1},onended:null});
      let buffer=null,assigned=false;
      Object.defineProperty(source,'buffer',{
        get:()=>buffer,
        set:value=>{
          if(value!==null&&assigned)throw new DOMException('Audio buffer has already been set','InvalidStateError');
          if(value!==null)assigned=true;
          buffer=value;
        },
      });
      nodes.push(source);
      return source;
    },
    createStereoPanner(){const p=node({pan:{value:0,setTargetAtTime(v){this.value=v;}}});nodes.push(p);return p;},
    decodeAudioData:async data=>({decoded:true,bytes:data.byteLength}),
  };
}

test('lazyLoops loads audio on demand and releases stopped sources using Web Audio buffer rules',async()=>{
  const ctx=fakeAudioContext();
  const bank=createSampleBank({context:ctx,fetchData:localAudioFetch,base:'https://game.test/',lazyLoops:true});
  const report=await bank.load();
  const nonLoopCount=Object.values(manifest.cues).filter(c=>c.group!=='weather'&&c.group!=='music').length;
  assert.equal(report.ready,true);
  assert.equal(report.lazyLoops,true);
  assert.equal(report.loaded,nonLoopCount,'lazyLoops skips all 12 heavy weather/music loops on boot');
  for(const cue of [...AMBIENCE_SAMPLE_CUES,...MUSIC_STEM_CUES,'rain','pad']){
    assert.equal(bank.has(cue),false,`${cue} stays unloaded until requested`);
  }

  // Concurrent ensure() calls deduplicate and decode once
  const [a,b]=await Promise.all([bank.ensure('amb-tundra'),bank.ensure('amb-tundra')]);
  assert.ok(a&&a===b);
  assert.equal(bank.has('amb-tundra'),true);
  assert.equal(bank.evict('amb-tundra'),true);
  assert.equal(bank.has('amb-tundra'),false);
  assert.equal(bank.status('amb-tundra'),'pending');

  // Engine integration: muted music never loads stems; active biome & music stem evict inactive buffers after fade window
  class Engine{
    constructor(settings={}){this.settings={volume:1,music:false,weatherSounds:true,...settings};}
    unlock(){this.context=fakeAudioContext();this.master={connect(){}};}
    play(){}
    voice(){return false;}
    warHorn(){return false;}
    weather(){}
    scoreStage(){return this.stage||'peace';}
    tick(){}
  }
  installSampledAudio(Engine,{fetchData:localAudioFetch,base:'https://game.test/',lazyLoops:true});
  const engine=new Engine();
  engine.unlock();
  await engine.sampleBank.load();

  engine.tick(.016);
  await new Promise(r=>setImmediate(r));
  assert.equal(MUSIC_STEM_CUES.some(c=>engine.sampleBank.has(c)),false,'muted music decodes zero music stems');

  // Enable music on peace stage -> loads only music-peace
  engine.settings.music=true;
  engine.tick(.016);
  await engine.sampleBank.ensure('music-peace');
  engine.tick(.016);
  assert.equal(engine.sampleBank.has('music-peace'),true);
  assert.equal(engine.sampleBank.has('music-battle'),false);
  assert.equal(engine.sampleBank.has('pad'),false,'lazyLoops skips redundant pad drone');
  const peaceSource=engine.sampleLoops.get('music-peace').source;

  // Transition to battle -> crossfades, then stops & evicts music-peace after 3s fade window
  engine.stage='battle';
  engine.tick(.016);
  await engine.sampleBank.ensure('music-battle');
  engine.tick(.016);
  assert.ok(engine.sampleLoops.get('music-battle').gain.gain.value>0);
  assert.equal(engine.sampleLoops.get('music-peace').gain.gain.value,0);
  engine.context.currentTime+=3.5;
  engine.tick(.016);
  assert.equal(engine.sampleBank.has('music-peace'),false,'inactive music stem evicted after fade');
  assert.equal(peaceSource.stopped,true);
  assert.equal(peaceSource.buffer,null,'stopped source no longer holds the decoded buffer');
  assert.equal(peaceSource.disconnected,true);
  assert.equal(peaceSource.onended,null);

  // Active biome loads only 1 ambience and evicts old biome on map change
  engine.updateScene({sim:{options:{map:'winter'}},active:true});
  await engine.sampleBank.ensure('amb-tundra');
  engine.updateScene({sim:{options:{map:'winter'}},active:true});
  assert.equal(engine.sampleBank.has('amb-tundra'),true);
  assert.equal(engine.sampleBank.has('amb-arid'),false);

  engine.updateScene({sim:{options:{map:'arid'}},active:true});
  await engine.sampleBank.ensure('amb-arid');
  engine.updateScene({sim:{options:{map:'arid'}},active:true});
  engine.context.currentTime+=3.5;
  engine.updateScene({sim:{options:{map:'arid'}},active:true});
  assert.equal(engine.sampleBank.has('amb-tundra'),false,'previous biome ambience evicted');
  assert.equal(engine.sampleBank.has('amb-arid'),true);
});

test('Medium and High WebGL2 terrain shaders weight-gate rock, soil, normal, and ARM taps while keeping volcanic soil intact',()=>{
  const prevDoc=globalThis.document;
  const ctx={fillStyle:'',strokeStyle:'',lineWidth:1,lineCap:'round',lineJoin:'round',fillRect(){},beginPath(){},moveTo(){},lineTo(){},stroke(){},createImageData:(w,h)=>({data:new Uint8ClampedArray(w*h*4),width:w,height:h}),putImageData(){}};
  globalThis.document={createElement:()=>({width:0,height:0,getContext:()=>ctx})};
  const tex=()=>new THREE.Texture();
  const surfaces=Object.fromEntries(['grass','soil','rock','paving'].map(r=>[r,{color:tex(),normal:tex(),arm:tex()}]));
  installNodeRuntime(null);
  try{
    const compile=(map,quality)=>{
      const land=new Landscape(512,map,160);
      const mat=new THREE.MeshStandardMaterial();
      applyTerrainShading(mat,land,quality,surfaces,{grass:2,soil:1.5,rock:65,paving:2});
      const shader={uniforms:{},vertexShader:THREE.ShaderLib.standard.vertexShader,fragmentShader:THREE.ShaderLib.standard.fragmentShader};
      mat.onBeforeCompile(shader);
      for(const t of mat.frontierOwnedTextures||[])t.dispose();
      mat.dispose();
      return shader.fragmentShader;
    };
    const medHighlands=compile('highlands','medium');
    assert.match(medHighlands,/if \(terrainBlend\.z > 0\.005\)/,'Medium gates rock triplanar color & normal reads');
    assert.match(medHighlands,/if \(terrainBlend\.y > 0\.005\)/,'Medium gates soil color & normal reads on non-volcanic grass');
    const medVolcanic=compile('volcanic','medium');
    assert.match(medVolcanic,/vec3 soilSample = mix\(texture2D\(frontierTerrainsoil/,'Volcanic keeps unconditional soilSample for ash-grass mix');
    const highHighlands=compile('highlands','high');
    assert.match(highHighlands,/accumArm \+= textureGrad\(frontierTerrainrockArm, rockUv \* 6\.5, rockDx \* 6\.5, rockDy \* 6\.5/);
    assert.match(medHighlands,/vec2 rockDx = dFdx\(rockUv\), rockDy = dFdy\(rockUv\)[\s\S]*if \(terrainBlend\.z > 0\.005\) \{[\s\S]*textureGrad\(frontierTerrainrock/);
    assert.match(medHighlands,/textureGrad\(frontierTerrainrockNormal/);
    assert.match(medHighlands,/textureGrad\(frontierTerrainpaving/);
  }finally{
    if(prevDoc===undefined)delete globalThis.document;else globalThis.document=prevDoc;
    for(const set of Object.values(surfaces))for(const t of Object.values(set))t.dispose();
  }
});

test('renderModelPortrait skips creating a 2nd WebGL context on coarse-pointer touch devices even on Medium/High',()=>{
  const prevMatch=globalThis.matchMedia,prevDoc=globalThis.document;
  let queried=0;
  globalThis.document={hidden:false,getElementById(){queried++;return null;}};
  try{
    globalThis.matchMedia=q=>({matches:q==='(pointer: coarse)'});
    for(const quality of ['medium','high']){
      renderModelPortrait({renderQuality:quality,settings:{quality},sim:{get:()=>({id:1})}});
    }
    assert.equal(queried,0,'touch mobile devices never spin up the 2nd portrait WebGL context');

    globalThis.matchMedia=()=>({matches:false});
    renderModelPortrait({renderQuality:'medium',settings:{quality:'medium'},sim:{get:()=>({id:1})}});
    assert.equal(queried,1,'desktop Medium still queries #model-portrait normally');
  }finally{
    if(prevMatch===undefined)delete globalThis.matchMedia;else globalThis.matchMedia=prevMatch;
    if(prevDoc===undefined)delete globalThis.document;else globalThis.document=prevDoc;
  }
});

test('BuildingDamageEffects scales siege fire/smoke ceilings cleanly across Low, Medium, and High',t=>{
  const scene=new THREE.Scene(),node=new THREE.Group();
  const geo=new THREE.BoxGeometry(3,5,3),mat=new THREE.MeshBasicMaterial();
  const roof=new THREE.Mesh(geo,mat);roof.position.y=2.5;node.add(roof);
  const effects=new BuildingDamageEffects(scene,'low');
  t.after(()=>{effects.dispose();geo.dispose();mat.dispose();});

  const runSiege=()=>{
    effects.beginFrame();
    for(let id=1;id<=200;id++)effects.add({id,kind:'building',type:'house',hp:10,maxHp:100,progress:1,r:2},node,2,.8,null,true);
    effects.endFrame();
    return {flames:effects.flames.count,smoke:effects.smoke.count,wisps:effects.smokeWisps.count,licks:effects.flameLicks.count,embers:effects.embers.count};
  };
  const low=runSiege();
  assert.deepEqual(low,{flames:96,smoke:64,wisps:120,licks:96,embers:80});

  effects.setQuality('medium');
  const med=runSiege();
  assert.deepEqual(med,{flames:160,smoke:100,wisps:200,licks:260,embers:160});

  effects.setQuality('high');
  const high=runSiege();
  assert.deepEqual(high,{flames:240,smoke:140,wisps:420,licks:480,embers:360});
});

test('per-owner tick indexing matches brute-force queries bit-for-bit and handles Oakhold liberation cleanly',()=>{
  const sim=new Simulation({mode:'custom',map:'highlands',mapSize:'vast',seed:2026,slots:battlePreset('4v4')});
  for(let i=0;i<10;i++)sim.tick(.1);
  sim.ownerIndexActive=true;
  try{
    for(let owner=0;owner<sim.players.length;owner++){
      for(const kind of ['unit','building']){
        const fast=sim.owned(owner,kind).map(e=>e.id);
        const brute=sim.entities.filter(e=>e.hp>0&&e.owner===owner&&e.kind===kind).map(e=>e.id);
        assert.deepEqual(fast,brute,`owner ${owner} ${kind} ids match brute-force`);
        assert.equal(sim.count(owner,kind),brute.length,`owner ${owner} ${kind} count matches brute-force`);
      }
    }
  }finally{sim.ownerIndexActive=false;}

  // Liberation flips owner=3 -> 0 mid-tick; cache must invalidate immediately
  const oakSim=new Simulation({mode:'campaign13',seed:2026});
  oakSim.ownerIndexActive=true;
  try{
    const before=oakSim.count(0,'building');
    assert.equal(triggerOakholdLiberation(oakSim),true);
    assert.ok(oakSim.count(0,'building')>before,'liberated buildings appear immediately in owner-0 index');
  }finally{oakSim.ownerIndexActive=false;}
});

test('match-scoped artwork helper loads optional ironhold and bridge GLBs only when required',async()=>{
  assert.equal(matchNeedsIronhold({faction:'alder',map:'highlands'}),false);
  assert.equal(matchNeedsIronhold({faction:'iron',map:'highlands'}),true);
  assert.equal(matchNeedsIronhold({faction:'jade',map:'highlands'}),true,'the Jade player faces Ironhold in a classic battle');
  assert.equal(matchNeedsIronhold({faction:'jade',map:'highlands'},{players:[{faction:'jade'},{faction:'alder'}]}),false,'actual participants override initial faction guesses');
  assert.equal(matchNeedsIronhold({mode:'custom',slots:[{faction:'alder',enabled:true},{faction:'iron',enabled:true}]}),true);
  assert.equal(matchNeedsIronhold({mode:'campaign15',faction:'alder'}),true);
  assert.equal(matchNeedsBridge('highlands'),false);
  assert.equal(matchNeedsBridge('valley'),true);
  assert.equal(matchNeedsBridge({mode:'campaign16'}),true,'campaign16 resolves waterfallgorge bridge map');
  assert.equal(matchNeedsBridge({mode:'campaign16',map:'highlands'}),true,'the campaign map takes precedence over setup defaults');
  assert.equal(matchNeedsBridge({mode:'tides',map:'valley'}),false,'the fixed coast map takes precedence over setup defaults');

  const calls=[];
  await ensureMatchArtwork({
    options:{faction:'alder',map:'highlands'},
    hasIronhold:()=>false,loadIronhold:()=>{calls.push('iron');},
    hasBridge:()=>false,loadBridge:()=>{calls.push('bridge');},
  });
  assert.deepEqual(calls,[],'skirmish highlands alder skips both optional packs');

  await ensureMatchArtwork({
    options:{mode:'campaign16',faction:'alder'},
    hasIronhold:()=>false,loadIronhold:()=>{calls.push('iron');},
    hasBridge:()=>false,loadBridge:()=>{calls.push('bridge');},
  });
  assert.deepEqual(calls.sort(),['bridge','iron'],'campaign16 loads both required packs on demand');
});

test('a failed optional Ironhold pack settles once while a missing bridge is reported to the caller',async t=>{
  let attempts=0;
  t.mock.method(console,'warn',()=>{});
  await ensureMatchArtwork({options:{faction:'iron'},hasIronhold:()=>false,loadIronhold:async()=>{
    attempts++;throw new Error('Ironhold request failed');
  }});
  assert.equal(attempts,1);
  await assert.rejects(ensureMatchArtwork({options:{map:'valley'},hasBridge:()=>false,loadBridge:async()=>{
    throw new Error('Bridge request failed');
  }}),/Bridge request failed/);
});

test('renderSelection batches panel HTML into a single write instead of chained innerHTML +=',()=>{
  const src=fs.readFileSync(new URL('../src/main.js',import.meta.url),'utf8');
  const start=src.indexOf('function renderSelection()');
  const end=src.indexOf('function renderHUD(',start);
  assert.ok(start>0&&end>start);
  const body=src.slice(start,end);
  assert.equal(body.includes('panel.innerHTML+='),false,'renderSelection performs zero chained innerHTML += DOM reparses');
});
