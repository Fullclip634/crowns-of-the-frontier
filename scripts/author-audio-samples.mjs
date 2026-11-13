// Authors the project's original PCM sample bank. Every waveform here is
// synthesised deterministically by this script - no third-party recordings,
// no network access, no licence ambiguity. The output is dedicated to the
// public domain (CC0-1.0) and is regenerated with:
//   node scripts/author-audio-samples.mjs
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {synthesizeCombat} from '../src/combat-audio.js';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const output=path.join(root,'public','audio');
const RATE=22050;
const TAU=Math.PI*2;

function rng(seed){let state=seed>>>0;return ()=>{state=(Math.imul(state,1664525)+1013904223)>>>0;return state/2147483648-1;};}
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));

function envelope(t,duration,attack=.004,release=.03){
  return Math.min(1,t/attack)*Math.min(1,Math.max(0,(duration-t)/release));
}
function tone(samples,rate,{frequency,start=0,duration,level=.4,type='sine',decay=.12,detune=0}){
  const first=Math.floor(start*rate),count=Math.floor(duration*rate);
  for(let i=0;i<count&&first+i<samples.length;i++){
    const t=i/rate,phase=TAU*(frequency+detune)*t;
    const wave=type==='sawtooth'?2*(phase/TAU-Math.floor(phase/TAU+.5))
      :type==='triangle'?2*Math.abs(2*(phase/TAU-Math.floor(phase/TAU+.5)))-1
      :Math.sin(phase);
    samples[first+i]+=wave*level*Math.exp(-t/decay)*envelope(t,duration);
  }
}
function noise(samples,rate,{start=0,duration,level=.3,decay=.1,lowpass=0,seed=1}){
  const random=rng(seed),first=Math.floor(start*rate),count=Math.floor(duration*rate);
  let low=0;
  for(let i=0;i<count&&first+i<samples.length;i++){
    const t=i/rate,n=random();low+=lowpass?lowpass*(n-low):0;
    const value=lowpass?low:n;
    samples[first+i]+=value*level*Math.exp(-t/decay)*envelope(t,duration);
  }
}
function normalize(samples,peak=.82){
  let maximum=0;for(const value of samples)maximum=Math.max(maximum,Math.abs(value));
  if(maximum>0)for(let i=0;i<samples.length;i++)samples[i]*=peak/maximum;
  return samples;
}
function loopable(samples,rate,fade=.08){
  // Equal-power crossfade of the tail into the head removes the loop seam.
  const count=Math.floor(fade*rate);
  for(let i=0;i<count;i++){
    const mix=(i+1)/count,a=Math.cos(mix*Math.PI/2),b=Math.sin(mix*Math.PI/2);
    const head=samples[i],tail=samples[samples.length-count+i];
    samples[i]=head*a+tail*b;
  }
  // Typed arrays have a fixed length; return the shortened loop as a copy.
  return samples.slice(0,samples.length-count);
}
function wav(samples,rate=RATE){
  const bytes=Buffer.alloc(44+samples.length*2);
  bytes.write('RIFF',0);bytes.writeUInt32LE(36+samples.length*2,4);bytes.write('WAVE',8);
  bytes.write('fmt ',12);bytes.writeUInt32LE(16,16);bytes.writeUInt16LE(1,20);
  bytes.writeUInt16LE(1,22);bytes.writeUInt32LE(rate,24);bytes.writeUInt32LE(rate*2,28);
  bytes.writeUInt16LE(2,32);bytes.writeUInt16LE(16,34);
  bytes.write('data',36);bytes.writeUInt32LE(samples.length*2,40);
  for(let i=0;i<samples.length;i++)bytes.writeInt16LE(clamp(Math.round(samples[i]*32767),-32768,32767),44+i*2);
  return bytes;
}
const buffer=(duration)=>new Float32Array(Math.ceil(duration*RATE));

