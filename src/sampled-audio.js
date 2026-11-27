// Recorded speech and sound effects. Procedural effects cover missing samples,
// and unit orders still have their UI response while speech is loading.
import {createSampleBank,UI_SAMPLE_CUES,FOLEY_SAMPLE_CUES,AMBIENCE_SAMPLE_CUES,GRUNT_SAMPLE_CUES,MUSIC_STEM_CUES,COMMS_SAMPLE_CUES} from './sample-bank.js';
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
const STAGE_STEM={peace:'music-peace',tension:'music-tension',battle:'music-battle',climax:'music-climax'};

const UI_CUE_MIX=Object.freeze({
  select:{gain:.55,bus:'sfx',reverb:false},
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
  place:{gain:.58,bus:'sfx',reverb:true},
  'bld-town':{gain:.50,bus:'sfx',reverb:true},
  'bld-castle':{gain:.54,bus:'sfx',reverb:true},
  'bld-dock':{gain:.52,bus:'sfx',reverb:true},
});

const BUILDING_SELECT_CUE=Object.freeze({
  towncenter:{cue:'bld-town',gain:.50,reverb:true},
  wonder:{cue:'bld-town',gain:.56,reverb:true},
  house:{cue:'bld-town',gain:.40,reverb:false},
  mill:{cue:'bld-town',gain:.42,reverb:false},
  farm:{cue:'bld-town',gain:.38,reverb:false},
  keep:{cue:'bld-castle',gain:.54,reverb:true},
  castle:{cue:'bld-castle',gain:.54,reverb:true},
  tower:{cue:'bld-castle',gain:.48,reverb:true},
  gate:{cue:'bld-castle',gain:.48,reverb:true},
  wall:{cue:'bld-castle',gain:.40,reverb:false},
  bombard:{cue:'bld-castle',gain:.52,reverb:true},
  dock:{cue:'bld-dock',gain:.52,reverb:true},
  fishingboat:{cue:'bld-dock',gain:.46,reverb:true},
  warship:{cue:'bld-dock',gain:.54,reverb:true},
  transport:{cue:'bld-dock',gain:.48,reverb:true},
  blacksmith:{cue:'anvil',gain:.42,reverb:true},
  market:{cue:'coin',gain:.48,reverb:false},
  stable:{cue:'unit-cavalry',gain:.44,reverb:true},
  range:{cue:'unit-archer',gain:.44,reverb:true},
  barracks:{cue:'march',gain:.48,reverb:true},
  workshop:{cue:'march',gain:.46,reverb:true},
  monastery:{cue:'unit-healer',gain:.46,reverb:true},
  camp:{cue:'chop',gain:.42,reverb:true},
  mine:{cue:'mine',gain:.44,reverb:true},
});

export function buildingSelectCue(entity){
  return BUILDING_SELECT_CUE[entity?.type]||null;
}

const UNIT_RESPONSES=Object.freeze({select:'voice-select',order:'voice-order',attack:'voice-attack',hold:'unit-hold',work:'voice-order'});
const WORKER_RESPONSES=Object.freeze({select:'voice-worker-select',hold:'voice-worker-hold'});

function resolveUnitVoiceCue(kind,unit){
  const archetype=unitVoiceArchetype(unit);
  if(archetype==='worker')return WORKER_RESPONSES[kind]||'voice-work';
  if(archetype==='hero'&&kind==='attack')return 'unit-hero';
  return UNIT_RESPONSES[kind]||UNIT_RESPONSES.order;
}

// Tiny 1-sample scratch buffer per AudioContext to release native WebKit/iOS
// AVAudioEngine references on stopped AudioBufferSourceNodes without throwing.
const scratchBuffers=new WeakMap();
function releaseAudioSource(ctx,source){
  if(!source)return;
  try{source.onended=null;}catch{}
  try{source.disconnect();}catch{}
  if(ctx&&typeof ctx.createBuffer==='function'){
    let scratch=scratchBuffers.get(ctx);
    if(!scratch){
      try{scratch=ctx.createBuffer(1,1,ctx.sampleRate||22050);scratchBuffers.set(ctx,scratch);}catch{scratch=null;}
    }
    if(scratch){try{source.buffer=scratch;}catch{}}
  }
}

