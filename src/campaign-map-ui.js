import {DIFFICULTIES,FACTIONS,formatTime} from './data.js';
import {difficultyLabel} from './ui-format.js';
import {uiIcon,uiVectorIcon} from './ui-icons.js';
import {ATLAS_LANDMARKS,CAMPAIGN_ACTS,campaignAtlasState} from './campaign-map-data.js';
import {CAMPAIGN_BOSSES,CAMPAIGN_SIDE_QUESTS,unlockedCampaignRelics} from './campaign-relics.js';
import {commanderPortraitSvg,commanderProfile} from './commander-portraits.js';

const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

/** Lightweight pure-vector parchment realm illustration (zero GPU contexts, instant mount/unmount). */
function parchmentSvgMarkup(atlas,selectedId,actFilter){
  const routeSvg=atlas.routes.map(r=>{
    const dimmed=actFilter!=='all'&&r.act!==actFilter;
    const cls=`atlas-route ${r.conquered?'conquered':r.active?'active':'future'} ${dimmed?'dimmed':''}`;
    return `<path class="${cls}" d="${r.d}" fill="none" />`;
  }).join('');

  const landmarksSvg=ATLAS_LANDMARKS.map(l=>`<text class="atlas-landmark ${l.kind}" x="${l.x}" y="${l.y}" text-anchor="middle">${esc(l.label)}</text>`).join('');

  return `<svg class="atlas-svg" viewBox="0 0 1000 580" preserveAspectRatio="xMidYMid meet" aria-hidden="true">
    <defs>
      <radialGradient id="atlas-sea" cx="76%" cy="74%" r="72%">
        <stop offset="0%" stop-color="#223e46"/>
        <stop offset="55%" stop-color="#193037"/>
        <stop offset="100%" stop-color="#112127"/>
      </radialGradient>
      <linearGradient id="atlas-land" x1="0%" y1="100%" x2="100%" y2="0%">
        <stop offset="0%" stop-color="#c9b487"/>
        <stop offset="48%" stop-color="#bda578"/>
        <stop offset="82%" stop-color="#b5a385"/>
        <stop offset="100%" stop-color="#c9cfd1"/>
      </linearGradient>
      <radialGradient id="atlas-frost" cx="35%" cy="18%" r="36%">
        <stop offset="0%" stop-color="#dde5e7" stop-opacity=".86"/>
        <stop offset="68%" stop-color="#c2ced0" stop-opacity=".34"/>
        <stop offset="100%" stop-color="#c2ced0" stop-opacity="0"/>
      </radialGradient>
      <radialGradient id="atlas-cinder" cx="80%" cy="46%" r="22%">
        <stop offset="0%" stop-color="#7c4738" stop-opacity=".62"/>
        <stop offset="58%" stop-color="#5a4337" stop-opacity=".28"/>
        <stop offset="100%" stop-color="#5a4337" stop-opacity="0"/>
      </radialGradient>
      <radialGradient id="atlas-deepwood" cx="60%" cy="29%" r="18%">
        <stop offset="0%" stop-color="#4e6845" stop-opacity=".55"/>
        <stop offset="100%" stop-color="#4e6845" stop-opacity="0"/>
      </radialGradient>
      <filter id="atlas-coast-shadow" x="-5%" y="-5%" width="110%" height="110%">
        <feDropShadow dx="0" dy="4" stdDeviation="6" flood-color="#071114" flood-opacity=".55"/>
      </filter>
      <clipPath id="atlas-land-clip">
        <path d="M 52,520 C 42,420 56,280 96,170 C 134,88 228,46 362,48 C 482,50 618,62 732,118 C 824,162 886,222 874,306 C 864,368 784,368 726,392 C 674,414 668,468 614,496 C 538,534 422,524 316,522 C 218,520 112,542 52,520 Z"/>
      </clipPath>
    </defs>

    <!-- Sea backdrop & subtle cartographic rhumb lines -->
    <rect width="1000" height="580" fill="url(#atlas-sea)"/>
    <g stroke="#d8be82" stroke-opacity=".09" stroke-width="1">
      <line x1="0" y1="290" x2="1000" y2="290"/>
      <line x1="500" y1="0" x2="500" y2="580"/>
      <line x1="120" y1="0" x2="880" y2="580"/>
      <line x1="880" y1="0" x2="120" y2="580"/>
      <circle cx="885" cy="495" r="78" fill="none"/>
      <circle cx="885" cy="495" r="54" fill="none" stroke-dasharray="3 5"/>
    </g>

    <!-- Main Frontier Continent + Eastern Island Coast -->
    <path filter="url(#atlas-coast-shadow)" fill="url(#atlas-land)" stroke="#6c5635" stroke-width="2.4"
      d="M 52,520 C 42,420 56,280 96,170 C 134,88 228,46 362,48 C 482,50 618,62 732,118 C 824,162 886,222 874,306 C 864,368 784,368 726,392 C 674,414 668,468 614,496 C 538,534 422,524 316,522 C 218,520 112,542 52,520 Z"/>
    <!-- Divided Coast Eastern Shore -->
    <path filter="url(#atlas-coast-shadow)" fill="url(#atlas-land)" stroke="#6c5635" stroke-width="2.2"
      d="M 730,454 C 756,418 812,402 864,422 C 910,440 924,492 890,524 C 846,554 764,548 726,512 C 708,494 712,474 730,454 Z"/>

    <!-- Biome tint overlays clipped crisply inside the shoreline -->
    <g clip-path="url(#atlas-land-clip)">
      <ellipse cx="330" cy="128" rx="235" ry="102" fill="url(#atlas-frost)"/>
      <ellipse cx="792" cy="264" rx="126" ry="92" fill="url(#atlas-cinder)"/>
      <ellipse cx="604" cy="176" rx="132" ry="74" fill="url(#atlas-deepwood)"/>
    </g>

    <!-- Inner shoreline wave rings -->
    <path fill="none" stroke="#8ec2ca" stroke-opacity=".22" stroke-width="1.6" stroke-dasharray="6 4"
      d="M 632,504 C 678,478 688,424 736,404 C 792,380 874,378 886,312"/>

    <!-- Winding Frontier River & Stone Crossing -->
    <path fill="none" stroke="#2d5f6e" stroke-width="7" stroke-linecap="round" stroke-opacity=".75"
      d="M 294,48 C 282,138 308,214 274,292 C 244,358 268,438 228,524"/>
    <path fill="none" stroke="#6aa5b3" stroke-width="2.4" stroke-linecap="round" stroke-opacity=".65"
      d="M 294,48 C 282,138 308,214 274,292 C 244,358 268,438 228,524"/>

    <!-- Hand-drawn mountain ridges (Iron Ridge, Cinder Peaks, Frostmarch, Shattered Crown) -->
    <g fill="none" stroke="#5b4933" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" opacity=".72">
      <path d="M 334,432 L 352,404 L 370,432 M 362,438 L 384,404 L 406,438 M 398,432 L 416,408 L 434,432"/>
      <path d="M 744,242 L 764,206 L 784,242 M 776,248 L 802,198 L 828,248 M 816,242 L 836,214 L 856,242"/>
      <path d="M 358,118 L 378,88 L 398,118 M 392,122 L 416,84 L 440,122 M 434,118 L 454,92 L 474,118"/>
      <path d="M 164,132 L 188,96 L 212,132 M 204,138 L 228,100 L 252,138"/>
    </g>
    <!-- Volcanic ember accent on Cinder Peaks -->
    <circle cx="802" cy="204" r="3.5" fill="#e6723e" opacity=".82"/>
    <circle cx="802" cy="204" r="9" fill="#e6723e" opacity=".2"/>

    <!-- Deepwood stylized evergreen cluster -->
    <g fill="#365134" opacity=".68">
      <polygon points="558,162 566,144 574,162"/>
      <polygon points="578,154 586,134 594,154"/>
      <polygon points="628,158 636,138 644,158"/>
      <polygon points="646,172 654,152 662,172"/>
      <polygon points="566,192 574,174 582,192"/>
      <polygon points="104,406 112,388 120,406"/>
      <polygon points="120,396 128,378 136,396"/>
    </g>

    <!-- Ornate Cartographic Compass Rose -->
    <g transform="translate(918,496)" opacity=".78">
      <circle r="28" fill="#132227" fill-opacity=".68" stroke="#d8be82" stroke-width="1.2"/>
      <polygon points="0,-24 5,-5 0,-9 -5,-5" fill="#e6ca80"/>
      <polygon points="0,24 5,5 0,9 -5,5" fill="#9a8450"/>
      <polygon points="24,0 5,5 9,0 5,-5" fill="#9a8450"/>
      <polygon points="-24,0 -5,5 -9,0 -5,-5" fill="#9a8450"/>
      <text x="0" y="-31" text-anchor="middle" fill="#e6ca80" font-size="9" font-weight="700" letter-spacing="1">N</text>
    </g>

    <!-- Connected Campaign March Routes -->
    ${routeSvg}

    <!-- Geographic Region Typography -->
    ${landmarksSvg}

    <!-- Decorative double cartographic border -->
    <rect x="10" y="10" width="980" height="560" fill="none" stroke="#d8be82" stroke-opacity=".34" stroke-width="1.5"/>
    <rect x="16" y="16" width="968" height="548" fill="none" stroke="#d8be82" stroke-opacity=".16" stroke-width="1"/>
  </svg>`;
}

