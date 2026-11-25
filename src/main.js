import {mergeSnapshotEntities} from './snapshot-entities.js';
import {customHostOptions} from './custom-host.js';
import {refreshRoomLobby} from './lobby-ui.js';
import {setUIText,difficultyLabel} from './ui-format.js';
import {UI_ICONS as ICONS,uiIcon} from './ui-icons.js';
import {LanClient} from './network.js';
import {createNearby,NEARBY_ICONS} from './nearby-ui.js';
import './nearby-ui.css';
import {readLocalSave,writeLocalSave,readSaveSlot,writeSaveSlot,deleteSaveSlot,listSaveSlots,latestSaveSummary} from './local-save.js';
import {battleChatMarkup,BattleChatPanel} from './battle-chat.js';
import {warCommsMarkup,WarCommsController} from './war-comms.js';
import './war-comms.css';
import {WEATHER_NAMES} from './weather.js';
import {LIGHTING_MODES} from './day-night.js';
import {battlePreset,normalizeBattle,BATTLE_SIZES,playerPalette} from './custom-battle.js';
import {isSpectatingAI,spectatorActionAllowed} from './spectator-controls.js';
import {installBattleZoomGuard} from './battle-zoom-guard.js';
import {customBattleMarkup,readBattleSetup,updateBattlePreview,battleObjectiveMarkup,battleResultMarkup,roomLobbyMarkup} from './custom-battle-ui.js';
import './style.css';
import './interface.css';
import './wall-placement.css';
import './resource-presentation.css';
import './alliance-ui.css';
import './interface-design.css';
import './campaign-map.css';
import './menus-overhaul.css';
import './mission-loading.css';
import './startup-loading.css';
import './phone-hud.css';
import {WallPlacement,wallPlacementPlan,wallPointerPoint} from './wall-placement.js';
import {WallPreview} from './wall-preview.js';
import {gateConversionPlan,gatePlacementPlan} from './gate-conversion.js';
import {mechanicalUnit} from './maintenance.js';
import {Simulation,distance} from './simulation.js';
import {WorldView,CAMERA_PRESETS} from './world.js';
import {loadStartupAuthoredAssets,preloadDistantAssets} from './authored-assets.js';
import {onAssetProgress,resetAssetProgress} from './load-progress.js';
import {loadBridgeArtwork} from './bridge-art.js';
import {loadBiomeArtwork} from './biome-art.js';
import {loadEarlyAgeArtwork} from './early-ages-art.js';
import {loadIronholdArtwork} from './ironhold-art.js';
import {loadJadeHeroesArtwork} from './jade-heroes-art.js';
import {loadEpicPropsArtwork} from './epic-props-art.js';
import {HERO_DEFS,isHeroUnit,triggerHeroSkill,wonderPowerFor} from './heroes.js';
import {loadSurfaceAssets} from './surface-assets.js';
import {AudioEngine} from './audio.js';
import {isHumanVoiceUnit} from './voice-system.js';
import {wallTier,wallBuildCost,wallDisplayName} from './fortified-walls.js';
import {createCombatListener} from './combat-audio.js';
import {EdgeScroll} from './edge-scroll.js';
import {campaignObjective,CAMPAIGN_SCRIPTS} from './campaigns.js';
import {mergeCampaignVictory,nextCampaignMissionId,nextChapterAfter} from './campaign-map-data.js';
import {campaignMapMarkup,commanderBannerMarkup} from './campaign-map-ui.js';
import {missionLoadingMarkup} from './mission-loading.js';
import {createStartupSplash} from './startup-loading.js';
import {MatchTimeline,matchSummaryMarkup} from './match-timeline.js';
import {landingMarkup,skirmishHubMarkup,settingsModalMarkup,saveManagerMarkup} from './menus-ui.js';
import {AI_PERSONALITIES} from './ai-personalities.js';
import {MatchReplayRecorder,ReplayDriver,listReplays,saveReplay,readReplay,deleteReplay} from './replay.js';
import {technologyTreeMarkup} from './technology-tree.js';
import {readBindings,bindingErrors,controlForKey,heldControl,keyLabel} from './controls.js';
import {appendKeyboardSettings,settingsBindings,activeControlsMarkup} from './keyboard-settings.js';
import {insideMap,minimapPoint} from './map-geometry.js';
import {drawMinimap} from './minimap.js';
import {productionBuildings,trainingBuildings,trainAcrossBuildings} from './production.js';
import {FRAME_RATES,normalizeFrameRate,targetFrameRate,FramePacer} from './frame-pacing.js';
import {SimulationPacer,SIMULATION_STEP} from './simulation-pacing.js';
import {installGameUpdates} from './game-updates.js';
import {updateResourceBar} from './resource-bar.js';
import {allianceMarkup,refreshAllianceModal} from './alliance-ui.js';
import {registerOfflineGame} from './offline-registration.js';
import {graphicsSelection,applyGraphicsChoice,rendererStatus} from './graphics-settings.js';
import {graphicsFailureMessage,graphicsRecoveryMarkup} from './graphics-recovery-ui.js';
import {graphicsNeedsReload} from './graphics-failure.js';
import {preferredRenderer,compatibleGraphicsURL,startupCompatibilityURL} from './graphics-compatibility.js';
import {graphicsReport,rememberGraphicsFailure,readGraphicsFailure,graphicsSupportMarkup,copyGraphicsReport} from './graphics-reports.js';
import {touchUnitAt} from './touch-selection.js';
import {shelterControls} from './garrison-ui.js';
import {releaseRenderers} from './render-lifecycle.js';
import {initializeWorldRenderer,rendererBackend,watchRendererDevice} from './render-context.js';
import {projectileImpactSound} from './combat-audio.js';
import {releaseSurfaceCodec} from './surface-codecs.js';
import {renderHealthBars} from './health-layer.js';
import {entityAffiliation,entityBarRatio,entityDisplayName,entityStatusText,inspectorEyebrow,inspectorStatsMarkup} from './entity-inspector.js';
import {AGE_ROMAN,resourceWorkerCounts,ageProgressState,globalProductionItems,globalQueueMarkup,scoreboardMarkup,categorizedBuildMarkup,multiSelectCardsMarkup} from './hud-macro.js';
import {MINIMAP_FILTERS,TacticalAlerts,needsDemolishConfirm,resolveCommandDecalKind,resolveCursorState} from './tactical-ux.js';
import {selectionDetailsMarkup,closeCompactCommands,toggleCompactCommands,toggleSelectionDetails,closeSelectionDetails,toggleMinimapSize,resetCompactHud,isCompactHUD,shouldAutoCollapseObjectives,watchObjectiveLayout,watchPlacementLayout} from './compact-hud.js';
import {WORLD,AGES,UNITS,BUILDINGS,TECHS,MAPS,RELEASE,AGE_COSTS,FACTIONS,DIFFICULTIES,MODES,MISSIONS,costText,formatTime,availableTo} from './data.js';

const $=s=>document.querySelector(s),esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const read=(key,fallback)=>{try{return JSON.parse(localStorage.getItem(key))||fallback;}catch{return fallback;}};
const modestDevice=(navigator.deviceMemory||8)<=4||(navigator.hardwareConcurrency||8)<=4;
const recommendedQuality=modestDevice?'low':matchMedia('(pointer: coarse)').matches?'medium':'high';
const settings={quality:recommendedQuality,frameRate:'auto',cameraPreset:'balanced',edgeScroll:true,edgeScrollSpeed:1,volume:.65,musicVolume:1,uiVolume:1,music:true,unitVoices:true,warHorns:true,lighting:'day',weather:'auto',weatherSounds:true,lightning:true,fog:true,autoQuality:true,reduceFoliage:false,colorblind:false,healthBarMode:'smart',hudScale:'1',minimapSide:'left',...read('crowns-settings',{})};
delete settings.gpuTiming;delete settings.menuBackdrop;
settings.frameRate=normalizeFrameRate(settings.frameRate);
let offlineGraphicsPreference=null;
function saveSettings(){
  try{localStorage.setItem('crowns-settings',JSON.stringify({...settings,quality:offlineGraphicsPreference??settings.quality}));}catch{}
}
const progress=read('crowns-progress',{});const audio=new AudioEngine(settings);
let customDraft={map:'highlands',mapSize:'vast',playerSlot:1,spectator:false,startAge:0,resourceLevel:'standard',populationLimit:80,seed:2026,victory:'annihilation',shareVision:true,revealRemnants:true,slots:battlePreset('2v2'),...read('crowns-custom-setup',{})};
settings.bindings=readBindings(settings.bindings);
document.querySelector('#app').innerHTML=`
  <div id="world" class="world-poster" aria-label="3D strategy battlefield"></div><div class="vignette"></div><div id="graphics-status" class="graphics-status hidden" role="status">Updating graphics…</div>
  <div id="landing" class="landing">${landingMarkup(latestSaveSummary())}




  </div>
  <div id="hud" class="hidden">
    <div id="health-layer"></div>
    <header class="game-header"><button class="age-crest-btn" id="age-crest-btn" data-action="tech-tree" aria-label="Current age and technology tree" title="Technology tree (U)"><span class="age-roman" id="age-roman">I</span><span class="age-meta"><span id="age-label">Frontier Age</span><span class="age-progress-track hidden" id="age-progress-track"><i id="age-progress-fill"></i></span></span></button><div class="header-economy"><div id="resource-bar"></div><button id="idle-villager-pill" class="idle-pill hidden" data-action="idle" aria-label="Cycle idle villagers" title="Cycle idle villagers (.) · Shift-click selects all">${uiIcon("user-round")}<strong id="idle-villager-count">0</strong><span class="idle-pill-label">Idle</span></button></div><div class="time-controls"><span id="game-time">00:00</span><button data-action="tech-tree" id="tech-tree-toggle" aria-label="Technology tree" title="Technology tree (U)">${uiIcon("book-open")}<span class="header-button-label">Tech</span></button><button data-action="scoreboard" id="scoreboard-toggle" aria-label="Kingdom scores" aria-expanded="false" title="Kingdom scoreboard">${uiIcon("trophy")}<span class="header-button-label">Score</span></button><button data-action="alliance" id="alliance-toggle" class="hidden" aria-label="Allies and resource gifts" title="Allies and resource gifts">${uiIcon("gift")}<span class="header-button-label">Allies</span></button><button data-action="comms-toggle" id="comms-toggle" class="hidden" aria-label="War communications" aria-expanded="false" title="War comms: Ally orders & Enemy taunts (Alt+1..4)">${uiIcon("message-square")}<span class="header-button-label">Comms</span></button><button data-action="production" id="production-toggle" aria-label="Production overview" aria-expanded="false" title="Production overview (P)">${uiIcon("list-ordered")}<span class="header-button-label">Queues</span><span id="production-count" class="production-count hidden">0</span></button><button data-action="speed" id="speed-button" title="Game speed">1×</button><button data-action="pause" title="Menu & Pause (Esc)" aria-label="Menu and pause">${uiIcon("pause")}<span class="header-button-label">Menu</span></button></div></header>
    <aside id="objectives" class="objective-panel"></aside><div id="global-queue-strip" class="global-queue-strip hidden" aria-label="Active production and research"></div><aside id="scoreboard-panel" class="scoreboard-panel hidden" aria-label="Kingdom scoreboard"></aside><div id="alert-line"></div><div id="commander-dialogue" class="commander-dialogue hidden"></div><div id="explore-banner" class="explore-banner hidden"><span>EXPLORING BATTLEFIELD</span><button class="primary" data-action="show-summary">Match summary</button><button class="secondary" data-action="menu">Main menu</button></div><div id="replay-banner" class="explore-banner replay-banner hidden"><span id="replay-status">REPLAY · 00:00</span><div class="replay-track"><i id="replay-progress"></i></div><button class="secondary" data-action="replay-toggle" id="replay-toggle-btn">Pause</button><button class="secondary" data-action="replay-speed" id="replay-speed-btn">1×</button><button class="primary" data-action="menu">Exit replay</button></div>${battleChatMarkup()}${warCommsMarkup()}
    <nav class="camera-controls" aria-label="Battlefield camera"><button data-action="camera-left" aria-label="Rotate camera left" title="Rotate left (Q)">${uiIcon("rotate-ccw")}</button><button data-action="camera-right" aria-label="Rotate camera right" title="Rotate right (E)">${uiIcon("rotate-cw")}</button><button data-action="camera-closer" aria-label="Zoom in" title="Zoom in">${uiIcon("zoom-in")}</button><button data-action="camera-farther" aria-label="Zoom out" title="Zoom out">${uiIcon("zoom-out")}</button><button data-action="camera-view" aria-label="Change camera view" title="Change camera angle (V)"><span id="camera-view-label">Perspective</span></button><button data-action="camera-panels" aria-label="Toggle battlefield panels" aria-pressed="false" title="Show or hide battlefield panels">${uiIcon("columns-3")}</button><button data-action="camera-options" aria-label="More camera options" aria-expanded="false">${uiIcon("ellipsis")}</button></nav>
    <div id="selection-box"></div><div id="toasts" aria-live="polite"></div>
    <nav id="control-groups-bar" class="control-groups-bar hidden" aria-label="Control groups"></nav>
    <div class="bottom-hud"><aside class="map-panel"><div class="map-heading"><span>THE FRONTIER</span><div class="map-tools"><div class="map-filters" role="group" aria-label="Minimap filter">${MINIMAP_FILTERS.map(f=>`<button type="button" class="map-filter-btn ${f.id==='all'?'active':''}" data-map-filter="${f.id}" aria-pressed="${f.id==='all'}" title="${f.title}">${f.label}</button>`).join('')}</div><button data-action="ping-mode" id="map-flare-btn" aria-label="Tactical flare" aria-pressed="false" title="Drop tactical flare (Alt+Click)">${uiIcon("flag-triangle-right")}</button><button data-action="home" aria-label="Center on town" title="Center on town (H)">${uiIcon("house")}</button><button class="map-size-toggle" data-action="map-expand" aria-label="Expand minimap" aria-expanded="false">${uiIcon("map")}</button></div></div><canvas id="minimap" width="200" height="200" aria-label="Minimap: tap to move camera"></canvas><div class="map-footer"><span id="army-count"></span><span id="map-label"></span></div></aside><section id="selection-panel" class="selection-panel"></section><aside class="command-panel"><div class="command-heading">COMMAND</div><div class="command-buttons"><button data-action="army" title="Select army (M)">${uiIcon("swords")}<span>Army</span><kbd class="cmd-key" aria-hidden="true"></kbd></button><button data-action="idle" title="Select idle villagers (.)">${uiIcon("user-round")}<span>Idle</span><kbd class="cmd-key" aria-hidden="true"></kbd></button><button data-action="build" title="Construction (B)">${uiIcon("hammer")}<span>Build</span><kbd class="cmd-key" aria-hidden="true"></kbd></button><button data-action="attackmove" id="attackmove" aria-pressed="false" title="Attack move (F)">${uiIcon("target")}<span>Attack</span><kbd class="cmd-key" aria-hidden="true"></kbd></button><button data-action="stop" title="Stop (X)">${uiIcon("square")}<span>Stop</span><kbd class="cmd-key" aria-hidden="true"></kbd></button><button data-action="help" title="Controls (?)">${uiIcon("circle-help")}<span>Help</span><kbd class="cmd-key" aria-hidden="true"></kbd></button><button class="phone-command" data-action="home" title="Center on town">${uiIcon("house")}<span>Town</span></button><button class="phone-command" data-action="map-expand" aria-label="Expand minimap" aria-expanded="false">${uiIcon("map")}<span>Map</span></button><button class="command-options" data-action="command-options" aria-label="More commands" aria-expanded="false">${uiIcon("ellipsis")}<span>More</span></button></div><div class="control-hint" id="control-hint"></div></aside></div>
    <div id="build-panel" class="hidden floating-panel"></div><div id="placement-controls" class="hidden"><button data-action="cancel-build">Done building</button></div><aside id="production-panel" class="production-panel hidden" aria-label="Production overview"></aside><div class="game-bottomline"><span id="order-hint">Select units to issue orders.</span><button class="context-cancel" data-action="deselect" aria-label="Cancel active command">${uiIcon("x")}<span>Cancel</span></button></div>
  </div>
  <div id="modal-root"></div><div id="chronicle-root"></div><div id="rotate-hint"><span>${uiIcon("rotate-cw")}</span><strong>A wider world awaits</strong><p>Rotate your phone to landscape<br>for the best battlefield view.</p><button data-action="dismiss-rotate">Continue in portrait</button></div>
`;

const worldEl=$('#world'),graphicsStatusEl=$('#graphics-status'),hudEl=$('#hud'),healthLayerEl=$('#health-layer'),weatherLabelEl=$('#weather-label'),weatherButtonEl=weatherLabelEl?.parentElement||null;
let lastGraphicsBusy=null,lastGraphicsText='',lastWeatherText='',lastWeatherTitle='';
let selectionKey='',productionKey='',objectiveKey='',controlGroupKey='',activeSubgroup=null,productionOpen=false,buildCategory='economy',scoreboardOpen=false,globalQueueKey='',scoreboardKey='',idleCycleIndex=0,tcCycleIndex=0,minimapFilter='all',pingMode=false,demolishArmed=null,longPressTimer=0,longPressFired=false,alertClearTimer=0,atlasSelectedId=null,atlasActFilter='all',atlasFreeSelect=false,dialogueTimer=0;
const tacticalAlerts=new TacticalAlerts(),matchTimeline=new MatchTimeline(),replayRecorder=new MatchReplayRecorder();
const replayActions={
  formation:value=>{sim.players[0].formation=value;},
  autoWork:id=>{const worker=sim.get(id);if(worker){worker.order=null;sim.assignWorker(worker);}},
  allyOrder:(kind,x,z)=>warComms.issueAllyOrder(sim,{target:{x,z}},kind),
  enemyTaunt:kind=>warComms.sendEnemyTaunt(sim,kind),
  heroAutoCast:id=>{const hero=sim.get(id);if(hero)hero.autoCast=hero.autoCast===false;},
  heroSkill:(id,index)=>{const hero=sim.get(id);return hero&&triggerHeroSkill(sim,hero,index);},
};

function issueAllyOrder(kind){
  replayRecorder.note('allyOrder',kind,view.target.x,view.target.z);
  return warComms.issueAllyOrder(sim,view,kind);
}
let lastEndResult=null,summaryTab='overview',summaryMetric='scores',settingsTab='graphics',hubDraft=null,exploringEnd=false,activeReplay=null,lastReplayRecord=null,chronicleActive=false,chronicleTimer=0;
function applyHudPreferences(){if(!hudEl)return;hudEl.dataset.minimapSide=settings.minimapSide==='right'?'right':'left';hudEl.dataset.hudScale=String(settings.hudScale||'1');}
function refreshLanding(){const el=$('#landing');if(!el)return;el.innerHTML=landingMarkup(latestSaveSummary());if(typeof refreshInstallEntry==='function')refreshInstallEntry();if(!view)for(const b of el.querySelectorAll('button'))b.disabled=true;}
let objectivesUserToggled=false,objectiveChangedAt=0;
let allianceRecipient=null;
let modalOpener=null;
let tacticalMode=null;
let unloadMode=false;
let view,sim,playing=false,paused=false,speed=1,selection=[],buildType=null,attackMove=false,groups={},modal=null,uiTime=0,mapTime=0,accumulator=0,last=performance.now(),lastAutosave=0;
const wallDraft=new WallPlacement();let wallPlaced=false,wallPlanAt=-Infinity,wallPlanKey='',wallPlan=null,wallControlsKey='';
const simulationPacer=new SimulationPacer();
let pointer=null,hover=null,keys=new Set(),touches=new Map(),pinch=null,portraitDismissed=false,setupOptions={faction:'alder',difficulty:'normal',map:'highlands',mapSize:'large',seed:Math.floor(Math.random()*999999)};
const touchDevice=matchMedia('(pointer: coarse)').matches;
const chat=new BattleChatPanel($('#hud'),{send:(text,channel,requestId)=>net.chat(text,channel,requestId),onOpen:()=>{keys.clear();pointer=null;touches.clear();pinch=null;edgeScroll.reset();$('#selection-box').style.display='none';}});
const warComms=new WarCommsController($('#hud'),{audio,settings,onPing:(x,z,kind,label)=>dropTacticalPing(x,z,kind,label)});
const bootButtons=[...document.querySelectorAll('#landing button')];for(const button of bootButtons)button.disabled=true;
const startupSplash=createStartupSplash(document.querySelector('#app'));




