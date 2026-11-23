import {DIFFICULTIES,FACTIONS,MAPS,MISSIONS,MODES,RELEASE,TECHS,UNITS,formatTime} from './data.js';
import {BATTLE_SIZES} from './custom-battle.js';
import {WEATHER_NAMES} from './weather.js';
import {LIGHTING_MODES} from './day-night.js';
import {FRAME_RATES} from './frame-pacing.js';
import {CAMERA_PRESETS} from './world.js';
import {difficultyLabel} from './ui-format.js';
import {UI_ICONS as ICONS,uiIcon} from './ui-icons.js';
import {terrainBiome} from './terrain-biomes.js';
import {AI_PERSONALITIES} from './ai-personalities.js';

const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

export const FACTION_SIGNATURES=Object.freeze({
  alder:{motto:'Hold the line. Build to endure.',unit:'sentinel',tech:'shieldDrill',accent:'#4fa896'},
  sun:{motto:'Gold commands the field.',unit:'marksman',tech:'caravanLedger',accent:'#e2b453'},
  raven:{motto:'Strike swift, ride before dawn.',unit:'outrider',tech:'raidingParties',accent:'#d9756d'},
});

export const SETTINGS_TABS=Object.freeze([
  {id:'graphics',label:'Graphics',icon:'sun'},
  {id:'gameplay',label:'Gameplay & HUD',icon:'columns-3'},
  {id:'audio',label:'Audio',icon:'play'},
  {id:'controls',label:'Controls',icon:'settings'},
  {id:'accessibility',label:'Accessibility',icon:'shield-check'},
]);

