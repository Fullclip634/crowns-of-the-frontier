import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {AudioEngine} from '../src/audio.js';
import {createSampleBank,sampleURL,combatCue,UI_SAMPLE_CUES,HORN_SAMPLE_CUES,FOLEY_SAMPLE_CUES,AMBIENCE_SAMPLE_CUES,VOICE_SAMPLE_CUES,GRUNT_SAMPLE_CUES,MUSIC_STEM_CUES,COMBAT_KINDS,COMBAT_VARIANTS,MAX_PARALLEL_SAMPLE_LOADS} from '../src/sample-bank.js';
import {installSampledAudio} from '../src/sampled-audio.js';

const audioDir=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../public/audio');
const manifest=JSON.parse(fs.readFileSync(path.join(audioDir,'manifest.json'),'utf8'));
const license=fs.readFileSync(path.resolve(audioDir,'../AUDIO_LICENSES.txt'),'utf8');

function assertValidOggVorbis(bytes,name){
  assert.equal(bytes.toString('ascii',0,4),'OggS',`${name} begins with OggS container header`);
  assert.ok(bytes.includes(Buffer.from('vorbis')),`${name} contains a Vorbis audio stream`);
}

function assertValidMp3(bytes,name){
  const hasId3=bytes.toString('ascii',0,3)==='ID3';
  const hasSync=bytes[0]===0xff&&(bytes[1]&0xe0)===0xe0;
  assert.ok(hasId3||hasSync,`${name} begins with valid ID3 or MPEG frame sync`);
}

