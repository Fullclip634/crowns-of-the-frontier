import test from 'node:test';
import assert from 'node:assert/strict';
import {AudioEngine} from '../src/audio.js';

test('muted play does not open an audio device and rejected device resumes are handled',async()=>{
  const original=globalThis.window;let created=0,resumed=0;
  class Context{constructor(){created++;this.state='suspended';this.destination={};this.sampleRate=8;}createGain(){return {gain:{value:1},connect(){},disconnect(){}};}createDynamicsCompressor(){return {threshold:{},ratio:{},connect(){}};}createBuffer(){return {getChannelData:()=>new Float32Array(8)};}createBufferSource(){return {connect(){},start(){}};}createBiquadFilter(){return {frequency:{},connect(){}};}resume(){resumed++;return Promise.reject(new Error('Audio device unavailable'));}}
  globalThis.window={AudioContext:Context};
  try{
    const settings={volume:0,music:false},audio={settings,context:null};AudioEngine.prototype.unlock.call(audio);assert.equal(created,0);assert.equal(audio.context,null);
    settings.volume=.5;AudioEngine.prototype.unlock.call(audio);await new Promise(resolve=>setImmediate(resolve));assert.equal(created,1);assert.equal(resumed,1);assert.equal(audio.master.gain.value,.12);
    settings.volume=0;AudioEngine.prototype.unlock.call(audio);assert.equal(created,1);assert.equal(resumed,1);assert.equal(audio.master.gain.value,0);
    globalThis.window.AudioContext=class{constructor(){throw new Error('Device denied');}};const unavailable={settings:{volume:.5},context:null};assert.doesNotThrow(()=>AudioEngine.prototype.unlock.call(unavailable));assert.equal(unavailable.context,null);
  }finally{globalThis.window=original;}
});
