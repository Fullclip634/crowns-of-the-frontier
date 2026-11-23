import {difficultyLabel} from './ui-format.js';
import {uiIcon} from './ui-icons.js';
import {AGES,MAPS,FACTIONS,DIFFICULTIES} from './data.js';
import {AI_HEALTH_LEVELS,BATTLE_SIZES,POPULATION_LIMITS,VICTORY_RULES,PLAYER_COLORS,landBattleSpawns,spawnContext,normalizeBattle} from './custom-battle.js';
import {channelAt,waterChannels} from './map-water.js';
import {AI_PACES} from './allied-ai.js';
import {AI_PERSONALITIES} from './ai-personalities.js';
import {terrainBiome,isVolcanicBiome} from './terrain-biomes.js';
const esc=value=>String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const options=(entries,current)=>entries.map(([value,label])=>`<option value="${value}" ${String(current)===String(value)?'selected':''}>${esc(label)}</option>`).join('');
const color=slotNumber=>'#'+PLAYER_COLORS[slotNumber-1].toString(16).padStart(6,'0');

export function customBattleMarkup(draft){
  const playerSlot=draft.spectator||Number(draft.playerSlot)===0?0:Number(draft.playerSlot)||1;
  const spectator=playerSlot===0;
  const roleOptions=draft.slots.map((slot,index)=>({slot,number:slot.slotNumber||index+1})).filter(({slot})=>slot.enabled!==false).map(({slot,number})=>[number,`Play as slot ${number} · Team ${slot.team}`]);
  roleOptions.push([0,'Spectator']);
  return `<div class="eyebrow">BATTLE SETUP</div><h2>Custom battle</h2><p class="modal-intro">Choose your kingdom, allies and opponents. Play against AI, watch an AI battle, or host a room for friends.</p><div class="battle-presets" aria-label="Quick team presets">${[['2v2','2 vs 2'],['3v3','3 vs 3'],['4v4','4 vs 4'],['1v3','1 vs 3'],['ffa4','4-way free-for-all'],['ffa8','8-way free-for-all']].map(([id,label])=>`<button data-battle-preset="${id}">${label}</button>`).join('')}</div><div class="battle-setup-layout"><section class="battle-settings"><div class="setup-grid"><div><label class="field-label" for="custom-map">BATTLEFIELD</label><select id="custom-map">${options(Object.entries(MAPS).map(([id,data])=>[id,data.name]),draft.map)}</select></div><div><label class="field-label" for="custom-size">MAP SIZE</label><select id="custom-size">${options(Object.entries(BATTLE_SIZES).map(([id,data])=>[id,`${data.name} · ${data.desc}`]),draft.mapSize)}</select></div><div><label class="field-label" for="custom-age">STARTING AGE</label><select id="custom-age">${options(AGES.map((name,i)=>[i,name]),draft.startAge)}</select></div><div><label class="field-label" for="custom-resources">STARTING RESOURCES</label><select id="custom-resources">${options([['standard','Standard'],['rich','Abundant']],draft.resourceLevel)}</select></div><div><label class="field-label" for="custom-population">POPULATION PER KINGDOM</label><select id="custom-population" aria-describedby="custom-population-help">${options(POPULATION_LIMITS.map(limit=>[limit,`${limit}${limit===40?' \u00b7 small armies':limit===60?' \u00b7 smaller armies':limit===80?' \u00b7 default':limit===160?' \u00b7 larger armies':''}`]),draft.populationLimit??80)}</select><p id="custom-population-help" class="tree-note">Includes villagers, troops and ships. Choose 40 for smaller battles; higher limits allow larger armies.</p></div><div><label class="field-label" for="custom-seed">WORLD SEED</label><input id="custom-seed" type="number" min="1" max="999999999" value="${draft.seed}"></div></div><label class="field-label" for="custom-player-slot">YOUR ROLE</label><select id="custom-player-slot">${options(roleOptions,playerSlot)}</select><p class="tree-note">Choose a kingdom to command, or select <strong>Spectator</strong> to watch. In a hosted room, friends play in Human slots.</p><label class="field-label" for="custom-pace">AI BATTLE PACE</label><select id="custom-pace">${options(Object.entries(AI_PACES).map(([id,data])=>[id,data.name]),draft.aiPace||'balanced')}</select><p class="tree-note">Balanced gives kingdoms time to develop before major offensives. AI allies send reinforcements when a teammate’s base comes under attack.</p><label class="field-label" for="custom-victory">VICTORY CONDITION</label><select id="custom-victory">${options(Object.entries(VICTORY_RULES).map(([id,data])=>[id,data.name]),draft.victory)}</select><label class="toggle"><input type="checkbox" id="custom-vision" ${draft.shareVision?'checked':''}> Share vision with allies</label><label class="toggle"><input type="checkbox" id="custom-remnants" ${draft.revealRemnants?'checked':''}> Reveal the final few enemy buildings after their capital falls</label></section><aside class="battle-preview"><canvas id="battle-preview" width="260" height="260" aria-label="Battlefield preview with numbered kingdom starting positions"></canvas><div id="battle-summary"></div><p id="battle-rule"></p></aside></div><div class="battle-slots" aria-label="Kingdom slots">${draft.slots.map((slot,i)=>{const slotNumber=slot.slotNumber||i+1,selected=playerSlot===slotNumber,human=selected||slot.controller==='human';return `<section class="battle-slot ${slot.enabled===false?'closed':''} ${selected?'player-slot':''}" data-slot="${i}"><button type="button" class="battle-slot-number ${selected?'selected':''}" data-play-slot="${slotNumber}" aria-label="Play as kingdom slot ${slotNumber}" aria-pressed="${selected}" style="--army-color:${color(slotNumber)}" ${slot.enabled===false?'disabled':''}>${slotNumber}</button><div><label for="custom-name-${i}">KINGDOM</label><input id="custom-name-${i}" maxlength="24" value="${esc(slot.name)}" ${slot.enabled===false?'disabled':''}></div><div><label for="custom-type-${i}">CONTROLLER</label>${selected?'<span class="battle-human">You · Playing</span>':`<select id="custom-type-${i}">${options([['ai','AI commander'],['human','Human (multiplayer)'],['closed','Closed']],slot.enabled===false?'closed':human?'human':'ai')}</select>`}</div><div><label for="custom-faction-${i}">CIVILIZATION</label><select id="custom-faction-${i}" ${slot.enabled===false?'disabled':''}>${options(Object.entries(FACTIONS).map(([id,data])=>[id,data.name]),slot.faction)}</select></div><div><label for="custom-team-${i}">TEAM</label><select id="custom-team-${i}" ${slot.enabled===false?'disabled':''}>${options(Array.from({length:8},(_,n)=>[n+1,`Team ${n+1}`]),slot.team)}</select></div><div><label for="custom-difficulty-${i}">AI DIFFICULTY</label><select id="custom-difficulty-${i}" ${slot.enabled===false||human?'disabled':''}>${options(Object.entries(DIFFICULTIES).map(([id,data])=>[id,difficultyLabel(id,data.name)]),slot.difficulty)}</select><label for="custom-ai-health-${i}">AI HEALTH</label><select id="custom-ai-health-${i}" title="Maximum health of this AI kingdom's units and buildings" ${slot.enabled===false||human?'disabled':''}>${options(AI_HEALTH_LEVELS.map(level=>[level,level===100?'100% Standard':level+'%']),slot.aiHealth??100)}</select><label for="custom-personality-${i}">AI STYLE</label><select id="custom-personality-${i}" title="Tactical commander personality" ${slot.enabled===false||human?'disabled':''}>${options(Object.values(AI_PERSONALITIES).map(p=>[p.id,p.name]),slot.aiPersonality||'balanced')}</select></div></section>`;}).join('')}</div><p class="custom-validation" role="status"></p><div class="custom-launch"><button class="primary full" data-action="custom-start">${spectator?'Watch AI battle':'Play against AI'} ${uiIcon(spectator?'eye':'play')}</button><button class="secondary full" data-action="custom-host">${spectator?'Host as spectator':'Host multiplayer'}</button><small id="custom-network-note">Solo uses AI for the other kingdoms. Multiplayer friends join Human slots.</small></div>`;
}

