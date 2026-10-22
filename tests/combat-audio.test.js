import test from 'node:test';
import assert from 'node:assert/strict';
import {PerspectiveCamera,Vector3} from 'three';
import {AudioEngine} from '../src/audio.js';
import {createCombatListener,combatSoundKind,projectileImpactSound,steelResonances,synthesizeCombat,MAX_COMBAT_VOICES} from '../src/combat-audio.js';

function fixture(){
  const view={camera:new PerspectiveCamera(48,16/9,.1,1000),target:new Vector3(),zoom:50,sim:{isVisible:()=>true},entityHeight:()=>0};
  const focus=(x,z)=>{view.target.set(x,0,z);view.camera.position.set(x,50,z+50);view.camera.lookAt(view.target);view.camera.updateMatrixWorld();};focus(0,0);
  return {view,focus,entity:{x:0,z:0,owner:0,type:'swordsman',kind:'unit'}};
}

class Param{
  constructor(value=0){this.value=value;this.targets=[];}
  setTargetAtTime(value,time,constant){this.value=value;this.targets.push({value,time,constant});}
}
class Node{
  connect(){} disconnect(){this.disconnected=true;}
}
function engine(){
  const audio=new AudioEngine({volume:1,music:false});
  audio.context={state:'running',sampleRate:8000,currentTime:1,sources:[],buffers:[],
    createBuffer(channels,length,rate){const data=new Float32Array(length),buffer={duration:length/rate,getChannelData:()=>data};this.buffers.push(buffer);return buffer;},
    createBufferSource(){const source=new Node();source.start=()=>{source.started=true;};source.stop=time=>{source.stoppedAt=time;};this.sources.push(source);return source;},
    createGain(){const node=new Node();node.gain=new Param();return node;},
    createStereoPanner(){const node=new Node();node.pan=new Param();return node;},
  };
  audio.master=audio.context.createGain();return audio;
}

test('combat follows the actual viewport, including immediate pans, rotation and zoom',()=>{
  const {view,focus,entity}=fixture(),listen=createCombatListener(view);
  assert.ok(listen(entity).gain>.9);
  const right=listen({...entity,x:15}),left=listen({...entity,x:-15});assert.ok(right.pan>0&&left.pan<0);
  assert.equal(listen({...entity,x:150}).gain,0);
  focus(150,150);assert.equal(listen(entity).gain,0,'known battles outside the current camera are silent');
  focus(0,0);view.camera.position.set(50,50,0);view.camera.lookAt(view.target);view.camera.updateMatrixWorld();assert.ok(listen({...entity,z:15}).pan<0,'stereo follows a rotated camera');
  view.camera.position.set(0,8,8);view.camera.lookAt(view.target);view.camera.updateMatrixWorld();assert.equal(listen({...entity,x:15}).gain,0,'zooming in does not leave a fixed audibility radius');
});

test('fog-hidden fights, invalid locations and inactive gameplay are silent',()=>{
  const {view,entity}=fixture();view.sim.isVisible=()=>false;let active=true;
  const listen=createCombatListener(view,()=>active);
  assert.equal(listen({...entity,owner:1}).gain,0);assert.ok(listen(entity).gain>0);active=false;assert.equal(listen(entity).gain,0);
  active=true;for(const bad of [null,{...entity,x:NaN},{...entity,z:Infinity}])assert.equal(listen(bad).gain,0);
});

test('sound materials distinguish steel, bows and structural impacts',()=>{
  assert.equal(combatSoundKind({type:'knight'}, {kind:'unit'}),'metal');
  assert.equal(combatSoundKind({type:'archer'}, {kind:'unit'}),'arrow');
  assert.equal(combatSoundKind({type:'tower',kind:'building'}),'arrow');
  assert.equal(combatSoundKind({type:'ram'}),'wood');
  assert.equal(combatSoundKind({type:'swordsman'}, {kind:'building'}),'wood');
  for(const type of ['catapult','warship'])assert.equal(combatSoundKind({type}),'siege');
});

