import test from 'node:test';
import assert from 'node:assert/strict';
import {Simulation} from '../src/simulation.js';
import {ReplayDriver} from '../src/replay.js';
import {LocalMotion} from '../src/motion-smoothing.js';
import {takeFromResource,wasFelledOutOfSight} from '../src/resource-vision.js';
import {
  createWorkerSession,
  encodeWorkerDelta,
  applyWorkerDelta,
  handleWorkerMessage,
  serializeCommandArgs,
  hydrateCommandArgs,
} from '../src/sim-worker-protocol.js';
import {SimWorkerClient} from '../src/sim-worker-client.js';
import {MISSIONS,MODES} from '../src/data.js';
import {readLocalSave,writeSaveSlot} from '../src/local-save.js';
import {wallConnections,WALL_SPACING} from '../src/walls.js';

function createMockWorker({deferReplies=false}={}){
  let session=null;
  const listeners={message:[],error:[]};
  const inbox=[];
  let terminated=false;

  const deliverToClient=data=>{
    if(terminated)return;
    const cloned=structuredClone(data);
    for(const fn of [...listeners.message])fn({data:cloned});
  };
  const post=(message)=>{
    if(terminated)return;
    if(deferReplies)inbox.push(message);
    else queueMicrotask(()=>deliverToClient(message));
  };

  const worker={
    addEventListener(type,fn){(listeners[type]??=[]).push(fn);},
    postMessage(data){
      if(terminated)return;
      const cloned=structuredClone(data);
      const run=()=>{
        if(terminated)return;
        try{session=handleWorkerMessage(session,cloned,post);}
        catch(error){post({type:'error',message:error?.message||String(error)});}
      };
      if(deferReplies)inbox.push({__in:run});
      else queueMicrotask(run);
    },
    terminate(){terminated=true;},
    get session(){return session;},
    get terminated(){return terminated;},
    flush(){
      while(inbox.length&&!terminated){
        const item=inbox.shift();
        if(item&&item.__in)item.__in();
        else deliverToClient(item);
      }
    },
    emitError(){
      for(const fn of [...listeners.error])fn({preventDefault(){}});
    },
  };
  post({type:'ready'});
  return worker;
}

const flushMicrotasks=async(n=6)=>{for(let i=0;i<n;i++)await new Promise(r=>queueMicrotask(r));};

test('worker init matches main-thread Simulation identically across modes',()=>{
  const modes=[
    ...MODES.filter(({id})=>id!=='custom').map(({id})=>({mode:id,difficulty:'normal',seed:2026})),
    {mode:'custom',map:'highlands',mapSize:'medium',seed:512,populationLimit:80,slots:[
      {name:'P1',faction:'alder',team:1,difficulty:'hard',enabled:true,slotNumber:1,controller:'human'},
      {name:'P2',faction:'sun',team:2,difficulty:'hard',enabled:true,slotNumber:2,controller:'ai'},
    ]},
    ...MISSIONS.map(({id,seed})=>({mode:id,difficulty:'normal',seed})),
  ];
  for(const opts of modes){
    const mainSim=new Simulation(opts);
    const workerSession=createWorkerSession({options:mainSim.options});
    assert.equal(workerSession.sim.entities.length,mainSim.entities.length,`entity count matches for ${opts.mode}`);
    assert.equal(workerSession.sim.nextId,mainSim.nextId,`nextId matches for ${opts.mode}`);
    assert.equal(workerSession.sim.rng.state,mainSim.rng.state,`rng state matches for ${opts.mode}`);
    for(let i=0;i<mainSim.entities.length;i++){
      assert.equal(workerSession.sim.entities[i].id,mainSim.entities[i].id);
      assert.equal(workerSession.sim.entities[i].type,mainSim.entities[i].type);
      assert.equal(workerSession.sim.entities[i].x,mainSim.entities[i].x);
      assert.equal(workerSession.sim.entities[i].z,mainSim.entities[i].z);
    }
    const saved=structuredClone(workerSession.sim.serialize());
    const restored=createWorkerSession({save:saved}).sim;
    assert.equal(restored.options.mode,mainSim.options.mode);
    assert.equal(restored.mission?.id,mainSim.mission?.id);
    assert.deepEqual(restored.campaignState??null,mainSim.campaignState??null,opts.mode);
  }
});