/** Hero AoE4/AoE2:DE vertical banner Main Menu replacing the 12-button sprawl. */
export function landingMarkup(latestSave=null,{menuBackdrop='artwork'}={}){
  const chapterCount=MISSIONS.length;
  const is3d=menuBackdrop==='diorama';
  const resumeCard=latestSave
    ? `<button id="resume" class="hero-continue" data-load-slot="${esc(latestSave.slotId)}">
        <span class="hero-continue-icon">${uiIcon('rotate-ccw')}</span>
        <span class="hero-continue-copy">
          <small>CONTINUE SAVED KINGDOM</small>
          <strong>${esc(latestSave.modeName)} · ${esc(latestSave.factionName)}</strong>
          <em>${esc(latestSave.ageName)} · ${esc(latestSave.mapName)} · ${formatTime(latestSave.time)}</em>
        </span>
        <span class="hero-arrow">${uiIcon('chevron-right')}</span>
      </button>`
    : `<button id="resume" class="resume hidden" data-action="resume">${uiIcon('rotate-ccw')} Resume saved kingdom</button>`;

  return `
    <header class="landing-header">
      <a class="brand" href="#" aria-label="Crowns of the Frontier"><span class="crest">${uiIcon('castle')}</span><span>CROWNS<span class="brand-sub">OF THE FRONTIER</span></span></a>
      <div class="header-links">
        <button data-action="tech-tree" aria-label="Open technology tree">${uiIcon('book-open')}<span>Tech tree</span></button>
        <button data-action="saves" aria-label="Saved kingdoms">${uiIcon('folder-open')}<span>Saves</span></button>
        <button data-action="settings" aria-label="Settings">${uiIcon('settings')}<span>Settings</span></button>
        <span class="edition">${RELEASE.split(' - ').reverse().join(' / ').toUpperCase()}</span>
      </div>
    </header>
    <main class="landing-main hero-layout">
      <div class="hero-column">
        <div class="eyebrow"><span class="short-rule"></span> REAL-TIME STRATEGY</div>
        <h1>Crowns <em>of the</em><br>Frontier<span class="title-dot">.</span></h1>
        <p class="intro">From the first timber to the final siege. Raise your kingdom in a living three-dimensional world.</p>
        ${resumeCard}
        <nav class="hero-nav" aria-label="Main menu">
          <button class="hero-btn primary" data-action="campaign">
            <span class="hero-btn-icon">${uiIcon('crown')}</span>
            <span class="hero-btn-copy"><strong>Campaign</strong><small>Interactive Frontier World Map · ${chapterCount} handcrafted chapters</small></span>
            ${uiIcon('chevron-right')}
          </button>
          <button class="hero-btn" data-action="skirmish-hub">
            <span class="hero-btn-icon">${uiIcon('swords')}</span>
            <span class="hero-btn-copy"><strong>Skirmish & Modes</strong><small>Conquest, Regicide, Survival, Dominion, Naval & Sandbox</small></span>
            ${uiIcon('chevron-right')}
          </button>
          <button class="hero-btn" data-action="custom-battle">
            <span class="hero-btn-icon">${uiIcon('custom')}</span>
            <span class="hero-btn-copy"><strong>Custom Battle</strong><small>Up to 8 kingdoms · alliances, victory rules & AI</small></span>
            ${uiIcon('chevron-right')}
          </button>
          <button class="hero-btn" data-action="lan">
            <span class="hero-btn-icon">${uiIcon('network')}</span>
            <span class="hero-btn-copy"><strong>Multiplayer</strong><small>Online room codes & local Nearby Wi-Fi / QR</small></span>
            ${uiIcon('chevron-right')}
          </button>
          <div class="hero-subrow">
            <button class="hero-mini" data-mode="tutorial">${uiIcon('graduation-cap')}<span>Tutorial</span></button>
            <button class="hero-mini" data-action="codex">${uiIcon('book-open')}<span>Field guide</span></button>
            <button class="hero-mini" data-action="saves">${uiIcon('folder-open')}<span>Load game</span></button>
            <button id="install" class="hero-mini hidden" data-action="install">${uiIcon('castle')}<span>Install</span></button>
          </div>
        </nav>
      </div>
    </main>
    <footer class="landing-footer">
      <span><span class="status-dot"></span> SOLO & MULTIPLAYER · WEBGPU & WEBGL 2</span>
      <span class="landing-footer-right">
        <button type="button" class="backdrop-toggle-pill ${is3d?'is-3d':''}" data-action="toggle-menu-backdrop" aria-pressed="${is3d}" title="Switch home screen between Painted Medieval Key Art and Live 3D Citadel Diorama">${uiIcon(is3d?'castle':'map')}<span>${is3d?'Live 3D Citadel':'Key Art · Switch to 3D'}</span></button>
        <span class="landing-footer-hint">Made for mouse & touch <span class="menu-divider" aria-hidden="true"></span> Best played in landscape</span>
      </span>
    </footer>
  `;
}

