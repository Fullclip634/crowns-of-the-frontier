import {FACTIONS} from './data.js';
import {bridgeSpans,spanZ} from './bridge-layout.js';
import {uiIcon} from './ui-icons.js';

const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

const FEMALE_SPEAKERS=/queen|lady|syra|maera|sera|sela|ilya|isolde|vaelen/i;
const HEAVY_SPEAKERS=/draven|krag|korr|malrik|borin|arak|skald|overlord|siege|forge/i;
const FIERCE_SPEAKERS=/vex|varek|kael|raider|khan/i;

const ENEMY_LINES={
  opening:[
    'Your banners dare cross into our territory? We will tear down every tower you raise!',
    'Hide behind your stone while you can—my warbands are already sharpening their blades!',
    'Another rival claiming the frontier? Your fortress will be embers before sundown!',
  ],
  attackingPlayer:[
    'Press the breach! Their walls are cracking—push straight through the gate!',
    'Look at your towers burning! Send more troops, or watch your citadel fall!',
    'Bring forward the siege engines! Let none of their defenders catch their breath!',
  ],
  losingStructure:[
    'You dare torch my outpost?! Every stone you break will cost you ten soldiers!',
    'Curse your siege train! Reinforce the line—push those invaders back!',
    'A minor setback! My main fortress still stands, and vengeance is marching!',
  ],
  defeated:[
    'No... my banners are falling! Remember this day—the frontier will never bow easily!',
    'My citadel lies in ruins... you fought like a true conqueror!',
  ],
  tauntBringIt:[
    'Arrogant fool! You asked for war—I am sending my entire warband straight at your gates!',
    'Bold words from a boxed-in commander! Sound the horns—crush them now!',
    'You want my worst? Brace your walls—my siege engines are rolling!',
  ],
  tauntBurn:[
    'Empty boasts! Our stone will outlast your whole kingdom!',
    'Try crossing this battlefield first—my archers are waiting for your charge!',
    'The only flames rising today will come from your own town center!',
  ],
  tauntSurrenderStrong:[
    'Ha! Surrender to you? Look at our armies—we outnumber you and we are just getting started!',
    'Kneel? Never! It is your crown that will roll in the dirt!',
  ],
  tauntSurrenderWeak:[
    'Never! Even if my last wall falls, we will fight you over every burning brick!',
    'You think this war is over? I will drag your vanguard down with me!',
  ],
};

const ALLY_LINES={
  opening:[
    'Our banners stand united, Commander! Use War-Comms anytime you need an assault, pass defense, or supplies.',
    'Side by side we cannot be broken! Fortify your line and tell me when to strike!',
  ],
  attack:[
    'Understood, Commander! Sound the charge—my army marches straight for the target!',
    'For the alliance! Rally every soldier—we strike together now!',
    'Moving out in force! Meet me at the enemy walls!',
  ],
  defend:[
    'Shields to the chokepoint! My regiments are moving to lock down the narrow pass!',
    'Holding the pass beside you, Commander! Nothing breaks through our line!',
  ],
  help:[
    'Hold fast! I am pulling every spare blade straight to your gates right now!',
    'Hang on, Commander! My relief column is racing to your fortress!',
  ],
  suppliesSent:[
    'Supply wagons dispatched! Put that gold, stone, and timber straight into the war effort!',
    'Shared strength wins wars! Fresh supplies have arrived in your treasury!',
  ],
  suppliesLow:[
    'My storehouses are stretched thin right now, Commander—give me a moment to gather more!',
  ],
  allyUnderFire:[
    'Commander! Enemy warbands are hammering my gates—can you spare troops on my flank?',
  ],
  reinforcing:[
    'Reinforcements on the march! My soldiers are moving up to back your front line!',
  ],
};

function pick(list,seed=0){
  return list[Math.abs(Math.floor(seed))%list.length];
}

