import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {AudioEngine} from '../src/audio.js';
import {unitVoiceArchetype,formatAttackAlertText,VOICE_COOLDOWN,NOTICE_WARN_COOLDOWN} from '../src/voice-system.js';
import {createSampleBank} from '../src/sample-bank.js';
import {WarCommsController} from '../src/war-comms.js';
import {BattleChatPanel} from '../src/battle-chat.js';
import {settingsModalMarkup} from '../src/menus-ui.js';
import {commanderPortraitSvg} from '../src/commander-portraits.js';
import {Simulation} from '../src/simulation.js';

const audioDir=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../public/audio');

function mockAudio(settings={}){
  const played=[],horns=[],ducks=[],speakingStates=[];
  const eng=new AudioEngine({volume:.8,musicVolume:1,voiceVolume:1,uiVolume:1,music:true,voiceComms:true,unitVoices:true,warHorns:true,...settings});
  eng.context={currentTime:10,state:'running'};
  eng.master={gain:{value:.2}};
  eng.play=name=>played.push(name);
  eng.warHorn=kind=>{horns.push(kind);return true;};
  eng.duckMusic=(dur,lvl)=>ducks.push({dur,lvl});
  eng.setCommsSpeaking=active=>{eng.commsSpeaking=Boolean(active);speakingStates.push(Boolean(active));};
  return {eng,played,horns,ducks,speakingStates};
}

test('formatAttackAlertText produces contextual herald alerts and Simulation emits alarm target metadata',()=>{
  assert.equal(formatAttackAlertText({targetType:'towncenter'}),'Your town center is under attack!');
  assert.equal(formatAttackAlertText({targetType:'keep'}),'Your castle is under attack!');
  assert.equal(formatAttackAlertText({targetType:'wonder'}),'Your grand monument is under attack!');
  assert.equal(formatAttackAlertText({targetType:'villager'}),'Your workers are under attack!');
  assert.equal(formatAttackAlertText({targetType:'king'}),'Your sovereign is under attack!');
  assert.equal(formatAttackAlertText({targetType:'wall'}),'Your defenses are under attack!');
  assert.equal(formatAttackAlertText({}),'Your kingdom is under attack.');

  const sim=new Simulation({mode:'skirmish',map:'highlands',faction:'alder',difficulty:'normal',seed:2026});
  const tc=sim.owned(0,'building','towncenter')[0];
  const foe=sim.addUnit('swordsman',1,tc.x+4,tc.z);
  sim.hurt(tc,15,foe);
  const alarm=sim.events.find(e=>e.type==='alarm');
  assert.ok(alarm,'alarm emitted on town center hit');
  assert.equal(alarm.targetKind,'building');
  assert.equal(alarm.targetType,'towncenter');
});

test('Priority speech director prevents Under-Attack Herald and Enemy Taunt collisions on the same tick',()=>{
  const sim=new Simulation({mode:'campaign15',faction:'alder',difficulty:'normal',seed:4315});
  const {eng,played,horns}=mockAudio();
  const comms=new WarCommsController(null,{audio:eng,settings:eng.settings});
  assert.equal(eng.speechDirector,comms,'WarCommsController registers as unified speech director');

  // Same-tick alarm sequence as main.js onEvent: announceAttack fires, then warComms.onSimEvent fires!
  const alarmEvent={type:'alarm',x:0,z:0,targetKind:'building',targetType:'towncenter'};
  assert.equal(eng.announceAttack(formatAttackAlertText(alarmEvent)),true);
  comms.onSimEvent(sim,alarmEvent);

  assert.deepEqual(played,['alarm'],'watchtower iron alarm bell + horn fires immediately via Web Audio');
  assert.equal(comms.activeItem?.role,'herald','Royal Herald speaks first without being canceled');
  assert.equal(comms.activeItem?.text,'Your town center is under attack!');
  assert.equal(comms.queue.length,1,'Enemy taunt queues cleanly behind the Herald instead of colliding');
  assert.equal(comms.queue[0].role,'enemy');
  assert.equal(comms.queue[0].horn,null,'Enemy taunt after alarm skips redundant horn');
  assert.equal(horns.length,0,'No double horn blast on top of alarm');

  comms.cancelSpeech();
});

