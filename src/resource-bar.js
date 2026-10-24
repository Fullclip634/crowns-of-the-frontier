import {resourceAmount} from './ui-format.js';

import {uiIcon} from './ui-icons.js';

export function resourceIcon(type){return uiIcon(type);}
export function resourceBarMarkup(player,population,capacity){
  const goods=['food','wood','gold','stone'].map(type=>{
    const amount=Math.floor(player.resources[type]);
    return `<div class="resource" role="group" aria-label="${type}: ${amount}" title="${type}: ${amount}"><span class="resource-icon ${type}">${resourceIcon(type)}</span><small>${type.toUpperCase()}</small><strong>${resourceAmount(player.resources[type])}</strong></div>`;
  }).join('');
  return goods+`<div class="resource population ${population>=capacity?'full-pop':''}" role="group" aria-label="Population: ${population} of ${capacity}" title="Population: ${population} of ${capacity}"><span class="resource-icon population-icon">${resourceIcon('population')}</span><small>POP</small><strong>${population}<i>/${capacity}</i></strong></div>`;
}

const liveBars=new WeakMap();
// Keep SVG instances and labels mounted. Updating amounts must not recreate
// the complete resource strip on every HUD refresh.
export function updateResourceBar(root,player,population,capacity){
  let state=liveBars.get(root);
  if(!state||root.firstElementChild!==state.first){
    root.innerHTML=resourceBarMarkup(player,population,capacity);
    state={first:root.firstElementChild,groups:[...root.querySelectorAll('.resource')]};liveBars.set(root,state);
  }
  const types=['food','wood','gold','stone'];
  state.groups.forEach((group,index)=>{
    const isPopulation=index===4,label=isPopulation?`Population: ${population} of ${capacity}`:`${types[index]}: ${Math.floor(player.resources[types[index]])}`;
    if(group.getAttribute('aria-label')!==label){group.setAttribute('aria-label',label);group.title=label;}
    const strong=group.querySelector('strong'),amount=String(isPopulation?population:resourceAmount(player.resources[types[index]]));
    if(strong.firstChild.nodeValue!==amount)strong.firstChild.nodeValue=amount;
    if(isPopulation){const suffix='/'+capacity,cap=strong.querySelector('i');if(cap.textContent!==suffix)cap.textContent=suffix;group.classList.toggle('full-pop',population>=capacity);}
  });
}