const stopAssetProgress=onAssetProgress(({percent,label})=>{
  if(percent===null)return;
  startupSplash.setStatus(`Loading ${label}…`,Math.max(8,Math.round(percent*.92)));




});
const graphicsSession=(()=>{try{return sessionStorage;}catch{return null;}})();
const requestedRenderer=preferredRenderer(location.href,graphicsSession);
let lastGraphicsFailure=readGraphicsFailure(graphicsSession);
function currentGraphicsReport(failure=null,phase=playing?'battle':'landing'){
  const renderer=view?.renderer||startupRenderer;
  return graphicsReport({buildId:document.querySelector('meta[name="frontier-build"]')?.content||'development',phase,requested:requestedRenderer,active:renderer?rendererBackend(renderer):'unavailable',quality:view?.renderQuality||settings.quality,browser:navigator.userAgent,secure:globalThis.isSecureContext===true,viewport:{width:innerWidth,height:innerHeight,pixelRatio:devicePixelRatio},renderer,failure});
}
function recordGraphicsFailure(failure,phase){lastGraphicsFailure=rememberGraphicsFailure(graphicsSession,currentGraphicsReport(failure,phase));}
function graphicsSupport(){return graphicsSupportMarkup({current:currentGraphicsReport(),lastFailure:lastGraphicsFailure});}
startupSplash.setStatus('Initializing 3D renderer…',6);
let startupRenderer,startupFailure;try{startupRenderer=await initializeWorldRenderer({backend:requestedRenderer,onFallback:error=>{recordGraphicsFailure(error,'initialization');console.warn('WebGPU could not start; using WebGL 2:',error.message);}});document.documentElement.dataset.renderer=rendererBackend(startupRenderer);}catch(error){startupFailure=error;recordGraphicsFailure(error,'initialization');}
window.addEventListener('pagehide',event=>{if(event.persisted)return;releaseSurfaceCodec();if(!view&&startupRenderer)releaseRenderers({renderer:startupRenderer});});
// Keep using the authored battlefield catalogue, including on a cached launch.
for(;!startupFailure;){
  let attemptActive=true;
  try{
    let modelsReady=false,surfacesReady=false;
    const status=()=>{if(attemptActive)startupSplash.setStatus(modelsReady&&!surfacesReady?'Adding battlefield surfaces…':surfacesReady&&!modelsReady?'Loading buildings and troops…':'Preparing your kingdom…',modelsReady||surfacesReady?90:null);};
    const requestedQuality=settings.quality;
    const [loadedQuality]=await Promise.all([
      Promise.all([
        loadStartupAuthoredAssets(requestedQuality),
        loadBridgeArtwork(),
        loadBiomeArtwork().catch(error=>{console.warn('Biome artwork could not load:',error.message);return null;}),
        loadEarlyAgeArtwork().catch(error=>{console.warn('Early-age artwork could not load:',error.message);return null;}),
        loadIronholdArtwork().catch(error=>{console.warn('Ironhold artwork could not load:',error.message);return null;}),
        loadJadeHeroesArtwork().catch(error=>{console.warn('Jade & Heroes artwork could not load:',error.message);return null;}),
        loadEpicPropsArtwork().catch(error=>{console.warn('Epic props artwork could not load:',error.message);return null;}),
        // Optional: a missing or failed distant catalogue must never prevent
        // the game from starting. It only enables the extra LOD tier.
        settings.distantUnits===false?Promise.resolve(null):preloadDistantAssets().catch(error=>{console.warn('Distant artwork could not load:',error.message);return null;}),
      ]).then(([quality])=>{modelsReady=true;status();return quality;}),
      loadSurfaceAssets(requestedQuality,startupRenderer,{map:setupOptions.map||'highlands'}).catch(error=>console.warn('Detailed surfaces could not load:',error.message)).then(()=>{surfacesReady=true;status();}),
    ]);
    if(loadedQuality!==requestedQuality){
      offlineGraphicsPreference=requestedQuality;
      settings.quality=loadedQuality;
      await loadSurfaceAssets(loadedQuality,startupRenderer,{map:setupOptions.map||'highlands'}).catch(error=>console.warn('Cached battlefield surfaces could not load:',error.message));
    }
    break;
  }
  catch(error){
    attemptActive=false;
    console.warn('Battlefield artwork could not load:',error.message);
    await startupSplash.showError('The battlefield artwork could not load.','Check your connection, then try again.');
    resetAssetProgress();startupSplash.resetProgress('Preparing your kingdom…');





  }
}
stopAssetProgress();startupSplash.setStatus('Raising the citadel…',96);
try {if(startupFailure)throw startupFailure;view=new WorldView($('#world'),settings,startupRenderer);view.onGraphicsFailure=failure=>recordGraphicsFailure(failure);watchRendererDevice(view);} catch(error){
  if(!startupFailure)recordGraphicsFailure(error,'scene-startup');
  releaseRenderers(view||{renderer:startupRenderer});view=null;sim=null;startupRenderer=null;$('#world').textContent='';$('#landing').inert=true;
  const failure=document.createElement('div');failure.className='modal-backdrop';failure.style.position='fixed';failure.style.zIndex='100';
  failure.innerHTML=`<div class="modal" role="alertdialog" aria-modal="true" aria-labelledby="graphics-error-title" aria-describedby="graphics-error-body"><div class="eyebrow">GRAPHICS UNAVAILABLE</div><h2 id="graphics-error-title">3D graphics could not start.</h2><p id="graphics-error-body" class="modal-intro">This game needs a supported 3D graphics API (WebGPU or WebGL 2). Use an updated Chrome, Edge, Safari, or Firefox with hardware acceleration enabled, then reload the game.</p><p class="settings-note">${esc(error.message)}</p><button class="primary full" data-action="retry-graphics">Reload game</button>${graphicsSupport()}</div>`;
  document.body.append(failure);failure.querySelector('button').focus();console.error(error);
}
startupSplash.dismiss();for(const button of bootButtons)button.disabled=!view;

audio.setCombatListener(createCombatListener(view,()=>playing&&!paused&&!modal&&!document.hidden&&!sim.ended));
refreshLanding();applyHudPreferences();
const edgeScroll=new EdgeScroll();

const isAISpectator=()=>isSpectatingAI(playing,sim);
function toast(message,tone=''){
  const root=$('#toasts'),text=String(message),existing=[...root.children].find(el=>el.dataset.toastTone===tone&&el.textContent===text);
  if(existing){clearTimeout(existing.dismissTimer);existing.dismissTimer=setTimeout(()=>existing.remove(),4800);return existing;}
  const el=document.createElement('div');el.className=`toast ${tone}`;el.dataset.toastTone=tone;el.textContent=text;el.dismissTimer=setTimeout(()=>el.remove(),4800);root.append(el);
  while(root.children.length>3){const oldest=root.firstElementChild;clearTimeout(oldest.dismissTimer);oldest.remove();}
  return el;
}
function canAfford(cost){return !!sim?.canAfford?.(cost,0);}
function pruneGroups(){
  if(!sim)return;
  for(const key of Object.keys(groups)){
    const alive=groups[key].filter(id=>{const e=sim.get(id);return e&&e.hp>0&&e.owner===0&&!e.embarked;});
    if(alive.length)groups[key]=alive;else delete groups[key];
  }
}
function renderControlGroups(){
  const bar=$('#control-groups-bar');if(!bar)return;
  pruneGroups();
  const entries=Object.entries(groups).filter(([,ids])=>ids.length).sort(([a],[b])=>Number(a)-Number(b));
  if(!playing||!entries.length){bar.classList.add('hidden');controlGroupKey='';return;}
  const selectedSet=new Set(selection);
  const key=entries.map(([k,ids])=>`${k}:${ids.length}:${ids.every(id=>selectedSet.has(id))?1:0}`).join('|');
  bar.classList.remove('hidden');
  if(key===controlGroupKey)return;
  controlGroupKey=key;
  bar.innerHTML=entries.map(([k,ids])=>{
    const active=selection.length&&ids.length&&ids.every(id=>selectedSet.has(id));
    return `<button class="cg-pill ${active?'active':''}" data-group="${k}" title="Select group ${k} (double-click to focus, right-click to clear)"><span class="cg-num">${k}</span><span class="cg-count">${ids.length}</span></button>`;
  }).join('');
  positionControlGroups();
}
function positionControlGroups(){
  const bar=$('#control-groups-bar'),panel=$('#selection-panel');
  if(!bar||!panel||bar.classList.contains('hidden'))return;
  if(isCompactHUD(document)){bar.style.removeProperty('--cg-bottom');return;}
  const rect=panel.getBoundingClientRect();
  if(rect.height>0)bar.style.setProperty('--cg-bottom',`${Math.max(168,Math.ceil(innerHeight-rect.top+8))}px`);
}
if(typeof ResizeObserver==='function'&&$('#selection-panel'))new ResizeObserver(()=>positionControlGroups()).observe($('#selection-panel'));
function cycleSelectionGroup(reverse=false){
  const list=selected();if(list.length<2)return;
  const types=[...new Set(list.map(e=>e.type))];if(types.length<2)return;
  const current=types.includes(activeSubgroup)?activeSubgroup:types[0];
  activeSubgroup=types[(types.indexOf(current)+(reverse?-1:1)+types.length)%types.length];
  selectionKey='';renderSelection();
}
function updateAffordability(){
  if(!playing||!sim)return;
  const p=sim.players[0];
  for(const button of document.querySelectorAll('#build-panel [data-build]')){
    const def=BUILDINGS[button.dataset.build];
    button.classList.toggle('is-unaffordable',!!def&&!button.disabled&&!canAfford(sim.cost(wallBuildCost(sim,0,button.dataset.build),0,'building')));
  }
  for(const button of document.querySelectorAll('#selection-panel [data-train]')){
    const def=UNITS[button.dataset.train];
    button.classList.toggle('is-unaffordable',!!def&&!button.disabled&&!canAfford(sim.cost(def.cost,0,'unit',button.dataset.train)));
  }
  for(const button of document.querySelectorAll('#selection-panel [data-research]')){
    const type=button.dataset.research;
    const cost=type==='age'?(AGE_COSTS[p.age]||{}):(TECHS[type]?Object.fromEntries(Object.entries(TECHS[type].cost).map(([r,n])=>[r,n*(p.tech[type]+1)])):null);
    button.classList.toggle('is-unaffordable',!!cost&&!button.disabled&&!canAfford(cost));
  }
}
function setSelection(ids){selectionKey='';selection=[...new Set(ids)].filter(id=>{const e=selectionEntity(id);return e&&!e.embarked;});const types=[...new Set(selected().map(e=>e.type))];if(!types.includes(activeSubgroup))activeSubgroup=types[0]||null;view.selection=new Set(selection);$('#selection-panel').scrollTop=0;$('#selection-panel').classList.remove('selection-expanded');audio.play('select');const firstLead=selection.map(id=>sim.get(id)).find(e=>e&&e.owner===0&&isHumanVoiceUnit(e));if(firstLead)audio.voice?.('select',firstLead,sim.players[0]?.faction);renderSelection();renderControlGroups();}
function selectionEntity(id){return sim.resourceMemory?.get(id)??sim.get(id);}
function selected(){return selection.map(selectionEntity).filter(Boolean);}
function resourceAmountText(site){
  const amount=Math.round(site.amount);
  return sim.isVisible(site.x,site.z)?`${amount} remaining`:`${amount} last seen`;
}
function workers(){return selected().filter(e=>e.owner===0&&e.type==='villager').map(e=>e.id);}
function updateCameraLabel(){const label=$('#camera-view-label');if(label)label.textContent=(CAMERA_PRESETS[settings.cameraPreset]||CAMERA_PRESETS.balanced).label;}
function closeModal(){if(view?.graphicsFatal&&modal==='graphics-recovery')return;if(modal==='pause'||modal==='campaign'||modal==='settings-game'||modal==='help-game'||modal==='codex-game'||modal==='tree-game'||modal==='journal-game'||modal==='alliance'||modal==='saves-game')paused=false;const closing=modal;modal=null;$('#modal-root').innerHTML='';nearby?.modalClosed(closing);const opener=modalOpener;modalOpener=null;if(opener?.isConnected&&opener.getClientRects().length)opener.focus({preventScroll:true});}
function showModal(content,kind='info',wide=false){chat.close(false);if(!modal)modalOpener=document.activeElement;edgeScroll.reset();modal=kind;$('#modal-root').innerHTML=`<div class="modal-backdrop"><section class="modal ${wide?'wide':''}" role="dialog" aria-modal="true"><button class="modal-close" data-action="close" aria-label="Close dialog">${uiIcon("x")}</button>${content}</section></div>`;const dialog=$('#modal-root .modal'),heading=dialog.querySelector('h2');if(heading){heading.id='dialog-heading';dialog.setAttribute('aria-labelledby',heading.id);}if(kind==='end')dialog.classList.add('result-dialog');if(kind==='settings'||kind==='settings-game')appendKeyboardSettings($('#modal-root'),settings.bindings);if(kind==='help'||kind==='help-game')$('#modal-root .help-grid').after(Object.assign(document.createElement('section'),{className:'current-controls',innerHTML:'<h3>Your active keyboard controls</h3>'+activeControlsMarkup(settings.bindings)}));$('#modal-root').querySelector('button')?.focus({preventScroll:true});}
function showSkirmishHub(){if(!hubDraft)hubDraft={mode:'skirmish',faction:setupOptions.faction,difficulty:setupOptions.difficulty,map:setupOptions.map,mapSize:setupOptions.mapSize||'large',seed:setupOptions.seed};showModal(skirmishHubMarkup(hubDraft),'setup',true);$('#modal-root .modal').classList.add('skirmish-hub-dialog');updateSetupDescriptions();}
function showSetup(mode='skirmish'){if(mode==='custom')return showCustomBattle();if(MISSIONS.some(m=>m.id===mode))return showCampaign(mode);hubDraft={mode,faction:setupOptions.faction,difficulty:setupOptions.difficulty,map:setupOptions.map,mapSize:setupOptions.mapSize||'large',seed:setupOptions.seed};showSkirmishHub();}
function updateSetupDescriptions(){if($('#faction-description')&&$('#faction'))$('#faction-description').textContent=FACTIONS[$('#faction').value].desc;if($('#difficulty-description')&&$('#difficulty'))$('#difficulty-description').textContent=DIFFICULTIES[$('#difficulty').value].desc;if($('#ai-personality-description')&&$('#ai-personality'))$('#ai-personality-description').textContent=(AI_PERSONALITIES[$('#ai-personality').value]||AI_PERSONALITIES.balanced).desc;}
function showCustomBattle(preset=null){if(playing)paused=true;if(preset){if(modal==='custom-setup')customDraft=readBattleSetup($('#modal-root'));customDraft.slots=battlePreset(preset);const role=Number(customDraft.playerSlot);if(role>0&&!customDraft.slots[role-1]?.enabled){customDraft.playerSlot=1;customDraft.spectator=false;}}showModal(customBattleMarkup(customDraft),'custom-setup',true);$('#modal-root .modal').classList.add('custom-dialog');updateBattlePreview($('#modal-root'));}
function launchCustom(multiplayer){
  try{customDraft=readBattleSetup($('#modal-root'));localStorage.setItem('crowns-custom-setup',JSON.stringify(customDraft));
    if(!multiplayer)return startGame({...normalizeBattle({...customDraft,multiplayer:false}),showBriefing:true});
    const options=customHostOptions(customDraft),create={type:'create',name:options.hostSpectator?'Host':options.slots[0].name,faction:options.slots[0].faction,options};if(netMode==='nearby')return nearby.hostRoom(create);if(net.socket||net.transport)net.leave();showModal('<h2>Creating your war room...</h2><button class="secondary" data-action="lan-leave">Cancel</button>','lan');net.connect(create);
  }catch(error){toast(error.message,'warning');}
}
function showJournal(){if(!sim.campaignState||sim.campaignState.legacy)return;if(playing)paused=true;showModal('<div class="eyebrow">THE FRONTIER CHRONICLES</div><h2>Campaign journal.</h2><div class="campaign-journal">'+sim.campaignState.history.map(entry=>'<article><span>'+esc(entry.speaker)+' · '+formatTime(entry.time)+'</span><p>'+esc(entry.text)+'</p></article>').join('')+'</div><p class="journal-optional">Optional goal: '+esc(CAMPAIGN_SCRIPTS[sim.options.mode].optional.text)+'</p>','journal-game',true);}
function clearCommanderDialogue(){clearTimeout(dialogueTimer);const box=$('#commander-dialogue');if(box){box.classList.add('hidden');box.innerHTML='';}}
function clearChronicleOverlay(){clearTimeout(chronicleTimer);chronicleTimer=0;chronicleActive=false;const root=$('#chronicle-root');if(root)root.innerHTML='';}
function beginFromChronicle(){if(!chronicleActive)return;clearChronicleOverlay();if(!playing||!sim)return;paused=false;simulationPacer.reset();accumulator=0;audio.unlock();if(settings.warHorns!==false)audio.warHorn?.();const focusTarget=sim.owned(0,'building','towncenter')[0]||sim.owned(0,'unit','king')[0]||sim.owned(0,'unit')[0];if(focusTarget)view?.focus?.(focusTarget.x,focusTarget.z);const introScript=CAMPAIGN_SCRIPTS[sim.options.mode];if(introScript){showCommanderDialogue(introScript.speaker,sim.mission?`Chapter ${sim.mission.chapter} · ${sim.mission.name}`:'',introScript.intro,16000);warComms.speak({speaker:introScript.speaker,role:'ally',faction:sim.players?.[0]?.faction||'alder',text:introScript.intro,showBanner:false});}else{warComms.announceOpening(sim);toast(isAISpectator()?'Select a kingdom on the roster to follow the battle.':'Your kingdom awaits. Select a villager or your town center.');}}
function openChronicleOverlay(options){clearChronicleOverlay();const root=$('#chronicle-root');if(!root)return;chronicleActive=true;paused=true;root.innerHTML=missionLoadingMarkup(options);const setStep=(pct,msg)=>{const fill=$('#chronicle-progress-fill'),lbl=$('#chronicle-status-text'),num=$('#chronicle-percent'),bar=$('#chronicle-progressbar');if(fill)fill.style.width=`${pct}%`;if(lbl)lbl.textContent=msg;if(num)num.textContent=`${pct}%`;if(bar)bar.setAttribute('aria-valuenow',String(pct));};setStep(35,'Carving terrain passes & stone cliffs…');chronicleTimer=setTimeout(()=>{if(!chronicleActive)return;setStep(78,'Fortifying castles & deploying regiments…');chronicleTimer=setTimeout(()=>{if(!chronicleActive)return;setStep(100,'Battlefield ready.');$('#chronicle-progress-wrap')?.classList.add('hidden');const btn=$('#chronicle-begin-btn');if(btn){btn.classList.remove('hidden');btn.focus({preventScroll:true});}},340);},280);}
function showCommanderDialogue(speaker,title,text,duration=9500){const box=$('#commander-dialogue');if(!box||!text)return;clearTimeout(dialogueTimer);warComms?.hideBanner?.();box.innerHTML=commanderBannerMarkup({speaker,title,text});box.classList.remove('hidden');dialogueTimer=setTimeout(clearCommanderDialogue,duration);}
function showCampaign(focusId=null){chat.close(false);if(!modal)modalOpener=document.activeElement;if(playing)paused=true;edgeScroll.reset();if(focusId)atlasSelectedId=focusId;else if(!atlasSelectedId)atlasSelectedId=nextCampaignMissionId(progress,atlasFreeSelect);modal='campaign';$('#modal-root').innerHTML=`<div class="modal-backdrop atlas-backdrop">${campaignMapMarkup({progress,selectedId:atlasSelectedId,actFilter:atlasActFilter,freeSelect:atlasFreeSelect,setupOptions})}</div>`;$('#modal-root [data-atlas-launch],#modal-root .atlas-close')?.focus({preventScroll:true});}
function startGame(options,save=null){if(!view)return;clearChronicleOverlay();replayRecorder.detach();activeReplay=null;lastReplayRecord=null;$('#replay-banner')?.classList.add('hidden');chat.close(false);if(!net.active)chat.reset();resetCompactHud(document);objectivesUserToggled=false;objectiveChangedAt=0;audio.clearCombat();edgeScroll.reset();audio.lastThunder=undefined;tacticalMode=null;unloadMode=false;pingMode=false;demolishArmed=null;tacticalAlerts.clear();minimapFilter='all';view.tacticalAlerts=tacticalAlerts;view.minimapFilter='all';for(const b of document.querySelectorAll('[data-map-filter]')){const on=b.dataset.mapFilter==='all';b.classList.toggle('active',on);b.setAttribute('aria-pressed',String(on));}$('#map-flare-btn')?.classList.remove('active');$('#map-flare-btn')?.setAttribute('aria-pressed','false');$('#alert-line').innerHTML='';clearTimeout(alertClearTimer);productionOpen=false;productionKey='';scoreboardOpen=false;scoreboardKey='';globalQueueKey='';idleCycleIndex=0;tcCycleIndex=0;$('#production-panel').classList.add('hidden');$('#production-toggle').setAttribute('aria-expanded','false');$('#scoreboard-panel')?.classList.add('hidden');$('#scoreboard-toggle')?.setAttribute('aria-expanded','false');$('#global-queue-strip')?.classList.add('hidden');$('#hud').classList.remove('panels-hidden');$('[data-action=camera-panels]').setAttribute('aria-pressed','false');closeModal();const replayRec=options?.replayRecord||null;if(replayRec){sim=new Simulation({...replayRec.options,replay:true});activeReplay=new ReplayDriver(replayRec,replayActions);$('#replay-banner')?.classList.remove('hidden');$('#replay-toggle-btn').disabled=false;setUIText($('#replay-toggle-btn'),'Pause');setUIText($('#replay-speed-btn'),'1×');}else{setupOptions={...setupOptions,...options};sim=save?Simulation.restore(save):new Simulation(options);if(!save&&!net.active&&!sim.options.multiplayer)replayRecorder.attach(sim,sim.options);}
  if(net.active&&save?.options?.spectator===true)sim.options.spectator=true;
  $('#world').classList.add('world-poster');presentingMatch=null;
  if(net.active&&save?.visible){sim.visible=save.visible;sim.explored=save.explored;}
  playing=true;exploringEnd=false;lastEndResult=null;$('#explore-banner')?.classList.add('hidden');matchTimeline.reset();matchTimeline.sample(sim,true);applyHudPreferences();$('#hud').classList.toggle('ai-spectator',isAISpectator());view.attach(sim);applyPlayerPalette();sim.on(onEvent);warComms.reset(sim);paused=false;speed=1;groups={};controlGroupKey='';activeSubgroup=null;$('#control-groups-bar')?.classList.add('hidden');$('#toasts').innerHTML='';clearCommanderDialogue();selection=[];view.selection=new Set();cancelBuild();setAttackMove(false);simulationPacer.reset();accumulator=0;lastAutosave=sim.time;$('#landing').classList.add('hidden');$('#hud').classList.remove('hidden');view.angle=Math.PI/4;view.setCameraPreset(settings.cameraPreset,true);updateCameraLabel();audio.unlock();const focusStart=sim.owned(0,'building','towncenter')[0]||sim.owned(0,'unit','king')[0]||sim.owned(0,'unit')[0];if(focusStart)view.focus(focusStart.x,focusStart.z);renderHUD();renderSelection();updateRotate();if(options?.showBriefing&&!save&&!activeReplay&&!net.active&&!sim.options.multiplayer){openChronicleOverlay(sim.options);}else{const introScript=CAMPAIGN_SCRIPTS[sim.options.mode];if(introScript&&!save){showCommanderDialogue(introScript.speaker,sim.mission?`Chapter ${sim.mission.chapter} · ${sim.mission.name}`:'',introScript.intro,16000);warComms.speak({speaker:introScript.speaker,role:'ally',faction:sim.players?.[0]?.faction||'alder',text:introScript.intro,showBanner:false});}else{if(!save)warComms.announceOpening(sim);toast(isAISpectator()?'Select a kingdom on the roster to follow the battle.':'Your kingdom awaits. Select a villager or your town center.');}}if(sim.options.mode==='tutorial')toast('Start with the objectives in the upper-left corner.');if(sim.ended)showEnd(sim.ended);}
