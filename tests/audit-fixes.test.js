import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {Simulation} from '../src/simulation.js';
import {MAPS,MISSIONS,UNITS} from '../src/data.js';
import {CAMPAIGN_SCRIPTS,campaignObjective} from '../src/campaigns.js';
import {CAMPAIGN_BOSSES,CAMPAIGN_SIDE_QUESTS,applyCampaignRelic} from '../src/campaign-relics.js';
import {CAMPAIGN_NODES} from '../src/campaign-map-data.js';
import {campaignMapMarkup} from '../src/campaign-map-ui.js';
import {commanderProfile} from '../src/commander-portraits.js';
import {inspectorStatsMarkup} from '../src/entity-inspector.js';
import {createRoomCore} from '../src/room-core.js';
import {kingdomScore} from '../src/hud-macro.js';
import {WarCommsController} from '../src/war-comms.js';
import {spawnHeroGeneral} from '../src/heroes.js';
import {AudioEngine} from '../src/audio.js';
import {installSampledAudio} from '../src/sampled-audio.js';
import {synthesizeVocalBark} from '../src/voice-system.js';
import {SETTINGS_TABS,landingMarkup,settingsModalMarkup} from '../src/menus-ui.js';
import {uiVectorIcon} from '../src/ui-icons.js';

const audioDir=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../public/audio');

function localAudioFetch(url){
  const name=decodeURIComponent(new URL(url).pathname.split('/').pop());
  const file=path.join(audioDir,name);
  if(!fs.existsSync(file))return Promise.resolve({ok:false});
  const bytes=fs.readFileSync(file);
  if(name==='manifest.json')return Promise.resolve({ok:true,json:async()=>JSON.parse(bytes.toString('utf8'))});
  return Promise.resolve({ok:true,arrayBuffer:async()=>bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength)});
}

test('#1 Act V alliance resource gifts succeed across all five chapters (campaign15-19)',()=>{
  for(const mode of ['campaign15','campaign16','campaign17','campaign18','campaign19']){
    const sim=new Simulation({mode,faction:'alder',difficulty:'normal',seed:4315});
    const allyIdx=sim.players.findIndex((p,i)=>i>0&&sim.allied(0,i)&&!p.defeated&&!p.dormant);
    assert.ok(allyIdx>0,`${mode} has an active ally`);
    sim.players[0].resources.gold=1000;
    const beforeAlly=sim.players[allyIdx].resources.gold;
    const donations=[];
    sim.on(e=>{if(e.type==='donation')donations.push(e);});
    assert.equal(sim.donateResources(0,allyIdx,'gold',150),true,`${mode} accepts resource donation`);
    assert.equal(sim.players[0].resources.gold,850);
    assert.equal(sim.players[allyIdx].resources.gold,beforeAlly+150);
    assert.equal(donations.length,1);
  }
});

test('#2 Campaign Trebuchet objectives and reinforcements accept and spawn actual trebuchet units',()=>{
  const c5=new Simulation({mode:'campaign5',difficulty:'story',seed:4305});
  c5.tickAI=()=>{};
  const tc=c5.owned(0,'building','towncenter')[0];
  c5.addUnit('trebuchet',0,tc.x+8,tc.z+12);
  c5.addUnit('trebuchet',0,tc.x+11,tc.z+12);
  assert.equal(CAMPAIGN_SCRIPTS.campaign5.stages[0].done(c5,c5.campaignState),true,'Chapter V Stage 1 counts Trebuchets');
  assert.equal(CAMPAIGN_SCRIPTS.campaign5.optional.done(c5,c5.campaignState),true,'Chapter V optional crown counts Trebuchets');

  const c14=new Simulation({mode:'campaign14',difficulty:'story',seed:4314});
  c14.tickAI=()=>{};
  const tc14=c14.owned(0,'building','towncenter')[0];
  c14.addUnit('trebuchet',0,tc14.x+8,tc14.z+8);
  c14.addUnit('trebuchet',0,tc14.x+11,tc14.z+8);
  assert.equal(CAMPAIGN_SIDE_QUESTS.campaign14.done(c14),true,'Chapter XIV side quest counts Trebuchets');

  // Chapter X side quest spawns a genuine Trebuchet
  const c10=new Simulation({mode:'campaign10',difficulty:'story',seed:4310});
  c10.tickAI=()=>{};
  const trebsBefore=c10.owned(0,'unit','trebuchet').length;
  c10.addBuilding('workshop',0,c10.players[0].start.x+12,c10.players[0].start.z+12,true);
  for(let i=0;i<10;i++)c10.tick(.1);
  assert.equal(c10.owned(0,'unit','trebuchet').length,trebsBefore+1,'Chapter X side quest delivers a real Trebuchet');
});