test('WarComms uses distinct audio IFF horns (enemy vs ally), tribute chime on supplies, and music ducking',()=>{
  const sim=new Simulation({mode:'campaign15',faction:'alder',difficulty:'normal',seed:4315});
  const {eng,played,horns,speakingStates}=mockAudio();
  const comms=new WarCommsController(null,{audio:eng,settings:eng.settings});

  // 1. Enemy taunt -> ominously distinct 'enemy' horn
  const taunt=comms.sendEnemyTaunt(sim,'bringit');
  assert.equal(taunt.ok,true);
  assert.equal(horns.at(-1),'enemy');

  // 2. Ally attack order -> noble 'ally' horn
  const atk=comms.issueAllyOrder(sim,null,'attack');
  assert.equal(atk.ok,true);
  assert.equal(horns.at(-1),'ally');

  // 3. Ally supplies -> tribute chime + 'ally' horn
  const sup=comms.issueAllyOrder(sim,null,'supplies');
  assert.equal(sup.ok,true);
  assert.ok(played.includes('tribute'),'supplies transfer plays tribute audio cue');
  assert.equal(horns.at(-1),'ally');

  // 4. Campaign side-quest is voiced with 'ally' horn
  comms.onSimEvent(sim,{type:'campaign-sidequest',title:'Rescue Scouts',rewardText:'+2 Archers'});
  assert.ok(comms.queue.some(q=>q.text.includes('Rescue Scouts'))||comms.activeItem?.text.includes('Rescue Scouts'));

  // 5. Cancel/mute cleanly restores music ducking
  comms.cancelSpeech();
  assert.equal(speakingStates.at(-1),false,'canceling speech releases music ducking');
});

test('unitVoiceArchetype distinguishes heroes, healers, workers, cavalry, archers, and infantry',()=>{
  assert.equal(unitVoiceArchetype({type:'king'}),'hero');
  assert.equal(unitVoiceArchetype({type:'hero_alder'}),'hero');
  assert.equal(unitVoiceArchetype({type:'monk'}),'healer');
  assert.equal(unitVoiceArchetype({type:'villager'}),'worker');
  assert.equal(unitVoiceArchetype({type:'knight'}),'cavalry');
  assert.equal(unitVoiceArchetype({type:'scout'}),'cavalry');
  assert.equal(unitVoiceArchetype({type:'archer'}),'archer');
  assert.equal(unitVoiceArchetype({type:'chukonu'}),'archer');
  assert.equal(unitVoiceArchetype({type:'swordsman'}),'infantry');
  assert.equal(unitVoiceArchetype({type:'spearman'}),'infantry');
});

test('AudioEngine supports distinct enemy/ally horn channels, throttled notice-warn, and voiceVolume mute',()=>{
  const tones=[];
  const eng=new AudioEngine({volume:.8,musicVolume:1,voiceVolume:1,uiVolume:1,unitVoices:true,warHorns:true});
  const fakeNode=()=>({connect(){},disconnect(){},start(){},stop(){},gain:{value:1,setValueAtTime(){},exponentialRampToValueAtTime(){},setTargetAtTime(v){this.value=v;}},frequency:{value:440,setValueAtTime(){},exponentialRampToValueAtTime(){}},Q:{value:1},pan:{value:0}});
  eng.context={currentTime:20,state:'running',createOscillator:fakeNode,createBiquadFilter:fakeNode,createGain:fakeNode,createStereoPanner:fakeNode};
  eng.master=fakeNode();
  eng.tone=(...args)=>tones.push(args);

  // Separate horn channels: blowing 'enemy' horn does NOT block 'ally' horn 1s later!
  assert.equal(eng.warHorn('enemy'),true);
  assert.equal(eng.warHorn('enemy'),false,'same enemy horn respects channel cooldown');
  eng.context.currentTime+=1;
  assert.equal(eng.warHorn('ally'),true,'ally horn sounds independently of enemy horn');

  // Notice warn throttles rapid spam
  assert.equal(eng.playNoticeWarn(),true);
  assert.equal(eng.playNoticeWarn(),false,'rapid warning click throttled');
  eng.context.currentTime+=NOTICE_WARN_COOLDOWN+0.1;
  assert.equal(eng.playNoticeWarn(),true);

  // Defeat, age-up, chat-all, chat-team, flare, tribute procedural fallbacks all produce audio
  for(const cue of ['defeat','age-up','chat-all','chat-team','flare','tribute']){
    const before=tones.length;
    eng.play(cue);
    assert.ok(tones.length>before,`procedural fallback emits tones for ${cue}`);
  }

  // voiceVolume=0 silences unit voices
  eng.settings.voiceVolume=0;
  eng.context.currentTime+=VOICE_COOLDOWN+0.2;
  assert.equal(eng.voice('select',{kind:'unit',type:'knight'},'alder'),false);
});

