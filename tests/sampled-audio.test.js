import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {AudioEngine} from '../src/audio.js';
import {createSampleBank,sampleURL,combatCue,UI_SAMPLE_CUES,COMBAT_KINDS,COMBAT_VARIANTS,MAX_PARALLEL_SAMPLE_LOADS} from '../src/sample-bank.js';
import {installSampledAudio} from '../src/sampled-audio.js';

const audioDir=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../public/audio');
const manifest=JSON.parse(fs.readFileSync(path.join(audioDir,'manifest.json'),'utf8'));
const license=fs.readFileSync(path.resolve(audioDir,'../AUDIO_LICENSES.txt'),'utf8');

function parseWav(bytes){
  assert.equal(bytes.toString('ascii',0,4),'RIFF');
  assert.equal(bytes.readUInt32LE(4),bytes.length-8);
  assert.equal(bytes.toString('ascii',8,12),'WAVE');
  assert.equal(bytes.toString('ascii',12,16),'fmt ');
  assert.equal(bytes.readUInt32LE(16),16,'canonical PCM fmt chunk');
  assert.equal(bytes.readUInt16LE(20),1,'uncompressed PCM');
  const channels=bytes.readUInt16LE(22),rate=bytes.readUInt32LE(24),bits=bytes.readUInt16LE(34);
  assert.equal(bytes.toString('ascii',36,40),'data');
  const dataBytes=bytes.readUInt32LE(40);
  assert.equal(bytes.length,44+dataBytes);
  return {channels,rate,bits,frames:dataBytes/(bits/8)/channels};
}

test('the shipped sample pack is a complete, valid, deterministic CC0 PCM bank',()=>{
  assert.equal(manifest.schema,1);
  assert.equal(manifest.license,'CC0-1.0');
  assert.equal(manifest.channels,1);
  assert.equal(manifest.encoding,'pcm_s16le');
  assert.equal(manifest.sampleRate,22050);
  assert.equal(manifest.proceduralFallback,true);
  assert.match(license,/CC0 1\.0/);
  const names=Object.keys(manifest.cues);
  assert.equal(names.length,29);
  assert.equal(fs.readdirSync(audioDir).filter(f=>f.endsWith('.wav')).length,names.length,'no unreferenced or stale WAVs');
  for(const cue of UI_SAMPLE_CUES)assert.ok(manifest.cues[cue],`UI cue ${cue} exists`);
  for(const kind of COMBAT_KINDS)for(let v=0;v<COMBAT_VARIANTS;v++)assert.ok(manifest.cues[combatCue(kind,v)],`combat cue ${combatCue(kind,v)} exists`);
  for(const cue of ['horn','rain','pad'])assert.ok(manifest.cues[cue]);
  let total=0;
  for(const [name,cue]of Object.entries(manifest.cues)){
    const bytes=fs.readFileSync(path.join(audioDir,cue.file));
    assert.equal(bytes.length,cue.bytes,`${name} size matches manifest`);
    assert.equal(crypto.createHash('sha256').update(bytes).digest('hex'),cue.sha256,`${name} is reproducible`);
    const wav=parseWav(bytes);
    assert.equal(wav.channels,1);assert.equal(wav.rate,manifest.sampleRate);assert.equal(wav.bits,16);
    assert.ok(Math.abs(wav.frames/wav.rate-cue.duration)<.001,`${name} duration matches manifest`);
    assert.ok(cue.duration>.05&&cue.duration<4,`${name} has a sane duration`);
    let peak=0,energy=0;
    for(let i=0;i<wav.frames;i++){const value=bytes.readInt16LE(44+i*2);peak=Math.max(peak,Math.abs(value));energy+=value*value;}
    assert.ok(peak>2000&&peak<32768,`${name} is audible but never clips`);
    assert.ok(Math.sqrt(energy/wav.frames)>200,`${name} carries real signal`);
    assert.equal(cue.loop,cue.group==='weather'||cue.group==='music');
    total+=bytes.length;
  }
  assert.ok(total<1_000_000,'the whole pack stays under 1 MB');
});

