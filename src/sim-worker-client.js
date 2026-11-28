import {SIMULATION_STEP} from './simulation-pacing.js';
import {wallBuildCost} from './fortified-walls.js';
import {gateConversionPlan} from './gate-conversion.js';
import {GARRISONS,garrisonCount} from './garrison.js';
import {WORKER_COMMANDS,serializeCommandArgs,applyWorkerDelta} from './sim-worker-protocol.js';

const MAX_QUEUED_STEPS=3;
const SAVE_TIMEOUT_MS=10000;

function nowMs(){
  return typeof performance!=='undefined'&&typeof performance.now==='function'?performance.now():Date.now();
}

function canShelterAny(sim,ids,siteId=null,owner=0){
  const villagers=(Array.isArray(ids)?ids:[]).map(id=>sim.get(id)).filter(u=>u&&u.owner===owner&&u.type==='villager'&&!u.embarked);
  if(!villagers.length)return false;
  if(siteId!=null){
    const site=sim.get(siteId);
    return Boolean(site&&site.owner===owner&&site.progress>=1&&GARRISONS[site.type]&&garrisonCount(sim,site)<GARRISONS[site.type].capacity);
  }
  return sim.owned(owner,'building').some(b=>b.progress>=1&&GARRISONS[b.type]&&garrisonCount(sim,b)<GARRISONS[b.type].capacity);
}

export class SimWorkerClient {
  constructor({useWorker=true,createWorker=null}={}){
    this.useWorker=useWorker;
    this.createWorker=createWorker;
    this.worker=null;
    this.workerUnavailable=false;
    this.ready=false;
    this.disposed=false;
    this.queue=[];

    this.active=false;
    this.matchId=0;
    this.sim=null;
    this.originals=null;
    this.view=null;
    this.onEvent=null;
    this.onDelta=null;
    this.onReplayRecord=null;
    this.onFallback=null;
    this.paletteColors=null;

    this.inFlight=false;
    this.queuedSteps=0;
    this.queuedSpeed=1;
    this.lastSnapshotAt=0;
    this.lastStepSpanMs=SIMULATION_STEP*1000;
    this.fastForwardWaiters=new Map();
    this.nextFastForwardId=1;
    this.saveWaiters=new Map();
    this.nextSaveRequestId=1;

    this.resetStats();
  }

  resetStats(){
    this.stats={
      workerActive:false,
      ticks:0,
      deltas:0,
      lastTickMs:0,
      maxTickMs:0,
      totalTickMs:0,
      lastApplyMs:0,
      maxApplyMs:0,
      totalApplyMs:0,
      droppedSteps:0,
    };
  }

  _ensureWorker(){
    if(this.worker)return true;
    if(this.disposed||!this.useWorker||this.workerUnavailable)return false;
    if(!this.createWorker&&typeof Worker!=='function'){
      this.workerUnavailable=true;
      return false;
    }
    try{
      const worker=this.createWorker
        ?this.createWorker()
        :new Worker(new URL('./sim-worker.js',import.meta.url),{type:'module',name:'crowns-simulation'});
      this.worker=worker;
      this.ready=false;
      worker.addEventListener('message',event=>{
        if(this.worker!==worker)return;
        this._handleMessage(event.data);
      });
      worker.addEventListener('error',event=>{
        event?.preventDefault?.();
        if(this.worker!==worker)return;
        this._handleWorkerFailure('Simulation worker stopped unexpectedly.');
      });
      return true;
    }catch{
      this.workerUnavailable=true;
      return false;
    }
  }

  _handleWorkerFailure(reason){
    const hadReady=this.ready;
    const canRecordReplay=!hadReady&&!this.queue.some(message=>['cmd','custom','fastForward'].includes(message.type));
    try{this.worker?.terminate?.();}catch{}
    this.worker=null;
    this.ready=false;
    this.queue.length=0;
    if(!hadReady)this.workerUnavailable=true;
    for(const {reject} of this.fastForwardWaiters.values())reject(new Error(reason));
    this.fastForwardWaiters.clear();
    if(this.active){
      const sim=this.sim,cb=this.onFallback;
      this.detach({notifyWorker:false});
      cb?.(sim,reason,{canRecordReplay});
    }
  }

