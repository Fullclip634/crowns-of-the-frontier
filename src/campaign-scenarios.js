import {BUILDINGS,seededRandom} from './data.js';
import {PLAYER_COLORS} from './custom-battle.js';
import {addNaturalBarrier,addCliffRidge,addCurvedCliffChain,addMountainMassif,addDenseForestBelt,buildNaturalFortifiedBase,buildWoodlandGladePocket,connectCliffPassWall,scatterBiomeCliffs} from './terrain-barriers.js';
import {plantStartingForests} from './starting-forests.js';
import {groupFieldForests} from './field-forests.js';

const clamp=(v,lo,hi)=>Math.max(lo,Math.min(hi,v));

/** Safely places a handcrafted scenario building with clean spacing, clearing stray overlapping resources. */
function placeBuilding(sim,type,owner,x,z,complete=true,layout){
  const def=BUILDINGS[type];
  if(!def)return null;
  const limit=sim.halfWorld-(def.r||2)-2.5;
  if(Math.abs(x)>limit||Math.abs(z)>limit||sim.isWater(x,z))return null;
  if(sim.barriers?.some(b=>Math.hypot(b.x-x,b.z-z)<b.r+(def.r||2)+.5))return null;
  for(const e of sim.entities){
    if(e.hp>0&&e.kind==='resource'&&!e.water&&Math.hypot(e.x-x,e.z-z)<(def.r||2)+e.r+1.4)e.hp=0;
  }
  if(sim.entities.some(e=>e.hp>0&&e.kind==='building'&&Math.hypot(e.x-x,e.z-z)<Math.max(2.0,(def.r||2)+e.r-.3)))return null;
  return sim.addBuilding(type,owner,x,z,complete,layout);
}

/** Safely places a handcrafted scenario unit on dry navigable ground. */
function placeUnit(sim,type,owner,x,z){
  const limit=sim.halfWorld-3;
  const cx=clamp(x,-limit,limit),cz=clamp(z,-limit,limit);
  if(sim.isWater(cx,cz))return null;
  return sim.addUnit(type,owner,cx,cz);
}