export function warCommsMarkup(){
  return `<aside id="war-comms-banner" class="war-comms-banner hidden" role="status" aria-live="polite"></aside>
  <section id="war-comms-panel" class="war-comms-panel hidden" aria-label="War communications">
    <header class="war-comms-head">
      <div class="war-comms-title">${uiIcon('message-square')}<strong>War Comms</strong></div>
      <div class="war-comms-head-tools">
        <button type="button" id="war-comms-mute" class="war-comms-icon-btn" data-action="comms-mute" aria-pressed="false" title="Mute or unmute spoken commander voices">${uiIcon('volume-2')}<span>Voice On</span></button>
        <button type="button" class="war-comms-icon-btn" data-action="comms-toggle" aria-label="Close war comms">${uiIcon('x')}</button>
      </div>
    </header>
    <div id="war-comms-ally-section" class="war-comms-section">
      <span class="war-comms-label">ALLY ORDERS</span>
      <div class="war-comms-grid">
        <button type="button" data-comms-ally="attack" title="Order allied armies to march and attack the enemy (Alt+1)">${uiIcon('swords')}<span>Attack!</span></button>
        <button type="button" data-comms-ally="defend" title="Order allies to hold the narrow pass or bridgehead (Alt+2)">${uiIcon('shield')}<span>Hold Pass</span></button>
        <button type="button" data-comms-ally="help" title="Call emergency allied relief to your base (Alt+3)">${uiIcon('flag-triangle-right')}<span>Help Me!</span></button>
        <button type="button" data-comms-ally="supplies" title="Request war supplies from your ally (Alt+4)">${uiIcon('gift')}<span>Supplies</span></button>
      </div>
    </div>
    <div class="war-comms-section">
      <span class="war-comms-label">TAUNT ENEMY WARLORDS</span>
      <div class="war-comms-taunts">
        <button type="button" data-comms-taunt="bringit">“Send your worst!” <small>Provokes assault</small></button>
        <button type="button" data-comms-taunt="burn">“Your walls will burn!”</button>
        <button type="button" data-comms-taunt="surrender">“Bow to the Crown!”</button>
      </div>
    </div>
    <div id="war-comms-log" class="war-comms-log" aria-label="Recent war transmissions"></div>
  </section>`;
}

export class WarCommsController{
  constructor(root,{audio,settings,onPing=()=>{}}={}){
    this.root=root;
    this.audio=audio;
    this.settings=settings||{};
    this.onPing=onPing;
    this.banner=root?.querySelector('#war-comms-banner')||null;
    this.panel=root?.querySelector('#war-comms-panel')||null;
    this.allySection=root?.querySelector('#war-comms-ally-section')||null;
    this.muteBtn=root?.querySelector('#war-comms-mute')||null;
    this.logEl=root?.querySelector('#war-comms-log')||null;
    this.open=false;
    this.muted=this.settings.voiceComms===false;
    this.voices=[];
    this.queue=[];
    this.speaking=false;
    this.bannerTimer=0;
    this.cooldowns={};
    this.history=[];
    this._loadVoices();
    if(typeof window!=='undefined'&&window.speechSynthesis){
      window.speechSynthesis.addEventListener?.('voiceschanged',()=>this._loadVoices());
    }
    this.syncMuteUI();
  }

  _loadVoices(){
    if(typeof window==='undefined'||!window.speechSynthesis?.getVoices)return;
    const all=window.speechSynthesis.getVoices()||[];
    this.voices=all.filter(v=>/^en\b/i.test(v.lang||'')||!v.lang);
  }