/** Visual Skirmish Hub with visual Mode cards, Civilization Crest cards, and Visual Biome Map picker. */
export function skirmishHubMarkup({mode='skirmish',faction='alder',difficulty='normal',aiPersonality='balanced',map='highlands',mapSize='large',seed=2026}={}){
  const activeMode=MODES.find(m=>m.id===mode)||MODES[0];
  const modes=MODES.filter(m=>m.id!=='custom');
  const activeMap=activeMode.map||map;
  const mapLocked=Boolean(activeMode.map);

  const modeCards=modes.map(m=>`<button type="button" class="hub-mode-card ${m.id===activeMode.id?'active':''}" data-hub-mode="${m.id}" aria-pressed="${m.id===activeMode.id}">
    <span class="hub-mode-icon">${uiIcon(m.id)}</span>
    <div><strong>${esc(m.tag)}</strong><small>${esc(m.name)}</small></div>
    <em>${esc(m.time||'')}</em>
  </button>`).join('');

  const civCards=Object.entries(FACTIONS).map(([id,f])=>{
    const sig=FACTION_SIGNATURES[id]||{motto:'',unit:'spearman',tech:'economy',accent:'#d9bc7a'};
    const u=UNITS[sig.unit],t=TECHS[sig.tech];
    return `<button type="button" class="civ-card ${id===faction?'active':''}" data-hub-faction="${id}" aria-pressed="${id===faction}" style="--civ-accent:${sig.accent}">
      <div class="civ-card-top"><i class="civ-swatch"></i><div><strong>${esc(f.name)}</strong><small>${esc(sig.motto)}</small></div></div>
      <p>${esc(f.desc)}</p>
      <div class="civ-uniques">
        <span>${ICONS[sig.unit]||uiIcon('swords')} <b>${esc(u?.name||'')}</b></span>
        <span>${ICONS[sig.tech]||uiIcon('age')} <b>${esc(t?.name||'')}</b></span>
      </div>
    </button>`;
  }).join('');

  const mapCards=Object.entries(MAPS).map(([id,m])=>{
    const biome=terrainBiome(id);
    return `<button type="button" class="biome-card ${id===activeMap?'active':''}" data-hub-map="${id}" ${mapLocked&&id!==activeMap?'disabled':''} aria-pressed="${id===activeMap}" title="${esc(m.desc)}">
      <span class="biome-swatch" style="background:${biome.map}"></span>
      <div><strong>${esc(m.name)}</strong><small>${esc(m.desc)}</small></div>
    </button>`;
  }).join('');

  return `<div class="eyebrow">SKIRMISH & CLASSIC MODES</div>
    <h2>Prepare for battle</h2>
    <p class="modal-intro">${esc(activeMode.desc)}</p>

    <div class="hub-section">
      <label class="field-label">GAME MODE</label>
      <div class="hub-mode-grid">${modeCards}</div>
    </div>

    <div class="hub-section">
      <label class="field-label">CHOOSE YOUR CIVILIZATION</label>
      <div class="civ-card-grid">${civCards}</div>
    </div>

    <div class="hub-section">
      <label class="field-label">BATTLEFIELD BIOME ${mapLocked?'<small>(fixed by mode)</small>':''}</label>
      <div class="biome-card-grid">${mapCards}</div>
    </div>

    <div class="setup-grid hub-footer-grid">
      <div>
        <label class="field-label" for="difficulty">DIFFICULTY</label>
        <select id="difficulty">${Object.entries(DIFFICULTIES).map(([id,d])=>`<option value="${id}" ${id===difficulty?'selected':''}>${difficultyLabel(id,d.name)}</option>`).join('')}</select>
        <div id="difficulty-description" class="faction-description">${esc(DIFFICULTIES[difficulty]?.desc||'')}</div>
        <label class="field-label" for="ai-personality" style="margin-top:8px">RIVAL AI PERSONALITY</label>
        <select id="ai-personality">${Object.values(AI_PERSONALITIES).map(p=>`<option value="${p.id}" ${p.id===aiPersonality?'selected':''}>${esc(p.name)} · ${esc(p.desc)}</option>`).join('')}</select>
      </div>
      <div>
        <label class="field-label" for="map-size">BATTLEFIELD SIZE</label>
        <select id="map-size">${Object.entries(BATTLE_SIZES).map(([id,s])=>`<option value="${id}" ${id===mapSize?'selected':''}>${esc(s.name)} · ${esc(s.desc)}</option>`).join('')}</select>
        <label class="field-label" for="seed" style="margin-top:10px">WORLD SEED</label>
        <input id="seed" type="number" min="1" max="999999999" value="${seed}">
      </div>
    </div>

    <input type="hidden" id="faction" value="${esc(faction)}">
    <input type="hidden" id="map" value="${esc(activeMap)}">

    <div class="mission-brief">
      <span>VICTORY CONDITION</span>
      <p>${esc(activeMode.objective)}</p>
      <small>${esc(activeMode.time||'Skirmish match')} · Mouse & touch supported</small>
    </div>
    <button class="primary full" data-start="${esc(activeMode.id)}">${activeMode.id==='tutorial'?'Start the tutorial':'Launch battle'} ${uiIcon('chevron-right')}</button>`;
}

