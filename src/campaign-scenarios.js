import {UNITS,BUILDINGS,DIFFICULTIES,seededRandom} from './data.js';
import {PLAYER_COLORS} from './custom-battle.js';
import {addNaturalBarrier,addCliffRidge,addDenseForestBelt,buildWalledCitadel} from './terrain-barriers.js';
import {plantStartingForests} from './starting-forests.js';
import {groupFieldForests} from './field-forests.js';

const clamp=(v,lo,hi)=>Math.max(lo,Math.min(hi,v));

/** Safely places a handcrafted scenario building, clearing stray overlapping natural resources. */
function placeBuilding(sim,type,owner,x,z,complete=true,layout){
  const def=BUILDINGS[type];
  if(!def)return null;
  const limit=sim.halfWorld-(def.r||2)-2.5;
  if(Math.abs(x)>limit||Math.abs(z)>limit||sim.isWater(x,z))return null;
  if(sim.barriers?.some(b=>Math.hypot(b.x-x,b.z-z)<b.r+(def.r||2)+.4))return null;
  for(const e of sim.entities){
    if(e.hp>0&&e.kind==='resource'&&!e.water&&Math.hypot(e.x-x,e.z-z)<(def.r||2)+e.r+1.2)e.hp=0;
  }
  if(sim.entities.some(e=>e.hp>0&&e.kind==='building'&&Math.hypot(e.x-x,e.z-z)<Math.max(1.8,(def.r||2)+e.r-.6)))return null;
  return sim.addBuilding(type,owner,x,z,complete,layout);
}

/** Safely places a handcrafted scenario unit on dry navigable ground. */
function placeUnit(sim,type,owner,x,z){
  const limit=sim.halfWorld-3;
  const cx=clamp(x,-limit,limit),cz=clamp(z,-limit,limit);
  if(sim.isWater(cx,cz))return null;
  return sim.addUnit(type,owner,cx,cz);
}

/** Plants lush local resource clusters (food berries, timber groves, gold & stone veins) around a base. */
function seedBaseDeposits(sim,center,seedSalt=0){
  const rng=seededRandom((sim.options.seed||2026)+seedSalt);
  const clusters=[[-18,16,'food',5],[16,-18,'gold',4],[-20,-8,'stone',4],[20,16,'wood',8]];
  for(const [dx,dz,type,count] of clusters){
    for(let i=0;i<count;i++){
      const x=center.x+dx+(rng()-.5)*6,z=center.z+dz+(rng()-.5)*6;
      if(Math.abs(x)>sim.halfWorld-5||Math.abs(z)>sim.halfWorld-5||sim.isWater(x,z))continue;
      if(sim.barriers?.some(b=>Math.hypot(b.x-x,b.z-z)<b.r+2.4))continue;
      if(sim.entities.some(e=>e.hp>0&&(e.kind==='building'&&Math.hypot(e.x-x,e.z-z)<e.r+2.8||e.kind==='resource'&&Math.hypot(e.x-x,e.z-z)<2.1)))continue;
      sim.addNaturalResource(type,x,z,type==='wood'?260:type==='food'?400:2000);
    }
  }
}

/** Configures an extra campaign player slot (Allied Kingdom or additional Enemy Warlord). */
function makeScenarioPlayer(sim,{name,faction='alder',team=2,age=2,difficulty,aiPersonality='balanced',colorIndex=1,start={x:0,z:0},resources,dormant=false}){
  const base=sim.makePlayer(faction);
  return {
    ...base,
    name,
    team,
    age,
    difficulty:difficulty||sim.options.difficulty||'normal',
    controller:'ai',
    aiHealth:100,
    aiPersonality,
    aiClock:-colorIndex*.3,
    slotNumber:colorIndex+1,
    color:PLAYER_COLORS[colorIndex%PLAYER_COLORS.length],
    start:{...start},
    defeated:false,
    dormant,
    battleStats:{gathered:0,kills:0,lost:0,built:0,trained:0},
    resources:resources||{food:700,wood:700,gold:400,stone:350},
  };
}

/**
 * Enhances all 10 classic Chapters (I–X) with distinct handcrafted bases,
 * pre-built fortifications, natural cliff chokepoints, and lush berry/forest pockets,
 * while strictly keeping critical build/escort test coordinates clear.
 */
