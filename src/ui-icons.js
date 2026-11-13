import manifest from './ui-art/icon-manifest.json' with {type:'json'};
const sprite=new URL('./ui-art/icons.svg',import.meta.url).href;
const available=new Set(manifest.icons);
export const ICON_MAP=Object.freeze({
  food:'wheat',wood:'logs',gold:'coins',stone:'mountain',pop:'users-round',population:'users-round',
  villager:'user-round',scout:'spyglass',spearman:'spear',archer:'bow-arrow',swordsman:'sword',knight:'chess-knight',ram:'siege-ram',catapult:'trebuchet',monk:'church',king:'crown',sentinel:'shield-half',marksman:'crossbow',outrider:'lance',cart:'shopping-cart',fishingboat:'fish',galley:'sailboat',warship:'ship',transport:'ship-cargo',
  towncenter:'landmark',house:'house',farm:'farm-plot',mill:'wind',camp:'trees',mine:'pickaxe',barracks:'swords',range:'crossbow',stable:'lance',workshop:'hammer',blacksmith:'anvil',market:'store',tower:'watchtower',keep:'castle',wall:'brick-wall',gate:'door-open',monastery:'church',wonder:'monument',dock:'anchor',
  economy:'coins',attack:'swords',armor:'shield',ranged:'bow-arrow',fortification:'brick-wall',fortifiedWall:'bastion',husbandry:'horseshoe',shieldDrill:'shield-check',caravanLedger:'book-open',raidingParties:'spear',seamanship:'ship-wheel',age:'crown',
  tutorial:'graduation-cap',skirmish:'swords',regicide:'crown',survival:'shield',dominion:'landmark',sandbox:'tent-tree',tides:'sailboat',custom:'users-round',campaign:'book-open',
});
export function uiIcon(name){
  const requested=ICON_MAP[name]||name,id=available.has(requested)?requested:'circle-help';
  return `<svg class="ui-icon" width="20" height="20" viewBox="0 0 ${id==='siege-ram'||id==='trebuchet'?'512 512':'24 24'}" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><use href="${sprite}#icon-${id}"></use></svg>`;
}
export const UI_ICONS=Object.freeze(Object.fromEntries(Object.keys(ICON_MAP).map(key=>[key,uiIcon(key)])));
