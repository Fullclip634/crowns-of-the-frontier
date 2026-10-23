import {resourceIcon} from './resource-bar.js';

const types=['food','wood','gold','stone'];
const esc=value=>String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const amount=value=>Math.max(0,Math.floor(Number(value)||0)).toLocaleString('en-US');

export function allianceMarkup(sim,selected){
  const allies=sim.players.map((player,i)=>({player,i})).filter(({i})=>i!==0&&sim.allied(0,i));
  return `<div class="eyebrow">SHARED STRENGTH</div><h2>Alliance resources.</h2><p class="modal-intro">Compare supplies and send an amount to an ally. Gifts arrive immediately.</p>
    <div class="alliance-own"><strong>Your treasury</strong><div class="alliance-balances">${types.map(type=>`<span class="alliance-balance ${type}">${resourceIcon(type)}<span>${type.toUpperCase()}</span><b data-alliance-owner="0" data-alliance-resource="${type}">${amount(sim.players[0].resources[type])}</b></span>`).join('')}</div></div>
    <div class="alliance-list" aria-label="Allied kingdoms">${allies.map(({player,i})=>`<button type="button" class="alliance-kingdom ${i===selected?'selected':''}" data-donation-target="${i}" ${player.defeated?'disabled':''} aria-pressed="${i===selected}" title="${player.defeated?'Eliminated':`Choose ${esc(player.name)} for a resource gift`}"><span class="alliance-kingdom-heading"><i style="background:#${player.color.toString(16).padStart(6,'0')}"></i><strong>${esc(player.name)}</strong><small>${player.defeated?'Eliminated':player.controller==='human'?'Human ally':'AI ally'}</small></span><span class="alliance-balances">${types.map(type=>`<span class="alliance-balance ${type}">${resourceIcon(type)}<span>${type.toUpperCase()}</span><b data-alliance-owner="${i}" data-alliance-resource="${type}">${amount(player.resources[type])}</b></span>`).join('')}</span></button>`).join('')}</div>
    <div class="alliance-send"><strong>Send to <span id="alliance-recipient">${esc(sim.players[selected]?.name||'an ally')}</span></strong><div class="alliance-form"><label>Resource<select id="donation-resource">${types.map(type=>`<option value="${type}">${type[0].toUpperCase()+type.slice(1)}</option>`).join('')}</select></label><label>Amount<input id="donation-amount" type="number" inputmode="numeric" min="1" max="1000000" step="1" value="100"></label><button type="button" class="primary" data-action="send-donation">Send gift</button></div><p id="alliance-feedback" role="status"></p></div>`;
}

export function refreshAllianceModal(root,sim,selected){
  if(!root)return;
  for(const element of root.querySelectorAll('[data-alliance-resource]')){
    const owner=Number(element.dataset.allianceOwner),type=element.dataset.allianceResource;
    element.textContent=amount(sim.players[owner]?.resources[type]);
  }
  for(const button of root.querySelectorAll('[data-donation-target]')){
    const active=Number(button.dataset.donationTarget)===selected;
    button.classList.toggle('selected',active);button.setAttribute('aria-pressed',String(active));
    button.disabled=!!sim.players[Number(button.dataset.donationTarget)]?.defeated;
  }
  const recipient=root.querySelector('#alliance-recipient');if(recipient)recipient.textContent=sim.players[selected]?.name||'an ally';
  const type=root.querySelector('#donation-resource')?.value,value=Number(root.querySelector('#donation-amount')?.value),send=root.querySelector('[data-action=send-donation]');
  if(send)send.disabled=!!sim.players[0]?.defeated||!sim.players[selected]||sim.players[selected].defeated||!Number.isSafeInteger(value)||value<1||value>1000000||!types.includes(type)||sim.players[0].resources[type]<value;
}
