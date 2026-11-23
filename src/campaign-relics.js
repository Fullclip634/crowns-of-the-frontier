/**
 * Track 1 Campaign Depth: Unlockable Crown Relics (Warband Perks),
 * Handcrafted Mid-Mission Side Quests with instant tactical rewards,
 * and Named Act Boss Citadel profiles.
 * Zero extra per-frame overhead (relics apply once on init; side quests check inside the 0.5s campaign loop).
 */
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
      for(const u of sim.owned(0,'unit','scout'))u.vision=Math.round((u.vision||20)*1.2);
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
    id:'sq-c9-walls',title:'Reinforced Palisade',
    text:'Complete four wall sections to blunt the night siege.',
    rewardText:'+250 Food · +200 Stone',
    done:s=>completed(s,'wall').length>=4,
    reward(s){s.players[0].resources.food+=250;s.players[0].resources.stone+=200;},
  },
  campaign10:{
    id:'sq-c10-siege',title:'Royal Siege Arsenal',
    text:'Complete a Siege Workshop to shatter the Usurper’s keep.',
    rewardText:'+1 Trebuchet arrives',
    done:s=>completed(s,'workshop').length>0,
    reward(s,spawn){spawn(s,{owner:0,type:'catapult',count:1});},
  },
});