function applyClassicChapterArchitecture(sim){
  const mode=sim.options.mode;
  const p0=sim.owned(0,'building','towncenter')[0]||{x:-39,z:30};
  const p1=sim.owned(1,'building','towncenter')[0]||{x:40,z:-34};
  // Protect classic test pad (-36, 49) and caravan lane (-34,43 -> 20,-8)
  const testKeep=[{x:-36,z:49,r:10},{x:p0.x,z:p0.z,r:18},{x:p1.x,z:p1.z,r:18}];

  if(mode==='campaign1'){
    // Frontier Foothold: Natural boulder crags framing the northern woods + scout outpost + lush berries
    addCliffRidge(sim,{x:-66,z:-12},{x:-28,z:-24},{step:4.2,width:1,radius:2.7,height:3.6,wobble:1.8,keepClear:testKeep,seedOffset:101});
    addCliffRidge(sim,{x:14,z:24},{x:58,z:16},{step:4.2,width:1,radius:2.7,height:3.6,wobble:1.8,keepClear:testKeep,seedOffset:102});
    placeBuilding(sim,'wall',0,-20,17,true,{angle:-Math.PI/4});
    placeBuilding(sim,'wall',0,-18,19,true,{angle:-Math.PI/4});
    placeBuilding(sim,'wall',1,24,-18,true,{angle:-Math.PI/4});
    placeBuilding(sim,'wall',1,26,-16,true,{angle:-Math.PI/4});
    for(const [bx,bz] of [[-52,40],[-54,38],[-50,42]])if(!sim.isWater(bx,bz))sim.addNaturalResource('food',bx,bz,320);
  }else if(mode==='campaign2'){
    // The Broken Crossing: Fortified western bridgehead watchtower + enemy eastern toll-fort
    const bridgeKeep=[...testKeep,{x:0,z:0,r:14},{x:-16,z:0,r:10},{x:20,z:-8,r:11}];
    placeBuilding(sim,'tower',0,-16,12,true);
    placeBuilding(sim,'wall',0,-15,18,true,{angle:Math.PI/2});
    placeBuilding(sim,'wall',0,-15,21,true,{angle:Math.PI/2});
    // Enemy toll-post overlooking the garrison road beyond the safe bridgehead
    placeBuilding(sim,'tower',1,31,-26,true);
    placeBuilding(sim,'wall',1,26,-20,true,{angle:-Math.PI/4});
    placeBuilding(sim,'wall',1,28,-22,true,{angle:-Math.PI/4});
    addCliffRidge(sim,{x:-58,z:-44},{x:-22,z:-36},{step:4.2,width:1,radius:2.8,height:3.9,wobble:1.6,keepClear:bridgeKeep,seedOffset:201});
    addCliffRidge(sim,{x:24,z:34},{x:62,z:42},{step:4.2,width:1,radius:2.8,height:3.9,wobble:1.6,keepClear:bridgeKeep,seedOffset:202});
  }else if(mode==='campaign3'){
    // A Crown of Stone: Pre-walled Iron Ridge stronghold (walls + gatehouse + 2 flanking towers; pad -36,49 open for Keep!)
    const ridgeKeep=[...testKeep,{x:-36,z:49,r:11}];
    // Outer stone/palisade defensive wall facing the northern & eastern wave lanes
    for(let x=-54;x<=-16;x+=3){
      if(Math.abs(x+32)<=4)continue;
      placeBuilding(sim,'wall',0,x,12,true,{angle:0});
    }
    placeBuilding(sim,'gate',0,-32,12,true,{angle:0});
    for(let z=15;z<=46;z+=3){
      if(Math.abs(z-30)<=4)continue;
      placeBuilding(sim,'wall',0,-16,z,true,{angle:Math.PI/2});
    }
    placeBuilding(sim,'gate',0,-16,30,true,{angle:Math.PI/2});
    placeBuilding(sim,'tower',0,-20,16,true);
    placeBuilding(sim,'tower',0,-48,16,true);
    placeBuilding(sim,'blacksmith',0,-52,29,true);
    // Natural stone cliff shoulders framing Iron Ridge
    addCliffRidge(sim,{x:-68,z:8},{x:-56,z:12},{step:3.6,width:1,radius:2.9,height:4.2,wobble:1.2,keepClear:ridgeKeep,seedOffset:301});
    addCliffRidge(sim,{x:-12,z:50},{x:12,z:54},{step:3.8,width:1,radius:2.9,height:4.2,wobble:1.6,keepClear:ridgeKeep,seedOffset:302});
  }else if(mode==='campaign4'){
    // Keepers of the Valley: Dramatic rocky crags funneling approaches toward the 3 sacred shrines
    const shrineKeep=[...testKeep,{x:-26,z:-23,r:13},{x:3,z:1,r:13},{x:28,z:25,r:13}];
    addCliffRidge(sim,{x:-48,z:-8},{x:-12,z:-8},{step:4.0,width:1,radius:2.6,height:3.7,wobble:1.6,keepClear:shrineKeep,seedOffset:401});
    addCliffRidge(sim,{x:16,z:10},{x:50,z:10},{step:4.0,width:1,radius:2.6,height:3.7,wobble:1.6,keepClear:shrineKeep,seedOffset:402});
    placeBuilding(sim,'tower',0,-24,18,true);
    placeBuilding(sim,'tower',1,24,-18,true);
    placeBuilding(sim,'stable',0,-52,22,true);
  }else if(mode==='campaign5'){
    // The Final Siege: Fortified Southern Siege Camp vs Massive Double-Walled Twin-Gate Enemy Citadel!
    const siegeKeep=[...testKeep,{x:36,z:-5,r:11}];
    // Upgrade player's staging war-camp (leaving -36,49 clear for Siege Workshop!)
    placeBuilding(sim,'tower',0,-22,16,true);
    placeBuilding(sim,'tower',0,-46,16,true);
    placeBuilding(sim,'stable',0,-54,28,true);
    placeBuilding(sim,'blacksmith',0,-52,18,true);
    placeBuilding(sim,'monastery',0,-22,38,true);
    // Fortify Lord Draven's Walled Capital with flanking stone cliffs & inner citadel curtain
    addCliffRidge(sim,{x:-4,z:-8},{x:12,z:-6},{step:3.6,width:1,radius:2.9,height:4.3,wobble:1.2,keepClear:siegeKeep,seedOffset:501});
    placeBuilding(sim,'tower',1,27,-8,true);
    placeBuilding(sim,'tower',1,45,-8,true);
    placeBuilding(sim,'workshop',1,56,-22,true);
    for(let z=-36;z<=-9;z+=3)placeBuilding(sim,'wall',1,15,z,true,{angle:Math.PI/2});
  }else if(mode==='campaign6'){
    // Beyond the Horizon: Walled western coastal harbor town vs Corsair Admiral Rask's fortified eastern coast
    placeBuilding(sim,'tower',0,-24,18,true);
    placeBuilding(sim,'tower',0,-24,38,true);
    placeBuilding(sim,'tower',1,24,-22,true);
    placeBuilding(sim,'tower',1,24,-42,true);
    placeBuilding(sim,'keep',1,48,-46,true);
    addNaturalBarrier(sim,-58,-12,{r:3.2,height:4.2,keepClear:testKeep});
    addNaturalBarrier(sim,58,14,{r:3.2,height:4.2,keepClear:testKeep});
  }else if(mode==='campaign7'){
    // The Ember Road: Narrow Volcanic Basalt Cliff Chokepoints framing the central Ash Pass (0,0)
    const passKeep=[...testKeep,{x:0,z:0,r:12},{x:28,z:-24,r:12}];
    addCliffRidge(sim,{x:-66,z:-58},{x:-12,z:-12},{step:3.6,width:2,radius:3.0,height:4.6,wobble:2.0,passes:[{x:0,z:0,r:12}],keepClear:passKeep,seedOffset:701});
    addCliffRidge(sim,{x:12,z:12},{x:66,z:58},{step:3.6,width:2,radius:3.0,height:4.6,wobble:2.0,passes:[{x:0,z:0,r:12}],keepClear:passKeep,seedOffset:702});
    // Ash-Lord Kaelen's fortified mountain warcamp & player's forward stone barricade
    placeBuilding(sim,'tower',0,-20,16,true);
    placeBuilding(sim,'tower',1,22,-18,true);
    placeBuilding(sim,'keep',1,48,-46,true);
    for(let x=20;x<=46;x+=3){if(Math.abs(x-32)<=4)continue;placeBuilding(sim,'wall',1,x,-14,true,{angle:0});}
    placeBuilding(sim,'gate',1,32,-14,true,{angle:0});
  }else if(mode==='campaign8'){
    // The Deepwood Oath: Impenetrable Black Forest corridors & hidden ambush lanes
    const woodKeep=[...testKeep,{x:-20,z:45,r:10},{x:0,z:0,r:11},{x:28,z:-24,r:11}];
    const passes=[{x:0,z:0,r:10.5},{x:-30,z:-22,r:10},{x:30,z:22,r:10}];
    addDenseForestBelt(sim,{x:-64,z:-56},{x:64,z:56},{step:2.5,thickness:3,passes,keepClear:woodKeep,seedOffset:801});
    placeBuilding(sim,'wall',0,-22,18,true,{angle:-Math.PI/4});
    placeBuilding(sim,'wall',0,-20,20,true,{angle:-Math.PI/4});
    placeBuilding(sim,'tower',1,22,-18,true);
    for(let x=26;x<=52;x+=3){if(Math.abs(x-38)<=4)continue;placeBuilding(sim,'wall',1,x,-16,true,{angle:0});}
    placeBuilding(sim,'gate',1,38,-16,true,{angle:0});
  }else if(mode==='campaign9'){
    // The Long Night: Complete Pre-Walled Winter Palisade Town actively under siege!
    buildWalledCitadel(sim,0,{x:p0.x,z:p0.z},{radius:17,gates:['north','east'],towers:false,complete:true});
    placeBuilding(sim,'tower',0,p0.x-10,p0.z-12,true);
    placeBuilding(sim,'tower',0,p0.x+12,p0.z-10,true);
    placeBuilding(sim,'blacksmith',0,p0.x-11,p0.z+8,true);
    // Siege-Master Torv's fortified northern siege camp behind icy cliffs
    addCliffRidge(sim,{x:-58,z:-12},{x:-16,z:-18},{step:3.8,width:1,radius:2.9,height:4.2,wobble:1.6,keepClear:testKeep,seedOffset:901});
    placeBuilding(sim,'workshop',1,26,-18,true);
    placeBuilding(sim,'tower',1,22,-22,true);
  }else if(mode==='campaign10'){
    // The Last Claim: Fortified Royal Staging Citadel vs Valkor's Imperial Summit Keep
    const summitKeep=[...testKeep,{x:0,z:0,r:16}];
    buildWalledCitadel(sim,0,{x:p0.x,z:p0.z},{radius:17,gates:['north','east'],towers:false,complete:true});
    placeBuilding(sim,'tower',0,p0.x+12,p0.z-12,true);
    placeBuilding(sim,'stable',0,p0.x-12,p0.z+4,true);
    placeBuilding(sim,'blacksmith',0,p0.x+6,p0.z+11,true);
    // Natural highland cliff shoulders framing the central summit ridge (0,0)
    addCliffRidge(sim,{x:-56,z:-14},{x:-20,z:-8},{step:3.8,width:1,radius:3.1,height:4.7,wobble:1.8,keepClear:summitKeep,seedOffset:1001});
    addCliffRidge(sim,{x:20,z:8},{x:56,z:14},{step:3.8,width:1,radius:3.1,height:4.7,wobble:1.8,keepClear:summitKeep,seedOffset:1002});
    // Valkor's Imperial Fortress (place Keep first so walls cleanly frame around it)
    placeBuilding(sim,'keep',1,35,-49,true);
    buildWalledCitadel(sim,1,{x:p1.x,z:p1.z},{radius:21,gates:['south','west'],towers:true,complete:true});
  }
}