test('compact worker delta preserves entities array identity, updates resources in place, and transfers fog only on change',()=>{
  const shadow=new Simulation({mode:'skirmish',faction:'alder',difficulty:'hard',map:'highlands',seed:777});
  const session=createWorkerSession({options:shadow.options});
  const originalArrayRef=shadow.entities;
  const firstWood=shadow.entities.find(e=>e.kind==='resource'&&e.type==='wood');
  assert.ok(firstWood);

  let fogPackets=0;
  for(let i=0;i<25;i++){
    session.sim.tick(0.1);
    const {packet,transfer}=encodeWorkerDelta(session,{steps:1,tickMs:1,stepReply:true});
    if(packet.visible){
      fogPackets++;
      assert.equal(transfer.length,2,'visible and explored ArrayBuffers are transferables');
      assert.equal(transfer[0],packet.visible.buffer);
      assert.equal(transfer[1],packet.explored.buffer);
    }else{
      assert.equal(transfer.length,0,'non-fog ticks transfer zero buffers');
    }
    applyWorkerDelta(shadow,structuredClone(packet));
  }

  // Fog updates every ~0.5s (every 5-6 ticks), so 25 ticks = ~4 fog packets, not 25.
  assert.ok(fogPackets>=3&&fogPackets<=6,`expected ~4 fog updates over 25 ticks, got ${fogPackets}`);
  assert.equal(shadow.entities,originalArrayRef,'shadow.entities array reference is preserved in-place');
  assert.equal(shadow.index.get(firstWood.id),firstWood,'static resource object identity is preserved');
  assert.ok(Math.abs(shadow.time-session.sim.time)<1e-9);
  assert.equal(shadow.revision,session.sim.revision);
  assert.equal(shadow.fogRevision,session.sim.fogRevision);
  assert.deepEqual(Array.from(shadow.visible),Array.from(session.sim.visible));
  assert.deepEqual(Array.from(shadow.explored),Array.from(session.sim.explored));
  assert.equal(
    shadow.owned(0,'unit').length,
    session.sim.owned(0,'unit').length,
    'player unit counts match'
  );
  assert.equal(
    shadow.owned(1,'unit').length,
    session.sim.owned(1,'unit').length,
    'enemy unit counts match'
  );
});

test('out-of-sight tree felling and resourceMemory sync accurately to shadow simulation',()=>{
  const shadow=new Simulation({mode:'skirmish',faction:'alder',difficulty:'normal',map:'highlands',seed:888});
  const session=createWorkerSession({options:shadow.options});
  // Pick a wood tree outside player 0 visibility, mark explored so resourceMemory tracks it.
  const hiddenTree=session.sim.entities.find(e=>e.kind==='resource'&&e.type==='wood'&&!session.sim.isVisible(e.x,e.z));
  assert.ok(hiddenTree);
  const cell=session.sim.cell(hiddenTree.x,hiddenTree.z);
  session.sim.explored[cell.z*session.sim.gridSize+cell.x]=1;
  session.sim.fogRevision++;

  const depleted=takeFromResource(session.sim,hiddenTree,hiddenTree.amount+10);
  assert.equal(depleted,true);
  assert.equal(wasFelledOutOfSight(hiddenTree),true);
  assert.ok(session.sim.resourceMemory?.has(hiddenTree.id));

  const {packet}=encodeWorkerDelta(session,{steps:1,stepReply:true});
  applyWorkerDelta(shadow,structuredClone(packet));

  const shadowTree=shadow.index.get(hiddenTree.id);
  assert.equal(shadowTree.hp,0);
  assert.equal(wasFelledOutOfSight(shadowTree),true,'shadow tree marked as felled out of sight');
  assert.ok(shadow.resourceMemory?.has(hiddenTree.id),'shadow resourceMemory remembers tree in fog');
  assert.ok(shadow.resourceMemory.get(hiddenTree.id).hp>0);
});

