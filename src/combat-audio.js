import {Vector3} from 'three';
import {UNITS} from './data.js';

const clamp=(value,min,max)=>Math.max(min,Math.min(max,value));
export const MAX_COMBAT_VOICES=12;

// Use the current camera matrices, including immediately after a minimap jump.
// Fog visibility alone does not mean a battle is on the screen.
export function createCombatListener(view,active=()=>true){
  const point=new Vector3();
  return entity=>{
    if(!active()||!entity||!Number.isFinite(entity.x)||!Number.isFinite(entity.z)||!view?.camera)return {gain:0,pan:0};
    if(entity.owner!==0&&!view.sim?.isVisible(entity.x,entity.z))return {gain:0,pan:0};
    point.set(entity.x,(view.entityHeight?.(entity)||0)+(entity.kind==='building'?2:1),entity.z).project(view.camera);
    if(!Number.isFinite(point.x)||point.z<=-1||point.z>=1||Math.abs(point.x)>=1||Math.abs(point.y)>=1)return {gain:0,pan:0};
    const edge=clamp((1-Math.max(Math.abs(point.x),Math.abs(point.y)))/.16,0,1);
    const distance=Math.hypot(entity.x-view.target.x,entity.z-view.target.z)/Math.max(20,view.zoom*.85);
    return {gain:edge/(1+distance*distance),pan:clamp(point.x*.85,-.85,.85)};
  };
}

export function combatSoundKind(entity,target){
  if(['catapult','warship'].includes(entity?.type))return 'siege';
  if(entity?.kind==='building'||UNITS[entity?.type]?.role==='ranged')return 'arrow';
  if(entity?.type==='ram'||target?.kind==='building')return 'wood';
  return 'metal';
}

const DURATIONS={metal:.34,arrow:.2,wood:.28,siege:.7,earth:.2};
const LEVELS={metal:.4,arrow:.24,wood:.36,siege:.48,earth:.20};

export function projectileImpactSound(event){return event.siege?'siege':event.damage>0?(event.target?.kind==='building'?'wood':'metal'):'earth';}

export function steelResonances(sampleRate,variant=0){
  const pitch=2**(([-1.7,-.4,.8,1.6][((variant%4)+4)%4])/12);
  return [940,1417,2161,3127,4567,6389].flatMap((frequency,index)=>frequency*pitch<sampleRate*.45?[{frequency:frequency*pitch,level:[.21,.22,.18,.14,.09,.055][index],decay:[.055,.09,.073,.050,.036,.024][index]}]:[]);
}

// Original, cached effects: inharmonic steel ringing, a short blade scrape,
// bowstring twang, and timber/stone impacts. No downloaded game recordings.
export function synthesizeCombat(kind,sampleRate=44100,variant=0){
  if(!DURATIONS[kind])throw new Error('Unknown combat sound');
  const data=new Float32Array(Math.ceil(DURATIONS[kind]*sampleRate));
  let seed=(7919+variant*104729)>>>0,previous=0,low=0,peak=0;
  const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/2147483648-1;};
  const modes=kind==='metal'?steelResonances(sampleRate,variant).map(mode=>({...mode,sine:0,cosine:1,stepSine:Math.sin(2*Math.PI*mode.frequency/sampleRate),stepCosine:Math.cos(2*Math.PI*mode.frequency/sampleRate),gain:mode.level,damping:Math.exp(-1/(sampleRate*mode.decay))})):[];
  for(let i=0;i<data.length;i++){
    const t=i/sampleRate,noise=random(),bright=noise-previous;previous=noise;low+=.08*(noise-low);let value=0;
    if(kind==='metal'){
      // Damped, inharmonic blade modes plus a hard contact and short scrape.
      // Recurrences avoid a sine and exponential per mode per sample. Modes
      // above the device's useful bandwidth are omitted rather than aliased.
      for(const mode of modes){value+=mode.sine*mode.gain;const sine=mode.sine;mode.sine=sine*mode.stepCosine+mode.cosine*mode.stepSine;mode.cosine=mode.cosine*mode.stepCosine-sine*mode.stepSine;mode.gain*=mode.damping;}
      value+=bright*.38*Math.exp(-t/.004)+(noise-low)*.21*Math.exp(-t/.022)+Math.sin(2*Math.PI*185*t)*.09*Math.exp(-t/.018);
      if(t>.016)value+=bright*.12*Math.exp(-(t-.016)/.010);
    }else if(kind==='arrow'){
      value=Math.sin(2*Math.PI*(310*t+30*(1-Math.exp(-t/.04))))*.58*Math.exp(-t/.04)+bright*.18*Math.exp(-t/.012);
    }else if(kind==='wood'){
      value=Math.sin(2*Math.PI*(105+variant*13)*t)*.65*Math.exp(-t/.045)+Math.sin(2*Math.PI*247*t)*.17*Math.exp(-t/.018)+noise*.3*Math.exp(-t/.02);
    }else if(kind==='earth'){
      value=low*.9*Math.exp(-t/.035)+noise*.10*Math.exp(-t/.016);
    }else{
      value=low*2.4*Math.exp(-t/.18)+Math.sin(2*Math.PI*64*t)*.3*Math.exp(-t/.12)+bright*.14*Math.exp(-t/.018);
    }
    // A brief attack and tail avoid clicks even on the smallest audio buffer.
    value*=Math.min(1,t/.0015)*Math.min(1,(data.length-i)/(sampleRate*.012));data[i]=value;peak=Math.max(peak,Math.abs(value));
  }
  if(peak>0)for(let i=0;i<data.length;i++)data[i]*=.82/peak;
  return data;
}