export function readBattleSetup(root=document){
  const get=id=>root.querySelector('#'+id),playerSlot=Number(get('custom-player-slot').value),spectator=playerSlot===0;
  const slots=Array.from({length:8},(_,i)=>{const type=get(`custom-type-${i}`),selected=!spectator&&playerSlot===i+1;return {name:get(`custom-name-${i}`).value,enabled:selected||type?.value!=='closed',controller:selected||type?.value==='human'?'human':'ai',faction:get(`custom-faction-${i}`).value,team:Number(get(`custom-team-${i}`).value),difficulty:get(`custom-difficulty-${i}`).value,aiHealth:Number(get(`custom-ai-health-${i}`)?.value??100),aiPersonality:get(`custom-personality-${i}`)?.value||'balanced'};});
  return {mode:'custom',slots,playerSlot,spectator,aiPace:get('custom-pace').value,map:get('custom-map').value,mapSize:get('custom-size').value,startAge:Number(get('custom-age').value),resourceLevel:get('custom-resources').value,populationLimit:Number(get('custom-population').value),seed:Math.max(1,Math.min(999999999,Math.abs(Number(get('custom-seed').value))||2026)),victory:get('custom-victory').value,shareVision:get('custom-vision').checked,revealRemnants:get('custom-remnants').checked};
}

