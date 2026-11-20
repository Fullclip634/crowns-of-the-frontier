import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {AudioEngine} from '../src/audio.js';
import {FOLEY_SAMPLE_CUES,AMBIENCE_SAMPLE_CUES} from '../src/sample-bank.js';

function richMockWindow(){
  const nodes=[];
  class Param{
    constructor(v=0){this.value=v;this.targets=[];}
    setValueAtTime(v){this.value=v;}
    exponentialRampToValueAtTime(v){this.value=v;}
    setTargetAtTime(v,t,tc){this.value=v;this.targets.push({v,t,tc});}
  }
  class Node{
    constructor(kind){this.kind=kind;this.outputs=[];this.disconnected=false;nodes.push(this);}
    connect(dest){this.outputs.push(dest);}
    disconnect(){this.disconnected=true;}
  }
  class Context{
    constructor(){this.state='running';this.currentTime=10;this.sampleRate=22050;this.destination=new Node('dest');}
    resume(){return Promise.resolve();}
    createGain(){const g=new Node('gain');g.gain=new Param(1);return g;}
    createDynamicsCompressor(){const c=new Node('comp');c.threshold=new Param(-16);c.ratio=new Param(4);c.knee=new Param(12);c.attack=new Param(.004);c.release=new Param(.16);return c;}
    createConvolver(){const r=new Node('convolver');r.buffer=null;return r;}
    createBiquadFilter(){const f=new Node('filter');f.type='lowpass';f.frequency=new Param(1000);f.Q=new Param(1);return f;}
    createStereoPanner(){const p=new Node('panner');p.pan=new Param(0);return p;}
    createBuffer(ch,len,rate){const data=new Float32Array(len);return {numberOfChannels:ch,length:len,sampleRate:rate,getChannelData:()=>data};}
    createBufferSource(){const s=new Node('source');s.buffer=null;s.loop=false;s.playbackRate=new Param(1);s.start=()=>{s.started=true;};s.stop=()=>{s.stopped=true;};return s;}
    createOscillator(){const o=new Node('osc');o.type='sine';o.frequency=new Param(440);o.start=()=>{o.started=true;};o.stop=()=>{o.stopped=true;};return o;}
    decodeAudioData(buf){return Promise.resolve({decoded:true,bytes:buf.byteLength});}
  }
  return {window:{AudioContext:Context},nodes};
}

test('Phase 5 builds a 4-bus submix + open-air convolution reverb, auto-ducks music and adapts mix to zoom',()=>{
  const original=globalThis.window,mock=richMockWindow();
  globalThis.window=mock.window;
  try{
    const audio=new AudioEngine({volume:.8,music:true,weatherSounds:true,unitVoices:true,warHorns:true});
    audio.unlock();
    assert.ok(audio.musicBus&&audio.sfxBus&&audio.voiceBus&&audio.ambienceBus,'all 4 submix buses exist');
    assert.ok(audio.compressor,'master DynamicsCompressor is connected');
    assert.ok(audio.reverbConvolver&&audio.reverbSend,'open-air convolution reverb send is active');
    assert.ok(audio.reverbConvolver.buffer.length>1000,'reverb holds synthetic open-air impulse response');

    // Auto-ducking on warHorn lowers musicBus cleanly and restores once window elapses
    assert.equal(audio.warHorn(),true);
    assert.ok(audio.musicBus.gain.value<.70,`warHorn ducks musicBus (${audio.musicBus.gain.value})`);
    audio.context.currentTime+=3.0;
    audio.tick(.1);
    assert.equal(audio.musicBus.gain.value,1,'musicBus restores smoothly after duck window');

    // Zoom-aware mix scales sfxBus down and ambienceBus up as camera pulls back
    audio.setCameraZoom(24);
    const closeSfx=audio.sfxBus.gain.value,closeAmb=audio.ambienceBus.gain.value;
    audio.setCameraZoom(108);
    assert.ok(audio.sfxBus.gain.value<closeSfx,'zooming out softens close sfx presence');
    assert.ok(audio.ambienceBus.gain.value>closeAmb,'zooming out opens ambient airiness');
  }finally{globalThis.window=original;}
});