  _post(message){
    if(this.disposed||!this.worker)return;
    if(!this.ready){this.queue.push(message);return;}
    this.worker.postMessage(message);
  }

  _flushQueue(){
    if(!this.ready||!this.worker)return;
    const pending=this.queue;
    this.queue=[];
    for(const message of pending)this.worker.postMessage(message);
  }

  attach(sim,{options=null,save=null,recordReplay=false,view=null,onEvent=null,onDelta=null,onReplayRecord=null,onFallback=null}={}){
    this.detach();
    if(!sim||sim.options?.multiplayer||sim.options?.replay)return false;
    if(!this._ensureWorker())return false;

    this.matchId++;
    this.sim=sim;
    this.view=view;
    this.onEvent=onEvent;
    this.onDelta=onDelta;
    this.onReplayRecord=onReplayRecord;
    this.onFallback=onFallback;
    this.paletteColors=sim.players?.map(p=>p?.color)||null;
    this.inFlight=false;
    this.queuedSteps=0;
    this.queuedSpeed=1;
    this.lastSnapshotAt=nowMs();
    this.lastStepSpanMs=SIMULATION_STEP*1000;
    this.active=true;
    this.resetStats();
    this.stats.workerActive=true;

    this._bindShadowCommands(sim);
    this._post({
      type:'init',
      matchId:this.matchId,
      options:save?null:(options||sim.options),
      save:save||null,
      recordReplay:Boolean(recordReplay&&!save),
      paletteColors:this.paletteColors,
    });
    return true;
  }

  detach({notifyWorker=true}={}){
    if(this.sim&&this.originals){
      for(const [method,fn] of this.originals)this.sim[method]=fn;
    }
    this.originals=null;
    this.sim=null;
    this.view=null;
    this.onEvent=null;
    this.onDelta=null;
    this.onReplayRecord=null;
    this.onFallback=null;
    this.active=false;
    this.inFlight=false;
    this.queuedSteps=0;
    this.stats.workerActive=false;
    for(const {reject} of this.fastForwardWaiters.values())reject(new Error('Match ended during fast-forward.'));
    this.fastForwardWaiters.clear();
    for(const {timer,reject} of this.saveWaiters.values()){
      clearTimeout(timer);
      reject(new Error('The match ended before the save was ready.'));
    }
    this.saveWaiters.clear();
    if(notifyWorker&&this.worker)this._post({type:'stop'});
  }

  dispose(){
    this.detach({notifyWorker:true});
    this.disposed=true;
    this.queue.length=0;
    try{this.worker?.terminate?.();}catch{}
    this.worker=null;
    this.ready=false;
  }

  setPalette(colors){
    this.paletteColors=Array.isArray(colors)?[...colors]:null;
    if(this.active&&this.paletteColors){
      this._post({type:'palette',matchId:this.matchId,colors:this.paletteColors});
    }
  }

  clearQueuedSteps(){
    this.queuedSteps=0;
  }

  requestSave(){
    if(!this.active)return Promise.reject(new Error('No active simulation worker.'));
    const requestId=this.nextSaveRequestId++;
    return new Promise((resolve,reject)=>{
      const timer=setTimeout(()=>{
        this.saveWaiters.delete(requestId);
        reject(new Error('The simulation worker did not finish saving in time.'));
      },SAVE_TIMEOUT_MS);
      this.saveWaiters.set(requestId,{timer,resolve,reject});
      try{this._post({type:'save',matchId:this.matchId,requestId});}
      catch(error){
        clearTimeout(timer);
        this.saveWaiters.delete(requestId);
        reject(error);
      }
    });
  }

  requestSteps(steps,speed=1){
    if(!this.active||!this.sim||this.sim.ended)return false;
    const count=Math.max(0,Math.floor(Number(steps)||0));
    if(count<=0)return false;
    this.queuedSpeed=Number.isFinite(speed)&&speed>0?speed:1;
    if(this.inFlight){
      const next=this.queuedSteps+count;
      if(next>MAX_QUEUED_STEPS)this.stats.droppedSteps+=next-MAX_QUEUED_STEPS;
      this.queuedSteps=Math.min(MAX_QUEUED_STEPS,next);
      return true;
    }
    this._dispatchStep(Math.min(MAX_QUEUED_STEPS,count));
    return true;
  }

