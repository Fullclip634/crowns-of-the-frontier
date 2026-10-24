import {uiIcon} from './ui-icons.js';
export function isCompactHUD(root){return !!root.defaultView?.matchMedia('(pointer:coarse) and (max-height:520px) and (orientation:landscape), (pointer:coarse) and (max-width:600px) and (orientation:portrait)').matches;}
function collapseObjectives(root){
  const panel=root.querySelector('#objectives');panel.classList.remove('objectives-expanded');const body=panel.querySelector('#objective-body');if(body)body.hidden=true;
  const toggle=panel.querySelector('.objective-toggle');if(toggle){toggle.setAttribute('aria-expanded','false');toggle.setAttribute('aria-label','Open battle objectives');toggle.title='Open objectives';toggle.innerHTML='Objectives <span class="objective-icon" aria-hidden="true">'+uiIcon('chevron-down')+'</span>';}
}
export function selectionDetailsMarkup(panel){
  const expanded=panel.classList.contains('selection-expanded');
  return `<button class="selection-details" data-action="selection-details" aria-expanded="${expanded}" aria-label="${expanded?'Collapse':'Expand'} selection options">${uiIcon(expanded?'x':'ellipsis')}<span>${expanded?'Close':'Options'}</span></button>`;
}

export function closeCompactCommands(root){
  root.querySelector('.command-panel').classList.remove('commands-expanded');
  const button=root.querySelector('[data-action=command-options]');button.setAttribute('aria-expanded','false');button.innerHTML=uiIcon('ellipsis')+'<span>More</span>';
}

export function toggleCompactCommands(root){
  const expanded=root.querySelector('.command-panel').classList.toggle('commands-expanded'),button=root.querySelector('[data-action=command-options]');
  if(expanded&&isCompactHUD(root)){closeSelectionDetails(root);collapseObjectives(root);}
  button.setAttribute('aria-expanded',String(expanded));button.innerHTML=uiIcon(expanded?'x':'ellipsis')+`<span>${expanded?'Close':'More'}</span>`;
}

export function toggleSelectionDetails(root){
  const panel=root.querySelector('#selection-panel'),expanded=panel.classList.toggle('selection-expanded'),button=panel.querySelector('.selection-details');
  if(expanded&&isCompactHUD(root)){closeCompactCommands(root);collapseObjectives(root);}
  button.setAttribute('aria-expanded',String(expanded));button.setAttribute('aria-label',`${expanded?'Collapse':'Expand'} selection options`);button.innerHTML=uiIcon(expanded?'x':'ellipsis')+`<span>${expanded?'Close':'Options'}</span>`;
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
  const panel=root.querySelector('#objectives'),hud=root.querySelector('.bottom-hud'),win=root.defaultView,camera=root.querySelector('.camera-controls'),blockers=[hud,root.querySelector('#selection-panel'),root.querySelector('.map-panel')].filter(Boolean);
  const fit=()=>{if(!panel.getClientRects().length||!hud.getClientRects().length)return;if(camera?.getClientRects().length){const top=Math.ceil(camera.getBoundingClientRect().bottom+8)+'px';if(panel.style.getPropertyValue('--objective-portrait-top')!==top)panel.style.setProperty('--objective-portrait-top',top);}const bottom=Math.min(...blockers.filter(node=>node.getClientRects().length).map(node=>node.getBoundingClientRect().top)),height=Math.max(44,Math.floor(bottom-panel.getBoundingClientRect().top-12))+'px';if(panel.style.maxHeight!==height)panel.style.maxHeight=height;};
  let pending=0;const schedule=()=>{if(!pending)pending=win.requestAnimationFrame(()=>{pending=0;fit();});};
  const observer=win.ResizeObserver?new win.ResizeObserver(schedule):null;for(const node of [panel,camera,...blockers].filter(Boolean))observer?.observe(node);win.addEventListener('resize',schedule);fit();
  return ()=>{observer?.disconnect();win.removeEventListener('resize',schedule);if(pending)win.cancelAnimationFrame(pending);};
}

// Notifications sit below the actual wall toolbar, including wrapped text
// on small screens. Observe layout changes instead of measuring every frame.
export function watchPlacementLayout(root){
  const panel=root.querySelector('#placement-controls'),hud=root.querySelector('#hud'),win=root.defaultView;
  const fit=()=>{if(!panel.getClientRects().length)return;const bottom=Math.ceil(panel.getBoundingClientRect().bottom)+'px';if(hud.style.getPropertyValue('--wall-controls-bottom')!==bottom)hud.style.setProperty('--wall-controls-bottom',bottom);};
  const observer=win.ResizeObserver?new win.ResizeObserver(fit):null;observer?.observe(panel);win.addEventListener('resize',fit);fit();
  return ()=>{observer?.disconnect();win.removeEventListener('resize',fit);};
}