function onEvent(e){if(['notice','research','sound'].includes(e.type)&&e.owner!==undefined&&e.owner!==0)return;
  if(isAISpectator()&&['notice','research','sound','complete','trained','alarm','raid','wave','capture','donation'].includes(e.type))return;
  if(e.type==='notice')toast(e.message,e.tone);
  if(e.type==='kingdom-defeated')toast(`${e.name} has been eliminated.${e.owner===0&&!isAISpectator()?' You can watch your allies continue.':''}`);
  if(e.type==='remnants-revealed')toast(`${e.name}: the last buildings are marked on the radar.`);
  if(e.type==='ally-support'&&sim.allied(0,e.ally))toast(`${sim.players[e.owner]?.name||'Your ally'} is sending ${e.count} reinforcements to ${e.ally===0?'your base':sim.players[e.ally]?.name||'an allied base'}.`);
  if(e.type==='donation'&&(e.from===0||e.to===0)){toast(e.from===0?`Sent ${e.amount} ${e.resource} to ${sim.players[e.to].name}.`:`${sim.players[e.from].name} sent you ${e.amount} ${e.resource}.`);renderHUD();refreshAllianceModal(modal==='alliance'?$('#modal-root'):null,sim,allianceRecipient);}
  if(e.type==='complete'){if(e.entity){tacticalAlerts.record(e.entity.x,e.entity.z,'info',`${wallDisplayName(sim,e.entity)} completed`);view?.celebrateBuild?.(e.entity);}toast(`${wallDisplayName(sim,e.entity)} completed.`);audio.play('complete');renderSelection();}
  if(e.type==='trained'&&e.entity.owner===0){audio.play('complete');if(e.entity.type==='villager'&&!e.entity.order)sim.assignWorker(e.entity);}
  if(e.type==='research'){if(e.tech==='age')view?.celebrateAgeUp?.(sim.owned(0,'building','towncenter')[0]);toast(e.tech==='age'?(e.age===2?`${AGES[e.age]} reached. Palisades upgraded to stone walls; new troops and buildings unlocked.`:`${AGES[e.age]} reached. New troops and buildings unlocked.`):`${TECHS[e.tech].name} completed.`);audio.play('complete');renderSelection();}
  if(e.type==='order'){audio.play('order');}
  if(e.type==='sound')audio.play(e.name);
  if(e.type==='alarm'){if(Number.isFinite(e.x)&&Number.isFinite(e.z))tacticalAlerts.record(e.x,e.z,'danger','Under attack');$('#alert-line').innerHTML=`<button type="button" class="alert-jump" data-action="last-alert" title="Jump to attack location (Backspace)"><span class="alert-pulse"></span><span>YOUR KINGDOM IS UNDER ATTACK</span><small>${touchDevice?'Tap to jump':'Click · Backspace'}</small></button>`;audio.announceAttack?.('Your kingdom is under attack.');clearTimeout(alertClearTimer);alertClearTimer=setTimeout(()=>{$('#alert-line').innerHTML='';},8000);}
  if(e.type==='raid'){toast('Scouts report an enemy army on the move.','warning');audio.warHorn?.();}
  if(e.type==='wave'){toast(`Wave ${e.wave} · ${e.count} enemies approach. Supplies have arrived.`,'warning');audio.announceAttack?.('An enemy wave is approaching.');}
  if(e.type==='capture'){toast(e.owner===0?'An ancient shrine is under your control.':'The enemy has captured a shrine.',e.owner===0?'':'warning');audio.play('complete');}
  if(e.type==='attack'||e.type==='projectile-impact'||e.type==='death'||e.type==='heal'){view.effect(e);if(e.type==='attack'){if(e.pendingImpact)audio.combat(e.entity,e.target,['catapult','trebuchet','warship'].includes(e.entity.type)?'wood':'arrow');else audio.play('attack',e.entity,e.target);}if(e.type==='projectile-impact'){audio.combat(e.target,e.entity,projectileImpactSound(e));if(e.fireball)audio.triggerSiegeStinger?.('siege');}}
  if(e.type==='hero-skill'){view.effect(e);if(e.owner===0){audio.triggerSiegeStinger?.('hero');toast(`${e.heroTitle} unleashed ${e.skillName}!`);}}
  if(e.type==='hero-levelup'){view.effect(e);if(e.owner===0){audio.play('complete');toast(`${e.title} reached Level ${e.level}!`);renderSelection();}}
  if(e.type==='veteran'&&e.owner===0){audio.play('complete');toast(`${UNITS[e.entity?.type]?.name||'Soldier'} promoted to ${['','Veteran ★','Elite ★★','Champion ★★★'][e.rank]||''}!`);renderSelection();}
  if(e.type==='spoils'&&e.owner===0){audio.play('complete');toast(`Spoils of war: +${e.gold} Gold, +${e.wood} Wood from enemy ${BUILDINGS[e.target?.type]?.name||'stronghold'}!`);renderHUD();}
  if(e.type==='boiling-oil'){view.effect(e);if(e.owner===0)audio.triggerSiegeStinger?.('oil');}
  if(e.type==='wonder-started'){tacticalAlerts.record(e.x,e.z,e.owner===0?'info':'danger',e.wonderName);toast(e.owner===0?`Constructing ${e.wonderName}!`:`Warning: ${e.name||'A rival'} began building ${e.wonderName}!`,e.owner===0?'':'warning');audio.warHorn?.();}
  if(e.type==='wonder-completed'){view.effect(e);audio.triggerSiegeStinger?.('wonder');toast(`${e.wonderName} completed! ${e.power}`);renderHUD();}
  if(e.type==='campaign-stage'){const sp=CAMPAIGN_SCRIPTS[sim.options.mode]?.speaker||'Frontier Marshal';showCommanderDialogue(sp,'Objective updated',e.text,9000);audio.play('complete');renderHUD();}
  if(e.type==='campaign-event'){const sp=e.speaker||CAMPAIGN_SCRIPTS[sim.options.mode]?.speaker||'Frontier Scouts';showCommanderDialogue(sp,e.enemy?'Enemy Warlord':'Allied Command',e.text,8500);audio.play(e.enemy?'alarm':'complete');renderHUD();}
  if(e.type==='campaign-sidequest'){const sp=CAMPAIGN_SCRIPTS[sim.options.mode]?.speaker||'Frontier Marshal';showCommanderDialogue(sp,`Side Quest Complete · ${e.title}`,`Reward delivered: ${e.rewardText}.`,9500);audio.play('complete');renderHUD();}
  if(e.type==='campaign-checkpoint'){saveGame(true);toast('Campaign checkpoint saved. Restore it from the commander menu.');}
  if(!isAISpectator())warComms.onSimEvent(sim,e);
  if(e.type==='end'){warComms.cancelSpeech();showEnd(e);}
}
function saveGame(automatic=false){if(activeReplay)return false;const result=writeLocalSave(sim,{networkActive:net.active});if(!automatic){if(result==='network')toast('Network games reconnect through the room session. Local saving is for single-player matches.');else if(result==='saved')toast('Your kingdom has been saved on this device.');else toast('This browser could not store the save. Free storage or enable local storage.','warning');}return result==='saved';}
function showSaveManager(){if(playing)paused=true;const networkActive=net.active||!!sim?.options?.multiplayer;showModal(saveManagerMarkup(listSaveSlots(),{canSave:playing&&!sim?.ended&&!activeReplay,networkActive,replays:listReplays()}),playing?'saves-game':'saves',true);}
function renderEndSummary(){if(!sim||!lastEndResult)return;const isCampaign=!!sim.mission,nextId=isCampaign&&lastEndResult.won?nextChapterAfter(sim.options.mode):null;showModal(matchSummaryMarkup(sim,lastEndResult,{samples:matchTimeline.snapshot(),tab:summaryTab,metric:summaryMetric,nextChapterId:nextId,hasReplay:Boolean(lastReplayRecord&&!activeReplay)}),'end',true);}
function showEnd(result){paused=true;exploringEnd=false;$('#explore-banner')?.classList.add('hidden');$('#replay-banner')?.classList.add('hidden');buildType=null;clearCommanderDialogue();view.hideGhost();matchTimeline.sample(sim,true);if(replayRecorder.active&&!activeReplay){lastReplayRecord=replayRecorder.buildRecord(result);if(!lastReplayRecord||!saveReplay(lastReplayRecord))toast('This match replay could not be stored.','warning');replayRecorder.detach();}lastEndResult=result;summaryTab='overview';summaryMetric='scores';const isCampaign=!!sim.mission;if(!activeReplay&&!result.spectator&&result.won){progress[sim.options.mode]=isCampaign?mergeCampaignVictory(progress[sim.options.mode],{won:true,difficulty:sim.options.difficulty,optional:sim.campaignState?.optional,route:sim.campaignState?.route,seconds:sim.time}):true;try{localStorage.setItem('crowns-progress',JSON.stringify(progress));}catch{}audio.play('victory');}renderEndSummary();}
function showPause(){paused=true;const network=net.active||!!sim.options.multiplayer;showModal(`<div class="eyebrow">${network?"MULTIPLAYER":"PAUSE MENU"}</div><h2>${network?(isAISpectator()?'Spectator menu':'Commander menu'):'Game paused'}</h2>${network?'<p class="modal-intro">The network match continues while this menu is open.</p>':''}<p class="modal-intro">${AGES[sim.players[0].age]} · ${formatTime(sim.time)} · ${DIFFICULTIES[sim.options.difficulty].name}</p><div class="pause-actions"><button class="primary full" data-action="close">Return to battle ${uiIcon("chevron-right")}</button>${network&&net.session&&net.socket?.readyState!==WebSocket.OPEN?`<button class="secondary full" data-action="lan-resume">${nearby.isGuest()?'Rejoin with a new invite':'Reconnect now'}</button>`:''}${network&&nearby.isHosting()?'<button class="secondary full" data-action="nearby-invite-modal">Invite or reconnect a nearby player</button>':''}${network||activeReplay?'':'<button class="secondary full" data-action="save">Quick save (Auto-Save)</button><button class="secondary full" data-action="saves">Save / Load slots</button>'}${sim.campaignCheckpoint?'<button class="secondary full" data-action="checkpoint">Restore campaign checkpoint</button>':''}${sim.campaignState&&!sim.campaignState.legacy?'<button class="secondary full" data-action="journal">Campaign journal</button>':''}<button class="secondary full" data-action="settings">Settings</button><button class="secondary full" data-action="help">Controls & strategy</button><button class="secondary full" data-action="fullscreen">Enter fullscreen</button>${sim.options.mode==='custom'&&!sim.players[0].defeated&&!sim.options.spectator?'<button class="text-button" data-action="resign">Resign your kingdom</button>':''}<button class="text-button" data-action="menu">${network?'Leave battle & return to menu':activeReplay?'Return to menu':'Save & return to menu'}</button></div>`,'pause');}
function showSettings(tab=settingsTab){if(playing)paused=true;settingsTab=tab||'graphics';const graphicsMode=graphicsSelection(settings),rendererStatusText=rendererStatus({requested:requestedRenderer,active:rendererBackend(view.renderer),secure:globalThis.isSecureContext!==false});showModal(settingsModalMarkup({settings,graphicsMode,rendererStatusText,graphicsSupportHtml:graphicsSupport(),activeTab:settingsTab}),playing?'settings-game':'settings',true);}
function showCredits(){if(playing)paused=true;showModal(`<div class="eyebrow">CROWNS OF THE FRONTIER</div><h2>About & credits</h2><p class="modal-intro">An original 3D real-time strategy game for mouse and touch.</p><section class="interface-credits"><h3>Interface artwork</h3><p>Interface symbols are from <a href="https://lucide.dev" target="_blank" rel="noopener">Lucide</a>, used under the ISC license.</p><p>The siege ram is by Skoll and the trebuchet is by Delapouite, from <a href="https://game-icons.net" target="_blank" rel="noopener">Game-icons.net</a>, used under <a href="https://creativecommons.org/licenses/by/3.0/" target="_blank" rel="noopener">CC BY 3.0</a>. Icons are resized and recolored for this interface.</p><p><a href="/ICON_LICENSES.txt" target="_blank" rel="noopener">Full icon licenses and notices</a></p><h3>Typography</h3><p>DM Sans and Cormorant Garamond are bundled under the SIL Open Font License.</p></section>`,playing?'credits-game':'credits');}
function showHelp(){
  if(playing)paused=true;
  const phone=`<div><h3>Phone & tablet</h3><p>Play in landscape. Tap your units to select. With a unit selected, tap open ground to move, an enemy to attack, or a resource to gather.</p><p>Select a town center, castle or watchtower and tap <b>Shelter</b> to call nearby villagers inside. They add defensive arrows while gathering is paused. Tap <b>Return to work</b> to release them. Selected villagers also have a <b>Shelter</b> button.</p><p>Tap <b>Deselect</b> (× on the selection bar) to clear your selection; your troops keep their orders. To inspect a different building, tap ×, then tap that building.</p><p>Drag the battlefield to look around, even with units selected. Pinch the battlefield with two fingers to zoom in or out while the interface stays the same size. Tap the top-right <b>⋯</b> button to rotate the camera, change viewing angle, or hide panels. Double-tap a troop to select nearby troops of the same type. <b>Army</b> selects your soldiers; <b>Idle</b> selects idle workers.</p><p>Tap <b>Build</b>, choose a building, then tap open land. For <b>walls</b>, tap a start and an end, or drag a line. Review the preview and stone cost, then tap <b>Build wall</b>. The camera stays still while drawing. Tap <b>Move map</b> to look around, then <b>Place wall</b> to continue. Pinch to zoom without placing walls. <b>Reset</b> clears only the preview. <b>Cancel</b> or <b>Done</b> leaves the wall tool; already ordered walls keep building. Builders continue through your unfinished walls, including separate lines and individual sections. <b>Stop</b> or a new command interrupts their work. For other buildings, tap <b>Done building</b> to leave placement.</p><p>Placed something by mistake? Tap <b>×</b> to deselect, select the building, then open its <b>Options</b>. <b>Cancel construction</b> refunds 70% for unfinished buildings; <b>Demolish</b> refunds 20% for completed buildings. Removing a wall leaves a real gap.</p><p>Tap or drag the square minimap to move the camera. Its outlined box and center dot locate your view. Tap <b>More</b> for Attack, Stop, Town and Map. Tap the selection's <b>Options</b> for research and advanced orders. Training appears on completed buildings. <b>Queues</b> in the top bar opens production; +5 queues a batch.</p><p>In multiplayer, tap <b>Chat</b> to message everyone or just your human allies. Close chat to free the battlefield. Chat messages stay only in the room while the server is running.</p><p>Tap <b>Menu</b>, then <b>Controls & strategy</b>, to open this guide again.</p></div>`;
  const desktop=`<div><h3>Mouse & keyboard</h3><p>Move the mouse to an edge of the game window to scroll the camera. Corners scroll diagonally; the cursor arrow shows the direction. Use fullscreen to scroll at the screen edges. Adjust Mouse edge scrolling and its speed in Settings.</p><p>Click to select. Drag a box to select a group. Shift-click adds units. Double-click selects nearby troops of the same type.</p><p><b>Right-click</b> to move, attack, gather, build, repair, heal, or set a building's rally point. <b>Shift + right-click</b> queues orders.</p><p><b>WASD / arrows:</b> pan · <b>Q/E:</b> rotate · <b>V:</b> camera angle / <b>Wheel:</b> zoom · <b>Middle drag:</b> pan · <b>H:</b> town · <b>M:</b> army · <b>B:</b> build · <b>F:</b> attack move · <b>X:</b> stop · <b>.:</b> idle worker · <b>Esc:</b> pause/cancel</p><p><b>Walls:</b> choose Build → Wall, then click a start and an end or drag a line. Review the preview, then choose <b>Build wall</b>. Drawing locks mouse edge scrolling. Use <b>Move map</b>, middle drag, the minimap or camera keys to look around. <b>Reset</b> clears the preview; <b>Cancel</b>, right-click or Esc leaves the tool. Already ordered walls keep building.</p><p><b>Ctrl + 1–9:</b> store group · <b>1–9:</b> recall group · <b>Space:</b> focus selection</p></div>`;
  showModal(`<div class="eyebrow">THE COMMANDER'S HANDBOOK</div><h2>Controls & strategy</h2><div class="help-grid">${touchDevice?phone+desktop:desktop+phone}</div><div class="strategy-tip"><b>A good first five minutes</b><p>Keep training villagers. Build houses before reaching the population cap. Place gathering camps near resources. Mix spearmen with archers, advance your age, and bring siege weapons against fortifications. Add healers to preserve expensive troops.</p></div><button class="secondary" data-action="codex">Open the complete field guide</button><button class="text-button" data-action="credits">About & icon credits</button>`,playing?'help-game':'help',true);
}
let treeFaction=null;
function showTechnologyTree(faction=null){const top=modal==='tree'||modal==='tree-game'?$('#modal-root .modal').scrollTop:0;treeFaction=faction||(playing?sim.players[0].faction:setupOptions.faction);if(playing)paused=true;showModal(technologyTreeMarkup(playing?sim:null,treeFaction),playing?'tree-game':'tree',true);$('#modal-root .modal').classList.add('technology-modal');$('#modal-root .modal').scrollTop=top;}
function showCodex(tab='units'){if(playing)paused=true;const lists={units:UNITS,buildings:BUILDINGS,technologies:TECHS};showModal(`<div class="eyebrow">KNOWLEDGE IS POWER</div><h2>Field guide</h2><button class="secondary" data-action="tech-tree">Explore the technology tree</button><nav class="codex-tabs">${Object.keys(lists).map(t=>`<button class="${t===tab?'active':''}" data-codex="${t}">${t[0].toUpperCase()+t.slice(1)}</button>`).join('')}</nav><div class="codex-list">${Object.entries(lists[tab]).map(([id,d])=>`<article class="codex-item"><span class="codex-icon">${ICONS[id]||uiIcon('circle-help')}</span><div><h3>${d.name} <small>${AGES[d.age]}</small></h3><p>${d.desc}</p><span class="cost">${costText(d.cost)} ${d.hp?` · ${d.hp} base HP`:''} ${d.time?` · ${d.time}s`:''}</span></div></article>`).join('')}</div><div class="strategy-tip"><b>Unit counters</b><p>Spearmen → cavalry · cavalry → archers · archers → spearmen · armored infantry → light troops · siege → buildings. Troops gain strength with each age. Research stacks with civilization bonuses.</p></div>`,playing?'codex-game':'codex',true);}
function renderBuildPanel(){const panel=$('#build-panel');if(!panel||!sim)return;panel.classList.remove('hidden');panel.innerHTML=categorizedBuildMarkup(sim,buildCategory);updateAffordability();}
function toggleBuild(){if(buildType){cancelBuild();return;}const panel=$('#build-panel');if(panel&&!panel.classList.contains('hidden')){cancelBuild();return;}const ws=workers();if(!ws.length){const free=sim.owned(0,'unit','villager').filter(e=>!e.order&&!e.embarked);setSelection((free.length?free:sim.owned(0,'unit','villager').filter(e=>!e.embarked)).slice(0,2).map(e=>e.id));}if(!workers().length)return toast('Train a villager before constructing buildings.','warning');if(isCompactHUD(document))$('#objectives')?.classList.remove('objectives-expanded');renderBuildPanel();}
function syncContextBanner(){$('.game-bottomline')?.classList.toggle('context-command',!!buildType||attackMove||!!tacticalMode||unloadMode||pingMode);updateWorldCursor();}
function updateWorldCursor(target=null){if(!worldEl||!playing||!sim){if(worldEl)worldEl.dataset.cursor='default';return;}const next=resolveCursorState(sim,selected(),target,{buildType,attackMove,tacticalMode,unloadMode,pingMode});if(worldEl.dataset.cursor!==next)worldEl.dataset.cursor=next;}
function dropTacticalPing(x,z,kind='flare',label='Tactical flare'){if(!playing||!sim||!insideMap(x,z,sim.worldSize))return;const recorded=tacticalAlerts.record(x,z,kind,label);if(!recorded)return;view.mark(x,z,kind);audio.play('order');renderMinimap();if(pingMode){pingMode=false;$('#map-flare-btn')?.classList.remove('active');$('#map-flare-btn')?.setAttribute('aria-pressed','false');$('#order-hint').textContent='Select units to issue orders.';syncContextBanner();}}
function setAttackMove(enabled){
  attackMove=enabled;
  const control=$('#attackmove');
  control.classList.toggle('active',enabled);
  control.setAttribute('aria-pressed',String(enabled));
  $('#order-hint').textContent=enabled?'Choose a destination. Troops will fight enemies along the way.':isAISpectator()?'Select a kingdom to watch the battle.':'Select units to issue orders.';syncContextBanner();
}
function cancelBuild(){buildType=null;wallDraft.clear();wallPlaced=false;wallPlan=null;wallPlanKey=wallControlsKey='';edgeScroll.reset();$('#hud').classList.remove('wall-placing');$('#build-panel').classList.add('hidden');$('#placement-controls').classList.add('hidden');$('#placement-controls').classList.remove('wall-controls');view?.wallPreview?.hide();view?.hideGhost();$('#world').classList.remove('placing');$('#order-hint').textContent=isAISpectator()?'Select a kingdom to watch the battle.':'Select units to issue orders.';syncContextBanner();}
function updateWallPlacement(force=false){
  if(buildType!=='wall'||!view||!sim)return;const now=performance.now();if(!force&&now-wallPlanAt<50)return;
  const ids=workers(),key=wallDraft.version+':'+sim.revision+':'+sim.players[0].age+':'+JSON.stringify(sim.players[0].resources)+':'+ids.join(',');
  if(!force&&key===wallPlanKey&&now-wallPlanAt<150)return;wallPlanAt=now;wallPlanKey=key;wallPlan=wallPlacementPlan(sim,wallDraft,ids);
  if(wallDraft.start){view.wallPreview??=new WallPreview(view);view.wallPreview.show(wallPlan);}else view.wallPreview?.hide();
  // Keep the actual buttons in place while a finger or keyboard focus rests
  // on them. Resource and preview refreshes must never replace a tap target.
  const controlKey=JSON.stringify([wallPlan.message,wallPlan.count,wallPlan.cost,wallPlan.canBuild,!!wallDraft.start,wallDraft.panning,wallPlaced]);if(controlKey===wallControlsKey)return;
  const panel=$('#placement-controls');if(!wallControlsKey)panel.innerHTML='<div class="wall-placement-status"><span role="status"></span><strong></strong></div><div class="wall-placement-actions"><button class="primary" data-action="wall-build">Build wall</button><button data-action="wall-reset">Reset</button><button data-action="wall-pan" aria-pressed="false">Move map</button><button data-action="cancel-build">Cancel</button></div>';wallControlsKey=controlKey;
  panel.querySelector('[role=status]').textContent=wallPlan.message;const summary=panel.querySelector('.wall-placement-status strong');summary.hidden=!wallPlan.count;summary.textContent=wallPlan.count?`${wallPlan.count} ${wallPlan.count===1?'wall':'walls'} · ${costText(wallPlan.cost)}`:'';
  const confirm=panel.querySelector('[data-action=wall-build]');confirm.disabled=!wallPlan.canBuild;confirm.textContent=wallPlan.count? `Build ${wallPlan.count} ${wallPlan.count===1?"section":"sections"}`:'Build wall';panel.querySelector('[data-action=wall-reset]').disabled=!wallDraft.start;const pan=panel.querySelector('[data-action=wall-pan]');pan.setAttribute('aria-pressed',String(wallDraft.panning));pan.textContent=wallDraft.panning?'Place wall':'Move map';panel.querySelector('[data-action=cancel-build]').textContent=wallPlaced?'Done':'Cancel';
}
function confirmWallPlacement(){
  if(buildType!=='wall')return;updateWallPlacement(true);if(!wallPlan.canBuild)return;const plan=wallPlan,built=sim.buildWallDraft(plan.start,plan.end,workers());
  if(built===true||Array.isArray(built)&&built.length){wallPlaced=true;wallDraft.clear();wallPlan=null;wallPlanKey='';view.wallPreview?.hide();updateWallPlacement(true);toast(built===true?'Wall construction requested.':`${built.length} wall ${built.length===1?'section':'sections'} ordered. Tap a new start or choose Done.`);renderHUD();}
}
function attributes(e){return inspectorStatsMarkup(sim,e);}
function applyAccessibility(){document.documentElement.classList.toggle('high-contrast',!!settings.highContrast);document.documentElement.classList.toggle('reduced-motion',!!settings.reducedMotion);}
function refreshShortcutLabels(){for(const button of document.querySelectorAll('[data-action]')){const key=settings.bindings[button.dataset.action];if(key){const label=keyLabel(key);button.title=button.title.replace(/ \([^)]*\)$/,'')+' ('+label+')';const badge=button.querySelector('.cmd-key');if(badge)badge.textContent=label.length<=3?label.toUpperCase():label.slice(0,3).toUpperCase();}}}
applyAccessibility();refreshShortcutLabels();
function orderSummary(list){const units=list.filter(e=>e.owner===0&&e.kind==='unit');if(!units.length)return '';const blocked=units.filter(e=>e.pathStatus==='blocked').length,queued=units.reduce((n,e)=>n+(e.orders?.length||0),0),orders=[...new Set(units.map(e=>e.order?.type||'idle'))].join(', ');return '<div class="order-summary" role="status">'+esc(orders)+(queued?' · '+queued+' queued':'')+(blocked?' · '+blocked+' blocked':'')+'<small>'+ (touchDevice?'Open Help for touch commands.':'Shift-command adds another order to the queue.')+'</small></div>';}
function tactics(list=[]){const units=list.filter(e=>e.owner===0&&e.kind==='unit'),allHold=units.length>0&&units.every(e=>e.stance==='hold'),allAgg=units.length>0&&units.every(e=>e.stance!=='hold');return `<div class="tactics"><span>FORMATION</span>${['square','line','column'].map(f=>`<button data-formation="${f}" class="${sim.players[0].formation===f?'active':''}" aria-pressed="${sim.players[0].formation===f}">${f}</button>`).join('')}<button data-action="patrol" title="Patrol between here and a destination">Patrol</button><button data-action="guard" title="Follow and protect a friendly unit or building">Guard</button><button data-stance="aggressive" class="${allAgg?'active':''}" aria-pressed="${allAgg}" title="Engage nearby enemies automatically">Engage</button><button data-stance="hold" class="${allHold?'active':''}" aria-pressed="${allHold}" title="Hold position and defend within weapon range">Hold ground</button></div>`;}
function groupProduction(list){
  const ids=list.map(e=>e.id),age=sim.players[0].age;
  const choices=Object.entries(UNITS).map(([type,data])=>({type,data,sites:trainingBuildings(sim,type,ids)})).filter(choice=>choice.sites.length);
  if(!choices.length)return '<p class="selection-desc">These buildings cannot train troops. Select one building to manage its upgrades.</p>';
  return `<div class="group-production">${choices.map(({type,data,sites})=>{const unitCost=sim.cost(data.cost,0,'unit',type);return `<div class="production-choice"><button data-train="${type}" data-building="group" ${age<data.age?'disabled':''} title="${esc(data.desc)}"><span>${ICONS[type]}</span><strong>${data.name}</strong><small>${age<data.age?AGES[data.age]:`${costText(unitCost)} · ${sites.length} ${sites.length===1?'building':'buildings'}`}</small></button><button data-train="${type}" data-building="group" data-batch="5" ${age<data.age?'disabled':''} aria-label="Train five ${esc(data.name)}" title="Queue up to five">+5</button></div>`;}).join('')}</div>`;
}
function preservePanelPosition(panel,scrollSelector=null){
  const scroller=scrollSelector?panel.querySelector(scrollSelector):panel,top=scroller?.scrollTop||0;
  const focused=panel.contains(document.activeElement)?document.activeElement.closest('button'):null,data=focused?Object.entries(focused.dataset):null;
  return ()=>{const nextScroller=scrollSelector?panel.querySelector(scrollSelector):panel;if(nextScroller)nextScroller.scrollTop=top;
    if(data?.length){const next=[...panel.querySelectorAll('button')].find(button=>data.every(([key,value])=>button.dataset[key]===value));next?.focus({preventScroll:true});}
  };
}
function updateSelectionLive(panel,list){
  const first=list[0];if(!first)return;const bar=panel.querySelector('.health-track span');if(bar){const width=`${(entityBarRatio(first)*100).toFixed(1)}%`;if(bar.style.width!==width)bar.style.width=width;}
  const health=panel.querySelector('[data-live-health]');if(health){const text=entityStatusText(sim,first);if(health.textContent!==text)health.textContent=text;}
  // live health updated above
  const carry=panel.querySelector('[data-live-carry]');if(carry){const text=first.carry?`Carrying ${Math.floor(first.carry)} ${first.carryType}. `:'';if(carry.textContent!==text)carry.textContent=text;}
  if(isHeroUnit(first)&&first.skillCooldowns){
    for(let s=0;s<2;s++){
      const btn=panel.querySelector(`[data-hero-skill="${s}"]`);if(!btn)continue;
      const cd=Math.ceil(first.skillCooldowns[s]||0);
      btn.disabled=cd>0;
      const small=btn.querySelector('small');
      if(small){const lbl=cd>0?`${cd}s`:'Ready';if(small.textContent!==lbl)small.textContent=lbl;}
    }
  }
  for(const [i,q]of (first.queue||[]).entries()){const item=panel.querySelector(`.training-queue [data-cancel-queue="${i}"]`);if(!item)continue;const label=i===0?`${Math.ceil(q.remaining)}s`:String(i+1),small=item.querySelector('small');if(small.textContent!==label)small.textContent=label;const bar=item.querySelector('i'),transform=`scaleX(${i===0?Math.max(0,Math.min(1,1-q.remaining/q.total)):0})`;if(bar.style.transform!==transform)bar.style.transform=transform;}
}
function updateProductionLive(buildings){for(const b of buildings){const button=$(`#production-panel [data-production-select="${b.id}"]`);if(!button)continue;const first=b.queue[0];button.querySelector('small').textContent=first?`${Math.ceil(first.remaining)}s`:'Idle';const bar=button.closest('.production-card').querySelector('.production-progress i');if(bar)bar.style.width=`${first?Math.max(0,Math.min(100,(1-first.remaining/first.total)*100)):0}%`;}}
function renderProduction(){
  if(!playing)return;
  const buildings=productionBuildings(sim),count=buildings.reduce((sum,b)=>sum+b.queue.length,0),badge=$('#production-count');badge.textContent=count;badge.classList.toggle('hidden',!count);$('#production-toggle').setAttribute('aria-label',`Production overview, ${count} queued`);
  if(!productionOpen)return;
  updateProductionLive(buildings);const key=JSON.stringify(buildings.map(b=>[b.id,b.type,b.queue.map(q=>[q.kind,q.type])]));if(key===productionKey)return;productionKey=key;
  const groups=[...new Set(buildings.map(b=>b.type))];
  const restorePosition=preservePanelPosition($('#production-panel'),'.production-list');
  $('#production-panel').innerHTML=`<div class="production-heading"><div><span class="eyebrow">YOUR KINGDOM</span><h3>Production</h3><small>${count} queued · ${buildings.filter(b=>!b.queue.length).length} idle buildings</small></div><button data-action="production" aria-label="Close production overview">${uiIcon("x")}</button></div><div class="production-groups"><button data-production-group="all">Select all</button>${groups.map(type=>`<button data-production-group="${type}" title="Select all ${esc(BUILDINGS[type].name)} buildings">${ICONS[type]} ${buildings.filter(b=>b.type===type).length}</button>`).join('')}</div><div class="production-list">${buildings.length?buildings.sort((a,b)=>Number(!a.queue.length)-Number(!b.queue.length)||a.id-b.id).map(b=>{
    const first=b.queue[0],name=first?(first.kind==='age'?AGES[sim.players[0].age+1]:(UNITS[first.type]||TECHS[first.type]).name):'Ready for orders',progress=first?Math.max(0,Math.min(100,(1-first.remaining/first.total)*100)):0;
    return `<section class="production-card ${first?'':'idle'}"><button class="production-site" data-production-select="${b.id}" aria-label="Select and locate ${esc(BUILDINGS[b.type].name)}"><span>${ICONS[b.type]}</span><strong>${BUILDINGS[b.type].name}</strong><small>${first?`${Math.ceil(first.remaining)}s`:'Idle'}</small></button><div class="production-current">${esc(name)}</div><div class="production-progress"><i style="width:${progress}%"></i></div>${b.queue.length?`<div class="production-items">${b.queue.map((q,index)=>{const label=q.kind==='age'?AGES[sim.players[0].age+1]:(UNITS[q.type]||TECHS[q.type]).name;return `<button data-cancel-queue="${index}" data-building="${b.id}" aria-label="Cancel ${esc(label)} and refund its cost" title="Cancel ${esc(label)} and refund">${ICONS[q.type]||uiIcon('age')}<small>${index+1}</small></button>`;}).join('')}</div>`:''}</section>`;
  }).join(''):'<p class="production-empty">Complete a town center, military building, or research building to manage production here.</p>'}</div><p class="production-note">Select buildings to train. Shift-click a troop to queue five. Tap a queued item to cancel and refund.</p>`;
  restorePosition();
}
function renderSelection(){if(!playing)return;selection=selection.filter(id=>{const e=selectionEntity(id);return e&&!e.embarked;});view.selection=new Set(selection);const list=selected(),types=[...new Set(list.map(e=>e.type))],activeType=types.includes(activeSubgroup)?activeSubgroup:(types[0]||null),ordered=list.length>1&&types.length>1?[...list.filter(e=>e.type===activeType),...list.filter(e=>e.type!==activeType)]:list,panel=$('#selection-panel'),spectator=isAISpectator();panel.classList.toggle('is-empty',!list.length);$('#deselect-control')?.classList.toggle('hidden',!list.length);$('.camera-controls').classList.toggle('has-selection',!!list.length);updateSelectionLive(panel,ordered);const gate=list.length===1&&list[0].type==="wall"&&list[0].owner===0?gateConversionPlan(sim,list[0].id):null,gateAffordable=gate&&canAfford(gate.cost);let inboundGarrison=null;if(list.some(e=>e.kind==='building')){inboundGarrison=new Map();for(const u of sim.candidatesFor('unit'))if(u.hp>0&&u.owner===0&&u.order?.type==='garrison')inboundGarrison.set(u.order.target,(inboundGarrison.get(u.order.target)||0)+1);}const key=JSON.stringify([spectator,!!gate,!!gateAffordable,activeType,sim.players[0].age,sim.players[0].tech,sim.players[0].formation,sim.players[0].agePending,list.map(e=>[e.id,e.maxHp,e.progress>=1,e.owner,e.owner>=0?sim.players[e.owner]?.age:0,e.stance,e.rally?1:0,e.order?.type,e.pathStatus,e.orders?.length,e.passengers?.length,e.garrison?.length,inboundGarrison?.get(e.id)||0,e.heroLevel||0,e.autoCast!==false?1:0,e.queue?.map(q=>[q.kind,q.type])])]);if(key===selectionKey)return;selectionKey=key;
  const restorePosition=preservePanelPosition(panel);try{
  if(!list.length){
    const title=spectator?'Choose a kingdom to follow':'Select a unit or building';
    const hint=spectator?'Select a kingdom in the roster to move the camera.':touchDevice?'Tap to select · Drag to pan · Pinch to zoom':'Drag to select a group · Right-click to command';
    panel.innerHTML=`<div class="empty-selection"><span class="empty-crest" aria-hidden="true">${uiIcon("castle")}</span><div><h3>${title}</h3><p>${hint}</p></div></div>`;
    return;
  }
  const buildingGroup=list.length>1&&list.every(e=>e.owner===0&&e.kind==='building');
  const first=ordered[0],data=first.water?{name:'Fish shoal',desc:'Fishing boats harvest this shoal and return food to a harbor.'}:UNITS[first.type]?{...UNITS[first.type]}:BUILDINGS[first.type]?{...BUILDINGS[first.type]}:{name:first.type,desc:first.kind==='shrine'?'Military units capture this shrine in 18 seconds. It generates gold while controlled.':'Assign villagers to gather this resource.'};
  if(first.kind==='building'&&(first.type==='wall'||first.type==='gate'))data.name=wallDisplayName(sim,first);
  if(first.displayName)data.name=first.displayName;
  const icon=first.water?uiIcon('fish'):ICONS[first.type]||uiIcon('circle-help');const mine=first.owner===0,aff=entityAffiliation(sim,first),shelter=shelterControls(sim,list),barPct=(entityBarRatio(first)*100).toFixed(1),statusText=entityStatusText(sim,first),eyebrow=inspectorEyebrow(sim,first,list.length,buildingGroup),statsHtml=list.length===1?inspectorStatsMarkup(sim,first):'';data.name=entityDisplayName(sim,first);
  panel.innerHTML=`<div class="selection-title"><button data-action="inspect" class="selection-portrait ${mine?'':'enemy'} aff-${aff}" title="Inspect this 3D model"><span id="model-portrait" data-entity="${first.id}">${icon}</span></button><div><span class="eyebrow aff-${aff}">${esc(eyebrow)}</span><h3>${list.length>1?(buildingGroup?'Production group':types.length>1?`${esc(data.name)} · Company`:'Your company'):esc(data.name)}</h3><div class="health-track aff-${aff}"><span style="width:${barPct}%"></span></div><small data-live-health>${esc(statusText)}</small></div></div><button class="selection-deselect" data-action="deselect" aria-label="Clear selection" title="Clear selection (keeps active orders)">${uiIcon("x")}</button>${selectionDetailsMarkup(panel)}`;
  if(isAISpectator()){const owner=first.owner>=0?sim.players[first.owner]:null;panel.innerHTML=`<div class="selection-title"><button data-action="inspect" class="selection-portrait enemy aff-${aff}" title="Inspect this 3D model"><span id="model-portrait" data-entity="${first.id}">${icon}</span></button><div><span class="eyebrow aff-${aff}">${owner?`TEAM ${owner.team} · ${esc(owner.name||FACTIONS[owner.faction]?.name||'AI')}`:esc(eyebrow)}</span><h3>${list.length>1?`${list.length} units selected`:esc(data.name)}</h3><div class="health-track aff-${aff}"><span style="width:${barPct}%"></span></div><small data-live-health>${esc(statusText)}</small></div></div>${statsHtml}<p class="selection-desc">${esc(data.desc||'Observe the battle. Use the kingdom roster to follow another team.')}</p>`;return;}
  if(list.length>1){const counts={};for(const e of list)counts[e.type]=(counts[e.type]||0)+1;const subLabel=(UNITS[activeType]||BUILDINGS[activeType])?.name||activeType;panel.innerHTML+=`<div class="unit-tokens">${Object.entries(counts).map(([t,n])=>`<button data-select-type="${t}" class="${types.length>1&&t===activeType?'active':''}">${ICONS[t]} <span>${n}</span></button>`).join('')}${types.length>1?`<button class="subgroup-tab" data-cycle-subgroup="1" title="Cycle unit subgroup (Tab)">${uiIcon('chevron-right')}<span>Tab: ${esc(subLabel)}</span></button>`:''}</div>${multiSelectCardsMarkup(ordered)}${buildingGroup?groupProduction(list):''}<p class="selection-desc">${buildingGroup?'Training goes to the shortest available queue. Select one building for research.':touchDevice?'Tap the battlefield to move; tap enemies to attack.':'Right-click to move or attack. Click a unit card to isolate; Shift-click to remove.'}</p>${list.every(e=>e.owner===0&&e.kind==='unit'&&e.type!=='villager')?tactics(list):''}${shelter?'<div class="worker-actions">'+shelter+'</div>':''}${orderSummary(list)}`;refreshShortcutLabels();return;}
  if(first.kind==='building'&&mine&&first.progress>=1){
    const p=sim.players[0],train=Object.entries(UNITS).filter(([t,d])=>availableTo(d,p.faction)&&d.at.includes(first.type));
    const techs=Object.entries(TECHS).filter(([t,d])=>availableTo(d,p.faction)&&d.at.includes(first.type)&&p.tech[t]<d.max);
    const gateLabel=wallTier(sim,first)==='palisade'?'palisade gate':'gatehouse';
    const gateAction=gate?`<button class="gate-conversion" data-convert-gate="${first.id}" aria-label="Convert to ${gateLabel}" title="Convert three wall sections to a ${gateLabel}" ${gateAffordable?'':'disabled'}><span>${ICONS.gate}</span><strong>Add ${gateLabel}</strong><small>${costText(gate.cost)}</small></button>`:'';
    const hasActions=!!(gateAction||train.length||shelter||(first.type==='towncenter'&&p.age<3)||techs.length);if(hasActions)panel.innerHTML+=`<div class="production-actions">${gateAction}${train.map(([t,d])=>{const unitCost=sim.cost(d.cost,0,'unit',t);return `<button data-train="${t}" data-building="${first.id}" title="${esc(d.desc)} · ${costText(unitCost)}" ${p.age<d.age?'disabled':''}><span>${ICONS[t]}</span><strong>${d.name}</strong><small>${p.age<d.age?AGES[d.age]:costText(unitCost)}</small></button>`;}).join('')}${shelter}${first.type==='towncenter'&&p.age<3?`<button class="age-up" data-research="age" data-building="${first.id}" ${p.agePending?'disabled':''}><span>${uiIcon("age")}</span><strong>${p.agePending?'Advancing…':AGES[p.age+1]}</strong><small>${costText(AGE_COSTS[p.age])}</small></button>`:''}${techs.map(([t,d])=>`<button data-research="${t}" data-building="${first.id}" title="${esc(d.desc)}" ${p.age<d.age||p.tech[t]>=Math.min(d.max,p.age+1)?'disabled':''}><span>${ICONS[t]||uiIcon('age')}</span><strong>${d.name} ${p.tech[t]+1}</strong><small>${costText(Object.fromEntries(Object.entries(d.cost).map(([r,n])=>[r,n*(p.tech[t]+1)])))}</small></button>`).join('')}</div>`;
    if(first.queue.length)panel.innerHTML+=`<div class="training-queue">${first.queue.map((q,i)=>`<button data-cancel-queue="${i}" data-building="${first.id}" title="Cancel and refund"><span>${ICONS[q.type]||uiIcon('age')}</span><small>${i===0?Math.ceil(q.remaining)+'s':i+1}</small><i style="transform:scaleX(${i===0?Math.max(0,Math.min(1,1-q.remaining/q.total)):0})"></i></button>`).join('')}<span>QUEUE · click to cancel</span></div>`;
    if(first.type==='market')panel.innerHTML+=`<div class="trade-actions">${['food','wood','stone'].map(r=>`<span>${ICONS[r]} <button data-trade="${r}" data-buy="true">Buy ${sim.players[0].tech.caravanLedger?110:100} · 130 Gold</button><button data-trade="${r}" data-buy="false">Sell 100 · ${sim.players[0].tech.caravanLedger?90:70} Gold</button></span>`).join('')}</div>`;panel.innerHTML+=statsHtml;if(!hasActions)panel.innerHTML+=`<p class="selection-desc">${esc(data.desc||'')}</p>`;else if(RALLY_BUILDINGS.has(first.type)&&!touchDevice)panel.innerHTML+=`<p class="selection-desc rally-hint">${first.rally?'Rally flag set · Right-click ground or a resource to move it.':'Right-click ground or a resource to set a rally point.'}</p>`;
  }else if(first.type==='villager'&&mine){panel.innerHTML+=`<div class="worker-actions">${shelter}<button class="secondary" data-action="build" title="Choose a building to construct">${uiIcon("hammer")} Build</button><button class="secondary" data-action="auto-work" title="Assign nearby resource gathering">${uiIcon("hand")} Auto gather</button></div>${statsHtml}<p class="selection-desc"><span data-live-carry>${first.carry?`Carrying ${Math.floor(first.carry)} ${first.carryType}. `:''}</span>${touchDevice?'Tap resources to gather, buildings to construct or repair.':'Right-click resources to gather, buildings to construct or repair.'}</p>`;}
  else{
    const heroHtml=mine&&isHeroUnit(first)?(()=>{
      const hDef=HERO_DEFS[first.type],lv=first.heroLevel||1,auto=first.autoCast!==false;
      return `<div class="hero-strip"><div class="hero-meta"><span class="hero-lv">Lv ${lv}</span><span class="hero-role">${esc(hDef.roleTitle)}</span><button type="button" class="hero-autocast-btn ${auto?'on':''}" data-hero-autocast="${first.id}" aria-pressed="${auto}" title="When ON, your Hero casts skills automatically in combat">${auto?'Auto-Cast: ON':'Auto-Cast: OFF'}</button></div><div class="hero-skills">${hDef.skills.map((sk,idx)=>{const cd=Math.ceil(first.skillCooldowns?.[idx]||0);return `<button type="button" class="hero-skill-btn" data-hero-skill="${idx}" data-hero-id="${first.id}" ${cd>0?'disabled':''} title="${esc(sk.desc)}"><strong>${esc(sk.name)}</strong><small>${cd>0?`${cd}s`:'Ready'}</small></button>`;}).join('')}</div></div>`;
    })():'';
    panel.innerHTML+=`${heroHtml}${statsHtml}<p class="selection-desc">${esc(data.desc||'')}</p>${mine&&first.kind==='unit'?tactics(list):''}${mine&&first.type==='transport'?`<div class="worker-actions"><button class="secondary" data-action="unload">${uiIcon("anchor")} Unload ${first.passengers?.length||0} passengers</button></div>`:''}`;
  }
  panel.innerHTML+=orderSummary(list);refreshShortcutLabels();

  if(mine&&first.kind==='building'&&(first.type!=='towncenter'||sim.owned(0,'building','towncenter').length>1))panel.innerHTML+=`<button class="demolish" data-demolish="${first.id}">${first.progress<1?'Cancel construction (70% refund)':'Demolish (20% refund)'}</button>`;
  }finally{updateSelectionLive(panel,ordered);restorePosition();updateAffordability();}
}
function renderHUD(includeCanvas=true){if(!playing)return;$('.game-bottomline').classList.toggle('context-command',!!buildType||attackMove||!!tacticalMode||unloadMode);const p=sim.players[0],spectator=isAISpectator(),workerCounts=spectator?null:resourceWorkerCounts(sim,0);const resourceRoot=$('#resource-bar');if(spectator){if(!resourceRoot.querySelector('.spectator-banner'))resourceRoot.innerHTML=sim.options.multiplayer?'<div class="spectator-banner">SPECTATING | FULL MAP</div>':'<div class="spectator-banner">SPECTATING | ALL KINGDOMS AI</div>';}else updateResourceBar(resourceRoot,p,sim.population(0),sim.capacity(0),workerCounts);$('#hud').classList.toggle('ai-spectator',spectator);$('#production-toggle').classList.toggle('hidden',spectator);const idlePill=$('#idle-villager-pill');if(idlePill){const idleCount=workerCounts?.idle||0;idlePill.classList.toggle('hidden',spectator||idleCount<=0);if(idleCount>0){setUIText($('#idle-villager-count'),idleCount);idlePill.title=`${idleCount} idle ${idleCount===1?'villager':'villagers'} · Click or press . to cycle (Shift selects all)`;}}const ageProg=spectator?null:ageProgressState(sim,0);const ageRomanEl=$('#age-roman');if(ageRomanEl)setUIText(ageRomanEl,spectator?'★':(AGE_ROMAN[p.age]||'I'));const ageTrack=$('#age-progress-track'),ageFill=$('#age-progress-fill');if(ageTrack&&ageFill){ageTrack.classList.toggle('hidden',!ageProg);if(ageProg){const w=`${ageProg.percent}%`;if(ageFill.style.width!==w)ageFill.style.width=w;}}const queueStrip=$('#global-queue-strip');if(queueStrip){const gItems=spectator?[]:globalProductionItems(sim,0);const gKey=gItems.map(i=>`${i.buildingId}:${i.type}:${i.remaining}:${i.percent}:${i.queued}`).join('|');queueStrip.classList.toggle('hidden',!gItems.length);if(!gItems.length)globalQueueKey='';else if(gKey!==globalQueueKey){globalQueueKey=gKey;queueStrip.innerHTML=globalQueueMarkup(gItems);}}const scorePanel=$('#scoreboard-panel');if(scorePanel&&scoreboardOpen){const sHtml=scoreboardMarkup(sim);if(sHtml!==scoreboardKey){scoreboardKey=sHtml;scorePanel.innerHTML=sHtml;}}
  $('#alliance-toggle').classList.toggle('hidden',spectator||(sim.options.mode!=='custom'&&!sim.mission?.actFour&&!sim.mission?.actFive)||!sim.players.some((player,i)=>i!==0&&sim.allied(0,i)&&!player.defeated&&!player.dormant));
  warComms.refresh(sim);
  setUIText($('#age-label'),spectator?'SPECTATOR':(ageProg?`${ageProg.nextAge} ${ageProg.percent}%`:AGES[p.age]));setUIText($('#game-time'),formatTime(sim.time));if(net.active)setUIText($('#control-hint'),`ROOM ${net.code} · ${net.ping}ms`);setUIText($('#speed-button'),`${speed}×`);
  const m=MODES.find(m=>m.id===sim.options.mode)||sim.mission;let objective=m.objective;
  if(sim.options.mode==='tutorial')objective=sim.tutorialObjectives().map((o,i)=>`<div class="lesson ${o.done?'done':''}"><span>${o.done?uiIcon('check'):i+1}</span>${o.text}</div>`).join('');
  else objective=`<p>${objective}</p>`;
  let info='';if(sim.options.mode==='regicide'){const king=sim.owned(0,'unit','king')[0];info=`<div class="objective-progress"><span>YOUR SOVEREIGN</span><strong>${king?Math.ceil(king.hp):0} HP · Keep safe</strong></div>`;}if(sim.options.mode==='survival'||sim.mission?.survival)info=`<div class="objective-progress"><span>WAVE ${sim.wave} / ${sim.mission?.waves||10}</span><strong>${sim.wave<(sim.mission?.waves||10)?`Next · ${formatTime(Math.max(0,sim.nextWave-sim.time))}`:'Eliminate remaining enemies'}</strong></div>`;
  if(sim.options.mode==='dominion'||sim.mission?.dominion)info=`<div class="shrine-status">${sim.entities.filter(e=>e.kind==='shrine').map(e=>`<span class="${e.owner===0?'owned':sim.hostile(0,e.owner)?'rival':''}">${uiIcon('landmark')}</span>`).join('')}<strong>${formatTime(sim.hold)} / 03:00</strong></div>`;
  if(sim.options.mode==='koth'){const hill=sim.entities.find(e=>e.kind==='shrine');const rivalWarn=sim.enemyHold>0?` · Rival ${formatTime(sim.enemyHold)}`:'';info=`<div class="shrine-status"><span class="${hill?.owner===0?'owned':sim.hostile(0,hill?.owner)?'rival':''}">${uiIcon('crown')}</span><strong>${formatTime(sim.hold)} / 03:00${rivalWarn}</strong></div>`;}
  if(sim.options.mode==='deathmatch')info=`<div class="objective-progress"><span>IMPERIAL TOTAL WAR</span><strong>Rival capitals · ${sim.owned(1,'building','towncenter').length} standing</strong></div>`;
  if(sim.options.mode==='siege'){const myKeep=sim.owned(0,'building','keep')[0],rivalTc=sim.owned(1,'building','towncenter').length;info=`<div class="objective-progress"><span>${myKeep?`YOUR CASTLE · ${Math.ceil(myKeep.hp)} HP`:'CASTLE BREACHED'}</span><strong>Rival fortress · ${rivalTc} capital</strong></div>`;}
  if(sim.options.mode==='wonder')info=`<div class="objective-progress"><span>YOUR MONUMENT</span><strong>${formatTime(sim.wonderTime[0])} / 04:00</strong></div>`;
  const activeWonder=wonderPowerFor(sim,0);
  if(activeWonder)info+=`<div class="wonder-power-badge" style="--wonder-accent:${activeWonder.color}">${uiIcon('monument')}<div><strong>${esc(activeWonder.name)}</strong><small>${esc(activeWonder.short)}</small></div></div>`;
  const story=campaignObjective(sim);if(story){objective='<div class="campaign-stage-label">Objective '+Math.min(story.index+1,story.total)+' / '+story.total+'</div><strong class="campaign-stage-title">'+esc(story.title)+'</strong><p>'+esc(story.text)+'</p>'+(story.progressText?'<p class="campaign-clock">'+esc(story.progressText)+'</p>':'')+'<div class="campaign-controls"><button data-action="journal">Journal</button>'+(story.marker?'<button data-action="mission-goal">Locate goal</button>':'')+(story.cart?'<button data-action="quest-unit">Select caravan</button>':'')+'</div>';if(story.sideQuest)objective+=`<div class="campaign-sidequest-row ${story.sideQuest.done?'done':''}"><strong>${story.sideQuest.done?'✓ ':''}Side Quest: ${esc(story.sideQuest.title)}</strong>${esc(story.sideQuest.done?`Completed (${story.sideQuest.rewardText})`:`${story.sideQuest.text} (${story.sideQuest.rewardText})`)}</div>`;if(sim.options.mode==='campaign6'&&story.index===0)objective+='<p class="campaign-fish">Fishing catch: '+Math.floor(story.fish)+' / 150</p>';if(story.seconds){const left=Math.max(0,Math.ceil(story.seconds-(story.elapsed||0)));objective+='<p class="campaign-clock">Hold for '+Math.floor(left/60)+':'+String(left%60).padStart(2,'0')+' more</p>';}}
  $('#objectives').classList.toggle('interactive-objectives',!!story||sim.options.mode==='custom');
  const objectiveMarkup=sim.options.mode==='custom'?battleObjectiveMarkup(sim):`<div class="objective-eyebrow">${sim.mission?'CHAPTER '+sim.mission.chapter:m.tag.toUpperCase()}<span class="difficulty-tag">${DIFFICULTIES[sim.options.difficulty].name}</span></div><h3>${m.name}</h3>${objective}${info}`;
  const objectives=$('#objectives'),interactive=!!story||sim.options.mode==='custom';
  if(!objectives.querySelector('#objective-body')){objectives.innerHTML=`<button class="objective-toggle" data-action="objectives-expand" aria-controls="objective-body"><span class="objective-label"></span> <span class="objective-icon" aria-hidden="true"></span></button><div id="objective-body" class="objective-body"></div>`;objectiveKey='';}
  const toggle=objectives.querySelector('.objective-toggle'),body=objectives.querySelector('#objective-body');
  if(objectiveKey!==objectiveMarkup){objectiveKey=objectiveMarkup;objectiveChangedAt=sim.time||0;const restorePosition=preservePanelPosition(objectives);body.innerHTML=objectiveMarkup;restorePosition();}
  if(objectives.classList.contains('objectives-expanded')&&shouldAutoCollapseObjectives({mode:sim.options.mode,interactive,simTime:sim.time||0,userToggled:objectivesUserToggled,changedAt:objectiveChangedAt})){objectives.classList.remove('objectives-expanded');}
  const expanded=objectives.classList.contains('objectives-expanded');
  body.hidden=!expanded;
  if(toggle.getAttribute('aria-expanded')!==String(expanded)){toggle.setAttribute('aria-expanded',String(expanded));toggle.setAttribute('aria-label',`${expanded?'Close':'Open'} battle objectives`);toggle.title=`${expanded?'Close':'Open'} objectives`;toggle.innerHTML=`${expanded?'Close objectives':'Objectives'} <span class="objective-icon" aria-hidden="true">${uiIcon(expanded?'x':'chevron-down')}</span>`;}
  setUIText($('#army-count'),spectator?`${sim.players.filter(player=>!player.defeated).length} active kingdoms`:`${sim.owned(0,'unit').filter(e=>e.type!=='villager'&&e.type!=='fishingboat'&&e.type!=='cart'&&!e.embarked).length} soldiers`);setUIText($('#map-label'),sim.options.map.toUpperCase());setUIText($('#control-hint'),spectator?'SPECTATOR | SELECT A KINGDOM TO FOLLOW':net.active?`ROOM ${net.code} | ${net.ping}ms`:touchDevice?'TAP TO COMMAND · PINCH TO ZOOM':'MOUSE EDGES TO PAN | RIGHT-CLICK TO COMMAND');
  if(includeCanvas){renderMinimap();renderHealth();}renderProduction();renderControlGroups();updateAffordability();
}
function renderMinimap(){drawMinimap($('#minimap'),sim,view,settings,{filter:minimapFilter});}
function renderHealth(){if(!playing||hudEl.classList.contains('panels-hidden'))return;renderHealthBars(healthLayerEl,sim,view);}
function menuReturn(){clearChronicleOverlay();warComms.reset(null);audio.clearCombat();if(playing&&!sim.ended&&!activeReplay)saveGame(true);replayRecorder.detach();activeReplay=null;$('#replay-banner')?.classList.add('hidden');if(net.active)net.leave();closeModal();playing=false;paused=false;exploringEnd=false;lastEndResult=null;$('#explore-banner')?.classList.add('hidden');clearCommanderDialogue();cancelBuild();pingMode=false;demolishArmed=null;tacticalAlerts.clear();$('#alert-line').innerHTML='';clearTimeout(alertClearTimer);selection=[];view.selection.clear();controlGroupKey='';activeSubgroup=null;scoreboardOpen=false;scoreboardKey='';globalQueueKey='';$('#scoreboard-panel')?.classList.add('hidden');$('#global-queue-strip')?.classList.add('hidden');$('#control-groups-bar')?.classList.add('hidden');$('#hud').classList.add('hidden');$('#landing').classList.remove('hidden');$('#world').classList.add('world-poster');presentingMatch=null;refreshLanding();applyHudPreferences();updateRotate();}
// The browser only offers installation once it has decided the page qualifies.
// Keep that event so the landing screen can offer it in place. An install button
// that cannot work is worse than no button, so it stays hidden until it can.
var installPrompt=null;
function runningInstalled(){return matchMedia('(display-mode: standalone)').matches||matchMedia('(display-mode: fullscreen)').matches||navigator.standalone===true;}
function refreshInstallEntry(){
  const button=$('#install');if(!button)return;
  button.classList.toggle('hidden',!installPrompt||runningInstalled());
}
function installGame(){
  if(!installPrompt){toast('Use your browser menu to install this page.','warning');return;}
  const prompt=installPrompt;installPrompt=null;refreshInstallEntry();
  prompt.prompt();
  Promise.resolve(prompt.userChoice).then(choice=>{if(choice?.outcome==='accepted')toast('Crowns is installed. Launch it from your home screen.');}).catch(()=>{});
}
window.addEventListener('beforeinstallprompt',event=>{event.preventDefault();installPrompt=event;refreshInstallEntry();});
window.addEventListener('appinstalled',()=>{installPrompt=null;refreshInstallEntry();toast('Crowns is installed. Launch it from your home screen.');});
refreshInstallEntry();