export function updateBattlePreview(root=document){
  const draft=readBattleSetup(root),canvas=root.querySelector('#battle-preview'),ctx=canvas.getContext('2d'),size=canvas.width;
  root.querySelectorAll('.battle-slot').forEach((row,i)=>{const active=draft.slots[i].enabled;row.classList.toggle('closed',!active);row.classList.toggle('player-slot',draft.playerSlot===i+1);row.querySelectorAll('input,select').forEach(input=>{if(!input.id.includes('-type-'))input.disabled=!active||(input.id.includes('-difficulty-')||input.id.includes('-ai-health-')||input.id.includes('-personality-'))&&draft.slots[i].controller==='human';});});
  ctx.fillStyle=draft.map==='winter'?'#b7c4b2':terrainBiome(draft.map).map;ctx.fillRect(0,0,size,size);
  const channels=waterChannels(draft.map);
  if(channels.length){
    const previewWorldSize=BATTLE_SIZES[draft.mapSize]?.size||480,previewScale=size/previewWorldSize;
    ctx.strokeStyle=isVolcanicBiome(draft.map)?'#8a6a54':'#70a9b0';
    for(const channel of channels){
      ctx.lineWidth=Math.max(4,channel.width*2*previewScale);
      ctx.beginPath();
      for(let y=0;y<=size;y+=4){
        const z=(y/size-.5)*previewWorldSize;
        const x=((channel.center+Math.sin(z*channel.frequency)*channel.bend)/previewWorldSize+.5)*size;
        if(!y)ctx.moveTo(x,y);else ctx.lineTo(x,y);
      }
      ctx.stroke();
    }
  }
  // Cartographic geography hints for tactical & campaign-inspired battlefields
  if(['ironpass','sunderedpass','ironring','emberroad','threecrowns','blackwood','timbervale','oakhold','frostvale','bastion'].includes(draft.map)){
    ctx.save();
    ctx.lineCap='round';
    const ridgeCol=isVolcanicBiome(draft.map)?'rgba(28,23,21,0.72)':draft.map==='frostvale'?'rgba(235,244,248,0.68)':'rgba(54,58,50,0.58)';
    const forestCol='rgba(26,56,28,0.48)';
    if(draft.map==='sunderedpass'){
      ctx.strokeStyle=ridgeCol;ctx.lineWidth=10;
      for(const [a,b] of [[0.03,0.18],[0.30,0.44],[0.56,0.70],[0.82,0.97]]){
        ctx.beginPath();ctx.moveTo(size*.5,size*a);ctx.lineTo(size*.5,size*b);ctx.stroke();
      }
    }else if(draft.map==='ironring'){
      ctx.strokeStyle=ridgeCol;ctx.lineWidth=9;
      for(const a of [-Math.PI*.75,-Math.PI*.25,Math.PI*.25,Math.PI*.75]){
        ctx.beginPath();
        ctx.moveTo(size*.5+Math.cos(a)*size*.16,size*.5+Math.sin(a)*size*.16);
        ctx.lineTo(size*.5+Math.cos(a)*size*.40,size*.5+Math.sin(a)*size*.40);
        ctx.stroke();
      }
    }else if(draft.map==='ironpass'||draft.map==='emberroad'){
      ctx.strokeStyle=ridgeCol;ctx.lineWidth=10;
      for(const [t0,t1] of [[0.04,0.22],[0.32,0.44],[0.56,0.68],[0.78,0.96]]){
        ctx.beginPath();ctx.moveTo(size*t0,size*t0);ctx.lineTo(size*t1,size*t1);ctx.stroke();
      }
    }else if(draft.map==='threecrowns'){
      ctx.strokeStyle=ridgeCol;ctx.lineWidth=8;
      ctx.beginPath();ctx.moveTo(size*.45,size*.06);ctx.lineTo(size*.55,size*.26);ctx.stroke();
      ctx.beginPath();ctx.moveTo(size*.45,size*.74);ctx.lineTo(size*.55,size*.94);ctx.stroke();
    }else if(draft.map==='oakhold'||draft.map==='timbervale'||draft.map==='blackwood'){
      ctx.strokeStyle=forestCol;ctx.lineWidth=14;
      for(const [t0,t1] of [[0.05,0.24],[0.36,0.45],[0.55,0.64],[0.76,0.95]]){
        ctx.beginPath();ctx.moveTo(size*t0,size*t0);ctx.lineTo(size*t1,size*t1);ctx.stroke();
      }
      if(draft.map==='oakhold'){
        for(const [t0,t1] of [[0.08,0.28],[0.72,0.92]]){
          ctx.beginPath();ctx.moveTo(size*t0,size*(1-t0));ctx.lineTo(size*t1,size*(1-t1));ctx.stroke();
        }
      }
    }
    ctx.restore();
  }
  const warning=root.querySelector('.custom-validation'),launch=root.querySelector('[data-action=custom-start]'),host=root.querySelector('[data-action=custom-host]'),networkNote=root.querySelector('#custom-network-note');
  launch.innerHTML=`${draft.spectator?'Watch AI battle':'Play against AI'} ${uiIcon(draft.spectator?'eye':'play')}`;
  host.disabled=false;host.textContent=draft.spectator?'Host as spectator':'Host multiplayer';
  const humanSlots=draft.slots.filter((slot,i)=>slot.enabled&&slot.controller==='human'&&i+1!==draft.playerSlot).length;
  networkNote.textContent=humanSlots?`${humanSlots} Human ${humanSlots===1?'slot':'slots'} for friends when hosting.`:'Hosting opens one kingdom for a friend.';
  try{
    const battle=normalizeBattle(draft);if(draft.startAge!==battle.startAge){draft.startAge=battle.startAge;root.querySelector('#custom-age').value=String(battle.startAge);}const spawns=landBattleSpawns(spawnContext(battle.map,battle.worldSize,(x,z)=>channelAt(battle.map,x,z)),battle.slots,battle.worldSize),bySlot=new Map(battle.slots.map((slot,i)=>[slot.slotNumber,spawns[i]]));launch.disabled=false;warning.textContent=draft.spectator?'Watch a solo AI battle or create a multiplayer room as its spectator host.':'Matching team numbers are allies. Different team numbers are enemies.'+(draft.map==='coast'?' Coast battles include coastal harbors and ships.':'');
    draft.slots.forEach((slot,index)=>{if(!slot.enabled)return;const point=bySlot.get(index+1);if(!point)return;const x=(point.x/battle.worldSize+.5)*size,z=(point.z/battle.worldSize+.5)*size;ctx.fillStyle=color(index+1);ctx.beginPath();ctx.arc(x,z,12,0,Math.PI*2);ctx.fill();ctx.strokeStyle=draft.playerSlot===index+1?'#f5e7b4':'#203528';ctx.lineWidth=draft.playerSlot===index+1?3:2;ctx.stroke();ctx.fillStyle='#172b23';ctx.font='bold 12px sans-serif';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(index+1,x,z);});
    root.querySelector('#battle-summary').textContent=`${battle.slots.length} kingdoms · ${new Set(battle.slots.map(slot=>slot.team)).size} teams · ${BATTLE_SIZES[battle.mapSize].desc}`;root.querySelector('#battle-rule').textContent=VICTORY_RULES[battle.victory].desc;
  }catch(error){launch.disabled=true;host.disabled=true;warning.textContent=error.message;root.querySelector('#battle-summary').textContent='Add an opposing team to begin.';}
  return draft;
}

