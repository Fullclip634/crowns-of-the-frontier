import {AGES,MAPS,MISSIONS} from './data.js';
import {CAMPAIGN_SCRIPTS} from './campaigns.js';

/**
 * Decoupled, overhaul-ready Campaign Atlas schema.
 * Updating or adding campaign missions in MISSIONS / CAMPAIGN_SCRIPTS requires
 * only adding or editing node coordinates and lore metadata here — zero UI rewrites.
 */
export const CAMPAIGN_ACTS=Object.freeze([
  {id:'all',label:'All Acts',roman:'I–V',subtitle:'Complete Frontier Chronicles'},
  {id:'act1',label:'Act I',roman:'I',subtitle:'The Foothold'},
  {id:'act2',label:'Act II',roman:'II',subtitle:'The Border Wars'},
  {id:'act3',label:'Act III',roman:'III',subtitle:'The Shattered Crown'},
  {id:'act4',label:'Act IV',roman:'IV',subtitle:'Legends of the Realm'},
  {id:'act5',label:'Act V',roman:'V',subtitle:'The Great Frontier War'},
]);

export const DIFFICULTY_MEDALS=Object.freeze({
  story:{tier:'bronze',label:'Explorer Seal'},
  normal:{tier:'silver',label:'Commander Seal'},
  hard:{tier:'gold',label:'Conqueror Seal'},
  brutal:{tier:'imperial',label:'Imperial Crown'},
});

const DIFFICULTY_RANK={story:1,normal:2,hard:3,brutal:4};