// Team colour is read live by the minimap and by the shared team materials, so
// switching palettes is a re-colour rather than a reload. Slots keep their
// identity through slotNumber, which also survives saves that predate the
// setting; falling back to the player index keeps old saves coloured sensibly.
function applyPlayerPalette(){
  if(!sim)return;
  const palette=playerPalette(settings.colorblind);
  sim.players.forEach((player,i)=>{if(player)player.color=palette[((player.slotNumber||i+1)-1)%palette.length];});
  view?.applyTeamColors?.(sim);
}

function action(name,shiftKey=false){
  if(activeReplay&&!spectatorActionAllowed(name)&&!['replay-toggle','replay-speed','explore-battlefield','show-summary','saves','journal'].includes(name))return;
  if(name==='install'){installGame();return;}
  if(name==='credits'){showCredits();return;}
  if(name==='chronicle-begin'){beginFromChronicle();return;}

  if(isAISpectator()&&!spectatorActionAllowed(name))return;
  if(name==='alliance'){showAlliance();return;}
  if(name==='send-donation'){sendAllianceGift();return;}
  if(name==='wall-build'){confirmWallPlacement();return;}
  if(name==='wall-reset'){wallDraft.clear();view?.wallPreview?.hide();updateWallPlacement(true);return;}
  if(name==='wall-pan'){wallDraft.togglePan();edgeScroll.reset();view?.hideGhost();updateWallPlacement(true);return;}
  if(name==='copy-graphics-report'){copyGraphicsReport(document,navigator.clipboard);return;}
  if(name==='retry-battlefield'){retryBattlefield();return;}
  if(name==='reload-battlefield'){if(playing&&!net.active&&!sim.options.multiplayer&&!saveGame(true)){const note=$('#graphics-recovery-note');if(note)note.textContent=graphicsNeedsReload(view?.graphicsFatal)?'Your kingdom could not be saved. Keep this page open and free browser storage before trying Save and reload again.':'Your kingdom could not be saved. Keep this page open and try graphics again, or free browser storage before reloading.';return;}if(graphicsNeedsReload(view?.graphicsFatal)){location.replace(compatibleGraphicsURL(location.href,graphicsSession));}else location.reload();return;}audio.unlock();
  if(name==='retry-graphics'){location.reload();return;}
  if(name==='command-options'){toggleCompactCommands(document);return;}
  if(name==='selection-details'){toggleSelectionDetails(document);return;}
  if(name==='map-expand'){toggleMinimapSize(document);closeCompactCommands(document);return;}
  if(['army','idle','build','attackmove','stop','help','home'].includes(name))closeCompactCommands(document);
  if(['build','patrol','guard','unload','auto-work','attackmove','stop'].includes(name))closeSelectionDetails(document);
  if(name==='custom-battle')return showCustomBattle();if(name==='skirmish-hub')return showSetup('skirmish');if(name==='saves')return showSaveManager();if(name==='watch-last-replay'){if(lastReplayRecord)startGame({replayRecord:lastReplayRecord});return;}if(name==='replay-toggle'){if(!activeReplay||activeReplay.finished)return;paused=!paused;setUIText($('#replay-toggle-btn'),paused?'Resume':'Pause');return;}if(name==='replay-speed'){if(!activeReplay)return;speed=speed===1?2:speed===2?4:1;setUIText($('#replay-speed-btn'),`${speed}×`);return;}if(name==='explore-battlefield'){closeModal();paused=true;exploringEnd=true;$('#explore-banner')?.classList.remove('hidden');return;}if(name==='show-summary'){$('#explore-banner')?.classList.add('hidden');exploringEnd=false;renderEndSummary();return;}if(name==='custom-start')return launchCustom(false);if(name==='custom-host')return launchCustom(true);if(name==='lan-ready'){net.ready=!net.ready;net.send({type:'ready',ready:net.ready});return;}if(name==='resign'){closeModal();sim.resign(0);return;}if(name==='lan')return showLan();if(name==='lan-host')return connectLan(true);if(name==='lan-join')return connectLan(false);if(name==='lan-join-nearby')return connectLan(false,true);if(name==='lan-start'){net.send({type:'start'});return;}if(name==='lan-leave'){net.leave();closeModal();return;}if(name==='lan-mode-online'||name==='lan-mode-nearby'){setNetMode(name==='lan-mode-nearby'?'nearby':'online');return;}if(name==='lan-resume'){if(nearby.isGuest())return nearby.showJoin(null,{rejoin:true});showModal('<h2>Rejoining your kingdom…</h2>','lan');net.connect({type:'resume',...net.session});return;}if(name==='unload'){unloadMode=true;$('#order-hint').textContent='Choose open shore within 11 meters of the transport.';syncContextBanner();return;}if(name==='close')return closeModal();if(name==='campaign')return showCampaign();if(name==='atlas-free-select'){atlasFreeSelect=!atlasFreeSelect;return showCampaign(atlasSelectedId);}if(name==='dismiss-dialogue'){clearCommanderDialogue();return;}if(name==='settings')return showSettings();if(name==='codex')return showCodex();if(name==='tech-tree')return showTechnologyTree();if(name==='help')return showHelp();if(name==='dismiss-rotate'){portraitDismissed=true;return updateRotate();}
  if(name==='resume'){const save=readLocalSave();if(save)try{startGame(save.options,save);}catch(error){toast('The saved kingdom could not be restored.','warning');}return;}
  if(name==='pause'){if(paused&&modal)closeModal();else showPause();return;}
  if(name==='checkpoint'){const checkpoint=sim.campaignCheckpoint;if(checkpoint)return startGame(checkpoint.options,checkpoint);return;}if(name==='journal')return showJournal();if(name==='quest-unit'){const cart=sim.get(sim.campaignState?.cartId);if(cart){setSelection([cart.id]);view.focus(cart.x,cart.z);}return;}if(name==='mission-goal'){const marker=campaignObjective(sim)?.marker;if(marker)view.focus(marker.x,marker.z);return;}if(name==='save'){saveGame();return;}if(name==='menu')return menuReturn();if(name==='restart'){if(activeReplay)return startGame({replayRecord:activeReplay.record});if(net.active||sim.options.multiplayer){menuReturn();showLan();return;}return startGame(sim.options);}
  if(name==='apply-settings'){const draft=settingsBindings($('#modal-root')),errors=bindingErrors(draft);if(errors.length){$('#modal-root .binding-feedback').textContent=errors.join(' ');$('#modal-root .binding-feedback').classList.add('binding-error');return;}settings.bindings=draft;settings.highContrast=$('#high-contrast').checked;settings.reducedMotion=$('#reduced-motion').checked;settings.reduceFoliage=$('#reduce-foliage').checked;settings.colorblind=$('#colorblind').checked;applyAccessibility();applyPlayerPalette();refreshShortcutLabels();keys.clear();
    const previousQuality=view.renderQuality,graphicsChoice=$('#quality').value;
    const graphicsChanged=graphicsChoice!==graphicsSelection(settings);
    if(graphicsChanged){offlineGraphicsPreference=null;applyGraphicsChoice(settings,graphicsChoice,recommendedQuality);}
    settings.frameRate=normalizeFrameRate($('#frame-rate').value);settings.volume=Number($('#volume').value);settings.musicVolume=Number($('#music-volume')?.value??1);settings.uiVolume=Number($('#ui-volume')?.value??1);settings.healthBarMode=$('#health-bar-mode')?.value||'smart';settings.hudScale=$('#hud-scale')?.value||'1';settings.minimapSide=$('#minimap-side')?.value||'left';applyHudPreferences();settings.music=$('#music').checked;settings.unitVoices=$('#unit-voices')?.checked!==false;settings.warHorns=$('#war-horns')?.checked!==false;settings.weather=$('#weather-mode').value;settings.lighting=$('#lighting-mode').value;settings.weatherSounds=$('#weather-sounds').checked;settings.lightning=$('#weather-lightning').checked;settings.fog=$('#fog').checked;settings.distantUnits=$('#distant-units').checked;settings.edgeScroll=$('#edge-scroll').checked;settings.edgeScrollSpeed=Number($('#edge-scroll-speed').value);edgeScroll.reset();
    const reloadGraphics=graphicsChanged||previousQuality!==settings.quality||view.graphicsLoading||view.graphicsFatal||view.graphicsError||view.graphicsSceneValid===false;
    const graphicsReady=reloadGraphics?view.quality(settings.quality):Promise.resolve(true),graphicsRequest=view.graphicsRequest;
    graphicsReady.then(applied=>{if(!applied&&view.graphicsRequest===graphicsRequest&&view.graphicsError&&!view.graphicsFatal)toast(graphicsFailureMessage(view.graphicsRestoredQuality||view.renderQuality),'warning');});view.setCameraPreset($('#camera-preset').value,$('#camera-preset').value!==settings.cameraPreset);updateCameraLabel();saveSettings();if(!view?.graphicsLoading&&previousQuality===settings.quality)audio.unlock();else graphicsReady.finally(()=>{if(!view?.graphicsLoading)audio.unlock();});closeModal();return;}
  if(name==='fullscreen'){document.documentElement.requestFullscreen?.().then(()=>{screen.orientation?.lock?.('landscape').catch(()=>{});}).catch(()=>toast('Use your browser fullscreen control on this device.'));return;}
  if(!playing||sim.ended)return;
  if(name==='objectives-expand'){objectivesUserToggled=true;if(!$('#objectives').classList.contains('objectives-expanded')&&isCompactHUD(document)){closeSelectionDetails(document);closeCompactCommands(document);}$('#objectives').classList.toggle('objectives-expanded');renderHUD();return;}
  if(name.startsWith('camera-')){if(name==='camera-options'){const expanded=$('.camera-controls').classList.toggle('options-open');$('[data-action=camera-options]').setAttribute('aria-expanded',String(expanded));return;}if(name==='camera-panels'){const hidden=$('#hud').classList.toggle('panels-hidden');$('[data-action=camera-panels]').setAttribute('aria-pressed',String(hidden));return;}if(name==='camera-left')view.angle+=Math.PI/8;else if(name==='camera-right')view.angle-=Math.PI/8;else if(name==='camera-closer')view.zoomBy(-6);else if(name==='camera-farther')view.zoomBy(6);else if(name==='camera-view'){const presets=Object.keys(CAMERA_PRESETS);view.setCameraPreset(presets[(presets.indexOf(settings.cameraPreset)+1)%presets.length],true);updateCameraLabel();saveSettings();}view.updateCamera();return;}
  if(name==='inspect'){const e=selected()[0];if(e){view.setCameraPreset('cinematic',true);view.angle=Math.PI/4;view.focus(e.x,e.z);view.target.y=view.entityHeight(e)+(e.kind==='building'?3:e.kind==='unit'?(UNITS[e.type].naval?2.2:1):1);view.zoom=e.kind==='unit'?(UNITS[e.type].naval?26:['ram','catapult'].includes(e.type)?22:16):e.kind==='building'?Math.max(24,e.r*6):20;view.updateCamera();view.forestFog(false);updateCameraLabel();toast('Drag to pan, rotate with the arrows, and pinch or scroll to zoom.');}return;}
  if(name==='speed'){if(net.active)return toast('Network matches run at a shared 1× speed.');speed=speed===1?1.5:speed===1.5?2:1;return;}if(name==='home'){const tcs=sim.owned(0,'building','towncenter').sort((a,b)=>a.id-b.id);if(tcs.length){const tc=tcs[tcCycleIndex%tcs.length];tcCycleIndex=(tcCycleIndex+1)%tcs.length;view.focus(tc.x,tc.z);setSelection([tc.id]);}return;}
  if(name==='army'){setSelection(sim.owned(0,'unit').filter(e=>e.type!=='villager'&&e.type!=='fishingboat'&&e.type!=='cart'&&!e.embarked).map(e=>e.id));return;}
  if(name==='seek-shelter'){const sent=sim.seekShelter(workers().map(e=>e.id));toast(sent?'Seeking nearby shelter.':'No reachable town center, castle or tower has space.');renderSelection();return;}
  if(name==='idle'){const idle=sim.owned(0,'unit','villager').filter(e=>!e.order&&!e.embarked).sort((a,b)=>a.id-b.id);if(!idle.length){toast('Every villager has an assignment.');return;}if(shiftKey){setSelection(idle.map(e=>e.id));view.focus(idle[0].x,idle[0].z);}else{const next=idle[idleCycleIndex%idle.length];idleCycleIndex=(idleCycleIndex+1)%idle.length;setSelection([next.id]);view.focus(next.x,next.z);}return;}
  if(name==='scoreboard'){scoreboardOpen=!scoreboardOpen;scoreboardKey='';$('#scoreboard-panel')?.classList.toggle('hidden',!scoreboardOpen);$('#scoreboard-toggle')?.setAttribute('aria-expanded',String(scoreboardOpen));if(scoreboardOpen){if(productionOpen)action('production');renderHUD(false);}return;}
  if(name==='comms-toggle'){warComms.togglePanel(sim);return;}
  if(name==='comms-mute'){warComms.toggleMute();saveSettings();return;}
  if(name==='build')return toggleBuild();if(name==='cancel-build')return cancelBuild();
  if(name==='deselect'){cancelBuild();tacticalMode=null;unloadMode=false;pingMode=false;$('#map-flare-btn')?.classList.remove('active');$('#map-flare-btn')?.setAttribute('aria-pressed','false');setAttackMove(false);setSelection([]);return;}
  if(name==='last-alert'){const hit=tacticalAlerts.cycleNext();if(hit){view.focus(hit.x,hit.z);renderMinimap();}else toast('No recent battlefield alerts.');return;}
  if(name==='ping-mode'){pingMode=!pingMode;if(pingMode){cancelBuild();tacticalMode=null;setAttackMove(false);}$('#map-flare-btn')?.classList.toggle('active',pingMode);$('#map-flare-btn')?.setAttribute('aria-pressed',String(pingMode));$('#order-hint').textContent=pingMode?'Click the battlefield or minimap to drop a tactical flare.':'Select units to issue orders.';syncContextBanner();return;}
  if(name==='weather'){const modes=['auto','clear','rain','storm','snow'];settings.weather=modes[(modes.indexOf(settings.weather)+1)%modes.length];audio.unlock();saveSettings();toast(settings.weather==='auto'?'Automatic weather enabled.':`${WEATHER_NAMES[settings.weather]} selected.`);return;}
  if(name==='production'){productionOpen=!productionOpen;if(productionOpen){cancelBuild();if(scoreboardOpen){scoreboardOpen=false;$('#scoreboard-panel')?.classList.add('hidden');$('#scoreboard-toggle')?.setAttribute('aria-expanded','false');}}$('#production-panel').classList.toggle('hidden',!productionOpen);$('#production-toggle').setAttribute('aria-expanded',String(productionOpen));productionKey='';renderProduction();return;}
  if(name==='patrol'||name==='guard'){cancelBuild();setAttackMove(false);tacticalMode=tacticalMode===name?null:name;$('#order-hint').textContent=tacticalMode==='guard'?'Choose a friendly unit or building to protect.':tacticalMode==='patrol'?'Choose the other end of the patrol route.':'Select units to issue orders.';syncContextBanner();return;}if(name==='stop'){tacticalMode=null;setAttackMove(false);sim.stop(selection);return;}if(name==='auto-work'){let assigned=0;for(const e of selected().filter(e=>e.type==='villager')){if(net.active){if(sim.assignWorker(e))assigned++;}else{replayRecorder.note('autoWork',e.id);replayActions.autoWork(e.id);assigned++;}}if(assigned)toast('Villagers assigned to nearby resources.');return;}
  if(name==='attackmove'){if(!attackMove)cancelBuild();tacticalMode=null;setAttackMove(!attackMove);}
}
function showAlliance(){
  if(!playing||(sim.options.mode!=='custom'&&!sim.mission?.actFour&&!sim.mission?.actFive))return;
  const allies=sim.players.map((player,i)=>i).filter(i=>i!==0&&sim.allied(0,i)&&!sim.players[i].defeated&&!sim.players[i].dormant);
  if(!allies.length)return toast('No active ally can receive supplies.','warning');
  if(!allies.includes(allianceRecipient))allianceRecipient=allies[0];
  paused=true;showModal(allianceMarkup(sim,allianceRecipient),'alliance',true);$('#modal-root .modal').classList.add('alliance-dialog');
  refreshAllianceModal($('#modal-root'),sim,allianceRecipient);
}
function sendAllianceGift(){
  const root=$('#modal-root'),type=root.querySelector('#donation-resource')?.value,amount=Number(root.querySelector('#donation-amount')?.value),feedback=root.querySelector('#alliance-feedback');
  if(!feedback)return;
  refreshAllianceModal(root,sim,allianceRecipient);
  if(root.querySelector('[data-action=send-donation]').disabled){feedback.textContent='Choose an active ally and an amount you can afford.';return;}
  if(net.active&&net.socket?.readyState!==WebSocket.OPEN){feedback.textContent='Connection interrupted. Wait for the room to reconnect.';return;}
  const accepted=sim.donateResources(0,allianceRecipient,type,amount);
  feedback.textContent=accepted?net.active?'Gift sent. Waiting for the shared battlefield to update.':`Sent ${amount} ${type}.`:'The gift could not be sent.';
  refreshAllianceModal(root,sim,allianceRecipient);renderHUD();
}
let hudTouch=null,recentHudTouch=null;
function selectNearbyTroops(x,y){
  if(!playing||paused||buildType)return;
  const target=view.pick(x,y)||(touchDevice?touchUnitAt(view,x,y):null);
  if(target?.owner===0&&target.kind==='unit'){const rect=view.renderer.domElement.getBoundingClientRect(),sameType=sim.owned(0,'unit',target.type).filter(u=>!u.embarked),onScreen=sameType.filter(u=>{const p=view.project(u,rect);return p.visible&&p.x>=rect.left&&p.x<=rect.right&&p.y>=rect.top&&p.y<=rect.bottom;});setSelection((onScreen.length?onScreen:sameType.filter(u=>distance(u,target)<40)).map(u=>u.id));}
}
installBattleZoomGuard(document,()=>playing,{onDoubleTap:(event,{startedAt})=>{
  const button=event.target.closest?.('button,a[href],summary');
  if(button){
    // HUD pointerup already completes touch buttons, including rapid training.
    if(button.disabled||!button.isConnected||recentHudTouch?.button===button&&recentHudTouch.at>=startedAt)return;
    button.click();
  }else if(event.target===view?.renderer.domElement){const touch=event.changedTouches[0];selectNearbyTroops(touch.clientX,touch.clientY);}
}});
const touchHud=$('#hud');
touchHud.addEventListener('pointerdown',event=>{if(event.pointerType!=='touch')return;const button=event.target.closest('button');hudTouch=button&&!button.disabled?{id:event.pointerId,button,x:event.clientX,y:event.clientY,at:performance.now()}:null;});
touchHud.addEventListener('pointercancel',()=>{hudTouch=null;});
touchHud.addEventListener('pointerup',event=>{const touch=hudTouch;hudTouch=null;if(!touch||event.pointerId!==touch.id||touch.button.disabled||!touch.button.isConnected||Math.hypot(event.clientX-touch.x,event.clientY-touch.y)>12||performance.now()-touch.at>700)return;
  // Chrome can omit the synthesized click immediately after a canvas drag.
  // Complete a short touch here and suppress its duplicate native click.
  recentHudTouch={button:touch.button,at:performance.now(),x:event.clientX,y:event.clientY};event.preventDefault();touch.button.click();
});
// Suppress the compatibility click before direct widget listeners as well as
// delegated commands. A canceled pointerup alone does not suppress it in Chrome.
document.addEventListener('click',event=>{
  if(event.isTrusted&&recentHudTouch&&performance.now()-recentHudTouch.at<1000&&(event.pointerType==='touch'||event.sourceCapabilities?.firesTouchEvents)&&Math.hypot(event.clientX-recentHudTouch.x,event.clientY-recentHudTouch.y)<20){recentHudTouch=null;event.preventDefault();event.stopImmediatePropagation();}
},true);
document.addEventListener('click',event=>{const el=event.target.closest('button,a[data-action]');if(!el)return;
  if(el.dataset.playSlot!==undefined){customDraft=readBattleSetup($('#modal-root'));customDraft.playerSlot=Number(el.dataset.playSlot);customDraft.spectator=customDraft.playerSlot===0;try{localStorage.setItem('crowns-custom-setup',JSON.stringify(customDraft));}catch{}showCustomBattle();return;}
  if(activeReplay&&['commsAlly','commsTaunt','heroAutocast','heroSkill'].some(key=>el.dataset[key]!==undefined))return;
  if((isAISpectator()||activeReplay)&&['demolish','convertGate','formation','stance','treeUnit','treeTech','build','townBell','returnWork','train','research','cancelQueue','trade'].some(key=>el.dataset[key]!==undefined))return;
  if(el.dataset.battlePreset)showCustomBattle(el.dataset.battlePreset);
  if(el.dataset.donationTarget){allianceRecipient=Number(el.dataset.donationTarget);const feedback=$('#alliance-feedback');if(feedback)feedback.textContent='';refreshAllianceModal($('#modal-root'),sim,allianceRecipient);}
  if(el.dataset.focusKingdom){const player=sim.players[Number(el.dataset.focusKingdom)];if(player?.start)view.focus(player.start.x,player.start.z);}
  if(el.dataset.commsAlly&&playing&&sim&&!sim.ended){const res=issueAllyOrder(el.dataset.commsAlly);if(!res.ok&&res.message)toast(res.message,'warning');else if(res.message)toast(res.message);renderHUD();return;}
  if(el.dataset.commsTaunt&&playing&&sim&&!sim.ended){replayRecorder.note('enemyTaunt',el.dataset.commsTaunt);const res=warComms.sendEnemyTaunt(sim,el.dataset.commsTaunt);if(!res.ok&&res.message)toast(res.message,'warning');return;}
  if(el.dataset.heroAutocast&&playing&&sim&&!sim.ended){const h=sim.get(Number(el.dataset.heroAutocast));if(h&&h.owner===0&&isHeroUnit(h)){replayRecorder.note('heroAutoCast',h.id);h.autoCast=h.autoCast===false;selectionKey='';renderSelection();toast(`${h.displayName||'Hero'} Auto-Cast ${h.autoCast?'enabled':'paused'}.`);}return;}
  if(el.dataset.heroSkill!==undefined&&playing&&sim&&!sim.ended){const h=sim.get(Number(el.dataset.heroId));if(h&&h.owner===0&&isHeroUnit(h)){const index=Number(el.dataset.heroSkill);replayRecorder.note('heroSkill',h.id,index);const ok=triggerHeroSkill(sim,h,index);if(!ok)toast('Skill ready — wait for enemies or allies nearby, or let Auto-Cast trigger in battle.','warning');renderSelection();}return;}
  if(el.dataset.action&&!nearby.handleAction(el.dataset.action,el))action(el.dataset.action,event.shiftKey);
  if(el.dataset.convertGate){const gate=sim.convertWallToGate(Number(el.dataset.convertGate));if(gate===true)toast('Gatehouse conversion requested.');else if(gate){setSelection([gate.id]);toast('Wall converted to a gatehouse.');}renderHUD();}
  if(el.dataset.mapFilter){minimapFilter=el.dataset.mapFilter;view.minimapFilter=minimapFilter;for(const b of document.querySelectorAll('[data-map-filter]')){const on=b.dataset.mapFilter===minimapFilter;b.classList.toggle('active',on);b.setAttribute('aria-pressed',String(on));}renderMinimap();return;}
  if(el.dataset.demolish){const id=Number(el.dataset.demolish),target=sim.get(id),now=performance.now();if(needsDemolishConfirm(target)&&!(demolishArmed&&demolishArmed.id===id&&now-demolishArmed.at<4200)){demolishArmed={id,at:now};el.classList.add('armed');el.textContent='Confirm demolish? (click again)';toast('Click Demolish again within 4s to confirm.','warning');return;}demolishArmed=null;sim.demolish(id);selectionKey='';renderSelection();}
  if(el.dataset.formation){if(net.active&&!net.action('formation',[el.dataset.formation]))return;replayRecorder.note('formation',el.dataset.formation);replayActions.formation(el.dataset.formation);selectionKey='';renderSelection();}
  if(el.dataset.stance){if(sim.setStance(selection,el.dataset.stance)===false)return;selectionKey='';renderSelection();toast(el.dataset.stance==='hold'?'Units will hold their position and defend.':'Units will engage nearby enemies.');}
  if(el.dataset.treeFaction)showTechnologyTree(el.dataset.treeFaction);
  if(el.dataset.treeUnit){sim.train(Number(el.dataset.building),el.dataset.treeUnit);showTechnologyTree(treeFaction);}
  if(el.dataset.treeTech){sim.research(Number(el.dataset.building),el.dataset.treeTech);showTechnologyTree(treeFaction);}
  if(el.dataset.mode)showSetup(el.dataset.mode);
  if(el.dataset.start){const seed=Math.abs(Number($('#seed').value))||Math.floor(Math.random()*999999),mapSize=$('#map-size')?.value,aiPersonality=$('#ai-personality')?.value||'balanced';startGame({mode:el.dataset.start,faction:$('#faction').value,difficulty:$('#difficulty').value,aiPersonality,map:$('#map').value,...(mapSize?{mapSize}:{}),seed,showBriefing:true});}
  if(el.dataset.atlasNode){if($('#atlas-faction'))setupOptions.faction=$('#atlas-faction').value;if($('#atlas-difficulty'))setupOptions.difficulty=$('#atlas-difficulty').value;if($('#atlas-relic'))setupOptions.relic=$('#atlas-relic').value;showCampaign(el.dataset.atlasNode);return;}
  if(el.dataset.atlasAct){if($('#atlas-faction'))setupOptions.faction=$('#atlas-faction').value;if($('#atlas-difficulty'))setupOptions.difficulty=$('#atlas-difficulty').value;if($('#atlas-relic'))setupOptions.relic=$('#atlas-relic').value;atlasActFilter=el.dataset.atlasAct;showCampaign(atlasSelectedId);return;}
  if(el.dataset.atlasLaunch){const m=MISSIONS.find(item=>item.id===el.dataset.atlasLaunch);if(m){const faction=$('#atlas-faction')?.value||setupOptions.faction||'alder',difficulty=$('#atlas-difficulty')?.value||setupOptions.difficulty||'normal',relic=$('#atlas-relic')?.value||setupOptions.relic||'frontier-charter';setupOptions={...setupOptions,faction,difficulty,relic};startGame({mode:m.id,faction,difficulty,relic,map:m.map||'highlands',seed:m.seed,showBriefing:true});}return;}
  if(el.dataset.atlasOpen){menuReturn();showCampaign(el.dataset.atlasOpen);return;}
  if(el.dataset.hubMode||el.dataset.hubFaction||el.dataset.hubMap){const scroll=$('#modal-root .modal')?.scrollTop||0;hubDraft={...(hubDraft||setupOptions),difficulty:$('#difficulty')?.value||setupOptions.difficulty,aiPersonality:$('#ai-personality')?.value||setupOptions.aiPersonality||'balanced',mapSize:$('#map-size')?.value||setupOptions.mapSize||'large',seed:Math.abs(Number($('#seed')?.value))||setupOptions.seed};if(el.dataset.hubMode)hubDraft.mode=el.dataset.hubMode;if(el.dataset.hubFaction)hubDraft.faction=el.dataset.hubFaction;if(el.dataset.hubMap)hubDraft.map=el.dataset.hubMap;showSkirmishHub();const d=$('#modal-root .modal');if(d)d.scrollTop=scroll;return;}
  if(el.dataset.settingsTab){settingsTab=el.dataset.settingsTab;for(const t of document.querySelectorAll('[data-settings-tab]')){const on=t.dataset.settingsTab===settingsTab;t.classList.toggle('active',on);t.setAttribute('aria-pressed',String(on));}for(const p of document.querySelectorAll('[data-pane]'))p.classList.toggle('active',p.dataset.pane===settingsTab);return;}
  if(el.dataset.saveSlot){const res=writeSaveSlot(el.dataset.saveSlot,sim,{networkActive:net.active});if(res==='saved'){toast('Kingdom saved to slot.');showSaveManager();}else toast('Could not save to this slot.','warning');return;}
  if(el.dataset.loadSlot){const save=readSaveSlot(el.dataset.loadSlot);if(save){try{startGame(save.options,save);}catch{toast('The saved kingdom could not be restored.','warning');}}else toast('This save slot is empty.','warning');return;}
  if(el.dataset.deleteSlot){if(deleteSaveSlot(el.dataset.deleteSlot)){toast('Save slot deleted.');if(!playing)refreshLanding();showSaveManager();}return;}
  if(el.dataset.playReplay){const rec=readReplay(el.dataset.playReplay);if(rec)startGame({replayRecord:rec});else toast('Replay not found.','warning');return;}
  if(el.dataset.deleteReplay){if(deleteReplay(el.dataset.deleteReplay)){toast('Replay deleted.');showSaveManager();}return;}
  if(el.dataset.summaryTab){summaryTab=el.dataset.summaryTab;renderEndSummary();return;}
  if(el.dataset.summaryMetric){summaryMetric=el.dataset.summaryMetric;renderEndSummary();return;}
  if(el.dataset.codex)showCodex(el.dataset.codex);
  if(el.dataset.buildTab){buildCategory=el.dataset.buildTab;renderBuildPanel();return;}
  if(el.dataset.focusEntity){const id=Number(el.dataset.focusEntity),e=sim.get(id);if(event.shiftKey){setSelection(selection.filter(x=>x!==id));}else if(e){setSelection([id]);view.focus(e.x,e.z);}return;}
  if(el.dataset.build){cancelBuild();buildType=el.dataset.build;$('#build-panel').classList.add('hidden');$('#placement-controls').classList.remove('hidden');$('#world').classList.add('placing');$('#order-hint').textContent=buildType==='wall'?'Tap or drag a wall line. Tap a tree to join it, then choose Build wall.':buildType==='gate'?`Choose open land or tap your existing wall to place ${wallDisplayName(sim,{kind:'building',type:'gate',owner:0})}.`:'Choose open land to place '+BUILDINGS[buildType].name+'.';syncContextBanner();if(buildType==='wall'){$('#hud').classList.add('wall-placing');$('#placement-controls').classList.add('wall-controls');updateWallPlacement(true);}else $('#placement-controls').innerHTML='<button data-action="cancel-build">Done building</button>';}
  if(el.dataset.townBell){const sent=sim.townBell(Number(el.dataset.townBell));if(sent===false&&net.active)return;toast(sent?'Nearby villagers are seeking shelter.':'No nearby villagers or no shelter space.');renderSelection();}
  if(el.dataset.returnWork){sim.returnToWork(Number(el.dataset.returnWork));renderSelection();}
  if(el.dataset.train){const ids=el.dataset.building==='group'?selection:[Number(el.dataset.building)];trainAcrossBuildings(sim,el.dataset.train,ids,Number(el.dataset.batch)||(event.shiftKey?5:1));renderSelection();renderProduction();}
  if(el.dataset.research){sim.research(Number(el.dataset.building),el.dataset.research);renderSelection();}
  if(el.dataset.cancelQueue!==undefined){sim.cancelQueue(Number(el.dataset.building),Number(el.dataset.cancelQueue));renderSelection();renderProduction();}
  if(el.dataset.trade){sim.trade(el.dataset.trade,el.dataset.buy==='true');renderHUD();}
  if(el.dataset.selectType)setSelection(sim.owned(0,BUILDINGS[el.dataset.selectType]?'building':'unit',el.dataset.selectType).map(e=>e.id));
  if(el.dataset.cycleSubgroup)cycleSelectionGroup();
  if(el.dataset.group&&groups[el.dataset.group]?.length)setSelection(groups[el.dataset.group]);
  if(el.dataset.productionSelect){const b=sim.get(Number(el.dataset.productionSelect));if(b?.owner===0){setSelection([b.id]);view.focus(b.x,b.z);if(touchDevice&&productionOpen)action('production');}}
  if(el.dataset.productionGroup){setSelection(productionBuildings(sim).filter(b=>el.dataset.productionGroup==='all'||b.type===el.dataset.productionGroup).map(b=>b.id));if(touchDevice&&productionOpen)action('production');}
});
$('#control-groups-bar')?.addEventListener('dblclick',event=>{const el=event.target.closest('[data-group]');if(!el)return;const ids=groups[el.dataset.group];if(!ids?.length)return;setSelection(ids);const lead=sim.get(ids[0]);if(lead)view.focus(lead.x,lead.z);});
$('#control-groups-bar')?.addEventListener('contextmenu',event=>{const el=event.target.closest('[data-group]');if(!el)return;event.preventDefault();delete groups[el.dataset.group];renderControlGroups();});
 document.addEventListener('input',event=>{if(modal==='alliance'&&['donation-amount','donation-resource'].includes(event.target.id))refreshAllianceModal($('#modal-root'),sim,allianceRecipient);const lbl=event.target.id&&document.querySelector(`[data-vol-label="${event.target.id}"]`);if(lbl)lbl.textContent=`${Math.round(Number(event.target.value)*100)}%`;});
 document.addEventListener('change',event=>{if(modal==='alliance'&&['donation-amount','donation-resource'].includes(event.target.id))refreshAllianceModal($('#modal-root'),sim,allianceRecipient);});