export function battleObjectiveMarkup(sim){
  const spectator=sim.options.spectator;
  return `<div class="objective-eyebrow">${spectator?'SPECTATOR':'CUSTOM BATTLE'}<span>${sim.players.length} KINGDOMS</span></div><h3>${spectator?'Battlefield observer':'War of the kingdoms'}</h3><details class="battle-rules"><summary>${VICTORY_RULES[sim.options.victory].name}</summary><p>${VICTORY_RULES[sim.options.victory].desc}</p></details>${spectator?'<p class="battle-spectating">Every kingdom is AI controlled. Select a kingdom to move the camera; the battle continues until one team remains.</p>':sim.players[0].defeated?'<p class="battle-spectating">Your kingdom is eliminated. Watch your allies fight for the team victory.</p>':''}<div class="battle-roster">${sim.players.map((player,i)=>`<button data-focus-kingdom="${i}" title="Locate ${esc(player.name)}" class="${player.defeated?'defeated':''}"><i style="background:#${player.color.toString(16).padStart(6,'0')}"></i><span><strong>${esc(player.name)}</strong><small>Team ${player.team} · ${spectator?'AI':i===0?'You':sim.allied(0,i)?'Ally':'Enemy'}</small></span><em>${player.defeated?'Eliminated':player.controller==='human'?'Human':DIFFICULTIES[player.difficulty].name}</em></button>`).join('')}</div>`;
}