export const CAMPAIGN_NODES=Object.freeze([
  {
    id:'campaign1',act:'act1',x:138,y:462,region:'Alder Meadows',archetype:'Settlement & Skirmish',
    lore:'Rolling timberlands south of the old border stone where the first frontier steadings take root.',
    unlockAfter:null,
  },
  {
    id:'campaign2',act:'act1',x:166,y:378,region:'Old Stone Crossing',archetype:'Bridgehead Escort',
    lore:'A single arched bridge spanning the green gorge; whoever commands its banks feeds the war.',
    unlockAfter:'campaign1',
  },
  {
    id:'campaign3',act:'act1',x:344,y:448,region:'Iron Ridge',archetype:'Fortress Survival',
    lore:'High escarpments overlooking the eastern approaches where Raven warbands test every wall.',
    unlockAfter:'campaign2',
  },
  {
    id:'campaign4',act:'act1',x:384,y:364,region:'Valley of Shrines',archetype:'Sacred Dominion',
    lore:'Three moss-covered monoliths ringing a sunlit basin whose gold tides turn entire campaigns.',
    unlockAfter:'campaign3',
  },
  {
    id:'campaign5',act:'act2',x:586,y:368,region:'The Walled Capital',archetype:'Siege Warfare',
    lore:'Double masonry ramparts and iron portcullises guarding the rival warlord’s seat of power.',
    unlockAfter:'campaign4',
  },
  {
    id:'campaign6',act:'act2',x:804,y:466,region:'The Divided Coast',archetype:'Naval Invasion',
    lore:'A wide sapphire channel rich with fishing banks where galleys and transports rule the crossing.',
    unlockAfter:'campaign5',
  },
  {
    id:'campaign7',act:'act2',x:824,y:266,region:'The Cinder Reach',archetype:'Volcanic Pass',
    lore:'Obsidian ridges and smoldering ash roads cutting straight toward the mountain citadel.',
    unlockAfter:'campaign6',
  },
  {
    id:'campaign8',act:'act3',x:572,y:194,region:'The Deepwood',archetype:'Forest Ambush',
    lore:'Ancient canopy trails swallowing old supply roads; scouts earn every league in timber and blood.',
    unlockAfter:'campaign7',
  },
  {
    id:'campaign9',act:'act3',x:412,y:118,region:'Frostmarch',archetype:'Winter Siege Defense',
    lore:'Wind-scoured snowfields where besieged palisades hold out until the relief banner breaks the horizon.',
    unlockAfter:'campaign8',
  },
  {
    id:'campaign10',act:'act3',x:206,y:128,region:'The Shattered Crown',archetype:'Imperial Finale',
    lore:'The high summit ridge where the old realm fractured—and where one banner will claim the frontier.',
    unlockAfter:'campaign9',
  },
  {
    id:'campaign11',act:'act4',x:364,y:200,region:'Iron Ring Basin',archetype:'Surrounded Citadel & Relief',
    lore:'A grand walled stone fortress encircled by three rival warlords until the Western Allied Relief Kingdom smashes the pass.',
    unlockAfter:'campaign10',
  },
  {
    id:'campaign12',act:'act4',x:436,y:278,region:'The Sundered Pass',archetype:'Mountain Chokepoints & Ally',
    lore:'Towering granite ranges carve three razor-thin passes held alongside an active Allied Northern Garrison.',
    unlockAfter:'campaign11',
  },
  {
    id:'campaign13',act:'act4',x:756,y:186,region:'Oakhold Deepwood',archetype:'Hero Rescue & Expand',
    lore:'Cut off without a town, an elite vanguard fights through forest ambushes to liberate walled Oakhold and take command of the realm.',
    unlockAfter:'campaign12',
  },
  {
    id:'campaign14',act:'act4',x:550,y:456,region:'Three Crowns Reach',archetype:'Grand 2v2 Coalition War',
    lore:'Two allied Imperial citadels march across twin rivers and cliff ridges against rival warlord capitals for the fate of the realm.',
    unlockAfter:'campaign13',
  },
  {
    id:'campaign15',act:'act5',x:160,y:218,region:'Ironfall Sanctuary',archetype:'2v4 Narrow Pass War',
    lore:'Two united walled fortresses hold a cliff-locked valley behind a single narrow waterfall bridgehead against four surrounding enemy bases.',
    unlockAfter:null,
  },
  {
    id:'campaign16',act:'act5',x:232,y:294,region:'Waterfall Gorge',archetype:'2v2 Canyon River War',
    lore:'Roaring two-tier waterfalls plunge into a contested gorge crossed by stone bridges, timber trestles, and a shallow northern ford.',
    unlockAfter:'campaign15',
  },
  {
    id:'campaign17',act:'act5',x:614,y:116,region:'Frostfall Cliff',archetype:'2v3 Frozen Siege War',
    lore:'Glacial cliffs and drifting river ice floes guard an alpine stronghold battered by three outer wooden palisade war-camps.',
    unlockAfter:'campaign16',
  },
  {
    id:'campaign18',act:'act5',x:788,y:362,region:'Emerald Temple Lagoon',archetype:'2v2 Jungle Temple War',
    lore:'Ancient stepped mossy stone temples rise above turquoise coral beaches, giant banyan groves, and contested delta bridges.',
    unlockAfter:'campaign17',
  },
  {
    id:'campaign19',act:'act5',x:630,y:286,region:'Deepwood Ravine',archetype:'3v3 Grand Coalition Finale',
    lore:'All five civilizations clash across forested cliff canyons and timber ravine bridges in a thunderous six-kingdom Imperial war.',
    unlockAfter:'campaign18',
  },
]);

export const ATLAS_LANDMARKS=Object.freeze([
  {x:164,y:514,label:'ALDER HEARTLAND',kind:'region'},
  {x:476,y:328,label:'SHRINE BASIN',kind:'region'},
  {x:684,y:534,label:'DIVIDED SEA',kind:'sea'},
  {x:724,y:236,label:'CINDER PEAKS',kind:'region'},
  {x:726,y:140,label:'DEEPWOOD',kind:'region'},
  {x:412,y:76,label:'FROSTMARCH',kind:'region'},
  {x:208,y:82,label:'SHATTERED CROWN',kind:'region'},
]);

export function difficultyMedalFor(record){
  if(!record)return null;
  const diff=typeof record==='object'&&record.difficulty?record.difficulty:'normal';
  return DIFFICULTY_MEDALS[diff]||DIFFICULTY_MEDALS.silver||DIFFICULTY_MEDALS.normal;
}

