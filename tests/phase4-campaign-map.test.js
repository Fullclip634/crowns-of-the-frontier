import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {MISSIONS} from '../src/data.js';
import {
  CAMPAIGN_ACTS,
  CAMPAIGN_NODES,
  campaignAtlasState,
  mergeCampaignVictory,
  nextCampaignMissionId,
  nextChapterAfter,
} from '../src/campaign-map-data.js';
import {campaignMapMarkup, commanderBannerMarkup} from '../src/campaign-map-ui.js';

test('campaignAtlasState maps every mission to decoupled map coordinates, acts, routes, and unlock progression',()=>{
  assert.equal(CAMPAIGN_NODES.length,MISSIONS.length,'every campaign mission has an atlas node');
  assert.equal(CAMPAIGN_ACTS.length,4,'All Acts + Acts I, II, III');

  const fresh=campaignAtlasState({},false);
  assert.equal(fresh.total,MISSIONS.length);
  assert.equal(fresh.completedCount,0);
  assert.equal(fresh.routes.length,MISSIONS.length-1);
  assert.equal(fresh.nodes[0].status,'current');
  assert.equal(fresh.nodes[1].status,'locked');
  assert.equal(nextCampaignMissionId({},false),'campaign1');

  const progressed=campaignAtlasState({
    campaign1:{won:true,difficulty:'hard',optional:true,seconds:312},
    campaign2:true,
  },false);
  assert.equal(progressed.completedCount,2);
  assert.equal(progressed.optionalCount,1);
  assert.equal(progressed.nodes[0].status,'completed');
  assert.equal(progressed.nodes[0].medal.tier,'gold');
  assert.equal(progressed.nodes[1].status,'completed');
  assert.equal(progressed.nodes[2].status,'current');
  assert.equal(progressed.nodes[3].status,'locked');
  assert.equal(progressed.routes[0].conquered,true);
  assert.equal(progressed.routes[1].active,true);
  assert.equal(nextCampaignMissionId({campaign1:true,campaign2:true},false),'campaign3');

  const free=campaignAtlasState({},true);
  assert.ok(free.nodes.every(n=>n.unlocked),'Free Select unlocks every chapter immediately');
  assert.equal(nextChapterAfter('campaign1'),'campaign2');
  assert.equal(nextChapterAfter('campaign10'),null);
});

test('mergeCampaignVictory preserves best completion time, optional crown, and highest difficulty medal',()=>{
  const first=mergeCampaignVictory(null,{won:true,difficulty:'normal',optional:false,seconds:420});
  assert.equal(first.difficulty,'normal');
  assert.equal(first.seconds,420);
  assert.equal(first.optional,false);

  const second=mergeCampaignVictory(first,{won:true,difficulty:'brutal',optional:true,seconds:510});
  assert.equal(second.difficulty,'brutal','upgrades medal to highest difficulty beaten');
  assert.equal(second.seconds,420,'preserves faster previous completion time');
  assert.equal(second.optional,true,'retains earned bonus crown');

  const third=mergeCampaignVictory(second,{won:true,difficulty:'story',optional:false,seconds:305});
  assert.equal(third.difficulty,'brutal','never downgrades higher difficulty medal');
  assert.equal(third.seconds,305,'records new personal best time');
  assert.equal(third.optional,true,'never loses previously earned bonus crown');
});

test('campaignMapMarkup renders vector parchment atlas, all 10 interactive nodes, briefing drawer, and zero backdrop blur',()=>{
  const html=campaignMapMarkup({
    progress:{campaign1:{won:true,difficulty:'hard',optional:true,seconds:290}},
    selectedId:'campaign2',
    actFilter:'all',
    freeSelect:false,
    setupOptions:{faction:'alder',difficulty:'normal'},
  });
  assert.match(html,/class="atlas-shell"/);
  assert.match(html,/<svg class="atlas-svg" viewBox="0 0 1000 580"/);
  for(const m of MISSIONS){
    assert.ok(html.includes(`data-atlas-node="${m.id}"`),`atlas renders interactive node for ${m.id}`);
  }
  assert.match(html,/data-atlas-launch="campaign2"/);
  assert.match(html,/MISSION OBJECTIVES/);
  assert.match(html,/Bonus Crown Objective/);

  const lockedHtml=campaignMapMarkup({progress:{},selectedId:'campaign5',freeSelect:false});
  assert.doesNotMatch(lockedHtml,/data-atlas-launch="campaign5"/);
  assert.match(lockedHtml,/data-action="atlas-free-select"/);

  const banner=commanderBannerMarkup({speaker:'Marshal Elian',title:'Chapter I',text:'Hold the bridge.'});
  assert.match(banner,/Marshal Elian/);
  assert.match(banner,/data-action="dismiss-dialogue"/);
  assert.equal(commanderBannerMarkup({text:''}),'');

  const css=fs.readFileSync(new URL('../src/campaign-map.css',import.meta.url),'utf8');
  assert.doesNotMatch(css,/backdrop-filter:\s*blur/i,'campaign atlas avoids laggy backdrop-filter blur');
});