  _dispatchStep(count){
    this.inFlight=true;
    this._post({type:'step',matchId:this.matchId,steps:count});
  }

  customAction(op,args=[],{reply=true}={}){
    if(!this.active||!this.sim||this.sim.ended)return false;
    this._post({type:'custom',matchId:this.matchId,op,args,reply});
    return true;
  }

  fastForward(targetTime,{aiPlayer0=false}={}){
    if(!this.active||!this.sim)return Promise.resolve(null);
    const id=this.nextFastForwardId++;
    this.queuedSteps=0;
    return new Promise((resolve,reject)=>{
      this.fastForwardWaiters.set(id,{resolve,reject});
      this._post({type:'fastForward',matchId:this.matchId,fastForwardId:id,targetTime,aiPlayer0});
    });
  }

  _bindShadowCommands(sim){
    const originals=new Map();
    const send=(method,args)=>{
        // A step already sent to the worker cannot acknowledge a later command.
        this._post({type:'cmd',matchId:this.matchId,method,args:serializeCommandArgs(args,sim),reply:true});
    };

    for(const method of WORKER_COMMANDS){
      if(typeof sim[method]!=='function')continue;
      const orig=sim[method];
      originals.set(method,orig);

      sim[method]=(...args)=>{
        if(!this.active||this.sim!==sim)return orig.apply(sim,args);

        if(method==='build'){
          const [type,x,z,,owner=0]=args;
          const valid=sim.buildValid(type,x,z,owner);
          const cost=sim.cost(wallBuildCost(sim,owner,type),owner,'building');
          const affordable=sim.canAfford(cost,owner);
          send(method,args);
          return valid&&affordable?{x,z}:false;
        }
        if(method==='buildWallDraft'||method==='buildWallLine'){
          send(method,args);
          return true;
        }
        if(method==='convertWallToGate'){
          const [id,owner=0]=args;
          const plan=gateConversionPlan(sim,id,owner);
          send(method,args);
          return Boolean(plan&&sim.canAfford(plan.cost,owner));
        }
        if(method==='smartCommand'){
          send(method,args);
          sim.emit('order',{order:{}});
          return true;
        }
        if(method==='patrol'){
          const [ids,,, ,owner=0]=args;
          const hasMilitary=(Array.isArray(ids)?ids:[]).some(id=>{
            const u=sim.get(id);
            return u&&u.kind==='unit'&&u.owner===owner&&!u.embarked&&!['villager','fishingboat','cart'].includes(u.type);
          });
          send(method,args);
          if(hasMilitary)sim.emit('order',{order:{type:'patrol'}});
          return hasMilitary;
        }
        if(method==='guard'){
          const [ids,targetId,,owner=0]=args;
          const target=sim.get(targetId);
          const hasMilitary=(Array.isArray(ids)?ids:[]).some(id=>{
            const u=sim.get(id);
            return u&&u.kind==='unit'&&u.owner===owner&&!u.embarked&&!['villager','fishingboat','cart'].includes(u.type);
          });
          const valid=Boolean(hasMilitary&&target&&sim.allied(owner,target.owner));
          send(method,args);
          if(valid)sim.emit('order',{order:{type:'guard'}});
          return valid;
        }
        if(method==='setStance'){
          const [ids,stance,owner=0]=args;
          const allowed=['hold','defensive','aggressive'].includes(stance)?stance:'aggressive';
          let changed=false;
          for(const id of Array.isArray(ids)?ids:[]){
            const u=sim.get(id);
            if(u&&u.kind==='unit'&&u.owner===owner){u.stance=allowed;changed=true;}
          }
          send(method,args);
          return changed;
        }
        if(method==='toggleHeroAutoCast'){
          const [heroId,owner=0]=args;
          const h=sim.get(heroId);
          if(!h||h.hp<=0||h.owner!==owner)return null;
          h.autoCast=h.autoCast===false;
          send(method,args);
          return h.autoCast;
        }
        if(method==='castHeroSkill'){
          const [heroId,slot,owner=0]=args;
          const h=sim.get(heroId);
          if(!h||h.hp<=0||h.owner!==owner||(h.skillCooldowns?.[Number(slot)||0]||0)>0)return false;
          send(method,args);
          return true;
        }
        if(method==='unload'){
          const [shipId,, ,owner=0]=args;
          const ship=sim.get(shipId);
          const ok=Boolean(ship&&ship.owner===owner&&ship.passengers?.length);
          send(method,args);
          return ok;
        }
        if(method==='seekShelter'){
          const [ids,siteId=null,owner=0]=args;
          const ok=canShelterAny(sim,ids,siteId,owner);
          send(method,args);
          return ok;
        }
        if(method==='townBell'){
          const [siteId,owner=0]=args;
          const site=sim.get(siteId);
          const ok=Boolean(site&&site.owner===owner&&site.progress>=1&&GARRISONS[site.type]);
          send(method,args);
          return ok;
        }
        if(method==='donateResources'){
          const [from,to,type,amount]=args;
          const sender=sim.players?.[from],recipient=sim.players?.[to];
          const ok=Boolean(sender&&recipient&&!sender.defeated&&!recipient.defeated&&sim.allied(from,to)&&Number.isSafeInteger(amount)&&amount>=1&&(sender.resources?.[type]||0)>=amount);
          send(method,args);
          if(ok){sender.resources[type]-=amount;recipient.resources[type]+=amount;}
          return ok;
        }

        send(method,args);
        return true;
      };
    }

    this.originals=originals;
  }