test('Sample bank loads core UI/voice cues before long music/weather stems for zero-lag startup',async()=>{
  const fetchOrder=[];
  const fetchData=async url=>{
    const name=decodeURIComponent(new URL(url).pathname.split('/').pop());
    if(name!=='manifest.json')fetchOrder.push(name);
    const file=path.join(audioDir,name);
    if(!fs.existsSync(file))return {ok:false};
    const bytes=fs.readFileSync(file);
    if(name==='manifest.json')return {ok:true,json:async()=>JSON.parse(bytes.toString('utf8'))};
    return {ok:true,arrayBuffer:async()=>bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength)};
  };
  const bank=createSampleBank({context:{decodeAudioData:async d=>({decoded:true,bytes:d.byteLength})},fetchData,base:'https://game.test/'});
  const report=await bank.load();
  assert.equal(report.coreReady,true);
  assert.equal(report.failed,0);
  const alarmIdx=fetchOrder.findIndex(f=>f.startsWith('alarm.'));
  const hornEnemyIdx=fetchOrder.findIndex(f=>f.startsWith('horn-enemy.'));
  const musicIdx=fetchOrder.findIndex(f=>f.startsWith('music-peace.'));
  assert.ok(alarmIdx>=0&&hornEnemyIdx>=0&&musicIdx>=0);
  assert.ok(alarmIdx<musicIdx,'alarm decodes before heavy music stems');
  assert.ok(hornEnemyIdx<musicIdx,'enemy war horn decodes before heavy music stems');
});

test('BattleChatPanel triggers onMessage audio hook only on live remote messages (not history or self)',()=>{
  const makeEl=()=>({hidden:false,value:'',textContent:'',disabled:false,scrollTop:0,scrollHeight:100,clientHeight:100,children:[],dataset:{},style:{setProperty(){}},addEventListener(){},setAttribute(){},focus(){},blur(){},append(el){this.children.push(el);},replaceChildren(){this.children=[];},querySelector(){return makeEl();},classList:{add(){},remove(){}},contains(){return false;}});
  const origDoc=globalThis.document,origWin=globalThis.window,origMM=globalThis.matchMedia;
  globalThis.document={createElement:()=>makeEl(),activeElement:null};
  globalThis.window={addEventListener(){}};
  globalThis.matchMedia=()=>({matches:false});
  try{
    const root=makeEl();
    const received=[];
    const chat=new BattleChatPanel(root,{send:()=>true,onMessage:m=>received.push(m)});
    chat.session('ABC123',{selfSide:0,messages:[{id:1,channel:'team',senderSide:1,senderName:'Ally',text:'Historic',sentAt:Date.now()}]});
    assert.equal(received.length,0,'replayed chat history never triggers live ping sound');
    chat.receive({id:2,channel:'all',senderSide:0,senderName:'Me',text:'Self echo',sentAt:Date.now()},false);
    assert.equal(received.length,0,'own message echo never triggers incoming ping sound');
    chat.receive({id:3,channel:'team',senderSide:1,senderName:'Ally',text:'Attack now!',sentAt:Date.now()},false);
    chat.receive({id:4,channel:'all',senderSide:2,senderName:'Foe',text:'GLHF',sentAt:Date.now()},false);
    assert.deepEqual(received.map(m=>m.channel),['team','all'],'live remote messages invoke onMessage with channel');
  }finally{
    globalThis.document=origDoc;globalThis.window=origWin;globalThis.matchMedia=origMM;
  }
});

test('Settings modal exposes voiceVolume & voiceComms controls, portraits support roles, and war-comms.css avoids blur',()=>{
  const html=settingsModalMarkup({
    settings:{volume:.7,musicVolume:.8,voiceVolume:.9,uiVolume:.8,music:true,voiceComms:true,unitVoices:true,warHorns:true,weatherSounds:true,frameRate:'auto',cameraPreset:'balanced',healthBarMode:'smart',hudScale:'1',minimapSide:'left',edgeScroll:true,edgeScrollSpeed:1,weather:'auto',lighting:'day',fog:true},
    graphicsMode:'auto',rendererStatusText:'WebGL 2',graphicsSupportHtml:'',activeTab:'audio',
  });
  assert.match(html,/id="voice-volume"/);
  assert.match(html,/id="voice-comms"/);

  const enemySvg=commanderPortraitSvg('Overlord Draven',40,'enemy');
  const heraldSvg=commanderPortraitSvg('Royal Herald',40,'herald');
  assert.match(enemySvg,/#e57869/,'enemy warlord portrait uses crimson heraldic rim');
  assert.match(heraldSvg,/#f6d97c/,'royal herald portrait uses imperial gold rim');

  const css=fs.readFileSync(new URL('../src/war-comms.css',import.meta.url),'utf8');
  assert.doesNotMatch(css,/backdrop-filter\s*:\s*blur/i,'war-comms.css maintains zero backdrop-filter blur');
});
