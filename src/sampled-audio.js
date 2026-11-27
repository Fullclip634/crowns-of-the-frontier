// Browser wiring for the real recorded CC0 sample pack. Installed last so it
// wraps the procedural layers: when a sample is decoded it takes over that cue
// (UI, alerts, comms chimes, distinct war horns, combat, economy Foley, archetype
// unit acknowledgments, battle grunts, seamless biome ambience loops, and 4-stage
// adaptive medieval music), and when the pack is unavailable every call falls
// straight through to the Web Audio synthesis.
import {createSampleBank,UI_SAMPLE_CUES,FOLEY_SAMPLE_CUES,AMBIENCE_SAMPLE_CUES,GRUNT_SAMPLE_CUES,MUSIC_STEM_CUES} from './sample-bank.js';
import {HORN_COOLDOWN,VOICE_COOLDOWN,isHumanVoiceUnit,unitVoiceArchetype} from './voice-system.js';

const HORN_FUNDAMENTAL=174.61;
const BIOME_AMBIENCE={
  coast:'amb-coast',archipelago:'amb-coast',templelagoon:'amb-coast',
  rivers:'amb-river',riverland:'amb-river',valley:'amb-river',threecrowns:'amb-river',waterfallgorge:'amb-river',ironfall:'amb-river',
  tundra:'amb-tundra',winter:'amb-tundra',frostvale:'amb-tundra',frostfallsiege:'amb-tundra',
  arid:'amb-arid',canyon:'amb-arid',desert:'amb-arid',
  volcanic:'amb-volcanic',emberroad:'amb-volcanic',
  highlands:'amb-meadow',highland:'amb-meadow',woodland:'amb-meadow',ironpass:'amb-meadow',blackwood:'amb-meadow',timbervale:'amb-meadow',bastion:'amb-meadow',ironring:'amb-meadow',sunderedpass:'amb-meadow',oakhold:'amb-meadow',deepwoodravine:'amb-meadow',meadow:'amb-meadow',steppe:'amb-meadow',frontier:'amb-meadow',
};
const FACTION_VOICE_RATE={alder:1.0,sun:1.04,raven:.94,iron:.91,jade:1.03};
const STAGE_STEM={peace:'music-peace',tension:'music-tension',battle:'music-battle',climax:'music-climax'};

const UI_CUE_MIX=Object.freeze({
  select:{gain:.52,bus:'sfx',reverb:false},
  order:{gain:.50,bus:'sfx',reverb:false},
  coin:{gain:.54,bus:'sfx',reverb:false},
  complete:{gain:.58,bus:'sfx',reverb:true},
  alarm:{gain:.76,bus:'voice',reverb:true,duck:[2.2,.52]},
  victory:{gain:.78,bus:'voice',reverb:true,duck:[3.0,.42]},
  defeat:{gain:.76,bus:'voice',reverb:true,duck:[2.8,.42]},
  'age-up':{gain:.76,bus:'voice',reverb:true,duck:[2.4,.50]},
  'chat-all':{gain:.52,bus:'sfx',reverb:false},
  'chat-team':{gain:.60,bus:'sfx',reverb:true},
  flare:{gain:.64,bus:'sfx',reverb:true},
  tribute:{gain:.60,bus:'sfx',reverb:true},
  'notice-warn':{gain:.44,bus:'sfx',reverb:false},
});

function resolveUnitVoiceCue(kind,unit,bank){
  const arch=unitVoiceArchetype(unit);
  if(kind==='hold'&&bank.has('unit-hold'))return 'unit-hold';
  if(kind==='work'&&bank.has('voice-work'))return 'voice-work';
  if(kind==='attack'){
    if(arch==='hero'&&bank.has('unit-hero'))return 'unit-hero';
    if(arch==='archer'&&bank.has('unit-archer'))return 'unit-archer';
    if(bank.has('voice-attack'))return 'voice-attack';
  }
  if(arch==='hero'&&bank.has('unit-hero'))return 'unit-hero';
  if(arch==='healer'&&bank.has('unit-healer'))return 'unit-healer';
  if(arch==='cavalry'&&bank.has('unit-cavalry'))return 'unit-cavalry';
  if(arch==='archer'&&bank.has('unit-archer'))return 'unit-archer';
  if(arch==='worker'){
    if(kind==='select'&&bank.has('voice-select'))return 'voice-select';
    if(bank.has('voice-work'))return 'voice-work';
  }
  const fallback=kind==='select'?'voice-select':kind==='attack'?'voice-attack':kind==='work'?'voice-work':'voice-order';
  return bank.has(fallback)?fallback:null;
}

