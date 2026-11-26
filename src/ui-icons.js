import manifest from './ui-art/icon-manifest.json' with {type:'json'};
const sprite=new URL('./ui-art/icons.svg',import.meta.url).href;
const available=new Set(manifest.icons);

export const ICON_MAP=Object.freeze({
  food:'wheat',wood:'logs',gold:'coins',stone:'mountain',pop:'users-round',population:'users-round',
  villager:'user-round',scout:'spyglass',spearman:'spear',archer:'bow-arrow',skirmisher:'spear',swordsman:'sword',knight:'chess-knight',ram:'siege-ram',catapult:'trebuchet',trebuchet:'trebuchet',monk:'church',king:'crown',sentinel:'shield-half',marksman:'crossbow',outrider:'lance',ironbreaker:'hammer',chukonu:'crossbow',firelancer:'lance',hero_alder:'crown',hero_sun:'crown',hero_raven:'crown',hero_iron:'crown',hero_jade:'crown',cart:'shopping-cart',fishingboat:'fish',galley:'sailboat',warship:'ship',transport:'ship-cargo',
  towncenter:'landmark',house:'house',farm:'farm-plot',mill:'wind',camp:'trees',mine:'pickaxe',barracks:'swords',range:'crossbow',stable:'lance',workshop:'hammer',blacksmith:'anvil',market:'store',tower:'watchtower',bombard:'bastion',keep:'castle',wall:'brick-wall',gate:'door-open',monastery:'church',wonder:'monument',dock:'anchor',
  economy:'coins',wheelbarrow:'shopping-cart',attack:'swords',armor:'shield',ranged:'bow-arrow',fortification:'brick-wall',fortifiedWall:'bastion',arrowslits:'watchtower',conscription:'shield-check',husbandry:'horseshoe',sanctuary:'church',shieldDrill:'shield-check',caravanLedger:'book-open',raidingParties:'spear',siegecraft:'anvil',imperialGunpowder:'sun',boilingOil:'bastion',fireArrows:'bow-arrow',seamanship:'ship-wheel',age:'crown',
  tutorial:'graduation-cap',skirmish:'swords',regicide:'crown',survival:'shield',dominion:'landmark',sandbox:'tent-tree',tides:'sailboat',koth:'crown',deathmatch:'swords',siege:'castle',custom:'users-round',campaign:'book-open',
});