document.addEventListener('change',event=>{updateSetupDescriptions();if(modal==='lan-lobby'&&event.target.dataset.aiHealthSlot){net.send({type:'ai-health',slot:Number(event.target.dataset.aiHealthSlot),health:Number(event.target.value)});return;}if(modal==='custom-setup'){if(event.target.id==='custom-player-slot'||event.target.id.startsWith('custom-type-')){const id=event.target.id,scroll=$('#modal-root .modal').scrollTop;customDraft=readBattleSetup($('#modal-root'));showCustomBattle();$('#modal-root .modal').scrollTop=scroll;document.getElementById(id)?.focus({preventScroll:true});}else customDraft=updateBattlePreview($('#modal-root'));try{localStorage.setItem('crowns-custom-setup',JSON.stringify(customDraft));}catch{}}if(event.target.id==='lobby-slot')net.send({type:'slot',slot:Number(event.target.value)});});
document.addEventListener('keydown',event=>{const key=event.key.toLowerCase();if(chronicleActive){if((key==='enter'||key===' ')&&!$('#chronicle-begin-btn')?.classList.contains('hidden')){event.preventDefault();beginFromChronicle();}return;}if(key==='escape'&&chat.opened){event.preventDefault();chat.close();return;}if(key==='escape'&&modal){event.preventDefault();closeModal();return;}if(['INPUT','SELECT','TEXTAREA'].includes(event.target.tagName)||event.target.isContentEditable)return;if(!playing)return;if((key===' '||key==='enter')&&event.target.closest('button,a,summary'))return;if(key==='escape'&&$('#objectives').contains(event.target)&&$('#objectives').classList.contains('objectives-expanded')){event.preventDefault();action('objectives-expand');$('#objectives .objective-toggle').focus({preventScroll:true});return;}if(key==='enter'&&net.active&&!modal&&!event.target.closest('button,a')){event.preventDefault();chat.open(true);return;}if(chat.opened)return;
  if([' ','arrowup','arrowdown','arrowleft','arrowright'].includes(key))event.preventDefault();
  if(key==='escape'){if(tacticalMode||attackMove||unloadMode||pingMode){tacticalMode=null;unloadMode=false;pingMode=false;$('#map-flare-btn')?.classList.remove('active');$('#map-flare-btn')?.setAttribute('aria-pressed','false');setAttackMove(false);}else if(buildType||!$('#build-panel').classList.contains('hidden'))cancelBuild();else if(modal)closeModal();else if(productionOpen)action('production');else if(scoreboardOpen)action('scoreboard');else showPause();return;}
  if(event.key==='Alt'&&playing&&view){view.altPeek=true;renderHealth();}
  if(paused&&!exploringEnd)return;
  if(key==='tab'&&!modal&&!event.ctrlKey&&!event.metaKey&&!event.altKey&&selection.length>1){event.preventDefault();cycleSelectionGroup(event.shiftKey);return;}
  keys.add(key);if(event.repeat)return;
  if(!event.ctrlKey&&!event.metaKey&&!event.altKey){const control=controlForKey(key,settings.bindings);if(control){event.preventDefault();if(control==='focus'&&selection.length){const e=sim.get(selection[0]);if(e)view.focus(e.x,e.z);}else if(!control.startsWith('pan')&&!control.startsWith('rotate'))action(control,event.shiftKey);}}
  if(/^[1-4]$/.test(key)&&event.altKey&&!event.ctrlKey&&!event.metaKey&&playing&&sim&&!sim.ended&&!isAISpectator()&&!activeReplay){event.preventDefault();const cmds=['attack','defend','help','supplies'];const res=issueAllyOrder(cmds[Number(key)-1]);if(!res.ok&&res.message)toast(res.message,'warning');else if(res.message)toast(res.message);renderHUD();return;}
  if(/^[1-9]$/.test(key)){if(event.ctrlKey||event.metaKey){event.preventDefault();groups[key]=[...selection];toast(groups[key].length?`Control group ${key} assigned.`:`Control group ${key} cleared.`);renderControlGroups();}else if(groups[key]?.length){pruneGroups();if(groups[key]?.length)setSelection(groups[key]);else renderControlGroups();}}
});
document.addEventListener('keyup',event=>{keys.delete(event.key.toLowerCase());if(event.key==='Alt'&&view){view.altPeek=false;renderHealth();}});window.addEventListener('blur',()=>{keys.clear();if(view)view.altPeek=false;if(playing&&!paused&&!chronicleActive&&!sim.ended&&!net.active&&!sim.options.multiplayer){paused=true;showPause();}});
document.addEventListener('visibilitychange',()=>{if(document.hidden)audio.context?.suspend();else audio.context?.resume().catch(()=>{});if(document.hidden&&playing&&!sim.ended&&!net.active&&!sim.options.multiplayer){saveGame(true);if(!paused)showPause();}});

