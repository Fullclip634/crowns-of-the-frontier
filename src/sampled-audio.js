// Browser wiring for the CC0 sample pack. Installed last so it wraps the
// procedural layers: when a sample is decoded it takes over that cue, and
// when the pack is unavailable every call falls straight through to the
// original Web Audio synthesis. Nothing here can silence the game.
import {createSampleBank,UI_SAMPLE_CUES} from './sample-bank.js';
import {HORN_COOLDOWN} from './voice-system.js';

const HORN_FUNDAMENTAL=174.61;

function playCue(engine,name,{gain=.8,rate=1,pan=0}={}){
  const ctx=engine.context,buffer=engine.sampleBank?.get(name);
  if(!ctx||!buffer||ctx.state!=='running'||engine.settings.volume<=0)return false;
  const source=ctx.createBufferSource(),level=ctx.createGain();
  source.buffer=buffer;source.playbackRate.value=rate;
  level.gain.value=gain*(engine.settings.volume||.65);
  source.connect(level);
  if(pan&&ctx.createStereoPanner){const panner=ctx.createStereoPanner();panner.pan.value=Math.max(-.8,Math.min(.8,pan));level.connect(panner);panner.connect(engine.master);}
  else level.connect(engine.master);
  source.start();
  source.onended=()=>{source.disconnect();level.disconnect();};
  return true;
}

// Loop beds are created once and faded by gain; stopping/restarting a buffer
// source on every weather tick would click and churn graph nodes.
function loopBed(engine,name,level){
  const ctx=engine.context;if(!ctx)return;
  engine.sampleLoops??=new Map();
  let bed=engine.sampleLoops.get(name);
  if(!bed){
    const buffer=engine.sampleBank.get(name);if(!buffer)return;
    const source=ctx.createBufferSource(),gain=ctx.createGain();
    source.buffer=buffer;source.loop=engine.sampleBank.isLoop(name);
    gain.gain.value=0;source.connect(gain);gain.connect(engine.master);source.start();
    source.onended=()=>{if(engine.sampleLoops?.get(name)===bed)engine.sampleLoops.delete(name);source.disconnect();gain.disconnect();};
    bed={source,gain};engine.sampleLoops.set(name,bed);
  }
  bed.gain.gain.setTargetAtTime(level,ctx.currentTime,.35);
}

// `options` exists for deterministic tests; the game uses the real fetch and
// document.baseURI defaults.
export function installSampledAudio(AudioEngine,options={}){
  const p=AudioEngine.prototype,unlock=p.unlock,play=p.play,warHorn=p.warHorn,weather=p.weather,tick=p.tick;

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

  p.play=function(name,...rest){
    if(UI_SAMPLE_CUES.includes(name)&&this.sampleBank?.has(name)&&playCue(this,name,{gain:name==='alarm'?.34:.55}))return;
    return play.call(this,name,...rest);
  };

  p.warHorn=function(fundamental=HORN_FUNDAMENTAL){
    if(this.sampleBank?.has('horn')&&this.context?.state==='running'&&this.settings.volume>0&&this.settings.warHorns!==false){
      const now=this.context.currentTime;
      if(now-(this.lastHornAt??-Infinity)>=HORN_COOLDOWN){
        this.lastHornAt=now;
        if(playCue(this,'horn',{gain:.42,rate:fundamental/HORN_FUNDAMENTAL}))return true;
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
    loopBed(this,'rain',amount*(state?.type==='snow'?.012:.07));
  };

  p.tick=function(dt){
    tick.call(this,dt);
    if(!this.sampleBank?.has('pad'))return;
    const enabled=this.settings.music&&this.settings.volume>0;
    loopBed(this,'pad',enabled?.035:0);
  };
}
