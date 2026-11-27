import {installSoundscape} from './soundscape.js';
import {installWeatherAudio} from './weather-audio.js';
import {installCombatAudio} from './combat-audio.js';
import {installVoiceSystem} from './voice-system.js';
import {installSampledAudio} from './sampled-audio.js';

const UI_CUE_NAMES=new Set([
  'select','order','coin','complete','alarm','victory',
  'defeat','age-up','chat-all','chat-team','flare','tribute','notice-warn',
]);

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
    const uiGain=this.settings.uiVolume??1;
    if(uiGain<=0&&UI_CUE_NAMES.has(name))return;
    const g=v=>v*uiGain;
    if(name==='select'){this.tone(392,.085,'sine',g(.1));this.tone(587.33,.1,'triangle',g(.06),.025);}
    if(name==='order'){this.tone(196,.085,'triangle',g(.11));this.tone(293.66,.11,'sine',g(.09),.045);}
    if(name==='coin'){this.tone(1174.66,.16,'sine',g(.08));this.tone(1479.98,.18,'sine',g(.07),.085);}
    if(name==='complete'){[293.66,369.99,440,587.33].forEach((f,i)=>this.tone(f,.42,'triangle',g(.095),i*.085));}
    if(name==='alarm'){[146.83,293.66,146.83,293.66].forEach((f,i)=>{this.tone(f,.42,'triangle',g(.10),i*.22);this.tone(f*1.183,.32,'sine',g(.045),i*.22);});}
    if(name==='victory'){this.tone(146.83,1.3,'triangle',g(.09));[293.66,369.99,440,587.33].forEach((f,i)=>this.tone(f,.92,'triangle',g(.13),i*.22));}
    if(name==='defeat'){[293.66,261.63,220,174.61].forEach((f,i)=>this.tone(f,.85,'triangle',g(.10),i*.28));this.tone(73.42,1.6,'sine',g(.08),0);}
    if(name==='age-up'){[293.66,440,587.33,739.99].forEach((f,i)=>this.tone(f,.78,'triangle',g(.115),i*.16));this.tone(146.83,1.3,'sine',g(.08),0);}
    if(name==='chat-all'){this.tone(880,.18,'sine',g(.075),0);}
    if(name==='chat-team'){this.tone(659.25,.16,'sine',g(.08),0);this.tone(987.77,.24,'sine',g(.085),.11);}
    if(name==='flare'){this.tone(783.99,.22,'sine',g(.09),0);this.tone(1174.66,.34,'triangle',g(.095),.12);}
    if(name==='tribute'){this.tone(1174.66,.16,'sine',g(.08),0);this.tone(1479.98,.18,'sine',g(.075),.07);this.tone(587.33,.42,'triangle',g(.07),.14);}
    if(name==='notice-warn'){this.tone(155.56,.09,'triangle',g(.075),0);this.tone(130.81,.12,'triangle',g(.07),.095);}
  }
  tick(dt){if(!this.settings.music||!this.context)return;const mg=this.settings.musicVolume??1;if(mg<=0)return;this.musicTimer-=dt;if(this.musicTimer<=0){this.musicTimer=2.8;const notes=[130.81,164.81,196,146.83,130.81,174.61,196,146.83];const f=notes[this.note++%notes.length];this.tone(f,3.5,'sine',.045*mg);this.tone(f*2,2.8,'triangle',.018*mg,.3);}}
}

installSoundscape(AudioEngine);
installCombatAudio(AudioEngine);
installWeatherAudio(AudioEngine);
installVoiceSystem(AudioEngine);
// Installed last: sampled cues take over only when decoded successfully, and
// every procedural layer remains the guaranteed fallback.
installSampledAudio(AudioEngine);
