import {UNITS} from './data.js';
import {CAMPAIGN_BOSSES,CAMPAIGN_SIDE_QUESTS,applyCampaignRelic} from './campaign-relics.js';
import {applyCampaignScenario,triggerWesternReliefArrival,triggerOakholdLiberation} from './campaign-scenarios.js';
const copy=value=>JSON.parse(JSON.stringify(value));
const army=s=>s.owned(0,'unit').filter(e=>!e.embarked&&!UNITS[e.type].naval&&!['worker','fisher','quest'].includes(UNITS[e.type].role)&&!['scout','king'].includes(e.type));
const completed=(s,type)=>s.owned(0,'building',type).filter(e=>e.progress>=1);
const conquered=s=>!s.count(1,'building','towncenter');
const allHostileCapitalsFallen=s=>s.players.every((p,owner)=>!s.hostile(0,owner)||!s.count(owner,'building','towncenter'));
// Act V total-war wipeout helpers: an enemy base is only defeated when EVERY core/military/economic
// structure (Town Center, Keep, Barracks, Range, Stable, Workshop, Tower, Blacksmith, Market, Monastery,
// Mill, House, Dock, Camp) has been razed — not merely sniping the Town Center!
const BASE_STRUCTURE_IGNORE=new Set(['wall','gate','farm']);
export const baseStructures=(s,owner)=>s.owned(owner,'building').filter(b=>b.hp>0&&!BASE_STRUCTURE_IGNORE.has(b.type));
export const baseWiped=(s,owner)=>baseStructures(s,owner).length===0;
export const allHostileBasesWiped=s=>s.players.every((p,owner)=>!s.hostile(0,owner)||baseWiped(s,owner));
function nearestHostileStructure(s,owners=null){
  const tc0=s.owned(0,'building','towncenter')[0]||s.players[0]?.start||{x:0,z:0};
  const candidates=[];
  for(let owner=1;owner<s.players.length;owner++){
    if(!s.hostile(0,owner)||(owners&&!owners.includes(owner)))continue;
    for(const b of baseStructures(s,owner))candidates.push(b);
  }
  candidates.sort((a,b)=>Math.hypot(a.x-tc0.x,a.z-tc0.z)-Math.hypot(b.x-tc0.x,b.z-tc0.z));
  return candidates[0]?{x:Math.round(candidates[0].x),z:Math.round(candidates[0].z)}:null;
}
const DIFFICULTY_ORDER=['story','normal','hard','brutal'];
const meetsDifficulty=(sim,level)=>DIFFICULTY_ORDER.indexOf(sim.options.difficulty)>=DIFFICULTY_ORDER.indexOf(level);

// Timed reinforcements and narration. Events fire once, are recorded in the
// campaign history, survive save/restore through campaignState.fired, and never
// spawn on water or outside the map.
function spawnReinforcements(sim,spec){
  const owner=spec.owner??0,anchor=sim.owned(owner,'building','towncenter')[0]||sim.owned(owner,'unit','king')[0]||sim.owned(owner,'unit')[0]||(sim.players[owner]?.start?{...sim.players[owner].start,r:3}:null);if(!anchor)return 0;
  const count=Math.max(1,Math.round(spec.count||1)),placed=[];
  for(let i=0;i<count;i++){
    let point=null;
    for(let attempt=0;attempt<24;attempt++){
      const angle=i*2.4+attempt*.7,radius=anchor.r+5+Math.floor(attempt/8)*3;
      const x=anchor.x+Math.cos(angle)*radius,z=anchor.z+Math.sin(angle)*radius;
      if(Math.abs(x)>sim.halfWorld-3||Math.abs(z)>sim.halfWorld-3||sim.isWater(x,z))continue;
      point={x,z};break;
    }
    if(!point)break;
    placed.push(sim.addUnit(spec.type,owner,point.x,point.z));
  }
  return placed.length;
}