// UI layer: studio-sculpted tactile cues that never clip or mask combat.
const ui={
  select:duration=>{
    const s=buffer(duration);
    tone(s,RATE,{frequency:392,duration:.085,level:.42,type:'sine',decay:.038});
    tone(s,RATE,{frequency:587.33,start:.022,duration:.11,level:.26,type:'triangle',decay:.05});
    noise(s,RATE,{duration:.018,level:.14,decay:.006,lowpass:.45,seed:11});
    return s;
  },
  order:duration=>{
    const s=buffer(duration);
    tone(s,RATE,{frequency:196,duration:.085,level:.46,type:'triangle',decay:.04});
    tone(s,RATE,{frequency:293.66,start:.045,duration:.12,level:.34,type:'sine',decay:.055});
    noise(s,RATE,{duration:.025,level:.1,decay:.008,lowpass:.25,seed:13});
    return s;
  },
  coin:duration=>{
    const s=buffer(duration);
    tone(s,RATE,{frequency:1174.66,duration:.18,level:.36,decay:.075});
    tone(s,RATE,{frequency:2349.32,duration:.12,level:.18,decay:.045});
    tone(s,RATE,{frequency:1479.98,start:.085,duration:.21,level:.34,decay:.10});
    tone(s,RATE,{frequency:2959.96,start:.085,duration:.14,level:.16,decay:.055});
    noise(s,RATE,{duration:.035,level:.11,decay:.009,lowpass:.55,seed:17});
    return s;
  },
  complete:duration=>{
    const s=buffer(duration);
    [293.66,369.99,440,587.33].forEach((f,i)=>{
      tone(s,RATE,{frequency:f,start:i*.085,duration:.44,level:.34-i*.03,type:'triangle',decay:.24});
      tone(s,RATE,{frequency:f*2,start:i*.085,duration:.30,level:.11,type:'sine',decay:.14});
    });
    return s;
  },
  alarm:duration=>{
    const s=buffer(duration);
    // Warm medieval war-horn fifth & muffled frame-drum double strike (no harsh buzzer).
    [[116.54,0,.44],[146.83,.34,.42],[174.61,.68,.58]].forEach(([f,st,dur])=>{
      tone(s,RATE,{frequency:f,start:st,duration:dur,level:.36,type:'triangle',decay:.28});
      tone(s,RATE,{frequency:f*2,start:st,duration:dur*.85,level:.16,type:'sine',decay:.22});
      tone(s,RATE,{frequency:f*3,start:st+.02,duration:dur*.7,level:.08,type:'sine',decay:.16});
    });
    [0,.34].forEach(st=>{
      tone(s,RATE,{frequency:82,start:st,duration:.14,level:.28,type:'sine',decay:.055});
      noise(s,RATE,{start:st,duration:.09,level:.14,decay:.03,lowpass:.14,seed:29});
    });
    return s;
  },
  victory:duration=>{
    const s=buffer(duration);
    tone(s,RATE,{frequency:130.81,start:0,duration:1.45,level:.26,type:'triangle',decay:.85});
    [261.63,329.63,392,523.25].forEach((f,i)=>{
      const st=i*.22;
      tone(s,RATE,{frequency:f,start:st,duration:.95,level:.32,type:'triangle',decay:.55});
      tone(s,RATE,{frequency:f*1.5,start:st+.01,duration:.75,level:.12,type:'sine',decay:.42});
      tone(s,RATE,{frequency:f*2,start:st,duration:.6,level:.09,type:'sine',decay:.32});
    });
    return s;
  },
};
const UI_DURATIONS={select:.18,order:.20,coin:.32,complete:.72,alarm:1.3,victory:1.6};

