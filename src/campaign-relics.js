/**
 * Track 1 Campaign Depth: Unlockable Crown Relics (Warband Perks),
 * Handcrafted Mid-Mission Side Quests with instant tactical rewards,
 * and Named Act Boss Citadel profiles.
 * Zero extra per-frame overhead (relics apply once on init; side quests check inside the 0.5s campaign loop).
 */
import {UNITS} from './data.js';
const completed=(s,type)=>s.owned(0,'building',type).filter(e=>e.progress>=1);

export const CAMPAIGN_RELICS=Object.freeze([
  {
    id:'frontier-charter',
    name:'Frontier Charter',
    unlockCrowns:0,
    unlockWins:0,
    badge:'+100 Food · +100 Wood',
    desc:'Royal supply crates arrive with your expedition (+100 Food, +100 Wood).',
    apply(sim){
      const res=sim.players?.[0]?.resources;if(!res)return;
      res.food=(res.food||0)+100;res.wood=(res.wood||0)+100;
    },
  },
  {
    id:'iron-vanguard',
    name:'Iron Vanguard',
    unlockCrowns:1,
    unlockWins:1,
    badge:'+12% Starting Army HP',
    desc:'Battle-hardened starting soldiers deploy with +12% maximum health.',
    apply(sim){
      for(const u of sim.owned(0,'unit')){
        if(u.type!=='villager'&&u.type!=='cart'&&u.type!=='fishingboat'){
          u.maxHp=Math.round(u.maxHp*1.12);u.hp=u.maxHp;
        }
      }
    },
  },
  {
    id:'royal-masons',
    name:'Royal Masons',
    unlockCrowns:1,
    unlockWins:2,
    badge:'+1 Villager · +150 Stone',
    desc:'An extra master builder and +150 Stone accompany your frontier settlement.',
    apply(sim){
      const res=sim.players?.[0]?.resources;if(res)res.stone=(res.stone||0)+150;
      const tc=sim.owned(0,'building','towncenter')[0];
      if(tc)sim.addUnit('villager',0,tc.x+tc.r+3.5,tc.z+2);
    },
  },
  {
    id:'cartographer-seal',
    name:'Cartographer’s Seal',
    unlockCrowns:2,
    unlockWins:3,
    badge:'+20% Scout Vision · +120 Gold',
    desc:'Expanded reconnaissance lenses (+20% scout vision) and +120 Gold war chest.',
    apply(sim){
      const res=sim.players?.[0]?.resources;if(res)res.gold=(res.gold||0)+120;
      sim.campaignRelicVisionBonus=1.2;
      for(const u of sim.owned(0,'unit','scout'))u.vision=Math.round((u.vision||UNITS.scout.vision)*1.2);
    },
  },
  {
    id:'imperial-foundry',
    name:'Imperial Foundry',
    unlockCrowns:3,
    unlockWins:5,
    badge:'+150 Wood · +120 Gold',
    desc:'Siegewright timber and forged bullion (+150 Wood, +120 Gold) ready for war machines.',
    apply(sim){
      const res=sim.players?.[0]?.resources;if(!res)return;
      res.wood=(res.wood||0)+150;res.gold=(res.gold||0)+120;
    },
  },
  {
    id:'sovereign-guard',
    name:'Sovereign’s Guard',
    unlockCrowns:4,
    unlockWins:7,
    badge:'+2 Swordsmen · +1 Archer',
    desc:'A veteran royal escort joins your banner at the start of each chapter.',
    apply(sim){
      const tc=sim.owned(0,'building','towncenter')[0];
      if(!tc)return;
      sim.addUnit('swordsman',0,tc.x+tc.r+4,tc.z-3);
      sim.addUnit('swordsman',0,tc.x+tc.r+4,tc.z+3);
      sim.addUnit('archer',0,tc.x+tc.r+6,tc.z);
    },
  },
]);

export function unlockedCampaignRelics(progress={},freeSelect=false){
  let wins=0,crowns=0;
  for(const rec of Object.values(progress||{})){
    if(rec===true||rec?.won)wins++;
    if(rec&&typeof rec==='object'&&rec.optional)crowns++;
  }
  return CAMPAIGN_RELICS.map(r=>({
    ...r,
    unlocked:freeSelect||wins>=r.unlockWins||crowns>=r.unlockCrowns,
    wins,
    crowns,
  }));
}

export function applyCampaignRelic(sim,relicId){
  if(!sim||!relicId)return false;
  const relic=CAMPAIGN_RELICS.find(r=>r.id===relicId);
  if(!relic)return false;
  relic.apply(sim);
  sim.updateFog?.();
  return true;
}