function playCue(engine,name,{gain=.8,rate=1,pan=0,bus=null,reverb=false,delay=0,onEnded=null}={}){
  const ctx=engine.context,buffer=engine.sampleBank?.get(name);
  if(!ctx||!buffer||ctx.state!=='running'||engine.settings.volume<=0)return null;
  const source=ctx.createBufferSource(),level=ctx.createGain();
  source.buffer=buffer;if(source.playbackRate)source.playbackRate.value=rate;
  // Submix buses already feed engine.master (volume * 0.24); avoid squaring master volume.
  level.gain.value=gain;
  source.connect(level);
  const outBus=bus||engine.master;
  let panner=null;
  if(pan&&ctx.createStereoPanner){panner=ctx.createStereoPanner();panner.pan.value=Math.max(-.8,Math.min(.8,pan));level.connect(panner);panner.connect(outBus);if(reverb&&engine.reverbSend)panner.connect(engine.reverbSend);}
  else{level.connect(outBus);if(reverb&&engine.reverbSend)level.connect(engine.reverbSend);}
  const startsAt=ctx.currentTime+delay,endsAt=startsAt+(buffer.duration||.75)/rate;
  const handle={source,level,endsAt};
  source.onended=()=>{releaseAudioSource(ctx,source);level.disconnect();panner?.disconnect();onEnded?.(handle);};
  source.start(startsAt);
  return handle;
}

function fadeSpeech(engine,handle){
  if(!handle)return;
  const now=engine.context.currentTime;
  handle.level.gain.setTargetAtTime(0,now,.008);
  try{handle.source.stop(now+.035);}catch{}
}

// Loop beds are created once and faded by gain; stopping/restarting a buffer
// source on every weather tick would click and churn graph nodes. In lazy-loop
// mobile mode, beds that stay silent past the fade window are stopped and their
// decoded PCM buffers evicted to keep mobile RAM low.
const SILENT_EVICT_SECONDS=3.0;
function stopLoopBed(engine,name,{evict=false}={}){
  const bed=engine.sampleLoops?.get(name);
  if(bed){
    engine.sampleLoops.delete(name);
    try{bed.source.stop();}catch{}
    releaseAudioSource(engine.context,bed.source);
    try{bed.gain.disconnect();}catch{}
  }
  if(evict)engine.sampleBank?.evict?.(name);
}
function loopBed(engine,name,level,bus=null){
  const ctx=engine.context;if(!ctx)return;
  engine.sampleLoops??=new Map();
  let bed=engine.sampleLoops.get(name);
  if(!bed){
    if(level<=0)return;
    const buffer=engine.sampleBank.get(name);if(!buffer)return;
    const source=ctx.createBufferSource(),gain=ctx.createGain();
    source.buffer=buffer;source.loop=engine.sampleBank.isLoop(name);
    gain.gain.value=0;source.connect(gain);gain.connect(bus||engine.master);source.start();
    source.onended=()=>{if(engine.sampleLoops?.get(name)===bed)engine.sampleLoops.delete(name);releaseAudioSource(ctx,source);try{gain.disconnect();}catch{};};
    bed={source,gain,silentSince:null};engine.sampleLoops.set(name,bed);
  }
  bed.gain.gain.setTargetAtTime(level,ctx.currentTime,.35);
  if(level>0)bed.silentSince=null;
  else if(bed.silentSince===null)bed.silentSince=ctx.currentTime;
}

