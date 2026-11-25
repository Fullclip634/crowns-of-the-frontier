import {describe,it} from 'node:test';
import assert from 'node:assert/strict';
import {Simulation} from '../src/simulation.js';
import {AI_PERSONALITIES,normalizePersonality,applyPersonalityProfile} from '../src/ai-personalities.js';
import {AI_PROFILES} from '../src/commander-ai.js';
import {customOpening} from '../src/allied-ai.js';
import {normalizeBattle,battlePreset} from '../src/custom-battle.js';
import {customBattleMarkup,roomLobbyMarkup} from '../src/custom-battle-ui.js';
import {skirmishHubMarkup,saveManagerMarkup} from '../src/menus-ui.js';
import {MatchReplayRecorder,ReplayDriver,saveReplay,listReplays,readReplay,deleteReplay} from '../src/replay.js';
import {SIMULATION_STEP} from '../src/simulation-pacing.js';

function memoryStorage(){
  const m=new Map();
  return {getItem:k=>m.has(k)?m.get(k):null,setItem:(k,v)=>m.set(k,String(v)),removeItem:k=>m.delete(k)};
}

describe('Track 3: AI Commander Personalities, Lobby Overhaul & Match Replays',()=>{
  it('tunes AI opening and profile weights distinctly across personalities while keeping balanced untouched',()=>{
    assert.equal(Object.keys(AI_PERSONALITIES).length,5);
    assert.equal(normalizePersonality('unknown'),'balanced');
    assert.strictEqual(applyPersonalityProfile(AI_PROFILES.normal,'balanced'),AI_PROFILES.normal,'balanced returns base profile untouched');

    const rusher=applyPersonalityProfile(AI_PROFILES.normal,'rusher');
    const boomer=applyPersonalityProfile(AI_PROFILES.normal,'boomer');
    const turtle=applyPersonalityProfile(AI_PROFILES.normal,'turtle');
    assert.ok(rusher.raid<AI_PROFILES.normal.raid&&rusher.attackFactor<1,'rusher raids earlier with smaller waves');
    assert.ok(boomer.workers>AI_PROFILES.normal.workers&&boomer.attackFactor>1,'boomer prioritizes larger economy');
    assert.ok(turtle.retreat>AI_PROFILES.normal.retreat,'turtle retreats earlier to protect garrison');

    const simRush=new Simulation({mode:'custom',slots:battlePreset('2v2').map((s,i)=>i===1?{...s,aiPersonality:'rusher'}:s)});
    const simBoom=new Simulation({mode:'custom',slots:battlePreset('2v2').map((s,i)=>i===1?{...s,aiPersonality:'boomer'}:s)});
    const openRush=customOpening(simRush,1,AI_PROFILES.normal);
    const openBoom=customOpening(simBoom,1,AI_PROFILES.normal);
    assert.ok(openRush.earliest<openBoom.earliest,'rusher opens hostilities earlier than boomer');
  });

  it('preserves aiPersonality in normalizeBattle and renders AI Style & Ready Pills in lobby markup',()=>{
    const slots=battlePreset('2v2');
    slots[1].aiPersonality='turtle';
    const norm=normalizeBattle({map:'highlands',slots});
    assert.equal(norm.slots[1].aiPersonality,'turtle');

    const customHtml=customBattleMarkup({map:'highlands',mapSize:'vast',playerSlot:1,startAge:0,resourceLevel:'standard',populationLimit:80,seed:2026,victory:'annihilation',slots});
    assert.match(customHtml,/id="custom-personality-1"/);
    assert.match(customHtml,/Vanguard Rusher/);
    assert.match(customHtml,/Iron Bastion/);

    const hubHtml=skirmishHubMarkup({mode:'skirmish',faction:'alder',aiPersonality:'admiral'});
    assert.match(hubHtml,/id="ai-personality"/);
    assert.match(hubHtml,/Sea Admiral/);

    const lobbyHtml=roomLobbyMarkup({
      code:'ABC123',host:true,canStart:true,selfSide:0,selfReady:true,spectator:false,
      options:{mode:'custom',hostSpectator:false},
      slots:[{slotNumber:1,side:0,name:'Host',team:1,faction:'alder',controller:'human',difficulty:'normal',aiHealth:100},{slotNumber:2,side:1,name:'Bot',team:2,faction:'raven',controller:'ai',difficulty:'hard',aiHealth:100}],
      players:[{side:0,name:'Host',connected:true,ready:true}],
    });
    assert.match(lobbyHtml,/class="ready-pill is-ready"/);
    assert.match(lobbyHtml,/class="ready-pill is-ai"/);
    assert.match(lobbyHtml,/id="room-code"/);
  });

  it('records lightweight command-log replays, persists up to 5, and replays commands deterministically',()=>{
    const storage=memoryStorage();
    const sim=new Simulation({mode:'skirmish',faction:'alder',map:'highlands',seed:777});
    const rec=new MatchReplayRecorder();
    assert.equal(rec.attach(sim,sim.options),true);

    const tc=sim.owned(0,'building','towncenter')[0];
    for(let i=0;i<5;i++)sim.tick(SIMULATION_STEP);
    sim.train(tc.id,'villager');
    for(let i=0;i<10;i++)sim.tick(SIMULATION_STEP);
    const v=sim.owned(0,'unit','villager')[0];
    sim.smartCommand([v.id],null,tc.x+8,tc.z+8,false,false);
    for(let i=0;i<10;i++)sim.tick(SIMULATION_STEP);

    const record=rec.buildRecord({won:true});
    rec.detach();
    assert.deepEqual(record.commands.map(({tick,op})=>[tick,op]),[[5,'train'],[15,'smartCommand']]);
    assert.ok(JSON.stringify(record).length<2000,'replay payload is tiny');

    assert.equal(saveReplay(record,storage),true);
    assert.equal(listReplays(storage).length,1);
    assert.ok(readReplay(record.id,storage));

    const saveHtml=saveManagerMarkup([{slotId:'auto',label:'Auto-Save',exists:false}],{replays:listReplays(storage)});
    assert.match(saveHtml,/RECENT BATTLE REPLAYS/);
    assert.match(saveHtml,new RegExp(`data-play-replay="${record.id}"`));

    // Replay deterministically onto a fresh Simulation with same seed
    const playbackSim=new Simulation({...record.options,replay:true});
    const driver=new ReplayDriver(record);
    let applied=0;
    for(let i=0;i<=record.endTick;i++){
      applied+=driver.step(playbackSim);
      if(!driver.finished)playbackSim.tick(SIMULATION_STEP);
    }
    assert.equal(applied,2,'replayed both commands cleanly');
    assert.equal(driver.progress,1);
    assert.deepEqual(playbackSim.players,sim.players);
    assert.deepEqual(playbackSim.entities,sim.entities);
    assert.ok(playbackSim.owned(0,'building','towncenter')[0].queue.length>=1,'villager training replayed on fresh sim');

    assert.equal(deleteReplay(record.id,storage),true);
    assert.equal(listReplays(storage).length,0);
  });

  it('regenerates AI commands during playback of a match with no player orders',()=>{
    const sim=new Simulation({mode:'skirmish',map:'highlands',seed:512});
    const initialRival={...sim.players[1].resources};
    const recorder=new MatchReplayRecorder();
    recorder.attach(sim,sim.options);
    for(let i=0;i<180;i++)sim.tick(SIMULATION_STEP);
    const captured=recorder.buildRecord();
    recorder.detach();
    const record=JSON.parse(JSON.stringify(captured));
    assert.notDeepEqual(sim.players[1].resources,initialRival);
    assert.deepEqual(record.commands,[]);

    const replay=new Simulation({...record.options,replay:true});
    const driver=new ReplayDriver(record);
    for(let i=0;i<=record.endTick;i++){
      driver.step(replay);
      if(!driver.finished)replay.tick(SIMULATION_STEP);
    }
    assert.equal(driver.finished,true);
    const {options:liveOptions,...liveState}=sim.serialize();
    const {options:replayOptions,...replayState}=replay.serialize();
    assert.deepEqual(replayState,liveState);
  });

  it('replays a resignation and stops at the original match result',()=>{
    const options={mode:'custom',map:'highlands',seed:512,slots:battlePreset('1v3')};
    const sim=new Simulation(options);
    const recorder=new MatchReplayRecorder();
    recorder.attach(sim,sim.options);
    for(let i=0;i<8;i++)sim.tick(SIMULATION_STEP);
    assert.equal(sim.resign(0),true);
    assert.equal(sim.ended?.won,false);
    const record=recorder.buildRecord(sim.ended);
    assert.deepEqual(record.commands,[{tick:8,op:'resign',a:[0]}]);

    const replay=new Simulation({...record.options,replay:true});
    const driver=new ReplayDriver(record);
    for(let i=0;i<=record.endTick;i++){
      driver.step(replay);
      if(!driver.finished)replay.tick(SIMULATION_STEP);
    }
    assert.equal(driver.finished,true);
    assert.equal(driver.failed,false);
    assert.equal(replay.time,sim.time);
    assert.deepEqual(replay.ended,sim.ended);
  });

  it('preserves orders targeting a remembered resource that has depleted out of sight',()=>{
    function depletedSite(){
      const sim=new Simulation({mode:'skirmish',seed:777});
      const worker=sim.owned(0,'unit','villager')[0];
      const site=sim.entities.find(entity=>entity.kind==='resource'&&entity.type==='wood');
      const remembered={...site};
      site.hp=0;
      assert.ok(!sim.get(site.id));
      return {sim,worker,remembered};
    }
    const {sim,worker,remembered}=depletedSite();
    const recorder=new MatchReplayRecorder();
    recorder.attach(sim,sim.options);
    sim.smartCommand([worker.id],remembered,remembered.x,remembered.z);
    const record=JSON.parse(JSON.stringify(recorder.buildRecord()));
    assert.equal(record.commands[0].a[1].id,remembered.id);

    const replay=depletedSite();
    const driver=new ReplayDriver(record);
    assert.equal(driver.step(replay.sim),1);
    assert.deepEqual(replay.worker.order,worker.order);
  });

  it('keeps same-tick commands in order and reads earlier replay files',()=>{
    const sim=new Simulation({mode:'skirmish',seed:777});
    const unit=sim.owned(0,'unit','villager')[0];
    const target=sim.entities.find(entity=>entity.kind==='resource'&&entity.type==='wood');
    const recorder=new MatchReplayRecorder();
    recorder.attach(sim,sim.options);
    sim.smartCommand([unit.id],target,target.x,target.z);
    sim.stop([unit.id]);
    const record=recorder.buildRecord();
    assert.equal(record.commands[0].a[1].__eid,target.id);
    assert.deepEqual(record.commands.map(({tick,op})=>[tick,op]),[[0,'smartCommand'],[0,'stop']]);

    const playback=new Simulation(record.options);
    const legacy={...record,version:undefined,endTick:undefined,commands:record.commands.map(({op,a})=>({t:0,op,a}))};
    const driver=new ReplayDriver(legacy);
    assert.equal(driver.step(playback),2);
    assert.equal(driver.finished,true);
    assert.deepEqual(playback.get(unit.id).order,unit.order);
    assert.match(saveManagerMarkup([],{replays:[legacy]}),/Legacy recording/);
  });
});