  _handleMessage(data){
    if(!data||typeof data!=='object')return;
    if(data.type==='ready'){
      this.ready=true;
      this._flushQueue();
      return;
    }
    if(data.type==='error'){
      this._handleWorkerFailure(data.message||'Simulation worker error.');
      return;
    }
    if(data.type==='inited')return;
    if(!this.active||!this.sim||data.matchId!==this.matchId)return;
    if(data.type==='save'){
      const pending=this.saveWaiters.get(data.requestId);
      if(pending){
        clearTimeout(pending.timer);
        this.saveWaiters.delete(data.requestId);
        pending.resolve(data.snapshot);
      }
      return;
    }
    if(data.type!=='delta')return;

    const isStepReply=Boolean(data.stepReply);
    if(isStepReply)this.inFlight=false;

    if(data.replayRecord)this.onReplayRecord?.(data.replayRecord);

    const applyStart=nowMs();
    const info=applyWorkerDelta(this.sim,data,{
      view:this.view,
      onEvent:this.onEvent,
      paletteColors:this.paletteColors,
    });
    const applyMs=nowMs()-applyStart;

    this.stats.deltas++;
    this.stats.lastApplyMs=applyMs;
    this.stats.totalApplyMs+=applyMs;
    if(applyMs>this.stats.maxApplyMs)this.stats.maxApplyMs=applyMs;

    if(isStepReply){
      this.stats.ticks+=data.steps;
      this.stats.lastTickMs=data.tickMs;
      this.stats.totalTickMs+=data.tickMs;
      if(data.tickMs>this.stats.maxTickMs)this.stats.maxTickMs=data.tickMs;
      this.lastSnapshotAt=nowMs();
      this.lastStepSpanMs=(data.steps*SIMULATION_STEP*1000)/Math.max(.25,this.queuedSpeed||1);
    }

    if(data.fastForwardId!==undefined){
      const waiter=this.fastForwardWaiters.get(data.fastForwardId);
      if(waiter){
        this.fastForwardWaiters.delete(data.fastForwardId);
        this.lastSnapshotAt=nowMs();
        waiter.resolve({
          time:this.sim.time,
          steps:data.steps,
          ms:data.tickMs,
          units:this.sim.entities.filter(e=>e.kind==='unit').length,
          buildings:this.sim.entities.filter(e=>e.kind==='building').length,
        });
      }
    }

    this.onDelta?.({...info,steps:data.steps,commandReply:Boolean(data.commandReply),fastForward:data.fastForwardId!==undefined,gateConversion:data.gateConversion});

    if(isStepReply&&this.active&&this.sim&&!this.sim.ended&&this.queuedSteps>0){
      const next=this.queuedSteps;
      this.queuedSteps=0;
      this._dispatchStep(next);
    }
  }
}
