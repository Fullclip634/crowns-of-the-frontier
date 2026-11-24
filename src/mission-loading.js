import {AGES,DIFFICULTIES,FACTIONS,MAPS,MISSIONS,MODES} from './data.js';
import {CAMPAIGN_NODES} from './campaign-map-data.js';
import {CAMPAIGN_BOSSES,CAMPAIGN_SIDE_QUESTS} from './campaign-relics.js';
import {CAMPAIGN_SCRIPTS} from './campaigns.js';
import {commanderPortraitSvg,commanderProfile} from './commander-portraits.js';
import {uiIcon} from './ui-icons.js';

const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

/**
 * Rich Warcraft III / Age of Empires II-style pre-mission chronicle narratives
 * and tactical intelligence briefings for every handcrafted campaign chapter.
 */
export const MISSION_CHRONICLES=Object.freeze({
  campaign1:{
    act:'ACT I · THE FOOTHOLD',
    date:'Spring of the First Charter',
    chronicle:[
      'Beyond the broken border stones of Alder, the fertile green meadows have lain empty since the border wars burned the old villages to ash. Settlers and timberwrights now march north behind Marshal Elian’s banners to raise the first lasting foothold.',
      'Yet smoke already curls from the northeastern ridge. Rival outriders have staked a forward camp in the hills—build a strong economy, muster a spear line, and drive them back before harvest turns to slaughter.',
    ],
    startingBase:'Pioneer Camp · Town Center, Mill, Barracks & Starting Timber Groves',
    enemyIntel:'Northeastern Raider Outpost · Light Patrols',
    terrainIntel:'Open Emerald Meadows · Natural Boulder Groves & Berry Thickets',
    tip:'Keep villagers training continuously and use nearby boulder ridges to narrow enemy approaches.',
  },
  campaign2:{
    act:'ACT I · THE FOOTHOLD',
    date:'Month of High Waters',
    chronicle:[
      'The eastern garrison has seized the far bank of the Old Stone Crossing, starving our northern forts of iron and grain. Quartermaster Sera’s heavy supply caravan waits behind our river palisade, ready to force the arched bridge.',
      'The river cuts the battlefield in two. Fortify the western bridgehead, clear the enemy toll-towers watching the eastern span, and escort the caravan safely across before pushing on their garrison.',
    ],
    startingBase:'Fortified River Bridgehead · Palisade Checkpoints, Watchtower & Supply Caravan',
    enemyIntel:'Eastern Toll-Fort & River Garrison · Archers & Infantry',
    terrainIntel:'Winding Gorge River · Single Central Arched Stone Bridge',
    tip:'Guard the Supply Caravan with infantry and clear the eastern toll-tower before rolling across the bridge.',
  },
  campaign3:{
    act:'ACT I · THE FOOTHOLD',
    date:'Autumn of Iron Ridge',
    chronicle:[
      'Warlord Varek’s Raven warbands have smelled blood along Iron Ridge. Ahead of the storm, Castellan Maera’s masons have raised a battered outer stone wall and flanking watchtowers—but the great Castle Keep still awaits its cornerstone.',
      'Eight escalating waves of raiders, armored knights, and battering rams will hurl themselves against your gates. Seal the rock passes, raise your Castle high, and break the warbands upon your battlements.',
    ],
    startingBase:'Pre-Walled Ridge Stronghold · Perimeter Palisades, Stone Gate & Flanking Towers',
    enemyIntel:'Warlord Varek · 8 Escalating Assault Waves (Rams & Trebuchets late)',
    terrainIntel:'Iron Ridge Escarpment · Natural Stone Outcrops Flanking the Approaches',
    tip:'Repair walls during the lulls between waves and garrison villagers inside Towers when raiders reach the gate.',
  },
  campaign4:{
    act:'ACT I · THE FOOTHOLD',
    date:'Solstice of the Shrines',
    chronicle:[
      'Three ancient stone monoliths ring the sunlit Valley of Shrines, remnants of a forgotten empire whose tribute vaults still draw merchants and warlords alike. Keeper Nalin warns that whoever unites all three shrines commands the gold of the entire valley.',
      'Rocky crags divide the basin into natural lanes toward each shrine. Claim them swiftly, fortify the surrounding ridges with watchtowers, and hold all three banners for three full minutes—or shatter the rival capital directly.',
    ],
    startingBase:'Valley Forward Town · Fortified Outpost, Stable & Starting Patrol',
    enemyIntel:'Rival Shrine Claimants · Contesting All Three Valley Monoliths',
    terrainIntel:'Sacred Basin · Rock Ridges Funneling Toward Three Ancient Shrines',
    tip:'Build Watchtowers beside captured shrines so enemy raiding parties cannot easily flip them back.',
  },
  campaign5:{
    act:'ACT II · THE BORDER WARS',
    date:'Siege of the Twin-Gate Citadel',
    chronicle:[
      'Lord Draven has retreated behind the gleaming masonry of the Walled Capital—double curtain walls, iron portcullises, flanking watchtowers, and an inner Castle Keep overlooking the road. Arrows darken the sky before any footman can reach the stonework.',
      'Marshal Elian has pitched a fortified forward siege camp across the southern flats. Raise Siege Workshops, construct Battering Rams and Trebuchets, shield their crews with armored infantry and healers, and tear down Draven’s gates.',
    ],
    startingBase:'Forward Siege War-Camp · Castle-Age Economy, Barracks, Stable & Blacksmith',
    enemyIntel:'Lord Draven · Double-Walled Citadel, Gatehouses, Watchtowers & Inner Keep',
    terrainIntel:'Fortified Plains · Natural Cliff Shoulders Anchoring Enemy Ramparts',
    tip:'Never send rams alone—pair them with armored Swordsmen and a Healer to absorb tower fire and enemy knight sallies.',
  },
  campaign6:{
    act:'ACT II · THE BORDER WARS',
    date:'Crossing of the Divided Sea',
    chronicle:[
      'Beyond the western headlands lies the Divided Sea—a sapphire strait ruled by Corsair Admiral Rask and his coastal armada. His warships choke the fishing banks while his island fortress bristles with shore towers.',
      'Admiral Iven has secured a walled harbor bay on the western strand. Launch fishing boats to feed your war chest, command the waves with escort Galleys, and carry a strike force across by Transport—or shatter his citadel with Imperial Siege Galleons.',
    ],
    startingBase:'Fortified Coastal Harbor · Working Docks, Quay Watchtowers & Fishing Fleet',
    enemyIntel:'Corsair Admiral Rask · Eastern Coastal Fortress & Patrolling Warships',
    terrainIntel:'Wide Sea Channel · Fish-Rich Shallows & Landing Coves',
    tip:'Escort your Transport ships with Galleys, and build a forward Harbor on the enemy shore once your landing secures a beachhead.',
  },
  campaign7:{
    act:'ACT II · THE BORDER WARS',
    date:'March of the Cinder Reach',
    chronicle:[
      'Black basalt cliffs and choking ash fields guard the Ember Road—the only highland pass through the volcanic frontier. Ash-Lord Kaelen’s mountain warcamp straddles the high crags, pouring raiders down into the lowlands each night.',
      'Natural volcanic rock barriers choke the central valley into a narrow killing ground. Seize the Ash Pass, lock it down with stone walls and towers, burn the raider camp feeding their front, and storm Ember Keep above the cliffs.',
    ],
    startingBase:'Basalt Foothold · Pre-Fortified Pass Camp, Towers & Highland Garrison',
    enemyIntel:'Ash-Lord Kaelen · Fortified Mountain Camp & High-Ground Ember Keep',
    terrainIntel:'Volcanic Cliffs · Impassable Basalt Ridges Forming Narrow Choke Passes',
    tip:'High ground grants up to +25% bonus combat damage—take the ridge before committing to a major clash.',
  },
  campaign8:{
    act:'ACT III · THE SHATTERED CROWN',
    date:'Shadow of the Deepwood',
    chronicle:[
      'Ancient evergreen canopies have swallowed the old northern trade road. Forester Brann’s scouts report that rival raiders have carved hidden ambush camps deep inside the woodline, using the dense timber walls as impenetrable shields.',
      'Only narrow forest trails link the clearings—seal them with cheap palisades and gates, expand your timber economy, sweep the hidden ambush camp, and break the fortified woodfort waiting beyond the canopy.',
    ],
    startingBase:'Deepwood Clearing · Palisade Trailhead, Mill & Scouting Archers',
    enemyIntel:'Hidden Forest Ambush Camp & Fortified Woodfort Beyond the Trails',
    terrainIntel:'Blackwood Canopy · Impassable Dense Forest Walls & Narrow Ambush Lanes',
    tip:'Use Scouts carefully along the forest lanes and block flank trails with short palisade walls to prevent worker raids.',
  },
  campaign9:{
    act:'ACT III · THE SHATTERED CROWN',
    date:'The Long Night of Frostmarch',
    chronicle:[
      'Blizzards howl across Frostmarch as Siege-Master Torv encircles the northern palisade town in darkness. Cut off from the capital, Captain Sela’s garrison mans a fully walled winter perimeter with watchtowers burning against the snow.',
      'Hold the town center through two and a half grueling minutes of coordinated night assaults until Dawn Relief arches over the ridge—then sally forth, smash the northern siege camp, and break Torv’s hold forever.',
    ],
    startingBase:'Besieged Walled Winter Town · Complete Palisade Ring, Gatehouse & Watchtowers',
    enemyIntel:'Siege-Master Torv · Multi-Wave Night Siege & Northern Siege Camp',
    terrainIntel:'Frozen Tundra · Snow Drifts, Cliff Shoulders & Narrow Northern Road',
    tip:'Keep villagers stationed behind the front gate to repair damaged palisades and towers during each assault wave.',
  },
  campaign10:{
    act:'ACT III · THE SHATTERED CROWN',
    date:'Battle for the Shattered Crown',
    chronicle:[
      'Every road of the frontier war converges on the Shattered Crown—a towering plateau of stone ramps and cliff walls where Valkor the Usurper flies his stolen imperial standard above a massive summit fortress.',
      'Queen Maren leads your royal staging citadel from the southern valley. Fight up the cliff ramps to claim the central summit ridge, advance to the Imperial Age, and topple Valkor’s mountain stronghold to unite the realm.',
    ],
    startingBase:'Royal Staging Citadel · Walled Southern Stronghold, Castle-Age Army & Siege Ready',
    enemyIntel:'Valkor the Usurper · Imperial Summit Keep, Walled Citadels & Household Guard',
    terrainIntel:'Towering Highland Plateaus · Natural Cliff Walls & Contested Summit Ramps',
    tip:'Raise a Castle on the central summit ridge to dominate the high ground and stage Trebuchets against Valkor’s Keep.',
  },
  campaign11:{
    act:'ACT IV · LEGENDS OF THE REALM',
    date:'Siege of the Iron Ring',
    chronicle:[
      'Disaster has struck the royal expedition. Your grand Stone Citadel sits in the heart of the valley—fully fortified with high walls, three iron gatehouses, watchtowers, and an inner Castle Keep—yet THREE rival warlord armies have closed a ring of steel around your perimeter.',
      'Lord Korr’s Northern Siege Camp, General Syra’s Eastern Outriders, and Iron-Captain Drax’s Southern Vanguard strike from all sides. Hold your great citadel against the encirclement until the Western Allied Relief Kingdom smashes through the mountain pass and builds a forward war-camp to turn the tide!',
    ],
    startingBase:'GRAND WALLED CENTRAL CITADEL · Castle Keep, Full Stone Walls, 3 Gatehouses, 4 Towers, Full Economy',
    enemyIntel:'SURROUNDED · 3 Separate Enemy Bases (North, East & South Warlords)',
    terrainIntel:'Encircled Valley · Natural Stone Ridges Framing 3 Defensible Gate Approaches',
    tip:'Defend all three gates with rapid-response Knights and Healers—when the Western Allied Relief Army arrives, strike out together to crush each enemy camp one by one.',
  },
  campaign12:{
    act:'ACT IV · LEGENDS OF THE REALM',
    date:'Defense of the Sundered Pass',
    chronicle:[
      'Towering, impassable stone mountains split the Sundered Pass into three razor-thin valleys. With barely enough stone for a full fortress, your engineers must use the jagged cliff walls themselves—sealing only the narrow gaps with gates and watchtowers.',
      'To the north, your Allied Border Garrison holds the upper pass against relentless Imperial assaults. Lock down the mountain gaps, march beside your ally to smash the central Fortress Gate, and trigger the collapse of the eastern watchline!',
    ],
    startingBase:'Western Valley Citadel + Active Allied Northern Border Garrison (Team Ally)',
    enemyIntel:'2 Fortified Imperial Armies · Central Gatehouse Fortress & Eastern Capital',
    terrainIntel:'Impassable Granite Cliff Ranges · 3 Narrow Natural Mountain Chokepoints',
    tip:'You only need short wall lines and a Gatehouse in each cliff gap—save your stone for Castles behind the chokepoints!',
  },
  campaign13:{
    act:'ACT IV · LEGENDS OF THE REALM',
    date:'March of the Fallen Banner',
    chronicle:[
      'Your border province has fallen overnight. Cut off without a single building or villager, your Sovereign rides out of the Deepwood shadows at the head of a handpicked Royal Vanguard—Knights, Marksmen, Swordsmen, and Field Healers.',
      'Cut through the forest ambushes and break the raiders besieging the walled village of Oakhold. The moment the besiegers fall, Oakhold’s gates will swing open and the ENTIRE walled settlement will swear fealty to your command—expanding the war across the frontier!',
    ],
    startingBase:'NO STARTING BASE · Elite Royal Vanguard Army (Sovereign, Knights, Archers, Healers)',
    enemyIntel:'Besieging Raider Camp + 2 Northern & Eastern Warlord Citadels',
    terrainIntel:'Dense Forest Corridors · Narrow Ambush Trails Opening Into Walled Oakhold Valley',
    tip:'Keep your Healers behind your Knights to preserve every soldier until you liberate Oakhold and inherit its full town!',
  },
  campaign14:{
    act:'ACT IV · LEGENDS OF THE REALM',
    date:'War of the Three Crowns',
    chronicle:[
      'The final reckoning for the entire frontier has arrived. Across a vast realm divided by rivers, arched bridges, and craggy stone ridges, your Royal Citadel stands beside an Allied Imperial Fortress in a grand two-kingdom coalition.',
      'Across the eastern passes await two towering rival Imperial Citadels—each walled, garrisoned, and commanding distinct battle doctrines. Coordinate with your ally, fortify the river crossings and cliff gaps, weather their grand counter-offensive, and shatter both enemy capitals!',
    ],
    startingBase:'Fortified Imperial Staging Citadel + Full Allied Coalition Fortress (2v2 Grand War)',
    enemyIntel:'2 Full Imperial Rival Citadels · Coordinated Multi-Front Siege & Cavalry Armies',
    terrainIntel:'Sprawling 360×360 Grand Realm · River Bridges, Cliff Chokepoints & Forest Lanes',
    tip:'Use the Alliance menu to share surplus resources with your AI ally and drop minimap flares to coordinate pushes.',
  },
});

