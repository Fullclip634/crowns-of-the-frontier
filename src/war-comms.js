import {FACTIONS} from './data.js';
import {bridgeSpans,spanZ} from './bridge-layout.js';
import {uiVectorIcon} from './ui-icons.js';
import {commanderPortraitSvg} from './commander-portraits.js';

const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

const FEMALE_SPEAKERS=/queen|lady|syra|maera|sera|sela|ilya|isolde|vaelen/i;
const HEAVY_SPEAKERS=/draven|krag|korr|malrik|borin|arak|skald|overlord|siege|forge/i;
const FIERCE_SPEAKERS=/vex|varek|kael|raider|khan/i;
const HERALD_SPEAKERS=/herald|architect|command/i;
const TTS_FEMALE_VOICES=/female|google us english\b|zira|hazel|susan|sonia|aria|ava|emma|jenny|libby|samantha|victoria|karen|moira|tessa|fiona|kate|serena|claire|natasha|clara|michelle|ana\b|amy\b|joanna|salli|kimberly|kendra/i;
const TTS_MALE_VOICES=/\bmale\b|david|george|ryan|brian|andrew|guy|daniel|james|mark|richard|steffan|arthur|chris|christopher|eric|roger|tony|davis|jason|brandon|oliver|thomas|william|liam|connor|mitchell|alex|fred|matthew|joey|justin/i;

function commsCueForMessage(item){
  if(item.cue)return item.cue;
  const text=(item.text||'').toLowerCase();
  if(item.role==='herald'){
    if(/complete|victory|achieved|stands complete/.test(text))return 'comms-objective';
    return 'comms-alert';
  }
  if(item.role==='enemy')return 'comms-enemy';
  if(item.role==='player'){
    if(/foundations|wonder|builders/.test(text))return 'comms-ally';
    return 'comms-ally-attack';
  }
  if(/under fire|gates|help|backup|relief|hang on/.test(text))return 'comms-ally-help';
  if(/hold|shield|pass|chokepoint|fortify/.test(text))return 'comms-ally-hold';
  if(/charge|attack|strike|march|assault/.test(text))return 'comms-ally-attack';
  if(/objective|complete|liberated|secured/.test(text))return 'comms-objective';
  return 'comms-ally';
}

const FEMALE_COMMS_CUES=Object.freeze({
  'comms-ally-attack':'comms-female-attack',
  'comms-ally-hold':'comms-female-hold',
  'comms-ally-help':'comms-female-help',
});

export function selectCommsCue(item={}){
  const cue=commsCueForMessage(item);
  return FEMALE_SPEAKERS.test(item.speaker||'')?(FEMALE_COMMS_CUES[cue]||'comms-female'):cue;
}

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

function resolveHornKind(horn,role){
  if(!horn)return null;
  if(typeof horn==='string')return horn;
  if(role==='enemy')return 'enemy';
  if(role==='ally')return 'ally';
  return 'royal';
}