/**
 * Builds Act IV ("Legends of the Realm") sprawling 240x240 multi-kingdom handcrafted scenarios:
 *  - campaign11: The Ring of Iron (Huge Walled Central Citadel surrounded by 3 Enemy Bases + Western Allied Relief arriving mid-battle!)
 *  - campaign12: The Sundered Pass (Impassable Mountain Cliff Ranges + 3 Narrow Passes + Active Allied Border Garrison!)
 *  - campaign13: The Fallen Banner (NO starting base — Rescue the besieged walled town of Oakhold to take command of it & expand!)
 *  - campaign14: Crown of Three Kingdoms (Epic 2v2 Imperial Coalition War across rivers, bridges & cliffs!)
 */
export function buildActFourScenario(sim){
  const mode=sim.options.mode;
  const playerFaction=sim.options.faction||'alder';
  const diff=sim.options.difficulty||'normal';
  const half=sim.halfWorld;

  // Wipe default 2-player spawns and build bespoke multi-kingdom world from scratch
  sim.entities=[];
  sim.barriers=[];
  sim.nextId=1;
  sim.aiStates={};
  sim.teamAlarms={};
  sim.revealedOwners=[];

  if(mode==='campaign11'){
    // THE RING OF IRON — Central Walled Citadel surrounded by 3 Enemy Bases + Arriving Western Allied Relief
    const c0={x:0,z:0},c1={x:-8,z:-84},c2={x:86,z:4},c3={x:-84,z:10};
    sim.players=[
      {...sim.makePlayer(playerFaction),name:'Your Citadel',team:1,age:2,controller:'human',slotNumber:1,color:PLAYER_COLORS[0],start:c0,resources:{food:900,wood:950,gold:550,stone:550},defeated:false},
      makeScenarioPlayer(sim,{name:'Lord Korr (North)',faction:'raven',team:2,age:2,difficulty:diff,aiPersonality:'rusher',colorIndex:1,start:c1,resources:{food:750,wood:750,gold:450,stone:300}}),
      makeScenarioPlayer(sim,{name:'General Syra (East)',faction:'sun',team:2,age:2,difficulty:diff,aiPersonality:'balanced',colorIndex:2,start:c2,resources:{food:750,wood:750,gold:450,stone:300}}),
      makeScenarioPlayer(sim,{name:'Western Relief',faction:'alder',team:1,age:2,difficulty:diff,aiPersonality:'rusher',colorIndex:3,start:c3,resources:{food:950,wood:950,gold:650,stone:450},dormant:true}),
    ];
    sim.spawnPositions=[c0,c1,c2,c3];

    // Natural granite cliffs framing the 4 valley corridors around the central citadel
    const keep=[{x:0,z:0,r:28},{x:c1.x,z:c1.z,r:22},{x:c2.x,z:c2.z,r:22},{x:c3.x,z:c3.z,r:22},{x:4,z:82,r:20}];
    const passes=[{x:0,z:-44,r:13},{x:46,z:0,r:13},{x:0,z:44,r:13},{x:-46,z:0,r:13}];
    addCliffRidge(sim,{x:-54,z:-54},{x:-26,z:-26},{step:3.8,width:2,radius:3.1,height:4.6,wobble:2.0,passes,keepClear:keep,seedOffset:1101});
    addCliffRidge(sim,{x:54,z:-54},{x:26,z:-26},{step:3.8,width:2,radius:3.1,height:4.6,wobble:2.0,passes,keepClear:keep,seedOffset:1102});
    addCliffRidge(sim,{x:54,z:54},{x:26,z:26},{step:3.8,width:2,radius:3.1,height:4.6,wobble:2.0,passes,keepClear:keep,seedOffset:1103});
    addCliffRidge(sim,{x:-54,z:54},{x:-26,z:26},{step:3.8,width:2,radius:3.1,height:4.6,wobble:2.0,passes,keepClear:keep,seedOffset:1104});

    // Player's GRAND PRE-BUILT WALLED CENTRAL CITADEL!
    placeBuilding(sim,'towncenter',0,0,0,true);
    placeBuilding(sim,'keep',0,-8,-8,true);
    placeBuilding(sim,'barracks',0,10,-8,true);
    placeBuilding(sim,'range',0,10,8,true);
    placeBuilding(sim,'stable',0,-10,8,true);
    placeBuilding(sim,'blacksmith',0,0,-12,true);
    placeBuilding(sim,'market',0,-12,0,true);
    placeBuilding(sim,'monastery',0,12,0,true);
    placeBuilding(sim,'house',0,-14,-14,true);
    placeBuilding(sim,'house',0,14,-14,true);
    placeBuilding(sim,'house',0,-14,14,true);
    placeBuilding(sim,'house',0,14,14,true);
    placeBuilding(sim,'mill',0,0,12,true);
    for(const [fx,fz] of [[-5,14],[5,14],[-14,-6],[14,6]])placeBuilding(sim,'farm',0,fx,fz,true);
    buildWalledCitadel(sim,0,c0,{radius:22,gates:['north','east','south','west'],towers:true,complete:true});
    for(let i=0;i<14;i++)placeUnit(sim,'villager',0,-6+(i%5)*3,4+Math.floor(i/5)*2.5);
    for(let i=0;i<4;i++)placeUnit(sim,'knight',0,-6+i*4,-16);
    for(let i=0;i<4;i++)placeUnit(sim,'swordsman',0,16,-6+i*4);
    for(let i=0;i<4;i++)placeUnit(sim,'archer',0,-6+i*4,17);
    placeUnit(sim,'monk',0,-3,-4);placeUnit(sim,'monk',0,3,-4);

    // Enemy 1: Lord Korr's Northern Siege Camp
    placeBuilding(sim,'towncenter',1,c1.x,c1.z,true);
    placeBuilding(sim,'barracks',1,c1.x-12,c1.z+8,true);
    placeBuilding(sim,'workshop',1,c1.x+12,c1.z+10,true);
    placeBuilding(sim,'tower',1,c1.x-10,c1.z+18,true);
    placeBuilding(sim,'tower',1,c1.x+10,c1.z+18,true);
    placeBuilding(sim,'house',1,c1.x-14,c1.z-8,true);
    placeBuilding(sim,'house',1,c1.x+14,c1.z-8,true);
    placeBuilding(sim,'mill',1,c1.x,c1.z-12,true);
    for(let i=0;i<10;i++)placeUnit(sim,'villager',1,c1.x-8+(i%5)*3,c1.z-6+Math.floor(i/5)*3);
    for(let i=0;i<6;i++)placeUnit(sim,i%2?'swordsman':'spearman',1,c1.x-8+i*3,c1.z+22);
    placeUnit(sim,'ram',1,c1.x,c1.z+24);

    // Enemy 2: General Syra's Eastern Raider Hold
    placeBuilding(sim,'towncenter',2,c2.x,c2.z,true);
    placeBuilding(sim,'stable',2,c2.x-12,c2.z-8,true);
    placeBuilding(sim,'range',2,c2.x-12,c2.z+10,true);
    placeBuilding(sim,'tower',2,c2.x-18,c2.z-10,true);
    placeBuilding(sim,'tower',2,c2.x-18,c2.z+10,true);
    placeBuilding(sim,'house',2,c2.x+12,c2.z-10,true);
    placeBuilding(sim,'house',2,c2.x+12,c2.z+10,true);
    placeBuilding(sim,'mill',2,c2.x+12,c2.z,true);
    for(let i=0;i<10;i++)placeUnit(sim,'villager',2,c2.x+6+(i%5)*2.5,c2.z-6+Math.floor(i/5)*3);
    for(let i=0;i<6;i++)placeUnit(sim,i%2?'knight':'archer',2,c2.x-22,c2.z-10+i*4);

    // Southern Forward Encirclement Outpost (owned by Enemy 1 so all 3 approaches feel genuinely besieged!)
    placeBuilding(sim,'barracks',1,4,76,true);
    placeBuilding(sim,'tower',1,-4,68,true);
    placeBuilding(sim,'tower',1,12,68,true);
    for(let i=0;i<5;i++)placeUnit(sim,i%2?'spearman':'archer',1,-6+i*3.5,62);

    seedBaseDeposits(sim,c0,111);seedBaseDeposits(sim,c1,112);seedBaseDeposits(sim,c2,113);seedBaseDeposits(sim,c3,114);
  }else if(mode==='campaign12'){
    // THE SUNDERED PASS — Impassable Mountain Cliffs + 3 Narrow Chokepoints + Active Allied Garrison!
    const c0={x:-74,z:50},c1={x:20,z:-4},c2={x:82,z:-34},c3={x:-68,z:-54};
    sim.players=[
      {...sim.makePlayer(playerFaction),name:'Your Stronghold',team:1,age:2,controller:'human',slotNumber:1,color:PLAYER_COLORS[0],start:c0,resources:{food:850,wood:900,gold:500,stone:650},defeated:false},
      makeScenarioPlayer(sim,{name:'Pass Fortress',faction:'alder',team:2,age:2,difficulty:diff,aiPersonality:'turtle',colorIndex:1,start:c1,resources:{food:650,wood:650,gold:400,stone:450}}),
      makeScenarioPlayer(sim,{name:'Eastern Empire',faction:'sun',team:2,age:2,difficulty:diff,aiPersonality:'boomer',colorIndex:2,start:c2,resources:{food:900,wood:900,gold:600,stone:450}}),
      makeScenarioPlayer(sim,{name:'Northern Ally',faction:'alder',team:1,age:2,difficulty:diff,aiPersonality:'turtle',colorIndex:3,start:c3,resources:{food:850,wood:850,gold:500,stone:450}}),
    ];
    sim.spawnPositions=[c0,c1,c2,c3];

    // Towering North-to-South Stone Mountain Range creating 3 narrow chokepoints!
    const passes=[{x:-6,z:-64,r:10},{x:-6,z:0,r:11},{x:-6,z:64,r:10}];
    const keep=[{x:c0.x,z:c0.z,r:22},{x:c1.x,z:c1.z,r:22},{x:c2.x,z:c2.z,r:22},{x:c3.x,z:c3.z,r:22}];
    addCliffRidge(sim,{x:-8,z:-half+6},{x:-6,z:half-6},{step:3.4,width:2,radius:3.2,height:5.0,wobble:3.0,passes,keepClear:keep,seedOffset:1201});
    // Secondary eastern spur framing the eastern capital
    addCliffRidge(sim,{x:48,z:22},{x:56,z:half-8},{step:3.8,width:1,radius:3.0,height:4.4,wobble:2.0,passes:[{x:50,z:54,r:11}],keepClear:keep,seedOffset:1202});

    // Player Western Stronghold
    placeBuilding(sim,'towncenter',0,c0.x,c0.z,true);
    placeBuilding(sim,'barracks',0,c0.x+14,c0.z-6,true);
    placeBuilding(sim,'range',0,c0.x+12,c0.z+10,true);
    placeBuilding(sim,'blacksmith',0,c0.x-12,c0.z-8,true);
    placeBuilding(sim,'mill',0,c0.x-12,c0.z+8,true);
    placeBuilding(sim,'house',0,c0.x-14,c0.z,true);
    placeBuilding(sim,'house',0,c0.x,c0.z+14,true);
    placeBuilding(sim,'house',0,c0.x,c0.z-14,true);
    placeBuilding(sim,'tower',0,-22,60,true);
    for(let i=0;i<12;i++)placeUnit(sim,'villager',0,c0.x-6+(i%4)*3,c0.z+18+Math.floor(i/4)*2.5);
    for(let i=0;i<8;i++)placeUnit(sim,i%3===0?'archer':'spearman',0,-26+(i%4)*3,54+Math.floor(i/4)*3);
    placeUnit(sim,'scout',0,-24,10);

    // Active Allied Northern Border Garrison (Pre-walled fort holding the north pass!)
    placeBuilding(sim,'towncenter',3,c3.x,c3.z,true);
    placeBuilding(sim,'barracks',3,c3.x+10,c3.z+8,true);
    placeBuilding(sim,'stable',3,c3.x-10,c3.z+8,true);
    placeBuilding(sim,'house',3,c3.x-10,c3.z-10,true);
    placeBuilding(sim,'house',3,c3.x+10,c3.z-10,true);
    placeBuilding(sim,'mill',3,c3.x,c3.z-11,true);
    buildWalledCitadel(sim,3,c3,{radius:17,gates:['east','south'],towers:true,complete:true});
    for(let i=0;i<10;i++)placeUnit(sim,'villager',3,c3.x-4+(i%4)*2.5,c3.z+6+Math.floor(i/4)*2.5);
    for(let i=0;i<6;i++)placeUnit(sim,i%2?'swordsman':'archer',3,-24,-62+i*2.5);

    // Enemy 1: Central Mountain Gatehouse Fortress blocking the middle pass
    placeBuilding(sim,'towncenter',1,c1.x,c1.z,true);
    placeBuilding(sim,'keep',1,c1.x-11,c1.z,true);
    placeBuilding(sim,'barracks',1,c1.x+10,c1.z-10,true);
    placeBuilding(sim,'range',1,c1.x+10,c1.z+10,true);
    placeBuilding(sim,'house',1,c1.x+14,c1.z,true);
    buildWalledCitadel(sim,1,c1,{radius:19,gates:['west','east'],towers:true,complete:true});
    for(let i=0;i<8;i++)placeUnit(sim,'villager',1,c1.x+6+(i%4)*2.5,c1.z-4+Math.floor(i/4)*3);
    for(let i=0;i<8;i++)placeUnit(sim,i%2?'swordsman':'archer',1,c1.x-20,c1.z-10+i*3);

    // Enemy 2: Eastern Imperial Capital
    placeBuilding(sim,'towncenter',2,c2.x,c2.z,true);
    placeBuilding(sim,'barracks',2,c2.x-12,c2.z+10,true);
    placeBuilding(sim,'stable',2,c2.x-12,c2.z-10,true);
    placeBuilding(sim,'workshop',2,c2.x,c2.z+14,true);
    placeBuilding(sim,'blacksmith',2,c2.x+12,c2.z-8,true);
    placeBuilding(sim,'house',2,c2.x+12,c2.z+8,true);
    placeBuilding(sim,'house',2,c2.x,c2.z-14,true);
    placeBuilding(sim,'mill',2,c2.x+14,c2.z,true);
    buildWalledCitadel(sim,2,c2,{radius:18,gates:['west','south'],towers:true,complete:true});
    for(let i=0;i<12;i++)placeUnit(sim,'villager',2,c2.x-4+(i%4)*3,c2.z-6+Math.floor(i/4)*3);
    for(let i=0;i<6;i++)placeUnit(sim,i%2?'knight':'marksman',2,c2.x-22,c2.z-8+i*3);

    seedBaseDeposits(sim,c0,121);seedBaseDeposits(sim,c1,122);seedBaseDeposits(sim,c2,123);seedBaseDeposits(sim,c3,124);
  }else if(mode==='campaign13'){
    // THE FALLEN BANNER — Warcraft III / Joan of Arc Rescue-and-Expand Mission!
    // Player starts with ZERO buildings & ZERO villagers — just Sovereign + Elite Vanguard!
    const c0={x:-86,z:74},c1={x:12,z:34},c2={x:72,z:-66},c3={x:-22,z:16};
    sim.players=[
      {...sim.makePlayer(playerFaction),name:'Royal Vanguard',team:1,age:2,controller:'human',slotNumber:1,color:PLAYER_COLORS[0],start:c0,resources:{food:550,wood:600,gold:400,stone:300},defeated:false},
      makeScenarioPlayer(sim,{name:'Oakhold Raiders',faction:'raven',team:2,age:1,difficulty:diff,aiPersonality:'rusher',colorIndex:1,start:c1,resources:{food:450,wood:450,gold:250,stone:150}}),
      makeScenarioPlayer(sim,{name:'Warlord Malrik',faction:'raven',team:2,age:2,difficulty:diff,aiPersonality:'turtle',colorIndex:2,start:c2,resources:{food:900,wood:900,gold:600,stone:450}}),
      makeScenarioPlayer(sim,{name:'Village of Oakhold',faction:'alder',team:1,age:2,difficulty:diff,aiPersonality:'turtle',colorIndex:3,start:c3,resources:{food:600,wood:600,gold:300,stone:250},dormant:true}),
    ];
    sim.spawnPositions=[c0,c1,c2,c3];

    // Dense Blackwood Forest Corridors & natural cliff crags channeling the rescue trail!
    const passes=[{x:-54,z:46,r:11},{x:-2,z:24,r:12},{x:24,z:-24,r:11},{x:-24,z:-44,r:11}];
    const keep=[{x:c0.x,z:c0.z,r:18},{x:c1.x,z:c1.z,r:18},{x:c2.x,z:c2.z,r:24},{x:c3.x,z:c3.z,r:22}];
    addDenseForestBelt(sim,{x:-half+10,z:10},{x:half-10,z:-48},{step:2.6,thickness:3,passes,keepClear:keep,seedOffset:1301});
    addCliffRidge(sim,{x:-66,z:18},{x:-42,z:4},{step:3.8,width:1,radius:2.9,height:4.1,wobble:1.8,passes,keepClear:keep,seedOffset:1302});
    addCliffRidge(sim,{x:36,z:16},{x:74,z:6},{step:3.8,width:1,radius:3.0,height:4.3,wobble:1.8,passes,keepClear:keep,seedOffset:1303});

    // Player's Heroic Rescue Vanguard (NO Town Center yet!)
    const king=placeUnit(sim,'king',0,c0.x,c0.z);
    if(king)king.displayName='Sovereign Bannerlord';
    for(let i=0;i<4;i++)placeUnit(sim,'knight',0,c0.x+4+i*2.5,c0.z-4);
    for(let i=0;i<5;i++)placeUnit(sim,'swordsman',0,c0.x-4+i*2.5,c0.z-8);
    for(let i=0;i<5;i++)placeUnit(sim,'archer',0,c0.x-5+i*2.5,c0.z+5);
    placeUnit(sim,'monk',0,c0.x-3,c0.z+2);placeUnit(sim,'monk',0,c0.x+3,c0.z+2);

    // Forest Trail Ambush Patrol (between c0 and Oakhold)
    for(let i=0;i<4;i++)placeUnit(sim,i%2?'spearman':'archer',1,-54+i*2.8,44-i*1.8);

    // Besieged Walled Village of Oakhold (Owner 3 initially -> Transfers to Owner 0 when Raiders fall!)
    placeBuilding(sim,'towncenter',3,c3.x,c3.z,true);
    placeBuilding(sim,'barracks',3,c3.x-10,c3.z+8,true);
    placeBuilding(sim,'mill',3,c3.x-10,c3.z-8,true);
    placeBuilding(sim,'house',3,c3.x+10,c3.z-10,true);
    placeBuilding(sim,'house',3,c3.x+10,c3.z+10,true);
    placeBuilding(sim,'farm',3,c3.x-12,c3.z,true);
    placeBuilding(sim,'farm',3,c3.x,c3.z-12,true);
    placeBuilding(sim,'farm',3,c3.x,c3.z+12,true);
    buildWalledCitadel(sim,3,c3,{radius:17,gates:['south','east','north'],towers:false,complete:true});
    placeBuilding(sim,'tower',3,c3.x+11,c3.z+2,true);
    for(let i=0;i<10;i++)placeUnit(sim,'villager',3,c3.x-4+(i%5)*2.5,c3.z+4+Math.floor(i/5)*2.5);

    // Enemy 1: Oakhold Raider Camp besieging the town
    placeBuilding(sim,'barracks',1,c1.x,c1.z,true);
    placeBuilding(sim,'tower',1,c1.x-8,c1.z-6,true);
    placeBuilding(sim,'house',1,c1.x+8,c1.z+6,true);
    for(let i=0;i<6;i++)placeUnit(sim,i%3===0?'archer':'spearman',1,c1.x-10+(i%3)*3,c1.z-10+Math.floor(i/3)*3);

    // Enemy 2: High Warlord Malrik's Fortified Northern Blackwood Citadel
    placeBuilding(sim,'towncenter',2,c2.x,c2.z,true);
    placeBuilding(sim,'keep',2,c2.x-8,c2.z+6,true);
    placeBuilding(sim,'barracks',2,c2.x+10,c2.z+10,true);
    placeBuilding(sim,'stable',2,c2.x-12,c2.z-8,true);
    placeBuilding(sim,'range',2,c2.x+12,c2.z-8,true);
    placeBuilding(sim,'blacksmith',2,c2.x,c2.z-12,true);
    placeBuilding(sim,'house',2,c2.x+13,c2.z+2,true);
    placeBuilding(sim,'house',2,c2.x-13,c2.z+2,true);
    placeBuilding(sim,'mill',2,c2.x,c2.z+13,true);
    buildWalledCitadel(sim,2,c2,{radius:19,gates:['south','west'],towers:true,complete:true});
    for(let i=0;i<12;i++)placeUnit(sim,'villager',2,c2.x-5+(i%4)*3,c2.z-4+Math.floor(i/4)*3);
    for(let i=0;i<8;i++)placeUnit(sim,i%2?'knight':'swordsman',2,c2.x-8+(i%4)*4,c2.z+23+Math.floor(i/4)*3);

    seedBaseDeposits(sim,c3,131);seedBaseDeposits(sim,c2,132);
  }else if(mode==='campaign14'){
    // CROWN OF THREE KINGDOMS — Grand 2v2 Imperial Coalition Finale across Rivers, Bridges & Cliffs!
    const c0={x:-76,z:54},c1={x:76,z:52},c2={x:76,z:-56},c3={x:-74,z:-56};
    sim.players=[
      {...sim.makePlayer(playerFaction),name:'Your Royal Army',team:1,age:2,controller:'human',slotNumber:1,color:PLAYER_COLORS[0],start:c0,resources:{food:1100,wood:1100,gold:750,stone:700},defeated:false},
      makeScenarioPlayer(sim,{name:'Sunward Usurper',faction:'sun',team:2,age:2,difficulty:diff,aiPersonality:'boomer',colorIndex:1,start:c1,resources:{food:1000,wood:1000,gold:700,stone:550}}),
      makeScenarioPlayer(sim,{name:'Raven Warlord',faction:'raven',team:2,age:2,difficulty:diff,aiPersonality:'rusher',colorIndex:2,start:c2,resources:{food:1000,wood:1000,gold:700,stone:550}}),
      makeScenarioPlayer(sim,{name:'Queen Maren (Ally)',faction:'alder',team:1,age:2,difficulty:diff,aiPersonality:'rusher',colorIndex:3,start:c3,resources:{food:1050,wood:1050,gold:700,stone:550}}),
    ];
    sim.spawnPositions=[c0,c1,c2,c3];

    // Natural flanking rock ridges guiding coalition fights over the Twin Rivers bridges
    const keep=[{x:c0.x,z:c0.z,r:24},{x:c1.x,z:c1.z,r:24},{x:c2.x,z:c2.z,r:24},{x:c3.x,z:c3.z,r:24},{x:-22,z:0,r:16},{x:22,z:0,r:16}];
    addCliffRidge(sim,{x:-12,z:-92},{x:12,z:-64},{step:4.0,width:1,radius:3.0,height:4.5,wobble:2.0,keepClear:keep,seedOffset:1401});
    addCliffRidge(sim,{x:-12,z:64},{x:12,z:92},{step:4.0,width:1,radius:3.0,height:4.5,wobble:2.0,keepClear:keep,seedOffset:1402});

    // Helper to stamp a full walled Castle-Age Coalition Citadel for each of the 4 Kingdoms
    const buildCitadel=(owner,center,gates,armyTypes)=>{
      placeBuilding(sim,'towncenter',owner,center.x,center.z,true);
      placeBuilding(sim,'keep',owner,center.x+(center.x<0?7:-7),center.z+(center.z<0?7:-7),true);
      placeBuilding(sim,'barracks',owner,center.x-10,center.z+9,true);
      placeBuilding(sim,'range',owner,center.x+10,center.z-9,true);
      placeBuilding(sim,'stable',owner,center.x-10,center.z-9,true);
      placeBuilding(sim,'blacksmith',owner,center.x+10,center.z+9,true);
      placeBuilding(sim,'house',owner,center.x,center.z-13,true);
      placeBuilding(sim,'house',owner,center.x,center.z+13,true);
      placeBuilding(sim,'mill',owner,center.x+(center.x<0?-13:13),center.z,true);
      buildWalledCitadel(sim,owner,center,{radius:19,gates,towers:true,complete:true});
      for(let i=0;i<12;i++)placeUnit(sim,'villager',owner,center.x-5+(i%4)*3,center.z-4+Math.floor(i/4)*2.8);
      armyTypes.forEach((t,i)=>placeUnit(sim,t,owner,center.x+(center.x<0?23:-23),center.z-8+i*3));
      seedBaseDeposits(sim,center,1410+owner);
    };

    buildCitadel(0,c0,['east','north'],['knight','knight','swordsman','swordsman','archer','archer','monk','scout']);
    buildCitadel(3,c3,['east','south'],['knight','knight','swordsman','swordsman','archer','archer','monk']);
    buildCitadel(1,c1,['west','north'],['marksman','marksman','swordsman','swordsman','knight','knight','ram']);
    buildCitadel(2,c2,['west','south'],['outrider','outrider','knight','knight','spearman','spearman','ram']);
  }

  // Natural starting forests & wilderness deposits across the sprawling 240x240 realm
  plantStartingForests(sim);
  groupFieldForests(sim);
  const rng=seededRandom((sim.options.seed||2026)+9911);
  for(let i=0;i<140;i++){
    const x=(rng()-.5)*(sim.worldSize-18),z=(rng()-.5)*(sim.worldSize-18);
    if(sim.isWater(x,z)||sim.barriers.some(b=>Math.hypot(b.x-x,b.z-z)<b.r+3))continue;
    if(sim.entities.some(e=>e.hp>0&&(e.kind==='building'&&Math.hypot(e.x-x,e.z-z)<e.r+6||e.kind==='resource'&&Math.hypot(e.x-x,e.z-z)<2.4)))continue;
    const type=i%15===0?'gold':i%19===0?'stone':i%11===0?'food':'wood';
    sim.addNaturalResource(type,x,z,type==='wood'?280:type==='food'?380:2200);
  }
  for(let owner=0;owner<sim.players.length;owner++){
    if(!sim.players[owner].dormant)sim.assignEconomy(owner);
  }
  sim.startingSites=sim.entities.filter(e=>e.kind==='building'&&e.owner>=0&&!['wall','gate','tower','farm'].includes(e.type)).map(({x,z,r,owner,type})=>({x,z,r,owner,type}));
  sim.updateFog();
}