export function battleResultMarkup(sim){
  if(sim.options.mode!=='custom')return '';
  const players=sim.players||[];
  const maxGathered=Math.max(1,...players.map(p=>p.battleStats?.gathered||0));
  const maxKills=Math.max(1,...players.map(p=>p.battleStats?.kills||0));
  const tableRows=players.map(player=>`<tr><th>${esc(player.name)}</th><td>${player.team}</td><td>${player.battleStats.kills}</td><td>${Math.floor(player.battleStats.gathered)}</td></tr>`).join('');
  const cards=players.map((player,i)=>{
    const s=player.battleStats||{};
    const kd=s.lost>0?(s.kills/s.lost).toFixed(1):s.kills;
    const isTopGather=s.gathered===maxGathered&&maxGathered>0;
    const isTopKills=s.kills===maxKills&&maxKills>0;
    const colorHex='#'+(player.color?player.color.toString(16).padStart(6,'0'):PLAYER_COLORS[i]?.toString(16).padStart(6,'0')||'c5ae76');
    const badge=isTopKills?`<span class="analytics-badge badge-warlord">${uiIcon('swords')} Warlord</span>`:isTopGather?`<span class="analytics-badge badge-economy">${uiIcon('wheat')} Hegemon</span>`:!player.defeated?`<span class="analytics-badge badge-survivor">${uiIcon('shield-check')} Survivor</span>`:'';
    const gatherPct=Math.round((s.gathered/maxGathered)*100);
    const killPct=Math.round((s.kills/maxKills)*100);
    return `<article class="analytics-card ${player.defeated?'defeated':''}">
      <div class="analytics-card-header">
        <i class="analytics-dot" style="background:${colorHex}"></i>
        <strong>${esc(player.name)}</strong>
        <span class="analytics-team">Team ${player.team}</span>
        ${badge}
      </div>
      <div class="analytics-bars">
        <div class="analytics-bar-row">
          <small>Gathered (${Math.floor(s.gathered)})</small>
          <div class="analytics-bar-track"><div class="analytics-bar-fill gold-bar" style="width:${gatherPct}%"></div></div>
        </div>
        <div class="analytics-bar-row">
          <small>Kills (${s.kills} · KD ${kd})</small>
          <div class="analytics-bar-track"><div class="analytics-bar-fill red-bar" style="width:${killPct}%"></div></div>
        </div>
      </div>
    </article>`;
  }).join('');
  return `<div class="battle-result-table"><table><caption>Kingdom results</caption><thead><tr><th>Kingdom</th><th>Team</th><th>Defeated</th><th>Gathered</th></tr></thead><tbody>${tableRows}</tbody></table></div><div class="battle-analytics-panel"><div class="analytics-heading"><span>TACTICAL ASSESSMENT &amp; PERFORMANCE</span></div><div class="analytics-grid">${cards}</div></div>`;
}