/** Small pure-SVG Warcraft-style cartographer inset showing the campaign march path to the current chapter. */
function miniRouteMapSvg(missionId){
  const idx=CAMPAIGN_NODES.findIndex(n=>n.id===missionId);
  if(idx<0)return '';
  const target=CAMPAIGN_NODES[idx];
  const prev=idx>0?CAMPAIGN_NODES[idx-1]:null;
  const routePts=CAMPAIGN_NODES.slice(0,idx+1).map(n=>`${n.x},${n.y}`).join(' ');
  const dots=CAMPAIGN_NODES.slice(0,Math.min(CAMPAIGN_NODES.length,idx+2)).map((n,i)=>{
    const cur=n.id===missionId;
    return `<circle cx="${n.x}" cy="${n.y}" r="${cur?15:7}" fill="${cur?'#e6b85c':'#7f6b46'}" stroke="${cur?'#fff4d0':'#281f13'}" stroke-width="${cur?3.5:2}"/>`;
  }).join('');
  return `<svg class="chronicle-minimap" viewBox="0 0 1000 580" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
    <defs>
      <radialGradient id="cm-sea" cx="72%" cy="70%" r="76%">
        <stop offset="0%" stop-color="#1e353d"/>
        <stop offset="100%" stop-color="#0d181c"/>
      </radialGradient>
      <linearGradient id="cm-land" x1="0%" y1="100%" x2="100%" y2="0%">
        <stop offset="0%" stop-color="#bda476"/>
        <stop offset="60%" stop-color="#ab9468"/>
        <stop offset="100%" stop-color="#b4b9ba"/>
      </linearGradient>
    </defs>
    <rect width="1000" height="580" fill="url(#cm-sea)"/>
    <path fill="url(#cm-land)" stroke="#5b462b" stroke-width="4" d="M 52,520 C 42,420 56,280 96,170 C 134,88 228,46 362,48 C 482,50 618,62 732,118 C 824,162 886,222 874,306 C 864,368 784,368 726,392 C 674,414 668,468 614,496 C 538,534 422,524 316,522 C 218,520 112,542 52,520 Z"/>
    <path fill="url(#cm-land)" stroke="#5b462b" stroke-width="3.5" d="M 730,454 C 756,418 812,402 864,422 C 910,440 924,492 890,524 C 846,554 764,548 726,512 C 708,494 712,474 730,454 Z"/>
    <path fill="none" stroke="#2d5f6e" stroke-width="9" stroke-opacity=".7" d="M 294,48 C 282,138 308,214 274,292 C 244,358 268,438 228,524"/>
    ${idx>0?`<polyline points="${routePts}" fill="none" stroke="#8e281d" stroke-width="6" stroke-dasharray="14 9" stroke-linecap="round"/>`:''}
    ${prev?`<line x1="${prev.x}" y1="${prev.y}" x2="${target.x}" y2="${target.y}" stroke="#f2cf78" stroke-width="5" stroke-dasharray="10 7"/>`:''}
    ${dots}
    <circle cx="${target.x}" cy="${target.y}" r="28" fill="none" stroke="#f6d98a" stroke-width="3" stroke-dasharray="7 5"/>
  </svg>`;
}