/**
 * Dynamic mid-mission map-expanding script trigger for Chapter XI:
 * Western Allied Relief breaks through the cliff pass, builds an Allied Forward Base,
 * activates Player 3's AI, and charges the encircling enemy camps!
 */
export function triggerWesternReliefArrival(sim){
  const ally=sim.players[3];
  if(!ally||!ally.dormant)return false;
  ally.dormant=false;
  const base=ally.start||{x:-84,z:10};
  placeBuilding(sim,'towncenter',3,base.x,base.z,true);
  placeBuilding(sim,'barracks',3,base.x+12,base.z-8,true);
  placeBuilding(sim,'stable',3,base.x+12,base.z+8,true);
  placeBuilding(sim,'tower',3,base.x+18,base.z,true);
  placeBuilding(sim,'house',3,base.x-10,base.z-10,true);
  placeBuilding(sim,'house',3,base.x-10,base.z+10,true);
  for(let i=0;i<6;i++)placeUnit(sim,'villager',3,base.x-4+(i%3)*3,base.z+6+Math.floor(i/3)*3);
  const vanguard=[];
  for(let i=0;i<6;i++){const u=placeUnit(sim,'knight',3,base.x+20+(i%3)*3,base.z-6+Math.floor(i/3)*3);if(u)vanguard.push(u.id);}
  for(let i=0;i<4;i++){const u=placeUnit(sim,'archer',3,base.x+20+i*2.5,base.z+6);if(u)vanguard.push(u.id);}
  if(vanguard.length)sim.command(vanguard,{type:'attackmove',x:-26,z:0});
  sim.assignEconomy(3);
  sim.revision++;
  sim.updateFog();
  return true;
}