// `options` exists for deterministic tests; the game uses the real fetch and
// document.baseURI defaults.
export function installSampledAudio(AudioEngine,options={}){
  const p=AudioEngine.prototype,unlock=p.unlock,play=p.play,warHorn=p.warHorn,weather=p.weather,tick=p.tick,updateScene=p.updateScene,origStinger=p.triggerSiegeStinger,setCommsSpeaking=p.setCommsSpeaking;

  p.sampleDiagnostics=function(){return this.sampleBank?.diagnostics()||{ready:false,coreReady:false,loaded:0,failed:0,total:0,bytes:0,errors:['audio not unlocked'],samples:[]};};

  p.unlock=function(){
    unlock.call(this);
    if(!this.context||this.sampleBank)return;
    const lazyLoops=options.lazyLoops??Boolean(this.lazySampleLoops);
    this.sampleBank=createSampleBank({context:this.context,...options,lazyLoops});
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
    if(this.commsSpeaking||now<(this.activeUnitVoice?.endsAt??0)||now-(this.lastGruntAt??-Infinity)<1.1)return false;
    const cue=GRUNT_SAMPLE_CUES[(this.gruntSequence=(this.gruntSequence||0)+1)%GRUNT_SAMPLE_CUES.length];
    const handle=playCue(this,cue,{gain,pan,bus:this.voiceBus||this.master,
      onEnded:voice=>{if(this.activeGrunt===voice)this.activeGrunt=null;},
    });
    if(!handle)return false;
    this.activeGrunt=handle;
    this.lastGruntAt=now;
    return true;
  };

  p.voice=function(kind='order',unit=null,_faction='alder',pan=0){
    if(!isHumanVoiceUnit(unit)||this.context?.state!=='running'||this.settings.volume<=0||this.commsSpeaking||this.activeCommsSource)return false;
    if(this.settings.unitVoices===false||(this.settings.voiceVolume??1)<=0)return false;
    const now=this.context.currentTime;
    if(now<(this.activeUnitVoice?.endsAt??0)||now-(this.lastVoiceAt??-Infinity)<VOICE_COOLDOWN)return false;
    const handle=playCue(this,resolveUnitVoiceCue(kind,unit),{
      gain:.7,pan,bus:this.voiceBus||this.master,
      onEnded:voice=>{if(this.activeUnitVoice===voice)this.activeUnitVoice=null;},
    });
    if(!handle)return false;
    fadeSpeech(this,this.activeGrunt);
    this.activeGrunt=null;
    this.activeUnitVoice=handle;
    this.lastVoiceAt=now;
    this.duckMusic?.(handle.endsAt-now+.12,.78);
    return true;
  };

  p.stopUnitVoice=function(){
    const {activeUnitVoice,activeGrunt}=this;
    this.activeUnitVoice=null;
    this.activeGrunt=null;
    fadeSpeech(this,activeUnitVoice);
    fadeSpeech(this,activeGrunt);
  };

  p.setCommsSpeaking=function(active){
    if(active)this.stopUnitVoice();
    if(setCommsSpeaking)setCommsSpeaking.call(this,active);
    else this.commsSpeaking=Boolean(active);
  };

  p.stopCommsVoice=function(){
    const active=this.activeCommsSource;
    this.activeCommsSource=null;
    fadeSpeech(this,active);
  };

  p.playCommsVoice=function(cueName='comms-ally',{gain=.93,delaySec=0,onEnded=null}={}){
    if(!COMMS_SAMPLE_CUES.includes(cueName))return null;
    const ctx=this.context;
    if(ctx?.state!=='running'||this.settings.volume<=0||!this.sampleBank?.has(cueName))return null;
    if(this.settings.voiceComms===false||(this.settings.voiceVolume??1)<=0)return null;
    this.stopCommsVoice();
    this.stopUnitVoice();
    const handle=playCue(this,cueName,{gain,delay:Math.max(.035,delaySec),bus:this.voiceBus||this.master,
      onEnded:voice=>{
        if(this.activeCommsSource!==voice)return;
        this.activeCommsSource=null;
        onEnded?.();
      },
    });
    if(!handle)return null;
    this.activeCommsSource=handle;
    const durSec=handle.endsAt-ctx.currentTime;
    this.duckMusic?.(Math.max(1.2,durSec+.4),.56);
    return {played:true,cue:cueName,durationMs:Math.round(durSec*1000)};
  };

  p.buildingSelect=function(entity){
    const uiGain=this.settings.uiVolume??1;
    if(uiGain<=0||this.settings.volume<=0||this.context?.state!=='running')return false;
    const now=this.context.currentTime;
    if(now-(this.lastBldSelectAt??-Infinity)<.18)return false;
    const spec=buildingSelectCue(entity);
    if(spec&&this.sampleBank?.has(spec.cue)){
      this.lastBldSelectAt=now;
      const rate=.97+Math.random()*.06;
      if(playCue(this,spec.cue,{gain:spec.gain*uiGain,rate,bus:this.sfxBus||this.master,reverb:spec.reverb}))return true;
    }
    this.lastBldSelectAt=now;
    this.play('select');
    return false;
  };

  p.playWorldSfx=function(cue,entity=null,{gain=.72,rate=1,bus='sfx',reverb=true,duck=null}={}){
    const ctx=this.context;
    if(!ctx||ctx.state!=='running'||this.settings.volume<=0||!this.sampleBank?.has(cue))return false;
    let pan=0,finalGain=gain;
    if(entity&&typeof this.combatListener==='function'){
      const spatial=this.combatListener(entity);
      if(!spatial||spatial.gain<=.005)return false;
      pan=spatial.pan||0;
      finalGain=gain*(.35+spatial.gain*.65);
    }
    const outBus=bus==='voice'?(this.voiceBus||this.master):(this.sfxBus||this.master);
    const jitter=.96+Math.random()*.08;
    if(playCue(this,cue,{gain:finalGain,rate:rate*jitter,pan,bus:outBus,reverb})){
      if(duck)this.duckMusic?.(duck[0],duck[1]);
      return true;
    }
    return false;
  };

  p.triggerSiegeStinger=function(kind='hero',entity=null){
    if(!this.context||this.context.state!=='running'||this.settings.volume<=0)return false;
    if(kind==='hero'){
      this.noteCombatActivity?.(.32);
      if(this.sampleBank?.has('hero-skill')){
        return this.playWorldSfx('hero-skill',null,{gain:.72,bus:'voice',reverb:true,duck:[1.5,.58]});
      }
    }else if(kind==='oil'){
      this.noteCombatActivity?.(.24);
      if(this.sampleBank?.has('boiling-oil')){
        return this.playWorldSfx('boiling-oil',entity,{gain:.70,bus:'sfx',reverb:true});
      }
    }else if(kind==='cannon'||kind==='siege'){
      this.noteCombatActivity?.(.28);
      if(this.sampleBank?.has('cannon')){
        return this.playWorldSfx('cannon',entity,{gain:.68,bus:'sfx',reverb:true});
      }
    }else if(kind==='trebuchet'){
      this.noteCombatActivity?.(.20);
      if(this.sampleBank?.has('trebuchet')){
        return this.playWorldSfx('trebuchet',entity,{gain:.64,bus:'sfx',reverb:true});
      }
    }else if(kind==='collapse'){
      this.noteCombatActivity?.(.26);
      if(this.sampleBank?.has('collapse')){
        return this.playWorldSfx('collapse',entity,{gain:.76,bus:'sfx',reverb:true});
      }
    }else if(kind==='wonder'){
      this.noteCombatActivity?.(.45);
      // Let the studio-mastered age-up fanfare play cleanly without raw synth oscillators clashing over it.
      if(this.sampleBank?.has('age-up'))return true;
    }
    return origStinger?origStinger.call(this,kind):false;
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
    if(!this.sampleBank||!this.context)return;
    const enabled=active&&this.settings.weatherSounds!==false&&this.settings.volume>0;
    const amount=enabled?(state?.amount||0):0;
    if(this.sampleBank.lazyLoops){
      if(amount>0&&!this.sampleBank.has('rain')){void this.sampleBank.ensure('rain');return;}
      if(amount<=0){
        const bed=this.sampleLoops?.get('rain');
        if(bed){
          loopBed(this,'rain',0,this.ambienceBus||this.master);
          if(bed.silentSince!==null&&this.context.currentTime-bed.silentSince>=SILENT_EVICT_SECONDS){
            stopLoopBed(this,'rain',{evict:true});
          }
        }else if(this.sampleBank.has('rain'))this.sampleBank.evict('rain');
        return;
      }
    }
    if(!this.sampleBank.has('rain'))return;
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
    const lazy=this.sampleBank.lazyLoops,now=this.context.currentTime;
    if(lazy&&want&&!this.sampleBank.has(want))void this.sampleBank.ensure(want);
    let playingRealAmbience=false;
    for(const cue of AMBIENCE_SAMPLE_CUES){
      if(cue===want){
        if(!this.sampleBank.has(cue))continue;
        playingRealAmbience=true;
        loopBed(this,cue,cue==='amb-volcanic'?.044:.038,this.ambienceBus||this.master);
      }else if(this.sampleLoops?.has(cue)){
        loopBed(this,cue,0,this.ambienceBus||this.master);
        const bed=this.sampleLoops.get(cue);
        if(lazy&&bed&&bed.silentSince!==null&&now-bed.silentSince>=SILENT_EVICT_SECONDS){
          stopLoopBed(this,cue,{evict:true});
        }
      }else if(lazy&&this.sampleBank.has(cue)){
        this.sampleBank.evict(cue);
      }
    }
    if(playingRealAmbience&&this.windGain){
      this.windGain.gain.setTargetAtTime?.(.007,this.context.currentTime,.4);
    }
  };

  p.tick=function(dt){
    tick.call(this,dt);
    if(!this.sampleBank||!this.context)return;
    const enabled=Boolean(this.settings.music&&this.settings.volume>0&&(this.settings.musicVolume??1)>0);
    const stage=typeof this.scoreStage==='function'?this.scoreStage():'peace';
    const activeStem=STAGE_STEM[stage]||'music-peace';
    const lazy=this.sampleBank.lazyLoops,now=this.context.currentTime;
    if(lazy){
      if(enabled&&!this.sampleBank.has(activeStem))void this.sampleBank.ensure(activeStem);
      const activeReady=enabled&&this.sampleBank.has(activeStem);
      const hasStems=MUSIC_STEM_CUES.some(cue=>this.sampleBank.has(cue));
      this.hasSampledMusic=hasStems;
      for(const cue of MUSIC_STEM_CUES){
        const bed=this.sampleLoops?.get(cue);
        if(cue===activeStem&&activeReady){
          loopBed(this,cue,.18,this.musicBus||this.master);
        }else if(bed){
          // Hold the outgoing stem smoothly until the incoming stem finishes decoding.
          if(!enabled||activeReady){
            loopBed(this,cue,0,this.musicBus||this.master);
            if(bed.silentSince!==null&&now-bed.silentSince>=SILENT_EVICT_SECONDS){
              stopLoopBed(this,cue,{evict:true});
            }
          }
        }else if((!enabled||activeReady)&&this.sampleBank.has(cue)){
          this.sampleBank.evict(cue);
        }
      }
      if(!enabled&&this.sampleBank.has('pad'))stopLoopBed(this,'pad',{evict:true});
      return;
    }
    const hasStems=MUSIC_STEM_CUES.some(cue=>this.sampleBank.has(cue));
    if(hasStems)this.hasSampledMusic=true;
    if(hasStems){
      for(const cue of MUSIC_STEM_CUES){
        if(!this.sampleBank.has(cue))continue;
        const target=enabled?(cue===activeStem?.18:0):0;
        if(target>0||this.sampleLoops?.has(cue))loopBed(this,cue,target,this.musicBus||this.master);
      }
    }
    if(this.sampleBank.has('pad')){
      const padLevel=enabled?(hasStems?(stage==='peace'?.024:0):(.032+(this.combatIntensity||0)*.016)):0;
      if(padLevel>0||this.sampleLoops?.has('pad'))loopBed(this,'pad',padLevel,this.musicBus||this.master);
    }
  };
}
