import {AGES,FACTIONS,formatTime} from './data.js';
import {AGE_ROMAN,kingdomScore} from './hud-macro.js';
import {uiIcon} from './ui-icons.js';

const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const SAMPLE_INTERVAL=15;
const MAX_SAMPLES=120;

/**
 * Ultra-lightweight match progression sampler (records every 15s of sim time,
 * capped at 120 points = ~2 KB RAM, strictly read-only on Simulation).
 */
export class MatchTimeline {
  constructor(){
    this.samples=[];
    this.lastSampleTime=-SAMPLE_INTERVAL;
  }

  reset(){
    this.samples.length=0;
    this.lastSampleTime=-SAMPLE_INTERVAL;
  }

  sample(sim,force=false){
    if(!sim?.players?.length)return false;
    const t=sim.time||0;
    if(!force&&t-this.lastSampleTime<SAMPLE_INTERVAL)return false;
    this.lastSampleTime=t;
    const scores=[],econ=[],army=[];
    const units=typeof sim.candidatesFor==='function'?sim.candidatesFor('unit'):(sim.entities||[]);
    const armyByOwner=new Array(sim.players.length).fill(0);
    for(const u of units){
      if(u.hp>0&&u.owner>=0&&u.owner<armyByOwner.length&&!u.embarked&&u.type!=='villager'&&u.type!=='fishingboat'&&u.type!=='cart')armyByOwner[u.owner]++;
    }
    for(let i=0;i<sim.players.length;i++){
      const p=sim.players[i],res=p?.resources||{};
      scores.push(p?.defeated?0:kingdomScore(sim,i));
      const gathered=p?.battleStats?.gathered??(i===0?(sim.stats?.gathered||0):0);
      econ.push(Math.round((res.food||0)+(res.wood||0)+(res.gold||0)+(res.stone||0)+gathered));
      army.push(armyByOwner[i]||0);
    }
    this.samples.push({time:Math.round(t),scores,econ,army});
    if(this.samples.length>MAX_SAMPLES){
      // Decimate evenly if a marathon match exceeds 30 minutes
      this.samples=this.samples.filter((_,idx)=>idx%2===0||idx===this.samples.length-1);
    }
    return true;
  }

  snapshot(){return this.samples;}
}

/** Lightweight SVG line chart for the Post-Game Timeline tab (zero external chart libs). */
export function timelineSvgMarkup(samples,players,metric='scores'){
  if(!samples?.length||!players?.length){
    return '<p class="summary-empty">Play longer than a few seconds to chart empire progression over time.</p>';
  }
  const pts=samples.length===1?[samples[0],{...samples[0],time:Math.max(15,samples[0].time+15)}]:samples;
  const W=560,H=200,padL=46,padR=16,padT=16,padB=28;
  const plotW=W-padL-padR,plotH=H-padT-padB;
  const maxTime=Math.max(15,pts.at(-1).time);
  let maxVal=10;
  for(const s of pts){
    const arr=s[metric]||[];
    for(const v of arr)if(v>maxVal)maxVal=v;
  }
  maxVal=Math.ceil(maxVal/10)*10;

  const gridLines=[0,.25,.5,.75,1].map(f=>{
    const y=(padT+plotH*(1-f)).toFixed(1);
    const val=Math.round(maxVal*f);
    return `<line x1="${padL}" y1="${y}" x2="${W-padR}" y2="${y}" stroke="rgba(224,185,110,.14)" stroke-width="1"/><text x="${padL-6}" y="${Number(y)+3}" text-anchor="end" fill="#9fb296" font-size="9">${val}</text>`;
  }).join('');

  const xTicks=[0,.33,.66,1].map(f=>{
    const x=(padL+plotW*f).toFixed(1);
    return `<text x="${x}" y="${H-8}" text-anchor="middle" fill="#9fb296" font-size="9">${formatTime(maxTime*f)}</text>`;
  }).join('');

  const lines=players.map((p,i)=>{
    const color='#'+(p.color??FACTIONS[p.faction]?.color??0xc5ae76).toString(16).padStart(6,'0');
    const coords=pts.map(s=>{
      const x=padL+(s.time/maxTime)*plotW;
      const v=s[metric]?.[i]??0;
      const y=padT+plotH*(1-Math.min(1,v/maxVal));
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    }).join(' ');
    return `<polyline fill="none" stroke="${color}" stroke-width="${i===0?2.6:2}" stroke-linejoin="round" stroke-linecap="round" points="${coords}"/>`;
  }).join('');

  const legend=players.map((p,i)=>{
    const color='#'+(p.color??FACTIONS[p.faction]?.color??0xc5ae76).toString(16).padStart(6,'0');
    const name=p.name||FACTIONS[p.faction]?.name||`Kingdom ${i+1}`;
    return `<span><i style="background:${color}"></i>${esc(name)}</span>`;
  }).join('');

  return `<div class="timeline-chart-wrap">
    <svg class="timeline-svg" viewBox="0 0 ${W} ${H}" role="img" aria-label="Match progression timeline chart">
      <rect x="${padL}" y="${padT}" width="${plotW}" height="${plotH}" fill="rgba(8,14,11,.65)" stroke="rgba(224,185,110,.22)"/>
      ${gridLines}
      ${xTicks}
      ${lines}
    </svg>
    <div class="timeline-legend">${legend}</div>
  </div>`;
}