/**
 * Dynamic mid-mission rescue trigger for Chapter XIII (Warcraft III / Joan of Arc style):
 * Transfers the entire besieged walled town of Oakhold (buildings + villagers) from Player 3
 * directly to Player 0's command, expanding the player's kingdom across the map!
 */
export function triggerOakholdLiberation(sim){
  const village=sim.players[3];
  if(!village||village.liberated)return false;
  village.liberated=true;
  village.dormant=true;
  village.defeated=true;
  for(const e of sim.entities){
    if(e.hp>0&&e.owner===3){
      e.owner=0;
      if(e.kind==='unit'&&e.type==='villager')sim.assignWorker(e);
    }
  }
  // Reward loyal garrison militia & supplies inside Oakhold
  const tc=sim.owned(0,'building','towncenter')[0];
  if(tc){
    for(let i=0;i<4;i++)placeUnit(sim,'spearman',0,tc.x+8+i*2.2,tc.z-8);
    sim.players[0].resources.food+=250;
    sim.players[0].resources.wood+=250;
    sim.players[0].resources.gold+=150;
  }
  sim.revision++;
  sim.updateFog();
  return true;
}

/** Main entry point called during Simulation initialization for every campaign mission. */
export function applyCampaignScenario(sim){
  if(!sim.mission)return;
  if(sim.mission.actFour)buildActFourScenario(sim);
  else applyClassicChapterArchitecture(sim);
}
