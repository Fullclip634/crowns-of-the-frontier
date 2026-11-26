import {AGES,BUILDINGS,FACTIONS,TECHS,UNITS,costText} from './data.js';
import {wallBuildCost,wallDisplayName} from './fortified-walls.js';
import {UI_ICONS as ICONS,uiIcon} from './ui-icons.js';

const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export const AGE_ROMAN=Object.freeze(['I','II','III','IV']);

export const BUILD_CATEGORIES=Object.freeze([
  {id:'economy',label:'Economy',icon:'wheat',items:['house','farm','mill','camp','mine','market','dock']},
  {id:'military',label:'Military',icon:'swords',items:['barracks','range','stable','workshop','blacksmith','monastery']},
  {id:'defense',label:'Defense',icon:'shield',items:['wall','gate','tower','bombard','keep','towncenter','wonder']},
]);

/**
 * Count friendly villagers & fishing boats actively working each resource,
 * plus unembarked idle villagers and builders. Runs on the 300ms HUD tick.
 */
export function resourceWorkerCounts(sim,owner=0){
  const counts={food:0,wood:0,gold:0,stone:0,idle:0,building:0,total:0};
  if(!sim)return counts;
  const units=typeof sim.candidatesFor==='function'?sim.candidatesFor('unit'):(sim.entities||[]);
  for(const u of units){
    if(u.hp<=0||u.owner!==owner||u.embarked)continue;
    if(u.type==='fishingboat'){
      if(u.order?.type==='gather'||u.carry>0)counts.food++;
      continue;
    }
    if(u.type!=='villager')continue;
    counts.total++;
    const orderType=u.order?.type;
    if(!orderType){counts.idle++;continue;}
    if(orderType==='build'||orderType==='repair'){counts.building++;continue;}
    if(orderType==='gather'){
      const target=u.order.target?sim.get?.(u.order.target):null;
      const res=target?.type==='farm'?'food':(target?.kind==='resource'?target.type:(u.gatherType||u.carryType));
      if(res&&res in counts)counts[res]++;
      continue;
    }
    if(u.carry>0&&u.carryType in counts)counts[u.carryType]++;
  }
  return counts;
}

/** Check whether an Age advancement is currently researching at any owned Town Center. */
export function ageProgressState(sim,owner=0){
  if(!sim)return null;
  const player=sim.players?.[owner];
  if(!player||player.age>=3)return null;
  const buildings=typeof sim.candidatesFor==='function'?sim.candidatesFor('building'):(sim.entities||[]);
  for(const b of buildings){
    if(b.hp<=0||b.owner!==owner||b.type!=='towncenter'||!b.queue?.length)continue;
    const active=b.queue[0];
    if(active?.kind==='age'){
      const pct=Math.max(0,Math.min(100,Math.round((1-active.remaining/Math.max(1,active.total))*100)));
      return {active:true,nextAge:AGES[player.age+1]||'',roman:AGE_ROMAN[player.age+1]||'',percent:pct,remaining:Math.ceil(active.remaining),buildingId:b.id};
    }
  }
  return null;
}

/** Collect active front-of-queue training & research items across the entire empire. */
export function globalProductionItems(sim,owner=0,limit=8){
  if(!sim)return [];
  const items=[];
  const buildings=typeof sim.candidatesFor==='function'?sim.candidatesFor('building'):(sim.entities||[]);
  const player=sim.players?.[owner]||{age:0};
  for(const b of buildings){
    if(b.hp<=0||b.owner!==owner||b.progress<1||!b.queue?.length)continue;
    const q=b.queue[0];
    const total=Math.max(1,q.total||1);
    const percent=Math.max(0,Math.min(100,Math.round((1-(q.remaining||0)/total)*100)));
    const label=q.kind==='age'?(AGES[player.age+1]||'Next Age'):((UNITS[q.type]||TECHS[q.type])?.name||q.type);
    const icon=q.kind==='age'?uiIcon('age'):(ICONS[q.type]||uiIcon('age'));
    items.push({
      buildingId:b.id,
      kind:q.kind,
      type:q.type||'age',
      label,
      icon,
      remaining:Math.max(0,Math.ceil(q.remaining||0)),
      percent,
      queued:b.queue.length,
    });
    if(items.length>=limit)break;
  }
  return items;
}

export function globalQueueMarkup(items){
  if(!items?.length)return '';
  return items.map(item=>`<button class="gq-item ${item.kind==='age'?'gq-age':item.kind==='tech'?'gq-tech':''}" data-production-select="${item.buildingId}" title="${esc(item.label)} (${item.remaining}s) · Click to focus"><span class="gq-icon">${item.icon}</span><span class="gq-time">${item.remaining}s</span>${item.queued>1?`<b class="gq-badge">${item.queued}</b>`:''}<i class="gq-fill" style="transform:scaleX(${(item.percent/100).toFixed(3)})"></i></button>`).join('');
}