  _selectVoice(speaker,faction='alder'){
    if(!this.voices.length)this._loadVoices();
    const female=FEMALE_SPEAKERS.test(speaker||'');
    const heavy=HEAVY_SPEAKERS.test(speaker||'')||faction==='iron';
    const fierce=FIERCE_SPEAKERS.test(speaker||'')||faction==='raven';
    const score=v=>{
      let s=0;
      const name=(v.name||'').toLowerCase();
      if(/natural|neural|online/.test(name))s+=40;
      if(/google uk|google us|microsoft (ryan|brian|andrew|george|sonia|aria|ava|emma|guy|david|zira)/.test(name))s+=25;
      if(/en-gb/i.test(v.lang))s+=10;
      const looksFemale=/female|zira|hazel|susan|sonia|aria|ava|emma|jenny|libby|samantha|victoria|karen|moira/.test(name);
      const looksMale=/male|david|george|ryan|brian|andrew|guy|daniel|james|mark|richard|steffan/.test(name);
      if(female&&looksFemale)s+=35;
      else if(!female&&looksMale)s+=35;
      else if(female&&looksMale)s-=20;
      return s;
    };
    const ranked=[...this.voices].sort((a,b)=>score(b)-score(a));
    const voice=ranked[0]||null;
    const pitch=female?1.08:heavy?0.74:fierce?0.86:faction==='sun'?0.98:0.90;
    const rate=heavy?0.91:fierce?1.04:0.97;
    return {voice,pitch,rate};
  }

  syncMuteUI(){
    if(!this.muteBtn)return;
    this.muteBtn.setAttribute('aria-pressed',String(this.muted));
    this.muteBtn.classList.toggle('muted',this.muted);
    this.muteBtn.innerHTML=`${uiIcon('volume-2')}<span>${this.muted?'Muted':'Voice On'}</span>`;
  }

  toggleMute(){
    this.muted=!this.muted;
    this.settings.voiceComms=!this.muted;
    if(this.muted)this.cancelSpeech();
    this.syncMuteUI();
    return this.muted;
  }

  togglePanel(sim,force=null){
    this.open=force===null?!this.open:Boolean(force);
    this.panel?.classList.toggle('hidden',!this.open);
    this.refresh(sim);
    return this.open;
  }

  refresh(sim){
    const toggleBtn=this.root?.querySelector('#comms-toggle');
    const canShow=Boolean(sim&&!sim.ended&&!sim.options?.spectator&&sim.options?.mode!=='tutorial'&&sim.options?.mode!=='sandbox');
    if(toggleBtn){
      toggleBtn.classList.toggle('hidden',!canShow);
      toggleBtn.setAttribute('aria-expanded',String(this.open));
    }
    if(!canShow&&this.open){this.open=false;this.panel?.classList.add('hidden');}
    if(!sim)return;
    const hasAllies=this.activeAllies(sim).length>0;
    this.allySection?.classList.toggle('hidden',!hasAllies);
  }

  activeAllies(sim){
    if(!sim?.players)return [];
    return sim.players.map((p,i)=>({player:p,owner:i})).filter(({player,owner})=>owner>0&&sim.allied(0,owner)&&!player.defeated&&!player.dormant&&player.controller==='ai');
  }

  activeEnemies(sim){
    if(!sim?.players)return [];
    return sim.players.map((p,i)=>({player:p,owner:i})).filter(({player,owner})=>owner>0&&sim.hostile(0,owner)&&!player.defeated&&!player.dormant);
  }

  reset(sim=null){
    this.cancelSpeech();
    clearTimeout(this.bannerTimer);
    this.banner?.classList.add('hidden');
    this.queue=[];
    this.cooldowns={};
    this.history=[];
    if(this.logEl)this.logEl.innerHTML='';
    this.open=false;
    this.panel?.classList.add('hidden');
    this.refresh(sim);
  }

  cancelSpeech(){
    this.speaking=false;
    this.queue.length=0;
    try{window.speechSynthesis?.cancel?.();}catch{}
  }

  /** Speaks a warlord or allied commander line aloud with faction war-horn intro + live subtitle banner. */
  speak({speaker='Commander',role='ally',faction='alder',color=null,text='',urgent=false,horn=false}){
    if(!text)return;
    const item={speaker,role,faction,color,text,horn};
    if(urgent){
      try{window.speechSynthesis?.cancel?.();}catch{}
      this.queue=[item];
      this.speaking=false;
      this._playNext();
      return;
    }
    if(this.queue.length>=3)this.queue.shift();
    this.queue.push(item);
    if(!this.speaking)this._playNext();
  }