export function campaignMapMarkup({progress={},selectedId='campaign1',actFilter='all',freeSelect=false,setupOptions={}}={}){
  const atlas=campaignAtlasState(progress,freeSelect);
  const selected=atlas.nodes.find(n=>n.id===selectedId)||atlas.nodes.find(n=>n.status==='current')||atlas.nodes[0];
  const factionVal=setupOptions.faction||'alder';
  const diffVal=setupOptions.difficulty||'normal';

  const actTabs=CAMPAIGN_ACTS.map(a=>`<button type="button" class="atlas-act-tab ${a.id===actFilter?'active':''}" data-atlas-act="${a.id}" aria-pressed="${a.id===actFilter}"><strong>${esc(a.label)}</strong><small>${esc(a.subtitle)}</small></button>`).join('');

  const nodeButtons=atlas.nodes.map(n=>{
    const active=n.id===selected.id;
    const dimmed=actFilter!=='all'&&n.act!==actFilter;
    const icon=n.optional?uiIcon('trophy'):n.completed?uiIcon('check'):n.status==='current'?uiIcon('flag-triangle-right'):n.status==='locked'?uiIcon('shield'):uiIcon('swords');
    return `<button type="button" class="atlas-node status-${n.status} ${active?'selected':''} ${dimmed?'dimmed':''}" style="left:${(n.x/10).toFixed(2)}%;top:${(n.y/5.8).toFixed(2)}%" data-atlas-node="${n.id}" aria-pressed="${active}" aria-label="Chapter ${n.chapter}: ${esc(n.name)} (${n.status})" title="Chapter ${n.chapter} · ${esc(n.name)} — ${esc(n.region)}">
      <span class="atlas-seal">${icon}</span>
      <span class="atlas-pin-label"><b>${n.chapter}</b><em>${esc(n.name)}</em></span>
    </button>`;
  }).join('');

  const stagesHtml=selected.stages.map((st,i)=>`<li><span class="brief-step">${i+1}</span><div><strong>${esc(st.title)}</strong><p>${esc(st.text)}</p></div></li>`).join('');
  const medalHtml=selected.medal?`<div class="brief-medal tier-${selected.medal.tier}">${uiIcon(selected.optional?'trophy':'shield-check')}<span><strong>${esc(selected.medal.label)}</strong>${selected.seconds?` · Best ${formatTime(selected.seconds)}`:''}${selected.optional?' · Bonus Crown':''}</span></div>`:'';
  const boss=CAMPAIGN_BOSSES[selected.id]||null;
  const sideQuest=CAMPAIGN_SIDE_QUESTS[selected.id]||null;
  const relics=unlockedCampaignRelics(progress,freeSelect);
  const selectedRelic=relics.some(r=>r.id===setupOptions.relic&&r.unlocked)?setupOptions.relic:'frontier-charter';
  const activeRelicObj=relics.find(r=>r.id===selectedRelic)||relics[0];
  const bossHtml=boss?`<div class="brief-boss">${uiVectorIcon('swords')}<div><span>RIVAL COMMANDER · ${esc(boss.fortress)}</span><strong>${esc(boss.name)}</strong><small>${esc(boss.title)}</small></div></div>`:'';
  const sideQuestHtml=sideQuest?`<div class="brief-sidequest">${uiVectorIcon('flag-triangle-right')}<div><strong>Side Quest · ${esc(sideQuest.title)}</strong><p>${esc(sideQuest.text)}</p><small>Reward: ${esc(sideQuest.rewardText)}</small></div></div>`:'';
  const speakerProfile=commanderProfile(selected.speaker);

  return `<div class="atlas-shell" role="dialog" aria-modal="true" aria-labelledby="atlas-heading">
    <header class="atlas-topbar">
      <div class="atlas-brand">
        <span class="atlas-crest">${uiVectorIcon('crown')}</span>
        <div>
          <span class="eyebrow">THE FRONTIER CHRONICLES</span>
          <h2 id="atlas-heading">Campaign World Map</h2>
        </div>
      </div>
      <nav class="atlas-acts" role="tablist" aria-label="Campaign acts">${actTabs}</nav>
      <div class="atlas-top-actions">
        <span class="atlas-progress-pill" title="Completed campaign chapters">${uiVectorIcon('trophy')} <strong>${atlas.completedCount}/${atlas.total}</strong></span>
        <button type="button" class="atlas-chip ${freeSelect?'active':''}" data-action="atlas-free-select" aria-pressed="${freeSelect}" title="Unlock all chapters immediately for testing or replay">${uiVectorIcon('map')}<span>Free Select</span></button>
        <button type="button" class="atlas-chip" data-mode="tutorial" title="Play the First Light interactive tutorial">${uiVectorIcon('graduation-cap')}<span>Tutorial</span></button>
        <button type="button" class="atlas-chip" data-action="custom-battle" title="Create a custom multi-kingdom battle">${uiVectorIcon('users-round')}<span>Custom</span></button>
        <button type="button" class="atlas-close" data-action="close" aria-label="Close campaign map">${uiVectorIcon('x')}</button>
      </div>
    </header>

    <div class="atlas-workspace">
      <div class="atlas-stage" aria-label="Interactive Frontier Realm Map">
        <div class="atlas-canvas">
          ${parchmentSvgMarkup(atlas,selected.id,actFilter)}
          <div class="atlas-nodes-layer">${nodeButtons}</div>
        </div>
        <div class="atlas-legend">
          <span><i class="leg-dot completed"></i> Conquered</span>
          <span><i class="leg-dot current"></i> Current Frontier</span>
          <span><i class="leg-dot locked"></i> Uncharted</span>
          <span class="atlas-lore-note">${esc(selected.region)} · ${esc(selected.lore)}</span>
        </div>
      </div>

      <aside class="atlas-briefing" aria-label="Mission briefing">
        <div class="brief-header">
          <div class="brief-tags">
            <span class="brief-chapter">CHAPTER ${selected.chapter}</span>
            <span class="brief-badge">${esc(selected.archetype)}</span>
            <span class="brief-badge age">${esc(selected.ageName)}</span>
          </div>
          <h3>${esc(selected.name)}</h3>
          <p class="brief-region">${uiVectorIcon('map')} ${esc(selected.region)} · ${esc(selected.mapName)}</p>
        </div>

        ${medalHtml}
        ${bossHtml}

        <blockquote class="brief-quote">
          <div class="brief-portrait">${commanderPortraitSvg(selected.speaker,44)}</div>
          <div>
            <span class="brief-speaker">${esc(selected.speaker)} <small>· ${esc(speakerProfile.title)}</small></span>
            <p>“${esc(selected.intro)}”</p>
          </div>
        </blockquote>

        <div class="brief-section">
          <h4>MISSION OBJECTIVES</h4>
          <ol class="brief-objectives">${stagesHtml||`<li><span class="brief-step">1</span><div><strong>Victory</strong><p>${esc(selected.objective)}</p></div></li>`}</ol>
          ${sideQuestHtml}
          ${selected.optionalText?`<div class="brief-bonus">${uiVectorIcon('trophy')}<div><strong>Bonus Crown Objective</strong><p>${esc(selected.optionalText)}</p></div></div>`:''}
        </div>

        <div class="brief-relic-box">
          <label class="field-label" for="atlas-relic">WARBAND CROWN RELIC <small>(${relics.filter(r=>r.unlocked).length}/${relics.length} UNLOCKED)</small></label>
          <select id="atlas-relic">${relics.map(r=>`<option value="${r.id}" ${r.id===selectedRelic?'selected':''} ${r.unlocked?'':'disabled'}>${esc(r.name)} · ${esc(r.badge)}${r.unlocked?'':` (Unlock: ${r.unlockWins} wins or ${r.unlockCrowns} crowns)`}</option>`).join('')}</select>
          <small class="brief-relic-desc">${esc(activeRelicObj?.desc||'')}</small>
        </div>

        <div class="brief-setup">
          <div>
            <label class="field-label" for="atlas-faction">CIVILIZATION</label>
            <select id="atlas-faction">${Object.entries(FACTIONS).map(([id,f])=>`<option value="${id}" ${id===factionVal?'selected':''}>${esc(f.name)}</option>`).join('')}</select>
          </div>
          <div>
            <label class="field-label" for="atlas-difficulty">DIFFICULTY</label>
            <select id="atlas-difficulty">${Object.entries(DIFFICULTIES).map(([id,d])=>`<option value="${id}" ${id===diffVal?'selected':''}>${esc(difficultyLabel(id,d.name))}</option>`).join('')}</select>
          </div>
        </div>

        <div class="brief-actions">
          ${selected.unlocked
            ? `<button type="button" class="primary full" data-atlas-launch="${selected.id}">Launch Chapter ${selected.chapter} ${uiIcon('chevron-right')}</button>`
            : `<button type="button" class="secondary full" data-action="atlas-free-select">Unlock with Free Select to play early</button>`}
        </div>
      </aside>
    </div>
  </div>`;
}

/** Upgraded in-mission AoE2/AoE4-style dismissible Commander Dialogue Banner markup with heraldic SVG portrait. */
export function commanderBannerMarkup({speaker='Frontier Marshal',title='',text=''}={}){
  if(!text)return '';
  return `<div class="commander-banner" role="status" aria-live="polite">
    <span class="commander-crest portrait-host">${commanderPortraitSvg(speaker,38)}</span>
    <div class="commander-copy">
      <div class="commander-meta"><strong>${esc(speaker)}</strong>${title?`<span>${esc(title)}</span>`:''}</div>
      <p>${esc(text)}</p>
    </div>
    <button type="button" class="commander-dismiss" data-action="dismiss-dialogue" aria-label="Dismiss message">${uiIcon('x')}</button>
  </div>`;
}
