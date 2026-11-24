import {describe,it} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {Simulation} from '../src/simulation.js';
import {SAVE_SLOTS,readLocalSave,writeLocalSave,readSaveSlot,writeSaveSlot,deleteSaveSlot,listSaveSlots,latestSaveSummary} from '../src/local-save.js';
import {MatchTimeline,timelineSvgMarkup,matchSummaryMarkup} from '../src/match-timeline.js';
import {technologyTreeMarkup} from '../src/technology-tree.js';
import {FACTION_SIGNATURES,SETTINGS_TABS,landingMarkup,skirmishHubMarkup,settingsModalMarkup,saveManagerMarkup} from '../src/menus-ui.js';
import {renderHealthBars} from '../src/health-layer.js';
import {AudioEngine} from '../src/audio.js';

function memoryStorage(){
  const map=new Map();
  return {
    getItem(k){return map.has(k)?map.get(k):null;},
    setItem(k,v){map.set(k,String(v));},
    removeItem(k){map.delete(k);},
    keys(){return [...map.keys()];},
  };
}

function fakeLayer(){
  const children=[];
  const makeEl=tag=>({
    tagName:tag.toUpperCase(),
    className:'',
    style:{},
    textContent:'',
    hidden:false,
    children:[],
    append(...nodes){this.children.push(...nodes);},
    remove(){const i=children.indexOf(this);if(i>=0)children.splice(i,1);},
  });
  return {
    children,
    ownerDocument:{createElement:makeEl},
    append(...nodes){children.push(...nodes);},
  };
}

describe('Phase 5: Multi-Slot Save Manager (local-save.js)',()=>{
  it('supports Auto-Save + 3 manual slots with O(1) metadata index & latestSaveSummary',()=>{
    const storage=memoryStorage();
    const sim1=new Simulation({mode:'skirmish',faction:'alder',map:'highlands',seed:101});
    sim1.time=95;
    const sim2=new Simulation({mode:'campaign2',faction:'sun',map:'valley',seed:202});
    sim2.time=245;

    assert.equal(SAVE_SLOTS.length,4);
    assert.equal(writeLocalSave(sim1,{storage}),'saved');
    assert.equal(writeSaveSlot('slot1',sim2,{storage}),'saved');

    const loadedAuto=readLocalSave(storage);
    const loadedSlot1=readSaveSlot('slot1',storage);
    assert.equal(loadedAuto.options.faction,'alder');
    assert.equal(loadedSlot1.options.faction,'sun');
    assert.equal(loadedSlot1.options.mode,'campaign2');

    const slots=listSaveSlots(storage);
    assert.equal(slots.length,4);
    assert.equal(slots[0].exists,true);
    assert.equal(slots[1].exists,true);
    assert.equal(slots[1].chapter,'II');
    assert.equal(slots[2].exists,false);
    assert.equal(slots[3].exists,false);

    const latest=latestSaveSummary(storage);
    assert.ok(latest);
    assert.ok(['auto','slot1'].includes(latest.slotId));

    assert.equal(deleteSaveSlot('slot1',storage),true);
    assert.equal(readSaveSlot('slot1',storage),null);
    assert.equal(listSaveSlots(storage)[1].exists,false);
  });

  it('rejects multiplayer saves across all slots',()=>{
    const storage=memoryStorage();
    const sim=new Simulation({mode:'skirmish',faction:'alder',map:'highlands',seed:7,multiplayer:true});
    assert.equal(writeSaveSlot('slot2',sim,{storage}),'network');
    assert.equal(writeLocalSave(sim,{storage,networkActive:true}),'network');
    assert.equal(latestSaveSummary(storage),null);
  });
});