test('SimWorkerClient forwards commands, hydrates entity args, suppresses duplicate order events, and updates LocalMotion',async()=>{
  const shadow=new Simulation({mode:'skirmish',faction:'alder',difficulty:'normal',map:'highlands',seed:42});
  const mockWorker=createMockWorker();
  const localMotion=new LocalMotion();
  let captureCount=0,commitCount=0;
  const origCapture=localMotion.capture.bind(localMotion);
  const origCommit=localMotion.commit.bind(localMotion);
  localMotion.capture=s=>{captureCount++;return origCapture(s);};
  localMotion.commit=s=>{commitCount++;return origCommit(s);};

  const view={localMotion,pruneMissing(){}};
  const events=[];
  shadow.on(e=>events.push(e));
  const client=new SimWorkerClient({createWorker:()=>mockWorker});
  const attached=client.attach(shadow,{options:shadow.options,view,onEvent:e=>events.push(e)});
  assert.equal(attached,true);
  await flushMicrotasks();

  const tc=shadow.owned(0,'building','towncenter')[0];
  const villager=shadow.owned(0,'unit','villager')[0];
  const food=shadow.entities.find(e=>e.kind==='resource'&&e.type==='food'&&!e.water);
  assert.ok(tc&&villager&&food);

  // Queue villager training via bound proxy
  assert.equal(shadow.train(tc.id,'villager'),true);
  // Issue smartCommand with live entity object (must serialize to __eid and hydrate on worker!)
  assert.equal(shadow.smartCommand([villager.id],food,food.x,food.z,false,false),true);
  // Stance & formation
  assert.equal(shadow.setStance([villager.id],'defensive'),true);
  assert.equal(villager.stance,'defensive','stance updates optimistically');
  client.customAction('formation',['line']);

  await flushMicrotasks();

  // Command replies must NOT advance LocalMotion capture/commit
  assert.equal(captureCount,0);
  assert.equal(commitCount,0);

  // Worker authoritative simulation received commands
  const workerTc=mockWorker.session.sim.get(tc.id);
  const workerVillager=mockWorker.session.sim.get(villager.id);
  assert.equal(workerTc.queue.length,1,'worker queued villager');
  assert.equal(workerVillager.order?.type,'gather','worker hydrated food target entity');
  assert.equal(workerVillager.order?.target,food.id);
  assert.equal(workerVillager.stance,'defensive');
  assert.equal(mockWorker.session.sim.players[0].formation,'line');

  // Shadow sim reflected command reply
  assert.equal(shadow.get(tc.id).queue.length,1);
  assert.equal(shadow.players[0].formation,'line');

  // Only ONE order event fired (the immediate local one; worker did not duplicate it)
  assert.equal(events.filter(e=>e.type==='order').length,1);

  // Step 3 ticks -> LocalMotion capture & commit called once per step delta
  client.requestSteps(3,1);
  await flushMicrotasks();
  assert.equal(captureCount,1);
  assert.equal(commitCount,1);
  assert.ok(Math.abs(shadow.time-0.3)<1e-9);
  assert.equal(client.stats.ticks,3);

  client.dispose();
  assert.equal(mockWorker.terminated,true);
});

test('worker save includes queued commands and restores the authoritative state',async()=>{
  const shadow=new Simulation({mode:'skirmish',faction:'alder',difficulty:'hard',map:'highlands',seed:909});
  const mockWorker=createMockWorker({deferReplies:true});
  const client=new SimWorkerClient({createWorker:()=>mockWorker});
  client.attach(shadow,{options:shadow.options});
  mockWorker.flush();

  const tc=shadow.owned(0,'building','towncenter')[0];
  for(let i=0;i<25;i++){
    client.requestSteps(2,1);
    mockWorker.flush();
  }
  client.requestSteps(1,1);
  shadow.train(tc.id,'villager');
  const pendingSave=client.requestSave();
  assert.equal(shadow.get(tc.id).queue.length,0,'the shadow still has the previous queue');
  mockWorker.flush();
  const snapshot=await pendingSave;
  assert.deepEqual(snapshot,structuredClone(mockWorker.session.sim.serialize()));
  const data=new Map();
  const storage={getItem:key=>data.get(key)??null,setItem:(key,value)=>data.set(key,value)};
  assert.equal(writeSaveSlot('auto',shadow,{snapshot,storage}),'saved');
  const restored=Simulation.restore(readLocalSave(storage));
  assert.equal(restored.get(tc.id).queue.length,1);
  assert.ok(Math.abs(restored.time-mockWorker.session.sim.time)<1e-9);
  assert.equal(restored.rng.state,mockWorker.session.sim.rng.state);
  assert.equal(restored.nextId,mockWorker.session.sim.nextId);
  assert.equal(restored.owned(0,'unit').length,mockWorker.session.sim.owned(0,'unit').length);
  assert.equal(restored.owned(1,'building').length,mockWorker.session.sim.owned(1,'building').length);

  // Stepping the restored simulation runs cleanly with zero errors
  for(let i=0;i<20;i++)restored.tick(0.1);
  assert.ok(restored.time>shadow.time+1.5);
  client.dispose();
});