/** Named Rival Warlords & Citadels displayed in Briefing Drawers & Boss Banners. */
export const CAMPAIGN_BOSSES=Object.freeze({
  campaign3:{name:'Warlord Varek',title:'Iron Ridge Raider Chief',fortress:'Northern Warcamp'},
  campaign5:{name:'Lord Draven',title:'Warden of the Walled Capital',fortress:'Twin-Gate Citadel'},
  campaign6:{name:'Corsair Admiral Rask',title:'Master of the Divided Sea',fortress:'Eastern Armada Harbor'},
  campaign7:{name:'Ash-Lord Kaelen',title:'Cinder Reach Commander',fortress:'Ember Keep'},
  campaign9:{name:'Siege-Master Torv',title:'Frostmarch Besieger',fortress:'Northern Siege Camp'},
  campaign10:{name:'Valkor the Usurper',title:'Claimant to the Shattered Crown',fortress:'Summit Imperial Keep'},
  campaign11:{name:'Lord Korr & General Syra',title:'Encircling Warlord Coalition',fortress:'Northern Siege Camp & Eastern Hold'},
  campaign12:{name:'Iron-Marshal Garen',title:'Warden of the Sundered Pass',fortress:'Central Mountain Fortress'},
  campaign13:{name:'High Warlord Malrik',title:'Scourge of the Deepwood',fortress:'Northwood Timber Citadel'},
  campaign14:{name:'The Usurper Coalition',title:'Sunward & Raven High Lords',fortress:'Twin Imperial Citadels'},
  campaign15:{name:'Overlord Draven & the Four Warlords',title:'Coalition of Ironfall Pass',fortress:'Four Outer War-Camps'},
  campaign16:{name:'Lord Korr & General Syra',title:'Commanders of the Gorge Crossings',fortress:'Twin River Strongholds'},
  campaign17:{name:'Jarl Skald',title:'Warlord of the Glacial Siege',fortress:'Frostfall Cliff Citadel'},
  campaign18:{name:'Temple Warden Arak & Warlord Kael',title:'Lords of the Coral Lagoon',fortress:'Stepped Jungle Temples'},
  campaign19:{name:'Overlord Malrik, Khan Varek & Sultan Zafar',title:'The Three Imperial Warlords',fortress:'Deepwood Ravine Imperial Citadels'},
});