const MODE_CHRONICLES=Object.freeze({
  koth:{
    startingBase:'Frontier Settlement · Race for the Central Monument',
    enemyIntel:'Rival Commander contesting the central hill monument',
    tip:'Send an early garrison to capture the central monument at (0, 0), then fortify the high ground around it with watchtowers and walls to hold the 3-minute countdown.',
  },
  deathmatch:{
    startingBase:'Imperial Age Treasury (10,000 Food/Wood · 6,000 Gold · 4,000 Stone) + Full Military Halls',
    enemyIntel:'Imperial Age Rival · Immediate Large-Scale Warfare',
    tip:'Start training armies and researching upgrades from second one! Drop extra barracks, stables, and siege workshops immediately to spend your vast Imperial war chest.',
  },
  siege:{
    startingBase:'Mountain-Backed Stone Castle · Keep, Curtain Walls, Gatehouses & Starting Garrison',
    enemyIntel:'Fortified Rival Siege War-Camp across Iron Pass with Rams, Trebuchets & Heavy Cavalry',
    tip:'Station villagers near your gates to repair masonry under ram fire, use your Keep and towers to thin infantry, and counter-push with siege engines once their first wave breaks.',
  },
});

/**
 * Renders the full-screen Warcraft III / Age of Empires II-style Pre-Battle
 * Chronicle & Loading Screen for campaign chapters, skirmishes, and custom battles.
 */