  _playNext(){
    const item=this.queue.shift();
    if(!item){this.speaking=false;return;}
    this.speaking=true;
    this._recordLog(item);
    this._showBanner(item);
    if(item.horn&&this.settings.warHorns!==false){
      this.audio?.warHorn?.();
    }
    const vol=Math.max(0,Math.min(1,(this.settings.volume??0.7)*(this.settings.uiVolume??1)));
    const canSpeak=!this.muted&&this.settings.unitVoices!==false&&vol>0.02&&typeof window!=='undefined'&&typeof SpeechSynthesisUtterance==='function'&&window.speechSynthesis;
    if(canSpeak){
      try{
        const utt=new SpeechSynthesisUtterance(item.text);
        const cast=this._selectVoice(item.speaker,item.faction);
        if(cast.voice)utt.voice=cast.voice;
        utt.pitch=cast.pitch;
        utt.rate=cast.rate;
        utt.volume=vol;
        const done=()=>{
          clearTimeout(fallbackTimer);
          this.speaking=false;
          if(this.queue.length)setTimeout(()=>this._playNext(),260);
        };
        const estMs=Math.max(2600,Math.min(12000,item.text.length*72+1200));
        const fallbackTimer=setTimeout(done,estMs+1800);
        utt.onend=done;
        utt.onerror=done;
        window.speechSynthesis.speak(utt);
        return;
      }catch{}
    }
    const holdMs=Math.max(3000,Math.min(7500,item.text.length*55+1200));
    const timer=setTimeout(()=>{
      this.speaking=false;
      if(this.queue.length)this._playNext();
    },holdMs);
    timer?.unref?.();
  }

  _showBanner(item){
    if(!this.banner)return;
    clearTimeout(this.bannerTimer);
    const hex=item.color!=null?`#${Number(item.color).toString(16).padStart(6,'0')}`:(item.role==='enemy'?'#e07566':item.role==='player'?'#e6c064':'#66cec0');
    const tag=item.role==='enemy'?'ENEMY WARLORD':item.role==='player'?'YOUR COMMAND':'ALLIED COMMAND';
    this.banner.dataset.role=item.role;
    this.banner.innerHTML=`<span class="wc-pip" style="background:${hex}"></span>
      <div class="wc-body">
        <div class="wc-meta"><strong>${esc(item.speaker)}</strong><span class="wc-tag">${tag}</span><span class="wc-wave" aria-hidden="true"><i></i><i></i><i></i></span></div>
        <p>“${esc(item.text)}”</p>
      </div>`;
    this.banner.classList.remove('hidden');
    const dur=Math.max(4600,Math.min(10500,item.text.length*68+1800));
    this.bannerTimer=setTimeout(()=>this.banner?.classList.add('hidden'),dur);
  }

  _recordLog(item){
    this.history.push(item);
    if(this.history.length>14)this.history.shift();
    if(!this.logEl)return;
    const row=document.createElement('div');
    row.className=`wc-log-item ${item.role}`;
    row.innerHTML=`<strong>${esc(item.speaker)}:</strong> <span>${esc(item.text)}</span>`;
    this.logEl.append(row);
    while(this.logEl.children.length>10)this.logEl.firstChild.remove();
    this.logEl.scrollTop=this.logEl.scrollHeight;
  }

  _ready(key,simTime,interval){
    if(simTime-(this.cooldowns[key]??-999)<interval)return false;
    this.cooldowns[key]=simTime;
    return true;
  }