/** 5-Tab Organized Settings Modal (all inputs stay mounted in DOM so Apply Settings reads every tab seamlessly!). */
export function settingsModalMarkup({settings,graphicsMode,rendererStatusText,graphicsSupportHtml,activeTab='graphics'}={}){
  const tabsHtml=SETTINGS_TABS.map(t=>`<button type="button" class="settings-tab ${t.id===activeTab?'active':''}" data-settings-tab="${t.id}" aria-pressed="${t.id===activeTab}">${uiIcon(t.icon)}<span>${t.label}</span></button>`).join('');
  const pane=id=>`settings-pane ${id===activeTab?'active':''}`;
  const volPct=v=>`${Math.round((v??1)*100)}%`;

  return `<div class="eyebrow">MAKE IT YOURS</div>
    <h2>Settings</h2>
    <nav class="settings-tabs" role="tablist" aria-label="Settings categories">${tabsHtml}</nav>

    <div class="${pane('graphics')}" data-pane="graphics">
      <label class="field-label" for="quality">GRAPHICS QUALITY</label>
      <select id="quality" aria-describedby="graphics-quality-help">
        <option value="auto" ${graphicsMode==='auto'?'selected':''}>Automatic · adjust to your device</option>
        <option value="high" ${graphicsMode==='high'?'selected':''}>High · detailed models & sharp surfaces</option>
        <option value="medium" ${graphicsMode==='medium'?'selected':''}>Balanced · detailed bases, lighter armies</option>
        <option value="low" ${graphicsMode==='low'?'selected':''}>Performance · lighter models & soft contacts</option>
      </select>
      <p id="graphics-quality-help" class="settings-note">Automatic may lower graphics to keep play smooth. High, Balanced, and Performance stay at your chosen quality.</p>
      <p id="renderer-status" class="settings-note">${esc(rendererStatusText||'')}</p>
      ${graphicsSupportHtml||''}
      <label class="field-label" for="frame-rate">FRAME RATE TARGET</label>
      <select id="frame-rate">${Object.entries(FRAME_RATES).map(([id,name])=>`<option value="${id}" ${settings.frameRate===id?'selected':''}>${esc(name)}</option>`).join('')}</select>
      <label class="field-label" for="lighting-mode">BATTLEFIELD LIGHTING</label>
      <select id="lighting-mode">${Object.entries(LIGHTING_MODES).map(([id,name])=>`<option value="${id}" ${(settings.lighting||'day')===id?'selected':''}>${esc(name)}</option>`).join('')}</select>
      <label class="field-label" for="weather-mode">WEATHER</label>
      <select id="weather-mode"><option value="auto" ${settings.weather==='auto'?'selected':''}>Automatic weather</option>${Object.entries(WEATHER_NAMES).map(([id,name])=>`<option value="${id}" ${settings.weather===id?'selected':''}>${esc(name)}</option>`).join('')}</select>
      <label class="toggle"><input id="reduce-foliage" type="checkbox" ${settings.reduceFoliage?'checked':''}> Reduce foliage detail <small>Fewer grass tufts and shrubs; stops foliage sway.</small></label>
      <label class="toggle"><input id="distant-units" type="checkbox" ${settings.distantUnits!==false?'checked':''}> Distant unit detail <small>Lighter models for small distant troops (takes effect on reload).</small></label>
      <label class="toggle"><input id="fog" type="checkbox" ${settings.fog?'checked':''}> Fog overlay <small>Enemy visibility rules remain active.</small></label>
      <label class="toggle"><input id="weather-lightning" type="checkbox" ${settings.lightning?'checked':''}> Lightning flashes <small>Reduced motion also disables flashes.</small></label>
    </div>

    <div class="${pane('gameplay')}" data-pane="gameplay">
      <label class="field-label" for="health-bar-mode">UNIT & BUILDING HEALTH BARS</label>
      <select id="health-bar-mode">
        <option value="smart" ${(settings.healthBarMode||'smart')==='smart'?'selected':''}>Smart · damaged & selected entities</option>
        <option value="always" ${settings.healthBarMode==='always'?'selected':''}>Always visible on all units & buildings</option>
      </select>
      <label class="field-label" for="hud-scale">HUD SCALE (DESKTOP & TABLET)</label>
      <select id="hud-scale">
        <option value="0.9" ${String(settings.hudScale||'1')==='0.9'?'selected':''}>90% · Compact battlefield view</option>
        <option value="1" ${String(settings.hudScale||'1')==='1'?'selected':''}>100% · Standard balanced</option>
        <option value="1.1" ${String(settings.hudScale||'1')==='1.1'?'selected':''}>110% · Large & legible</option>
      </select>
      <label class="field-label" for="minimap-side">MINIMAP CORNER (DESKTOP)</label>
      <select id="minimap-side">
        <option value="left" ${(settings.minimapSide||'left')==='left'?'selected':''}>Bottom-left (Classic Frontier)</option>
        <option value="right" ${settings.minimapSide==='right'?'selected':''}>Bottom-right (Classic AoE2)</option>
      </select>
      <label class="field-label" for="camera-preset">CAMERA VIEW</label>
      <select id="camera-preset">${Object.entries(CAMERA_PRESETS).map(([id,p])=>`<option value="${id}" ${settings.cameraPreset===id?'selected':''}>${esc(p.label)}</option>`).join('')}</select>
      <p class="settings-note">Use landscape on phones. Drag to pan, tap to select/command, long-press to inspect enemies/resources, and pinch to zoom.</p>
    </div>

    <div class="${pane('audio')}" data-pane="audio">
      <label class="field-label" for="volume">MASTER VOLUME <span data-vol-label="volume">${volPct(settings.volume)}</span></label>
      <input type="range" id="volume" min="0" max="1" step=".05" value="${settings.volume}">
      <label class="field-label" for="music-volume">MUSIC VOLUME <span data-vol-label="music-volume">${volPct(settings.musicVolume??1)}</span></label>
      <input type="range" id="music-volume" min="0" max="1" step=".05" value="${settings.musicVolume??1}">
      <label class="field-label" for="ui-volume">UI & ALERT CUES <span data-vol-label="ui-volume">${volPct(settings.uiVolume??1)}</span></label>
      <input type="range" id="ui-volume" min="0" max="1" step=".05" value="${settings.uiVolume??1}">
      <label class="toggle"><input id="music" type="checkbox" ${settings.music?'checked':''}> Ambient music</label>
      <label class="toggle"><input id="unit-voices" type="checkbox" ${settings.unitVoices!==false?'checked':''}> Unit voice responses</label>
      <label class="toggle"><input id="war-horns" type="checkbox" ${settings.warHorns!==false?'checked':''}> Brass war horn alerts</label>
      <label class="toggle"><input id="weather-sounds" type="checkbox" ${settings.weatherSounds?'checked':''}> Rain, wind, and thunder sounds</label>
    </div>

    <div class="${pane('controls')}" data-pane="controls">
      <label class="toggle"><input id="edge-scroll" type="checkbox" ${settings.edgeScroll?'checked':''}> Mouse edge scrolling</label>
      <label class="field-label" for="edge-scroll-speed">MOUSE SCROLL SPEED</label>
      <input type="range" id="edge-scroll-speed" min=".5" max="2" step=".25" value="${settings.edgeScrollSpeed}">
      <div id="settings-keybinds-anchor"></div>
    </div>

    <div class="${pane('accessibility')}" data-pane="accessibility">
      <label class="toggle"><input id="high-contrast" type="checkbox" ${settings.highContrast?'checked':''}> Higher contrast interface</label>
      <label class="toggle"><input id="colorblind" type="checkbox" ${settings.colorblind?'checked':''}> Colour-blind safe team colours <small>Swaps kingdom colours for a palette that stays distinct without red/green separation.</small></label>
      <label class="toggle"><input id="reduced-motion" type="checkbox" ${settings.reducedMotion?'checked':''}> Reduce decorative motion</label>
    </div>

    <div class="settings-footer">
      <button class="primary full" data-action="apply-settings">Apply settings ${uiIcon('check')}</button>
    </div>`;
}