/** Compute balanced AoE-style live score for a kingdom (respects fair public metrics). */
export function kingdomScore(sim,owner){
  const player=sim?.players?.[owner];
  if(!player)return 0;
  if(sim?.options?.multiplayer&&Number.isFinite(player.publicScore))return player.publicScore;
  const res=player.resources||{};
  const econ=Math.floor(((res.food||0)+(res.wood||0)+(res.gold||0)+(res.stone||0))*.1)+(player.battleStats?.gathered||0)*.08;
  const tech=(player.age||0)*280+Object.values(player.tech||{}).reduce((s,v)=>s+(v||0)*95,0);
  const mil=(player.battleStats?.kills||0)*45;
  let assets=0;
  const units=typeof sim.candidatesFor==='function'?sim.candidatesFor('unit'):(sim.entities||[]);
  for(const u of units)if(u.hp>0&&u.owner===owner&&!u.embarked)assets+=u.type==='villager'?25:45;
  const buildings=typeof sim.candidatesFor==='function'?sim.candidatesFor('building'):(sim.entities||[]);
  for(const b of buildings)if(b.hp>0&&b.owner===owner&&b.progress>=1)assets+=b.type==='wall'?8:b.type==='farm'?15:b.type==='bombard'?115:b.type==='keep'?180:b.type==='wonder'?600:65;
  return Math.max(0,Math.round(econ+tech+mil+assets));
}

export function scoreboardMarkup(sim){
  if(!sim?.players?.length)return '';
  const rows=sim.players.map((p,i)=>({
    owner:i,
    name:p.name||FACTIONS[p.faction]?.name||`Kingdom ${i+1}`,
    color:'#'+(p.color??FACTIONS[p.faction]?.color??0xc5ae76).toString(16).padStart(6,'0'),
    team:p.team??(i===0?1:2),
    age:AGE_ROMAN[Math.max(0,Math.min(3,p.age||0))],
    score:kingdomScore(sim,i),
    defeated:!!p.defeated,
    rel:i===0?'you':sim.allied?.(0,i)?'ally':'enemy',
  })).sort((a,b)=>Number(a.defeated)-Number(b.defeated)||b.score-a.score||a.owner-b.owner);
  return `<div class="score-heading"><span>KINGDOM SCORES</span><button data-action="scoreboard" aria-label="Close scoreboard">${uiIcon('x')}</button></div><div class="score-rows">${rows.map(r=>`<div class="score-row ${r.rel} ${r.defeated?'defeated':''}"><i class="score-dot" style="background:${r.color}"></i><span class="score-name">${esc(r.name)}</span><span class="score-age" title="Age ${r.age}">${r.age}</span><strong class="score-val">${r.defeated?'—':r.score}</strong></div>`).join('')}</div>`;
}

/** Categorized Build Menu markup (Economy / Military / Defense) with desktop grid hotkey badges. */
export function categorizedBuildMarkup(sim,activeCategory='economy'){
  const age=sim?.players?.[0]?.age||0;
  const tab=BUILD_CATEGORIES.find(c=>c.id===activeCategory)||BUILD_CATEGORIES[0];
  const tabsHtml=BUILD_CATEGORIES.map(c=>`<button type="button" class="build-tab ${c.id===tab.id?'active':''}" data-build-tab="${c.id}" aria-pressed="${c.id===tab.id}">${uiIcon(c.icon)}<span>${c.label}</span></button>`).join('');
  const cards=tab.items.filter(id=>BUILDINGS[id]).map(id=>{
    const d=BUILDINGS[id];
    const label=wallDisplayName(sim,id,0);
    const cost=sim.cost(wallBuildCost(sim,0,id),0,'building');
    const locked=age<d.age;
    return `<button class="build-option ${locked?'locked':''}" data-build="${id}" ${locked?'disabled':''} title="${esc(d.desc)} · ${costText(cost)}"><span class="build-icon">${ICONS[id]}</span><strong>${esc(label)}</strong><small>${locked?AGES[d.age]:costText(cost)}</small></button>`;
  }).join('');
  return `<div class="floating-heading"><span>CONSTRUCTION</span><button data-action="cancel-build" aria-label="Close construction">${uiIcon('x')}</button></div><div class="build-tabs" role="tablist" aria-label="Building categories">${tabsHtml}</div><div class="build-grid">${cards}</div><p class="build-footnote">${tab.id==='defense'?'Walls: tap or drag a line, then choose Build wall. Gates snap directly onto existing walls.':'Choose open land to place. Hold Shift to place multiple buildings.'}</p>`;
}

/**
 * Multi-selection portrait card grid (AoE2:DE style) with individual mini HP bars.
 * Clicking a card focuses/selects that single unit; Shift-click removes it from the group.
 */
export function multiSelectCardsMarkup(ordered,maxVisible=18){
  if(!ordered||ordered.length<2)return '';
  const visible=ordered.slice(0,maxVisible);
  const extra=ordered.length-visible.length;
  const cards=visible.map(e=>{
    const ratio=Math.max(0,Math.min(1,(e.hp||0)/Math.max(1,e.maxHp||1)));
    const hpCls=ratio<=.35?'low':ratio<=.65?'mid':'';
    const name=(UNITS[e.type]||BUILDINGS[e.type])?.name||e.type;
    return `<button type="button" class="sel-card ${hpCls}" data-focus-entity="${e.id}" title="${esc(name)} (${Math.round(e.hp)}/${Math.round(e.maxHp)} HP) · Click to isolate, Shift-click to remove"><span class="sel-card-icon">${ICONS[e.type]||uiIcon('user-round')}</span><i class="sel-card-hp"><b style="width:${(ratio*100).toFixed(0)}%"></b></i></button>`;
  }).join('');
  return `<div class="selection-cards" aria-label="Selected entities">${cards}${extra>0?`<span class="sel-card-more" title="${extra} more selected">+${extra}</span>`:''}</div>`;
}
