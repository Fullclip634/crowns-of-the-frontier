export function selectionDetailsMarkup(panel){
  const expanded=panel.classList.contains('selection-expanded');
  return `<button class="selection-details" data-action="selection-details" aria-expanded="${expanded}" aria-label="${expanded?'Collapse':'Expand'} selection options">${expanded?'×':'⋯'}<span>${expanded?'Close':'Options'}</span></button>`;
}

export function closeCompactCommands(root){
  root.querySelector('.command-panel').classList.remove('commands-expanded');
  const button=root.querySelector('[data-action=command-options]');button.setAttribute('aria-expanded','false');button.innerHTML='⋯<span>More</span>';
}

export function toggleCompactCommands(root){
  const expanded=root.querySelector('.command-panel').classList.toggle('commands-expanded'),button=root.querySelector('[data-action=command-options]');
  button.setAttribute('aria-expanded',String(expanded));button.innerHTML=expanded?'×<span>Close</span>':'⋯<span>More</span>';
}

export function toggleSelectionDetails(root){
  const panel=root.querySelector('#selection-panel'),expanded=panel.classList.toggle('selection-expanded'),button=panel.querySelector('.selection-details');
  button.setAttribute('aria-expanded',String(expanded));button.setAttribute('aria-label',`${expanded?'Collapse':'Expand'} selection options`);button.innerHTML=expanded?'×<span>Close</span>':'⋯<span>Options</span>';
}

export function closeSelectionDetails(root){
  const panel=root.querySelector('#selection-panel');
  if(panel.classList.contains('selection-expanded'))toggleSelectionDetails(root);
}

export function toggleMinimapSize(root){
  const expanded=root.querySelector('.map-panel').classList.toggle('map-expanded');
  for(const button of root.querySelectorAll('[data-action=map-expand]')){button.setAttribute('aria-expanded',String(expanded));button.setAttribute('aria-label',`${expanded?'Shrink':'Expand'} minimap`);}
}

export function resetCompactHud(root){
  closeCompactCommands(root);root.querySelector('#selection-panel').classList.remove('selection-expanded');root.querySelector('.map-panel').classList.remove('map-expanded');
  for(const button of root.querySelectorAll('[data-action=map-expand]')){button.setAttribute('aria-expanded','false');button.setAttribute('aria-label','Expand minimap');}
  root.querySelector('.camera-controls').classList.remove('options-open');root.querySelector('[data-action=camera-options]').setAttribute('aria-expanded','false');
}