test('worker records authoritative replays that play back cleanly via ReplayDriver',async()=>{
  const opts={mode:'custom',map:'highlands',mapSize:'medium',seed:1234,populationLimit:80,slots:[
    {name:'P1',faction:'alder',team:1,difficulty:'normal',enabled:true,slotNumber:1,controller:'human'},
    {name:'P2',faction:'sun',team:2,difficulty:'normal',enabled:true,slotNumber:2,controller:'ai'},
  ]};
  const shadow=new Simulation(opts);
  const mockWorker=createMockWorker();
  let capturedRecord=null;
  const client=new SimWorkerClient({createWorker:()=>mockWorker});
  client.attach(shadow,{
    options:shadow.options,
    recordReplay:true,
    onReplayRecord:rec=>{capturedRecord=rec;},
  });
  await flushMicrotasks();

  const tc=shadow.owned(0,'building','towncenter')[0];
  shadow.train(tc.id,'villager');
  client.customAction('formation',['column']);
  client.requestSteps(5,1);
  await flushMicrotasks();

  shadow.resign(0);
  await flushMicrotasks();

  assert.ok(capturedRecord,'replay record emitted on match end');
  assert.ok(capturedRecord.commands.some(c=>c.op==='train'));
  assert.ok(capturedRecord.commands.some(c=>c.op==='formation'));
  assert.ok(capturedRecord.commands.some(c=>c.op==='resign'));

  // Play back the recorded match deterministically
  const playbackSim=new Simulation({...capturedRecord.options,replay:true});
  const driver=new ReplayDriver(capturedRecord,{
    formation:v=>{playbackSim.players[0].formation=v;},
  });
  let guard=0;
  while(!driver.finished&&!playbackSim.ended&&guard++<100){
    driver.step(playbackSim);
    if(!driver.finished&&!playbackSim.ended)playbackSim.tick(0.1);
  }
  assert.equal(driver.failed,false,'replay driver completed without command failures');
  assert.ok(playbackSim.ended,'replay ended via recorded resign');
  assert.equal(playbackSim.players[0].formation,'column');
  client.dispose();
});

test('SimWorkerClient enforces step backpressure cap and falls back cleanly on error or missing Worker',async()=>{
  // 1. Missing Worker fallback
  const shadow1=new Simulation({mode:'skirmish',seed:11});
  const noWorker=new SimWorkerClient({useWorker:false});
  assert.equal(noWorker.attach(shadow1,{options:shadow1.options}),false);
  assert.equal(noWorker.active,false);

  // 2. Backpressure cap while inFlight
  const shadow2=new Simulation({mode:'skirmish',seed:22});
  const deferred=createMockWorker({deferReplies:true});
  const client=new SimWorkerClient({createWorker:()=>deferred});
  assert.equal(client.attach(shadow2,{options:shadow2.options}),true);
  deferred.flush(); // ready + init

  client.requestSteps(1,1);
  assert.equal(client.inFlight,true);
  client.requestSteps(2,1);
  client.requestSteps(2,1);
  client.requestSteps(2,1);
  assert.equal(client.queuedSteps,3,'queued steps capped at 3 under backpressure');
  assert.ok(client.stats.droppedSteps>=3);

  deferred.flush(); // finishes first step and automatically dispatches queued 3 steps
  assert.equal(client.inFlight,false);
  assert.equal(client.queuedSteps,0);
  assert.equal(client.stats.ticks,4);

  // 3. Mid-match error restores original methods and triggers onFallback
  const saveWhileRunning=client.requestSave();
  const saveRejected=assert.rejects(saveWhileRunning,/before the save was ready/);
  let fallback;
  client.onFallback=(_sim,_reason,context)=>{fallback=context;};
  deferred.emitError();
  await saveRejected;
  assert.equal(fallback.canRecordReplay,false,'a resumed match cannot produce a complete recording');
  assert.equal(client.active,false);
  // Shadow sim can continue ticking synchronously!
  const before=shadow2.time;
  shadow2.tick(0.1);
  assert.ok(shadow2.time>before);
});