export function warCommsMarkup(){
  return `<aside id="war-comms-banner" class="war-comms-banner hidden" role="status" aria-live="polite"></aside>
  <section id="war-comms-panel" class="war-comms-panel hidden" aria-label="War communications">
    <header class="war-comms-head">
      <div class="war-comms-title">${uiVectorIcon('message-square')}<strong>War Comms</strong></div>
      <div class="war-comms-head-tools">
        <button type="button" id="war-comms-mute" class="war-comms-icon-btn" data-action="comms-mute" aria-pressed="false" title="Mute or unmute spoken commander voices">${uiVectorIcon('volume-2')}<span>Voice On</span></button>
        <button type="button" class="war-comms-icon-btn" data-action="comms-toggle" aria-label="Close war comms">${uiVectorIcon('x')}</button>
      </div>
    </header>
    <div id="war-comms-ally-section" class="war-comms-section">
      <span class="war-comms-label">ALLY ORDERS</span>
      <div class="war-comms-grid">
        <button type="button" data-comms-ally="attack" title="Order allied armies to march and attack the enemy (Alt+1)">${uiVectorIcon('swords')}<span>Attack!</span></button>
        <button type="button" data-comms-ally="defend" title="Order allies to hold the narrow pass or bridgehead (Alt+2)">${uiVectorIcon('shield')}<span>Hold Pass</span></button>
        <button type="button" data-comms-ally="help" title="Call emergency allied relief to your base (Alt+3)">${uiVectorIcon('flag-triangle-right')}<span>Help Me!</span></button>
        <button type="button" data-comms-ally="supplies" title="Request war supplies from your ally (Alt+4)">${uiVectorIcon('gift')}<span>Supplies</span></button>
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
    this.voiceCache=new Map();
    this.queue=[];
    this.activeItem=null;
    this.speaking=false;
    this.bannerTimer=0;
    this.playTimer=0;
    this.nextTimer=0;
    this.watchdogTimer=0;
    this.cooldowns={};
    this.history=[];
    this._loadVoices();
    if(typeof window!=='undefined'&&window.speechSynthesis){
      window.speechSynthesis.addEventListener?.('voiceschanged',()=>{this.voiceCache.clear();this._loadVoices();});
    }
    this.audio?.setSpeechDirector?.(this);
    this.syncMuteUI();
  }

  _loadVoices(){
    if(typeof window==='undefined'||!window.speechSynthesis?.getVoices)return;
    const all=window.speechSynthesis.getVoices()||[];
    this.voices=all.filter(v=>/^en\b/i.test(v.lang||'')||!v.lang);
  }

  _selectVoice(speaker,faction='alder',role='ally'){
    const cacheKey=`${speaker||''}|${faction}|${role}`;
    if(this.voiceCache.has(cacheKey))return this.voiceCache.get(cacheKey);
    if(!this.voices.length)this._loadVoices();
    const female=FEMALE_SPEAKERS.test(speaker||'');
    const heavy=HEAVY_SPEAKERS.test(speaker||'')||faction==='iron';
    const fierce=FIERCE_SPEAKERS.test(speaker||'')||faction==='raven';
    const herald=role==='herald'||HERALD_SPEAKERS.test(speaker||'');
    const isFemaleVoice=v=>TTS_FEMALE_VOICES.test(v?.name||'');
    const isMaleVoice=v=>TTS_MALE_VOICES.test(v?.name||'')&&!isFemaleVoice(v);
    const score=v=>{
      let s=0;
      const name=(v.name||'').toLowerCase();
      if(/natural|neural|online/.test(name))s+=38;
      if(/google uk|microsoft (ryan|brian|andrew|george|sonia|aria|ava|emma|guy|david|zira|daniel|arthur|libby|mark|richard|steffan)/.test(name))s+=26;
      if(/en-gb/i.test(v.lang))s+=14;
      const looksFemale=isFemaleVoice(v);
      const looksMale=isMaleVoice(v);
      if(female){
        if(looksFemale)s+=55;
        else if(looksMale)s-=95;
      }else{
        if(looksMale)s+=55;
        else if(looksFemale)s-=95;
      }
      return s;
    };
    const ranked=[...this.voices].sort((a,b)=>score(b)-score(a));
    // Never leak a female voice into a male commander's pool (or vice versa) when matching voices exist.
    const genderClean=ranked.filter(v=>female?!isMaleVoice(v):!isFemaleVoice(v));
    const pool=genderClean.length?genderClean:ranked;
    const hash=[...(speaker||'')].reduce((n,c)=>((n*31)+c.charCodeAt(0))>>>0,0);
    const topPool=pool.slice(0,Math.min(3,pool.length));
    const voice=herald?(pool[0]||null):(topPool.length?topPool[hash%topPool.length]:null);
    const pitch=female?1.04:herald?0.86:heavy?0.74:fierce?0.84:faction==='sun'?0.94:0.88;
    const rate=herald?0.95:heavy?0.90:fierce?1.02:0.95;
    const cast={voice,pitch,rate};
    if(this.voices.length)this.voiceCache.set(cacheKey,cast);
    return cast;
  }

  syncMuteUI(){
    if(!this.muteBtn)return;
    this.muteBtn.setAttribute('aria-pressed',String(this.muted));
    this.muteBtn.classList.toggle('muted',this.muted);
    this.muteBtn.innerHTML=`${uiVectorIcon('volume-2')}<span>${this.muted?'Muted':'Voice On'}</span>`;
  }

  syncFromSettings(){
    this.muted=this.settings.voiceComms===false;
    if(this.muted)this.cancelSpeech();
    this.syncMuteUI();
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
    const canShow=Boolean(sim&&!sim.ended&&!sim.options?.spectator&&!sim.options?.multiplayer&&sim.options?.mode!=='tutorial'&&sim.options?.mode!=='sandbox');
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
    clearTimeout(this.playTimer);
    clearTimeout(this.nextTimer);
    clearTimeout(this.watchdogTimer);
    this.playTimer=0;this.nextTimer=0;this.watchdogTimer=0;
    this.speaking=false;
    this.activeItem=null;
    this.queue.length=0;
    this._setBannerSpeaking(false);
    this.audio?.stopCommsVoice?.();
    this.audio?.setCommsSpeaking?.(false);
    try{window.speechSynthesis?.cancel?.();}catch{}
  }

  hideBanner(){
    clearTimeout(this.bannerTimer);
    this._setBannerSpeaking(false);
    this.banner?.classList.add('hidden');
  }

  _setBannerSpeaking(active){
    if(!this.banner)return;
    this.banner.dataset.speaking=active?'true':'false';
  }

  /**
   * Priority-arbitrated voice & communication director:
   * priority 0 = Critical (Victory/Defeat/Wonder)
   * priority 1 = Urgent Alert (Under Attack Herald, Kingdom Defeated)
   * priority 2 = Interactive Tactical Comms (Ally Orders, Enemy Taunts, Ally SOS)
   * priority 3 = Narrative / Ambient Comms (Campaign Events, Hero Cries, Opening)
   */
  speak({speaker='Commander',role='ally',faction='alder',color=null,text='',cue=null,urgent=false,priority=null,horn=false,showBanner=true}){
    if(!text)return;
    const prio=Number.isFinite(priority)?priority:(urgent?1:3);
    const item={speaker,role,faction,color,text,cue,priority:prio,horn:resolveHornKind(horn,role),showBanner};

    // Deduplicate identical consecutive lines already active or queued.
    if(this.activeItem&&this.activeItem.text===text&&this.activeItem.role===role)return;
    if(this.queue.some(q=>q.text===text&&q.role===role))return;

    // Preempt ONLY when an urgent item has equal-or-higher priority than current speech!
    // This prevents ambient enemy taunts (priority 3) or interactive orders (priority 2) from
    // ever canceling an active Royal Herald "Under Attack" alert (priority 1), while allowing
    // consecutive player-triggered War Comms orders/taunts (priority 2) to respond crisply.
    const shouldPreempt=urgent&&this.speaking&&this.activeItem&&prio<=this.activeItem.priority;
    if(shouldPreempt){
      clearTimeout(this.playTimer);
      clearTimeout(this.nextTimer);
      clearTimeout(this.watchdogTimer);
      this.audio?.stopCommsVoice?.();
      try{window.speechSynthesis?.cancel?.();}catch{}
      this.audio?.setCommsSpeaking?.(false);
      // Keep higher-priority queued items, drop stale low-priority clutter.
      this.queue=this.queue.filter(q=>q.priority<=2);
      this.queue.unshift(item);
      this.speaking=false;
      this.activeItem=null;
      this._playNext();
      return;
    }

    // Priority-ordered insertion so urgent alerts always play next without clobbering active speech.
    let insertAt=this.queue.length;
    for(let i=0;i<this.queue.length;i++){
      if(prio<this.queue[i].priority){insertAt=i;break;}
    }
    this.queue.splice(insertAt,0,item);
    while(this.queue.length>4)this.queue.pop();

    if(!this.speaking)this._playNext();
  }

  _playNext(){
    clearTimeout(this.playTimer);
    clearTimeout(this.nextTimer);
    clearTimeout(this.watchdogTimer);
    const item=this.queue.shift();
    if(!item){
      this.speaking=false;
      this.activeItem=null;
      this._setBannerSpeaking(false);
      this.audio?.setCommsSpeaking?.(false);
      return;
    }
    this.speaking=true;
    this.activeItem=item;
    this._recordLog(item);
    if(item.showBanner!==false)this._showBanner(item);
    if(item.horn&&this.settings.warHorns!==false){
      this.audio?.warHorn?.(item.horn);
    }

    const voiceVol=this.settings.voiceVolume??1;
    const vol=Math.max(0,Math.min(1,(this.settings.volume??0.7)*voiceVol));
    const voiceEnabled=!this.muted&&this.settings.voiceComms!==false&&vol>0.02;
    const useBrowserTts=voiceEnabled&&this.settings.ttsNarration===true&&typeof window!=='undefined'&&typeof SpeechSynthesisUtterance==='function'&&window.speechSynthesis;

    const advance=(delayMs=280)=>{
      clearTimeout(this.playTimer);
      clearTimeout(this.watchdogTimer);
      this._setBannerSpeaking(false);
      this.audio?.setCommsSpeaking?.(false);
      this.speaking=false;
      this.activeItem=null;
      if(this.queue.length){
        this.nextTimer=setTimeout(()=>this._playNext(),delayMs);
        this.nextTimer?.unref?.();
      }
    };

    // Play a recorded response while the banner carries the full message.
    if(voiceEnabled&&!useBrowserTts){
      const cue=selectCommsCue(item);
      const delaySec=item.role==='herald'?0.34:item.horn?0.24:0.03;
      const played=this.audio?.playCommsVoice?.(cue,{
        delaySec,
        onEnded:()=>{
          this._setBannerSpeaking(false);
          this.audio?.setCommsSpeaking?.(false);
        },
      });
      if(played?.played){
        this._setBannerSpeaking(true);
        this.audio?.setCommsSpeaking?.(true);
        this.watchdogTimer=setTimeout(()=>{
          this._setBannerSpeaking(false);
          this.audio?.setCommsSpeaking?.(false);
        },Math.max(900,(played.durationMs||1200)+120));
        this.watchdogTimer?.unref?.();
        const holdMs=Math.max(played.durationMs+400,Math.min(5200,item.text.length*38+1100));
        this.playTimer=setTimeout(()=>advance(220),holdMs);
        this.playTimer?.unref?.();
        return;
      }
    }

    if(useBrowserTts){
      try{
        const utt=new SpeechSynthesisUtterance(item.text);
        const cast=this._selectVoice(item.speaker,item.faction,item.role);
        if(cast.voice)utt.voice=cast.voice;
        utt.lang=cast.voice?.lang||'en-US';
        utt.pitch=cast.pitch;
        utt.rate=cast.rate;
        utt.volume=vol;
        let finished=false;
        let started=false;
        const finish=(gap=280)=>{
          if(finished)return;
          finished=true;
          advance(gap);
        };
        const estMs=Math.max(2400,Math.min(11500,item.text.length*68+1100));
        this.playTimer=setTimeout(()=>finish(220),estMs+1600);
        this.playTimer?.unref?.();
        // Watchdog: if Chrome blocks speechSynthesis outside a click gesture, never leave
        // the speaking waveform faking audio or freeze the queue for 13 seconds.
        this.watchdogTimer=setTimeout(()=>{
          if(started||finished)return;
          try{window.speechSynthesis?.cancel?.();}catch{}
          this._setBannerSpeaking(false);
          this.audio?.setCommsSpeaking?.(false);
          clearTimeout(this.playTimer);
          const readHold=Math.max(2200,Math.min(5400,item.text.length*44+900));
          this.playTimer=setTimeout(()=>finish(220),readHold);
          this.playTimer?.unref?.();
        },260);
        this.watchdogTimer?.unref?.();
        utt.onstart=()=>{
          started=true;
          clearTimeout(this.watchdogTimer);
          this._setBannerSpeaking(true);
          this.audio?.setCommsSpeaking?.(true);
        };
        utt.onend=()=>finish(280);
        utt.onerror=()=>finish(200);
        this.audio?.setCommsSpeaking?.(true);
        window.speechSynthesis.speak(utt);
        return;
      }catch{}
    }

    this._setBannerSpeaking(false);
    const holdMs=Math.max(2200,Math.min(5200,item.text.length*42+900));
    this.playTimer=setTimeout(()=>advance(220),holdMs);
    this.playTimer?.unref?.();
  }

  _showBanner(item){
    if(!this.banner)return;
    clearTimeout(this.bannerTimer);
    // Never overlap the campaign commander dialogue box with a second banner!
    this.root?.querySelector('#commander-dialogue')?.classList.add('hidden');
    const hex=item.color!=null?`#${Number(item.color).toString(16).padStart(6,'0')}`:(item.role==='enemy'?'#e07566':item.role==='herald'||item.role==='player'?'#e6c064':'#66cec0');
    const tag=item.role==='enemy'?'ENEMY WARLORD':item.role==='herald'?'ROYAL HERALD':item.role==='player'?'YOUR COMMAND':'ALLIED COMMAND';
    this.banner.dataset.role=item.role;
    this.banner.dataset.speaking='false';
    this.banner.innerHTML=`<span class="wc-pip" style="background:${hex}"></span>
      <span class="wc-portrait" aria-hidden="true">${commanderPortraitSvg(item.speaker,40,item.role)}</span>
      <div class="wc-body">
        <div class="wc-meta"><strong>${esc(item.speaker)}</strong><span class="wc-tag">${tag}</span><span class="wc-wave" aria-hidden="true"><i></i><i></i><i></i><i></i></span></div>
        <p>“${esc(item.text)}”</p>
      </div>`;
    this.banner.classList.remove('hidden');
    const dur=Math.max(4600,Math.min(10500,item.text.length*68+1800));
    this.bannerTimer=setTimeout(()=>{this._setBannerSpeaking(false);this.banner?.classList.add('hidden');},dur);
    this.bannerTimer?.unref?.();
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

  /** Dynamic reactive warlord, ally & herald voice lines fired from live simulation events. */
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
      this.speak({speaker:event.heroTitle||'Hero General',role:'player',faction:sim.players?.[0]?.faction||'alder',color:sim.players?.[0]?.color,text:line,priority:2,horn:'royal'});
      return;
    }
    if(event.type==='wonder-started'){
      const pl=sim.players?.[event.owner];
      if(event.owner===0){
        this.speak({speaker:pl?.name||'Royal Architect',role:'player',faction:pl?.faction||'alder',color:pl?.color,text:`Our builders have laid the foundations of the ${event.wonderName}! Defend it until completion!`,priority:1,urgent:true,horn:'ally'});
      }else if(sim.hostile(0,event.owner)){
        this.speak({speaker:pl?.name||'Rival Warlord',role:'enemy',faction:pl?.faction||'raven',color:pl?.color,text:`Behold! We are raising the ${event.wonderName}! Try to stop us before its power awakens!`,priority:1,urgent:true,horn:'enemy'});
      }
      return;
    }
    if(event.type==='wonder-completed'){
      const pl=sim.players?.[event.owner];
      if(event.owner===0){
        this.speak({speaker:pl?.name||'Royal Herald',role:'herald',faction:pl?.faction||'alder',color:pl?.color,text:`The ${event.wonderName} stands complete! Its eternal blessing now empowers our entire kingdom!`,cue:'comms-objective',priority:0,urgent:true,horn:false});
      }else if(sim.hostile(0,event.owner)){
        this.speak({speaker:pl?.name||'Rival Warlord',role:'enemy',faction:pl?.faction||'raven',color:pl?.color,text:`The ${event.wonderName} is complete! Feel the wrath of our golden age!`,cue:'comms-enemy',priority:0,urgent:true,horn:'enemy'});
      }
      return;
    }
    if(event.type==='campaign-event'&&event.text){
      const speaker=event.speaker||'Frontier Command';
      const role=event.role||(event.enemy?'enemy':'ally');
      const matched=sim.players?.find(p=>p.name&&speaker.toLowerCase().includes(p.name.split(' ')[0].toLowerCase()));
      this.speak({speaker,role,faction:matched?.faction||'alder',color:matched?.color,text:event.text,priority:2,horn:role==='enemy'?'enemy':'ally',showBanner:false});
      return;
    }
    if(event.type==='campaign-stage'&&event.text){
      this.speak({speaker:event.speaker||'Allied Command',role:'ally',faction:sim.players?.[0]?.faction||'alder',text:event.text,cue:'comms-objective',priority:2,horn:false,showBanner:false});
      return;
    }
    if(event.type==='campaign-sidequest'&&event.title){
      this.speak({speaker:event.speaker||'Frontier Command',role:'ally',faction:sim.players?.[0]?.faction||'alder',text:`Side objective complete: ${event.title}. ${event.rewardText||''}`.trim(),cue:'comms-objective',priority:3,horn:'ally',showBanner:false});
      return;
    }
    if(event.type==='ally-support'&&sim.allied(0,event.ally)&&this._ready('ally-support',t,35)){
      const ally=sim.players[event.owner];
      if(ally)this.speak({speaker:ally.name||'Allied Commander',role:'ally',faction:ally.faction,color:ally.color,text:pick(ALLY_LINES.reinforcing,t+event.owner),cue:'comms-ally',priority:2,horn:'ally'});
      return;
    }
    if(event.type==='kingdom-defeated'&&event.owner>0&&sim.hostile(0,event.owner)){
      const defeated=sim.players[event.owner];
      this.speak({speaker:event.name||defeated?.name||'Rival Warlord',role:'enemy',faction:defeated?.faction||'raven',color:defeated?.color,text:pick(ENEMY_LINES.defeated,t+event.owner),cue:'comms-objective',priority:1,urgent:true,horn:'enemy'});
      return;
    }
    if(event.type==='alarm'&&this._ready('enemy-taunt-alarm',t,42)){
      const enemies=this.activeEnemies(sim);
      if(enemies.length){
        const lead=enemies[Math.floor(t)%enemies.length];
        // Priority 3 with horn:false so this taunt queues cleanly AFTER the Royal Herald alarm
        // instead of overlapping or canceling "Your kingdom is under attack!".
        this.speak({speaker:lead.player.name||FACTIONS[lead.player.faction]?.name||'Rival Warlord',role:'enemy',faction:lead.player.faction,color:lead.player.color,text:pick(ENEMY_LINES.attackingPlayer,t+lead.owner),priority:3,horn:false});
      }
      return;
    }
    if(event.type==='death'&&event.entity?.kind==='building'&&['towncenter','keep','tower','barracks','workshop','gate'].includes(event.entity.type)){
      const owner=event.entity.owner;
      if(owner>0&&sim.hostile(0,owner)&&this._ready(`enemy-loss:${owner}`,t,28)){
        const foe=sim.players[owner];
        if(foe&&!foe.defeated){
          this.speak({speaker:foe.name||FACTIONS[foe.faction]?.name||'Rival Warlord',role:'enemy',faction:foe.faction,color:foe.color,text:pick(ENEMY_LINES.losingStructure,t+event.entity.id),priority:3,horn:'enemy'});
        }
      }else if(owner>0&&sim.allied(0,owner)&&this._ready(`ally-fire:${owner}`,t,40)){
        const ally=sim.players[owner];
        if(ally&&!ally.defeated){
          this.speak({speaker:ally.name||'Allied Commander',role:'ally',faction:ally.faction,color:ally.color,text:ALLY_LINES.allyUnderFire[0],priority:2,horn:'ally'});
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
      this.speak({speaker:name,role:'enemy',faction:lead.player.faction,color:lead.player.color,text:pick(ENEMY_LINES.opening,sim.options?.seed||1),priority:3,horn:'enemy'});
    }
    const allies=this.activeAllies(sim);
    if(allies.length){
      const a=allies[0];
      this.speak({speaker:a.player.name||'Allied Commander',role:'ally',faction:a.player.faction,color:a.player.color,text:pick(ALLY_LINES.opening,sim.options?.seed||2),priority:3,horn:'ally'});
    }
  }

  /** Interactive Player -> Allied Commander tactical orders (actually steers Allied AI armies & tributes!). */
  issueAllyOrder(sim,view,kind){
    if(sim?.options?.multiplayer)return {ok:false,message:'Use Battle Chat to coordinate with commanders in multiplayer.'};
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
          this.audio?.play?.('tribute');
          this.speak({speaker:player.name||'Allied Commander',role:'ally',faction:player.faction,color:player.color,text:pick(ALLY_LINES.suppliesSent,sim.time||0),priority:2,urgent:true,horn:'ally'});
          return {ok:true,message:`${player.name||'Your ally'} sent war supplies to your treasury!`};
        }
      }
      this.speak({speaker:lead.player.name||'Allied Commander',role:'ally',faction:lead.player.faction,color:lead.player.color,text:ALLY_LINES.suppliesLow[0],priority:2,urgent:true,horn:false});
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
    for(const {owner} of allies){
      const fighters=sim.owned(owner,'unit').filter(u=>u.hp>0&&!u.embarked&&!['villager','fishingboat','cart','king','scout','monk'].includes(u.type));
      if(fighters.length){
        const slice=kind==='help'?fighters.slice(0,Math.max(4,Math.ceil(fighters.length*.6))):fighters.slice(0,Math.max(5,Math.ceil(fighters.length*.75)));
        sim.command(slice.map(u=>u.id),{type:'attackmove',x:target.x,z:target.z});
      }
    }
    this.onPing(target.x,target.z,kind==='attack'?'danger':'info',kind==='attack'?'Allied assault target':kind==='defend'?'Hold the pass':'Allied relief point');
    const lines=ALLY_LINES[kind]||ALLY_LINES.attack;
    const cue=kind==='attack'?'comms-ally-attack':kind==='defend'?'comms-ally-hold':kind==='help'?'comms-ally-help':'comms-ally';
    this.speak({speaker:lead.player.name||'Allied Commander',role:'ally',faction:lead.player.faction,color:lead.player.color,text:pick(lines,sim.time||0),cue,priority:2,urgent:true,horn:'ally'});
    return {ok:true,target};
  }

  /** Interactive Player -> Enemy Warlord Taunts (provokes real voiced AI replies & aggressive counter-attacks!). */
  sendEnemyTaunt(sim,kind){
    if(sim?.options?.multiplayer)return {ok:false,message:'Use Battle Chat in multiplayer matches.'};
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
    this.speak({speaker:name,role:'enemy',faction:lead.player.faction,color:lead.player.color,text:reply,priority:2,urgent:true,horn:'enemy'});
    return {ok:true,speaker:name,reply};
  }
}
