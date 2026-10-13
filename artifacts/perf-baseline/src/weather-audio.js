export function installWeatherAudio(AudioEngine){
  AudioEngine.prototype.weather=function(state,active=true){
    if(!this.context||!this.noise)return;const ctx=this.context;
    if(!this.rainGain){const source=ctx.createBufferSource();source.buffer=this.noise;source.loop=true;const filter=ctx.createBiquadFilter();filter.type='highpass';filter.frequency.value=750;this.rainGain=ctx.createGain();this.rainGain.gain.value=0;source.connect(filter);filter.connect(this.rainGain);this.rainGain.connect(this.master);source.start();}
    const enabled=active&&this.settings.weatherSounds!==false&&this.settings.volume>0,amount=enabled?state?.amount||0:0;
    this.rainGain.gain.setTargetAtTime(state?.type==='snow'?amount*.007:amount*.07,ctx.currentTime,.8);
    if(this.windGain)this.windGain.gain.setTargetAtTime(enabled?(.016+(state?.cloud||0)*.04):this.settings.music?.025:0,ctx.currentTime,.8);
    if(enabled&&state?.flash&&state.thunderKey!==this.lastThunder){this.lastThunder=state.thunderKey;this.impact(80,1.8,.16);this.tone(43,1.5,'sine',.026,.2);}
  };
}