export function installCombatAudio(AudioEngine){
  const p=AudioEngine.prototype;
  p.setCombatListener=function(listener){this.combatListener=listener;};
  p.clearCombat=function(){
    for(const voice of this.combatVoices||[])this.retireCombatVoice(voice);
    this.lastCombatAt=-Infinity;
  };
  p.retireCombatVoice=function(voice){
    if(voice.retiring)return;voice.retiring=true;
    const t=this.context.currentTime;voice.gain.gain.setTargetAtTime(0,t,.012);voice.source.stop(t+.065);
  };
  p.updateCombat=function(){
    if(!this.context)return;
    for(const voice of this.combatVoices||[]){
      if(voice.retiring)continue;
      const spatial=this.settings.volume>0?this.combatListener?.(voice.point):null;
      if(!spatial||spatial.gain<=.005){this.retireCombatVoice(voice);continue;}
      if(Math.abs(voice.level-spatial.gain)>.01){voice.gain.gain.setTargetAtTime(spatial.gain*LEVELS[voice.kind],this.context.currentTime,.025);voice.level=spatial.gain;}
      if(voice.pan&&Math.abs(voice.pan.pan.value-spatial.pan)>.01)voice.pan.pan.setTargetAtTime(spatial.pan,this.context.currentTime,.025);
    }
  };
  p.combat=function(entity,target,materialKind){
    const ctx=this.context;
    if(ctx?.state!=='running'||this.settings.volume<=0)return false;
    const spatial=this.combatListener?.(entity);
    if(!spatial||spatial.gain<=.005)return false;
    this.combatVoices??=new Set();this.combatBuffers??=new Map();
    // Bound both overlap and event bursts, rather than creating oscillators
    // for every soldier in a large fight. Offscreen events consume no budget.
    if(this.combatVoices.size>=MAX_COMBAT_VOICES||ctx.currentTime-(this.lastCombatAt??-Infinity)<.035)return false;
    const kind=materialKind||combatSoundKind(entity,target);if(!DURATIONS[kind])return false;
    const variant=(this.combatSequence=(this.combatSequence||0)+1)%4,key=`${kind}:${variant}`;
    let buffer=this.combatBuffers.get(key);
    if(!buffer){const samples=synthesizeCombat(kind,ctx.sampleRate,variant);buffer=ctx.createBuffer(1,samples.length,ctx.sampleRate);buffer.getChannelData(0).set(samples);this.combatBuffers.set(key,buffer);}
    const source=ctx.createBufferSource(),gain=ctx.createGain(),pan=ctx.createStereoPanner?.();source.buffer=buffer;gain.gain.value=spatial.gain*LEVELS[kind];source.connect(gain);
    if(pan){pan.pan.value=spatial.pan;gain.connect(pan);pan.connect(this.master);}else gain.connect(this.master);
    const voice={source,gain,pan,kind,level:spatial.gain,point:{x:entity.x,z:entity.z,owner:entity.owner,kind:entity.kind,type:entity.type},retiring:false};
    this.combatVoices.add(voice);this.lastCombatAt=ctx.currentTime;
    source.onended=()=>{this.combatVoices.delete(voice);source.disconnect();gain.disconnect();pan?.disconnect();};
    source.start();return true;
  };
}
