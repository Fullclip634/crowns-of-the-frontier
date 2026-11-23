import {resourceAmount} from './ui-format.js';
import {uiIcon} from './ui-icons.js';

export function resourceIcon(type){return uiIcon(type);}

export function resourceBarMarkup(player,population,capacity,workers=null){
  const goods=['food','wood','gold','stone'].map(type=>{
    const amount=Math.floor(player.resources[type]);
    const assigned=workers?.[type]||0;
    const workerTip=workers?` · ${assigned} assigned`:'';
    return `<div class="resource" role="group" aria-label="${type}: ${amount}" title="${type}: ${amount}${workerTip}"><span class="resource-icon ${type}">${resourceIcon(type)}</span><small>${type.toUpperCase()}</small><strong>${resourceAmount(player.resources[type])}</strong><em class="worker-count${assigned?'':' is-zero'}" aria-hidden="true">${assigned||''}</em></div>`;
  }).join('');
  return goods+`<div class="resource population ${population>=capacity?'full-pop':''}" role="group" aria-label="Population: ${population} of ${capacity}" title="Population: ${population} of ${capacity}${population>=capacity?' · Build a House (+10 cap)':''}"><span class="resource-icon population-icon">${resourceIcon('population')}</span><small>POP</small><strong>${population}<i>/${capacity}</i></strong></div>`;
}

const liveBars=new WeakMap();
// Keep SVG instances and labels mounted. Updating amounts & worker counts must
// never recreate the complete resource strip on every HUD refresh.
export function updateResourceBar(root,player,population,capacity,workers=null){
  let state=liveBars.get(root);
  if(!state||root.firstElementChild!==state.first){
    root.innerHTML=resourceBarMarkup(player,population,capacity,workers);
    state={first:root.firstElementChild,groups:[...root.querySelectorAll('.resource')]};liveBars.set(root,state);
  }
  const types=['food','wood','gold','stone'];
  state.groups.forEach((group,index)=>{
    const isPopulation=index===4;
    const type=types[index];
    const assigned=!isPopulation&&workers?(workers[type]||0):0;
    const label=isPopulation?`Population: ${population} of ${capacity}`:`${type}: ${Math.floor(player.resources[type])}`;
    const tip=isPopulation?`${label}${population>=capacity?' · Build a House (+10 cap)':''}`:(workers?`${label} · ${assigned} assigned`:label);
    if(group.getAttribute('aria-label')!==label)group.setAttribute('aria-label',label);
    if(group.title!==tip)group.title=tip;
    const strong=group.querySelector('strong'),amount=String(isPopulation?population:resourceAmount(player.resources[type]));
    if(strong.firstChild.nodeValue!==amount)strong.firstChild.nodeValue=amount;
    if(isPopulation){
      const suffix='/'+capacity,cap=strong.querySelector('i');
      if(cap.textContent!==suffix)cap.textContent=suffix;
      group.classList.toggle('full-pop',population>=capacity);
    }else{
      const badge=group.querySelector('.worker-count');
      if(badge){
        const text=assigned?String(assigned):'';
        if(badge.textContent!==text)badge.textContent=text;
        badge.classList.toggle('is-zero',!assigned);
      }
    }
  });
}