export const CAMPAIGN_SCRIPTS={
  campaign1:{speaker:'Marshal Elian',intro:'Our people need a foothold before they need a war. Stock the settlement, raise another roof, and prepare a company to defend it.',
    stages:[
      {title:'A settlement supplied',text:'Gather 250 resources and complete a third house.',done:s=>s.stats.gathered>=250&&completed(s,'house').length>=3,dialogue:'The storehouses are filling. A settlement survives through many hands; keep your workers safe.'},
      {title:'A company assembled',text:'Field six land military units. Scouts and caravans do not count.',done:s=>army(s).length>=6,dialogue:'Your company is ready. Spears stop riders; a mixed army will survive longer than a single line of troops.'},
      {title:'Clear the raider settlement',text:'Destroy the rival town center while protecting your own.',marker:{x:106,z:-90},done:conquered,dialogue:'The first frontier settlement stands. This land now has a future.'},
    ],optional:{text:'Finish with at least eight villagers alive.',done:s=>s.count(0,'unit','villager')>=8},
    events:[
      {at:45,id:'c1-foragers',text:'Foragers from the eastern woods ask to join the settlement.',reinforce:{type:'villager',count:2}},
      {at:100,id:'c1-militia',text:'Farmhands arrive from the outlying steadings with spears and shields.',reinforce:{type:'spearman',count:3}},
      {at:150,id:'c1-raid',minDifficulty:'hard',text:'Raiders are massing beyond the ridge. They have seen your walls go up.',reinforce:{owner:1,type:'spearman',count:2}},
    ]},
  campaign2:{speaker:'Quartermaster Sera',intro:'The eastern garrison has cut the supply road. Take the caravan across the central bridge and establish a safe bridgehead. Its loss ends the mission.',cart:{name:'Bridge caravan',x:-74,z:48},
    stages:[
      {title:'Escort the supplies',text:'Escort the caravan to the marked eastern bridgehead. Keep it alive.',marker:{x:20,z:-8},done:(s,q)=>{const cart=s.get(q.cartId);return cart&&!cart.embarked&&Math.hypot(cart.x-20,cart.z+8)<7;},dialogue:'The supplies have reached the far bank. Establish a position before pushing toward the garrison.'},
      {title:'Secure the bridgehead',text:'Complete a watchtower east of the river, or move five land military units onto the eastern bank.',marker:{x:20,z:-8},done:s=>completed(s,'tower').some(e=>e.x>10)||army(s).filter(e=>e.x>10).length>=5,dialogue:'The bridgehead is secure. The garrison can no longer isolate our settlement.'},
      {title:'Break the garrison',text:'Reach the Castle Age and destroy the rival town center. Protect the caravan throughout.',marker:{x:102,z:-84},done:s=>s.players[0].age>=2&&conquered(s),dialogue:'The supply road is open. The caravan will carry word of your victory.'},
    ],optional:{text:'Complete the escort with the caravan above half health.',done:(s,q)=>(s.get(q.cartId)?.hp||0)>s.get(q.cartId)?.maxHp*.5},
    events:[
      {at:70,id:'c2-bridgehead',text:'Villagers from the far bank volunteer to hold the bridgehead.',reinforce:{type:'spearman',count:2}},
      {at:140,id:'c2-caravan-intact',when:(s,q)=>q.optionalMet,text:'The caravan is intact, and its guards will fight beside you.',reinforce:{type:'archer',count:2}},
      {at:140,id:'c2-caravan-hurt',when:(s,q)=>!q.optionalMet,minDifficulty:'hard',text:'Word of a mauled caravan has reached the garrison. They press harder.',reinforce:{owner:1,type:'spearman',count:3}},
    ]},
  campaign3:{speaker:'Castellan Maera',intro:'The warbands are gathering beyond the ridge. Raise a castle, protect your economy, and prepare for eight assaults.',
    stages:[
      {title:'Raise the stronghold',text:'Complete a castle before the final waves arrive.',done:s=>completed(s,'keep').length>0,dialogue:'Stone is only the beginning. Repair your defenses and keep producing reinforcements.'},
      {title:'Hold through the first assaults',text:'Survive until the fourth wave arrives with a castle standing.',done:s=>s.wave>=4&&completed(s,'keep').length>0,dialogue:'The early attacks were a test. Siege engines will follow; meet them outside your walls when you can.'},
      {title:'The last bastion',text:'Survive all eight waves, eliminate the attackers, and keep a castle standing.',done:s=>s.wave>=8&&!s.count(1,'unit')&&completed(s,'keep').length>0,dialogue:'The last warband has broken. Your stronghold has earned its name.'},
    ],optional:{text:'End with ten villagers alive to rebuild the frontier.',done:s=>s.count(0,'unit','villager')>=10},
    events:[
      {at:55,id:'c3-militia',text:'The outlying farms send spearmen to man the walls.',reinforce:{type:'spearman',count:3}},
      {at:115,id:'c3-archers',text:'Hunters arrive with bows and a full quiver.',reinforce:{type:'archer',count:2}},
      {at:90,id:'c3-sortie',minDifficulty:'brutal',when:s=>s.wave<8,text:'A warband sorties early to test the gate.',reinforce:{owner:1,type:'swordsman',count:2}},
    ]},
  campaign4:{speaker:'Keeper Nalin',intro:'Three shrines bind this valley together. Claim their ground with military units and defend the approaches. Conquering the rival capital is an alternative path to victory.',alternativeConquest:true,
    stages:[
      {title:'Claim the first shrine',text:'Capture any shrine with land military units.',marker:{x:-46,z:-40},done:s=>s.entities.some(e=>e.kind==='shrine'&&e.owner===0),dialogue:'The first shrine answers your banner. Its gold can sustain the struggle for the others.'},
      {title:'Unite the valley',text:'Capture all three shrines at the same time.',marker:{x:3,z:1},done:s=>s.entities.filter(e=>e.kind==='shrine').every(e=>e.owner===0),dialogue:'All three banners fly together. The rival will try to break the weakest position.'},
      {title:'Protect the sacred ground',text:'Hold all three shrines continuously for three minutes, or conquer the rival capital.',done:s=>s.hold>=180,dialogue:'The valley is united, and the shrines stand under your protection.'},
    ],optional:{text:'Win by shrine control rather than conquest.',done:(s,q)=>q.route!=='conquest'},
    events:[
      {at:200,id:'c4-pilgrims',when:s=>s.entities.filter(e=>e.kind==='shrine').every(e=>e.owner===0),text:'Pilgrims bring supplies to a valley united under one banner.',reinforce:{type:'villager',count:2}},
    ]},
  campaign5:{speaker:'Marshal Elian',intro:'The enemy capital stands behind gates and stone. Bring siege engines, protect their crews, and open a route for the army.',
    stages:[
      {title:'Assemble the siege train',text:'Field two battering rams or trebuchets.',done:s=>army(s).filter(e=>['ram','catapult'].includes(e.type)).length>=2,dialogue:'The siege train is ready. Keep infantry beside it, and use healers to preserve the escort.'},
      {title:'Breach the defenses',text:'Destroy the enemy gatehouse or a section of its starting wall.',marker:{x:102,z:-61},done:(s,q)=>q.defenses.some(id=>!s.get(id)),dialogue:'There is a breach in the line. Reinforce it before sending the siege engines toward the capital.'},
      {title:'End the frontier war',text:'Destroy the rival town center and defend your own settlement.',marker:{x:106,z:-90},done:conquered,dialogue:'The capital has fallen. The frontier war is over, but the work of rebuilding begins.'},
    ],optional:{text:'Finish with at least one siege engine surviving.',done:s=>army(s).some(e=>['ram','catapult'].includes(e.type))},
    events:[
      {at:70,id:'c5-crews',text:'Siege crews and their escorts arrive from the capital workshops.',reinforce:{type:'spearman',count:3}},
      {at:140,id:'c5-labour',text:'A labour company arrives to repair engines between assaults.',reinforce:{type:'villager',count:2}},
      {at:120,id:'c5-sally',minDifficulty:'hard',text:'The garrison sallies out to break the siege train.',reinforce:{owner:1,type:'knight',count:2}},
      {at:160,id:'c5-engine-intact',when:s=>army(s).some(e=>['ram','catapult'].includes(e.type)),text:'Your surviving engine crew trains a second company of guards.',reinforce:{type:'spearman',count:2}},
      {at:160,id:'c5-engine-lost',when:s=>!army(s).some(e=>['ram','catapult'].includes(e.type)),minDifficulty:'hard',text:'With the siege train broken, the garrison counterattacks in force.',reinforce:{owner:1,type:'knight',count:2}},
    ]},
  campaign6:{speaker:'Admiral Iven',intro:'The final frontier lies beyond the water. Secure a fishing economy, prepare the fleet, then choose a landing force or long-range naval siege.',
    stages:[
      {title:'Secure the fishing grounds',text:'Bring home 150 food with fishing boats.',done:(s,q)=>q.fish>=150,dialogue:'The fishing crews are supplying the fleet. Protect them; ships cannot replace a working economy.'},
      {title:'Choose the invasion',text:'Land four military units on the eastern coast, or field an Imperial siege galleon.',marker:{x:24,z:-56},done:s=>army(s).filter(e=>e.x>17).length>=4||s.count(0,'unit','warship')>0,dialogue:'The invasion is underway. Establish a harbor on the far shore or use the fleet to support your land troops.'},
      {title:'Beyond the horizon',text:'Destroy the rival coastal town center. Land troops and naval artillery can both achieve victory.',marker:{x:102,z:-84},done:conquered,dialogue:'The coast is secure. From a frontier village, your kingdom has reached the horizon.'},
    ],optional:{text:'Complete a harbor on the eastern shore.',done:s=>completed(s,'dock').some(e=>e.x>17)},
    events:[
      {at:60,id:'c6-crews',text:'Fishing crews from the outer banks join the harbour.',reinforce:{type:'villager',count:2}},
      {at:150,id:'c6-marines',text:'Marines disembark to reinforce the beachhead.',reinforce:{type:'spearman',count:3}},
    ]},
  campaign7:{speaker:'Warden Ilya',intro:'The ember road is the only crossing through the cinder reach. Hold the ash pass, break the camp that feeds the raiders, and take the keep above the fields.',
    stages:[
      {title:'Hold the ash pass',text:'Complete a watchtower near the marked pass, or move five land military units onto it.',marker:{x:0,z:0},done:s=>completed(s,'tower').some(e=>Math.hypot(e.x,e.z)<24)||army(s).filter(e=>Math.hypot(e.x,e.z)<16).length>=5,dialogue:'The pass is held. The cinder camp can no longer supply the raiders by night.'},
      {title:'Break the cinder camp',text:'Destroy the rival barracks in the ash fields.',marker:{x:94,z:-80},done:s=>!s.count(1,'building','barracks'),dialogue:'The camp is broken. The ember keep stands alone above the road.'},
      {title:'Take the ember keep',text:'Destroy the rival town center and keep your own settlement.',marker:{x:106,z:-90},done:conquered,dialogue:'The ember road is open, and the mountain frontier is yours.'},
    ],optional:{text:'Finish with at least eight villagers alive.',done:s=>s.count(0,'unit','villager')>=8},
    events:[
      {at:50,id:'c7-guides',text:'Ash-field guides join you; they know which ground is safe.',reinforce:{type:'villager',count:2}},
      {at:120,id:'c7-wardens',text:'Pass wardens arrive with spears and shields.',reinforce:{type:'spearman',count:3}},
      {at:170,id:'c7-raid',minDifficulty:'hard',text:'Cinder raiders descend the pass to test your line.',reinforce:{owner:1,type:'swordsman',count:2}},
    ]},
  campaign8:{speaker:'Forester Brann',intro:'The deepwood has swallowed the border road. Raise a timber camp, break the ambush waiting under the canopy, and swear the woodfort to your banner.',
    stages:[
      {title:'Raise a timber camp',text:'Complete a lumber camp and field four land military units.',marker:{x:-82,z:96},done:s=>completed(s,'camp').length>0&&army(s).length>=4,dialogue:'The camp is cutting and your escort is ready. The deepwood will not give up its road without a fight.'},
      {title:'Break the ambush',text:'Destroy the rival barracks hidden in the deepwood.',marker:{x:94,z:-80},done:s=>!s.count(1,'building','barracks'),dialogue:'The ambush is broken. The woodfort stands exposed beyond the tree line.'},
      {title:'Swear the oath',text:'Destroy the rival town center and keep your own settlement.',marker:{x:106,z:-90},done:conquered,dialogue:'The woodfort swears to your banner. The border road is open again.'},
    ],optional:{text:'Finish with at least ten villagers alive.',done:s=>s.count(0,'unit','villager')>=10},
    events:[
      {at:60,id:'c8-woodcutters',text:'Woodcutters from the old camps join your timber crews.',reinforce:{type:'villager',count:2}},
      {at:130,id:'c8-archers',text:'Foresters arrive with hunting bows and a knowledge of the trails.',reinforce:{type:'archer',count:2}},
      {at:180,id:'c8-ambush',minDifficulty:'hard',text:'An ambush party slips through the deepwood toward your camp.',reinforce:{owner:1,type:'spearman',count:3}},
    ]},
  campaign9:{speaker:'Captain Sela',intro:'Frostmarch is cut off and the siege has settled in for the night. Hold the palisade until the relief column can march, then take the war to the camp that feeds their engines.',
    stages:[
      {title:'Hold the line',text:'Keep your town center standing for two and a half minutes while the siege waves break against it.',seconds:150,done:(s,q)=>q.elapsed>=150,dialogue:'Dawn is breaking and the palisade still stands. The siege camp is exposed and short of men.'},
      {title:'Break the siege camp',text:'Destroy the rival barracks that supplies the siege waves.',marker:{x:94,z:-80},done:s=>!s.count(1,'building','barracks'),dialogue:'The camp is burning. Their engines have no crews left to replace.'},
      {title:'End the siege',text:'Destroy the rival town center and keep your own settlement.',marker:{x:106,z:-90},done:conquered,dialogue:'Frostmarch holds, and the road south is open again.'},
    ],optional:{text:'Hold with a completed watchtower and eight villagers alive.',done:s=>completed(s,'tower').length>0&&s.count(0,'unit','villager')>=8},
    events:[
      {at:30,id:'c9-militia',text:'The town militia falls in along the palisade.',reinforce:{type:'spearman',count:2}},
      {at:55,id:'c9-wave-one',text:'The first siege wave advances out of the dark.',reinforce:{owner:1,type:'spearman',count:3}},
      {at:95,id:'c9-wave-two',text:'Armoured men-at-arms join the second wave.',reinforce:{owner:1,type:'swordsman',count:2}},
      {at:120,id:'c9-relief',text:'Relief archers reach the gatehouse and take the wall.',reinforce:{type:'archer',count:3}},
      {at:135,id:'c9-wave-three',text:'A third wave rolls toward the gate.',reinforce:{owner:1,type:'swordsman',count:3}},
      {at:165,id:'c9-cavalry',minDifficulty:'hard',text:'Enemy horse circles behind the palisade to cut down workers.',reinforce:{owner:1,type:'knight',count:2}},
    ]},
  campaign10:{speaker:'Queen Maren',intro:'The rival claim has been pressed to the last ridge above the shattered crown. Take the high ground, raise the Imperial banner, and end the war on your own terms.',
    stages:[
      {title:'Claim the high ground',text:'Complete a castle or watchtower on the marked ridge, or hold the summit with eight land units.',marker:{x:0,z:0},done:s=>completed(s,'keep').some(e=>Math.hypot(e.x,e.z)<26)||completed(s,'tower').some(e=>Math.hypot(e.x,e.z)<22)||army(s).filter(e=>Math.hypot(e.x,e.z)<14).length>=8,dialogue:'The ridge is yours. From here the whole valley is in sight, and so is their keep.'},
      {title:'Raise the Imperial banner',text:'Reach the Imperial Age.',done:s=>s.players[0].age>=3,dialogue:'The Imperial banner flies. Your rivals have lost the last advantage they held.'},
      {title:'Break the last claim',text:'Destroy the rival keep, then their town center.',marker:{x:106,z:-90},done:conquered,dialogue:'The last claim is broken. The frontier is one kingdom at last.'},
    ],optional:{text:'Finish with the ridge still held and twelve villagers alive.',done:s=>(completed(s,'keep').length>0||completed(s,'tower').length>0)&&s.count(0,'unit','villager')>=12},
    events:[
      {at:70,id:'c10-veterans',text:'Veterans of the border war answer the summons.',reinforce:{type:'swordsman',count:3}},
      {at:110,id:'c10-siege',text:'A siege train arrives from the southern workshops.',reinforce:{type:'ram',count:1}},
      {at:160,id:'c10-counter',text:'The rival claim throws its household guard at the ridge.',reinforce:{owner:1,type:'knight',count:3}},
      {at:210,id:'c10-guard',minDifficulty:'hard',text:'Their last guard marches under the crown banner.',reinforce:{owner:1,type:'sentinel',count:2}},
    ]},
  campaign11:{speaker:'Lord Commander Aldric',intro:'Three warlord armies have closed the Iron Ring around our stone citadel. Hold all three gates until the Western Allied Relief Kingdom smashes through the pass and establishes a forward camp!',
    stages:[
      {title:'Hold the Iron Ring',text:'Defend your central walled citadel until Western Allied Relief breaks through the western cliffs.',seconds:105,marker:{x:0,z:0},done:(s,q)=>q.elapsed>=105,onDone:s=>{triggerWesternReliefArrival(s);},dialogue:'Horns from the western cliffs! Our Allied Relief Kingdom has broken through and raised a forward war-camp—strike out together!'},
      {title:'Break the Northern Siege Camp',text:'Coordinate with your Western Ally to destroy Lord Korr’s northern town center.',marker:{x:-14,z:-148},done:s=>!s.count(1,'building','towncenter'),dialogue:'Lord Korr’s siege camp is in ashes! Turn east and shatter General Syra’s raiders.'},
      {title:'Shatter the Encirclement',text:'Destroy every remaining hostile town center across the valley.',marker:{x:148,z:8},done:allHostileCapitalsFallen,dialogue:'The Iron Ring is broken forever! The central citadel stands unbroken and the valley belongs to our alliance.'},
    ],optional:{text:'Keep your central Castle Keep standing throughout the entire siege.',done:s=>completed(s,'keep').length>0},
    events:[
      {at:32,id:'c11-north-probe',text:'Lord Korr’s northern siege vanguard probes the North Gate!',reinforce:{owner:1,type:'swordsman',count:3}},
      {at:64,id:'c11-east-riders',text:'General Syra’s cavalry sweeps toward the East Gate!',reinforce:{owner:2,type:'knight',count:2}},
      {at:88,id:'c11-south-pressure',minDifficulty:'hard',text:'Raiders from the southern outpost press the South Gate!',reinforce:{owner:1,type:'spearman',count:4}},
      {at:145,id:'c11-ally-knights',text:'The Western Allied forward camp sends fresh lancers to join your counter-offensive!',reinforce:{owner:3,type:'knight',count:3}},
    ]},
  campaign12:{speaker:'Marshal Vayne',intro:'Towering stone cliffs divide the Sundered Pass into three narrow valleys. Save your stone—wall only the cliff gaps, hold alongside our Allied Northern Garrison, and break the central pass fortress!',
    stages:[
      {title:'Lock Down the Cliff Passes',text:'Complete a Watchtower or four wall/gate sections near the passes, or muster twelve military troops.',marker:{x:-12,z:96},done:s=>completed(s,'tower').length>=2||completed(s,'wall').length+completed(s,'gate').length>=4||army(s).length>=12,dialogue:'The mountain chokepoints are sealed! Now prepare your siege engines and storm the central fortress gate.'},
      {title:'Shatter the Central Fortress',text:'Destroy Iron-Marshal Garen’s central mountain fortress town center to collapse the pass defense.',marker:{x:36,z:-6},done:s=>!s.count(1,'building','towncenter'),onDone:s=>{s.players[0].resources.gold+=300;s.players[0].resources.stone+=200;spawnReinforcements(s,{owner:3,type:'knight',count:4});},dialogue:'The central fortress has fallen! War chests seized (+300 Gold, +200 Stone) and our Northern Ally sends Knights through the breach!'},
      {title:'Conquer the Eastern Empire',text:'March through the Sundered Pass and destroy the Eastern Imperial capital.',marker:{x:138,z:-66},done:allHostileCapitalsFallen,dialogue:'The Sundered Pass is open from summit to valley. The Eastern Empire bows before your banners.'},
    ],optional:{text:'Win while your Northern Allied Garrison still controls its fortress.',done:s=>s.count(3,'building','towncenter')>0},
    events:[
      {at:50,id:'c12-ally-rally',text:'Our Northern Allied Garrison sends archers to reinforce the upper cliff pass.',reinforce:{owner:3,type:'archer',count:3}},
      {at:95,id:'c12-pass-sortie',text:'Enemy knights sally out through the central mountain pass!',reinforce:{owner:1,type:'knight',count:2}},
      {at:155,id:'c12-empire-siege',minDifficulty:'hard',text:'The Eastern Empire rolls a battering ram toward the passes!',reinforce:{owner:2,type:'ram',count:1}},
    ]},
  campaign13:{speaker:'Lady Isolde',intro:'We have no town, no walls, and no supplies—only our Sovereign and this elite Royal Vanguard. Cut through the Blackwood ambush, crush the raiders outside Oakhold, and liberate the walled town to our banner!',
    stages:[
      {title:'Liberate the Village of Oakhold',text:'Fight through the forest trail and destroy the Raider Barracks and Watchtower besieging Oakhold.',marker:{x:24,z:48},done:s=>!s.count(1,'building','barracks')&&!s.count(1,'building','tower'),onDone:s=>{triggerOakholdLiberation(s);},dialogue:'Oakhold’s gates swing wide! The entire walled town and its ten villagers swear fealty to your crown—expand your kingdom and march north!'},
      {title:'Rebuild & Muster in Oakhold',text:'Grow Oakhold to 14 villagers and complete a Blacksmith, Stable, or Archery Range to challenge Warlord Malrik.',marker:{x:-34,z:24},done:s=>s.count(0,'unit','villager')>=14&&(completed(s,'blacksmith').length>0||completed(s,'stable').length>0||completed(s,'range').length>0),dialogue:'Oakhold’s forges burn bright again! Push through the dense northern Blackwood trails toward Warlord Malrik’s citadel.'},
      {title:'Topple Warlord Malrik',text:'Breach the northern Blackwood citadel and destroy Warlord Malrik’s town center.',marker:{x:108,z:-98},done:s=>!s.count(2,'building','towncenter'),dialogue:'Warlord Malrik is cast down! From a lone banner in the woods, you have reclaimed the entire Deepwood realm.'},
    ],optional:{text:'Keep your Sovereign alive through the entire campaign.',done:s=>s.count(0,'unit','king')>0},
    events:[
      {at:65,id:'c13-wood-scouts',when:s=>s.campaignState?.stage>=1,text:'Oakhold rangers emerge from the deepwood trails to join your army.',reinforce:{owner:0,type:'archer',count:3}},
      {at:135,id:'c13-malrik-raid',minDifficulty:'hard',text:'Warlord Malrik dispatches raiders down the forest corridor toward Oakhold!',reinforce:{owner:2,type:'knight',count:3}},
    ]},
  campaign14:{speaker:'Queen Maren',intro:'Here ends the War of Three Crowns. My Imperial fortress holds the northern crossing beside your citadel. Coordinate across the Twin Rivers, break the rival coalition, and claim the realm forever!',
    stages:[
      {title:'Break the First Rival Citadel',text:'Cross the rivers and destroy either the Sunward Usurper or Raven Warlord town center.',marker:{x:132,z:92},done:s=>!s.count(1,'building','towncenter')||!s.count(2,'building','towncenter'),onDone:s=>{const survivor=s.count(1,'building','towncenter')?1:2;spawnReinforcements(s,{owner:survivor,type:'knight',count:4});spawnReinforcements(s,{owner:0,type:'knight',count:3});spawnReinforcements(s,{owner:0,type:'catapult',count:1});},dialogue:'One rival citadel has fallen! The surviving warlord launches a desperate counter-offensive—my Royal Knights and a Trebuchet ride to your banner!'},
      {title:'Imperial Supremacy',text:'Advance to the Imperial Age (or tear down the remaining rival Castle Keep).',marker:{x:132,z:-96},done:s=>s.players[0].age>=3||(!s.count(1,'building','keep')&&!s.count(2,'building','keep')),dialogue:'The Imperial standard rises over Twin Rivers! Press the final assault on the last enemy capital.'},
      {title:'Unite the Three Crowns',text:'Destroy both rival Imperial town centers to end the coalition war.',marker:{x:132,z:-96},done:allHostileCapitalsFallen,dialogue:'Both rival capitals have fallen! From Iron Ridge to Twin Rivers, the entire Frontier unites beneath one Crown!'},
    ],optional:{text:'Finish with Queen Maren’s allied capital still standing.',done:s=>s.count(3,'building','towncenter')>0},
    events:[
      {at:75,id:'c14-maren-support',text:'Queen Maren dispatches royal men-at-arms across the southern flank.',reinforce:{owner:3,type:'swordsman',count:4}},
      {at:130,id:'c14-usurper-wave',text:'The rival coalition launches a joint assault over the Twin Rivers bridges!',reinforce:{owner:2,type:'knight',count:3}},
      {at:190,id:'c14-imperial-siege',minDifficulty:'hard',text:'Rival siege engines roll toward the central river crossings!',reinforce:{owner:1,type:'ram',count:2}},
    ]},
  campaign15:{speaker:'Marshal Rowan',intro:'Four rival warlords have surrounded Ironfall Sanctuary, Commander! Thank the heavens our two walled citadels stand united behind this narrow waterfall pass. Hold the bridgehead with me, gather the valley’s gold and stone, and when their siege breaks—sound the horn and wipe every enemy base off the map!',
    stages:[
      {title:'Hold the Narrow Pass',text:'Defend the Ironfall bridgehead for two minutes (or completely wipe out Warlord Vex’s forward stockade early).',seconds:120,marker:{x:-14,z:0},done:(s,q)=>q.elapsed>=120||baseWiped(s,1),dialogue:'Their first wave shattered against the pass! Marshal Rowan’s knights are saddled—use your War-Comms orders to strike out together!'},
      {title:'Burn the Forward War-Camps',text:'Break out through the narrow pass with Marshal Rowan and wipe out every structure in Warlord Vex’s Raider Stockade and Siege-Master Krag’s Siege Foundry.',marker:{x:44,z:64},targetOwners:[1,2],done:s=>baseWiped(s,1)&&baseWiped(s,2),onDone:s=>{s.players[0].resources.gold+=450;s.players[0].resources.stone+=350;spawnReinforcements(s,{owner:5,type:'knight',count:4});},dialogue:'Both outer war-camps are razed to ashes! Seized siege chests (+450 Gold, +350 Stone)—now wipe out Emir Soliman’s and High Overlord Draven’s fortresses!'},
      {title:'Wipe Out the Four-Crown Coalition',text:'Completely wipe out every base structure of all four enemy warlords across Ironfall Pass (not just Town Centers).',marker:{x:136,z:88},done:allHostileBasesWiped,dialogue:'Not a single rival tower or stronghold remains standing! Two united banners wiped out an empire at the Gates of Ironfall!'},
    ],optional:{text:'Finish with Marshal Rowan’s allied citadel still standing.',done:s=>s.count(5,'building','towncenter')>0},
    events:[
      {at:22,id:'c15-draven-taunt',speaker:'Overlord Draven',role:'enemy',text:'Two cramped kingdoms hiding behind one bridge? My four armies will grind your walls to gravel!'},
      {at:48,id:'c15-vex-raid',speaker:'Warlord Vex',role:'enemy',text:'Forward riders! Test their narrow gatehouse and burn their watchtowers!',reinforce:{owner:1,type:'outrider',count:4}},
      {at:85,id:'c15-krag-siege',speaker:'Siege-Master Krag',role:'enemy',text:'Bring up the rams and Ironbreakers! Crack the bridgehead gate wide open!',reinforce:{owner:2,type:'ram',count:2}},
      {at:108,id:'c15-rowan-aid',speaker:'Marshal Rowan',role:'ally',text:'Hold fast beside me, Commander! Fresh royal lancers are charging straight to the pass!',reinforce:{owner:5,type:'knight',count:4}},
      {at:175,id:'c15-soliman-volley',speaker:'Emir Soliman',role:'enemy',text:'My Sunward marksmen will darken the sky above Ironfall!',reinforce:{owner:3,type:'marksman',count:4}},
      {at:240,id:'c15-draven-push',minDifficulty:'hard',speaker:'Overlord Draven',role:'enemy',text:'Enough delays! Send the Imperial siege column across the bridge!',reinforce:{owner:4,type:'knight',count:4}},
    ]},
  campaign16:{speaker:'Lady Vaelen',intro:'The roaring waterfall splits this valley in two, Commander. Watch the central stone bridge, the timber trestle to the south, and the shallow ford up north! Coordinate with my Sunward garrison and wipe out both rival strongholds completely.',
    stages:[
      {title:'Command the Gorge Crossings',text:'Hold the waterfall crossings for 90 seconds or destroy an enemy watchtower across the river.',seconds:90,marker:{x:0,z:0},done:(s,q)=>q.elapsed>=90||!s.count(1,'building','tower'),dialogue:'The crossings are contested in blood and fire! Push across the stone bridge or flank through the shallow northern ford.'},
      {title:'Raze the First River Stronghold',text:'Completely wipe out every base structure of either Lord Korr’s Ironhold citadel or General Syra’s northern hold.',marker:{x:118,z:64},targetOwners:[1,2],done:s=>baseWiped(s,1)||baseWiped(s,2),onDone:s=>{spawnReinforcements(s,{owner:3,type:'marksman',count:4});},dialogue:'One river fortress is completely leveled! My Sunward marksmen march beside you to finish the valley!'},
      {title:'Claim Waterfall Gorge',text:'Wipe out all remaining enemy base structures across the gorge.',marker:{x:118,z:-68},done:allHostileBasesWiped,dialogue:'Not an enemy stone stands across Waterfall Gorge! The fires on the bridge fade into total victory.'},
    ],optional:{text:'Finish with Lady Vaelen’s citadel standing.',done:s=>s.count(3,'building','towncenter')>0},
    events:[
      {at:25,id:'c16-korr-taunt',speaker:'Lord Korr',role:'enemy',text:'Ironhold steel owns this gorge! Come across that bridge if you dare!'},
      {at:65,id:'c16-syra-ford',speaker:'General Syra',role:'enemy',text:'Riders! Wade straight through the shallow northern ford and hit their flank!',reinforce:{owner:2,type:'knight',count:3}},
      {at:125,id:'c16-vaelen-push',speaker:'Lady Vaelen',role:'ally',text:'I have archers ready at the stone crossing—call the target and we strike together!',reinforce:{owner:3,type:'marksman',count:4}},
    ]},
  campaign17:{speaker:'Jarl Torin',intro:'Winter bites hard on Frostfall Cliff, Commander. Three warlord camps wait beyond the frozen river and drifting ice floes. Hold the stone and timber bridges with me, burn every outer stockade, and wipe Jarl Skald’s entire fortress from the snow!',
    stages:[
      {title:'Weather the Winter Assault',text:'Hold the icy river bridges for 100 seconds or completely wipe out either forward enemy war-camp.',seconds:100,marker:{x:-6,z:0},done:(s,q)=>q.elapsed>=100||baseWiped(s,1)||baseWiped(s,2),dialogue:'The winter storm couldn’t crack our walls! Counter-attack across the ice bridges and burn their stockades!'},
      {title:'Burn the Outer Siege Camps',text:'Wipe out every structure in both the Frost Raiders stockade and the Iron Siege Camp.',marker:{x:56,z:68},targetOwners:[1,2],done:s=>baseWiped(s,1)&&baseWiped(s,2),onDone:s=>{s.players[0].resources.wood+=400;s.players[0].resources.gold+=350;},dialogue:'Both siege stockades are ash in the snow! Now march east and raze every building of Jarl Skald’s fortress!'},
      {title:'End the Frostfall Siege',text:'Wipe out every base structure of all three hostile winter warlords.',marker:{x:132,z:2},done:allHostileBasesWiped,dialogue:'Every enemy fort lies buried beneath the snow! Frostfall Cliff is free!'},
    ],optional:{text:'Keep Jarl Torin’s allied fortress standing.',done:s=>s.count(4,'building','towncenter')>0},
    events:[
      {at:24,id:'c17-skald-taunt',speaker:'Jarl Skald',role:'enemy',text:'Freeze behind your walls! My three winter warbands will bury you beneath the snow!'},
      {at:68,id:'c17-iron-ram',speaker:'Iron Siege Camp',role:'enemy',text:'Roll the siege rams across the southern timber bridge!',reinforce:{owner:2,type:'ram',count:2}},
      {at:120,id:'c17-torin-charge',speaker:'Jarl Torin',role:'ally',text:'My household guard is marching to reinforce the central bridge!',reinforce:{owner:4,type:'sentinel',count:4}},
    ]},
  campaign18:{speaker:'Admiral Iven',intro:'Welcome to the Emerald Temple Lagoon! Towering banyans and ancient stone temples hide ruthless jungle warlords. Seize the sacred Emerald Temple Shrine with me, cross the coral delta bridges, and wipe out both rival jungle bases completely!',
    stages:[
      {title:'Claim the Emerald Temple Shrine',text:'Capture the central Emerald Temple Shrine (or completely wipe out either rival jungle base).',marker:{x:-6,z:-10},done:s=>s.entities.some(e=>e.kind==='shrine'&&s.allied(0,e.owner))||baseWiped(s,1)||baseWiped(s,2),onDone:s=>{s.players[0].resources.gold+=400;},dialogue:'The ancient temple shrine answers our banner (+400 Gold)! Push across the delta bridges and shallow coral ford!'},
      {title:'Raze the First Jungle Stronghold',text:'Completely wipe out every base structure of either Warlord Kael’s or Warden Arak’s jungle stronghold.',marker:{x:114,z:66},targetOwners:[1,2],done:s=>baseWiped(s,1)||baseWiped(s,2),dialogue:'One jungle stronghold is completely wiped out! Finish every building of the remaining warlord!'},
      {title:'Master of Temple Lagoon',text:'Wipe out all enemy base structures across Temple Lagoon.',marker:{x:114,z:-68},done:allHostileBasesWiped,dialogue:'Every rival temple fort has fallen! The Emerald Temple Lagoon flies our colors from waterfall to coral reef!'},
    ],optional:{text:'Finish with Admiral Iven’s coastal citadel standing.',done:s=>s.count(3,'building','towncenter')>0},
    events:[
      {at:26,id:'c18-arak-taunt',speaker:'Temple Warden Arak',role:'enemy',text:'The jungle swallows every trespasser! You will never claim these ancient temples!'},
      {at:80,id:'c18-kael-flank',speaker:'Warlord Kael',role:'enemy',text:'Outriders! Sweep through the shallow coral ford and raid their workers!',reinforce:{owner:1,type:'outrider',count:4}},
      {at:135,id:'c18-iven-aid',speaker:'Admiral Iven',role:'ally',text:'Fresh Sunward lancers landing to reinforce your temple push!',reinforce:{owner:3,type:'knight',count:3}},
    ]},
  campaign19:{speaker:'Queen Maren',intro:'Every banner in the realm meets here at Deepwood Ravine! You hold the center alongside Forgemaster Borin and my Royal Guard. Three Imperial warlords stand across the timber ravine bridge—coordinate our coalition and wipe every single enemy empire off the map!',
    stages:[
      {title:'Wipe Out the First Enemy Empire',text:'Cross Deepwood Ravine with Queen Maren and Forgemaster Borin and wipe out every structure of any rival Imperial base.',marker:{x:124,z:0},targetOwners:[1,2,3],done:s=>[1,2,3].some(o=>baseWiped(s,o)),onDone:s=>{spawnReinforcements(s,{owner:4,type:'knight',count:4});spawnReinforcements(s,{owner:5,type:'catapult',count:1});},dialogue:'An entire enemy empire has been wiped out! Borin brings up fresh Trebuchets and my Royal Knights charge through the ravine!'},
      {title:'Collapse the Coalition',text:'Completely wipe out at least two of the three rival Imperial bases.',marker:{x:118,z:-108},targetOwners:[1,2,3],done:s=>[1,2,3].filter(o=>baseWiped(s,o)).length>=2,dialogue:'Two rival empires lie in total ruins! Only one hostile stronghold remains—leave nothing standing!'},
      {title:'The Grand Clash of Crowns',text:'Wipe out all remaining base structures of all three rival Imperial empires across Deepwood Ravine.',marker:{x:118,z:108},done:allHostileBasesWiped,dialogue:'Every rival empire has been completely wiped from the frontier! The Great Frontier War is won forever!'},
    ],optional:{text:'Finish with both Queen Maren’s and Forgemaster Borin’s capitals still standing.',done:s=>s.count(4,'building','towncenter')>0&&s.count(5,'building','towncenter')>0},
    events:[
      {at:20,id:'c19-malrik-taunt',speaker:'Overlord Malrik',role:'enemy',text:'Three empires against your fragile alliance! Burn the timber bridge and crush them all!'},
      {at:65,id:'c19-borin-aid',speaker:'Forgemaster Borin',role:'ally',text:'Ironhold hammers are ready, Commander! Point the way with War-Comms and we shatter their gates!',reinforce:{owner:5,type:'ironbreaker',count:4}},
      {at:115,id:'c19-varek-charge',speaker:'Khan Varek',role:'enemy',text:'Raven cavalry, ride through the northern pass! Leave nothing standing!',reinforce:{owner:2,type:'knight',count:5}},
      {at:165,id:'c19-zafar-siege',minDifficulty:'hard',speaker:'Sultan Zafar',role:'enemy',text:'Unleash the trebuchets! Break the central bastion!',reinforce:{owner:3,type:'catapult',count:2}},
    ]},
};