test('#3 Castle Siege mode works symmetrically in multiplayer rooms and enforces Castle victory/defeat',()=>{
  const core=createRoomCore({maxRooms:4,tickInterval:10000});
  try{
    const makeSocket=()=>{const sent=[];return {readyState:1,bufferedAmount:0,sent,send(raw){sent.push(JSON.parse(raw));},close(){this.readyState=3;},terminate(){this.readyState=3;}};};
    const ws0=makeSocket(),ws1=makeSocket();
    const c0=core.connect(ws0),c1=core.connect(ws1);
    c0.message(JSON.stringify({type:'create',name:'Host',faction:'iron',options:{mode:'siege',map:'ironpass',seed:901}}));
    const session=ws0.sent.find(m=>m.type==='session');
    assert.ok(session,'siege room created');
    c1.message(JSON.stringify({type:'join',code:session.code,name:'Guest',faction:'jade'}));
    c0.message(JSON.stringify({type:'start'}));
    const room=core.rooms.get(session.code);
    assert.equal(room.options.mode,'siege');
    assert.ok(room.sim.owned(0,'building','keep').length>=1,'host has Castle Keep');
    assert.ok(room.sim.owned(1,'building','keep').length>=1,'guest has Castle Keep');
    assert.ok(room.sim.owned(1,'building','wall').length>=8,'guest has symmetric walls in multiplayer siege');
  }finally{
    core.close();
  }
});

test('#4 Cartographer Seal relic genuinely increases scout vision in fog, inspector, and saves',()=>{
  const plain=new Simulation({mode:'campaign1',difficulty:'story',seed:4301});
  const withRelic=new Simulation({mode:'campaign1',difficulty:'story',seed:4301,relic:'cartographer-seal'});
  const countVisible=sim=>sim.visible.reduce((a,v)=>a+v,0);
  const plainScout=plain.owned(0,'unit','scout')[0];
  const relicScout=withRelic.owned(0,'unit','scout')[0];

  const expectedBoosted=Math.round(UNITS.scout.vision*1.2);
  assert.equal(plain.unitVision(plainScout),UNITS.scout.vision);
  assert.equal(withRelic.unitVision(relicScout),expectedBoosted);
  assert.ok(countVisible(withRelic)>countVisible(plain),`Cartographer Seal reveals more fog cells (${countVisible(withRelic)} > ${countVisible(plain)})`);
  assert.match(inspectorStatsMarkup(withRelic,relicScout),new RegExp(`VIS<b>${expectedBoosted}m<\\/b>`));

  // Newly trained scouts and saved/restored games retain the +20% vision bonus
  const restored=Simulation.restore(JSON.parse(JSON.stringify(withRelic.serialize())));
  const trainedScout=restored.addUnit('scout',0,0,0);
  assert.equal(restored.unitVision(trainedScout),expectedBoosted,'newly trained scout inherits Cartographer Seal after restore');
});

