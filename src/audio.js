import {installSoundscape} from './soundscape.js';
import {installWeatherAudio} from './weather-audio.js';
import {installCombatAudio} from './combat-audio.js';
import {installVoiceSystem} from './voice-system.js';
import {installSampledAudio} from './sampled-audio.js';
export class AudioEngine {
  constructor(settings){this.settings=settings;this.context=null;this.musicTimer=0;this.note=0;}
  unlock(){
    if(this.settings.volume<=0){if(this.master)this.master.gain.value=0;return;}
    if(!this.context){const C=window.AudioContext||window.webkitAudioContext;if(!C)return;try{const context=new C(),master=context.createGain();master.connect(context.destination);this.context=context;this.master=master;}catch{return;}}
    if(this.context.state==='suspended')try{this.context.resume()?.catch(()=>{});}catch{}
    this.master.gain.value=this.settings.volume*.24;
  }
  tone(freq,duration=.15,type='sine',gain=.15,delay=0){if(!this.context||this.settings.volume<=0)return;const t=this.context.currentTime+delay,o=this.context.createOscillator(),g=this.context.createGain();o.type=type;o.frequency.value=freq;g.gain.setValueAtTime(.001,t);g.gain.exponentialRampToValueAtTime(gain,t+.015);g.gain.exponentialRampToValueAtTime(.001,t+duration);o.connect(g);g.connect(this.master);o.start(t);o.stop(t+duration+.02);}
  play(name){if(!this.context)return;this.master.gain.value=this.settings.volume*.24;
    if(name==='select'){this.tone(392,.085,'sine',.1);this.tone(587.33,.1,'triangle',.06,.025);}
    if(name==='order'){this.tone(196,.085,'triangle',.11);this.tone(293.66,.11,'sine',.09,.045);}
    if(name==='coin'){this.tone(1174.66,.16,'sine',.08);this.tone(1479.98,.18,'sine',.07,.085);}
    if(name==='complete'){[293.66,369.99,440,587.33].forEach((f,i)=>this.tone(f,.42,'triangle',.095,i*.085));}
    if(name==='alarm'){[116.54,146.83,174.61].forEach((f,i)=>{this.tone(f,.42,'triangle',.09,i*.34);this.tone(f*2,.34,'sine',.045,i*.34);});}
    if(name==='victory'){this.tone(130.81,1.3,'triangle',.09);[261.63,329.63,392,523.25].forEach((f,i)=>this.tone(f,.92,'triangle',.13,i*.22));}
  }
  tick(dt){if(!this.settings.music||!this.context)return;this.musicTimer-=dt;if(this.musicTimer<=0){this.musicTimer=2.8;const notes=[130.81,164.81,196,146.83,130.81,174.61,196,146.83];const f=notes[this.note++%notes.length];this.tone(f,3.5,'sine',.045);this.tone(f*2,2.8,'triangle',.018,.3);}}
}

installSoundscape(AudioEngine);
installCombatAudio(AudioEngine);
installWeatherAudio(AudioEngine);
installVoiceSystem(AudioEngine);
// Installed last: sampled cues take over only when decoded successfully, and
// every procedural layer remains the guaranteed fallback.
installSampledAudio(AudioEngine);
