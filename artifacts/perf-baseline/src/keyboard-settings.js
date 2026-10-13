import {CONTROL_ACTIONS,DEFAULT_BINDINGS,readBindings,bindingErrors,normalizeKey,keyLabel} from './controls.js';
const escape=value=>String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function settingsBindings(root){return Object.fromEntries([...root.querySelectorAll('[data-keybind]')].map(input=>[input.dataset.keybind,input.dataset.key]));}
export function appendKeyboardSettings(root,bindings){
  const panel=document.createElement('section');panel.className='keyboard-settings';
  panel.innerHTML=`<h3>Keyboard controls</h3><p>Choose a control, then press its new key. Escape cancels capture. Numbers 1–9 remain control groups. Arrow keys pan unless assigned to another control.</p><div class="keybind-grid">${CONTROL_ACTIONS.map(a=>`<label>${a.label}<input readonly data-keybind="${a.id}" data-key="${escape(bindings[a.id])}" value="${escape(keyLabel(bindings[a.id]))}" aria-label="${a.label} key" autocomplete="off"></label>`).join('')}</div><p class="binding-feedback" role="status" aria-live="polite">Your controls will be saved when you apply settings.</p><button type="button" class="secondary" data-controls-reset>Restore default controls</button>`;
  root.querySelector('[data-action="apply-settings"]').before(panel);
  const feedback=()=>{const errors=bindingErrors(settingsBindings(root));panel.querySelector('.binding-feedback').textContent=errors.length?errors.join(' '):'All controls have distinct keys. Apply settings to save.';panel.querySelector('.binding-feedback').classList.toggle('binding-error',!!errors.length);return !errors.length;};
  panel.addEventListener('keydown',event=>{const input=event.target.closest('[data-keybind]');if(!input||event.key==='Tab')return;event.preventDefault();event.stopPropagation();if(event.key==='Escape'){input.blur();return;}
    if(event.ctrlKey||event.altKey||event.metaKey){panel.querySelector('.binding-feedback').textContent='Choose a key without Ctrl, Alt, or Command.';return;}
    input.dataset.key=normalizeKey(event.key);input.value=keyLabel(input.dataset.key);feedback();
  });
  panel.querySelector('[data-controls-reset]').addEventListener('click',()=>{for(const input of panel.querySelectorAll('[data-keybind]')){input.dataset.key=DEFAULT_BINDINGS[input.dataset.keybind];input.value=keyLabel(input.dataset.key);}feedback();});
  return panel;
}
export function activeControlsMarkup(bindings){return `<div class="active-controls">${CONTROL_ACTIONS.map(a=>`<span>${a.label}<kbd>${escape(keyLabel(readBindings(bindings)[a.id]))}</kbd></span>`).join('')}</div>`;}