function updateRotate(){$('#rotate-hint').classList.toggle('show',playing&&touchDevice&&innerHeight>innerWidth&&!portraitDismissed);}
window.addEventListener('resize',()=>{updateRotate();positionControlGroups();});
const releaseObjectiveLayout=watchObjectiveLayout(document),releasePlacementLayout=watchPlacementLayout(document);window.addEventListener('pagehide',event=>{if(!event.persisted){releaseObjectiveLayout();releasePlacementLayout();}});
const RALLY_BUILDINGS=new Set(Object.values(UNITS).flatMap(u=>u.at||[]));
const canCommandSelection=list=>list.some(e=>e.owner===0&&(e.kind==='unit'||(e.kind==='building'&&RALLY_BUILDINGS.has(e.type))));
function issue(point,target,append=false){if(isAISpectator()||activeReplay||!point||!insideMap(point.x,point.z,sim.worldSize))return;const ownedSelected=selected().filter(e=>e.owner===0),ids=ownedSelected.map(e=>e.id);if(!ids.length||!canCommandSelection(ownedSelected))return;const decalKind=resolveCommandDecalKind(sim,ownedSelected,target,{attackMove,tacticalMode,unloadMode});const speaker=ownedSelected.find(isHumanVoiceUnit);const limit=sim.halfWorld-3,x=Math.max(-limit,Math.min(limit,point.x)),z=Math.max(-limit,Math.min(limit,point.z));if(tacticalMode){const accepted=tacticalMode==='patrol'?sim.patrol(ids,x,z,append):sim.guard(ids,target?.id,append);if(!accepted){toast(tacticalMode==='guard'?'Choose a friendly unit or building and select military units.':'Select military units to patrol.','warning');return;}tacticalMode=null;$('#order-hint').textContent='Select units to issue orders.';syncContextBanner();if(speaker)audio.voice?.('order',speaker,sim.players[0]?.faction);}else if(sim.smartCommand(ids,target,x,z,append,attackMove)===false)return;else if(speaker){const isEnemy=target&&target.owner!==undefined&&target.owner!==0,isResource=target&&(target.kind==='resource'||(target.kind==='building'&&target.progress<1)),kind=(attackMove||isEnemy)?'attack':isResource?'work':'order';audio.voice?.(kind,speaker,sim.players[0]?.faction);}view.mark(x,z,decalKind);if(attackMove)setAttackMove(false);renderSelection();}
function placementPreview(type,point){if(!point)return null;if(type==='gate'){const plan=gatePlacementPlan(sim,point.x,point.z,0);return {x:plan.x,z:plan.z,valid:plan.valid,angle:plan.angle||0};}return {x:point.x,z:point.z,valid:sim.buildValid(type,point.x,point.z),angle:0};}
function place(point,event){if(isAISpectator()||!point||!buildType)return;const result=sim.build(buildType,point.x,point.z,workers());if(result){const pos=result?.x!==undefined?result:point;view.mark(pos.x,pos.z);if(!event.shiftKey&&(buildType!=='wall'||event.pointerType==='touch'))cancelBuild();}renderHUD();}
function placementPointerPoint(event){if(buildType==='wall'&&!wallDraft.panning)return wallPointerPoint(view,event.clientX,event.clientY);if(buildType==='gate'){const target=view.pick(event.clientX,event.clientY);if(target?.hp>0&&target.kind==='building'&&target.type==='wall'&&target.owner===0)return {x:target.x,z:target.z};}return view.groundPoint(event.clientX,event.clientY);}
if(view){const canvas=view.renderer.domElement;canvas.addEventListener('contextmenu',e=>e.preventDefault());canvas.style.touchAction='none';let hoverPickAt=0;canvas.addEventListener('pointerleave',()=>{view.hoverEntityId=null;});
  canvas.addEventListener('pointerdown',e=>{audio.unlock();view.hoverEntityId=null;if(!playing||(paused&&!exploringEnd)||(sim.ended&&!exploringEnd))return;if(buildType&&e.button===2){e.preventDefault();cancelBuild();pointer=null;touches.clear();pinch=null;return;}canvas.setPointerCapture(e.pointerId);touches.set(e.pointerId,{x:e.clientX,y:e.clientY});if(touches.size>1){const pts=[...touches.values()];pinch={distance:touches.size===2?Math.hypot(pts[0].x-pts[1].x,pts[0].y-pts[1].y):null};if(pointer)pointer.pinched=true;return;}
    pointer={x:e.clientX,y:e.clientY,lastX:e.clientX,lastY:e.clientY,button:e.button,touch:e.pointerType==='touch',dragged:false,start:placementPointerPoint(e),pinched:false};
    clearTimeout(longPressTimer);longPressFired=false;
    if(pointer.touch&&!buildType&&!pingMode&&!attackMove&&!tacticalMode){const lx=e.clientX,ly=e.clientY;longPressTimer=setTimeout(()=>{if(!pointer||pointer.dragged||pointer.pinched)return;const hit=view.pick(lx,ly)||touchUnitAt(view,lx,ly);if(hit){longPressFired=true;setSelection([hit.id]);}},420);}
  });
  canvas.addEventListener('pointermove',e=>{hover={x:e.clientX,y:e.clientY};if(!playing||(paused&&!exploringEnd)){view.hoverEntityId=null;updateWorldCursor(null);return;}if(e.pointerType!=='touch'&&!pointer&&!buildType&&!exploringEnd){const now=performance.now();if(now-hoverPickAt>=70){hoverPickAt=now;const hit=view.pick(e.clientX,e.clientY);view.hoverEntityId=hit?.id??null;updateWorldCursor(hit);}}const p=buildType==='gate'?placementPointerPoint(e):view.groundPoint(e.clientX,e.clientY);if(buildType&&(buildType!=='wall'||!wallDraft.start&&!wallDraft.panning)){const preview=placementPreview(buildType,p);if(preview)view.showGhost(buildType,preview.x,preview.z,preview.valid,preview.angle);else view.hideGhost();}
    if(touches.has(e.pointerId))touches.set(e.pointerId,{x:e.clientX,y:e.clientY});
    if(pinch){if(touches.size===2){const pts=[...touches.values()],d=Math.hypot(pts[0].x-pts[1].x,pts[0].y-pts[1].y);if(pinch.distance!==null)view.zoomBy((pinch.distance-d)*.1);pinch.distance=d;}return;}
    if(!pointer||pointer.pinched)return;const dx=e.clientX-pointer.lastX,dy=e.clientY-pointer.lastY;if(Math.hypot(e.clientX-pointer.x,e.clientY-pointer.y)>8)pointer.dragged=true;
    if(pointer.dragged){if(exploringEnd){view.pan(-dx*view.zoom/innerHeight,-dy*view.zoom/innerHeight);}else if(buildType==='wall'&&pointer.button===0&&!wallDraft.panning){$('#selection-box').style.display='none';if(pointer.start&&p)wallDraft.drag(pointer.start,p);}else if(pointer.touch||pointer.button===1||buildType==='wall'&&wallDraft.panning&&pointer.button===0){view.pan(-dx*view.zoom/innerHeight, -dy*view.zoom/innerHeight);}else if(pointer.button===0){const box=$('#selection-box');box.style.display='block';box.style.left=Math.min(e.clientX,pointer.x)+'px';box.style.top=Math.min(e.clientY,pointer.y)+'px';box.style.width=Math.abs(e.clientX-pointer.x)+'px';box.style.height=Math.abs(e.clientY-pointer.y)+'px';}}
    pointer.lastX=e.clientX;pointer.lastY=e.clientY;
  });
  canvas.addEventListener('pointerup',e=>{clearTimeout(longPressTimer);touches.delete(e.pointerId);if(!touches.size)pinch=null;else if(pinch)pinch.distance=null;$('#selection-box').style.display='none';if(!pointer||paused||exploringEnd){pointer=null;return;}const old=pointer;pointer=null;if(old.pinched||longPressFired){longPressFired=false;return;}const point=buildType==='wall'&&!wallDraft.panning&&!old.dragged?old.start:placementPointerPoint(e);
    if((pingMode||(e.altKey&&old.button===0))&&!old.dragged&&point){dropTacticalPing(point.x,point.z,'flare','Tactical flare');return;}
    if(buildType){if(old.button!==0)return;if(buildType==='wall'){if(wallDraft.panning)return;if(point){if(old.dragged&&old.start)wallDraft.drag(old.start,point);else wallDraft.point(point);updateWallPlacement(true);}}else if(!old.dragged)place(point,e);return;}
    const target=view.pick(e.clientX,e.clientY)||(old.touch?touchUnitAt(view,e.clientX,e.clientY):null);
    if(old.dragged){if(!old.touch&&old.button===0){const rect=canvas.getBoundingClientRect(),minX=Math.min(old.x,e.clientX),maxX=Math.max(old.x,e.clientX),minY=Math.min(old.y,e.clientY),maxY=Math.max(old.y,e.clientY);const units=sim.owned(0,'unit').filter(unit=>{const p=view.project(unit,rect);return p.visible&&p.x>=minX&&p.x<=maxX&&p.y>=minY&&p.y<=maxY;});setSelection(e.shiftKey?[...selection,...units.map(u=>u.id)]:units.map(u=>u.id));}return;}
    if(unloadMode&&point){const ship=selected().find(e=>e.type==='transport');if(ship&&sim.unload(ship.id,point.x,point.z)){unloadMode=false;$('#order-hint').textContent='Select units to issue orders.';syncContextBanner();view.mark(point.x,point.z);}return;}
    if(old.button===2||attackMove||tacticalMode){issue(point,target,e.shiftKey);return;}
    if(old.touch&&canCommandSelection(selected())&&(target?.owner!==0||target?.type==='transport'&&selected().some(e=>e.kind==='unit'&&!UNITS[e.type].naval)||(workers().length&&(target?.kind==='building'&&(target.progress<1||target.type==='farm'||target.hp<target.maxHp)||mechanicalUnit(target)&&target.hp<target.maxHp)))){issue(point,target);return;}
    if(target)setSelection(e.shiftKey?[...selection,target.id]:[target.id]);else if(old.touch&&selection.length)issue(point,null);else setSelection([]);
  });
  canvas.addEventListener('pointercancel',e=>{clearTimeout(longPressTimer);longPressFired=false;touches.delete(e.pointerId);pointer=null;pinch=touches.size?{distance:null}:null;$('#selection-box').style.display='none';});
  canvas.addEventListener('dblclick',e=>selectNearbyTroops(e.clientX,e.clientY));
  canvas.addEventListener('wheel',e=>{if(!playing||(paused&&!exploringEnd))return;e.preventDefault();if(!e.ctrlKey)view.zoomBy(e.deltaY*.045);},{passive:false});
  const minimap=$('#minimap');let mapPointer=null;
  const mapFocus=e=>{const point=minimapPoint(e.clientX,e.clientY,minimap.getBoundingClientRect(),sim.worldSize);view.focus(point.x,point.z);renderMinimap();};
  minimap.setAttribute('aria-label','Square minimap: click or drag to move the camera; right-click to give an order');
  minimap.addEventListener('pointerdown',e=>{if(!playing||(paused&&!exploringEnd)||(sim.ended&&!exploringEnd)||modal)return;e.preventDefault();const pt=minimapPoint(e.clientX,e.clientY,minimap.getBoundingClientRect(),sim.worldSize);if(!exploringEnd&&(pingMode||(e.altKey&&e.button===0))){dropTacticalPing(pt.x,pt.z,'flare','Tactical flare');return;}if(e.button===2&&!exploringEnd)issue(pt,null,e.shiftKey);else if(e.button===0){mapPointer=e.pointerId;minimap.setPointerCapture(e.pointerId);mapFocus(e);}});
  minimap.addEventListener('pointermove',e=>{if(mapPointer===e.pointerId&&playing&&(!paused||exploringEnd)&&(!sim.ended||exploringEnd)&&!modal)mapFocus(e);});
  const releaseMap=e=>{if(mapPointer===e.pointerId){mapPointer=null;if(minimap.hasPointerCapture(e.pointerId))minimap.releasePointerCapture(e.pointerId);}};
  minimap.addEventListener('pointerup',releaseMap);minimap.addEventListener('pointercancel',releaseMap);minimap.addEventListener('lostpointercapture',()=>{mapPointer=null;});minimap.addEventListener('contextmenu',e=>e.preventDefault());
}
let graphicsRecoveryUi=null;
function syncGraphicsRecovery(){
  if(view?.graphicsFatal){
    if(graphicsRecoveryUi?.failure===view.graphicsFatal)return;
    const compatible=startupCompatibilityURL({failure:view.graphicsFatal,backend:rendererBackend(view.renderer),playing,network:!!net.socket,modal:!!modal,href:location.href,storage:graphicsSession});
    if(compatible){renderClosed=true;$('#graphics-status').textContent='Opening compatible graphics…';$('#graphics-status').classList.remove('hidden');location.replace(compatible);return true;}
    const wasPaused=graphicsRecoveryUi?.wasPaused??paused,network=!!(net.active||sim?.options.multiplayer),saved=playing&&!network&&saveGame(true);
    graphicsRecoveryUi={failure:view.graphicsFatal,wasPaused};paused=true;keys.clear();pointer=null;touches.clear();pinch=null;edgeScroll.reset();
    showModal(graphicsRecoveryMarkup({playing,network,saved,deviceLost:!!view.graphicsFatal.deviceLost,backendError:!!view.graphicsFatal.backendError,support:graphicsSupport()}),'graphics-recovery');$('#modal-root [data-action="close"]')?.remove();$('#modal-root [data-action="retry-battlefield"],#modal-root [data-action="reload-battlefield"]')?.focus();
  }else if(graphicsRecoveryUi){
    const state=graphicsRecoveryUi;graphicsRecoveryUi=null;
    if(modal==='graphics-recovery'){closeModal();paused=state.wasPaused;toast('The battlefield is restored.');}
  }
}
async function retryBattlefield(){
  if(!view?.graphicsFatal||view.graphicsLoading||graphicsNeedsReload(view.graphicsFatal))return;
  const button=$('#modal-root [data-action="retry-battlefield"]');if(button)button.disabled=true;
  const note=$('#graphics-recovery-note');if(note)note.textContent='Restoring your battlefield…';
  const applied=await view.quality(view.graphicsRecoveryQuality||view.renderQuality||'low');
  if(!applied){const current=$('#modal-root [data-action="retry-battlefield"]');if(current)current.disabled=false;const status=$('#graphics-recovery-note');if(status)status.textContent='Graphics could not recover. Your match remains in memory. Try again, or save before reloading.';}
}
let lastRender=0,frameRequest=0,renderClosed=false,presentingMatch=null;const framePacer=new FramePacer();
function presentBattlefield(){
  const world=$('#world'),match=sim;
  if(!world.classList.contains('world-poster')||presentingMatch===match)return;
  presentingMatch=match;
  const finish=ready=>{
    if(presentingMatch!==match)return;
    presentingMatch=null;
    if(ready&&playing&&sim===match&&!view.graphicsFatal){world.classList.remove('world-poster');lastRender=last=performance.now();simulationPacer.reset();}
  };
  const queue=view.renderer.backend?.device?.queue;
  if(!queue?.onSubmittedWorkDone){finish(true);return;}
  try{queue.onSubmittedWorkDone().then(()=>finish(true),()=>finish(false));}catch{finish(false);}
}
function frame(now){if(renderClosed||syncGraphicsRecovery())return;const elapsed=Math.max(0,(now-last)/1000),dt=Math.min(.08,elapsed);last=now;
  const firstFrame=playing&&worldEl.classList.contains('world-poster')&&!view?.graphicsFatal,graphicsBusy=!!view?.graphicsLoading||firstFrame;
  if(graphicsBusy!==lastGraphicsBusy){lastGraphicsBusy=graphicsBusy;graphicsStatusEl.classList.toggle('hidden',!graphicsBusy);worldEl.setAttribute('aria-busy',String(graphicsBusy));}
  if(graphicsBusy){const statusText=firstFrame?'Preparing the battlefield…':'Updating graphics…';if(statusText!==lastGraphicsText){lastGraphicsText=statusText;setUIText(graphicsStatusEl,statusText);}}
  if(view){const canPanCamera=playing&&!modal&&!chat.opened&&(!paused&&!sim.ended||exploringEnd);const keyboardPan=['panUp','panDown','panLeft','panRight'].some(id=>heldControl(keys,id,settings.bindings));const edgeMoved=edgeScroll.tick(view,dt,{active:canPanCamera&&!keyboardPan&&(buildType!=='wall'||wallDraft.panning),enabled:settings.edgeScroll,speed:settings.edgeScrollSpeed});
    if(edgeMoved&&buildType&&buildType!=='wall'&&edgeScroll.point){const point=buildType==='gate'?placementPointerPoint({clientX:edgeScroll.point.x,clientY:edgeScroll.point.y}):view.groundPoint(edgeScroll.point.x,edgeScroll.point.y);const preview=placementPreview(buildType,point);if(preview)view.showGhost(buildType,preview.x,preview.z,preview.valid,preview.angle);else view.hideGhost();}
    if(buildType==='wall')updateWallPlacement();
    if(playing&&!firstFrame&&!document.hidden&&!view.graphicsRebuilding&&!view.graphicsFatal&&(!paused&&!sim.ended||exploringEnd)){const pan=dt*view.zoom*.42;if(heldControl(keys,'panUp',settings.bindings))view.pan(0,-pan);if(heldControl(keys,'panDown',settings.bindings))view.pan(0,pan);if(heldControl(keys,'panLeft',settings.bindings))view.pan(-pan,0);if(heldControl(keys,'panRight',settings.bindings))view.pan(pan,0);if(heldControl(keys,'rotateLeft',settings.bindings)){view.angle+=dt;view.updateCamera();}if(heldControl(keys,'rotateRight',settings.bindings)){view.angle-=dt;view.updateCamera();}
      if(!paused&&!sim.ended){const steps=simulationPacer.advance(elapsed,speed);for(let i=0;i<steps;i++)if(!net.active){if(activeReplay){activeReplay.step(sim);if(activeReplay.finished||sim.ended){paused=true;setUIText($('#replay-toggle-btn'),'Finished');$('#replay-toggle-btn').disabled=true;if(activeReplay.failed)toast('A recorded command failed. Playback stopped.','warning');break;}}view.localMotion.capture(sim);sim.tick(SIMULATION_STEP);view.localMotion.commit(sim);}accumulator=simulationPacer.accumulator;uiTime+=dt;if(uiTime>.3){matchTimeline.sample(sim);if(activeReplay){setUIText($('#replay-status'),`REPLAY · ${formatTime(sim.time)} / ${formatTime(activeReplay.record.duration||0)}`);const rp=$('#replay-progress');if(rp)rp.style.width=`${Math.round(activeReplay.progress*100)}%`;}renderHUD(false);renderSelection();uiTime=0;}if(!activeReplay&&sim.time-lastAutosave>60){saveGame(true);lastAutosave=sim.time;}}
    }
    if(playing){mapTime+=dt;if(mapTime>=.1){renderMinimap();mapTime=0;}}
    view.localBlend=!playing||paused||modal||sim.ended||net.active||document.hidden?1:Math.min(1,accumulator/SIMULATION_STEP);view.combatTime=(sim?.time??0)+(playing&&!paused&&!modal&&!sim.ended&&!document.hidden?(net.active?Math.min(.2,Math.max(0,(performance.now()-(view.networkSnapshotAt||performance.now()))/1000)):Math.min(SIMULATION_STEP,accumulator)):0);
    if(playing&&!firstFrame&&!paused&&!modal&&!document.hidden)view.adapt(dt);else{view.renderPressure=null;view.performanceClock=0;}const renderInterval=document.hidden?1000:modal?100:1000/targetFrameRate(settings);
    // Keep the opening scene still so queued frames share its shadow map.

    if(playing&&framePacer.due(now,renderInterval)){
      const renderGap=lastRender?Math.min(1.5,Math.max(0,(now-lastRender)/1000)):dt;
      view.wallStep=firstFrame?0:paused?dt:renderGap*Math.max(1,speed);
      if(view.render(firstFrame?0:Math.min(.2,Math.max(0,(now-lastRender)/1000)),false)!==false){
        lastRender=now;renderHealth();presentBattlefield();
      }
    }
    audio.tick(dt);audio.weather(view.weatherState,playing&&!paused&&!sim.ended);audio.updateScene?.({dt,view,sim,active:playing&&!paused&&!sim.ended});if(weatherLabelEl){const weatherType=view.weatherState?.type,weatherName=WEATHER_NAMES[weatherType]||'Clear',weatherText=weatherType==='clear'?'Clear':weatherName.split(' ')[0],weatherTitle=`Weather: ${weatherName}. Mode: ${settings.weather}. Click to change.`;if(weatherText!==lastWeatherText){lastWeatherText=weatherText;weatherLabelEl.textContent=weatherText;}if(weatherButtonEl&&weatherTitle!==lastWeatherTitle){lastWeatherTitle=weatherTitle;weatherButtonEl.title=weatherTitle;}}
    audio.updateCombat();
  }frameRequest=requestAnimationFrame(frame);
}
frameRequest=requestAnimationFrame(frame);
document.addEventListener('visibilitychange',()=>{last=performance.now();lastRender=last;simulationPacer.reset();accumulator=0;edgeScroll.reset();view?.localMotion?.clear();});
window.addEventListener('pagehide',event=>{if(event.persisted)return;renderClosed=true;cancelAnimationFrame(frameRequest);releaseRenderers(view);});
// Expose the running game for reproducible browser QA and debugging.
window.frontier={get sim(){return sim;},get view(){return view;},get audio(){return audio;},get warComms(){return warComms;},get playing(){return playing;},get paused(){return paused;},get selection(){return selection;},get groups(){return groups;},get alerts(){return tacticalAlerts;},get timeline(){return matchTimeline;},start:startGame,select:setSelection,action,ping:dropTacticalPing,save:saveGame,showEnd};