function localFetch(url){
  const name=decodeURIComponent(new URL(url).pathname.split('/').pop());
  const file=path.join(audioDir,name);
  if(!fs.existsSync(file))return Promise.resolve({ok:false});
  const bytes=fs.readFileSync(file);
  if(name==='manifest.json')return Promise.resolve({ok:true,json:async()=>JSON.parse(bytes.toString('utf8'))});
  return Promise.resolve({ok:true,arrayBuffer:async()=>bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength)});
}
const decoded=()=>({decodeAudioData:async data=>({decoded:true,bytes:data.byteLength})});

test('sample URLs resolve beneath a deployed subpath',()=>{
  const base='https://game.test/app/';
  assert.equal(sampleURL('select.wav',base),'https://game.test/app/audio/select.wav');
  assert.equal(new URL('audio/manifest.json',base).toString(),'https://game.test/app/audio/manifest.json');
});

test('the bank loads every cue with bounded concurrency and seeds the combat cache',async()=>{
  let inFlight=0,peak=0;
  const fetchData=async url=>{inFlight++;peak=Math.max(peak,inFlight);await new Promise(r=>setTimeout(r,1));inFlight--;return localFetch(url);};
  const bank=createSampleBank({context:decoded(),fetchData,base:'https://game.test/app/'});
  const report=await bank.load();
  assert.equal(report.ready,true);
  assert.equal(report.loaded,Object.keys(manifest.cues).length);
  assert.equal(report.failed,0);
  assert.deepEqual(report.errors,[]);
  assert.equal(report.total,report.loaded);
  assert.ok(report.bytes>0);
  assert.ok(peak>1&&peak<=MAX_PARALLEL_SAMPLE_LOADS,'loads are parallel but bounded');
  for(const name of Object.keys(manifest.cues))assert.equal(bank.status(name),'loaded');
  assert.equal(bank.get('select')?.decoded,true);
  assert.equal(bank.has('missing'),false);
  assert.equal(bank.isLoop('rain'),true);
  assert.equal(bank.isLoop('select'),false);
  const engine={};assert.equal(bank.seedCombatBuffers(engine),COMBAT_KINDS.length*COMBAT_VARIANTS);
  assert.equal(engine.combatBuffers.size,20);
  assert.ok(engine.combatBuffers.get('metal:0'));
  assert.equal(engine.combatBuffers.get('metal:0'),bank.get('metal-0'));
  // load() is idempotent and never refetches.
  const first=bank.load();assert.equal(await bank.load(),await first);
});

test('a missing manifest or a corrupt sample degrades to the procedural fallback without throwing',async()=>{
  const missing=createSampleBank({context:decoded(),fetchData:async()=>({ok:false}),base:'https://game.test/'});
  const report=await missing.load();
  assert.equal(report.ready,true);assert.equal(report.loaded,0);assert.ok(report.errors.length>0);
  assert.equal(missing.has('select'),false);
  let calls=0;
  const partial=createSampleBank({context:decoded(),fetchData:async url=>{
    const name=new URL(url).pathname.split('/').pop();calls++;
    if(name==='metal-0.wav')return {ok:false};
    return localFetch(url);
  },base:'https://game.test/'});
  const partialReport=await partial.load();
  assert.equal(partialReport.failed,1);
  assert.equal(partialReport.loaded,Object.keys(manifest.cues).length-1);
  assert.equal(partial.status('metal-0'),'failed');
  assert.equal(partial.status('select'),'loaded');
  assert.ok(calls>1);
  const engine={};assert.equal(partial.seedCombatBuffers(engine),19);
});

