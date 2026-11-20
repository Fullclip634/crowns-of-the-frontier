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
function addEarlyReflections(samples,rate,mix=.18){
  const out=new Float32Array(samples.length);
  const taps=[[Math.floor(.013*rate),.46],[Math.floor(.027*rate),-.31],[Math.floor(.044*rate),.22],[Math.floor(.068*rate),.14]];
  for(let i=0;i<samples.length;i++){
    let wet=0;
    for(const [delay,gain] of taps)if(i>=delay)wet+=samples[i-delay]*gain;
    out[i]=samples[i]*(1-mix*.35)+wet*mix;
  }
  return out;
}
function pluckedString(samples,rate,{frequency,start=0,duration,level=.38,damping=.992,seed=101}){
  const first=Math.floor(start*rate),count=Math.floor(duration*rate),period=Math.max(4,Math.round(rate/frequency));
  const ring=new Float32Array(period),random=rng(seed);
  for(let i=0;i<period;i++)ring[i]=random()*.65+Math.sin(TAU*i/period)*.35;
  let idx=0,prev=0;
  for(let i=0;i<count&&first+i<samples.length;i++){
    const t=i/rate,cur=ring[idx];
    const next=(cur+prev)*.5*damping;
    prev=cur;ring[idx]=next;idx=(idx+1)%period;
    samples[first+i]+=cur*level*envelope(t,duration,.002,.04);
  }
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
      pluckedString(s,RATE,{frequency:f,start:i*.082,duration:.46,level:.36-i*.03,damping:.994,seed:41+i});
      tone(s,RATE,{frequency:f,start:i*.082,duration:.42,level:.22-i*.02,type:'triangle',decay:.24});
    });
    return addEarlyReflections(s,RATE,.22);
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
    return addEarlyReflections(s,RATE,.24);
  },
  victory:duration=>{
    const s=buffer(duration);
    tone(s,RATE,{frequency:146.83,start:0,duration:1.45,level:.26,type:'triangle',decay:.85});
    [293.66,369.99,440,587.33].forEach((f,i)=>{
      const st=i*.21;
      pluckedString(s,RATE,{frequency:f,start:st,duration:.92,level:.32,damping:.995,seed:71+i});
      tone(s,RATE,{frequency:f,start:st,duration:.95,level:.24,type:'triangle',decay:.55});
      tone(s,RATE,{frequency:f*1.5,start:st+.01,duration:.75,level:.11,type:'sine',decay:.42});
    });
    return addEarlyReflections(s,RATE,.25);
  },
};
const UI_DURATIONS={select:.18,order:.20,coin:.32,complete:.72,alarm:1.3,victory:1.6};

// Economy & battlefield Foley cues: wood chopping, ore mining, construction hammering, blacksmith anvil, cavalry hooves, fire crackle.
const foley={
  chop:duration=>{
    const s=buffer(duration);
    tone(s,RATE,{frequency:118,duration:.11,level:.52,type:'triangle',decay:.032});
    tone(s,RATE,{frequency:238,start:.004,duration:.07,level:.28,type:'sine',decay:.022});
    noise(s,RATE,{duration:.065,level:.42,decay:.018,lowpass:.32,seed:301});
    return addEarlyReflections(s,RATE,.16);
  },
  mine:duration=>{
    const s=buffer(duration);
    [1320,1985,2840,3610].forEach((f,i)=>tone(s,RATE,{frequency:f,duration:.16,level:.24/(i+1),type:'sine',decay:.045/(i*.6+1)}));
    noise(s,RATE,{duration:.05,level:.32,decay:.014,lowpass:.55,seed:307});
    return addEarlyReflections(s,RATE,.20);
  },
  hammer:duration=>{
    const s=buffer(duration);
    tone(s,RATE,{frequency:165,duration:.09,level:.48,type:'triangle',decay:.025});
    tone(s,RATE,{frequency:340,duration:.05,level:.24,type:'sine',decay:.016});
    noise(s,RATE,{duration:.045,level:.30,decay:.012,lowpass:.38,seed:311});
    return addEarlyReflections(s,RATE,.15);
  },
  anvil:duration=>{
    const s=buffer(duration);
    [1140,1715,2590,3420].forEach((f,i)=>tone(s,RATE,{frequency:f,duration:.24,level:.28/(i*.8+1),type:'sine',decay:.075/(i*.5+1)}));
    noise(s,RATE,{duration:.03,level:.24,decay:.009,lowpass:.6,seed:313});
    return addEarlyReflections(s,RATE,.24);
  },
  hoof:duration=>{
    const s=buffer(duration);
    tone(s,RATE,{frequency:88,start:0,duration:.08,level:.44,type:'sine',decay:.024});
    noise(s,RATE,{start:0,duration:.06,level:.28,decay:.016,lowpass:.22,seed:317});
    tone(s,RATE,{frequency:96,start:.075,duration:.08,level:.38,type:'sine',decay:.024});
    noise(s,RATE,{start:.075,duration:.06,level:.24,decay:.016,lowpass:.24,seed:319});
    return s;
  },
  fire:duration=>{
    const s=buffer(duration),random=rng(331);let low=0;
    for(let i=0;i<s.length;i++){
      const t=i/RATE,n=random();low+=.18*(n-low);
      const snap=(i%997===0||i%1613===0)?random()*.65:0;
      s[i]=((n-low)*.32+low*.24+snap)*envelope(t,duration,.02,.04);
    }
    return s;
  },
};
const FOLEY_DURATIONS={chop:.20,mine:.22,hammer:.18,anvil:.28,hoof:.20,fire:.34};