test('fastForward advances authoritative worker sim and syncs shadow cleanly',async()=>{
  const shadow=new Simulation({mode:'custom',map:'highlands',mapSize:'medium',seed:512,populationLimit:80,slots:[
    {name:'P1',faction:'alder',team:1,difficulty:'hard',enabled:true,slotNumber:1,controller:'human'},
    {name:'P2',faction:'sun',team:2,difficulty:'hard',enabled:true,slotNumber:2,controller:'ai'},
  ]});
  const mockWorker=createMockWorker();
  const client=new SimWorkerClient({createWorker:()=>mockWorker});
  client.attach(shadow,{options:shadow.options});
  await flushMicrotasks();

  const res=await client.fastForward(15,{aiPlayer0:true});
  assert.ok(res.time>=15);
  assert.ok(shadow.time>=15);
  assert.equal(shadow.players[0].controller,'ai');
  assert.ok(res.units>0&&res.buildings>0);
  client.dispose();
});

test('building delta omits unchanged structures and syncs damage, queues, and demolition cleanly',()=>{
  const shadow=new Simulation({mode:'skirmish',faction:'alder',difficulty:'normal',map:'highlands',seed:321});
  const session=createWorkerSession({options:shadow.options});
  const tc=session.sim.owned(0,'building','towncenter')[0];
  const house=session.sim.owned(0,'building','house')[0];
  assert.ok(tc&&house);

  // Tick 1: unchanged buildings should NOT be re-sent
  session.sim.tick(0.1);
  const d1=encodeWorkerDelta(session,{steps:1,stepReply:true});
  assert.equal(d1.packet.structureUpdates.length,0,'unchanged buildings omitted from delta');
  assert.equal(d1.packet.removedStructures.length,0);
  applyWorkerDelta(shadow,structuredClone(d1.packet));

  // Queue a villager on TC and demolish house -> ONLY those 2 structures travel in delta
  session.sim.train(tc.id,'villager');
  session.sim.demolish(house.id,0);
  const d2=encodeWorkerDelta(session,{steps:0,commandReply:true});
  assert.equal(d2.packet.structureUpdates.length,1);
  assert.equal(d2.packet.structureUpdates[0].id,tc.id);
  assert.deepEqual(d2.packet.removedStructures,[house.id]);
  applyWorkerDelta(shadow,structuredClone(d2.packet));

  assert.equal(shadow.get(tc.id).queue.length,1);
  assert.equal(shadow.get(house.id),null,'demolished building removed from shadow');
});

test('serializeCommandArgs / hydrateCommandArgs handles nested arrays and missing entities safely',()=>{
  const sim=new Simulation({mode:'skirmish',seed:55});
  const unit=sim.owned(0,'unit')[0];
  const serialized=serializeCommandArgs([[unit.id],unit,10,20,false]);
  assert.deepEqual(serialized,[[unit.id],{__eid:unit.id},10,20,false]);
  const hydrated=hydrateCommandArgs(sim,serialized);
  assert.equal(hydrated[1],unit);
  assert.equal(hydrateCommandArgs(sim,[{__eid:999999}])[0],null);
});

test('the worker preserves a gather command on a tree remembered under fog',()=>{
  const session=createWorkerSession({options:{mode:'skirmish',seed:777}});
  const {sim}=session;
  const tree=sim.entities.find(entity=>entity.kind==='resource'&&entity.type==='wood');
  const remembered={...tree};
  const worker=sim.owned(0,'unit','villager')[0];
  tree.hp=0;
  assert.equal(sim.get(tree.id),null);
  const args=serializeCommandArgs([[worker.id],remembered,tree.x,tree.z],sim);
  handleWorkerMessage(session,{type:'cmd',method:'smartCommand',args},()=>{});
  assert.equal(worker.order.type,'gather');
  assert.equal(worker.order.target,tree.id);
});