/** Merge new campaign victory progress while preserving best time, optional crown, and highest difficulty medal. */
export function mergeCampaignVictory(previous,next){
  const prevObj=previous&&typeof previous==='object'?previous:(previous===true?{won:true,difficulty:'normal'}:{});
  const prevRank=DIFFICULTY_RANK[prevObj.difficulty]||0;
  const nextRank=DIFFICULTY_RANK[next.difficulty]||2;
  const bestDiff=nextRank>=prevRank?(next.difficulty||'normal'):prevObj.difficulty;
  const bestTime=Number.isFinite(prevObj.seconds)&&Number.isFinite(next.seconds)?Math.min(prevObj.seconds,next.seconds):(next.seconds??prevObj.seconds??null);
  return {
    won:true,
    optional:Boolean(prevObj.optional||next.optional),
    route:next.route||prevObj.route||null,
    seconds:bestTime,
    difficulty:bestDiff,
  };
}

/**
 * Resolve complete display state for all campaign nodes from persisted progress.
 * Supports freeSelect so players & designers can inspect or launch any chapter immediately.
 */
export function campaignAtlasState(progress={},freeSelect=false){
  const missionById=new Map(MISSIONS.map(m=>[m.id,m]));
  const items=[];
  let foundCurrent=false;
  let completedCount=0;
  let optionalCount=0;

  for(const meta of CAMPAIGN_NODES){
    const mission=missionById.get(meta.id);
    if(!mission)continue;
    const script=CAMPAIGN_SCRIPTS[meta.id]||null;
    const rec=progress?.[meta.id]||null;
    const completed=Boolean(rec===true||rec?.won);
    const optional=Boolean(rec&&typeof rec==='object'&&rec.optional);
    if(completed)completedCount++;
    if(optional)optionalCount++;
    const prereqDone=!meta.unlockAfter||Boolean(progress?.[meta.unlockAfter]===true||progress?.[meta.unlockAfter]?.won);
    let status='locked';
    if(completed){
      status='completed';
    }else if(!foundCurrent&&(prereqDone||freeSelect)){
      status='current';
      foundCurrent=true;
    }else if(prereqDone||freeSelect){
      status='unlocked';
    }
    const mapId=mission.map||'highlands';
    items.push({
      ...meta,
      mission,
      chapter:mission.chapter,
      name:mission.name,
      desc:mission.desc,
      objective:mission.objective,
      ageIndex:mission.age||0,
      ageName:AGES[mission.age||0]||AGES[0],
      mapId,
      mapName:MAPS[mapId]?.name||'Frontier Highlands',
      speaker:script?.speaker||'Frontier Marshal',
      intro:script?.intro||mission.desc,
      stages:(script?.stages||[]).map(s=>({title:s.title,text:s.text})),
      optionalText:script?.optional?.text||'',
      status,
      completed,
      optional,
      seconds:rec&&typeof rec==='object'&&Number.isFinite(rec.seconds)?rec.seconds:null,
      medal:completed?difficultyMedalFor(rec):null,
      unlocked:status!=='locked',
    });
  }

  // Build ordered march route segments connecting consecutive chapters
  const routes=[];
  for(let i=1;i<items.length;i++){
    const from=items[i-1],to=items[i];
    const mx=(from.x+to.x)*.5,my=(from.y+to.y)*.5;
    const dx=to.x-from.x,dy=to.y-from.y;
    const cx=mx-dy*.14,cy=my+dx*.14;
    routes.push({
      fromId:from.id,
      toId:to.id,
      act:to.act,
      d:`M ${from.x} ${from.y} Q ${cx.toFixed(1)} ${cy.toFixed(1)} ${to.x} ${to.y}`,
      conquered:from.completed&&to.completed,
      active:from.completed&&to.status==='current',
    });
  }

  return {
    nodes:items,
    routes,
    completedCount,
    optionalCount,
    total:items.length,
  };
}

export function nextCampaignMissionId(progress={},freeSelect=false){
  const atlas=campaignAtlasState(progress,freeSelect);
  return atlas.nodes.find(n=>n.status==='current')?.id||atlas.nodes.at(-1)?.id||'campaign1';
}

export function nextChapterAfter(missionId){
  const idx=CAMPAIGN_NODES.findIndex(n=>n.id===missionId);
  if(idx<0||idx+1>=CAMPAIGN_NODES.length)return null;
  return CAMPAIGN_NODES[idx+1].id;
}