function playCue(engine,name,{gain=.8,rate=1,pan=0,bus=null,reverb=false}={}){
  const ctx=engine.context,buffer=engine.sampleBank?.get(name);
  if(!ctx||!buffer||ctx.state!=='running'||engine.settings.volume<=0)return false;
  const source=ctx.createBufferSource(),level=ctx.createGain();
  source.buffer=buffer;if(source.playbackRate)source.playbackRate.value=rate;
  // Submix buses already feed engine.master (volume * 0.24); avoid squaring master volume.
  level.gain.value=gain;
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
  const p=AudioEngine.prototype,unlock=p.unlock,play=p.play,voice=p.voice,warHorn=p.warHorn,weather=p.weather,tick=p.tick,updateScene=p.updateScene;

  p.sampleDiagnostics=function(){return this.sampleBank?.diagnostics()||{ready:false,coreReady:false,loaded:0,failed:0,total:0,bytes:0,errors:['audio not unlocked'],samples:[]};};

  p.unlock=function(){
    unlock.call(this);
    if(!this.context||this.sampleBank)return;
    this.sampleBank=createSampleBank({context:this.context,...options});
    this.sampleBank.load().then(report=>{
      this.sampleLoadReport=report;
      // The combat synthesiser reuses its ${kind}:${variant} cache, so seeding
      // decoded samples swaps the source with zero changes to panning/budgeting.
      this.sampleBank.seedCombatBuffers(this);
      this.hasSampledMusic=MUSIC_STEM_CUES.some(cue=>this.sampleBank.has(cue));
    }).catch(()=>{});
  };

  p.foley=function(name,{gain=.28,rate=1,pan=0}={}){
    if(FOLEY_SAMPLE_CUES.includes(name)&&this.sampleBank?.has(name)){
      const jitter=.93+Math.random()*.14;
      if(playCue(this,name,{gain,rate:rate*jitter,pan,bus:this.sfxBus||this.master,reverb:true}))return true;
    }
    return this.proceduralFoley?.(name,{gain,pan})||false;
  };

  p.grunt=function(pan=0,gain=.22){
    if(!this.context||this.context.state!=='running'||this.settings.volume<=0||this.settings.unitVoices===false||(this.settings.voiceVolume??1)<=0)return false;
    const now=this.context.currentTime;
    if(now-(this.lastGruntAt??-Infinity)<.42)return false;
    const cue=GRUNT_SAMPLE_CUES[(this.gruntSequence=(this.gruntSequence||0)+1)%GRUNT_SAMPLE_CUES.length];
    if(!this.sampleBank?.has(cue))return false;
    this.lastGruntAt=now;
    const rate=.90+Math.random()*.20;
    return playCue(this,cue,{gain:this.commsSpeaking?gain*.55:gain,rate,pan,bus:this.voiceBus||this.master,reverb:true});
  };

  p.voice=function(kind='order',unit=null,faction='alder',pan=0){
    if(!isHumanVoiceUnit(unit))return false;
    if(this.settings.unitVoices===false||(this.settings.voiceVolume??1)<=0)return false;
    const cue=this.sampleBank?resolveUnitVoiceCue(kind,unit,this.sampleBank):null;
    if(cue&&this.context?.state==='running'&&this.settings.volume>0){
      const now=this.context.currentTime;
      if(now-(this.lastVoiceAt??-Infinity)>=VOICE_COOLDOWN){
        this.lastVoiceAt=now;
        const arch=unitVoiceArchetype(unit);
        const unitRate=arch==='hero'?.96:arch==='worker'?1.03:1.0;
        const rate=unitRate*(FACTION_VOICE_RATE[faction]||1.0)*(.97+Math.random()*.06);
        const baseGain=this.commsSpeaking?.26:.46;
        if(playCue(this,cue,{gain:baseGain,rate,pan,bus:this.voiceBus||this.master,reverb:true})){
          this.duckMusic?.(.85,.72);
          return true;
        }
      }else return false;
    }
    return voice?voice.call(this,kind,unit,faction,pan):false;
  };

  p.play=function(name,...rest){
    const uiGain=this.settings.uiVolume??1;
    if(UI_SAMPLE_CUES.includes(name)){
      if(uiGain<=0)return;
      const spec=UI_CUE_MIX[name]||{gain:.55,bus:'sfx',reverb:false};
      const bus=spec.bus==='voice'?(this.voiceBus||this.master):(this.sfxBus||this.master);
      if(this.sampleBank?.has(name)&&playCue(this,name,{gain:spec.gain*uiGain,bus,reverb:spec.reverb})){
        if(spec.duck)this.duckMusic?.(spec.duck[0],spec.duck[1]);
        return;
      }
    }
    return play.call(this,name,...rest);
  };

  p.warHorn=function(fundamental=HORN_FUNDAMENTAL){
    const channel=typeof fundamental==='string'?fundamental:'royal';
    const cueName=channel==='enemy'&&this.sampleBank?.has('horn-enemy')?'horn-enemy'
      :channel==='ally'&&this.sampleBank?.has('horn-ally')?'horn-ally'
      :'horn';
    if(this.sampleBank?.has(cueName)&&this.context?.state==='running'&&this.settings.volume>0&&this.settings.warHorns!==false){
      const now=this.context.currentTime;
      this.lastHornByChannel??={};
      const last=channel==='royal'?(this.lastHornAt??-Infinity):(this.lastHornByChannel[channel]??-Infinity);
      const cd=channel==='royal'?HORN_COOLDOWN:6.0;
      if(now-last>=cd){
        if(channel==='royal')this.lastHornAt=now;
        this.lastHornByChannel[channel]=now;
        const rate=typeof fundamental==='number'?fundamental/HORN_FUNDAMENTAL:1.0;
        const gain=cueName==='horn-enemy'?.36:cueName==='horn-ally'?.34:.28;
        if(playCue(this,cueName,{gain,rate,bus:this.voiceBus||this.master,reverb:true})){
          this.duckMusic?.(1.8,.58);
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
    if(this.rainGain)this.rainGain.gain.setTargetAtTime(0,this.context.currentTime,.2);
    loopBed(this,'rain',amount*(state?.type==='snow'?.014:.085),this.ambienceBus||this.master);
  };

  p.updateScene=function(info={}){
    updateScene?.call(this,info);
    if(!this.context||!this.sampleBank)return;
    const active=info.active!==false&&this.settings.weatherSounds!==false&&this.settings.volume>0;
    const map=info.sim?.options?.map||this.currentMap||'highlands';
    let want=active?(BIOME_AMBIENCE[map]||'amb-meadow'):null;
    if(want==='amb-meadow'&&(this.isNight||this.isStormy))want=null;
    let playingRealAmbience=false;
    for(const cue of AMBIENCE_SAMPLE_CUES){
      if(!this.sampleBank.has(cue))continue;
      if(cue===want){
        playingRealAmbience=true;
        loopBed(this,cue,cue==='amb-volcanic'?.044:.038,this.ambienceBus||this.master);
      }else if(this.sampleLoops?.has(cue)){
        loopBed(this,cue,0,this.ambienceBus||this.master);
      }
    }
    if(playingRealAmbience&&this.windGain){
      this.windGain.gain.setTargetAtTime?.(.007,this.context.currentTime,.4);
    }
  };

  p.tick=function(dt){
    tick.call(this,dt);
    if(!this.sampleBank||!this.context)return;
    const enabled=this.settings.music&&this.settings.volume>0;
    const stage=typeof this.scoreStage==='function'?this.scoreStage():'peace';
    const hasStems=MUSIC_STEM_CUES.some(cue=>this.sampleBank.has(cue));
    if(hasStems)this.hasSampledMusic=true;
    if(hasStems){
      const activeStem=STAGE_STEM[stage]||'music-peace';
      for(const cue of MUSIC_STEM_CUES){
        if(!this.sampleBank.has(cue))continue;
        const target=enabled?(cue===activeStem?.18:0):0;
        if(target>0||this.sampleLoops?.has(cue))loopBed(this,cue,target,this.musicBus||this.master);
      }
    }
    if(this.sampleBank.has('pad')){
      const padLevel=enabled?(hasStems?(stage==='peace'?.024:0):(.032+(this.combatIntensity||0)*.016)):0;
      loopBed(this,'pad',padLevel,this.musicBus||this.master);
    }
  };
}