test('wall link updates and gate conversion preserve neighboring connections',async()=>{
  const shadow=new Simulation({mode:'sandbox',map:'highlands',seed:909});
  shadow.entities.length=0;
  shadow.index=new Map();
  shadow.grids={};
  shadow.addBuilding('towncenter',0,-12,0,true);
  shadow.updateFog();
  const mockWorker=createMockWorker({deferReplies:true});
  const client=new SimWorkerClient({createWorker:()=>mockWorker});
  const converted=[];
  client.attach(shadow,{save:structuredClone(shadow.serialize()),onDelta:info=>{
    if(info.gateConversion)converted.push(info.gateConversion);
  }});
  mockWorker.flush();
  const authoritative=mockWorker.session.sim;
  const walls=[];
  for(let i=-2;i<=2;i++){
    walls.push(authoritative.addBuilding('wall',0,i*WALL_SPACING,0,true,{angle:0}));
    client.requestSteps(1);
    mockWorker.flush();
  }
  assert.equal(wallConnections(shadow.entities).length,4);
  assert.equal(wallConnections(Simulation.restore(structuredClone(shadow.serialize())).entities).length,4);
  client.requestSteps(1);
  assert.equal(shadow.convertWallToGate(walls[2].id),true);
  mockWorker.flush();
  const gate=shadow.owned(0,'building','gate')[0];
  assert.ok(gate);
  assert.deepEqual(converted,[{wallId:walls[2].id,gateId:gate.id}]);
  assert.equal(wallConnections(shadow.entities).length,2);
  for(const wall of [walls[0],walls[4]])assert.deepEqual(shadow.get(wall.id).wallLinks,[gate.id]);
  client.dispose();
});

test('worker villager training auto-assigns deterministically on spawn tick and replays identically without drift',()=>{
  const posted=[];
  const post=msg=>posted.push(msg);
  const opts={mode:'skirmish',faction:'alder',difficulty:'normal',map:'highlands',seed:2026};
  let session=handleWorkerMessage(null,{type:'init',matchId:1,options:opts,recordReplay:true},post);
  const tc=session.sim.owned(0,'building','towncenter')[0];
  session=handleWorkerMessage(session,{type:'cmd',matchId:1,method:'train',args:[tc.id,'villager'],reply:true},post);

  let trainedId=null;
  for(let i=0;i<80&&!trainedId;i++){
    session=handleWorkerMessage(session,{type:'step',matchId:1,steps:5},post);
    const trained=posted.at(-1)?.events?.find(e=>e.type==='trained'&&e.entity?.owner===0&&e.entity?.type==='villager');
    if(trained)trainedId=trained.entity.id;
  }
  assert.ok(trainedId,'player villager finished training inside worker');
  const liveVillagerAtSpawn=session.sim.get(trainedId);
  assert.equal(liveVillagerAtSpawn.order?.type,'gather','newly trained player villager auto-assigns immediately inside tickBuilding');

  // Step 10 more seconds (100 ticks at 0.1s) so economy and movement unfold
  for(let j=0;j<20;j++){
    session=handleWorkerMessage(session,{type:'step',matchId:1,steps:5},post);
  }
  const liveVillager=session.sim.get(trainedId);
  const rec=JSON.parse(JSON.stringify(session.recorder.buildRecord({won:true})));

  // Play back on main thread via ReplayDriver (no worker) and assert bit-for-bit parity
  const replaySim=new Simulation({...rec.options,replay:true});
  const driver=new ReplayDriver(rec,{});
  while(!driver.finished&&!replaySim.ended){
    driver.step(replaySim);
    if(driver.finished)break;
    replaySim.tick(0.1);
  }
  const repVillager=replaySim.get(trainedId);
  assert.ok(repVillager,'replayed villager exists with identical entity id');
  assert.equal(repVillager.x,liveVillager.x);
  assert.equal(repVillager.z,liveVillager.z);
  assert.equal(repVillager.carry,liveVillager.carry);
  assert.deepEqual(repVillager.order,liveVillager.order);
  assert.deepEqual(replaySim.players[0].resources,session.sim.players[0].resources);
  assert.equal(replaySim.rng.state,session.sim.rng.state);

  // Explicit Town Center rally point must still take precedence over auto-assign
  const rallySim=new Simulation(opts);
  const rallyTc=rallySim.owned(0,'building','towncenter')[0];
  rallyTc.rally={x:rallyTc.x+10,z:rallyTc.z+10};
  const beforeIds=new Set(rallySim.owned(0,'unit','villager').map(u=>u.id));
  rallySim.train(rallyTc.id,'villager');
  let rallied=null;
  for(let i=0;i<260&&!rallied;i++){
    rallySim.tick(0.1);
    rallied=rallySim.owned(0,'unit','villager').find(u=>!beforeIds.has(u.id))||null;
  }
  assert.ok(rallied,'rallied villager spawned');
  assert.equal(rallied.order?.type,'move','TC rally order is preserved instead of overwritten by auto-assign');
});
