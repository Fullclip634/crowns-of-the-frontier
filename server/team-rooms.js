import {WebSocketServer} from 'ws';
import {randomBytes} from 'node:crypto';
import {Simulation} from '../src/simulation.js';
import {FACTIONS,MAPS} from '../src/data.js';
import {normalizeBattle,visibilityFor} from '../src/custom-battle.js';
import {originAllowed} from './origins.js';
import {BattleChat} from './battle-chat.js';
import {entityPerspective} from './entity-perspective.js';
import {projectileVisualEvents} from '../src/projectile-combat.js';
import {combatPerspective} from './combat-perspective.js';
import {createVisibilityDelta} from '../src/network-visibility.js';

const code=()=>randomBytes(4).toString('hex').slice(0,6).toUpperCase();
const emptyStats=()=>({gathered:0,kills:0,lost:0,built:0,trained:0});
const snapshotCommit=Symbol('snapshotCommit');
export function attachRooms(server,{allowedOrigins=(process.env.ALLOWED_ORIGINS||'').split(',').map(value=>value.trim()).filter(Boolean),maxRooms=Math.max(1,Math.min(8,Number(process.env.MAX_ROOMS)||8)),heartbeatInterval=20000}={}){
  const wss=new WebSocketServer({noServer:true,maxPayload:24000,perMessageDeflate:{threshold:1024,serverNoContextTakeover:true,zlibDeflateOptions:{level:1}}}),rooms=new Map();
  server.on('upgrade',(req,socket,head)=>{if(req.url!=='/socket'||!originAllowed(req.headers.origin,req.headers.host,allowedOrigins)){socket.destroy();return;}wss.handleUpgrade(req,socket,head,ws=>wss.emit('connection',ws,req));});
  const canSend=(ws,type)=>{if(ws?.readyState!==1)return false;if(ws.bufferedAmount>=4000000){ws.terminate();return false;}return type!=='state'||ws.bufferedAmount<1000000;};
  const send=(ws,message)=>{if(!canSend(ws,message.type))return false;ws.send(JSON.stringify(message));return true;};
  const commitSnapshot=(room,side,state)=>{const commit=state?.[snapshotCommit];if(!commit)return;if(commit.visibility)room.visibility[side]=commit.visibility;for(const [id,value]of commit.resources)room.resources[side].set(id,value);};
  const custom=room=>room.options.mode==='custom';
  const observing=(room,side)=>custom(room)&&room.sim.players.filter(p=>p.team===room.sim.players[side].team).every(p=>p.defeated);
  const humanSlots=room=>custom(room)?room.options.slots.map((slot,i)=>slot.controller==='human'?i:-1).filter(i=>i>=0):[0,1];
  const connected=player=>player.ws?.readyState===1;
  const releaseVacantRoom=room=>{if(rooms.get(room.code)!==room||!room.players.length||room.players.some(player=>connected(player)||!player.conceded))return false;rooms.delete(room.code);return true;};
  const requiredPlayers=room=>room.players.filter(player=>!player.conceded&&!room.sim?.players[player.side]?.defeated);
  const waiting=room=>requiredPlayers(room).some(player=>!connected(player));
  const canStart=room=>humanSlots(room).every(side=>room.players.some(player=>player.side===side&&connected(player)&&player.ready));
  function restoreLobbySlot(room,side){
    const saved=room.slotDefaults?.[side],slot=room.options.slots?.[side];if(!room.sim&&saved&&slot){slot.name=saved.name;slot.faction=saved.faction;}
  }
  function lobby(room){
    const slots=custom(room)?room.options.slots.map((slot,side)=>({...slot,side,participant:room.players.find(p=>p.side===side)?.name||null,ready:room.players.find(p=>p.side===side)?.ready||false})):[];
    for(const player of room.players)send(player.ws,{type:'lobby',code:room.code,host:player.host,selfSide:player.side,selfReady:player.ready,canStart:canStart(room),slots,players:room.players.map(p=>({side:p.side,name:p.name,faction:p.faction,ready:p.ready,connected:connected(p)})),options:room.options});
  }
  function closeLobby(room,message,leaving=null){
    if(rooms.get(room.code)!==room)return;rooms.delete(room.code);
    for(const player of room.players)if(player!==leaving){send(player.ws,{type:'closed',message});player.ws?.close(1000,'Room closed');}
  }
  const orderFor=(room,side)=>[side,...room.sim.players.map((_,i)=>i).filter(i=>i!==side)];
  function frameVisibility(room,side,observer,cache){
    const key=observer?'observer':custom(room)&&room.sim.options.shareVision?`team:${room.sim.players[side].team}`:`side:${side}`,explored=room.explored[side];
    let visible=cache.get(key);
    if(!visible){visible=visibilityFor(room.sim,side,explored,observer);cache.set(key,visible);}
    else if(observer)explored.fill(1);
    else for(let cell=0;cell<visible.length;cell++)if(visible[cell])explored[cell]=1;
    return visible;
  }
  function rememberBuilding(room,side,entity,object=null,cache=null){
    const known=room.known[side];
    // Detached observations are read-only and can be shared within this frame.
    // Each commander's map retains its own older observation when vision ends.
    if(entity.hp>0){let memory=cache?.get(entity.id);if(!memory){memory=JSON.parse(JSON.stringify(object||entityPerspective(room.sim,side,entity)));cache?.set(entity.id,memory);}known.set(entity.id,memory);}
    else known.delete(entity.id);
  }
  function observeHeldState(room,side,visible,observer,memoryCache){
    const sim=room.sim,known=room.known[side],alive=new Set(),shown=e=>{const cell=sim.cell(e.x,e.z);return !!visible[cell.z*sim.gridSize+cell.x];};
    for(const entity of sim.entities){
      if(entity.kind!=='building')continue;
      if(entity.hp>0)alive.add(entity.id);
      if(entity.owner!==side&&(observer||shown(entity)))rememberBuilding(room,side,entity,null,memoryCache);
    }
    // Seeing empty ground must also clear an older remembered building.
    for(const [id,entity]of known)if(shown(entity)&&!alive.has(id))known.delete(id);
  }
  function perspective(room,side,compact=false,deltaVisibility=false,forceVisibility=false,frameVisible=null,memoryCache=null){
    const sim=room.sim,order=orderFor(room,side),mapOwner=owner=>owner<0?owner:order.indexOf(owner),observer=observing(room,side);
    const explored=room.explored[side],visible=frameVisible||visibilityFor(sim,side,explored,observer),shown=e=>{const cell=sim.cell(e.x,e.z);return !!visible[cell.z*sim.gridSize+cell.x];};
    const data=compact?{time:sim.time,wave:sim.wave,nextWave:sim.nextWave,hold:sim.hold,enemyHold:sim.enemyHold,wonderTime:sim.wonderTime}:sim.serialize({omitProjectiles:true}),known=room.known[side],entities=[];
    data.projectiles=[];data.nextProjectileId=0;
    data.visualProjectiles=projectileVisualEvents(sim.projectiles,sim.time).map(event=>combatPerspective(sim,side,event,{observer})).filter(Boolean).map(event=>({...event,entity:{...event.entity,owner:mapOwner(event.entity.owner)},target:{...event.target,owner:mapOwner(event.target.owner)}}));
    for(const e of sim.entities){
      if(e.kind==='resource'){if(!compact)entities.push({...e});continue;}
      if(e.embarked&&e.owner!==side&&!observer)continue;
      if(e.owner===side||e.kind==='shrine'||shown(e)||observer){
        const object=entityPerspective(sim,side,e);
        if(e.kind==='building'&&e.owner!==side)rememberBuilding(room,side,e,object,memoryCache);
        object.owner=mapOwner(object.owner);
        entities.push(object);
      }
    }
    const shownIds=new Set(entities.map(entity=>entity.id));
    for(const [id,e]of known){if(shown(e)){if(!sim.get(id))known.delete(id);continue;}if(!shownIds.has(id))entities.push({...e,owner:mapOwner(e.owner)});}
    data.entities=entities;
    data.players=order.map(owner=>{const p=sim.players[owner];return owner===side?{...p}:{...p,resources:custom(room)&&sim.allied(side,owner)?{...p.resources}:{food:0,wood:0,gold:0,stone:0},tech:Object.fromEntries(Object.keys(p.tech).map(key=>[key,0])),battleStats:sim.ended?p.battleStats:emptyStats()};});
    data.aiStates=null;data.commanderAI=null;data.teamAlarms={};data.intel={};data.stats=custom(room)?sim.players[side].battleStats:room.stats[side];data.revealedOwners=(sim.revealedOwners||[]).map(mapOwner);
    data.ended=sim.ended?{...sim.ended,won:custom(room)?sim.ended.winningTeam===sim.players[side].team:side?!sim.ended.won:sim.ended.won}:null;
    if(!custom(room)&&side){[data.hold,data.enemyHold]=[data.enemyHold,data.hold];data.wonderTime=[...data.wonderTime].reverse();}
    if(data.ended)data.ended.reason=custom(room)?(data.ended.won?'Your alliance controls the battlefield.':'Another alliance won the battle.'):`${data.ended.won?'Your kingdom won':'Your rival won'} the ${{skirmish:'conquest',tides:'naval conquest',regicide:'regicide',dominion:'dominion',wonder:'wonder race'}[room.options.mode]} match.`;
    const resourceChanges=[];
    if(compact){data.compactResources=true;data.resourceUpdates=[];const cache=room.resources[side];for(const e of sim.entities){if(e.kind!=='resource'||!observer&&!shown(e))continue;const amount=Math.ceil(e.amount),value=`${amount}:${e.hp}`;if(forceVisibility||cache.get(e.id)!==value){resourceChanges.push([e.id,value]);data.resourceUpdates.push({id:e.id,amount,hp:e.hp});}}}
    const previous=compact&&deltaVisibility&&!forceVisibility?room.visibility[side]:null,sequence=previous?previous.sequence+1:0;
    const delta=previous?createVisibilityDelta(previous.visible,previous.explored,visible,explored,sequence):null;
    // Large reveals (for example observer mode) can be cheaper as full grids.
    if(delta&&JSON.stringify(delta).length<visible.length*4+32)data.visibilityDelta=delta;
    else{data.visible=Array.from(visible);data.explored=Array.from(explored);if(deltaVisibility)data.visibilitySequence=sequence;}
    const state=compact?{}:data;
    if(compact)for(const key of ['entities','players','time','wave','nextWave','hold','enemyHold','wonderTime','stats','ended','revealedOwners','visualProjectiles','projectiles','nextProjectileId','visible','explored','visibilitySequence','visibilityDelta','compactResources','resourceUpdates','aiStates','commanderAI','teamAlarms','intel'])if(key in data)state[key]=data[key];
    // send() serializes synchronously before the simulation can advance.
    // Only fog memory and committed baselines outlive this outgoing object.
    Object.defineProperty(state,snapshotCommit,{value:{visibility:deltaVisibility?{visible:visible.slice(),explored:explored.slice(),sequence}:null,resources:resourceChanges}});
    return state;
  }
  function start(room){
    room.chat=new BattleChat();
    room.sim=new Simulation({...room.options,multiplayer:true,faction:room.players[0].faction});
    if(!custom(room)){
      room.sim.players[1].faction=room.players[1].faction;
      for(const type of ['towncenter','house','mill','barracks','dock']){const a=room.sim.owned(0,'building',type),b=room.sim.owned(1,'building',type);for(let i=0;i<Math.min(a.length,b.length);i++){b[i].x=-a[i].x;b[i].z=-a[i].z;}}
      for(const unit of room.sim.owned(1,'unit'))unit.hp=0;for(const unit of room.sim.owned(0,'unit')){const mirror=room.sim.addUnit(unit.type,1,-unit.x,-unit.z);if(unit.type==='fishingboat')room.sim.assignWorker(mirror);}room.sim.assignEconomy(1);room.sim.revision++;
      for(const e of room.sim.owned(1).filter(e=>e.kind==='unit'||e.kind==='building')){e.maxHp=room.sim.maxHP(e);e.hp=e.maxHp;}
    }
    room.explored=room.sim.players.map(()=>new Uint8Array(room.sim.gridSize**2));room.visibility=room.sim.players.map(()=>null);room.stats=room.sim.players.map(emptyStats);room.known=room.sim.players.map(()=>new Map());room.resources=room.sim.players.map(()=>new Map());room.effects=[];
    room.sim.on(event=>{
      if(event.type==='gathered')room.stats[event.owner].gathered+=event.amount;
      if(event.type==='trained'||event.type==='stat-trained')room.stats[event.entity.owner].trained++;
      if(event.type==='complete'||event.type==='stat-complete')room.stats[event.entity.owner].built++;
      if(event.type==='notice')send(room.players.find(p=>p.side===event.owner)?.ws,{type:'error',message:event.message});
      if(event.type==='donation')for(const side of [event.from,event.to])send(room.players.find(p=>p.side===side)?.ws,{type:'donation',from:room.sim.players[event.from].name,to:room.sim.players[event.to].name,resource:event.resource,amount:event.amount});
      if(event.type==='death'&&event.entity.owner>=0&&!event.entity.demolished){room.stats[event.entity.owner].lost++;if(event.entity.lastAttacker>=0&&event.entity.lastAttacker!==event.entity.owner)room.stats[event.entity.lastAttacker].kills++;}
      if(['attack','projectile-impact','death','heal','research','complete','trained','capture','unload','kingdom-defeated','remnants-revealed','ally-support'].includes(event.type))room.effects.push(event);
    });
    for(const player of room.players){const state=perspective(room,player.side,false,custom(room)&&player.protocol>=2);if(send(player.ws,{type:'begin',state,code:room.code,waiting:waiting(room),chat:room.chat.session(room,player)}))commitSnapshot(room,player.side,state);}
  }
  function action(player,room,message){
    const s=room.sim;if(!s||s.ended||s.players[player.side]?.defeated||waiting(room))return;
    const owner=player.side,args=message.args||[],owns=id=>s.get(id)?.owner===owner,ids=list=>Array.isArray(list)?list.filter(owns).slice(0,160):[];
    switch(message.method){
      case 'smartCommand':{const target=s.get(args[1]);if(target&&target.owner!==owner&&!s.canSee(owner,target))return;s.smartCommand(ids(args[0]),target,args[2],args[3],!!args[4],!!args[5],owner);break;}
      case 'build':if(!s.canSee(owner,{x:args[1],z:args[2],r:0})){send(player.ws,{type:'error',message:'Construct buildings within your visible territory.'});break;}s.build(args[0],args[1],args[2],ids(args[3]),owner,!!args[5]);break;
      case 'buildWallLine':s.buildWallLine({x:args[0],z:args[1]},{x:args[2],z:args[3]},ids(args[4]),owner,true);break;
      case 'train':if(owns(args[0]))s.train(args[0],args[1]);break;
      case 'research':if(owns(args[0]))s.research(args[0],args[1]);break;
      case 'stop':s.stop(ids(args[0]));break;
      case 'patrol':s.patrol(ids(args[0]),args[1],args[2],!!args[3],owner);break;
      case 'guard':s.guard(ids(args[0]),args[1],!!args[2],owner);break;
      case 'setStance':s.setStance(ids(args[0]),args[1],owner);break;
      case 'unload':s.unload(args[0],args[1],args[2],owner);break;
      case 'townBell':s.townBell(args[0],owner);break;
      case 'returnToWork':s.returnToWork(args[0],owner);break;
      case 'seekShelter':s.seekShelter(ids(args[0]),args[1]??null,owner);break;
      case 'assignWorker':if(owns(args[0])){const worker=s.get(args[0]);worker.order=null;s.assignWorker(worker);}break;
      case 'formation':if(['square','line','column'].includes(args[0]))s.players[owner].formation=args[0];break;
      case 'stance':s.setStance(ids(args[0]),args[1]==='hold'?'hold':'aggressive',owner);break;
      case 'trade':if(['food','wood','stone'].includes(args[0]))s.trade(args[0],!!args[1],owner);break;
      case 'donateResources':if(custom(room)&&Number.isInteger(args[1])&&args[1]>=0&&args[1]<s.players.length){const recipient=orderFor(room,owner)[args[1]];if(!s.donateResources(owner,recipient,args[2],args[3]))send(player.ws,{type:'error',message:'Resource gift could not be sent. Check your balance and ally.'});}break;
      case 'demolish':if(owns(args[0]))s.demolish(args[0],owner);break;
      case 'cancelQueue':if(owns(args[0])&&Number.isInteger(args[1])&&args[1]>=0&&args[1]<s.get(args[0]).queue.length)s.cancelQueue(args[0],args[1],owner);break;
      case 'resign':if(custom(room)){s.resign(owner);player.conceded=true;}break;
    }
  }
  function concede(room,player,reason){
    player.conceded=true;delete player.disconnected;
    if(room.sim&&!room.sim.ended){if(custom(room)){room.sim.eliminateKingdom(player.side,reason);room.sim.checkVictory();}else room.sim.end(player.side!==0,reason);}
  }
  wss.on('connection',ws=>{let player=null,room=null,count=0,windowTime=Date.now();ws.alive=true;ws.on('pong',()=>ws.alive=true);
    ws.on('message',raw=>{try{
      const now=Date.now();if(now-windowTime>1000){windowTime=now;count=0;}if(++count>80)return;const message=JSON.parse(raw);if(!message||typeof message!=='object')return;
      ws.alive=true; // Valid application traffic also proves this link is alive.
      if(message.type==='ping'){send(ws,{type:'pong',stamp:message.stamp});return;}
      if(message.type==='create'&&!player){
        if(rooms.size>=maxRooms)return send(ws,{type:'error',message:'All match slots are busy. Try again after a match finishes.'});
        const input=message.options||{},base={map:MAPS[input.map]?input.map:'highlands',seed:Number.isFinite(input.seed)?input.seed:2026};let options;
        if(input.mode==='custom'){options=normalizeBattle({...input,...base,multiplayer:true});if(options.slots.filter(slot=>slot.controller==='human').length<2)return send(ws,{type:'error',message:'Choose at least two human slots for a multiplayer room.'});}
        else options={...base,mode:['skirmish','regicide','dominion','wonder','tides'].includes(input.mode)?input.mode:'skirmish',difficulty:'normal'};
        room={code:code(),options,players:[],created:now,slotDefaults:options.mode==='custom'?options.slots.map(({name,faction})=>({name,faction})):null};while(rooms.has(room.code))room.code=code();rooms.set(room.code,room);
        player={side:0,host:true,ready:true,protocol:Number(message.protocol)>=2?2:1,name:String(message.name||'Commander').slice(0,24),faction:FACTIONS[message.faction]?message.faction:'alder',token:randomBytes(16).toString('hex'),ws};room.players.push(player);
        if(custom(room)){options.slots[0].name=player.name;options.slots[0].faction=player.faction;}
        send(ws,{type:'session',code:room.code,token:player.token});lobby(room);return;
      }
      if(message.type==='join'&&!player){
        room=rooms.get(String(message.code||'').toUpperCase());if(!room||room.sim)return send(ws,{type:'error',message:'That room is unavailable. Check its code.'});
        const free=humanSlots(room).filter(side=>!room.players.some(p=>p.side===side)),requested=custom(room)?room.options.slots.findIndex(slot=>slot.slotNumber===Number(message.slot)):-1,side=requested>=0?requested:free[0];
        if(!free.includes(side))return send(ws,{type:'error',message:'That human slot is unavailable. Choose another slot or use automatic assignment.'});
        player={side,host:false,ready:!custom(room),protocol:Number(message.protocol)>=2?2:1,name:String(message.name||'Commander').slice(0,24),faction:FACTIONS[message.faction]?message.faction:'raven',token:randomBytes(16).toString('hex'),ws};room.players.push(player);
        if(custom(room)){room.options.slots[side].name=player.name;room.options.slots[side].faction=player.faction;}
        send(ws,{type:'session',code:room.code,token:player.token});lobby(room);return;
      }
      if(message.type==='resume'&&!player){
        room=rooms.get(String(message.code||'').toUpperCase());player=room?.players.find(p=>p.token===message.token&&!p.conceded);if(!player)return send(ws,{type:'error',code:'session-ended',message:'That network session has ended.'});
        player.ws?.close();player.ws=ws;player.protocol=Number(message.protocol)>=2?2:1;delete player.disconnected;if(room.sim){const state=perspective(room,player.side,false,custom(room)&&player.protocol>=2);if(send(ws,{type:'begin',state,code:room.code,waiting:waiting(room),chat:room.chat.session(room,player)}))commitSnapshot(room,player.side,state);}else lobby(room);return;
      }
      if(!player||!room||player.ws!==ws||rooms.get(room.code)!==room)return;
      if(message.type==='visibility-resync'){if(player.ws===ws&&room.sim&&custom(room)&&player.protocol>=2)player.visibilityResync=true;return;}
      if(message.type==='chat'){
        if(!room.sim||player.ws!==ws||!rooms.has(room.code))return;
        const result=room.chat.accept(room,player,message);
        if(result.error)send(ws,{type:'chat-error',message:result.error});
        else for(const recipient of room.players)if((!result.duplicate||recipient===player)&&room.chat.allowed(room,recipient.side,result.message))send(recipient.ws,{type:'chat',message:room.chat.packet(result.message)});
        return;
      }
      if(message.type==='ready'&&!room.sim){player.ready=!!message.ready;lobby(room);}
      if(message.type==='slot'&&!room.sim&&custom(room)&&!player.host){const side=room.options.slots.findIndex(slot=>slot.slotNumber===Number(message.slot));if(humanSlots(room).includes(side)&&!room.players.some(p=>p!==player&&p.side===side)){restoreLobbySlot(room,player.side);player.side=side;player.ready=false;room.options.slots[side].name=player.name;room.options.slots[side].faction=player.faction;lobby(room);}}
      if(message.type==='start'&&player.host&&!room.sim){if(canStart(room))start(room);else send(ws,{type:'error',message:'Every human slot must be connected and ready before starting.'});}
      if(message.type==='action'){const args=message.args,valid=value=>typeof value==='number'?Number.isFinite(value)&&Math.abs(value)<1e9:Array.isArray(value)?value.length<=180&&value.every(valid):value==null||['string','boolean'].includes(typeof value);if(Array.isArray(args)&&args.every(valid))action(player,room,message);}
      if(message.type==='leave'){
        if(room.sim){concede(room,player,'Commander left the battle.');player.ws=null;releaseVacantRoom(room);}
        else if(player.host)closeLobby(room,'The host closed this room.',player);
        else{restoreLobbySlot(room,player.side);room.players=room.players.filter(p=>p!==player);lobby(room);}
        player=null;room=null;
      }
    }catch{send(ws,{type:'error',message:'The command could not be processed. Check the battle settings and try again.'});}});
    ws.on('close',()=>{if(player&&player.ws===ws){player.ws=null;if(!player.conceded)player.disconnected=Date.now();if(!room.sim)player.ready=false;if(rooms.get(room.code)===room&&!releaseVacantRoom(room))lobby(room);}});
  });
  let snapshotClock=0;const timer=setInterval(()=>{snapshotClock++;for(const room of rooms.values()){
    let lobbyChanged=false;
    for(const player of room.players)if(!player.ws&&player.disconnected&&Date.now()-player.disconnected>120000){concede(room,player,'Commander did not reconnect.');if(!room.sim&&!player.host){restoreLobbySlot(room,player.side);room.players=room.players.filter(other=>other!==player);lobbyChanged=true;}}
    if(!room.sim&&room.players.some(player=>player.host&&player.conceded)){closeLobby(room,'The host did not reconnect. Create or join another room.');continue;}
    if(lobbyChanged)lobby(room);
    if(releaseVacantRoom(room))continue;
    if(room.sim&&!waiting(room))room.sim.tick(.1);
    if(room.sim&&snapshotClock%2===0){const visionCache=new Map(),memoryCache=new Map();for(const player of room.players){
      if(!connected(player))continue;const observer=observing(room,player.side),visible=frameVisibility(room,player.side,observer,visionCache);
      // Preserve scouting during congestion without preparing discarded actor,
      // resource, effect and fog-delta packets for this connection.
      if(!canSend(player.ws,'state')){observeHeldState(room,player.side,visible,observer,memoryCache);continue;}
      const map=orderFor(room,player.side),mapOwner=owner=>owner<0?owner:map.indexOf(owner);
      const effects=room.effects.map(e=>combatPerspective(room.sim,player.side,e,{observer})).filter(Boolean).filter(e=>!e.entity?.embarked||e.entity.owner===player.side||observer).filter(e=>e.type==='ally-support'?room.sim.allied(player.side,e.ally):observer||e.owner===player.side||['kingdom-defeated','remnants-revealed'].includes(e.type)||e.entity?.owner===player.side||e.target?.owner===player.side||e.entity&&room.sim.canSee(player.side,e.entity)).slice(-60).map(e=>JSON.parse(JSON.stringify(e,(key,value)=>key==='path'||key==='orders'?undefined:value))).map(e=>{if(e.owner>=0)e.owner=mapOwner(e.owner);if(e.ally>=0)e.ally=mapOwner(e.ally);for(const key of ['entity','target'])if(e[key]){e[key]=entityPerspective(room.sim,player.side,e[key]);if(e[key].owner>=0)e[key].owner=mapOwner(e[key].owner);}return e;});
      const state=perspective(room,player.side,custom(room),custom(room)&&player.protocol>=2,player.visibilityResync,visible,memoryCache);
      if(send(player.ws,{type:'state',state,effects,waiting:waiting(room)})){commitSnapshot(room,player.side,state);player.visibilityResync=false;}
    }room.effects=[];}
    if(room.players.every(p=>!p.ws)&&Date.now()-Math.max(room.created,...room.players.map(p=>p.disconnected||0))>150000)rooms.delete(room.code);
  }},100);
  const heartbeat=setInterval(()=>{for(const ws of wss.clients){if(!ws.alive){ws.terminate();continue;}ws.alive=false;ws.ping();}},Math.max(50,Number(heartbeatInterval)||20000));
  return {rooms,close(){clearInterval(timer);clearInterval(heartbeat);wss.close();}};
}