if(import.meta.env.PROD&&view)registerOfflineGame();

document.addEventListener('keydown',event=>{if(event.key!=='Tab'||!modal)return;const dialog=$('#modal-root [role=dialog]');if(!dialog||getComputedStyle(dialog).visibility==='hidden')return;const buttons=[...dialog.querySelectorAll('button:not(:disabled),input:not(:disabled),select:not(:disabled),textarea:not(:disabled),a[href],[tabindex="0"]')].filter(e=>e.getClientRects().length&&getComputedStyle(e).visibility!=='hidden');if(!buttons.length)return;const first=buttons[0],last=buttons.at(-1);if(!dialog.contains(document.activeElement)||event.shiftKey&&document.activeElement===first){event.preventDefault();(event.shiftKey?last:first).focus();}else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus();}});

let netMode=(()=>{try{return localStorage.getItem('crowns-net-mode')==='nearby'?'nearby':'online';}catch{return 'online';}})();
// Online rooms use the hosted server; Nearby rooms are hosted by one player's
// browser and joined by QR code over a shared Wi-Fi or hotspot, with no internet.
function setNetMode(mode){netMode=mode==='nearby'?'nearby':'online';try{localStorage.setItem('crowns-net-mode',netMode);}catch{}const shell=$('#modal-root .net-shell');if(!shell)return;shell.dataset.netMode=netMode;for(const tab of shell.querySelectorAll('[role=tab]')){const on=tab.dataset.action==='lan-mode-'+netMode;tab.setAttribute('aria-selected',String(on));tab.tabIndex=on?0:-1;}}
function showLan(error=''){if(net.active)return showPause();if(offlineGraphicsPreference)toast('Using cached Performance graphics for this session.');const offline=navigator.onLine===false;if(offline)netMode='nearby';const tab=(mode,icon,title,detail)=>`<button class="net-tab" role="tab" data-action="lan-mode-${mode}" aria-selected="${netMode===mode}" tabindex="${netMode===mode?0:-1}">${icon}<span><strong>${title}</strong><small>${detail}</small></span></button>`;
  showModal(`<div class="eyebrow">TWO COMMANDERS. ONE FRONTIER.</div><h2>Play with friends</h2>${error?`<p class="modal-intro network-error" role="status">${esc(error)}</p>`:''}<div class="net-shell" data-net-mode="${netMode}"><div class="net-mode" role="tablist" aria-label="How to connect">${tab('online',NEARBY_ICONS.globe,'Online','Room codes over the internet')}${tab('nearby',NEARBY_ICONS.wifi,'Nearby','Same Wi-Fi or hotspot · no internet')}</div>${offline?'<p class="net-offline" role="status">You are offline. Nearby battles work without any internet connection.</p>':''}<p class="modal-intro online-only">Open the same game address on every device. Join a room by code, or create a custom battle with up to eight kingdoms and a mix of friends and AI.</p><p class="modal-intro nearby-only">One device hosts the battle and friends join by scanning its QR invite. Everyone connects to the same Wi-Fi or to the host's phone hotspot. No internet or server is needed.</p><div class="setup-grid"><div><label class="field-label" for="lan-name">COMMANDER NAME</label><input id="lan-name" maxlength="24" value="Commander"></div><div><label class="field-label" for="lan-faction">CIVILIZATION</label><select id="lan-faction">${Object.entries(FACTIONS).map(([id,f])=>`<option value="${id}">${f.name}</option>`).join('')}</select></div><div><label class="field-label" for="lan-mode">VICTORY CONDITION</label><select id="lan-mode">${MODES.filter(m=>['skirmish','regicide','dominion','koth','deathmatch','wonder','tides'].includes(m.id)).map(m=>`<option value="${m.id}">${m.name}</option>`).join('')}</select></div><div><label class="field-label" for="lan-map">BATTLEFIELD</label><select id="lan-map">${Object.entries(MAPS).map(([id,m])=>`<option value="${id}">${m.name}</option>`).join('')}</select></div></div><div class="net-actions online-only"><button class="primary full lan-create" data-action="lan-host">Create a room ${uiIcon("chevron-right")}</button><button class="secondary full" data-action="custom-battle">Create custom multiplayer battle</button></div><div class="net-actions nearby-only"><button class="primary full" data-action="lan-host">${NEARBY_ICONS.wifi} Host a nearby room</button><button class="secondary full" data-action="lan-join-nearby">${NEARBY_ICONS.camera} Join a nearby room</button><button class="secondary full" data-action="custom-battle">Create custom nearby battle</button></div><label class="field-label" for="lan-slot">CUSTOM ROOM SLOT</label><select id="lan-slot"><option value="0">Automatic assignment</option><option value="2">Slot 2</option><option value="3">Slot 3</option><option value="4">Slot 4</option><option value="5">Slot 5</option><option value="6">Slot 6</option><option value="7">Slot 7</option><option value="8">Slot 8</option></select><div class="lan-join online-only"><input id="lan-code" maxlength="6" placeholder="ROOM CODE" aria-label="Room code"><button class="secondary" data-action="lan-join">Join a room ${uiIcon("chevron-right")}</button></div>${net.session&&!net.transport?'<button class="text-button online-only" data-action="lan-resume">Rejoin your previous network session</button>':''}<p class="settings-note online-only">Share this game address and your room code with friends. Matches pause during a connection interruption and allow up to two minutes to reconnect.</p><p class="settings-note nearby-only">Keep the host's screen on during the battle. A friend who drops out can rejoin within two minutes by scanning a fresh invite from the host's commander menu.</p></div>`,'lan',true);}