function initializeStory(sim){
  const script=CAMPAIGN_SCRIPTS[sim.options.mode];if(!script)return;
  const q=sim.campaignState={stage:0,stageAt:0,elapsed:0,fish:0,clock:0,finished:false,route:'objectives',history:[{time:0,speaker:script.speaker,text:script.intro}],defenses:sim.owned(1,'building').filter(e=>['wall','gate'].includes(e.type)).map(e=>e.id),optional:false,fired:[],resolved:[],sideQuestDone:false,relic:sim.options.relic||null};
  if(script.cart){const cart=sim.addUnit('cart',0,script.cart.x,script.cart.z);cart.displayName=script.cart.name;q.cartId=cart.id;}
  if(sim.options.relic)applyCampaignRelic(sim,sim.options.relic);
  sim.campaignCheckpoint=null;
}
export function campaignObjective(sim){
  const q=sim.campaignState,script=CAMPAIGN_SCRIPTS[sim.options.mode];
  if(!q||q.legacy||q.finished||!script)return null;
  const sq=CAMPAIGN_SIDE_QUESTS[sim.options.mode]||null;
  const boss=CAMPAIGN_BOSSES[sim.options.mode]||null;
  const stage=script.stages[Math.min(q.stage,script.stages.length-1)];
  let marker=stage.marker||null;
  let progressText='';
  if(sim.mission?.actFive){
    const targetOwners=stage.targetOwners||sim.players.map((p,i)=>i).filter(i=>i>0&&sim.hostile(0,i));
    const totalHostiles=sim.players.filter((p,i)=>i>0&&!sim.allied(0,i)).length;
    const standingHostiles=sim.players.filter((p,i)=>i>0&&sim.hostile(0,i)&&!baseWiped(sim,i)).length;
    const standingStructs=targetOwners.reduce((n,o)=>n+(sim.hostile(0,o)?baseStructures(sim,o).length:0),0);
    if(q.stage>0||!stage.seconds){
      const dyn=nearestHostileStructure(sim,stage.targetOwners||null);
      if(dyn)marker=dyn;
      progressText=`Enemy bases: ${standingHostiles}/${totalHostiles} · ${standingStructs} buildings left`;
    }
  }
  return {...stage,marker,progressText,index:q.stage,total:script.stages.length,optional:script.optional.text,cart:q.cartId?sim.get(q.cartId):null,fish:q.fish,elapsed:q.elapsed||0,sideQuest:sq?{id:sq.id,title:sq.title,text:sq.text,rewardText:sq.rewardText,done:!!q.sideQuestDone}:null,boss};
}

