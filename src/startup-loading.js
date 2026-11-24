import {RELEASE} from './data.js';
import {uiIcon} from './ui-icons.js';

const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

/** Concise medieval fieldcraft tips displayed along the bottom of the startup loading screen. */
export const STARTUP_TIPS=Object.freeze([
  'Anchor short stone walls between natural cliffs and dense forests to fortify vast valleys at minimal stone cost.',
  'Command the high ground — troops fighting downhill deal up to +25% bonus damage across mountain passes.',
  'Spearmen shatter cavalry charges, archers cut down spearmen, and armored knights sweep unguarded bowmen.',
  'Keep Battering Rams escorted by infantry and Healers — once a gate breaks, troops pour straight through the breach.',
  'Shelter villagers inside Town Centers, Watchtowers, and Castles during raids to turn defenses into arrow volleys.',
  'Use the Alliance panel in multi-kingdom battles to gift surplus gold, wood, or stone to an allied stronghold.',
]);

/** Pure HTML generator for the full-screen AAA medieval startup loading screen. */
export function startupSplashMarkup({
  status='Preparing your kingdom…',
  percent=0,
  tip=STARTUP_TIPS[0],
  edition=RELEASE.split(' - ').reverse().join(' / ').toUpperCase(),
}={}){
  const clamped=Math.max(0,Math.min(100,Math.round(Number(percent)||0)));
  return `<div id="startup-splash" class="startup-splash" role="status" aria-live="polite" aria-label="Loading Crowns of the Frontier">
    <div class="startup-splash-art" aria-hidden="true"></div>
    <div class="startup-splash-vignette" aria-hidden="true"></div>
    <header class="startup-splash-top">
      <span class="startup-splash-badge"><span class="startup-crest">${uiIcon('castle')}</span><span>CROWNS OF THE FRONTIER</span></span>
      <span class="startup-splash-edition">${esc(edition)}</span>
    </header>
    <div class="startup-splash-dock">
      <div class="startup-splash-title">
        <span class="startup-eyebrow"><i class="startup-rule"></i> REAL-TIME STRATEGY <i class="startup-rule"></i></span>
        <h1>Crowns <em>of the</em> Frontier<span class="title-dot">.</span></h1>
      </div>
      <div class="startup-loader-box" id="startup-loader-box">
        <div class="startup-loader-meta">
          <span class="startup-status-text" id="startup-status-text">${esc(status)}</span>
          <strong class="startup-percent" id="startup-percent">${clamped}%</strong>
        </div>
        <div class="startup-bar-track" id="startup-bar-track" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${clamped}">
          <span class="startup-bar-fill" id="startup-bar-fill" style="width:${clamped}%"></span>
        </div>
        <p class="startup-tip" id="startup-tip">${uiIcon('shield')} <span>${esc(tip)}</span></p>
      </div>
      <div class="startup-error-box hidden" id="startup-error-box">
        <strong id="startup-error-title">The battlefield artwork could not load.</strong>
        <p id="startup-error-detail">Check your connection, then try again.</p>
        <button type="button" class="primary startup-retry-btn" id="startup-retry-btn">Try again</button>
      </div>
    </div>
  </div>`;
}

/**
 * Mounts and manages the full-screen medieval startup splash screen while
 * renderer, 3D GLB catalogues, and PBR surface textures load.
 */
export function createStartupSplash(host=document.body,{edition}={}){
  const wrapper=document.createElement('div');
  let tipIndex=Math.floor(Math.random()*STARTUP_TIPS.length);
  wrapper.innerHTML=startupSplashMarkup({tip:STARTUP_TIPS[tipIndex],edition});
  const el=wrapper.firstElementChild;
  host.append(el);

  const statusEl=el.querySelector('#startup-status-text');
  const percentEl=el.querySelector('#startup-percent');
  const trackEl=el.querySelector('#startup-bar-track');
  const fillEl=el.querySelector('#startup-bar-fill');
  const tipSpan=el.querySelector('#startup-tip span');
  const loaderBox=el.querySelector('#startup-loader-box');
  const errorBox=el.querySelector('#startup-error-box');
  const errorTitleEl=el.querySelector('#startup-error-title');
  const errorDetailEl=el.querySelector('#startup-error-detail');
  const retryBtn=el.querySelector('#startup-retry-btn');

  let currentPercent=4;
  fillEl.style.width='4%';
  percentEl.textContent='4%';
  trackEl.setAttribute('aria-valuenow','4');

  const tipTimer=setInterval(()=>{
    if(!el.isConnected||el.classList.contains('is-exiting'))return;
    tipIndex=(tipIndex+1)%STARTUP_TIPS.length;
    if(tipSpan)tipSpan.textContent=STARTUP_TIPS[tipIndex];
  },4600);

  let dismissed=false;
  return {
    el,
    setStatus(label,percent=null){
      if(dismissed)return;
      if(label&&statusEl)statusEl.textContent=label;
      if(percent!==null&&Number.isFinite(Number(percent))){
        const next=Math.max(currentPercent,Math.min(100,Math.round(Number(percent))));
        currentPercent=next;
        if(fillEl)fillEl.style.width=`${next}%`;
        if(percentEl)percentEl.textContent=`${next}%`;
        if(trackEl)trackEl.setAttribute('aria-valuenow',String(next));
      }
    },
    resetProgress(label='Preparing your kingdom…'){
      if(dismissed)return;
      currentPercent=4;
      errorBox?.classList.add('hidden');
      loaderBox?.classList.remove('hidden');
      if(statusEl)statusEl.textContent=label;
      if(fillEl)fillEl.style.width='4%';
      if(percentEl)percentEl.textContent='4%';
      if(trackEl)trackEl.setAttribute('aria-valuenow','4');
    },
    showError(title,detail){
      if(dismissed)return Promise.resolve();
      loaderBox?.classList.add('hidden');
      errorBox?.classList.remove('hidden');
      if(errorTitleEl)errorTitleEl.textContent=title||'The battlefield artwork could not load.';
      if(errorDetailEl)errorDetailEl.textContent=detail||'Check your connection, then try again.';
      retryBtn?.focus?.({preventScroll:true});
      return new Promise(resolve=>{
        if(!retryBtn){resolve();return;}
        retryBtn.onclick=()=>{retryBtn.onclick=null;resolve();};
      });
    },
    dismiss(){
      if(dismissed)return;
      dismissed=true;
      clearInterval(tipTimer);
      if(statusEl)statusEl.textContent='Entering the Frontier…';
      if(fillEl)fillEl.style.width='100%';
      if(percentEl)percentEl.textContent='100%';
      if(trackEl)trackEl.setAttribute('aria-valuenow','100');
      const reduced=typeof document!=='undefined'&&document.documentElement?.classList?.contains('reduced-motion');
      if(reduced){el.remove();return;}
      el.classList.add('is-exiting');
      setTimeout(()=>el.remove(),420);
    },
  };
}
