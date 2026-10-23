import {resourceAmount} from './ui-format.js';

const paths={
  food:'<path d="M6 17V7m0 3L3 7m3 6-3-3m3 0 3-3m-3 6 3-3M6 6c-1.4-.7-1.4-2.4 0-3 1.4.6 1.4 2.3 0 3Zm7 11V6m0 4-3-3m3 6-3-3m3 0 3-3m-3 6 3-3m-3-5c-1.4-.7-1.4-2.4 0-3 1.4.6 1.4 2.3 0 3ZM2 18h16"/>',
  wood:'<path d="M3 7h11l3 3-3 3H3l-2-3 2-3Zm0 0 2 3-2 3m11-6-2 3 2 3M4 14h11l3 2-3 2H4l-2-2 2-2Zm0 0 2 2-2 2m9-4-2 2 2 2"/>',
  gold:'<path d="m2 14 3-5 4 1 3 5-2 3H4l-2-4Zm7-5 3-6 4 1 3 7-3 4h-5L9 9Zm4-2 2 1m-9 5 2 1m5-2 2-1"/>',
  stone:'<path d="m2 15 3-6 5-1 4 4-2 6H5l-3-3Zm9-6 3-6 4 2 1 8-5 3M5 9l3 4m6-8 2 4"/>',
  population:'<circle cx="10" cy="5" r="2"/><path d="M5 17v-4c0-3 2-4 5-4s5 1 5 4v4H5Zm-4 1v-3c0-2 1-3 3-3m15 6v-3c0-2-1-3-3-3"/>',
};
export function resourceIcon(type){return `<svg viewBox="0 0 20 20" width="20" height="20" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">${paths[type]}</svg>`;}
export function resourceBarMarkup(player,population,capacity){
  const goods=['food','wood','gold','stone'].map(type=>{
    const amount=Math.floor(player.resources[type]);
    return `<div class="resource" role="group" aria-label="${type}: ${amount}" title="${type}: ${amount}"><span class="resource-icon ${type}">${resourceIcon(type)}</span><small>${type.toUpperCase()}</small><strong>${resourceAmount(player.resources[type])}</strong></div>`;
  }).join('');
  return goods+`<div class="resource population ${population>=capacity?'full-pop':''}" role="group" aria-label="Population: ${population} of ${capacity}" title="Population: ${population} of ${capacity}"><span class="resource-icon population-icon">${resourceIcon('population')}</span><small>POP</small><strong>${population}<i>/${capacity}</i></strong></div>`;
}