/** Plants local outer resource clusters for open/unwalled bases. */
function seedBaseDeposits(sim,center,seedSalt=0){
  const rng=seededRandom((sim.options.seed||2026)+seedSalt);
  const clusters=[[-20,18,'food',5],[18,-20,'gold',4],[-22,-10,'stone',4],[22,18,'wood',8]];
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
 * Enhances all 10 classic Chapters (I–X) with Blender-sculpted sheer cliffs,
 * alpine mountain shoulders, forest chokepoints, and short human-crafted walls
 * tied directly into natural rock barriers (leaving test pads & caravan lanes clear).
 */
function applyClassicChapterArchitecture(sim){
  const mode=sim.options.mode;
  const p0=sim.owned(0,'building','towncenter')[0]||{x:-104,z:86};
  const p1=sim.owned(1,'building','towncenter')[0]||{x:106,z:-90};
  const h=sim.halfWorld;
  const pad0={x:p0.x+3,z:p0.z+19,r:12};
  const testKeep=[pad0,{x:p0.x,z:p0.z,r:34},{x:p1.x,z:p1.z,r:34}];

  if(mode==='campaign1'){
    // Frontier Foothold (320x320, ~274m apart): Lush AoE4 sunlit woodland glades + mossy granite bluffs + distant raider settlement!
    buildWoodlandGladePocket(sim,p0,{gladeRadius:38,passes:3,keepClear:[pad0,{x:p1.x,z:p1.z,r:36}],seedOffset:101,includeResources:false});
    buildWoodlandGladePocket(sim,p1,{gladeRadius:34,passes:3,keepClear:[{x:p0.x,z:p0.z,r:38}],seedOffset:103,includeResources:false});
    // Sweeping wilderness forest belts & mossy granite bluffs across the wide 274m frontier!
    const midKeep=[{x:p0.x,z:p0.z,r:40},{x:p1.x,z:p1.z,r:36},pad0,{x:0,z:0,r:18}];
    const midPasses=[{x:0,z:0,r:16},{x:-48,z:-42,r:14},{x:48,z:42,r:14}];
    addDenseForestBelt(sim,{x:-h*.86,z:-h*.76},{x:-h*.20,z:-h*.24},{step:2.6,thickness:3,passes:midPasses,keepClear:midKeep,seedOffset:107});
    addDenseForestBelt(sim,{x:h*.20,z:h*.24},{x:h*.86,z:h*.76},{step:2.6,thickness:3,passes:midPasses,keepClear:midKeep,seedOffset:109});
    scatterBiomeCliffs(sim,{count:6,ridgeLen:26,withMassifs:true,keepClear:midKeep,passes:midPasses,seedOffset:105});
    for(const [bx,bz] of [[p0.x-17,p0.z+12],[p0.x-19,p0.z+10],[p0.x-15,p0.z+14]])if(!sim.isWater(bx,bz))sim.addNaturalResource('food',bx,bz,320);
  }else if(mode==='campaign2'){
    // The Broken Crossing (320x320, ~261m apart): Safe eastern bridgehead + distant northeastern garrison
    const bridgeKeep=[...testKeep,{x:0,z:0,r:18},{x:-20,z:12,r:14},{x:20,z:-8,r:15},{x:-74,z:48,r:12}];
    placeBuilding(sim,'tower',0,-20,12,true);
    placeBuilding(sim,'tower',1,p1.x-22,p1.z+18,true);
    addCliffRidge(sim,{x:-134,z:-92},{x:-42,z:-66},{step:4.0,width:1,radius:3.1,height:4.6,wobble:1.8,keepClear:bridgeKeep,seedOffset:201,foothillTrees:true});
    addCliffRidge(sim,{x:42,z:66},{x:134,z:92},{step:4.0,width:1,radius:3.1,height:4.6,wobble:1.8,keepClear:bridgeKeep,seedOffset:202,foothillTrees:true});
    scatterBiomeCliffs(sim,{count:4,ridgeLen:24,withMassifs:true,keepClear:bridgeKeep,seedOffset:205});
  }else if(mode==='campaign3'){
    // A Crown of Stone (320x320): Huge spacious Iron Ridge plateau (~78m x 78m buildable yard!)
    // backed by western/southern highlands with short cliff-to-cliff walls across North & East mountain passes!
    const ridgeKeep=[...testKeep,pad0];
    addCliffRidge(sim,{x:p0.x-50,z:p0.z-38},{x:p0.x-14,z:p0.z-36},{step:3.6,width:1,radius:3.2,height:4.8,wobble:1.6,keepClear:ridgeKeep,seedOffset:301,foothillTrees:true});
    addCliffRidge(sim,{x:p0.x+14,z:p0.z-36},{x:p0.x+38,z:p0.z-18},{step:3.6,width:1,radius:3.2,height:4.8,wobble:1.4,keepClear:ridgeKeep,seedOffset:303,foothillTrees:true});
    addCliffRidge(sim,{x:p0.x+38,z:p0.z+14},{x:p0.x+56,z:p0.z+54},{step:3.6,width:1,radius:3.2,height:4.8,wobble:1.8,keepClear:ridgeKeep,seedOffset:302,foothillTrees:true});
    connectCliffPassWall(sim,0,{x:p0.x-12,z:p0.z-36},{x:p0.x+12,z:p0.z-36},p0,{complete:true,withGate:true,withTower:true});
    connectCliffPassWall(sim,0,{x:p0.x+38,z:p0.z-16},{x:p0.x+38,z:p0.z+12},p0,{complete:true,withGate:true,withTower:true});
    placeBuilding(sim,'blacksmith',0,p0.x-18,p0.z-2,true);
    scatterBiomeCliffs(sim,{count:6,ridgeLen:28,withMassifs:true,keepClear:[...ridgeKeep,{x:p0.x,z:p0.z,r:52}],seedOffset:308});
  }else if(mode==='campaign4'){
    // Keepers of the Valley (320x320, ~274m apart): Broad shrine valley divided by natural granite ridges
    const shrines=sim.entities.filter(e=>e.kind==='shrine').map(s=>({x:s.x,z:s.z,r:16}));
    const shrineKeep=[...testKeep,...shrines];
    addCliffRidge(sim,{x:-134,z:-16},{x:-66,z:-12},{step:3.8,width:1,radius:3.1,height:4.6,wobble:1.8,keepClear:shrineKeep,seedOffset:401,foothillTrees:true});
    addCliffRidge(sim,{x:66,z:12},{x:134,z:16},{step:3.8,width:1,radius:3.1,height:4.6,wobble:1.8,keepClear:shrineKeep,seedOffset:402,foothillTrees:true});
    scatterBiomeCliffs(sim,{count:6,ridgeLen:26,withMassifs:true,keepClear:shrineKeep,seedOffset:405});
    placeBuilding(sim,'tower',0,p0.x+22,p0.z-18,true);
    placeBuilding(sim,'tower',1,p1.x-22,p1.z+18,true);
    placeBuilding(sim,'stable',0,p0.x-18,p0.z-10,true);
  }else if(mode==='campaign5'){
    // The Final Siege (320x320, ~274m apart): Huge spacious southern staging territory vs Draven's distant walled highland capital
    const gate=sim.owned(1,'building','gate')[0]||{x:p1.x-4,z:p1.z+29};
    const siegeKeep=[...testKeep,{x:gate.x,z:gate.z,r:16}];
    placeBuilding(sim,'tower',0,p0.x+22,p0.z-16,true);
    placeBuilding(sim,'tower',0,p0.x-10,p0.z-18,true);
    placeBuilding(sim,'stable',0,p0.x-18,p0.z-4,true);
    placeBuilding(sim,'blacksmith',0,p0.x-16,p0.z-16,true);
    placeBuilding(sim,'monastery',0,p0.x+20,p0.z+12,true);
    // Natural granite cliff shoulders extending out from Draven's distant capital curtain wall
    addCliffRidge(sim,{x:gate.x-54,z:gate.z-4},{x:gate.x-24,z:gate.z-2},{step:3.5,width:1,radius:3.1,height:4.9,wobble:1.4,keepClear:siegeKeep,seedOffset:501,foothillTrees:true});
    placeBuilding(sim,'tower',1,gate.x-9,gate.z-4,true);
    placeBuilding(sim,'tower',1,gate.x+9,gate.z-4,true);
    placeBuilding(sim,'workshop',1,p1.x+18,p1.z+12,true);
    for(let z=p1.z-4;z<=gate.z-4;z+=3)placeBuilding(sim,'wall',1,gate.x-21,z,true,{angle:Math.PI/2});
    scatterBiomeCliffs(sim,{count:6,ridgeLen:28,withMassifs:true,keepClear:siegeKeep,seedOffset:509});
  }else if(mode==='campaign6'){
    // Beyond the Horizon (320x320, ~261m apart): Wide coastal plains & harbor headlands across the sea
    placeBuilding(sim,'tower',0,-28,46,true);
    placeBuilding(sim,'tower',0,-28,70,true);
    placeBuilding(sim,'tower',1,28,-46,true);
    placeBuilding(sim,'tower',1,28,-70,true);
    placeBuilding(sim,'keep',1,p1.x+12,p1.z-14,true);
    addMountainMassif(sim,-124,-44,{radius:16,peaks:4,keepClear:testKeep,seedOffset:601});
    addMountainMassif(sim,124,44,{radius:16,peaks:4,keepClear:testKeep,seedOffset:602});
  }else if(mode==='campaign7'){
    // The Ember Road (320x320, ~274m apart): Massive volcanic basalt ranges carving the central Ash Pass (0,0)
    const passKeep=[...testKeep,{x:0,z:0,r:16},{x:p1.x-12,z:p1.z+10,r:14}];
    addCurvedCliffChain(sim,[{x:-148,z:-128},{x:-72,z:-60},{x:-16,z:-16}],{step:3.5,width:2,radius:3.2,height:5.1,wobble:2.4,passes:[{x:0,z:0,r:14}],keepClear:passKeep,seedOffset:701});
    addCurvedCliffChain(sim,[{x:16,z:16},{x:72,z:60},{x:148,z:128}],{step:3.5,width:2,radius:3.2,height:5.1,wobble:2.4,passes:[{x:0,z:0,r:14}],keepClear:passKeep,seedOffset:702});
    scatterBiomeCliffs(sim,{count:6,ridgeLen:28,withMassifs:true,keepClear:passKeep,passes:[{x:0,z:0,r:16}],seedOffset:705});
    placeBuilding(sim,'tower',0,p0.x+22,p0.z-18,true);
    placeBuilding(sim,'tower',1,p1.x-22,p1.z+18,true);
    placeBuilding(sim,'keep',1,p1.x+12,p1.z-14,true);
    connectCliffPassWall(sim,1,{x:p1.x-16,z:p1.z+22},{x:p1.x+14,z:p1.z+22},p1,{complete:true,withGate:true,withTower:false});
  }else if(mode==='campaign8'){
    // The Deepwood Oath (320x320, ~274m apart): Sprawling sunlit woodland glade & Blackwood forest tracts
    const woodKeep=[...testKeep,{x:p0.x+22,z:p0.z+10,r:12},{x:0,z:0,r:14},{x:p1.x-12,z:p1.z+10,r:14}];
    const passes=[{x:0,z:0,r:12},{x:-58,z:-48,r:12},{x:58,z:48,r:12}];
    buildWoodlandGladePocket(sim,p0,{gladeRadius:36,passes:3,keepClear:[pad0,{x:p1.x,z:p1.z,r:36}],seedOffset:803,includeResources:false});
    addDenseForestBelt(sim,{x:-146,z:-126},{x:146,z:126},{step:2.5,thickness:4,passes,keepClear:woodKeep,seedOffset:801});
    scatterBiomeCliffs(sim,{count:6,ridgeLen:26,withMassifs:true,keepClear:woodKeep,passes,seedOffset:805});
    placeBuilding(sim,'tower',1,p1.x-22,p1.z+18,true);
    connectCliffPassWall(sim,1,{x:p1.x-16,z:p1.z+20},{x:p1.x+14,z:p1.z+20},p1,{complete:true,withGate:true,withTower:false});
  }else if(mode==='campaign9'){
    // The Long Night (320x320, ~274m apart): Grand spacious snow-mountain valley cove (radius 38m!) with massive buildable interior!
    buildNaturalFortifiedBase(sim,0,{x:p0.x,z:p0.z},{radius:38,gates:['north','east'],towers:true,complete:true,includeResources:true,keepClear:[pad0,{x:p1.x,z:p1.z,r:36}],seedOffset:901,backToBorder:true});
    placeBuilding(sim,'blacksmith',0,p0.x-16,p0.z+10,true);
    scatterBiomeCliffs(sim,{count:8,ridgeLen:28,withMassifs:true,keepClear:[{x:p0.x,z:p0.z,r:46},{x:p1.x,z:p1.z,r:36}],seedOffset:905});
    placeBuilding(sim,'workshop',1,p1.x-18,p1.z+18,true);
    placeBuilding(sim,'tower',1,p1.x-22,p1.z+12,true);
  }else if(mode==='campaign10'){
    // The Last Claim (320x320, ~274m apart): Huge spacious mountain-backed valley citadels (radius 38m!) across a wide highland continent
    const summitKeep=[{x:p0.x,z:p0.z,r:46},{x:p1.x,z:p1.z,r:46},{x:0,z:0,r:22},pad0];
    buildNaturalFortifiedBase(sim,0,{x:p0.x,z:p0.z},{radius:38,gates:['north','east'],towers:true,complete:true,includeResources:true,keepClear:[{x:p1.x,z:p1.z,r:46},{x:0,z:0,r:20}],seedOffset:1001,backToBorder:true});
    placeBuilding(sim,'stable',0,p0.x-16,p0.z+6,true);
    placeBuilding(sim,'blacksmith',0,p0.x+10,p0.z+16,true);
    scatterBiomeCliffs(sim,{count:8,ridgeLen:28,withMassifs:true,keepClear:summitKeep,passes:[{x:0,z:0,r:20}],seedOffset:1005});
    placeBuilding(sim,'keep',1,p1.x-6,p1.z-16,true);
    buildNaturalFortifiedBase(sim,1,{x:p1.x,z:p1.z},{radius:38,gates:['south','west'],towers:true,complete:true,includeResources:true,keepClear:[{x:p0.x,z:p0.z,r:46},{x:0,z:0,r:20}],seedOffset:1004,backToBorder:true});
  }
}

/**
 * Builds Act IV ("Legends of the Realm") sprawling 240x240 multi-kingdom scenarios using
 * spacious human-crafted natural cliff-and-forest fortified valleys where short walls
 * connect cliff-to-cliff and ALL starting resources sit safely INSIDE the perimeter.
 */
export function buildActFourScenario(sim){
  const mode=sim.options.mode;
  const playerFaction=sim.options.faction||'alder';
  const diff=sim.options.difficulty||'normal';
  const half=sim.halfWorld;

  sim.entities=[];
  sim.barriers=[];
  sim.nextId=1;
  sim.aiStates={};
  sim.teamAlarms={};
  sim.revealedOwners=[];

  if(mode==='campaign11'){
    // THE RING OF IRON (360x360 Grand Imperial Scale!) — Massive 46m highland citadel plateau + distant encircling warlords!
    const c0={x:0,z:0},c1={x:-14,z:-148},c2={x:148,z:8},c3={x:-148,z:14};
    sim.players=[
      {...sim.makePlayer(playerFaction),name:'Your Citadel',team:1,age:2,controller:'human',slotNumber:1,color:PLAYER_COLORS[0],start:c0,resources:{food:900,wood:950,gold:550,stone:550},defeated:false},
      makeScenarioPlayer(sim,{name:'Lord Korr (North)',faction:'raven',team:2,age:2,difficulty:diff,aiPersonality:'rusher',colorIndex:1,start:c1,resources:{food:750,wood:750,gold:450,stone:300}}),
      makeScenarioPlayer(sim,{name:'General Syra (East)',faction:'sun',team:2,age:2,difficulty:diff,aiPersonality:'balanced',colorIndex:2,start:c2,resources:{food:750,wood:750,gold:450,stone:300}}),
      makeScenarioPlayer(sim,{name:'Western Relief',faction:'alder',team:1,age:2,difficulty:diff,aiPersonality:'rusher',colorIndex:3,start:c3,resources:{food:950,wood:950,gold:650,stone:450},dormant:true}),
    ];
    sim.spawnPositions=[c0,c1,c2,c3];

    // Grand, Ultra-Spacious Medieval Citadel Districts inside a massive 46m highland plateau (huge open building room!)
    placeBuilding(sim,'towncenter',0,0,0,true);
    placeBuilding(sim,'keep',0,-16,-15,true);
    placeBuilding(sim,'barracks',0,16,-14,true);
    placeBuilding(sim,'range',0,18,10,true);
    placeBuilding(sim,'stable',0,-18,10,true);
    placeBuilding(sim,'blacksmith',0,0,-21,true);
    placeBuilding(sim,'market',0,-22,-2,true);
    placeBuilding(sim,'monastery',0,21,-2,true);
    placeBuilding(sim,'mill',0,0,17,true);
    placeBuilding(sim,'house',0,-13,-31,true);
    placeBuilding(sim,'house',0,13,-31,true);
    placeBuilding(sim,'house',0,-30,8,true);
    placeBuilding(sim,'house',0,30,-8,true);
    for(const [fx,fz] of [[-10,23],[10,23],[-10,29],[10,29]])placeBuilding(sim,'farm',0,fx,fz,true);

    // Organic Continent-Wide Highland Mountain Crossroads (360x360):
    // Four massive branching mountain ranges + dense alpine forest belts sweep across all 4 quadrants!
    const outerKeep=[{x:c1.x,z:c1.z,r:34},{x:c2.x,z:c2.z,r:34},{x:c3.x,z:c3.z,r:34},{x:8,z:134,r:24}];
    buildNaturalFortifiedBase(sim,0,c0,{
      radius:46,
      gates:['north','east','south','west'],
      towers:true,
      complete:true,
      wallGaps:true,
      includeResources:true,
      keepClear:outerKeep,
      seedOffset:1100,
      backToBorder:false,
    });
    for(let i=0;i<14;i++)placeUnit(sim,'villager',0,-8+(i%5)*4.0,6+Math.floor(i/5)*3.0);
    for(let i=0;i<4;i++)placeUnit(sim,'knight',0,-6+i*4,-36);
    for(let i=0;i<4;i++)placeUnit(sim,'swordsman',0,36,-6+i*4);
    for(let i=0;i<4;i++)placeUnit(sim,'archer',0,-6+i*4,36);
    placeUnit(sim,'monk',0,-5,-8);placeUnit(sim,'monk',0,5,-8);

    // Outer Alpine Border Headlands & Ancient Forests framing the wider 360x360 province
    const borderKeep=[{x:0,z:0,r:56},...outerKeep];
    addMountainMassif(sim,-158,-152,{radius:18,peaks:5,keepClear:borderKeep,seedOffset:1101});
    addMountainMassif(sim,158,-152,{radius:18,peaks:5,keepClear:borderKeep,seedOffset:1102});
    addMountainMassif(sim,158,152,{radius:18,peaks:5,keepClear:borderKeep,seedOffset:1103});
    addMountainMassif(sim,-158,152,{radius:18,peaks:5,keepClear:borderKeep,seedOffset:1104});
    addDenseForestBelt(sim,{x:-164,z:-86},{x:-92,z:-64},{step:2.6,thickness:3,keepClear:borderKeep,seedOffset:1105});
    addDenseForestBelt(sim,{x:92,z:-64},{x:164,z:-86},{step:2.6,thickness:3,keepClear:borderKeep,seedOffset:1106});
    addDenseForestBelt(sim,{x:92,z:70},{x:164,z:90},{step:2.6,thickness:3,keepClear:borderKeep,seedOffset:1107});
    addDenseForestBelt(sim,{x:-164,z:90},{x:-92,z:70},{step:2.6,thickness:3,keepClear:borderKeep,seedOffset:1108});

    // Enemy 1: Lord Korr's Distant Northern Siege Camp
    placeBuilding(sim,'towncenter',1,c1.x,c1.z,true);
    placeBuilding(sim,'barracks',1,c1.x-15,c1.z+10,true);
    placeBuilding(sim,'workshop',1,c1.x+15,c1.z+11,true);
    placeBuilding(sim,'tower',1,c1.x-12,c1.z+22,true);
    placeBuilding(sim,'tower',1,c1.x+12,c1.z+22,true);
    placeBuilding(sim,'house',1,c1.x-16,c1.z-10,true);
    placeBuilding(sim,'house',1,c1.x+16,c1.z-10,true);
    placeBuilding(sim,'mill',1,c1.x,c1.z-14,true);
    for(let i=0;i<10;i++)placeUnit(sim,'villager',1,c1.x-8+(i%5)*3,c1.z-6+Math.floor(i/5)*3);
    for(let i=0;i<6;i++)placeUnit(sim,i%2?'swordsman':'spearman',1,c1.x-8+i*3,c1.z+26);
    placeUnit(sim,'ram',1,c1.x,c1.z+28);

    // Enemy 2: General Syra's Distant Eastern Raider Hold
    placeBuilding(sim,'towncenter',2,c2.x,c2.z,true);
    placeBuilding(sim,'stable',2,c2.x-15,c2.z-10,true);
    placeBuilding(sim,'range',2,c2.x-15,c2.z+11,true);
    placeBuilding(sim,'tower',2,c2.x-22,c2.z-11,true);
    placeBuilding(sim,'tower',2,c2.x-22,c2.z+11,true);
    placeBuilding(sim,'house',2,c2.x+15,c2.z-11,true);
    placeBuilding(sim,'house',2,c2.x+15,c2.z+11,true);
    placeBuilding(sim,'mill',2,c2.x+15,c2.z,true);
    for(let i=0;i<10;i++)placeUnit(sim,'villager',2,c2.x+6+(i%5)*2.5,c2.z-6+Math.floor(i/5)*3);
    for(let i=0;i<6;i++)placeUnit(sim,i%2?'knight':'archer',2,c2.x-26,c2.z-10+i*4);

    // Southern Forward Encirclement Outpost (far across the southern plain)
    placeBuilding(sim,'barracks',1,8,134,true);
    placeBuilding(sim,'tower',1,-2,122,true);
    placeBuilding(sim,'tower',1,18,122,true);
    for(let i=0;i<5;i++)placeUnit(sim,i%2?'spearman':'archer',1,-4+i*3.5,116);

    seedBaseDeposits(sim,c1,112);seedBaseDeposits(sim,c2,113);seedBaseDeposits(sim,c3,114);
  }else if(mode==='campaign12'){
    // THE SUNDERED PASS (360x360) — Towering Continental Mountain Range + Lush Sunlit Western Glade + Distant Eastern Empire!
    const c0={x:-130,z:96},c1={x:36,z:-6},c2={x:138,z:-66},c3={x:-124,z:-104};
    sim.players=[
      {...sim.makePlayer(playerFaction),name:'Your Stronghold',team:1,age:2,controller:'human',slotNumber:1,color:PLAYER_COLORS[0],start:c0,resources:{food:850,wood:900,gold:500,stone:650},defeated:false},
      makeScenarioPlayer(sim,{name:'Pass Fortress',faction:'alder',team:2,age:2,difficulty:diff,aiPersonality:'turtle',colorIndex:1,start:c1,resources:{food:650,wood:650,gold:400,stone:450}}),
      makeScenarioPlayer(sim,{name:'Eastern Empire',faction:'sun',team:2,age:2,difficulty:diff,aiPersonality:'boomer',colorIndex:2,start:c2,resources:{food:900,wood:900,gold:600,stone:450}}),
      makeScenarioPlayer(sim,{name:'Northern Ally',faction:'alder',team:1,age:2,difficulty:diff,aiPersonality:'turtle',colorIndex:3,start:c3,resources:{food:850,wood:850,gold:500,stone:450}}),
    ];
    sim.spawnPositions=[c0,c1,c2,c3];

    const passes=[{x:-12,z:-104,r:12},{x:-12,z:0,r:12},{x:-12,z:96,r:12}];
    const keep=[{x:c0.x,z:c0.z,r:40},{x:c1.x,z:c1.z,r:34},{x:c2.x,z:c2.z,r:40},{x:c3.x,z:c3.z,r:40}];
    addCurvedCliffChain(sim,[{x:-14,z:-half+8},{x:-10,z:-52},{x:-12,z:52},{x:-10,z:half-8}],{step:3.4,width:2,radius:3.3,height:5.3,wobble:3.0,passes,keepClear:keep,seedOffset:1201,foothillTrees:true});
    addCliffRidge(sim,{x:82,z:38},{x:90,z:half-10},{step:3.8,width:1,radius:3.1,height:4.7,wobble:2.2,passes:[{x:86,z:92,r:13}],keepClear:keep,seedOffset:1202,foothillTrees:true});

    // Player Western Stronghold inside a HUGE sunlit woodland glade (seal narrow trails with minimal walls!)
    placeBuilding(sim,'towncenter',0,c0.x,c0.z,true);
    placeBuilding(sim,'barracks',0,c0.x+16,c0.z-8,true);
    placeBuilding(sim,'range',0,c0.x+16,c0.z+12,true);
    placeBuilding(sim,'blacksmith',0,c0.x-15,c0.z-10,true);
    placeBuilding(sim,'mill',0,c0.x-15,c0.z+10,true);
    placeBuilding(sim,'house',0,c0.x-18,c0.z,true);
    placeBuilding(sim,'house',0,c0.x,c0.z+18,true);
    placeBuilding(sim,'house',0,c0.x,c0.z-17,true);
    placeBuilding(sim,'tower',0,-38,94,true);
    buildWoodlandGladePocket(sim,c0,{gladeRadius:38,passes:3,keepClear:[{x:-38,z:94,r:12}],seedOffset:1209,includeResources:true});
    for(let i=0;i<12;i++)placeUnit(sim,'villager',0,c0.x-6+(i%4)*3.2,c0.z+21+Math.floor(i/4)*2.6);
    for(let i=0;i<8;i++)placeUnit(sim,i%3===0?'archer':'spearman',0,-42+(i%4)*3,88+Math.floor(i/4)*3);
    placeUnit(sim,'scout',0,-40,12);

    // Active Allied Northern Border Garrison inside a spacious forested mountain cove!
    placeBuilding(sim,'towncenter',3,c3.x,c3.z,true);
    placeBuilding(sim,'barracks',3,c3.x+13,c3.z+10,true);
    placeBuilding(sim,'stable',3,c3.x-13,c3.z+10,true);
    placeBuilding(sim,'house',3,c3.x-14,c3.z-12,true);
    placeBuilding(sim,'house',3,c3.x+14,c3.z-12,true);
    placeBuilding(sim,'mill',3,c3.x,c3.z-14,true);
    buildNaturalFortifiedBase(sim,3,c3,{radius:35,gates:['east','south'],towers:true,complete:true,includeResources:true,keepClear:[{x:c0.x,z:c0.z,r:40},{x:c1.x,z:c1.z,r:34}],seedOffset:1203,backToBorder:true});
    for(let i=0;i<10;i++)placeUnit(sim,'villager',3,c3.x-4+(i%4)*2.8,c3.z+6+Math.floor(i/4)*2.8);
    for(let i=0;i<6;i++)placeUnit(sim,i%2?'swordsman':'archer',3,-38,-82+i*2.6);

    // Enemy 1: Central Mountain Gatehouse Fortress guarding the middle pass
    placeBuilding(sim,'towncenter',1,c1.x,c1.z,true);
    placeBuilding(sim,'keep',1,c1.x-14,c1.z,true);
    placeBuilding(sim,'barracks',1,c1.x+13,c1.z-12,true);
    placeBuilding(sim,'range',1,c1.x+13,c1.z+12,true);
    placeBuilding(sim,'house',1,c1.x+18,c1.z,true);
    buildNaturalFortifiedBase(sim,1,c1,{radius:32,gates:['west','east'],towers:true,complete:true,includeResources:true,keepClear:[{x:c0.x,z:c0.z,r:40},{x:c2.x,z:c2.z,r:40},{x:c3.x,z:c3.z,r:40}],seedOffset:1204,backToBorder:false});
    for(let i=0;i<8;i++)placeUnit(sim,'villager',1,c1.x+6+(i%4)*2.6,c1.z-4+Math.floor(i/4)*3);
    for(let i=0;i<8;i++)placeUnit(sim,i%2?'swordsman':'archer',1,c1.x-34,c1.z-10+i*3);

    // Enemy 2: Distant Eastern Imperial Capital (264m across the realm!)
    placeBuilding(sim,'towncenter',2,c2.x,c2.z,true);
    placeBuilding(sim,'barracks',2,c2.x-15,c2.z+12,true);
    placeBuilding(sim,'stable',2,c2.x-15,c2.z-12,true);
    placeBuilding(sim,'workshop',2,c2.x,c2.z+17,true);
    placeBuilding(sim,'blacksmith',2,c2.x+15,c2.z-10,true);
    placeBuilding(sim,'house',2,c2.x+15,c2.z+10,true);
    placeBuilding(sim,'house',2,c2.x,c2.z-17,true);
    placeBuilding(sim,'mill',2,c2.x+17,c2.z,true);
    buildNaturalFortifiedBase(sim,2,c2,{radius:36,gates:['west','south'],towers:true,complete:true,includeResources:true,keepClear:[{x:c1.x,z:c1.z,r:36}],seedOffset:1205,backToBorder:true});
    for(let i=0;i<12;i++)placeUnit(sim,'villager',2,c2.x-4+(i%4)*3,c2.z-6+Math.floor(i/4)*3);
    for(let i=0;i<6;i++)placeUnit(sim,i%2?'knight':'marksman',2,c2.x-38,c2.z-8+i*3);
  }else if(mode==='campaign13'){
    // THE FALLEN BANNER (320x320) — Hero Rescue-and-Expand across sprawling Blackwood forests!
    const c0={x:-124,z:108},c1={x:24,z:48},c2={x:108,z:-98},c3={x:-34,z:24};
    sim.players=[
      {...sim.makePlayer(playerFaction),name:'Royal Vanguard',team:1,age:2,controller:'human',slotNumber:1,color:PLAYER_COLORS[0],start:c0,resources:{food:550,wood:600,gold:400,stone:300},defeated:false},
      makeScenarioPlayer(sim,{name:'Oakhold Raiders',faction:'raven',team:2,age:1,difficulty:diff,aiPersonality:'rusher',colorIndex:1,start:c1,resources:{food:450,wood:450,gold:250,stone:150}}),
      makeScenarioPlayer(sim,{name:'Warlord Malrik',faction:'raven',team:2,age:2,difficulty:diff,aiPersonality:'turtle',colorIndex:2,start:c2,resources:{food:900,wood:900,gold:600,stone:450}}),
      makeScenarioPlayer(sim,{name:'Village of Oakhold',faction:'alder',team:1,age:2,difficulty:diff,aiPersonality:'turtle',colorIndex:3,start:c3,resources:{food:600,wood:600,gold:300,stone:250},dormant:true}),
    ];
    sim.spawnPositions=[c0,c1,c2,c3];

    const passes=[{x:-78,z:66,r:12},{x:-4,z:36,r:13},{x:34,z:-34,r:12},{x:-34,z:-58,r:12}];
    const keep=[{x:c0.x,z:c0.z,r:22},{x:c1.x,z:c1.z,r:22},{x:c2.x,z:c2.z,r:40},{x:c3.x,z:c3.z,r:38}];
    addDenseForestBelt(sim,{x:-half+10,z:16},{x:half-10,z:-64},{step:2.5,thickness:4,passes,keepClear:keep,seedOffset:1301});
    addCliffRidge(sim,{x:-98,z:32},{x:-72,z:10},{step:3.6,width:1,radius:3.2,height:4.8,wobble:2.0,passes,keepClear:keep,seedOffset:1302,foothillTrees:true});
    addCliffRidge(sim,{x:52,z:22},{x:108,z:8},{step:3.6,width:1,radius:3.2,height:4.8,wobble:2.0,passes,keepClear:keep,seedOffset:1303,foothillTrees:true});

    // Player's Heroic Rescue Vanguard (NO Town Center yet!)
    const king=placeUnit(sim,'king',0,c0.x,c0.z);
    if(king)king.displayName='Sovereign Bannerlord';
    for(let i=0;i<4;i++)placeUnit(sim,'knight',0,c0.x+4+i*2.5,c0.z-4);
    for(let i=0;i<5;i++)placeUnit(sim,'swordsman',0,c0.x-4+i*2.5,c0.z-8);
    for(let i=0;i<5;i++)placeUnit(sim,'archer',0,c0.x-5+i*2.5,c0.z+5);
    placeUnit(sim,'monk',0,c0.x-3,c0.z+2);placeUnit(sim,'monk',0,c0.x+3,c0.z+2);

    // Forest Trail Ambush Patrol
    for(let i=0;i<4;i++)placeUnit(sim,i%2?'spearman':'archer',1,-78+i*2.8,64-i*1.8);

    // Besieged Walled Village of Oakhold (HUGE 34m spacious valley glade with generous room to build after liberation!)
    placeBuilding(sim,'towncenter',3,c3.x,c3.z,true);
    placeBuilding(sim,'barracks',3,c3.x-14,c3.z+10,true);
    placeBuilding(sim,'mill',3,c3.x-14,c3.z-10,true);
    placeBuilding(sim,'house',3,c3.x+14,c3.z-12,true);
    placeBuilding(sim,'house',3,c3.x+14,c3.z+12,true);
    placeBuilding(sim,'farm',3,c3.x-16,c3.z,true);
    placeBuilding(sim,'farm',3,c3.x,c3.z-16,true);
    placeBuilding(sim,'farm',3,c3.x,c3.z+16,true);
    buildNaturalFortifiedBase(sim,3,c3,{radius:34,gates:['south','east','north'],towers:true,complete:true,includeResources:true,keepClear:[{x:c0.x,z:c0.z,r:24},{x:c1.x,z:c1.z,r:22},{x:c2.x,z:c2.z,r:40}],seedOffset:1304,backToBorder:false});
    for(let i=0;i<10;i++)placeUnit(sim,'villager',3,c3.x-4+(i%5)*2.6,c3.z+5+Math.floor(i/5)*2.6);

    // Enemy 1: Oakhold Raider Camp besieging the eastern approach
    placeBuilding(sim,'barracks',1,c1.x,c1.z,true);
    placeBuilding(sim,'tower',1,c1.x-8,c1.z-6,true);
    placeBuilding(sim,'house',1,c1.x+9,c1.z+6,true);
    for(let i=0;i<6;i++)placeUnit(sim,i%3===0?'archer':'spearman',1,c1.x-10+(i%3)*3,c1.z-10+Math.floor(i/3)*3);

    // Enemy 2: High Warlord Malrik's Distant Blackwood Citadel (270m away!)
    placeBuilding(sim,'towncenter',2,c2.x,c2.z,true);
    placeBuilding(sim,'keep',2,c2.x-14,c2.z+10,true);
    placeBuilding(sim,'barracks',2,c2.x+14,c2.z+12,true);
    placeBuilding(sim,'stable',2,c2.x-15,c2.z-12,true);
    placeBuilding(sim,'range',2,c2.x+15,c2.z-12,true);
    placeBuilding(sim,'blacksmith',2,c2.x,c2.z-16,true);
    placeBuilding(sim,'house',2,c2.x+17,c2.z+2,true);
    placeBuilding(sim,'house',2,c2.x-17,c2.z+1,true);
    placeBuilding(sim,'mill',2,c2.x,c2.z+17,true);
    buildNaturalFortifiedBase(sim,2,c2,{radius:36,gates:['south','west'],towers:true,complete:true,includeResources:true,keepClear:[{x:c3.x,z:c3.z,r:38}],seedOffset:1305,backToBorder:true});
    for(let i=0;i<12;i++)placeUnit(sim,'villager',2,c2.x-5+(i%4)*3,c2.z-4+Math.floor(i/4)*3);
    for(let i=0;i<8;i++)placeUnit(sim,i%2?'knight':'swordsman',2,c2.x-8+(i%4)*4,c2.z+38+Math.floor(i/4)*3);
  }else if(mode==='campaign14'){
    // CROWN OF THREE KINGDOMS (360x360) — Grand 2v2 Imperial Coalition War across Twin Rivers (264m–327m apart!)
    const c0={x:-132,z:96},c1={x:132,z:92},c2={x:132,z:-96},c3={x:-130,z:-96};
    sim.players=[
      {...sim.makePlayer(playerFaction),name:'Your Royal Army',team:1,age:2,controller:'human',slotNumber:1,color:PLAYER_COLORS[0],start:c0,resources:{food:1100,wood:1100,gold:750,stone:700},defeated:false},
      makeScenarioPlayer(sim,{name:'Sunward Usurper',faction:'sun',team:2,age:2,difficulty:diff,aiPersonality:'boomer',colorIndex:1,start:c1,resources:{food:1000,wood:1000,gold:700,stone:550}}),
      makeScenarioPlayer(sim,{name:'Raven Warlord',faction:'raven',team:2,age:2,difficulty:diff,aiPersonality:'rusher',colorIndex:2,start:c2,resources:{food:1000,wood:1000,gold:700,stone:550}}),
      makeScenarioPlayer(sim,{name:'Queen Maren (Ally)',faction:'alder',team:1,age:2,difficulty:diff,aiPersonality:'rusher',colorIndex:3,start:c3,resources:{food:1050,wood:1050,gold:700,stone:550}}),
    ];
    sim.spawnPositions=[c0,c1,c2,c3];

    const keep=[{x:c0.x,z:c0.z,r:42},{x:c1.x,z:c1.z,r:42},{x:c2.x,z:c2.z,r:42},{x:c3.x,z:c3.z,r:42},{x:-22,z:0,r:18},{x:22,z:0,r:18}];
    addCliffRidge(sim,{x:-14,z:-150},{x:14,z:-98},{step:3.8,width:1,radius:3.2,height:5.0,wobble:2.2,keepClear:keep,seedOffset:1401,foothillTrees:true});
    addCliffRidge(sim,{x:-14,z:98},{x:14,z:150},{step:3.8,width:1,radius:3.2,height:5.0,wobble:2.2,keepClear:keep,seedOffset:1402,foothillTrees:true});

    const buildCitadel=(owner,center,gates,armyTypes)=>{
      placeBuilding(sim,'towncenter',owner,center.x,center.z,true);
      placeBuilding(sim,'keep',owner,center.x+(center.x<0?13:-13),center.z+(center.z<0?12:-12),true);
      placeBuilding(sim,'barracks',owner,center.x-14,center.z+12,true);
      placeBuilding(sim,'range',owner,center.x+14,center.z-12,true);
      placeBuilding(sim,'stable',owner,center.x-14,center.z-12,true);
      placeBuilding(sim,'blacksmith',owner,center.x+15,center.z+12,true);
      placeBuilding(sim,'house',owner,center.x,center.z-18,true);
      placeBuilding(sim,'house',owner,center.x,center.z+18,true);
      placeBuilding(sim,'mill',owner,center.x+(center.x<0?-18:18),center.z,true);
      buildNaturalFortifiedBase(sim,owner,center,{radius:38,gates,towers:true,complete:true,includeResources:true,keepClear:keep.filter(k=>Math.hypot(k.x-center.x,k.z-center.z)>10),seedOffset:1410+owner,backToBorder:true});
      for(let i=0;i<12;i++)placeUnit(sim,'villager',owner,center.x-5+(i%4)*3.2,center.z-4+Math.floor(i/4)*2.8);
      armyTypes.forEach((t,i)=>placeUnit(sim,t,owner,center.x+(center.x<0?40:-40),center.z-8+i*3));
    };

    buildCitadel(0,c0,['east','north'],['knight','knight','swordsman','swordsman','archer','archer','monk','scout']);
    buildCitadel(3,c3,['east','south'],['knight','knight','swordsman','swordsman','archer','archer','monk']);
    buildCitadel(1,c1,['west','north'],['marksman','marksman','swordsman','swordsman','knight','knight','ram']);
    buildCitadel(2,c2,['west','south'],['outrider','outrider','knight','knight','spearman','spearman','ram']);
    scatterBiomeCliffs(sim,{count:6,ridgeLen:26,withMassifs:true,keepClear:keep,passes:[{x:-22,z:0,r:18},{x:22,z:0,r:18}],seedOffset:1405});
  }

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

export function triggerWesternReliefArrival(sim){
  const ally=sim.players[3];
  if(!ally||!ally.dormant)return false;
  ally.dormant=false;
  const base=ally.start||{x:-148,z:14};
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
  if(vanguard.length)sim.command(vanguard,{type:'attackmove',x:-36,z:0});
  sim.assignEconomy(3);
  sim.revision++;
  sim.updateFog();
  return true;
}

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

export function applyCampaignScenario(sim){
  if(!sim.mission)return;
  if(sim.mission.actFour)buildActFourScenario(sim);
  else applyClassicChapterArchitecture(sim);
}
