import {installSoundscape} from './soundscape.js';
import {installWeatherAudio} from './weather-audio.js';
export class AudioEngine {
  constructor(settings){this.settings=settings;this.context=null;this.musicTimer=0;this.note=0;}
  unlock(){if(!this.context){const C=window.AudioContext||window.webkitAudioContext;if(!C)return;this.context=new C();this.master=this.context.createGain();this.master.connect(this.context.destination);}if(this.context.state==='suspended')this.context.resume();this.master.gain.value=this.settings.volume*.24;}
  tone(freq,duration=.15,type='sine',gain=.15,delay=0){if(!this.context||this.settings.volume<=0)return;const t=this.context.currentTime+delay,o=this.context.createOscillator(),g=this.context.createGain();o.type=type;o.frequency.value=freq;g.gain.setValueAtTime(.001,t);g.gain.exponentialRampToValueAtTime(gain,t+.015);g.gain.exponentialRampToValueAtTime(.001,t+duration);o.connect(g);g.connect(this.master);o.start(t);o.stop(t+duration+.02);}
  play(name){if(!this.context)return;this.master.gain.value=this.settings.volume*.24;
    if(name==='select'){this.tone(350,.08,'sine',.1);this.tone(525,.1,'sine',.06,.04);}
    if(name==='order'){this.tone(240,.08,'triangle');this.tone(320,.1,'triangle',.1,.06);}
    if(name==='coin'){this.tone(920,.18,'sine',.08);this.tone(1300,.18,'sine',.07,.1);}
    if(name==='complete'){[392,494,587].forEach((f,i)=>this.tone(f,.4,'triangle',.1,i*.1));}
    if(name==='alarm'){[146,146,196].forEach((f,i)=>this.tone(f,.35,'sawtooth',.055,i*.4));}
    if(name==='attack'&&Math.random()<.12)this.tone(70+Math.random()*60,.07,'triangle',.07);
    if(name==='victory'){[262,330,392,523].forEach((f,i)=>this.tone(f,.9,'triangle',.15,i*.24));}
  }
  tick(dt){if(!this.settings.music||!this.context)return;this.musicTimer-=dt;if(this.musicTimer<=0){this.musicTimer=2.8;const notes=[130.81,164.81,196,146.83,130.81,174.61,196,146.83];const f=notes[this.note++%notes.length];this.tone(f,3.5,'sine',.045);this.tone(f*2,2.8,'triangle',.018,.3);}}
}

installSoundscape(AudioEngine);
installWeatherAudio(AudioEngine);