test('the shipped sample pack is a complete, valid, real recorded CC0 Ogg Vorbis + MP3 fallback bank',()=>{
  assert.equal(manifest.schema,2);
  assert.equal(manifest.license,'CC0-1.0');
  assert.equal(manifest.encoding,'ogg_vorbis');
  assert.equal(manifest.fallbackEncoding,'mp3');
  assert.equal(manifest.sampleRate,44100);
  assert.equal(manifest.proceduralFallback,true);
  assert.match(license,/CC0 1\.0/);
  const names=Object.keys(manifest.cues);
  assert.equal(names.length,76);
  const diskAudio=fs.readdirSync(audioDir).filter(f=>/\.(ogg|mp3|wav)$/i.test(f));
  assert.equal(diskAudio.filter(f=>f.endsWith('.wav')).length,0,'no stale synthetic WAVs left behind');
  assert.equal(diskAudio.filter(f=>f.endsWith('.ogg')).length,names.length,'no unreferenced or stale OGGs');
  assert.equal(diskAudio.filter(f=>f.endsWith('.mp3')).length,names.length,'every cue ships a matching Safari MP3 fallback');
  for(const cue of UI_SAMPLE_CUES)assert.ok(manifest.cues[cue],`UI cue ${cue} exists`);
  for(const cue of HORN_SAMPLE_CUES)assert.ok(manifest.cues[cue],`Horn cue ${cue} exists`);
  for(const cue of FOLEY_SAMPLE_CUES)assert.ok(manifest.cues[cue],`Foley cue ${cue} exists`);
  for(const cue of AMBIENCE_SAMPLE_CUES)assert.ok(manifest.cues[cue],`Ambience cue ${cue} exists`);
  for(const cue of VOICE_SAMPLE_CUES)assert.ok(manifest.cues[cue],`Voice cue ${cue} exists`);
  for(const cue of GRUNT_SAMPLE_CUES)assert.ok(manifest.cues[cue],`Grunt cue ${cue} exists`);
  for(const cue of MUSIC_STEM_CUES)assert.ok(manifest.cues[cue],`Music stem ${cue} exists`);
  for(const kind of COMBAT_KINDS)for(let v=0;v<COMBAT_VARIANTS;v++)assert.ok(manifest.cues[combatCue(kind,v)],`combat cue ${combatCue(kind,v)} exists`);
  for(const cue of ['horn','rain','pad'])assert.ok(manifest.cues[cue]);
  let totalOgg=0,totalMp3=0;
  for(const [name,cue]of Object.entries(manifest.cues)){
    const ogg=fs.readFileSync(path.join(audioDir,cue.file));
    const mp3=fs.readFileSync(path.join(audioDir,cue.fallbackFile));
    assert.equal(ogg.length,cue.bytes,`${name} OGG size matches manifest`);
    assert.equal(mp3.length,cue.fallbackBytes,`${name} MP3 size matches manifest`);
    assert.equal(crypto.createHash('sha256').update(ogg).digest('hex'),cue.sha256,`${name} OGG checksum matches manifest`);
    assert.equal(crypto.createHash('sha256').update(mp3).digest('hex'),cue.fallbackSha256,`${name} MP3 checksum matches manifest`);
    assertValidOggVorbis(ogg,name);
    assertValidMp3(mp3,name);
    assert.ok(cue.duration>.05&&cue.duration<=30,`${name} has a sane duration (${cue.duration}s)`);
    assert.equal(cue.loop,cue.group==='weather'||cue.group==='music');
    assert.ok(cue.source&&/CC0 1\.0/.test(cue.source),`${name} records verified CC0 1.0 provenance`);
    assert.ok(license.includes(`- ${name} (`),`${name} provenance appears in AUDIO_LICENSES.txt`);
    totalOgg+=ogg.length;
    totalMp3+=mp3.length;
  }
  assert.ok(totalOgg<2_500_000,`primary OGG bank stays under 2.5 MB (${totalOgg} bytes)`);
  assert.ok(totalOgg+totalMp3<4_500_000,`combined OGG+MP3 pack stays under 4.5 MB (${totalOgg+totalMp3} bytes)`);
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
  assert.equal(sampleURL('select.ogg',base),'https://game.test/app/audio/select.ogg');
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
    if(name==='metal-0.ogg'||name==='metal-0.mp3')return {ok:false};
    return localFetch(url);
  },base:'https://game.test/'});
  const partialReport=await partial.load();
  assert.equal(partialReport.failed,1);
  assert.equal(partialReport.loaded,Object.keys(manifest.cues).length-1);
  assert.equal(partial.status('metal-0'),'failed');
  assert.equal(partial.status('select'),'loaded');
  assert.ok(calls>1);
  const engine={};assert.equal(partial.seedCombatBuffers(engine),19);

  // When primary OGG fails decoding (e.g. Safari), the bank transparently falls back to MP3.
  let mp3FallbackHits=0;
  const safariCtx={decodeAudioData:async data=>{
    const head=Buffer.from(data).toString('ascii',0,4);
    if(head==='OggS')throw new Error('Ogg unsupported');
    mp3FallbackHits++;
    return {decoded:true,codec:'mp3',bytes:data.byteLength};
  }};
  const safariBank=createSampleBank({context:safariCtx,fetchData:localFetch,base:'https://game.test/'});
  const safariReport=await safariBank.load();
  assert.equal(safariReport.failed,0,'every cue decodes via MP3 fallback when Ogg is rejected');
  assert.equal(mp3FallbackHits,Object.keys(manifest.cues).length);
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
    voice(kind){this.procedural.push('voice:'+kind);return true;}
    warHorn(){this.procedural.push('horn');return true;}
    weather(){this.weatherCalls=(this.weatherCalls||0)+1;this.rainGain={gain:{value:1,setTargetAtTime(v){this.value=v;}}};}
    scoreStage(){return this.stage||'peace';}
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
  assert.ok(engine.sampleLoops.has('music-peace'),'peace stage activates real medieval lute stem');
  assert.ok(engine.sampleLoops.get('music-peace').gain.gain.value>0);

  engine.stage='battle';
  engine.tick(.016);
  assert.equal(engine.sampleLoops.get('music-peace').gain.gain.value,0,'peace stem fades out on battle');
  assert.ok(engine.sampleLoops.get('music-battle').gain.gain.value>0,'battle stem fades in smoothly');

  assert.equal(engine.voice('order',{kind:'building',type:'towncenter'},'alder',0),false,'buildings never trigger sampled human voice');
  assert.equal(engine.voice('order',{kind:'unit',type:'ram'},'alder',0),false,'siege engines never trigger sampled human voice');
  assert.equal(engine.voice('order',{kind:'unit',type:'warship'},'alder',0),false,'ships never trigger sampled human voice');
  assert.equal(engine.voice('order',{type:'knight'},'alder',.2),true,'real CC0 human voice plays');
  assert.ok(!engine.procedural.includes('voice:order'),'sampled voice does not double with synth');
  assert.equal(engine.grunt(.1,.22),true,'real CC0 combat grunt plays');

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