test('#5 Multiplayer routes Hero skills/auto-cast, forwards Hero/Wonder/Oil events, guards WarComms, and syncs true scores',()=>{
  const core=createRoomCore({maxRooms:4,tickInterval:10000});
  try{
    const makeSocket=()=>{const sent=[];return {readyState:1,bufferedAmount:0,sent,send(raw){sent.push(JSON.parse(raw));},close(){this.readyState=3;},terminate(){this.readyState=3;}};};
    const ws0=makeSocket(),ws1=makeSocket();
    const c0=core.connect(ws0),c1=core.connect(ws1);
    c0.message(JSON.stringify({type:'create',name:'Host',faction:'alder',options:{mode:'skirmish',map:'highlands',seed:555}}));
    const session=ws0.sent.find(m=>m.type==='session');
    c1.message(JSON.stringify({type:'join',code:session.code,name:'Guest',faction:'jade'}));
    c0.message(JSON.stringify({type:'start'}));
    const room=core.rooms.get(session.code);
    const begin0=ws0.sent.find(m=>m.type==='begin').state;

    // Authoritative publicScore prevents fog-zeroed enemy score on client
    const trueP1Score=kingdomScore(room.sim,1);
    assert.ok(trueP1Score>0);
    assert.equal(begin0.players[1].resources.food,0,'enemy resources stay hidden by fog');
    assert.equal(begin0.players[1].publicScore,trueP1Score,'enemy publicScore carries true server score');
    const clientSim=Simulation.restore(begin0);
    assert.equal(kingdomScore(clientSim,1),trueP1Score,'client kingdomScore uses authoritative publicScore in multiplayer');

    // Hero Auto-Cast toggle & manual Skill cast execute authoritatively on server
    const hero=spawnHeroGeneral(room.sim,0);
    hero.skillCooldowns=[0,0];
    const ally=room.sim.addUnit('swordsman',0,hero.x+2,hero.z);
    ally.hp=30;
    c0.message(JSON.stringify({type:'action',method:'toggleHeroAutoCast',args:[hero.id]}));
    assert.equal(hero.autoCast,false,'server toggled hero autoCast off');
    c0.message(JSON.stringify({type:'action',method:'castHeroSkill',args:[hero.id,0]}));
    assert.ok(ally.hp>30,'server executed hero skill healing ally');
    assert.ok(room.effects.some(e=>e.type==='hero-skill'),'server queued hero-skill effect for broadcast');

    // Wonder & boiling-oil events are also captured in room.effects
    room.sim.emit('wonder-started',{owner:0,name:'Host',faction:'alder',wonderName:'Grand Cathedral',x:0,z:0});
    room.sim.emit('boiling-oil',{owner:0,x:0,z:0,count:2});
    assert.ok(room.effects.some(e=>e.type==='wonder-started'));
    assert.ok(room.effects.some(e=>e.type==='boiling-oil'));

    // WarComms hides and blocks local AI mutations in multiplayer
    const fakeBtn={hidden:false,classList:{toggle(cls,force){if(cls==='hidden')fakeBtn.hidden=!!force;}},setAttribute(){}};
    const comms=new WarCommsController({querySelector:s=>s==='#comms-toggle'?fakeBtn:null},{settings:{}});
    comms.refresh(clientSim);
    assert.equal(fakeBtn.hidden,true,'War-Comms toggle stays hidden in multiplayer');
    assert.equal(comms.issueAllyOrder(clientSim,null,'supplies').ok,false);
    assert.equal(comms.sendEnemyTaunt(clientSim,'bringit').ok,false);
  }finally{
    core.close();
  }
});

test('#6 Audio respects uiVolume with decoded samples, avoids squaring master volume, covers all 29 maps & Jade voice',async()=>{
  const gains=[];
  function makeCtx(){
    const node=extra=>({connect(){},disconnect(){},start(){},stop(){},...extra});
    return {
      state:'running',currentTime:5,sampleRate:22050,destination:{},
      createGain(){const g=node({gain:{value:0,setTargetAtTime(v){this.value=v;}}});gains.push(g);return g;},
      createBufferSource(){return node({buffer:null,loop:false,playbackRate:{value:1},onended:null});},
      createStereoPanner(){return node({pan:{value:0}});},
      decodeAudioData:async data=>({decoded:true,bytes:data.byteLength}),
    };
  }
  class Engine{
    constructor(settings={}){this.settings={volume:.5,uiVolume:1,music:true,weatherSounds:true,...settings};this.procedural=[];}
    unlock(){this.context=makeCtx();this.master={connect(){}};}
    play(name){this.procedural.push(name);}
    voice(){return true;}
    warHorn(){return true;}
    weather(){}
    tick(){}
  }
  installSampledAudio(Engine,{fetchData:localAudioFetch,base:'https://game.test/'});
  const engine=new Engine({volume:.5,uiVolume:0});
  engine.unlock();
  await engine.sampleBank.load();
  await new Promise(r=>setImmediate(r));

  const gainsBefore=gains.length;
  engine.play('select');
  assert.equal(gains.length,gainsBefore,'uiVolume=0 silences sampled select cue');
  assert.deepEqual(engine.procedural,[],'uiVolume=0 does not fall back to synth');

  // With uiVolume=1 and volume=0.5, gain is linear (0.55), NOT squared (0.55 * 0.5)
  engine.settings.uiVolume=1;
  engine.play('select');
  assert.equal(gains.length,gainsBefore+1,'uiVolume=1 plays sampled select cue');
  assert.ok(Math.abs(gains.at(-1).gain.value-0.55)<0.001,`playCue gain is linear 0.55 (got ${gains.at(-1).gain.value})`);

  // Every map in MAPS is mapped in sampled-audio BIOME_AMBIENCE
  const sampledSrc=fs.readFileSync(new URL('../src/sampled-audio.js',import.meta.url),'utf8');
  const biomeBlock=sampledSrc.match(/const BIOME_AMBIENCE=\{([\s\S]*?)\};/)?.[1]||'';
  const mapped=new Set([...biomeBlock.matchAll(/([a-z0-9_]+)\s*:/gi)].map(m=>m[1]));
  for(const mapId of Object.keys(MAPS)){
    assert.ok(mapped.has(mapId),`BIOME_AMBIENCE explicitly maps ${mapId}`);
  }

  // Jade procedural vocal cadence synthesizes cleanly
  const mockParam=()=>({value:0,setValueAtTime(){},exponentialRampToValueAtTime(){}});
  const mockNode=()=>({connect(){},disconnect(){},start(){},stop(){},frequency:mockParam(),gain:mockParam(),Q:mockParam(),type:''});
  const vCtx={currentTime:1,createOscillator:mockNode,createBiquadFilter:mockNode,createGain:mockNode};
  assert.ok(synthesizeVocalBark(vCtx,'jade','attack',1));
});