describe('Phase 5: MatchTimeline & Unified Post-Game Summary',()=>{
  it('throttles samples to 15s intervals, decimates long matches, and renders SVG polylines',()=>{
    const sim=new Simulation({mode:'skirmish',faction:'alder',map:'highlands',seed:55});
    const tl=new MatchTimeline();
    assert.equal(tl.sample(sim,true),true);
    sim.time=5;
    assert.equal(tl.sample(sim),false);
    sim.time=20;
    assert.equal(tl.sample(sim),true);
    assert.equal(tl.snapshot().length,2);

    // Stress-test decimation beyond 120 samples
    for(let i=2;i<140;i++){
      sim.time=i*15+20;
      tl.sample(sim);
    }
    assert.ok(tl.snapshot().length<=120,'timeline must cap memory <= 120 samples');

    const svg=timelineSvgMarkup(tl.snapshot(),sim.players,'scores');
    assert.match(svg,/<svg[^>]+class="timeline-svg"/);
    assert.match(svg,/<polyline/);
    assert.match(svg,/Alder/i);
  });

  it('renders Overview, Timeline, Economy tabs and Explore Battlefield button',()=>{
    const sim=new Simulation({mode:'campaign1',faction:'alder',map:'highlands',seed:99});
    sim.time=320;
    const tl=new MatchTimeline();
    tl.sample(sim,true);
    const result={won:true,reason:'Enemy town center destroyed.'};

    const overview=matchSummaryMarkup(sim,result,{samples:tl.snapshot(),tab:'overview',nextChapterId:'campaign2'});
    assert.match(overview,/Victory\./);
    assert.match(overview,/data-action="explore-battlefield"/);
    assert.match(overview,/data-atlas-open="campaign2"/);
    assert.match(overview,/summary-standings/);

    const timeline=matchSummaryMarkup(sim,result,{samples:tl.snapshot(),tab:'timeline',metric:'army'});
    assert.match(timeline,/timeline-svg/);
    assert.match(timeline,/data-summary-metric="army"/);

    const details=matchSummaryMarkup(sim,result,{samples:tl.snapshot(),tab:'details'});
    assert.match(details,/MILITARY RECORD/);
    assert.match(details,/ECONOMY & EMPIRE/);
  });
});

describe('Phase 5: Upgraded Tech Tree, Hero Menu, Skirmish Hub & 5-Tab Settings',()=>{
  it('renders Unit Counter Triangle & Roman Age headers in Technology Tree',()=>{
    const sim=new Simulation({mode:'skirmish',faction:'alder',map:'highlands',seed:11});
    sim.players[0].age=1;
    const html=technologyTreeMarkup(sim,'alder');
    assert.match(html,/class="counter-strip"/);
    assert.match(html,/Spearmen.*Cavalry/);
    assert.match(html,/Cavalry.*Archers/);
    assert.match(html,/Archers.*Spearmen/);
    assert.match(html,/<span>I<\/span>/);
    assert.match(html,/<span>II<\/span>/);
    assert.match(html,/<span>IV<\/span>/);
    assert.match(html,/tree-age reached/);
    assert.match(html,/tone-(ready|need|locked|done|active)/);
  });

  it('renders Hero Main Menu with and without a Continue Saved Kingdom card',()=>{
    const emptyHtml=landingMarkup(null);
    assert.match(emptyHtml,/data-action="campaign"/);
    assert.match(emptyHtml,/data-action="skirmish-hub"/);
    assert.match(emptyHtml,/data-action="custom-battle"/);
    assert.match(emptyHtml,/data-action="lan"/);
    assert.match(emptyHtml,/id="resume" class="resume hidden"/);

    const withSaveHtml=landingMarkup({
      slotId:'slot1',
      modeName:'Conquest Skirmish',
      factionName:'The Sun Crown',
      ageName:'Castle Age',
      mapName:'Emerald Highlands',
      time:420,
    });
    assert.match(withSaveHtml,/class="hero-continue"/);
    assert.match(withSaveHtml,/data-load-slot="slot1"/);
    assert.match(withSaveHtml,/The Sun Crown/);
  });

  it('renders Visual Skirmish Hub with Mode cards, Civ Crest cards & Biome picker',()=>{
    const html=skirmishHubMarkup({mode:'skirmish',faction:'raven',difficulty:'hard',map:'volcanic',mapSize:'vast',seed:777});
    assert.equal(Object.keys(FACTION_SIGNATURES).length,5);
    assert.match(html,/data-hub-mode="skirmish"/);
    assert.match(html,/data-hub-mode="koth"/);
    assert.match(html,/data-hub-mode="deathmatch"/);
    assert.match(html,/data-hub-mode="siege"/);
    assert.match(html,/data-hub-faction="alder"/);
    assert.match(html,/data-hub-faction="sun"/);
    assert.match(html,/data-hub-faction="raven"/);
    assert.match(html,/data-hub-faction="iron"/);
    assert.match(html,/data-hub-faction="jade"/);
    assert.match(html,/data-hub-map="volcanic"/);
    assert.match(html,/data-start="skirmish"/);

    // Tides locks map selection to coast, Castle Siege locks map to ironpass
    const tidesHtml=skirmishHubMarkup({mode:'tides',faction:'alder',map:'highlands'});
    assert.match(tidesHtml,/id="map" value="coast"/);
    assert.match(tidesHtml,/fixed by mode/);
    const siegeHtml=skirmishHubMarkup({mode:'siege',faction:'iron',map:'highlands'});
    assert.match(siegeHtml,/id="map" value="ironpass"/);
    assert.match(siegeHtml,/fixed by mode/);
  });

  it('renders 5-Tab Settings Modal with all tab inputs simultaneously mounted',()=>{
    assert.equal(SETTINGS_TABS.length,5);
    const html=settingsModalMarkup({
      settings:{volume:.7,musicVolume:.5,uiVolume:.8,frameRate:'auto',cameraPreset:'balanced',healthBarMode:'always',hudScale:'1.1',minimapSide:'right',edgeScroll:true,edgeScrollSpeed:1,music:true,weather:'auto',lighting:'day',fog:true},
      graphicsMode:'auto',
      rendererStatusText:'WebGL 2 active',
      graphicsSupportHtml:'',
      activeTab:'audio',
    });
    for(const tab of SETTINGS_TABS){
      assert.match(html,new RegExp(`data-settings-tab="${tab.id}"`));
      assert.match(html,new RegExp(`data-pane="${tab.id}"`));
    }
    assert.match(html,/id="music-volume"/);
    assert.match(html,/id="ui-volume"/);
    assert.match(html,/id="health-bar-mode"/);
    assert.match(html,/id="hud-scale"/);
    assert.match(html,/id="minimap-side"/);
    assert.match(html,/id="settings-keybinds-anchor"/);
  });

  it('renders Multi-Slot Save Manager respecting solo vs multiplayer',()=>{
    const slots=[
      {slotId:'auto',label:'Auto-Save',exists:true,modeName:'Skirmish',factionName:'Alder',ageName:'Frontier Age',mapName:'Highlands',time:90,savedAt:Date.now()},
      {slotId:'slot1',label:'Kingdom Slot I',exists:false},
    ];
    const soloHtml=saveManagerMarkup(slots,{canSave:true,networkActive:false});
    assert.match(soloHtml,/data-save-slot="slot1"/);
    assert.match(soloHtml,/data-load-slot="auto"/);
    const netHtml=saveManagerMarkup(slots,{canSave:true,networkActive:true});
    assert.doesNotMatch(netHtml,/data-save-slot=/);
  });

  it('has zero backdrop-filter blur rules in menus-overhaul.css',()=>{
    const css=fs.readFileSync(new URL('../src/menus-overhaul.css',import.meta.url),'utf8');
    assert.doesNotMatch(css,/backdrop-filter\s*:\s*blur/i);
    assert.match(css,/backdrop-filter\s*:\s*none/i);
  });
});

