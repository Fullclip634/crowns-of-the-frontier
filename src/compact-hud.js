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
  const compactObjectives=typeof matchMedia==='function'&&matchMedia('(pointer:coarse) and (max-height:520px) and (orientation:landscape), (pointer:coarse) and (max-width:600px) and (orientation:portrait)').matches;
  root.querySelector('#objectives')?.classList.toggle('objectives-expanded',!compactObjectives);
  closeCompactCommands(root);root.querySelector('#selection-panel').classList.remove('selection-expanded');root.querySelector('.map-panel').classList.remove('map-expanded');
  for(const button of root.querySelectorAll('[data-action=map-expand]')){button.setAttribute('aria-expanded','false');button.setAttribute('aria-label','Expand minimap');}
  root.querySelector('.camera-controls').classList.remove('options-open');root.querySelector('[data-action=camera-options]').setAttribute('aria-expanded','false');
}

// Size the scrollable panel from the actual HUD, including taller selections
// and expanded minimaps, without reading layout in the render loop.
export function watchObjectiveLayout(root){
  const panel=root.querySelector('#objectives'),hud=root.querySelector('.bottom-hud'),win=root.defaultView;
  const fit=()=>{if(!panel.getClientRects().length||!hud.getClientRects().length)return;const height=Math.max(44,Math.floor(hud.getBoundingClientRect().top-panel.getBoundingClientRect().top-12))+'px';if(panel.style.maxHeight!==height)panel.style.maxHeight=height;};
  const observer=win.ResizeObserver?new win.ResizeObserver(fit):null;observer?.observe(hud);win.addEventListener('resize',fit);fit();
  return ()=>{observer?.disconnect();win.removeEventListener('resize',fit);};
}

// Notifications sit below the actual wall toolbar, including wrapped text
// on small screens. Observe layout changes instead of measuring every frame.
export function watchPlacementLayout(root){
  const panel=root.querySelector('#placement-controls'),hud=root.querySelector('#hud'),win=root.defaultView;
  const fit=()=>{if(!panel.getClientRects().length)return;const bottom=Math.ceil(panel.getBoundingClientRect().bottom)+'px';if(hud.style.getPropertyValue('--wall-controls-bottom')!==bottom)hud.style.setProperty('--wall-controls-bottom',bottom);};
  const observer=win.ResizeObserver?new win.ResizeObserver(fit):null;observer?.observe(panel);win.addEventListener('resize',fit);fit();
  return ()=>{observer?.disconnect();win.removeEventListener('resize',fit);};
}