test('Phase 5 adaptive score progresses peace -> tension -> battle -> climax and relaxes back to peace',()=>{
  const original=globalThis.window,mock=richMockWindow();
  globalThis.window=mock.window;
  try{
    const audio=new AudioEngine({volume:.8,music:true});
    audio.unlock();
    assert.equal(audio.scoreStage(),'peace');
    audio.noteCombatActivity(.22);
    assert.equal(audio.scoreStage(),'tension');
    audio.noteCombatActivity(.30);
    assert.equal(audio.scoreStage(),'battle');
    audio.noteCombatActivity(.35);
    assert.equal(audio.scoreStage(),'climax');
    for(let i=0;i<20;i++)audio.tick(1.0);
    assert.equal(audio.scoreStage(),'peace','score relaxes gracefully back to peace after combat ends');
  }finally{globalThis.window=original;}
});

test('Phase 5 combat audio adds distance low-pass filtering, pitch variation and living economy Foley',()=>{
  const original=globalThis.window,mock=richMockWindow();
  globalThis.window=mock.window;
  try{
    const audio=new AudioEngine({volume:.8,music:true,weatherSounds:true});
    audio.unlock();
    audio.setCombatListener(()=>({gain:.35,pan:.2}));
    assert.equal(audio.combat({x:20,z:0,owner:0,kind:'unit',type:'knight'},{kind:'unit'}),true);
    const [voice]=audio.combatVoices;
    assert.ok(voice.filter&&voice.filter.type==='lowpass','far combat clashes apply distance low-pass filtering');
    assert.ok(voice.filter.frequency.value<5000,'distance cutoff rolls off high-frequency harshness');
    voice.source.onended();
    assert.equal(voice.filter.disconnected,true,'distance filter disconnects cleanly on voice end');

    for(const cue of FOLEY_SAMPLE_CUES){
      assert.equal(audio.proceduralFoley(cue,{gain:.25,pan:0}),true,`procedural Foley supports ${cue}`);
    }
    const sim={
      options:{map:'volcanic'},
      entities:[{id:1,kind:'unit',type:'villager',hp:50,maxHp:50,moving:false,order:{type:'gather',target:2},x:0,z:0,owner:0}],
      get:id=>id===2?{id:2,type:'wood'}:null,
    };
    audio.updateScene({dt:.5,view:{zoom:40},sim,active:true});
    assert.equal(audio.currentMap,'volcanic');
    assert.ok(audio.windFilter.frequency.value<200,'volcanic biome shifts ambient wind into deep rumble');
  }finally{globalThis.window=original;}
});

test('Phase 5 rain.wav eliminates the old 0.37s periodic click and ships all biome ambience + Foley cues',()=>{
  const audioDir=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../public/audio');
  const manifest=JSON.parse(fs.readFileSync(path.join(audioDir,'manifest.json'),'utf8'));
  for(const cue of [...FOLEY_SAMPLE_CUES,...AMBIENCE_SAMPLE_CUES])assert.ok(manifest.cues[cue],`shipped cue ${cue}`);
  const bytes=fs.readFileSync(path.join(audioDir,'rain.wav'));
  const frames=(bytes.length-44)/2,rate=bytes.readUInt32LE(24);
  const lag=Math.floor(rate*.37);
  let num=0,den=0;
  for(let i=0;i<frames-lag;i++){
    const a=bytes.readInt16LE(44+i*2)/32768,b=bytes.readInt16LE(44+(i+lag)*2)/32768;
    num+=a*b;den+=a*a;
  }
  const corr=Math.abs(num/Math.max(1e-9,den));
  assert.ok(corr<.06,`rain.wav has no 0.37s periodic click (autocorrelation ${corr.toFixed(4)})`);
});
