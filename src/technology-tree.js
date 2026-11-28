import {UI_ICONS as ICONS,uiIcon} from './ui-icons.js';
import {AGES,UNITS,BUILDINGS,TECHS,FACTIONS,AGE_COSTS,availableTo,costText} from './data.js';
import {WONDER_POWERS} from './heroes.js';

const AGE_ROMAN=['I','II','III','IV'];

export function technologyState(sim,type,kind,faction){
  const d=(kind==='unit'?UNITS:TECHS)[type];if(!availableTo(d,faction))return {status:'other civilization',tone:'locked',site:null};
  if(!sim||sim.players[0].faction!==faction)return {status:`${AGES[d.age]} · ${d.at.map(t=>BUILDINGS[t].name).join(' / ')}`,tone:'info',site:null};
  const player=sim.players[0],sites=sim.owned(0,'building').filter(b=>b.progress>=1&&d.at.includes(b.type));
  if(kind==='unit'&&d.hero&&sim.owned(0,'unit').some(u=>UNITS[u.type]?.hero))return {status:'Leading battlefield',tone:'done',site:null};
  if(kind==='tech'&&player.tech[type]>=d.max)return {status:'Completed',tone:'done',site:null};
  if(kind==='tech'&&sites.some(b=>b.queue.some(q=>q.kind==='tech'&&q.type===type)))return {status:'Research queued',tone:'active',site:null};
  if(player.age<d.age)return {status:`Requires ${AGES[d.age]}`,tone:'locked',site:null};
  if(kind==='tech'&&player.tech[type]>=Math.min(d.max,player.age+1))return {status:'Advance an age for the next level',tone:'locked',site:null};
  if(!sites.length)return {status:`Build ${d.at.map(t=>BUILDINGS[t].name).join(' / ')}`,tone:'need',site:null};
  const cost=kind==='unit'?sim.cost(d.cost,0,'unit',type):Object.fromEntries(Object.entries(d.cost).map(([r,n])=>[r,n*((player.tech[type]||0)+1)]));
  if(!sim.canAfford(cost,0))return {status:'More resources needed',tone:'need',site:null};
  if(kind==='unit'&&sim.population(0)+sim.reservedPopulation(0)>=sim.capacity(0))return {status:'More population capacity needed',tone:'need',site:null};
  const site=sites.filter(b=>b.queue.length<8).sort((a,b)=>a.queue.length-b.queue.length)[0];
  return site?{status:kind==='unit'?'Train':'Research',tone:'ready',site}:{status:'Queues full',tone:'need',site:null};
}

export function technologyTreeMarkup(sim,faction){
  const activeAge=sim&&sim.players[0]?.faction===faction?sim.players[0].age:-1;
  const groups=AGES.map((age,index)=>{
    const entries=[...Object.entries(UNITS).filter(([,d])=>d.at.length&&availableTo(d,faction)).map(([id,d])=>({id,d,kind:'unit'})),
      ...Object.entries(TECHS).filter(([,d])=>availableTo(d,faction)).map(([id,d])=>({id,d,kind:'tech'}))].filter(e=>e.d.age===index);
    const reached=activeAge>=index;
    return `<section class="tree-age ${reached?'reached':''}"><h3><span>${AGE_ROMAN[index]}</span>${age}</h3>${index>0?`<p class="tree-age-cost">Advance at town center<br>${costText(AGE_COSTS[index-1])}</p>`:'<p class="tree-age-cost">Your starting age</p>'}${entries.map(({id,d,kind})=>{
      const state=technologyState(sim,id,kind,faction),level=kind==='tech'&&sim?.players[0].faction===faction?(sim.players[0].tech[id]||0):0;
      const siegeFactor=kind==='unit'&&d.role==='siege'&&FACTIONS[faction]?.siegeCost?FACTIONS[faction].siegeCost:1;
      const cost=kind==='tech'?Object.fromEntries(Object.entries(d.cost).map(([r,n])=>[r,n*(Math.min(level,d.max-1)+1)])):(siegeFactor===1?d.cost:Object.fromEntries(Object.entries(d.cost).map(([r,n])=>[r,Math.ceil(n*siegeFactor)])));
      return `<article class="tree-card tone-${state.tone||'info'} ${d.faction?'signature':''}"><div><span>${ICONS[id]||uiIcon('age')}</span><strong>${d.name}</strong></div><small>${d.faction?'Civilization exclusive · ':''}${kind==='tech'?`Technology · ${level}/${d.max}`:'Unit'} · ${d.time}s</small><p>${d.desc}</p><div class="tree-prerequisite">${d.at.map(t=>BUILDINGS[t].name).join(' / ')}</div><div class="tree-cost">${costText(cost)}</div><button ${state.site?'':'disabled'} data-tree-${kind}="${id}" data-building="${state.site?.id||''}">${state.status}</button></article>`;
    }).join('')}</section>`;
  }).join('');
  const wp=WONDER_POWERS[faction];
  return `<h2>Technology tree</h2><p class="modal-intro">${FACTIONS[faction].name} · ${FACTIONS[faction].desc}</p>
  ${wp?`<div class="counter-strip" aria-label="Wonder Super-Power"><span>${ICONS.wonder||uiIcon('monument')} <b>World Wonder — ${wp.name}:</b> ${wp.desc}</span></div>`:''}
  <div class="counter-strip" aria-label="Unit counter triangle">
    <span>${ICONS.spearman} <b>Spearmen</b> → Cavalry</span>
    <span>${ICONS.knight} <b>Cavalry</b> → Archers</span>
    <span>${ICONS.archer} <b>Archers</b> → Spearmen</span>
    <span>${ICONS.skirmisher} <b>Skirmishers</b> → Archers</span>
    <span>${ICONS.catapult} <b>Siege</b> → Packed Armies &amp; Fortifications</span>
  </div>
  <nav class="tree-factions" aria-label="View a civilization">${Object.entries(FACTIONS).map(([id,f])=>`<button data-tree-faction="${id}" class="${id===faction?'active':''}">${f.name}</button>`).join('')}</nav><p class="tree-note">Unlocks progress from left to right. Train or research directly when your kingdom meets the requirements. Select another civilization to compare its choices.</p><div class="technology-tree">${groups}</div>`;
}