  /** Dynamic reactive warlord & ally voice lines fired directly from live simulation events! */
  onSimEvent(sim,event){
    if(!sim||sim.options?.mode==='tutorial'||sim.options?.mode==='sandbox')return;
    const t=sim.time||0;
    if(event.type==='hero-skill'&&event.owner===0&&this._ready('hero-skill-voice',t,18)){
      const cries={
        rally:'Sound the royal horn! Hold the line and strike as one!',
        shieldwall:'Raise your shields! Nothing breaks the Aegis Bastion!',
        solarblessing:'May the golden dawn mend our wounds and speed our blades!',
        arrowstorm:'Sunfire volley! Darken the sky above them!',
        bloodlust:'Blood and thunder! Ride them down, warband!',
        whirlwind:'Clear the path—feel the storm of axes!',
        earthshaker:'By hammer and rune—shatter their stones to dust!',
        anvilfortify:'Stand like iron! Repair the engines and hold fast!',
        dragonbanner:'Raise the Dragon Banner! Unleash imperial thunder!',
        fireworkbarrage:'Light the black powder! Rain imperial fire upon them!',
      };
      const line=cries[event.skillId]||`${event.skillName}! Forward!`;
      this.speak({speaker:event.heroTitle||'Hero General',role:'player',faction:sim.players?.[0]?.faction||'alder',color:sim.players?.[0]?.color,text:line,horn:true});
      return;
    }
    if(event.type==='wonder-started'){
      const pl=sim.players?.[event.owner];
      if(event.owner===0){
        this.speak({speaker:pl?.name||'Royal Architect',role:'player',faction:pl?.faction||'alder',color:pl?.color,text:`Our builders have laid the foundations of the ${event.wonderName}! Defend it until completion!`,urgent:true,horn:true});
      }else if(sim.hostile(0,event.owner)){
        this.speak({speaker:pl?.name||'Rival Warlord',role:'enemy',faction:pl?.faction||'raven',color:pl?.color,text:`Behold! We are raising the ${event.wonderName}! Try to stop us before its power awakens!`,urgent:true,horn:true});
      }
      return;
    }
    if(event.type==='wonder-completed'){
      const pl=sim.players?.[event.owner];
      if(event.owner===0){
        this.speak({speaker:pl?.name||'High Herald',role:'player',faction:pl?.faction||'alder',color:pl?.color,text:`The ${event.wonderName} stands complete! Its eternal blessing now empowers our entire kingdom!`,urgent:true,horn:true});
      }else if(sim.hostile(0,event.owner)){
        this.speak({speaker:pl?.name||'Rival Warlord',role:'enemy',faction:pl?.faction||'raven',color:pl?.color,text:`The ${event.wonderName} is complete! Feel the wrath of our golden age!`,urgent:true,horn:true});
      }
      return;
    }
    if(event.type==='campaign-event'&&event.text){
      const speaker=event.speaker||'Frontier Command';
      const role=event.role||(event.enemy?'enemy':'ally');
      const matched=sim.players?.find(p=>p.name&&speaker.toLowerCase().includes(p.name.split(' ')[0].toLowerCase()));
      this.speak({speaker,role,faction:matched?.faction||'alder',color:matched?.color,text:event.text,horn:role==='enemy'});
      return;
    }
    if(event.type==='campaign-stage'&&event.text){
      this.speak({speaker:event.speaker||'Allied Command',role:'ally',faction:sim.players?.[0]?.faction||'alder',text:event.text});
      return;
    }
    if(event.type==='ally-support'&&sim.allied(0,event.ally)&&this._ready('ally-support',t,35)){
      const ally=sim.players[event.owner];
      if(ally)this.speak({speaker:ally.name||'Allied Commander',role:'ally',faction:ally.faction,color:ally.color,text:pick(ALLY_LINES.reinforcing,t+event.owner)});
      return;
    }
    if(event.type==='kingdom-defeated'&&event.owner>0&&sim.hostile(0,event.owner)){
      const defeated=sim.players[event.owner];
      this.speak({speaker:event.name||defeated?.name||'Rival Warlord',role:'enemy',faction:defeated?.faction||'raven',color:defeated?.color,text:pick(ENEMY_LINES.defeated,t+event.owner),urgent:true,horn:true});
      return;
    }
    if(event.type==='alarm'&&this._ready('enemy-taunt-alarm',t,42)){
      const enemies=this.activeEnemies(sim);
      if(enemies.length){
        const lead=enemies[Math.floor(t)%enemies.length];
        this.speak({speaker:lead.player.name||FACTIONS[lead.player.faction]?.name||'Rival Warlord',role:'enemy',faction:lead.player.faction,color:lead.player.color,text:pick(ENEMY_LINES.attackingPlayer,t+lead.owner)});
      }
      return;
    }
    if(event.type==='death'&&event.entity?.kind==='building'&&['towncenter','keep','tower','barracks','workshop','gate'].includes(event.entity.type)){
      const owner=event.entity.owner;
      if(owner>0&&sim.hostile(0,owner)&&this._ready(`enemy-loss:${owner}`,t,28)){
        const foe=sim.players[owner];
        if(foe&&!foe.defeated){
          this.speak({speaker:foe.name||FACTIONS[foe.faction]?.name||'Rival Warlord',role:'enemy',faction:foe.faction,color:foe.color,text:pick(ENEMY_LINES.losingStructure,t+event.entity.id)});
        }
      }else if(owner>0&&sim.allied(0,owner)&&this._ready(`ally-fire:${owner}`,t,40)){
        const ally=sim.players[owner];
        if(ally&&!ally.defeated){
          this.speak({speaker:ally.name||'Allied Commander',role:'ally',faction:ally.faction,color:ally.color,text:ALLY_LINES.allyUnderFire[0],horn:true});
        }
      }
    }
  }

