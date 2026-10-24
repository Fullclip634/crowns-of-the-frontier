import {GARRISONS,garrisonCount,garrisonArrows} from './garrison.js';
import {uiIcon} from './ui-icons.js';

export function shelterControls(sim,selection){
  if(!selection.length||selection.some(e=>e.owner!==0))return '';
  if(selection.every(e=>e.type==='villager'&&!e.embarked))return `<button class="secondary" data-action="seek-shelter" title="Enter the nearest town center, castle or watchtower with space">${uiIcon('castle')} Shelter</button>`;
  if(selection.length!==1)return '';
  const site=selection[0],definition=GARRISONS[site.type];if(!definition||site.progress<1)return '';
  const inside=garrisonCount(sim,site),incoming=sim.owned(0,'unit').filter(u=>u.order?.type==='garrison'&&u.order.target===site.id).length,arrows=garrisonArrows(sim,site);
  const bell=`<button data-town-bell="${site.id}" title="Call nearby villagers into this building. Sheltered villagers stop gathering and add defensive arrows."><span>${uiIcon('castle')}</span><strong>Shelter</strong><small>${inside}/${definition.capacity} inside${incoming?' · '+incoming+' coming':''}</small></button>`;
  return bell+(inside+incoming?`<button data-return-work="${site.id}" title="Release sheltered villagers and resume their previous work"><span>${uiIcon('undo-2')}</span><strong>Return to work</strong><small>+${arrows} defensive arrows</small></button>`:'');
}