describe('Phase 5: Health Bar Modes & Audio Sub-Sliders',()=>{
  it('supports smart, always, and altPeek health bar modes',()=>{
    const sim=new Simulation({mode:'skirmish',faction:'alder',map:'highlands',seed:33});
    const layer=fakeLayer();
    const view={
      selection:new Set(),
      settings:{healthBarMode:'smart'},
      altPeek:false,
      project:()=>({visible:true,x:300,y:240}),
    };
    renderHealthBars(layer,sim,view,{width:1280,height:720});
    assert.equal(layer.children.length,0,'smart mode hides full-HP unselected entities');

    view.altPeek=true;
    renderHealthBars(layer,sim,view,{width:1280,height:720});
    assert.ok(layer.children.length>0,'altPeek shows all visible units/buildings');

    view.altPeek=false;
    view.settings.healthBarMode='always';
    renderHealthBars(layer,sim,view,{width:1280,height:720});
    assert.ok(layer.children.length>0,'always mode shows all visible units/buildings');
  });

  it('respects separate uiVolume slider without crashing when muted',()=>{
    const calls=[];
    const engine=new AudioEngine({volume:.8,musicVolume:0,uiVolume:0,music:true});
    engine.context={currentTime:0,state:'running'};
    engine.master={gain:{value:0}};
    engine.tone=(...args)=>calls.push(args);
    engine.play('select');
    assert.equal(calls.length,0,'uiVolume=0 silences select cue');
    engine.settings.uiVolume=.5;
    engine.play('select');
    assert.ok(calls.length>0,'uiVolume=0.5 plays select cue');
  });
});
