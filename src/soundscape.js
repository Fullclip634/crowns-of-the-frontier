import {UNITS} from './data.js';
export function installSoundscape(AudioEngine){const p=AudioEngine.prototype,unlock=p.unlock,play=p.play,tick=p.tick;
  p.unlock=function(){unlock.call(this);if(!this.context||this.acoustics)return;this.acoustics=true;const ctx=this.context,compressor=ctx.createDynamicsCompressor();compressor.threshold.value=-18;compressor.ratio.value=4;this.master.disconnect();this.master.connect(compressor);compressor.connect(ctx.destination);
    this.noise=ctx.createBuffer(1,ctx.sampleRate,ctx.sampleRate);const data=this.noise.getChannelData(0);for(let i=0;i<data.length;i++)data[i]=Math.random()*2-1;
    const wind=ctx.createBufferSource();wind.buffer=this.noise;wind.loop=true;const filter=ctx.createBiquadFilter();filter.type='lowpass';filter.frequency.value=260;this.windGain=ctx.createGain();this.windGain.gain.value=.025;wind.connect(filter);filter.connect(this.windGain);this.windGain.connect(this.master);wind.start();this.voices=0;this.birdTimer=12;this.drumTimer=0;
  };
  p.impact=function(frequency,duration,gain,pan=0){if(!this.context||this.settings.volume<=0||this.voices>=20)return;this.voices++;const ctx=this.context,t=ctx.currentTime,source=ctx.createBufferSource(),filter=ctx.createBiquadFilter(),envelope=ctx.createGain();source.buffer=this.noise;filter.type='bandpass';filter.frequency.value=frequency;filter.Q.value=.8;envelope.gain.setValueAtTime(gain,t);envelope.gain.exponentialRampToValueAtTime(.001,t+duration);source.connect(filter);filter.connect(envelope);if(ctx.createStereoPanner){const stereo=ctx.createStereoPanner();stereo.pan.value=Math.max(-1,Math.min(1,pan));envelope.connect(stereo);stereo.connect(this.master);}else envelope.connect(this.master);source.onended=()=>this.voices--;source.start();source.stop(t+duration+.02);};
  p.play=function(name,entity,camera){if(this.context?.state!=='running')return;if(name!=='attack'){play.call(this,name);if(name==='complete')this.impact(800,.18,.08);return;}if(!this.context)return;this.master.gain.value=this.settings.volume*.24;const angle=camera?.angle||0,pan=entity&&camera?((entity.x-camera.x)*Math.cos(angle)-(entity.z-camera.z)*Math.sin(angle))/35:0;
    if(['catapult','warship'].includes(entity?.type)){this.impact(95,.55,.5,pan);this.tone(65,.5,'triangle',.12);}
    else if(UNITS[entity?.type]?.role==='ranged'||entity?.kind==='building')this.impact(1600,.09,.16,pan);
    else{this.impact(800+Math.random()*650,.12,.16,pan);if(Math.random()<.3)this.tone(420+Math.random()*200,.13,'triangle',.045);}
  };
  p.tick=function(dt){tick.call(this,dt);if(!this.context)return;this.master.gain.value=this.settings.volume*.24;if(this.windGain)this.windGain.gain.value=this.settings.music?.025:0;
    if(!this.settings.music)return;this.birdTimer-=dt;this.drumTimer-=dt;if(this.birdTimer<0){this.birdTimer=11+Math.random()*9;this.tone(1850,.12,'sine',.025);this.tone(2400,.15,'sine',.019,.12);this.tone(2150,.14,'sine',.022,.3);}
    if(this.drumTimer<0){this.drumTimer=5.6;this.tone(73.4,.3,'sine',.05);this.impact(120,.22,.04);this.tone(146.83,.22,'triangle',.025,.3);}
  };
}
