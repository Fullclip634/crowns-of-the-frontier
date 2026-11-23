import {describe,it} from 'node:test';
import assert from 'node:assert/strict';
import {Simulation} from '../src/simulation.js';
import {campaignObjective} from '../src/campaigns.js';
import {COMMANDER_PROFILES,commanderPortraitSvg,commanderProfile} from '../src/commander-portraits.js';
import {CAMPAIGN_RELICS,CAMPAIGN_BOSSES,CAMPAIGN_SIDE_QUESTS,unlockedCampaignRelics} from '../src/campaign-relics.js';
import {campaignMapMarkup,commanderBannerMarkup} from '../src/campaign-map-ui.js';

describe('Track 1: Heraldic Commander Portraits, Crown Relics, Bosses & Side Quests',()=>{
  it('renders custom inline SVG heraldic portraits for all named campaign commanders',()=>{
    assert.ok(Object.keys(COMMANDER_PROFILES).length>=9);
    for(const speaker of Object.keys(COMMANDER_PROFILES)){
      const svg=commanderPortraitSvg(speaker,44);
      assert.match(svg,/<svg[^>]+class="commander-portrait-svg"/);
      assert.match(svg,/radialGradient/);
      assert.ok(commanderProfile(speaker).title.length>3);
    }
    const banner=commanderBannerMarkup({speaker:'Queen Maren',title:'Chapter X',text:'Take the summit.'});
    assert.match(banner,/commander-portrait-svg/);
    assert.match(banner,/Queen Maren/);
  });

  it('unlocks Crown Relics cleanly by wins or Bonus Crowns and applies starting perks without affecting default sims',()=>{
    const starter=unlockedCampaignRelics({},false);
    assert.equal(starter.filter(r=>r.unlocked).length,1,'Frontier Charter unlocked at start');

    const earned=unlockedCampaignRelics({campaign1:{won:true,optional:true},campaign2:{won:true,optional:true}},false);
    assert.ok(earned.find(r=>r.id==='iron-vanguard').unlocked);
    assert.ok(earned.find(r=>r.id==='royal-masons').unlocked);
    assert.ok(earned.find(r=>r.id==='cartographer-seal').unlocked);

    const allFree=unlockedCampaignRelics({},true);
    assert.equal(allFree.filter(r=>r.unlocked).length,CAMPAIGN_RELICS.length,'Free Select unlocks all relics');

    // Verify default simulation without relic is untouched, while relic applies real bonus
    const plain=new Simulation({mode:'campaign1',difficulty:'story',seed:4301});
    const withCharter=new Simulation({mode:'campaign1',difficulty:'story',seed:4301,relic:'frontier-charter'});
    assert.equal(withCharter.players[0].resources.food,plain.players[0].resources.food+100);
    assert.equal(withCharter.players[0].resources.wood,plain.players[0].resources.wood+100);

    const withGuard=new Simulation({mode:'campaign1',difficulty:'story',seed:4301,relic:'sovereign-guard'});
    assert.equal(withGuard.owned(0,'unit','swordsman').length,plain.owned(0,'unit','swordsman').length+2);
  });

  it('completes mid-mission Side Quests once, grants instant rewards, and survives save/restore',()=>{
    assert.equal(Object.keys(CAMPAIGN_SIDE_QUESTS).length,14,'every chapter 1..14 has a side quest');
    assert.ok(Object.keys(CAMPAIGN_BOSSES).length>=6,'key chapters have named rival warlords');

    const sim=new Simulation({mode:'campaign1',difficulty:'story',seed:4301});
    sim.tickAI=()=>{};
    const obj=campaignObjective(sim);
    assert.ok(obj.sideQuest&&!obj.sideQuest.done);

    const beforeWood=sim.players[0].resources.wood;
    const events=[];
    sim.on(e=>{if(e.type==='campaign-sidequest')events.push(e);});
    // Complete a lumber camp to satisfy Chapter I side quest
    sim.addBuilding('camp',0,-30,45,true);
    for(let i=0;i<10;i++)sim.tick(.1);

    assert.equal(sim.campaignState.sideQuestDone,true);
    assert.equal(events.length,1);
    assert.ok(sim.players[0].resources.wood>=beforeWood+150,'side quest granted +150 Wood reward');

    // Restoring a save never replays the side quest reward
    const afterWood=sim.players[0].resources.wood;
    const restored=Simulation.restore(JSON.parse(JSON.stringify(sim.serialize())));
    restored.tickAI=()=>{};
    for(let i=0;i<10;i++)restored.tick(.1);
    assert.equal(restored.campaignState.sideQuestDone,true);
    assert.equal(restored.players[0].resources.wood,afterWood);
  });

  it('renders Boss Commander, Side Quest card, Heraldic Portrait & Crown Relic picker in Campaign World Map',()=>{
    const html=campaignMapMarkup({progress:{campaign1:{won:true,optional:true}},selectedId:'campaign5',freeSelect:true});
    assert.match(html,/brief-boss/);
    assert.match(html,/Lord Draven/);
    assert.match(html,/brief-sidequest/);
    assert.match(html,/id="atlas-relic"/);
    assert.match(html,/commander-portrait-svg/);
  });
});
