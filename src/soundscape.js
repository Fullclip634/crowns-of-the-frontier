const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
// Faction-authentic medieval & imperial scales driving adaptive peace -> siege -> climax scoring!
const FACTION_SCALES={
  alder:[146.83,164.81,174.61,196.00,220.00,246.94,261.63,293.66,329.63,349.23,440.00], // D-Dorian
  raven:[146.83,164.81,174.61,196.00,220.00,246.94,261.63,293.66,329.63,349.23,440.00], // Highland Dorian
  sun:[146.83,155.56,185.00,196.00,220.00,233.08,261.63,293.66,311.13,369.99,440.00],   // D-Phrygian Dominant (Oud)
  iron:[130.81,146.83,155.56,174.61,196.00,207.65,233.08,261.63,293.66,311.13,392.00],  // Heavy C-Aeolian Forge
  jade:[146.83,164.81,196.00,220.00,246.94,293.66,329.63,392.00,440.00,493.88,587.33],  // D-Pentatonic Guqin/Taiko
};
const PEACE_PHRASE=[0,4,7,5,4,2,0,4,7,9,7,4];
const TENSION_PHRASE=[0,2,4,2,0,6,4,2];
const SIEGE_PHRASE=[0,0,4,3,0,6,5,4,7,4,2,0];

function createOpenAirImpulse(ctx){
  const seconds=.68,length=Math.max(64,Math.floor((ctx.sampleRate||22050)*seconds));
  const buffer=ctx.createBuffer(1,length,ctx.sampleRate||22050);
  const data=buffer.getChannelData(0);
  let seed=48271,low=0;
  const rand=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/2147483648-1;};
  for(let i=0;i<length;i++){
    const t=i/length,n=rand();
    low+=.24*(n-low);
    data[i]=low*Math.pow(1-t,2.6)*.42;
  }
  for(const [ms,amp] of [[14,.32],[29,-.24],[48,.18],[76,-.12]]){
    const idx=Math.floor((ctx.sampleRate||22050)*(ms/1000));
    if(idx<length)data[idx]+=amp;
  }
  return buffer;
}

function setParamSmooth(param,value,time,tc=.18){
  if(!param)return;
  if(typeof param.setTargetAtTime==='function')param.setTargetAtTime(value,time,tc);
  else param.value=value;
}

