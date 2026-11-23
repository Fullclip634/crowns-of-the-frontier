import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {Simulation} from '../src/simulation.js';
import {
  AGE_ROMAN,
  BUILD_CATEGORIES,
  ageProgressState,
  categorizedBuildMarkup,
  globalProductionItems,
  globalQueueMarkup,
  kingdomScore,
  multiSelectCardsMarkup,
  resourceWorkerCounts,
  scoreboardMarkup,
} from '../src/hud-macro.js';
import {resourceBarMarkup} from '../src/resource-bar.js';
import {DEFAULT_BINDINGS, controlForKey, readBindings} from '../src/controls.js';
import {earlyAgeBuildingScale} from '../src/early-ages-art.js';

test('resourceWorkerCounts tallies active gatherers by resource, farms, fishing boats, builders, and idle villagers',()=>{
  const sim=new Simulation({mode:'skirmish',map:'highlands',seed:2026});
  const villagers=sim.owned(0,'unit','villager');
  assert.ok(villagers.length>=4,'starting match has at least 4 villagers');

  const foodNode=sim.entities.find(e=>e.kind==='resource'&&e.type==='food');
  const woodNode=sim.entities.find(e=>e.kind==='resource'&&e.type==='wood');
  const goldNode=sim.entities.find(e=>e.kind==='resource'&&e.type==='gold');
  const stoneNode=sim.entities.find(e=>e.kind==='resource'&&e.type==='stone');
  assert.ok(foodNode&&woodNode&&goldNode&&stoneNode);

  // Clear all orders first so counts are deterministic.
  for(const v of villagers){v.order=null;v.carry=0;v.embarked=false;}
  villagers[0].order={type:'gather',target:foodNode.id};
  villagers[1].order={type:'gather',target:woodNode.id};
  villagers[2].order={type:'build',target:999999};
  // Leave villagers[3] idle; add extra villagers for gold, stone, farm, embarked, and a fishing boat.
  const tc=sim.owned(0,'building','towncenter')[0];
  const vGold=sim.addUnit('villager',0,tc.x+4,tc.z);
  vGold.order={type:'gather',target:goldNode.id};
  const vStone=sim.addUnit('villager',0,tc.x+5,tc.z);
  vStone.order={type:'gather',target:stoneNode.id};
  const farm=sim.addBuilding('farm',0,tc.x+8,tc.z,true);
  const vFarm=sim.addUnit('villager',0,tc.x+8,tc.z);
  vFarm.order={type:'gather',target:farm.id};
  const vEmbarked=sim.addUnit('villager',0,tc.x+6,tc.z);
  vEmbarked.order=null;vEmbarked.embarked=true;
  const boat=sim.addUnit('fishingboat',0,tc.x+10,tc.z);
  boat.order={type:'gather',target:foodNode.id};

  const counts=resourceWorkerCounts(sim,0);
  assert.equal(counts.food,3,'food gatherer + farm gatherer + fishing boat');
  assert.equal(counts.wood,1);
  assert.equal(counts.gold,1);
  assert.equal(counts.stone,1);
  assert.equal(counts.building,1);
  assert.equal(counts.idle,villagers.length-3,'unassigned unembarked villagers only');
  assert.equal(counts.total,villagers.length+3,'excludes fishing boats and embarked villagers');
});

test('ageProgressState reports active Town Center age research and returns null when idle or max age',()=>{
  const sim=new Simulation({mode:'skirmish',map:'highlands',seed:2026});
  assert.equal(ageProgressState(sim,0),null);

  const tc=sim.owned(0,'building','towncenter')[0];
  tc.queue.unshift({kind:'age',type:'age',total:40,remaining:16});
  const prog=ageProgressState(sim,0);
  assert.ok(prog);
  assert.equal(prog.active,true);
  assert.equal(prog.roman,AGE_ROMAN[1]);
  assert.equal(prog.percent,60);
  assert.equal(prog.remaining,16);
  assert.equal(prog.buildingId,tc.id);

  sim.players[0].age=3;
  assert.equal(ageProgressState(sim,0),null);
});