export function missionLoadingMarkup(options={}){
  const mode=options.mode||'skirmish';
  const mission=MISSIONS.find(m=>m.id===mode)||null;
  const script=mission?CAMPAIGN_SCRIPTS[mode]:null;
  const chronicle=mission?MISSION_CHRONICLES[mode]:null;
  const modeChronicle=!mission?MODE_CHRONICLES[mode]:null;
  const boss=mission?CAMPAIGN_BOSSES[mode]:null;
  const sideQuest=mission?CAMPAIGN_SIDE_QUESTS[mode]:null;
  const modeDef=MODES.find(m=>m.id===mode)||MODES[0];
  const mapId=mission?.map||modeDef?.map||options.map||'highlands';
  const mapDef=MAPS[mapId]||MAPS.highlands;
  const factionDef=FACTIONS[options.faction||'alder']||FACTIONS.alder;
  const diffDef=DIFFICULTIES[options.difficulty||'normal']||DIFFICULTIES.normal;

  const eyebrow=chronicle?.act||(mission?`CHAPTER ${mission.chapter}`:`${(modeDef.label||'BATTLE').toUpperCase()} · ${mapDef.name.toUpperCase()}`);
  const title=mission?`Chapter ${mission.chapter}: ${mission.name}`:`${modeDef.name}`;
  const subtitle=chronicle?.date||`${factionDef.name} · ${diffDef.name} · ${mapDef.name}`;
  const speaker=script?.speaker||factionDef.name;
  const speakerInfo=commanderProfile(speaker);

  const paragraphs=chronicle?.chronicle||[
    modeDef.desc,
    `Your banner of ${factionDef.name} deploys across ${mapDef.name}. ${mapDef.desc}`,
  ];
  const startingBase=chronicle?.startingBase||modeChronicle?.startingBase||(mapId==='bastion'?'Pre-Walled Stone Bastion · Towers & Gatehouse Ready':`Frontier Settlement · ${AGES[options.startAge??mission?.age??0]||'Frontier Age'}`);
  const enemyIntel=chronicle?.enemyIntel||modeChronicle?.enemyIntel||(mode==='custom'?`${(options.slots?.length||4)-1} Rival & Allied Kingdoms · Custom Rules`:`Rival Commander (${diffDef.name})`);
  const terrainIntel=chronicle?.terrainIntel||`${mapDef.name} · ${mapDef.desc}`;
  const primaryGoal=mission?.objective||modeDef.objective||'Eliminate the opposing forces.';
  const tip=chronicle?.tip||modeChronicle?.tip||'Use natural cliffs, rivers, and dense tree lines as free fortifications to conserve stone and timber.';

  const leftVisual=mission
    ? `<div class="chronicle-map-card">
        <div class="chronicle-map-frame">${miniRouteMapSvg(mission.id)}</div>
        <div class="chronicle-commander-card">
          <div class="chronicle-portrait">${commanderPortraitSvg(speaker)}</div>
          <div>
            <small>${esc(speakerInfo.title)}</small>
            <strong>${esc(speaker)}</strong>
            <p>“${esc(script?.intro||mission.desc)}”</p>
          </div>
        </div>
        ${boss?`<div class="chronicle-boss-strip">${uiIcon('swords')}<div><small>RIVAL WARLORD · ${esc(boss.fortress)}</small><strong>${esc(boss.name)}</strong><span>${esc(boss.title)}</span></div></div>`:''}
      </div>`
    : `<div class="chronicle-map-card skirmish-card">
        <div class="chronicle-emblem-stage">
          <span class="chronicle-crest-seal">${uiIcon(mode==='tides'?'anchor':mode==='custom'?'custom':mode==='siege'?'castle':mode==='deathmatch'?'swords':'crown')}</span>
          <small>${esc(factionDef.motto)}</small>
          <strong>${esc(factionDef.name)}</strong>
          <p>${esc(factionDef.bonus)}</p>
        </div>
        <div class="chronicle-tip-box">
          <span>${uiIcon('book-open')} FIELD DOCTRINE</span>
          <p>${esc(tip)}</p>
        </div>
      </div>`;

  return `<div class="chronicle-overlay" id="chronicle-overlay" role="dialog" aria-modal="true" aria-labelledby="chronicle-title">
    <div class="chronicle-backdrop-art"></div>
    <div class="chronicle-frame">
      <header class="chronicle-header">
        <div class="chronicle-title-wrap">
          <span class="chronicle-eyebrow">${esc(eyebrow)}</span>
          <h2 id="chronicle-title">${esc(title)}</h2>
          <span class="chronicle-subtitle">${esc(subtitle)}</span>
        </div>
        <div class="chronicle-badges">
          <span>${uiIcon('shield')} ${esc(factionDef.name)}</span>
          <span>${uiIcon('swords')} ${esc(diffDef.name)}</span>
          <span>${uiIcon('map')} ${esc(mapDef.name)}</span>
        </div>
      </header>

      <div class="chronicle-body">
        ${leftVisual}
        <section class="chronicle-scroll" aria-label="Mission chronicle and briefing">
          <div class="chronicle-scroll-heading"><span>WAR CHRONICLE</span><i></i></div>
          <div class="chronicle-prose">
            ${paragraphs.map((p,i)=>`<p class="${i===0?'dropcap':''}">${esc(p)}</p>`).join('')}
          </div>

          <div class="chronicle-intel-grid">
            <article>
              <span>${uiIcon('castle')} STARTING BASE</span>
              <strong>${esc(startingBase)}</strong>
            </article>
            <article>
              <span>${uiIcon('swords')} ENEMY FORCES</span>
              <strong>${esc(enemyIntel)}</strong>
            </article>
            <article>
              <span>${uiIcon('map')} TERRAIN &amp; PASSES</span>
              <strong>${esc(terrainIntel)}</strong>
            </article>
          </div>

          <div class="chronicle-orders">
            <div>
              <small>PRIMARY ORDERS</small>
              <p>${esc(primaryGoal)}</p>
            </div>
            ${sideQuest?`<div class="chronicle-side-pill"><small>OPTIONAL SIDE QUEST · ${esc(sideQuest.rewardText)}</small><p>${esc(sideQuest.title)} — ${esc(sideQuest.text)}</p></div>`:''}
          </div>
          ${mission?`<p class="chronicle-field-tip">${uiIcon('book-open')} <strong>Tactical Tip:</strong> ${esc(tip)}</p>`:''}
        </section>
      </div>

      <footer class="chronicle-footer">
        <div class="chronicle-progress-wrap" id="chronicle-progress-wrap">
          <div class="chronicle-progress-meta">
            <span id="chronicle-status-text">Marshalling forces &amp; carving frontier terrain…</span>
            <strong id="chronicle-percent">15%</strong>
          </div>
          <div class="chronicle-progress-track" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="15" id="chronicle-progressbar">
            <i id="chronicle-progress-fill" style="width:15%"></i>
          </div>
        </div>
        <button type="button" class="chronicle-begin-btn hidden" id="chronicle-begin-btn" data-action="chronicle-begin">
          ${uiIcon('swords')}
          <span>Sound the Horns — Begin Battle</span>
          ${uiIcon('chevron-right')}
        </button>
      </footer>
    </div>
  </div>`;
}