export function installSoundscape(AudioEngine){
  const p=AudioEngine.prototype,unlock=p.unlock,play=p.play,tick=p.tick;

  p.unlock=function(){
    unlock.call(this);
    if(!this.context||this.acoustics)return;
    this.acoustics=true;
    const ctx=this.context,compressor=ctx.createDynamicsCompressor();
    compressor.threshold.value=-16;compressor.ratio.value=4;
    if(compressor.knee)compressor.knee.value=12;
    if(compressor.attack)compressor.attack.value=.004;
    if(compressor.release)compressor.release.value=.16;
    this.master.disconnect();this.master.connect(compressor);compressor.connect(ctx.destination);
    this.compressor=compressor;

    // Pro 4-bus submix architecture: music, sfx, voice, ambience -> master -> compressor.
    this.musicBus=ctx.createGain();this.musicBus.gain.value=1;
    this.sfxBus=ctx.createGain();this.sfxBus.gain.value=1;
    this.voiceBus=ctx.createGain();this.voiceBus.gain.value=this.settings.voiceVolume??1;
    this.ambienceBus=ctx.createGain();this.ambienceBus.gain.value=1;
    this.musicBus.connect(this.master);
    this.sfxBus.connect(this.master);
    this.voiceBus.connect(this.master);
    this.ambienceBus.connect(this.master);

    // Optional open-air courtyard/valley convolution reverb send (safe on minimal mock contexts).
    if(typeof ctx.createConvolver==='function'){
      try{
        const reverb=ctx.createConvolver(),send=ctx.createGain();
        reverb.buffer=createOpenAirImpulse(ctx);
        send.gain.value=.17;
        send.connect(reverb);reverb.connect(this.master);
        this.reverbConvolver=reverb;this.reverbSend=send;
      }catch{}
    }

    // Warm 1/f pink-filtered noise buffer replaces harsh white static for wind & weather beds.
    this.noise=ctx.createBuffer(1,Math.max(8,ctx.sampleRate),ctx.sampleRate);
    const data=this.noise.getChannelData(0);
    let b0=0,b1=0,b2=0;
    for(let i=0;i<data.length;i++){
      const w=Math.random()*2-1;
      b0=.995*b0+w*.034;b1=.980*b1+w*.042;b2=.925*b2+w*.060;
      data[i]=clamp((b0+b1+b2+w*.022)*1.6,-1,1);
    }

    const wind=ctx.createBufferSource();wind.buffer=this.noise;wind.loop=true;
    const filter=ctx.createBiquadFilter();filter.type='lowpass';filter.frequency.value=260;
    this.windFilter=filter;
    this.windGain=ctx.createGain();this.windGain.gain.value=.024;
    wind.connect(filter);filter.connect(this.windGain);this.windGain.connect(this.ambienceBus);wind.start();

    // Dynamic battlefield murmur bed swells gently when >= 4 troops clash nearby.
    const murmur=ctx.createBufferSource();murmur.buffer=this.noise;murmur.loop=true;
    const murmurFilter=ctx.createBiquadFilter();murmurFilter.type='bandpass';murmurFilter.frequency.value=420;
    if(murmurFilter.Q)murmurFilter.Q.value=1.1;
    this.battleBedGain=ctx.createGain();this.battleBedGain.gain.value=0;
    murmur.connect(murmurFilter);murmurFilter.connect(this.battleBedGain);this.battleBedGain.connect(this.sfxBus);murmur.start();

    this.voices=0;this.birdTimer=10;this.drumTimer=0;this.snareTimer=0;this.brassTimer=0;this.combatIntensity=0;this.musicDuckUntil=0;
    this.currentMap='highlands';this.currentFaction='alder';this.cameraZoom=48;this.sceneScanTimer=0;this.modalStep=0;this.modalTimer=.8;
  };

  p.duckMusic=function(duration=1.1,level=.66){
    if(!this.context||!this.musicBus)return;
    const now=this.context.currentTime||0;
    const mv=this.settings.musicVolume??1;
    this.musicDuckUntil=Math.max(this.musicDuckUntil||0,now+duration);
    setParamSmooth(this.musicBus.gain,clamp(level,.35,1)*mv,now,.045);
  };

  p.setCommsSpeaking=function(active=false){
    this.commsSpeaking=Boolean(active);
    if(!this.context||!this.musicBus)return;
    const now=this.context.currentTime||0;
    const mv=this.settings.musicVolume??1;
    if(this.commsSpeaking){
      this.musicDuckUntil=Math.max(this.musicDuckUntil||0,now+14);
      setParamSmooth(this.musicBus.gain,(this.settings.music?mv:0)*.52,now,.06);
    }else{
      this.musicDuckUntil=now+.15;
      setParamSmooth(this.musicBus.gain,this.settings.music?mv:0,now,.28);
    }
  };

  p.setCameraZoom=function(zoom=48){
    if(!Number.isFinite(zoom))return;
    this.cameraZoom=clamp(zoom,16,140);
    if(!this.context)return;
    const t=clamp((this.cameraZoom-22)/88,0,1),now=this.context.currentTime||0;
    setParamSmooth(this.sfxBus?.gain,1.08-t*.22,now,.25);
    setParamSmooth(this.ambienceBus?.gain,.84+t*.30,now,.25);
  };

  p.noteCombatActivity=function(weight=.14){
    this.combatIntensity=clamp((this.combatIntensity||0)+weight,0,1);
  };

  p.scoreStage=function(){
    const level=this.combatIntensity||0;
    return level>=.72?'climax':level>=.42?'battle':level>=.18?'tension':'peace';
  };

  /** Dynamic Siege Music stinger for Hero Skills, Boiling Oil, Siege impacts & World Wonders! */
  p.triggerSiegeStinger=function(kind='hero'){
    if(!this.context||this.context.state!=='running'||this.settings.volume<=0)return;
    const scale=FACTION_SCALES[this.currentFaction]||FACTION_SCALES.alder;
    const root=scale[0];
    if(kind==='hero'){
      this.noteCombatActivity(.32);
      this.busTone(this.musicBus,root,.55,'sawtooth',.045,0,true);
      this.busTone(this.musicBus,root*1.5,.65,'triangle',.052,.08,true);
      this.busTone(this.musicBus,root*2,.85,'triangle',.048,.18,true);
      this.impact(130,.24,.09);
    }else if(kind==='wonder'){
      this.noteCombatActivity(.45);
      for(const [i,mult]of [[0,1],[1,1.25],[2,1.5],[3,2]]){
        this.busTone(this.musicBus,root*mult,1.4,'triangle',.046,i*.14,true);
      }
      this.busTone(this.musicBus,root*.5,2.2,'sine',.065,0,true);
    }else if(kind==='oil'){
      this.noteCombatActivity(.24);
      this.impact(920,.32,.09);
      this.busTone(this.sfxBus,108,.28,'sawtooth',.045,.04,false);
    }else if(kind==='siege'){
      this.noteCombatActivity(.28);
      this.busTone(this.musicBus,root*.5,.36,'sine',.075,0,false);
      this.impact(105,.28,.085);
    }
  };

  p.busTone=function(bus,freq,duration=.22,type='triangle',gain=.08,delay=0,reverb=true){
    if(!this.context||this.settings.volume<=0)return;
    const ctx=this.context,t=(ctx.currentTime||0)+delay,o=ctx.createOscillator(),g=ctx.createGain();
    o.type=type;o.frequency.value=freq;
    g.gain.setValueAtTime?.(.0008,t);
    g.gain.exponentialRampToValueAtTime?.(Math.max(.001,gain),t+.016);
    g.gain.exponentialRampToValueAtTime?.(.0008,t+duration);
    o.connect(g);
    const target=bus||this.master;
    g.connect(target);
    if(reverb&&this.reverbSend)g.connect(this.reverbSend);
    o.onended=()=>{o.disconnect();g.disconnect();};
    o.start(t);o.stop(t+duration+.03);
  };

  p.impact=function(frequency,duration,gain,pan=0){
    if(!this.context||this.settings.volume<=0||this.voices>=20)return;
    this.voices++;
    const ctx=this.context,t=ctx.currentTime||0,source=ctx.createBufferSource(),filter=ctx.createBiquadFilter(),envelope=ctx.createGain();
    source.buffer=this.noise;filter.type='bandpass';filter.frequency.value=frequency;
    if(filter.Q)filter.Q.value=.8;
    envelope.gain.setValueAtTime?.(gain,t);
    envelope.gain.exponentialRampToValueAtTime?.(.001,t+duration);
    source.connect(filter);filter.connect(envelope);
    const outBus=this.sfxBus||this.master;
    if(ctx.createStereoPanner){
      const stereo=ctx.createStereoPanner();stereo.pan.value=clamp(pan,-1,1);
      envelope.connect(stereo);stereo.connect(outBus);
      source.onended=()=>{this.voices--;source.disconnect();filter.disconnect();envelope.disconnect();stereo.disconnect();};
    }else{
      envelope.connect(outBus);
      source.onended=()=>{this.voices--;source.disconnect();filter.disconnect();envelope.disconnect();};
    }
    source.start();source.stop(t+duration+.02);
  };

  p.proceduralFoley=function(kind,{gain=.25,pan=0}={}){
    if(!this.context||this.context.state!=='running'||this.settings.volume<=0)return false;
    const g=gain*(this.settings.volume||.65);
    if(kind==='chop'){this.impact(180,.09,g*.55,pan);this.busTone(this.sfxBus,112,.09,'triangle',g*.28,0,false);}
    else if(kind==='mine'){this.busTone(this.sfxBus,1480,.13,'sine',g*.16,0,true);this.impact(1600,.06,g*.25,pan);}
    else if(kind==='hammer'){this.impact(320,.07,g*.42,pan);this.busTone(this.sfxBus,172,.07,'triangle',g*.22,0,false);}
    else if(kind==='anvil'){this.busTone(this.sfxBus,1160,.22,'sine',g*.18,0,true);this.busTone(this.sfxBus,1740,.14,'sine',g*.10,0,true);}
    else if(kind==='hoof'){this.impact(130,.06,g*.32,pan);this.impact(145,.06,g*.26,pan);}
    else if(kind==='march'){this.impact(620,.05,g*.22,pan);}
    else if(kind==='fire'){this.impact(950,.11,g*.18,pan);}
    return true;
  };

  p.play=function(name,entity,target){
    if(this.context?.state!=='running')return;
    if(name!=='attack'){
      play.call(this,name);
      if(name==='complete')this.impact(780,.18,.07);
      if(name==='alarm')this.duckMusic(1.5,.62);
      return;
    }
    this.master.gain.value=this.settings.volume*.24;
    return this.combat(entity,target);
  };

  p.updateScene=function({dt=.016,view,sim,active=true}={}){
    if(!this.context)return;
    if(view?.zoom)this.setCameraZoom(view.zoom);
    const map=sim?.options?.map||'highlands';
    this.currentMap=map;
    this.currentFaction=sim?.players?.[0]?.faction||'alder';
    this.isNight=(view?.lightingState?.night??view?.atmosphereUniforms?.night?.value??0)>.45;
    this.isStormy=(view?.weatherState?.amount??view?.atmosphereUniforms?.wetness?.value??0)>.30;
    // Tune ambient wind filter color to the current biome.
    if(this.windFilter){
      const targetFreq=['volcanic','emberroad'].includes(map)?165:['tundra','winter','frostvale','frostfallsiege'].includes(map)?490:['arid','canyon','desert'].includes(map)?360:['coast','archipelago','templelagoon'].includes(map)?310:250;
      setParamSmooth(this.windFilter.frequency,targetFreq,this.context.currentTime||0,.6);
    }
    if(!active||this.context.state!=='running'||this.settings.volume<=0){
      setParamSmooth(this.battleBedGain?.gain,0,this.context.currentTime||0,.35);
      return;
    }
    this.sceneScanTimer=(this.sceneScanTimer||0)+dt;
    if(this.sceneScanTimer<.45)return;
    this.sceneScanTimer=0;
    const listen=this.combatListener;
    if(!listen||!sim?.entities)return;
    let fighters=0,foleyCandidate=null,bestGain=0;
    const buckets=typeof sim.candidatesFor==='function'?[sim.candidatesFor('unit'),sim.candidatesFor('building')]:[sim.entities];
    for(const list of buckets)for(const e of list){
      if(e.hp<=0||e.embarked)continue;
      const spatial=listen(e);
      if(!spatial||spatial.gain<.08)continue;
      if(e.kind==='unit'&&(e.order?.type==='attack'||e.cooldown>0))fighters++;
      let kind=null,weight=.24;
      if(e.kind==='unit'&&e.type==='villager'&&!e.moving){
        if(e.order?.type==='gather'){
          const target=sim.get?.(e.order.target);
          if(target?.type==='wood')kind='chop';
          else if(target?.type==='gold'||target?.type==='stone')kind='mine';
        }else if(e.order?.type==='build'||e.order?.type==='repair')kind='hammer';
      }else if(e.kind==='unit'&&['knight','scout','outrider','firelancer','hero_raven','hero_sun'].includes(e.type)&&e.moving){
        kind='hoof';weight=.18;
      }else if(e.kind==='unit'&&['spearman','swordsman','archer','skirmisher','sentinel','marksman','ironbreaker','chukonu','king','hero_alder','hero_iron','hero_jade'].includes(e.type)&&e.moving){
        kind='march';weight=.13;
      }else if(e.kind==='building'&&e.progress>=1&&e.hp<e.maxHp*.5){
        kind='fire';weight=.22;
      }else if(e.kind==='building'&&e.type==='blacksmith'&&e.progress>=1&&e.queue?.length){
        kind='anvil';weight=.26;
      }
      if(kind&&spatial.gain>bestGain){bestGain=spatial.gain;foleyCandidate={kind,gain:spatial.gain*weight,pan:spatial.pan};}
    }
    if(fighters>=3)this.noteCombatActivity(Math.min(.22,fighters*.03));
    setParamSmooth(this.battleBedGain?.gain,fighters>=4?Math.min(.045,(fighters-3)*.007):0,this.context.currentTime||0,.6);
    if(foleyCandidate&&(this.context.currentTime||0)-(this.lastFoleyAt??-Infinity)>.62){
      this.lastFoleyAt=this.context.currentTime||0;
      if(typeof this.foley==='function')this.foley(foleyCandidate.kind,{gain:foleyCandidate.gain,pan:foleyCandidate.pan});
      else this.proceduralFoley(foleyCandidate.kind,{gain:foleyCandidate.gain,pan:foleyCandidate.pan});
    }
  };

  p.tick=function(dt){
    if(!this.context)return;
    this.master.gain.value=this.settings.volume*.24;
    // Relax combat intensity smoothly back to peace over ~11 seconds after fighting stops.
    this.combatIntensity=Math.max(0,(this.combatIntensity||0)-dt*.085);
    // Restore music bus smoothly once ducking window ends, and keep voiceBus synced with voiceVolume.
    const now=this.context.currentTime||0;
    if(this.voiceBus){
      const vv=clamp(this.settings.voiceVolume??1,0,1);
      setParamSmooth(this.voiceBus.gain,vv,now,.08);
    }
    if(this.musicBus&&!this.commsSpeaking&&now>=(this.musicDuckUntil||0)){
      const mv=this.settings.musicVolume??1;
      setParamSmooth(this.musicBus.gain,this.settings.music?mv:0,now,.35);
    }
    if(this.windGain&&!this.sampleLoops?.size)this.windGain.gain.value=(this.settings.weatherSounds!==false&&this.settings.volume>0)?.024:0;
    if(!this.settings.music||this.settings.volume<=0)return;
    // When real recorded CC0 medieval music stems are decoded and crossfading,
    // skip the procedural D-Dorian oscillator synth so keys never clash.
    if(this.hasSampledMusic)return;

    // Dynamic Siege Music: Faction-themed modal melodies + pounding siege timpani,
    // marching snare rolls & heroic brass fanfares swelling seamlessly with combat intensity!
    const stage=this.scoreStage();
    const faction=this.currentFaction||'alder';
    const scale=FACTION_SCALES[faction]||FACTION_SCALES.alder;
    const rootFreq=scale[0];
    this.modalTimer=(this.modalTimer??0)-dt;
    if(this.modalTimer<=0){
      const phrase=stage==='peace'?PEACE_PHRASE:stage==='tension'?TENSION_PHRASE:SIEGE_PHRASE;
      const idx=phrase[(this.modalStep=(this.modalStep||0)+1)%phrase.length];
      const freq=scale[idx%scale.length];
      this.modalTimer=stage==='climax'?.88:stage==='battle'?1.18:stage==='tension'?1.85:2.55;
      // Faction-colored melodic voice (Jade plucked guqin, Sun desert oud, Iron low forge horn, Alder/Raven harp)
      const wave=faction==='iron'?'sawtooth':faction==='sun'?'triangle':'triangle';
      this.busTone(this.musicBus,freq,stage==='peace'?2.2:1.25,wave,stage==='peace'?.044:.040,0,true);
      this.busTone(this.musicBus,freq*2,faction==='jade'?1.5:1.05,'sine',faction==='jade'?.022:.014,.04,true);
      if(this.modalStep%4===0){
        // Deep open-fifth medieval/imperial bass drone
        this.busTone(this.musicBus,rootFreq*.5,3.2,'sine',stage==='peace'?.034:.056,0,true);
        if(stage!=='peace')this.busTone(this.musicBus,rootFreq*.75,2.4,'triangle',.030,.10,true);
      }
      if(stage==='battle'||stage==='climax'){
        // Rising heroic horn harmony on accented beats
        if(this.modalStep%2===0){
          this.busTone(this.musicBus,rootFreq,1.05,'sawtooth',stage==='climax'?.026:.016,.04,true);
          this.busTone(this.musicBus,rootFreq*1.5,1.05,'triangle',stage==='climax'?.034:.022,.08,true);
        }
      }
      if(stage==='climax'&&this.modalStep%4===0){
        // Climax brass fanfare fifth + Jade gong / Iron anvil punctuation
        this.busTone(this.musicBus,rootFreq*2,1.25,'triangle',.038,.06,true);
        if(faction==='jade')this.busTone(this.musicBus,rootFreq*.5,2.4,'sine',.052,0,true);
        else if(faction==='iron')this.busTone(this.musicBus,1160,.24,'sine',.018,.04,true);
      }
    }

    // Natural daylight meadow songbirds (never in volcanic, tundra, arid, storms, or midnight).
    const map=this.currentMap||'highlands';
    const meadow=!['volcanic','emberroad','tundra','winter','frostvale','frostfallsiege','arid','canyon','desert'].includes(map);
    this.birdTimer-=dt;
    if(this.birdTimer<0){
      this.birdTimer=12+Math.random()*11;
      if(meadow&&stage==='peace'&&!this.isNight&&!this.isStormy){
        const base=1950+Math.random()*420;
        this.busTone(this.ambienceBus,base,.09,'sine',.016,0,true);
        this.busTone(this.ambienceBus,base*1.24,.11,'sine',.014,.11,true);
        this.busTone(this.ambienceBus,base*1.12,.10,'sine',.012,.25,true);
      }
    }

    // Pounding Siege Timpani & Taiko War-Drums (calm pulse in peace -> thunderous triplet siege drums in battle/climax!)
    this.drumTimer-=dt;
    if(this.drumTimer<0){
      this.drumTimer=stage==='climax'?1.12:stage==='battle'?1.55:stage==='tension'?2.85:6.0;
      const drumGain=stage==='climax'?.074:stage==='battle'?.058:stage==='tension'?.044:.030;
      const lowDrum=faction==='iron'?65.4:73.4;
      this.busTone(this.musicBus,lowDrum,.30,'sine',drumGain,0,false);
      this.impact(112,.22,drumGain*.72);
      if(stage==='battle'||stage==='climax'){
        // Authentic siege triplet cadence (BOOM - ba-BOOM - BOOM!)
        this.busTone(this.musicBus,lowDrum*1.5,.18,'sine',drumGain*.68,.24,false);
        this.busTone(this.musicBus,lowDrum,.24,'sine',drumGain*.82,.48,false);
        this.impact(136,.16,drumGain*.62);
        if(stage==='climax'){
          this.busTone(this.musicBus,lowDrum*1.5,.16,'sine',drumGain*.62,.72,false);
          this.busTone(this.musicBus,lowDrum,.26,'sine',drumGain*.86,.90,false);
        }
      }else{
        this.busTone(this.musicBus,rootFreq,.20,'triangle',.020,.32,true);
      }
    }

    // Marching War Snare Cadence (kicks in automatically during Battle & Siege Climax!)
    if(stage==='battle'||stage==='climax'){
      this.snareTimer=(this.snareTimer??0)-dt;
      if(this.snareTimer<=0){
        this.snareTimer=stage==='climax'?.56:.78;
        const sg=stage==='climax'?.042:.028;
        this.impact(1350,.075,sg);
        if(stage==='climax'){
          setTimeout(()=>{if(this.context?.state==='running')this.impact(1480,.06,sg*.8);},140)?.unref?.();
          setTimeout(()=>{if(this.context?.state==='running')this.impact(1280,.085,sg*1.05);},280)?.unref?.();
        }
      }
    }
  };
}