function connectLan(host,forceNearby=false){const name=$('#lan-name').value.trim()||'Commander',faction=$('#lan-faction').value,mode=$('#lan-mode').value,map=$('#lan-map').value,room=$('#lan-code').value.trim().toUpperCase(),create={type:'create',name,faction,options:{mode,map,seed:Math.floor(Math.random()*999999)}};
  if(netMode==='nearby'||forceNearby){if(host)return nearby.hostRoom(create);return nearby.showJoin({name,faction,slot:Number($('#lan-slot').value)});}
  if(!host&&!/^[A-Z0-9]{6}$/.test(room))return showLan('Enter the six-character room code.');
  const message=host?create:{type:'join',name,faction,code:room,slot:Number($('#lan-slot').value)};if(net.socket||net.transport)net.leave();showModal('<div class="eyebrow">PREPARING THE FRONTIER</div><h2>Connecting…</h2><p class="modal-intro">Contacting the multiplayer server. A free hosted server may take a moment to wake up.</p><button class="secondary" data-action="lan-leave">Cancel</button>','lan');net.connect(message);}
const net=new LanClient({
  chatSession:(code,session)=>chat.session(code,session),chat:message=>chat.receive(message),chatError:message=>chat.error(message),donation:gift=>toast(`${gift.from} sent ${gift.amount} ${gift.resource} to ${gift.to}.`),connection:connected=>chat.connection(connected),chatReset:()=>chat.reset(),
  closed:()=>{if(playing)menuReturn();else closeModal();},
  notice:message=>{toast(message,'warning');if(!net.active&&modal==='lan'){if(!$('#lan-name'))showLan(message);else{let error=$('#modal-root .network-error');if(!error){error=document.createElement('p');error.className='modal-intro network-error';error.setAttribute('role','status');$('#modal-root h2').after(error);}error.textContent=message;}}},
  lobby:room=>{net.code=room.code;net.ready=room.selfReady;if(net.active)return;if(modal==='lan-lobby'&&refreshRoomLobby($('#modal-root'),room)){nearby.mountLobby(room);return;}nearby.modalClosed('lan-lobby');showModal(roomLobbyMarkup(room),'lan-lobby',true);nearby.mountLobby(room);},
  nearbyEnded:()=>nearby.end(),lost:()=>{if(playing)$('#alert-line').innerHTML='LOST CONTACT WITH THE NEARBY HOST · OPEN THE MENU TO REJOIN';},
  begin:state=>{startGame(state.options,state);net.bind(sim);const tc=sim.owned(0,'building','towncenter')[0];if(tc)view.focus(tc.x,tc.z);toast(`${sim.options.spectator?`Watching room ${net.code} as its host.`:`Connected to room ${net.code}.`}`);},
  state:(state,effects,waiting)=>{if(!playing||!net.active)return;view.networkSnapshotAt=performance.now();const snapshot=mergeSnapshotEntities(sim.entities,state,view.networkSnapshotAt);sim.visualProjectiles=state.visualProjectiles||[];sim.entities=snapshot.entities;sim.index=snapshot.index;for(const key of ['players','time','wave','nextWave','hold','enemyHold','wonderTime','stats','ended','revealedOwners'])sim[key]=state[key];sim.explored=state.explored;sim.visible=state.visible;sim.revision++;sim.grids={};view.pruneMissing(snapshot.index);
    const delta=state.visibilityDelta;if(!delta||delta.visible.length||delta.explored.length)view.updateFog();
    for(const effect of effects)onEvent(effect);if(waiting)$('#alert-line').innerHTML='WAITING FOR THE OTHER COMMANDER TO RECONNECT';else if($('#alert-line').textContent.includes('WAITING'))$('#alert-line').innerHTML='';renderHUD();renderSelection();if(modal==='alliance')refreshAllianceModal($('#modal-root'),sim,allianceRecipient);if(sim.ended&&modal!=='end')showEnd(sim.ended);},
});
// var: closeModal can run before this line during startup.
var nearby=createNearby({net,showModal,closeModal,toast,getModal:()=>modal,onRoomEnded:()=>{if(playing)menuReturn();else closeModal();}});
if(import.meta.env.PROD){
  const updates=installGameUpdates({buildId:document.querySelector('meta[name="frontier-build"]')?.content||'',canRefresh:()=>!net.active&&!net.transport,
    beforeRefresh:()=>playing&&!sim.ended?saveGame(true):true});
  window.frontier.checkUpdate=updates.check;
}