export function installCampaigns(Simulation){
  const p=Simulation.prototype,initialize=p.initialize,tick=p.tick,end=p.end,emit=p.emit,serialize=p.serialize,restore=Simulation.restore;
  p.initialize=function(){initialize.call(this);if(this.mission)applyCampaignScenario(this);initializeStory(this);if(this.campaignState)this.campaignCheckpoint=copy({...serialize.call(this),campaignState:this.campaignState,checkpointTag:true});};
  p.emit=function(type,data={}){if(type==='gathered'&&data.owner===0&&data.source==='fishingboat'&&this.campaignState&&!this.campaignState.legacy)this.campaignState.fish+=data.amount;emit.call(this,type,data);};
  p.end=function(won,reason){if(won&&this.campaignState&&!this.campaignState.legacy&&!this.campaignState.finished)return;end.call(this,won,reason);};
  p.tick=function(dt){tick.call(this,dt);const q=this.campaignState,script=CAMPAIGN_SCRIPTS[this.options.mode];if(!q||q.legacy||q.finished||this.ended)return;
    // Stages that ask the player to hold out need a clock. Older saves have no
    // stage start, so they begin counting from the moment they are loaded
    // rather than instantly completing a timed objective. The elapsed time is
    // updated every tick so the HUD and the objective never show a stale value.
    if(q.stageAt===undefined)q.stageAt=this.time;
    q.elapsed=Math.max(0,this.time-q.stageAt);
    q.clock+=dt;if(q.clock<.5)return;q.clock=0;
    q.fired??=[];q.resolved??=[];
    // Track the optional objective continuously so later events can branch on
    // how the mission is actually going, not only on the final medal.
    q.optionalMet=!!script.optional?.done(this,q);
    const sideQuest=CAMPAIGN_SIDE_QUESTS[this.options.mode];
    if(sideQuest&&!q.sideQuestDone&&sideQuest.done(this,q)){
      q.sideQuestDone=true;
      sideQuest.reward(this,spawnReinforcements);
      q.history.push({time:this.time,speaker:script.speaker,text:`Side objective completed (${sideQuest.title}): ${sideQuest.rewardText}.`});
      this.emit('campaign-sidequest',{id:sideQuest.id,title:sideQuest.title,rewardText:sideQuest.rewardText});
    }
    for(const event of script.events||[]){
      if(q.resolved.includes(event.id)||this.time<event.at)continue;
      if(event.minDifficulty&&!meetsDifficulty(this,event.minDifficulty))continue;
      // A resolved event is never re-evaluated; only an executed one is
      // recorded as fired, so tests and the HUD can tell a skipped branch from
      // a branch that actually happened.
      q.resolved.push(event.id);
      if(event.when&&!event.when(this,q))continue;
      q.fired.push(event.id);
      if(event.reinforce)spawnReinforcements(this,event.reinforce);
      q.history.push({time:this.time,speaker:event.speaker||script.speaker,text:event.text});
      const isEnemy=event.role==='enemy'||(!!event.reinforce&&(event.reinforce.owner??0)!==0&&!this.allied(0,event.reinforce.owner));
      this.emit('campaign-event',{id:event.id,speaker:event.speaker||script.speaker,role:event.role||(isEnemy?'enemy':'ally'),text:event.text,enemy:isEnemy});
    }
    if(q.cartId&&!this.get(q.cartId)){end.call(this,false,'The supply caravan was lost. Restore a checkpoint or begin the escort again.');return;}
    // Act V total-war elimination: each enemy warlord only falls when ALL of their base structures
    // are wiped out (walls/gates/farms then collapse cleanly). Reveal last <=4 structures so no stray
    // building ever hides in fog!
    if(this.mission?.actFive){
      for(let owner=1;owner<this.players.length;owner++){
        const pl=this.players[owner];
        if(!pl||pl.defeated||!this.hostile(0,owner))continue;
        const structs=baseStructures(this,owner);
        if(structs.length===0){
          pl.defeated=true;
          for(const e of this.entities){
            if(e.hp>0&&e.owner===owner&&e.kind==='building')e.hp=0;
          }
          this.revision++;
          this.emit('kingdom-defeated',{owner,name:pl.name,reason:'Base completely wiped out'});
          this.updateFog();
        }else if(structs.length<=4){
          for(const b of structs){
            const c=this.cell(b.x,b.z);
            for(let dz=-4;dz<=4;dz++)for(let dx=-4;dx<=4;dx++){
              const gx=c.x+dx,gz=c.z+dz;
              if(gx>=0&&gz>=0&&gx<this.gridSize&&gz<this.gridSize){
                const idx=gz*this.gridSize+gx;
                this.explored[idx]=1;this.visible[idx]=1;
              }
            }
          }
        }
      }
    }
    if(script.alternativeConquest&&conquered(this)){q.route='conquest';q.stage=script.stages.length;q.finished=true;q.optional=false;end.call(this,true,'The rival capital has fallen. The valley is secured by conquest.');return;}
    const stage=script.stages[q.stage];if(!stage?.done(this,q))return;
    stage.onDone?.(this,q);
    q.history.push({time:this.time,speaker:script.speaker,text:stage.dialogue});q.stage++;q.stageAt=this.time;q.elapsed=0;this.emit('campaign-stage',{title:stage.title,text:stage.dialogue,stage:q.stage,total:script.stages.length});
    if(q.stage>=script.stages.length){q.finished=true;q.optional=!!script.optional.done(this,q);end.call(this,true,stage.dialogue);return;}
    this.campaignCheckpoint=copy({...serialize.call(this),campaignState:q,checkpointTag:true});this.emit('campaign-checkpoint',{stage:q.stage});
  };
  p.serialize=function(){return {...serialize.call(this),campaignState:this.campaignState||null,campaignCheckpoint:this.campaignCheckpoint||null};};
  Simulation.restore=function(data){const sim=restore.call(this,data);sim.campaignState=data.campaignState?copy(data.campaignState):sim.mission?{legacy:true}:null;sim.campaignCheckpoint=data.campaignCheckpoint?copy(data.campaignCheckpoint):data.checkpointTag?copy(data):null;return sim;};
}