/** Mid-mission optional Side Quests with instant battlefield rewards. */
export const CAMPAIGN_SIDE_QUESTS=Object.freeze({
  campaign1:{
    id:'sq-c1-timber',title:'Frontier Lumber Depot',
    text:'Complete a Lumber Camp to establish steady timber supply.',
    rewardText:'+150 Wood · +100 Food',
    done:s=>completed(s,'camp').length>0,
    reward(s){s.players[0].resources.wood+=150;s.players[0].resources.food+=100;},
  },
  campaign2:{
    id:'sq-c2-watch',title:'River Watchpost',
    text:'Raise a Watchtower to overlook the crossing.',
    rewardText:'+2 Archers reinforce',
    done:s=>completed(s,'tower').length>0,
    reward(s,spawn){spawn(s,{owner:0,type:'archer',count:2});},
  },
  campaign3:{
    id:'sq-c3-forge',title:'Iron Ridge Forge',
    text:'Complete a Blacksmith to strengthen castle defenders.',
    rewardText:'+200 Stone · +120 Gold',
    done:s=>completed(s,'blacksmith').length>0,
    reward(s){s.players[0].resources.stone+=200;s.players[0].resources.gold+=120;},
  },
  campaign4:{
    id:'sq-c4-market',title:'Valley Trade Charter',
    text:'Build a Market to fund shrine patrols.',
    rewardText:'+200 Gold · +150 Food',
    done:s=>completed(s,'market').length>0,
    reward(s){s.players[0].resources.gold+=200;s.players[0].resources.food+=150;},
  },
  campaign5:{
    id:'sq-c5-healer',title:'Field Apothecary',
    text:'Train a Healer to keep your siege escort fighting.',
    rewardText:'+2 Swordsmen reinforce',
    done:s=>s.owned(0,'unit','monk').length>0,
    reward(s,spawn){spawn(s,{owner:0,type:'swordsman',count:2});},
  },
  campaign6:{
    id:'sq-c6-fleet',title:'Escort Squadron',
    text:'Field two Galleys to guard the fishing grounds.',
    rewardText:'+200 Wood · +150 Gold',
    done:s=>s.owned(0,'unit','galley').length>=2,
    reward(s){s.players[0].resources.wood+=200;s.players[0].resources.gold+=150;},
  },
  campaign7:{
    id:'sq-c7-forge',title:'Tempered in Ash',
    text:'Research any weapon or armor upgrade at a Blacksmith.',
    rewardText:'+2 Knights reinforce',
    done:s=>(s.players[0].tech?.attack||0)+(s.players[0].tech?.armor||0)+(s.players[0].tech?.ranged||0)>0,
    reward(s,spawn){spawn(s,{owner:0,type:'knight',count:2});},
  },
  campaign8:{
    id:'sq-c8-rangers',title:'Canopy Archers',
    text:'Complete an Archery Range to match the forest ambushers.',
    rewardText:'+3 Archers reinforce',
    done:s=>completed(s,'range').length>0,
    reward(s,spawn){spawn(s,{owner:0,type:'archer',count:3});},
  },
  campaign9:{
    id:'sq-c9-walls',title:'Reinforced Frost Watch',
    text:'Complete a third Watchtower along the frozen perimeter.',
    rewardText:'+250 Food · +200 Stone',
    done:s=>completed(s,'tower').length>=3,
    reward(s){s.players[0].resources.food+=250;s.players[0].resources.stone+=200;},
  },
  campaign10:{
    id:'sq-c10-siege',title:'Royal Siege Arsenal',
    text:'Complete a Siege Workshop to shatter the Usurper’s keep.',
    rewardText:'+1 Trebuchet arrives',
    done:s=>completed(s,'workshop').length>0,
    reward(s,spawn){spawn(s,{owner:0,type:'trebuchet',count:1});},
  },
  campaign11:{
    id:'sq-c11-bastion',title:'Citadel Siegeworks',
    text:'Construct a Siege Workshop inside the Iron Ring to break out.',
    rewardText:'+2 Battering Rams · +200 Gold',
    done:s=>completed(s,'workshop').length>0,
    reward(s,spawn){s.players[0].resources.gold+=200;spawn(s,{owner:0,type:'ram',count:2});},
  },
  campaign12:{
    id:'sq-c12-castle',title:'Bastion of the Pass',
    text:'Raise a Castle Keep guarding one of the narrow mountain passes.',
    rewardText:'+300 Gold · +3 Knights reinforce',
    done:s=>completed(s,'keep').length>0,
    reward(s,spawn){s.players[0].resources.gold+=300;spawn(s,{owner:0,type:'knight',count:3});},
  },
  campaign13:{
    id:'sq-c13-imperial',title:'Crown of Oakhold',
    text:'Build a Blacksmith and a Stable to arm liberated Oakhold.',
    rewardText:'+3 Knights · +250 Food',
    done:s=>completed(s,'blacksmith').length>0&&completed(s,'stable').length>0,
    reward(s,spawn){s.players[0].resources.food+=250;spawn(s,{owner:0,type:'knight',count:3});},
  },
  campaign14:{
    id:'sq-c14-trebuchet',title:'Coalition Artillery',
    text:'Field two Trebuchets to shatter the rival Imperial citadels.',
    rewardText:'+400 Gold · +300 Stone',
    done:s=>s.owned(0,'unit').filter(e=>e.type==='trebuchet'||e.type==='catapult').length>=2,
    reward(s){s.players[0].resources.gold+=400;s.players[0].resources.stone+=300;},
  },
  campaign15:{
    id:'sq-c15-citadel',title:'Ironfall Artillery',
    text:'Complete a Siege Workshop to crack the four surrounding enemy war-camps.',
    rewardText:'+350 Gold · +250 Stone',
    done:s=>completed(s,'workshop').length>0,
    reward(s){s.players[0].resources.gold+=350;s.players[0].resources.stone+=250;},
  },
  campaign16:{
    id:'sq-c16-ford',title:'Gorge Watchpost',
    text:'Complete a Watchtower near the contested waterfall crossings.',
    rewardText:'+2 Knights reinforce',
    done:s=>completed(s,'tower').length>0,
    reward(s,spawn){spawn(s,{owner:0,type:'knight',count:2});},
  },
  campaign17:{
    id:'sq-c17-forge',title:'Glacial Armories',
    text:'Research any weapon, armor, or fortification upgrade to endure the winter siege.',
    rewardText:'+300 Wood · +250 Stone',
    done:s=>(s.players[0].tech?.attack||0)+(s.players[0].tech?.armor||0)+(s.players[0].tech?.ranged||0)+(s.players[0].tech?.fortification||0)>0,
    reward(s){s.players[0].resources.wood+=300;s.players[0].resources.stone+=250;},
  },
  campaign18:{
    id:'sq-c18-lagoon',title:'Lagoon Stronghold',
    text:'Complete a Castle Keep or Bombard Tower overlooking the coral delta.',
    rewardText:'+350 Gold · +3 Archers reinforce',
    done:s=>completed(s,'keep').length>0||completed(s,'bombard').length>0,
    reward(s,spawn){s.players[0].resources.gold+=350;spawn(s,{owner:0,type:'archer',count:3});},
  },
  campaign19:{
    id:'sq-c19-imperial',title:'Grand Siege Train',
    text:'Field two Trebuchets or Battering Rams to shatter the rival Imperial coalition.',
    rewardText:'+500 Gold · +400 Stone',
    done:s=>s.owned(0,'unit').filter(e=>['trebuchet','ram','catapult'].includes(e.type)).length>=2,
    reward(s){s.players[0].resources.gold+=500;s.players[0].resources.stone+=400;},
  },
});