function fakeContext(){
  const nodes=[];
  const node=extra=>({connect(){},disconnect(){},start(){},stop(){},...extra});
  return {state:'running',currentTime:10,sampleRate:22050,destination:{},nodes,
    createGain(){const g=node({gain:{value:0,setTargetAtTime(v){this.value=v;}}});nodes.push(g);return g;},
    createBufferSource(){const s=node({buffer:null,loop:false,playbackRate:{value:1},onended:null});nodes.push(s);return s;},
    createStereoPanner(){const p=node({pan:{value:0,setTargetAtTime(v){this.value=v;}}});nodes.push(p);return p;},
    decodeAudioData:async data=>({decoded:true,bytes:data.byteLength})};
}
function engineClass(options){
  class Engine{
    constructor(settings={}){this.settings={volume:1,music:true,...settings};this.procedural=[];}
    unlock(){this.context=fakeContext();this.master={connect(){}};}
    play(name){this.procedural.push(name);}
    warHorn(){this.procedural.push('horn');return true;}
    weather(){this.weatherCalls=(this.weatherCalls||0)+1;this.rainGain={gain:{value:1,setTargetAtTime(v){this.value=v;}}};}
    tick(){this.tickCalls=(this.tickCalls||0)+1;}
  }
  installSampledAudio(Engine,options);
  return Engine;
}
const ready=async engine=>{await engine.sampleBank.load();await new Promise(resolve=>setImmediate(resolve));};

test('the real AudioEngine has the sampled layer installed as its outermost wrapper',()=>{
  assert.equal(typeof AudioEngine.prototype.sampleDiagnostics,'function');
  assert.equal(typeof AudioEngine.prototype.play,'function');
  assert.equal(typeof AudioEngine.prototype.warHorn,'function');
  const silent=new AudioEngine({volume:0});
  assert.equal(silent.sampleDiagnostics().ready,false);
  assert.doesNotThrow(()=>silent.unlock());
});

test('decoded samples take over UI, horn, weather and music cues while procedural synthesis stays the fallback',async()=>{
  const Engine=engineClass({fetchData:localFetch,base:'https://game.test/app/'});
  const engine=new Engine();engine.unlock();await ready(engine);
  const report=engine.sampleDiagnostics();
  assert.equal(report.loaded,Object.keys(manifest.cues).length);
  assert.equal(report.failed,0);

  engine.play('select');
  assert.deepEqual(engine.procedural,[],'sampled cue does not double up with synthesis');
  const sources=engine.context.nodes.filter(node=>node.buffer);
  assert.ok(sources.length>0);assert.equal(sources.at(-1).buffer.decoded,true);

  engine.play('attack');
  assert.deepEqual(engine.procedural,['attack'],'unmapped cues fall through unchanged');

  assert.equal(engine.warHorn(),true);
  assert.equal(engine.warHorn(),false,'war horn cooldown still applies to samples');
  assert.ok(!engine.procedural.includes('horn'));

  engine.weather({type:'rain',amount:.8,cloud:.3},true);
  assert.equal(engine.weatherCalls,1,'procedural weather still runs');
  assert.equal(engine.rainGain.gain.value,0,'procedural rain bed is muted, not doubled');
  assert.ok(engine.sampleLoops.has('rain'));
  assert.equal(engine.sampleLoops.get('rain').source.loop,true);

  engine.tick(.016);
  assert.equal(engine.tickCalls,1,'procedural score still runs');
  assert.ok(engine.sampleLoops.has('pad'));

  engine.settings.volume=0;engine.play('coin');
  assert.ok(engine.procedural.includes('coin'),'muted settings fall back safely');
});

test('a failed or unavailable pack leaves every procedural path untouched',async()=>{
  const Engine=engineClass({fetchData:async()=>({ok:false}),base:'https://game.test/'});
  const engine=new Engine();engine.unlock();await ready(engine);
  assert.equal(engine.sampleDiagnostics().loaded,0);
  engine.play('select');engine.play('attack');engine.warHorn();engine.weather({amount:.5},true);engine.tick(.016);
  assert.deepEqual(engine.procedural,['select','attack','horn']);
  assert.equal(engine.weatherCalls,1);
  assert.equal(engine.tickCalls,1);
  assert.equal(engine.rainGain.gain.value,1,'procedural rain bed is left at full level');
  assert.equal(engine.sampleLoops,undefined,'no loop nodes are created without samples');
});