/** Unified Post-Game Match Summary for ALL game modes with Overview / Timeline / Economy tabs & Explore Battlefield. */
export function matchSummaryMarkup(sim,result,{samples=[],tab='overview',metric='scores',nextChapterId=null,hasReplay=false}={}){
  const isCampaign=!!sim.mission;
  const spectator=!!result.spectator;
  const players=sim.players||[];
  const rows=players.map((p,i)=>({
    owner:i,
    name:p.name||FACTIONS[p.faction]?.name||`Kingdom ${i+1}`,
    factionName:FACTIONS[p.faction]?.name||'',
    color:'#'+(p.color??FACTIONS[p.faction]?.color??0xc5ae76).toString(16).padStart(6,'0'),
    team:p.team??(i===0?1:2),
    ageRoman:AGE_ROMAN[Math.max(0,Math.min(3,p.age||0))],
    ageName:AGES[Math.max(0,Math.min(3,p.age||0))],
    score:kingdomScore(sim,i),
    kills:p.battleStats?.kills??(i===0?(sim.stats?.kills||0):0),
    lost:p.battleStats?.lost??(i===0?(sim.stats?.lost||0):0),
    gathered:Math.round(p.battleStats?.gathered??(i===0?(sim.stats?.gathered||0):0)),
    defeated:!!p.defeated,
    rel:spectator?'ai':i===0?'you':sim.allied?.(0,i)?'ally':'enemy',
  })).sort((a,b)=>Number(a.defeated)-Number(b.defeated)||b.score-a.score);

  const kd=sim.stats?.lost>0?(sim.stats.kills/sim.stats.lost).toFixed(2):String(sim.stats?.kills||0);
  const crestIcon=spectator?'AI':uiIcon(result.won?'trophy':'shield');
  const eyebrow=spectator?'BATTLE OBSERVED':result.won?'A LEGACY WRITTEN':'THE CROWN HAS FALLEN';
  const heading=spectator?'Battle complete.':result.won?'Victory.':'Defeat.';
  const intro=spectator?`${result.reason} ${result.winningTeam===null?'No team':'Team '+result.winningTeam+' wins'}.`:result.reason;

  const tabsHtml=[
    {id:'overview',label:'Overview'},
    {id:'timeline',label:'Timeline'},
    {id:'details',label:'Economy & Military'},
  ].map(t=>`<button type="button" class="summary-tab ${t.id===tab?'active':''}" data-summary-tab="${t.id}" aria-pressed="${t.id===tab}">${t.label}</button>`).join('');

  let bodyHtml='';
  if(tab==='overview'){
    bodyHtml=`<div class="result-stats">
      <div><strong>${formatTime(sim.time)}</strong><span>TIME IN BATTLE</span></div>
      <div><strong>${sim.stats?.kills||0}</strong><span>ENEMIES DEFEATED</span></div>
      <div><strong>${Math.round(sim.stats?.gathered||0)}</strong><span>RESOURCES GATHERED</span></div>
      <div><strong>${sim.stats?.built||0}</strong><span>BUILDINGS RAISED</span></div>
    </div>
    <div class="summary-standings">
      ${rows.map(r=>`<div class="standing-row ${r.rel} ${r.defeated?'defeated':''}"><i class="standing-dot" style="background:${r.color}"></i><div class="standing-name"><strong>${esc(r.name)}</strong><small>Team ${r.team} · ${esc(r.ageName)}</small></div><span class="standing-age">${r.ageRoman}</span><strong class="standing-score">${r.score}</strong></div>`).join('')}
    </div>`;
  }else if(tab==='timeline'){
    bodyHtml=`<div class="timeline-metrics">
      <button type="button" class="${metric==='scores'?'active':''}" data-summary-metric="scores">Kingdom Score</button>
      <button type="button" class="${metric==='army'?'active':''}" data-summary-metric="army">Army Strength</button>
      <button type="button" class="${metric==='econ'?'active':''}" data-summary-metric="econ">Economy</button>
    </div>${timelineSvgMarkup(samples,players,metric)}`;
  }else{
    const res=sim.players?.[0]?.resources||{};
    bodyHtml=`<div class="summary-detail-grid">
      <article><h4>MILITARY RECORD</h4><dl>
        <div><dt>Enemies defeated</dt><dd>${sim.stats?.kills||0}</dd></div>
        <div><dt>Troops lost</dt><dd>${sim.stats?.lost||0}</dd></div>
        <div><dt>Kill / Loss ratio</dt><dd>${kd}</dd></div>
        <div><dt>Units trained</dt><dd>${sim.stats?.trained||0}</dd></div>
      </dl></article>
      <article><h4>ECONOMY & EMPIRE</h4><dl>
        <div><dt>Total gathered</dt><dd>${Math.round(sim.stats?.gathered||0)}</dd></div>
        <div><dt>Buildings raised</dt><dd>${sim.stats?.built||0}</dd></div>
        <div><dt>Final Age</dt><dd>${AGES[sim.players?.[0]?.age||0]}</dd></div>
        <div><dt>Treasury left</dt><dd>${Math.floor(res.food||0)}F · ${Math.floor(res.wood||0)}W · ${Math.floor(res.gold||0)}G</dd></div>
      </dl></article>
    </div>`;
  }

  return `<div class="summary-header">
      <div class="result-crest">${crestIcon}</div>
      <div>
        <div class="eyebrow">${eyebrow}</div>
        <h2>${heading}</h2>
        <p class="modal-intro">${esc(intro)}</p>
      </div>
    </div>
    ${sim.campaignState?.finished?`<p class="campaign-medal">${uiIcon('trophy')} ${sim.campaignState.optional?'Bonus Crown & Chapter Completed':'Chapter Completed'}</p>`:''}
    <nav class="summary-tabs" role="tablist" aria-label="Match summary sections">${tabsHtml}</nav>
    <div class="summary-body">${bodyHtml}</div>
    <div class="result-actions">
      ${nextChapterId?`<button class="primary" data-atlas-open="${nextChapterId}">Next chapter on map ${uiIcon('chevron-right')}</button>`:''}
      ${isCampaign&&!nextChapterId?`<button class="primary" data-atlas-open="${sim.options.mode}">Campaign world map</button>`:''}
      ${sim.campaignCheckpoint&&!result.won?`<button class="primary" data-action="checkpoint">Restore checkpoint</button>`:''}
      <button class="${isCampaign&&result.won?'secondary':'primary'}" data-action="restart">${spectator?'Watch another battle':'Play again'}</button>
      ${hasReplay?`<button class="secondary" data-action="watch-last-replay">${uiIcon('play')} Watch replay</button>`:''}
      <button class="secondary" data-action="explore-battlefield">${uiIcon('map')} Explore battlefield</button>
      <button class="secondary" data-action="menu">Main menu</button>
    </div>`;
}