/** Multi-Slot Save & Replay Manager Modal (Auto-Save + 3 Manual Slots + Recent Match Replays). */
export function saveManagerMarkup(slots,{canSave=false,networkActive=false,replays=[]}={}){
  const fmtDate=ts=>ts?new Date(ts).toLocaleString(undefined,{month:'short',day:'numeric',hour:'2-digit',minute:'2-digit'}):'';
  const rows=slots.map(s=>`<article class="save-slot-card ${s.exists?'occupied':'empty'}">
    <div class="save-slot-info">
      <div class="save-slot-head">
        <strong>${esc(s.label)}</strong>
        ${s.exists&&s.savedAt?`<small>${esc(fmtDate(s.savedAt))}</small>`:''}
      </div>
      ${s.exists
        ? `<p>${s.chapter?`Chapter ${esc(s.chapter)} · `:''}${esc(s.modeName)} · ${esc(s.factionName)}</p>
           <small>${esc(s.ageName)} · ${esc(s.mapName)} · ${formatTime(s.time)}</small>`
        : `<p class="save-slot-blank">Empty slot — ready to record a kingdom.</p>`}
    </div>
    <div class="save-slot-actions">
      ${canSave&&!networkActive?`<button type="button" class="secondary" data-save-slot="${esc(s.slotId)}">${uiIcon('save')}<span>${s.exists?'Overwrite':'Save'}</span></button>`:''}
      ${s.exists?`<button type="button" class="primary" data-load-slot="${esc(s.slotId)}">${uiIcon('play')}<span>Load</span></button>`:''}
      ${s.exists&&s.slotId!=='auto'?`<button type="button" class="save-delete" data-delete-slot="${esc(s.slotId)}" aria-label="Delete ${esc(s.label)}" title="Delete save">${uiIcon('x')}</button>`:''}
    </div>
  </article>`).join('');

  const replayRows=replays.length?`<div class="replay-section">
    <label class="field-label">RECENT BATTLE REPLAYS (${replays.length})</label>
    <div class="save-slots-list">${replays.map(r=>`<article class="save-slot-card occupied replay-card">
      <div class="save-slot-info">
        <div class="save-slot-head">
          <strong>${esc(r.modeName)} · ${r.won===true?'Victory':r.won===false?'Defeat':'Recorded'}</strong>
          ${r.recordedAt?`<small>${esc(fmtDate(r.recordedAt))}</small>`:''}
        </div>
        <p>${esc(r.factionName)} · ${esc(r.mapName)}</p>
        <small>${esc(r.ageName)} · ${formatTime(r.duration||0)} · ${(r.commands?.length||0)} commands</small>
      </div>
      <div class="save-slot-actions">
        <button type="button" class="primary" data-play-replay="${esc(r.id)}">${uiIcon('play')}<span>Watch</span></button>
        <button type="button" class="save-delete" data-delete-replay="${esc(r.id)}" aria-label="Delete replay" title="Delete replay">${uiIcon('x')}</button>
      </div>
    </article>`).join('')}</div>
  </div>`:'';

  return `<div class="eyebrow">CHRONICLES STORED ON THIS DEVICE</div>
    <h2>Saved kingdoms & replays</h2>
    <p class="modal-intro">${networkActive?'Multiplayer rooms reconnect through the room session. Local save slots and replays are available for solo battles and campaigns.':'Auto-save updates every minute during solo play. Use the three manual slots for separate realms, or replay recent solo battles.'}</p>
    <div class="save-slots-list">${rows}</div>
    ${replayRows}`;
}