test('original effect buffers are finite, bounded and varied with a silent tail',()=>{
  for(const kind of ['metal','arrow','wood','siege','earth']){
    const samples=synthesizeCombat(kind,8000,0),other=synthesizeCombat(kind,8000,1);
    assert.ok(samples.every(Number.isFinite));assert.ok(Math.max(...samples.map(Math.abs))<=.821);assert.equal(Math.abs(samples[0]),0);assert.ok(Math.abs(samples.at(-1))<.001);
    assert.ok(samples.some((value,index)=>Math.abs(value-other[index])>.02));
    assert.ok(samples.reduce((sum,value)=>sum+value*value,0)/samples.length>.002);
  }
});

test('steel modes stay in the device bandwidth and misses do not make armor clashes',()=>{
  for(const rate of [8000,22050,44100,48000])for(let variant=0;variant<4;variant++){
    const modes=steelResonances(rate,variant);assert.ok(modes.length>=4);assert.ok(modes.every(mode=>mode.frequency<rate*.45&&mode.decay<.1));
    const samples=synthesizeCombat('metal',rate,variant),energy=(from,to)=>samples.slice(Math.floor(from*rate),Math.floor(to*rate)).reduce((sum,value)=>sum+value*value,0);
    assert.ok(samples.every(Number.isFinite));assert.ok(energy(0,.08)>energy(.16,.24)*15,'hard steel contact decays quickly rather than ringing like a bell');
  }
  assert.equal(projectileImpactSound({damage:0,target:{kind:'unit'}}),'earth');
  assert.equal(projectileImpactSound({damage:5,target:{kind:'unit'}}),'metal');
  assert.equal(projectileImpactSound({damage:5,target:{kind:'building'}}),'wood');
  assert.equal(projectileImpactSound({siege:true,damage:0}),'siege');
});

test('offscreen events allocate no audio and do not consume the on-screen burst budget',()=>{
  const {view,focus,entity}=fixture(),audio=engine();audio.setCombatListener(createCombatListener(view));focus(150,150);
  for(let i=0;i<100;i++)assert.equal(audio.play('attack',entity),false);
  assert.equal(audio.context.sources.length,0);assert.equal(audio.context.buffers.length,0);
  focus(0,0);assert.equal(audio.play('attack',entity),true);assert.equal(audio.combatVoices.size,1);
});

test('panning away fades existing clashes and releases their source nodes',()=>{
  const {view,focus,entity}=fixture(),audio=engine();audio.setCombatListener(createCombatListener(view));audio.play('attack',entity);
  const [voice]=audio.combatVoices;focus(150,150);audio.updateCombat();
  assert.equal(voice.retiring,true);assert.equal(voice.gain.gain.targets.at(-1).value,0);assert.ok(voice.source.stoppedAt-audio.context.currentTime<=.07);
  voice.source.onended();assert.equal(audio.combatVoices.size,0);assert.ok(voice.source.disconnected&&voice.gain.disconnected&&voice.pan.disconnected);
});

test('large fights have bounded overlap, cached effects and immediate mute/clear',()=>{
  const audio=engine();audio.setCombatListener(()=>({gain:1,pan:.25}));const entity={x:0,z:0,type:'spearman',owner:0,kind:'unit'};
  for(let i=0;i<MAX_COMBAT_VOICES+4;i++){audio.context.currentTime+=.04;audio.play('attack',entity);}
  assert.equal(audio.combatVoices.size,MAX_COMBAT_VOICES);assert.equal(audio.context.buffers.length,4);
  audio.settings.volume=0;audio.updateCombat();assert.ok([...audio.combatVoices].every(voice=>voice.retiring));
  assert.equal(audio.play('attack',entity),false);for(const voice of [...audio.combatVoices])voice.source.onended();
  audio.settings.volume=1;audio.context.currentTime+=1;audio.play('attack',entity);audio.clearCombat();assert.ok([...audio.combatVoices].every(voice=>voice.retiring));
});