  /** Fires opening warlord greeting in Skirmish / Custom Battle matches without duplicating scripted Act V intros. */
  announceOpening(sim){
    if(!sim||sim.options?.mode==='tutorial'||sim.options?.mode==='sandbox'||sim.mission)return;
    const enemies=this.activeEnemies(sim);
    if(enemies.length){
      const lead=enemies[0];
      const name=lead.player.name||`${FACTIONS[lead.player.faction]?.name||'Rival'} Warlord`;
      this.speak({speaker:name,role:'enemy',faction:lead.player.faction,color:lead.player.color,text:pick(ENEMY_LINES.opening,sim.options?.seed||1),horn:true});
    }
    const allies=this.activeAllies(sim);
    if(allies.length){
      const a=allies[0];
      this.speak({speaker:a.player.name||'Allied Commander',role:'ally',faction:a.player.faction,color:a.player.color,text:pick(ALLY_LINES.opening,sim.options?.seed||2)});
    }
  }

  /** Interactive Player -> Allied Commander tactical orders (actually steers Allied AI armies & tributes!). */
  issueAllyOrder(sim,view,kind){
    const allies=this.activeAllies(sim);
    if(!allies.length)return {ok:false,message:'No active AI ally is in this battle.'};
    const lead=allies[0];
    const p0=sim.owned(0,'building','towncenter')[0]||sim.owned(0,'unit')[0]||{x:0,z:0};

    if(kind==='supplies'){
      if(!this._ready('ally-supplies',sim.time||0,45)){
        return {ok:false,message:'Your ally needs a moment before sending another supply wagon.'};
      }
      let sent=false;
      for(const {player,owner} of allies){
        const gifts=[['food',150],['wood',150],['gold',100],['stone',100]];
        for(const [res,amt] of gifts){
          if((player.resources?.[res]||0)>=amt+120){
            player.resources[res]-=amt;
            sim.players[0].resources[res]=(sim.players[0].resources[res]||0)+amt;
            sent=true;
          }
        }
        if(sent){
          this.speak({speaker:player.name||'Allied Commander',role:'ally',faction:player.faction,color:player.color,text:pick(ALLY_LINES.suppliesSent,sim.time||0),urgent:true});
          return {ok:true,message:`${player.name||'Your ally'} sent war supplies to your treasury!`};
        }
      }
      this.speak({speaker:lead.player.name||'Allied Commander',role:'ally',faction:lead.player.faction,color:lead.player.color,text:ALLY_LINES.suppliesLow[0],urgent:true});
      return {ok:false,message:'Your ally does not have spare resources to send yet.'};
    }

    let target={x:0,z:0};
    if(kind==='attack'){
      const enemies=this.activeEnemies(sim);
      const enemyTargets=enemies.flatMap(e=>sim.owned(e.owner,'building').filter(b=>b.hp>0&&!['wall','gate','farm'].includes(b.type))).sort((a,b)=>((a.type==='towncenter'||a.type==='keep')?-18:0)+Math.hypot(a.x-p0.x,a.z-p0.z)-(((b.type==='towncenter'||b.type==='keep')?-18:0)+Math.hypot(b.x-p0.x,b.z-p0.z)));
      target=enemyTargets[0]||(enemies[0]?.player?.start)||{x:view?.target?.x||0,z:view?.target?.z||0};
    }else if(kind==='defend'){
      const spans=bridgeSpans(sim.options?.map);
      if(sim.options?.map==='ironfall')target={x:-24,z:0};
      else if(spans.length)target={x:spans[0].center,z:spanZ(spans[0])};
      else target={x:view?.target?.x||p0.x,z:view?.target?.z||p0.z};
    }else{
      target={x:p0.x,z:p0.z};
    }

    sim.allyDirective={type:kind,x:target.x,z:target.z,until:(sim.time||0)+75};
    // Immediately command idle/ready allied fighters so the player sees instant responsive teamwork!
    for(const {owner} of allies){
      const fighters=sim.owned(owner,'unit').filter(u=>u.hp>0&&!u.embarked&&!['villager','fishingboat','cart','king','scout','monk'].includes(u.type));
      if(fighters.length){
        const slice=kind==='help'?fighters.slice(0,Math.max(4,Math.ceil(fighters.length*.6))):fighters.slice(0,Math.max(5,Math.ceil(fighters.length*.75)));
        sim.command(slice.map(u=>u.id),{type:'attackmove',x:target.x,z:target.z});
      }
    }
    this.onPing(target.x,target.z,kind==='attack'?'danger':'info',kind==='attack'?'Allied assault target':kind==='defend'?'Hold the pass':'Allied relief point');
    const lines=ALLY_LINES[kind]||ALLY_LINES.attack;
    this.speak({speaker:lead.player.name||'Allied Commander',role:'ally',faction:lead.player.faction,color:lead.player.color,text:pick(lines,sim.time||0),urgent:true,horn:kind==='attack'});
    return {ok:true,target};
  }