// Voice / brass layer.
function horn(duration){
  const s=buffer(duration);
  for(const [harmonic,level]of [[1,.38],[2,.25],[3,.15],[4,.08],[5,.04]]){
    for(let i=0;i<s.length;i++){
      const t=i/RATE,attack=Math.min(1,t/.08),release=Math.min(1,(duration-t)/.22);
      const pitch=146.83+Math.min(1,t/.18)*27.78;
      s[i]+=Math.sin(TAU*pitch*harmonic*t+Math.sin(TAU*3.2*t)*.05)*level*attack*release*(1+.04*Math.sin(TAU*5.1*t));
    }
  }
  return s;
}
// Weather / music beds: low-level seamless loops, mixed under the procedural
// Web Audio wind and score so either layer can carry the scene alone.
function rain(duration){
  const s=buffer(duration),random=rng(7331);let low=0;
  for(let i=0;i<s.length;i++){const n=random();low+=.28*(n-low);s[i]=(n*.42+low*.58)*.34;
    // Sparse, quiet droplets add detail without creating a rhythmic pulse.
    if(i%Math.floor(RATE*.37)===0)s[i]+=Math.exp(-((i%Math.floor(RATE*.37))/RATE)/.01)*.05;}
  return s;
}
function pad(duration){
  const s=buffer(duration);
  for(const [i,f]of [130.81,164.81,196,261.63].entries()){
    for(let j=0;j<s.length;j++){
      const t=j/RATE;
      s[j]+=Math.sin(TAU*f*t)*(.16/(i+1))*(.72+.28*Math.sin(TAU*(.21+i*.04)*t));
    }
  }
  return s;
}

const add=(definitions,name,group,samples,loop=false)=>definitions.push({name,group,loop,samples,duration:samples.length/RATE});
const definitions=[];
for(const [name,make]of Object.entries(ui))add(definitions,name,'ui',normalize(make(UI_DURATIONS[name])));
// Four variants per material match the procedural synthesiser's cache keys,
// so sampled combat keeps the existing per-hit variety.
for(const kind of ['metal','arrow','wood','siege','earth'])for(let variant=0;variant<4;variant++)
  add(definitions,`${kind}-${variant}`,'combat',normalize(synthesizeCombat(kind,RATE,variant),.78));
add(definitions,'horn','voice',normalize(horn(1.15)));
add(definitions,'rain','weather',normalize(loopable(rain(1.7),RATE),.5),true);
add(definitions,'pad','music',normalize(loopable(pad(2.6),RATE),.55),true);

fs.mkdirSync(output,{recursive:true});
const manifest={schema:1,generatedBy:'scripts/author-audio-samples.mjs',sampleRate:RATE,channels:1,encoding:'pcm_s16le',license:'CC0-1.0',proceduralFallback:true,cues:{}};
// Regeneration must be deterministic: drop samples from an older revision so
// the shipped pack never contains unreferenced binaries.
const expected=new Set(definitions.map(def=>`${def.name}.wav`));
for(const file of fs.readdirSync(output))if(file.endsWith('.wav')&&!expected.has(file))fs.unlinkSync(path.join(output,file));
let total=0;
for(const def of definitions){
  const bytes=wav(def.samples),file=`${def.name}.wav`;
  fs.writeFileSync(path.join(output,file),bytes);total+=bytes.length;
  manifest.cues[def.name]={file,group:def.group,duration:Number(def.duration.toFixed(4)),bytes:bytes.length,loop:def.loop,
    sha256:crypto.createHash('sha256').update(bytes).digest('hex')};
}
fs.writeFileSync(path.join(output,'manifest.json'),JSON.stringify(manifest,null,2)+'\n');
fs.writeFileSync(path.join(root,'public','AUDIO_LICENSES.txt'),
  'CC0 1.0 Universal (public domain dedication)\n\n'+
  'All files in /audio/ are original waveforms synthesised by\n'+
  'scripts/author-audio-samples.mjs for Crowns of the Frontier.\n'+
  'No third-party recordings, samples or libraries were used. The author\n'+
  'dedicates these generated audio files to the public domain under CC0 1.0:\n'+
  'https://creativecommons.org/publicdomain/zero/1.0/\n\n'+
  'The runtime keeps a procedural Web Audio fallback, so the game remains\n'+
  'fully playable when the sample pack cannot be fetched or decoded.\n');
console.log(JSON.stringify({cues:definitions.length,bytes:total,output:'public/audio'},null,2));