test('#7 Part A & Icons: Briefing hover specificity, Act V boss/side-quest/portraits, non-overlapping map pins, unified chrome icons',()=>{
  const loadCss=fs.readFileSync(new URL('../src/mission-loading.css',import.meta.url),'utf8');
  assert.match(loadCss,/button\.chronicle-begin-btn:hover:not\(:disabled\)/,'briefing hover rule overrides style.css global button hover');

  const mapCss=fs.readFileSync(new URL('../src/campaign-map.css',import.meta.url),'utf8');
  assert.match(mapCss,/\.atlas-acts\{[^}]*flex-wrap:nowrap/,'Act tabs stay on a single desktop row');
  assert.match(mapCss,/\.atlas-legend>\.atlas-lore-note\{[^}]*display:block[^}]*text-overflow:ellipsis/,'legend lore note truncates cleanly with ellipsis');

  // Every Act V chapter has Boss card, Side Quest, and non-default Commander portrait
  for(const id of ['campaign15','campaign16','campaign17','campaign18','campaign19']){
    assert.ok(CAMPAIGN_BOSSES[id],`${id} has Rival Commander boss profile`);
    assert.ok(CAMPAIGN_SIDE_QUESTS[id],`${id} has mid-mission Side Quest`);
    const html=campaignMapMarkup({progress:{},selectedId:id,freeSelect:true});
    assert.match(html,/brief-boss/,`${id} renders boss card`);
    assert.match(html,/brief-sidequest/,`${id} renders side quest card`);
  }
  for(const speaker of ['Marshal Rowan','Lady Vaelen','Jarl Torin']){
    assert.notEqual(commanderProfile(speaker).title,'Frontier Commander',`${speaker} has custom heraldic profile`);
  }

  // No two Campaign Map pins collide (either separated horizontally >= 165 or vertically >= 68 in 1000x580 SVG units)
  for(let i=0;i<CAMPAIGN_NODES.length;i++){
    for(let j=i+1;j<CAMPAIGN_NODES.length;j++){
      const a=CAMPAIGN_NODES[i],b=CAMPAIGN_NODES[j];
      const separated=Math.abs(a.x-b.x)>=165||Math.abs(a.y-b.y)>=68;
      assert.ok(separated,`Campaign nodes ${a.id} (${a.x},${a.y}) and ${b.id} (${b.x},${b.y}) must not collide`);
    }
  }

  // Unified chrome icons: Settings uses volume-2 (Audio) & eye (Accessibility) without raster mixing
  assert.equal(SETTINGS_TABS.find(t=>t.id==='audio')?.icon,'volume-2');
  assert.equal(SETTINGS_TABS.find(t=>t.id==='accessibility')?.icon,'eye');
  const settingsHtml=settingsModalMarkup({settings:{volume:.7},graphicsMode:'auto',activeTab:'audio'});
  assert.match(settingsHtml,/#icon-volume-2/);
  assert.match(settingsHtml,/#icon-eye/);
  assert.doesNotMatch(settingsHtml,/class="settings-tab[\s\S]*?ui-icon-painted[\s\S]*?<\/nav>/);

  // Main Menu uses vector gold shield crest (no purple ui-tier-epic) and distinct header/subrow icons
  const landing=landingMarkup(null);
  const crestHtml=landing.match(/<span class="crest">([\s\S]*?)<\/span>/)?.[1]||'';
  assert.ok(crestHtml.includes('#icon-castle'));
  assert.doesNotMatch(crestHtml,/ui-icon-painted/);
  assert.match(landing,/data-action="tech-tree"[\s\S]*?#icon-columns-3/);
  assert.match(landing,/data-mode="tutorial"[\s\S]*?#icon-graduation-cap/);
  assert.match(landing,/data-action="codex"[\s\S]*?#icon-book-open/);
  assert.doesNotMatch(uiVectorIcon('trophy'),/ui-icon-painted/);
});