  /** Interactive Player -> Enemy Warlord Taunts (provokes real voiced AI replies & aggressive counter-attacks!). */
  sendEnemyTaunt(sim,kind){
    const enemies=this.activeEnemies(sim);
    if(!enemies.length)return {ok:false,message:'No rival warlords remain on the field.'};
    const lead=enemies[Math.floor((sim.time||0)/3)%enemies.length];
    const name=lead.player.name||`${FACTIONS[lead.player.faction]?.name||'Rival'} Warlord`;
    const losing=sim.owned(lead.owner,'building').length<6;
    let reply;
    if(kind==='bringit'){
      sim.provokedWarlord={owner:lead.owner,until:(sim.time||0)+65};
      reply=pick(ENEMY_LINES.tauntBringIt,sim.time||0);
    }else if(kind==='burn'){
      reply=pick(ENEMY_LINES.tauntBurn,sim.time||0);
    }else{
      reply=pick(losing?ENEMY_LINES.tauntSurrenderWeak:ENEMY_LINES.tauntSurrenderStrong,sim.time||0);
    }
    this.speak({speaker:name,role:'enemy',faction:lead.player.faction,color:lead.player.color,text:reply,urgent:true,horn:kind==='bringit'});
    return {ok:true,speaker:name,reply};
  }
}
