import {roomLobbyMarkup} from './custom-battle-ui.js';

// Readiness and participant updates must not replace a button under a finger,
// reset keyboard focus, or scroll the entire room dialog back to its heading.
export function refreshRoomLobby(root,room){
  if(root.querySelector('#room-code')?.textContent!==room.code)return false;
  const fragment=root.ownerDocument.createElement('template');fragment.innerHTML=roomLobbyMarkup(room);
  const next=fragment.content;
  for(const selector of ['.room-grid','.room-players','#lobby-slot']){
    const current=root.querySelector(selector),incoming=next.querySelector(selector);
    if(!!current!==!!incoming)return false;
    if(current&&current.innerHTML!==incoming.innerHTML)current.innerHTML=incoming.innerHTML;
  }
  for(const action of ['lan-ready','lan-start']){
    const current=root.querySelector(`[data-action="${action}"]`),incoming=next.querySelector(`[data-action="${action}"]`);
    if(!!current!==!!incoming)return false;
    if(!current)continue;
    current.disabled=incoming.disabled;
    if(current.innerHTML!==incoming.innerHTML)current.innerHTML=incoming.innerHTML;
    const pressed=incoming.getAttribute('aria-pressed');if(pressed!==null)current.setAttribute('aria-pressed',pressed);
  }
  return true;
}