export function roomLobbyMarkup(room){
  const isCustom=room.options.mode==='custom',watcher=room.options.hostSpectator&&room.players.find(player=>player.side===room.slots.length);
  return `<div class="eyebrow">MULTIPLAYER WAR ROOM</div><h2>${isCustom?'Gather your alliances.':'Your frontier awaits.'}</h2><p class="modal-intro">Share the room code. ${isCustom?'Friends join Human slots, choose an available slot, and mark themselves ready. AI kingdoms are ready automatically.':'The host starts once both commanders join.'}</p><div class="room-code" id="room-code">${room.code}</div>${isCustom?`${watcher?`<p class="settings-note"><strong>${esc(watcher.name)}</strong> · Spectator host</p>`: ''}<div class="room-grid">${room.slots.map(slot=>{const participant=room.players.find(player=>player.side===slot.side);const badgeCls=slot.controller==='ai'?'is-ai':participant?.ready?'is-ready':participant?'is-waiting':'is-open';return `<article class="lobby-card ${badgeCls}"><strong>${slot.slotNumber}. ${esc(participant?.name||slot.name)}</strong><small>Team ${slot.team} · ${esc(FACTIONS[slot.faction].name)}</small><span class="ready-pill ${badgeCls}">${slot.controller==='ai'?`AI · ${DIFFICULTIES[slot.difficulty].name} · ${slot.aiHealth??100}% HP`:participant?`${participant.connected?'Connected':'Disconnected'} · ${participant.ready?'Ready':'Not ready'}`:'Open Human slot'}</span>${room.host&&slot.controller==='ai'?`<label for="lobby-ai-health-${slot.slotNumber}">AI health</label><select id="lobby-ai-health-${slot.slotNumber}" data-ai-health-slot="${slot.slotNumber}" aria-label="AI health for ${esc(slot.name)}">${options(AI_HEALTH_LEVELS.map(level=>[level,level+'%']),slot.aiHealth??100)}</select>`: ''}</article>`;}).join('')}</div>${!room.host?`<label class="field-label" for="lobby-slot">YOUR SLOT / TEAM</label><select id="lobby-slot">${room.slots.filter(slot=>slot.controller==='human'&&(slot.side===room.selfSide||!room.players.some(player=>player.side===slot.side))).map(slot=>`<option value="${slot.slotNumber}" ${slot.side===room.selfSide?'selected':''}>Slot ${slot.slotNumber} · Team ${slot.team}</option>`).join('')}</select>`:''}${room.spectator?'':`<button class="secondary full" data-action="lan-ready" aria-pressed="${room.selfReady}">${room.selfReady?'Ready · click to unready':'Mark yourself ready'}</button>`}`:`<div class="room-players">${room.players.map(player=>`<article class="lobby-card is-ready"><span class="status-dot"></span><strong>${esc(player.name)}</strong><small>${FACTIONS[player.faction].name}</small></article>`).join('')}${room.players.length<2?'<article class="waiting-player lobby-card is-open"><strong>Waiting for a rival…</strong></article>':''}</div>`}${room.host?`<button class="primary full" data-action="lan-start" ${!room.canStart?'disabled':''}>Start the battle ${uiIcon("chevron-right")}</button>`:'<p class="modal-intro">The host starts when all Human slots are connected and ready.</p>'}<button class="text-button" data-action="lan-leave">Leave room</button>`;
}