// 8x8 packed full-color hand-painted medieval icon atlas (src/ui-art/medieval-icons-atlas.webp)
// Index -> [atlasIndex, rarityTier]
export const PAINTED_ICONS=Object.freeze({
  // Resources & Economy
  food:[0,'common'],wheat:[0,'common'],
  wood:[1,'common'],logs:[1,'common'],
  gold:[2,'common'],coins:[2,'common'],economy:[2,'uncommon'],
  stone:[3,'common'],mountain:[3,'common'],
  pop:[4,'common'],population:[4,'common'],'users-round':[4,'common'],
  // Core Units & Siege
  villager:[5,'common'],'user-round':[5,'common'],
  scout:[6,'uncommon'],spyglass:[6,'uncommon'],
  spearman:[7,'uncommon'],spear:[7,'uncommon'],skirmisher:[7,'uncommon'],
  archer:[8,'uncommon'],'bow-arrow':[8,'uncommon'],
  swordsman:[9,'uncommon'],sword:[9,'uncommon'],
  knight:[10,'rare'],'chess-knight':[10,'rare'],
  ram:[11,'rare'],'siege-ram':[11,'rare'],
  catapult:[12,'rare'],
  trebuchet:[13,'legendary'],
  monk:[14,'rare'],sanctuary:[14,'rare'],
  king:[15,'legendary'],age:[15,'legendary'],crown:[15,'legendary'],regicide:[15,'legendary'],koth:[15,'legendary'],
  // Civ Unique Troops, Hero Generals & Naval Fleet
  sentinel:[16,'epic'],'shield-half':[16,'epic'],
  marksman:[17,'epic'],crossbow:[17,'epic'],
  outrider:[18,'epic'],lance:[18,'epic'],raidingParties:[18,'rare'],
  ironbreaker:[19,'epic'],
  chukonu:[20,'epic'],
  firelancer:[21,'epic'],
  hero_alder:[22,'legendary'],
  hero_sun:[23,'legendary'],
  hero_raven:[24,'legendary'],
  hero_iron:[25,'legendary'],
  hero_jade:[26,'legendary'],
  cart:[27,'common'],'shopping-cart':[27,'common'],wheelbarrow:[27,'rare'],
  fishingboat:[28,'common'],fish:[28,'common'],
  galley:[29,'rare'],sailboat:[29,'rare'],tides:[29,'rare'],
  warship:[30,'rare'],ship:[30,'rare'],
  transport:[31,'rare'],'ship-cargo':[31,'rare'],
  // Buildings
  towncenter:[32,'uncommon'],landmark:[32,'uncommon'],dominion:[32,'rare'],
  house:[33,'common'],
  farm:[34,'common'],'farm-plot':[34,'common'],
  mill:[35,'common'],
  camp:[36,'common'],trees:[36,'common'],
  mine:[37,'common'],pickaxe:[37,'common'],
  barracks:[38,'uncommon'],
  range:[39,'uncommon'],
  stable:[40,'uncommon'],
  workshop:[41,'rare'],
  blacksmith:[42,'rare'],anvil:[42,'rare'],
  market:[43,'uncommon'],store:[43,'uncommon'],
  tower:[44,'rare'],watchtower:[44,'rare'],arrowslits:[44,'epic'],
  bombard:[54,'legendary'],
  keep:[45,'epic'],castle:[45,'epic'],siege:[45,'epic'],
  wall:[46,'common'],'brick-wall':[46,'common'],
  gate:[47,'common'],
  monastery:[48,'epic'],church:[48,'epic'],
  wonder:[49,'legendary'],monument:[49,'legendary'],
  dock:[50,'uncommon'],anchor:[50,'uncommon'],
  // Technologies, Commands & Game Modes
  swords:[51,'uncommon'],attack:[51,'uncommon'],skirmish:[51,'uncommon'],deathmatch:[51,'epic'],
  shield:[52,'uncommon'],armor:[52,'uncommon'],survival:[52,'rare'],
  fireArrows:[53,'epic'],ranged:[53,'uncommon'],
  bastion:[54,'epic'],fortification:[54,'rare'],fortifiedWall:[54,'epic'],
  husbandry:[55,'rare'],horseshoe:[55,'rare'],
  shieldDrill:[56,'rare'],'shield-check':[56,'rare'],conscription:[56,'epic'],
  'book-open':[57,'uncommon'],caravanLedger:[57,'rare'],campaign:[57,'legendary'],tutorial:[57,'uncommon'],'graduation-cap':[57,'uncommon'],
  boilingOil:[58,'epic'],
  imperialGunpowder:[59,'legendary'],
  seamanship:[60,'rare'],'ship-wheel':[60,'rare'],
  hammer:[61,'uncommon'],siegecraft:[61,'rare'],
  trophy:[62,'legendary'],
  map:[63,'uncommon'],sandbox:[63,'uncommon'],custom:[63,'rare'],'flag-triangle-right':[63,'uncommon'],
});

export function uiVectorIcon(name){
  const requested=ICON_MAP[name]||name,id=available.has(requested)?requested:'circle-help';
  return `<svg class="ui-icon" width="20" height="20" viewBox="0 0 ${id==='siege-ram'||id==='trebuchet'?'512 512':'24 24'}" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><use href="${sprite}#icon-${id}"></use></svg>`;
}
export function uiIcon(name){
  const svg=uiVectorIcon(name);
  const painted=PAINTED_ICONS[name];
  if(!painted)return svg;
  const [idx,tier]=painted;
  const x=((idx%8)/7*100).toFixed(3),y=(Math.floor(idx/8)/7*100).toFixed(3);
  return `<bdi class="ui-icon ui-icon-painted ui-tier-${tier}" style="--pi-x:${x}%;--pi-y:${y}%" aria-hidden="true">${svg.replace('class="ui-icon"','class="ui-icon-fallback"')}</bdi>`;
}
export const UI_ICONS=Object.freeze(Object.fromEntries(Object.keys(ICON_MAP).map(key=>[key,uiIcon(key)])));
