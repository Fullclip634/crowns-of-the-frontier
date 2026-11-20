// Browser wiring for the CC0 sample pack. Installed last so it wraps the
// procedural layers: when a sample is decoded it takes over that cue, and
// when the pack is unavailable every call falls straight through to the
// original Web Audio synthesis. Nothing here can silence the game.
import {createSampleBank,UI_SAMPLE_CUES,FOLEY_SAMPLE_CUES,AMBIENCE_SAMPLE_CUES} from './sample-bank.js';
import {HORN_COOLDOWN} from './voice-system.js';

const HORN_FUNDAMENTAL=174.61;
const BIOME_AMBIENCE={coast:'amb-coast',archipelago:'amb-coast',rivers:'amb-river',riverland:'amb-river',valley:'amb-river',tundra:'amb-tundra',winter:'amb-tundra',volcanic:'amb-volcanic'};

function playCue(engine,name,{gain=.8,rate=1,pan=0,bus=null,reverb=false}={}){
  const ctx=engine.context,buffer=engine.sampleBank?.get(name);
  if(!ctx||!buffer||ctx.state!=='running'||engine.settings.volume<=0)return false;
  const source=ctx.createBufferSource(),level=ctx.createGain();
  source.buffer=buffer;if(source.playbackRate)source.playbackRate.value=rate;
  level.gain.value=gain*(engine.settings.volume||.65);
  source.connect(level);
  const outBus=bus||engine.master;
  let panner=null;
  if(pan&&ctx.createStereoPanner){panner=ctx.createStereoPanner();panner.pan.value=Math.max(-.8,Math.min(.8,pan));level.connect(panner);panner.connect(outBus);if(reverb&&engine.reverbSend)panner.connect(engine.reverbSend);}
  else{level.connect(outBus);if(reverb&&engine.reverbSend)level.connect(engine.reverbSend);}
  source.start();
  source.onended=()=>{source.disconnect();level.disconnect();panner?.disconnect();};
  return true;
}

// Loop beds are created once and faded by gain; stopping/restarting a buffer
// source on every weather tick would click and churn graph nodes.
function loopBed(engine,name,level,bus=null){
  const ctx=engine.context;if(!ctx)return;
  engine.sampleLoops??=new Map();
  let bed=engine.sampleLoops.get(name);
  if(!bed){
    const buffer=engine.sampleBank.get(name);if(!buffer)return;
    const source=ctx.createBufferSource(),gain=ctx.createGain();
    source.buffer=buffer;source.loop=engine.sampleBank.isLoop(name);
    gain.gain.value=0;source.connect(gain);gain.connect(bus||engine.master);source.start();
    source.onended=()=>{if(engine.sampleLoops?.get(name)===bed)engine.sampleLoops.delete(name);source.disconnect();gain.disconnect();};
    bed={source,gain};engine.sampleLoops.set(name,bed);
  }
  bed.gain.gain.setTargetAtTime(level,ctx.currentTime,.35);
}

// `options` exists for deterministic tests; the game uses the real fetch and
// document.baseURI defaults.
export function installSampledAudio(AudioEngine,options={}){
  const p=AudioEngine.prototype,unlock=p.unlock,play=p.play,warHorn=p.warHorn,weather=p.weather,tick=p.tick,updateScene=p.updateScene;

  p.sampleDiagnostics=function(){return this.sampleBank?.diagnostics()||{ready:false,loaded:0,failed:0,total:0,bytes:0,errors:['audio not unlocked'],samples:[]};};

  p.unlock=function(){
    unlock.call(this);
    if(!this.context||this.sampleBank)return;
    this.sampleBank=createSampleBank({context:this.context,...options});
    this.sampleBank.load().then(report=>{
      this.sampleLoadReport=report;
      // The combat synthesiser reuses its ${kind}:${variant} cache, so seeding
      // decoded samples swaps the source with zero changes to panning/budgeting.
      this.sampleBank.seedCombatBuffers(this);
    }).catch(()=>{});
  };

  p.foley=function(name,{gain=.28,rate=1,pan=0}={}){
    if(FOLEY_SAMPLE_CUES.includes(name)&&this.sampleBank?.has(name)){
      const jitter=.93+Math.random()*.14;
      if(playCue(this,name,{gain,rate:rate*jitter,pan,bus:this.sfxBus||this.master,reverb:true}))return true;
    }
    return this.proceduralFoley?.(name,{gain,pan})||false;
  };

  p.play=function(name,...rest){
    if(UI_SAMPLE_CUES.includes(name)&&this.sampleBank?.has(name)&&playCue(this,name,{gain:name==='alarm'?.34:.55,bus:this.sfxBus||this.master,reverb:name==='complete'||name==='victory'||name==='alarm'})){
      if(name==='alarm')this.duckMusic?.(1.5,.62);
      return;
    }
    return play.call(this,name,...rest);
  };

  p.warHorn=function(fundamental=HORN_FUNDAMENTAL){
    if(this.sampleBank?.has('horn')&&this.context?.state==='running'&&this.settings.volume>0&&this.settings.warHorns!==false){
      const now=this.context.currentTime;
      if(now-(this.lastHornAt??-Infinity)>=HORN_COOLDOWN){
        this.lastHornAt=now;
        if(playCue(this,'horn',{gain:.42,rate:fundamental/HORN_FUNDAMENTAL,bus:this.voiceBus||this.master,reverb:true})){
          this.duckMusic?.(1.9,.58);
          return true;
        }
      }else return false;
    }
    return warHorn.call(this,fundamental);
  };

  p.weather=function(state,active=true){
    weather.call(this,state,active);
    if(!this.sampleBank?.has('rain')||!this.context)return;
    const enabled=active&&this.settings.weatherSounds!==false&&this.settings.volume>0;
    const amount=enabled?(state?.amount||0):0;
    // Replace the procedural noise bed rather than doubling its loudness.
    if(this.rainGain)this.rainGain.gain.setTargetAtTime(0,this.context.currentTime,.2);
    loopBed(this,'rain',amount*(state?.type==='snow'?.012:.07),this.ambienceBus||this.master);
  };

  p.updateScene=function(info={}){
    updateScene?.call(this,info);
    if(!this.context||!this.sampleBank)return;
    const active=info.active!==false&&this.settings.weatherSounds!==false&&this.settings.volume>0;
    const want=active?BIOME_AMBIENCE[info.sim?.options?.map||this.currentMap]:null;
    for(const cue of AMBIENCE_SAMPLE_CUES){
      if(!this.sampleBank.has(cue))continue;
      if(cue===want)loopBed(this,cue,.032,this.ambienceBus||this.master);
      else if(this.sampleLoops?.has(cue))loopBed(this,cue,0,this.ambienceBus||this.master);
    }
  };

  p.tick=function(dt){
    tick.call(this,dt);
    if(!this.sampleBank?.has('pad'))return;
    const enabled=this.settings.music&&this.settings.volume>0;
    const level=enabled?(.032+(this.combatIntensity||0)*.016):0;
    loopBed(this,'pad',level,this.musicBus||this.master);
  };
}