test('globalProductionItems and globalQueueMarkup aggregate front-of-queue training and research across buildings',()=>{
  const sim=new Simulation({mode:'skirmish',map:'highlands',seed:2026});
  const tc=sim.owned(0,'building','towncenter')[0];
  const barracks=sim.addBuilding('barracks',0,tc.x+10,tc.z+4,true);
  const unfinished=sim.addBuilding('range',0,tc.x-10,tc.z+4,false);
  tc.queue=[{kind:'age',type:'age',total:40,remaining:10},{kind:'unit',type:'villager',total:15,remaining:15}];
  barracks.queue=[{kind:'unit',type:'spearman',total:20,remaining:5},{kind:'unit',type:'spearman',total:20,remaining:20},{kind:'unit',type:'spearman',total:20,remaining:20}];
  unfinished.queue=[{kind:'unit',type:'archer',total:20,remaining:10}];

  const items=globalProductionItems(sim,0,8);
  assert.equal(items.length,2,'ignores unfinished buildings');
  assert.equal(items[0].kind,'age');
  assert.equal(items[0].percent,75);
  assert.equal(items[0].queued,2);
  assert.equal(items[1].type,'spearman');
  assert.equal(items[1].queued,3);

  const html=globalQueueMarkup(items);
  assert.match(html,/class="gq-item gq-age"/);
  assert.match(html,/data-production-select="/);
  assert.match(html,/<b class="gq-badge">3<\/b>/);
  assert.match(html,/10s/);
  assert.equal(globalQueueMarkup([]),'');
});

test('kingdomScore increases with progression and scoreboardMarkup ranks living kingdoms above defeated ones',()=>{
  const sim=new Simulation({mode:'skirmish',map:'highlands',seed:2026});
  const base=kingdomScore(sim,0);
  assert.ok(base>0);

  sim.players[0].age=2;
  sim.players[0].battleStats={kills:5,gathered:400,lost:0};
  sim.players[0].resources.gold+=1000;
  const boosted=kingdomScore(sim,0);
  assert.ok(boosted>base,`expected score ${boosted} > ${base}`);

  sim.players[1].defeated=true;
  const html=scoreboardMarkup(sim);
  assert.match(html,/KINGDOM SCORES/);
  assert.match(html,/score-row you/);
  assert.match(html,/score-row enemy defeated/);
  assert.match(html,/>—<\/strong>/);
  assert.ok(html.indexOf('score-row you')<html.indexOf('score-row enemy defeated'),'living player appears before defeated rival');
});

test('categorizedBuildMarkup organizes Economy, Military, and Defense cleanly with age locks and zero conflicting WASD/QE hotkeys',()=>{
  const sim=new Simulation({mode:'skirmish',map:'highlands',seed:2026});
  assert.deepEqual(BUILD_CATEGORIES.map(c=>c.id),['economy','military','defense']);

  const econHtml=categorizedBuildMarkup(sim,'economy');
  assert.match(econHtml,/data-build-tab="economy" aria-pressed="true"/);
  assert.match(econHtml,/data-build="house"/);
  assert.match(econHtml,/data-build="market" disabled/,'market locked in Frontier Age');
  assert.doesNotMatch(econHtml,/data-build="barracks"/,'military buildings separated from economy tab');
  assert.doesNotMatch(econHtml,/<kbd/,'no misleading camera-conflicting QWER/ASDF hotkey badges');

  const milHtml=categorizedBuildMarkup(sim,'military');
  assert.match(milHtml,/data-build-tab="military" aria-pressed="true"/);
  assert.match(milHtml,/data-build="barracks"/);
  assert.match(milHtml,/data-build="blacksmith" disabled/);

  sim.players[0].age=3;
  const defHtml=categorizedBuildMarkup(sim,'defense');
  assert.match(defHtml,/data-build-tab="defense" aria-pressed="true"/);
  assert.match(defHtml,/data-build="wall"/);
  assert.match(defHtml,/data-build="wonder"/);
  assert.doesNotMatch(defHtml,/data-build="wonder" disabled/,'wonder unlocked in Imperial Age');
});

test('multiSelectCardsMarkup renders clickable portrait cards with individual HP tiers and overflow count',()=>{
  assert.equal(multiSelectCardsMarkup([{id:1,type:'spearman',hp:80,maxHp:80}]),'');
  const units=[
    {id:1,type:'spearman',hp:80,maxHp:80},
    {id:2,type:'archer',hp:30,maxHp:60},
    {id:3,type:'knight',hp:20,maxHp:140},
    {id:4,type:'villager',hp:50,maxHp:50},
  ];
  const html=multiSelectCardsMarkup(units,3);
  assert.match(html,/class="selection-cards"/);
  assert.match(html,/data-focus-entity="1"/);
  assert.match(html,/class="sel-card mid" data-focus-entity="2"/);
  assert.match(html,/class="sel-card low" data-focus-entity="3"/);
  assert.doesNotMatch(html,/data-focus-entity="4"/);
  assert.match(html,/class="sel-card-more"[^>]*>\+1<\/span>/);
});

test('resourceBarMarkup embeds live worker counts and population warning without breaking accessible labels',()=>{
  const html=resourceBarMarkup(
    {resources:{food:510,wood:340,gold:120,stone:0}},
    20,
    20,
    {food:6,wood:3,gold:0,stone:1}
  );
  assert.match(html,/aria-label="food: 510"/);
  assert.match(html,/<em class="worker-count" aria-hidden="true">6<\/em>/);
  assert.match(html,/<em class="worker-count is-zero" aria-hidden="true"><\/em>/);
  assert.match(html,/class="resource population full-pop"/);
});

test('controls module exposes tech-tree hotkey bound to U by default',()=>{
  assert.equal(DEFAULT_BINDINGS['tech-tree'],'u');
  const bindings=readBindings();
  assert.equal(bindings['tech-tree'],'u');
  assert.equal(controlForKey('u',bindings),'tech-tree');
});

test('Phase 2 HUD removes misleading weather/duplicate-menu chrome and avoids laggy backdrop-filter blurs',()=>{
  const mainSrc=fs.readFileSync(new URL('../src/main.js',import.meta.url),'utf8');
  const cssSrc=fs.readFileSync(new URL('../src/interface-design.css',import.meta.url),'utf8');
  const phoneCssSrc=fs.readFileSync(new URL('../src/phone-hud.css',import.meta.url),'utf8');

  assert.doesNotMatch(mainSrc,/id="weather-label"/,'confusing Clear weather button removed from camera toolbar');
  assert.doesNotMatch(mainSrc,/id="deselect-control"/,'misplaced Deselect removed from camera toolbar');
  assert.match(mainSrc,/class="selection-deselect" data-action="deselect"/,'Deselect docked directly in selection panel');
  assert.match(mainSrc,/id="idle-villager-pill"/,'prominent Idle Villager pill present in header');
  assert.match(mainSrc,/id="global-queue-strip"/,'global production queue strip present in HUD');
  assert.match(mainSrc,/id="scoreboard-panel"/,'live kingdom scoreboard panel present in HUD');
  assert.doesNotMatch(cssSrc,/backdrop-filter:\s*blur/i,'no laggy backdrop-filter blur in main stylesheet');
  assert.doesNotMatch(phoneCssSrc,/backdrop-filter:\s*blur/i,'no laggy backdrop-filter blur in phone stylesheet');
  assert.match(phoneCssSrc,/\[data-action=camera-closer\][\s\S]*?\[data-action=camera-farther\]\{display:none/,'phone HUD hides redundant zoom buttons since touch supports pinch-to-zoom');
  assert.match(phoneCssSrc,/\.selection-title small\{[^}]*white-space:nowrap/,'phone selection status text never wraps and pushes Options/Deselect downward');
});

test('earlyAgeBuildingScale calibrates Age 1 & Age 2 structures proportionally while leaving walls and gates exact',()=>{
  assert.ok(earlyAgeBuildingScale('towncenter',0)>=1.30&&earlyAgeBuildingScale('towncenter',1)>=1.35);
  assert.ok(earlyAgeBuildingScale('house',0)>=1.20&&earlyAgeBuildingScale('house',1)>=1.25);
  assert.ok(earlyAgeBuildingScale('barracks',1)>=1.25&&earlyAgeBuildingScale('mill',1)>=1.25);
  assert.equal(earlyAgeBuildingScale('wall',0),1);
  assert.equal(earlyAgeBuildingScale('gate',0),1);
  assert.equal(earlyAgeBuildingScale('farm',0),1);
  assert.equal(earlyAgeBuildingScale('towncenter',2),1);
});