// Voice / brass layer.
function horn(duration){
  const s=buffer(duration);
  for(const [harmonic,level]of [[1,.38],[2,.28],[3,.18],[4,.10],[5,.05],[6,.025]]){
    for(let i=0;i<s.length;i++){
      const t=i/RATE,attack=Math.min(1,t/.11),release=Math.min(1,Math.max(0,(duration-t)/.24));
      const pitch=146.83+Math.min(1,t/.18)*27.78;
      s[i]+=Math.sin(TAU*pitch*harmonic*t+Math.sin(TAU*3.2*t)*.04)*level*attack*release*(1+.035*Math.sin(TAU*4.8*t));
    }
  }
  noise(s,RATE,{duration:.14,level:.08,decay:.05,lowpass:.28,seed:97});
  return addEarlyReflections(s,RATE,.26);
}
// Weather / biome / music beds: low-level seamless loops with Poisson droplet distribution (zero periodic clicks!).
function rain(duration){
  const s=buffer(duration),random=rng(7331);let b0=0,b1=0,b2=0,dc=0;
  for(let i=0;i<s.length;i++){
    const w=random();
    b0=.994*b0+w*.032;b1=.978*b1+w*.038;b2=.920*b2+w*.052;
    const pink=b0+b1+b2+w*.024;
    dc+=.012*(pink-dc);
    s[i]=(pink-dc)*.38;
  }
  // Poisson-distributed soft raindrops (never periodic, zero 0.37s rhythmic click!).
  let cursor=Math.floor(RATE*.04);
  while(cursor<s.length-Math.floor(RATE*.03)){
    cursor+=Math.floor(RATE*(.018+Math.abs(random())*.075));
    const dropFreq=950+Math.abs(random())*1150,dropAmp=.018+Math.abs(random())*.024;
    const dropLen=Math.min(Math.floor(RATE*.014),s.length-cursor);
    for(let k=0;k<dropLen;k++){
      const dt=k/RATE;
      s[cursor+k]+=Math.sin(TAU*dropFreq*dt)*Math.exp(-dt/.0035)*dropAmp;
    }
  }
  return s;
}
function biomeAmbience(kind,duration){
  const s=buffer(duration),random=rng(kind==='amb-coast'?4111:kind==='amb-river'?5227:kind==='amb-tundra'?6337:7451);
  let low=0,mid=0;
  for(let i=0;i<s.length;i++){
    const t=i/RATE,n=random();
    low+=.045*(n-low);mid+=.18*(n-mid);
    if(kind==='amb-coast'){
      // Rolling ocean surf wash + gentle foam hiss
      const swell=.52+.48*Math.sin(TAU*t/duration);
      s[i]=(low*.55+(mid-low)*.45*swell)*(.28+.34*swell);
    }else if(kind==='amb-river'){
      // Continuous babbling brook ripple
      const ripple=.72+.28*Math.sin(TAU*3*t/duration)*Math.cos(TAU*5*t/duration);
      s[i]=((mid-low)*.62+Math.sin(TAU*(420+90*Math.sin(TAU*2*t/duration))*t)*.03)*ripple*.35;
    }else if(kind==='amb-tundra'){
      // Crisp high-altitude whistling alpine wind
      const gust=.65+.35*Math.sin(TAU*t/duration+.4);
      s[i]=(low*.48+Math.sin(TAU*(380+45*gust)*t)*.045+(mid-low)*.25)*gust*.34;
    }else{
      // Volcanic deep subterranean magma rumble
      const pulse=.75+.25*Math.sin(TAU*t/duration);
      s[i]=(low*.82+Math.sin(TAU*48*t)*.14+Math.sin(TAU*72*t)*.08)*pulse*.38;
    }
  }
  return s;
}
function pad(duration){
  const s=buffer(duration);
  // D-Dorian medieval modal drone + plucked harp fifths (D3, A3, D4, F4, A4)
  for(const [i,f]of [146.83,220,293.66,349.23,440].entries()){
    for(let j=0;j<s.length;j++){
      const t=j/RATE;
      const wave=Math.sin(TAU*f*t)+.28*Math.sin(TAU*f*2*t);
      s[j]+=wave*(.14/(i*.75+1))*(.76+.24*Math.sin(TAU*t/duration+i*.8));
    }
  }
  return s;
}

const add=(definitions,name,group,samples,loop=false)=>definitions.push({name,group,loop,samples,duration:samples.length/RATE});
const definitions=[];
for(const [name,make]of Object.entries(ui))add(definitions,name,'ui',normalize(make(UI_DURATIONS[name])));
for(const [name,make]of Object.entries(foley))add(definitions,name,'foley',normalize(make(FOLEY_DURATIONS[name]),.76));
// Four variants per material match the procedural synthesiser's cache keys,
// so sampled combat keeps the existing per-hit variety.
for(const kind of ['metal','arrow','wood','siege','earth'])for(let variant=0;variant<4;variant++)
  add(definitions,`${kind}-${variant}`,'combat',normalize(addEarlyReflections(synthesizeCombat(kind,RATE,variant),RATE,.16),.78));
add(definitions,'horn','voice',normalize(horn(1.15)));
add(definitions,'rain','weather',normalize(loopable(rain(1.65),RATE),.5),true);
for(const kind of ['amb-coast','amb-river','amb-tundra','amb-volcanic'])
  add(definitions,kind,'weather',normalize(loopable(biomeAmbience(kind,1.25),RATE),.46),true);
add(definitions,'pad','music',normalize(loopable(pad(2.4),RATE),.55),true);

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
