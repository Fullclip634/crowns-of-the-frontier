import {BUILDINGS,seededRandom} from './data.js';
import {PLAYER_COLORS} from './custom-battle.js';
import {addNaturalBarrier,addCliffRidge,addCurvedCliffChain,addMountainMassif,addDenseForestBelt,buildNaturalFortifiedBase,connectCliffPassWall,scatterBiomeCliffs} from './terrain-barriers.js';
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
  const p0=sim.owned(0,'building','towncenter')[0]||{x:-39,z:30};
  const p1=sim.owned(1,'building','towncenter')[0]||{x:40,z:-34};
  const testKeep=[{x:-36,z:49,r:10},{x:p0.x,z:p0.z,r:19},{x:p1.x,z:p1.z,r:19}];

  if(mode==='campaign1'){
    // Frontier Foothold: Natural cliff shoulders framing northern woods + lush berry groves
    addCliffRidge(sim,{x:-66,z:-12},{x:-26,z:-24},{step:4.0,width:1,radius:3.0,height:4.2,wobble:1.8,keepClear:testKeep,seedOffset:101});
    addCliffRidge(sim,{x:14,z:24},{x:60,z:16},{step:4.0,width:1,radius:3.0,height:4.2,wobble:1.8,keepClear:testKeep,seedOffset:102});
    for(const [bx,bz] of [[-52,40],[-54,38],[-50,42]])if(!sim.isWater(bx,bz))sim.addNaturalResource('food',bx,bz,320);
  }else if(mode==='campaign2'){
    // The Broken Crossing: Cliff-anchored bridgehead tower + enemy eastern toll-fort beyond safe bridgehead
    const bridgeKeep=[...testKeep,{x:0,z:0,r:14},{x:-16,z:0,r:10},{x:20,z:-8,r:11}];
    placeBuilding(sim,'tower',0,-16,12,true);
    placeBuilding(sim,'tower',1,31,-26,true);
    addCliffRidge(sim,{x:-58,z:-44},{x:-20,z:-36},{step:4.0,width:1,radius:3.1,height:4.4,wobble:1.6,keepClear:bridgeKeep,seedOffset:201});
    addCliffRidge(sim,{x:24,z:34},{x:62,z:42},{step:4.0,width:1,radius:3.1,height:4.4,wobble:1.6,keepClear:bridgeKeep,seedOffset:202});
  }else if(mode==='campaign3'){
    // A Crown of Stone: Natural Iron Ridge granite cliffs cradling the western & northern flanks,
    // with short stone walls & gates sealing ONLY the two mountain passes (leaving -36,49 wide open for Keep!)
    const ridgeKeep=[...testKeep,{x:-36,z:49,r:11}];
    addCliffRidge(sim,{x:-68,z:8},{x:-46,z:11},{step:3.5,width:1,radius:3.1,height:4.6,wobble:1.2,keepClear:ridgeKeep,seedOffset:301});
    addCliffRidge(sim,{x:-22,z:11},{x:-14,z:20},{step:3.5,width:1,radius:3.1,height:4.6,wobble:1.0,keepClear:ridgeKeep,seedOffset:303});
    addCliffRidge(sim,{x:-14,z:42},{x:12,z:54},{step:3.6,width:1,radius:3.1,height:4.6,wobble:1.4,keepClear:ridgeKeep,seedOffset:302});
    // Short cliff-to-cliff stone walls & gates across the North Pass & East Pass!
    connectCliffPassWall(sim,0,{x:-45,z:11},{x:-23,z:11},p0,{complete:true,withGate:true,withTower:true});
    connectCliffPassWall(sim,0,{x:-15,z:21},{x:-15,z:41},p0,{complete:true,withGate:true,withTower:true});
    placeBuilding(sim,'blacksmith',0,-53,28,true);
  }else if(mode==='campaign4'){
    // Keepers of the Valley: Sheer cliff ridges dividing the basin into distinct shrine lanes
    const shrineKeep=[...testKeep,{x:-26,z:-23,r:13},{x:3,z:1,r:13},{x:28,z:25,r:13}];
    addCliffRidge(sim,{x:-52,z:-8},{x:-12,z:-8},{step:3.8,width:1,radius:3.0,height:4.4,wobble:1.6,keepClear:shrineKeep,seedOffset:401});
    addCliffRidge(sim,{x:16,z:10},{x:54,z:10},{step:3.8,width:1,radius:3.0,height:4.4,wobble:1.6,keepClear:shrineKeep,seedOffset:402});
    placeBuilding(sim,'tower',0,-22,16,true);
    placeBuilding(sim,'tower',1,22,-16,true);
    placeBuilding(sim,'stable',0,-54,20,true);
  }else if(mode==='campaign5'){
    // The Final Siege: Spacious southern war-camp vs cliff-anchored Walled Capital
    const siegeKeep=[...testKeep,{x:36,z:-5,r:11}];
    placeBuilding(sim,'tower',0,-20,16,true);
    placeBuilding(sim,'tower',0,-48,16,true);
    placeBuilding(sim,'stable',0,-55,26,true);
    placeBuilding(sim,'blacksmith',0,-52,16,true);
    placeBuilding(sim,'monastery',0,-20,40,true);
    // Natural granite cliff shoulder anchoring Lord Draven's western curtain wall
    addCliffRidge(sim,{x:-6,z:-8},{x:12,z:-6},{step:3.5,width:1,radius:3.1,height:4.8,wobble:1.2,keepClear:siegeKeep,seedOffset:501});
    placeBuilding(sim,'tower',1,27,-9,true);
    placeBuilding(sim,'tower',1,45,-9,true);
    placeBuilding(sim,'workshop',1,58,-22,true);
    for(let z=-36;z<=-9;z+=3)placeBuilding(sim,'wall',1,15,z,true,{angle:Math.PI/2});
  }else if(mode==='campaign6'){
    // Beyond the Horizon: Coastal cliff headlands framing fortified west & east harbors
    placeBuilding(sim,'tower',0,-24,18,true);
    placeBuilding(sim,'tower',0,-24,38,true);
    placeBuilding(sim,'tower',1,24,-22,true);
    placeBuilding(sim,'tower',1,24,-42,true);
    placeBuilding(sim,'keep',1,49,-46,true);
    addNaturalBarrier(sim,-58,-12,{r:3.8,height:5.8,kind:'mountain',keepClear:testKeep});
    addNaturalBarrier(sim,58,14,{r:3.8,height:5.8,kind:'mountain',keepClear:testKeep});
  }else if(mode==='campaign7'){
    // The Ember Road: Towering volcanic basalt cliff ranges pinching the valley into the Ash Pass (0,0)
    const passKeep=[...testKeep,{x:0,z:0,r:12},{x:28,z:-24,r:12}];
    addCliffRidge(sim,{x:-66,z:-58},{x:-12,z:-12},{step:3.5,width:2,radius:3.1,height:4.9,wobble:2.0,passes:[{x:0,z:0,r:12}],keepClear:passKeep,seedOffset:701});
    addCliffRidge(sim,{x:12,z:12},{x:66,z:58},{step:3.5,width:2,radius:3.1,height:4.9,wobble:2.0,passes:[{x:0,z:0,r:12}],keepClear:passKeep,seedOffset:702});
    placeBuilding(sim,'tower',0,-20,16,true);
    placeBuilding(sim,'tower',1,22,-18,true);
    placeBuilding(sim,'keep',1,48,-46,true);
    connectCliffPassWall(sim,1,{x:20,z:-14},{x:46,z:-14},p1,{complete:true,withGate:true,withTower:false});
  }else if(mode==='campaign8'){
    // The Deepwood Oath: Dense Black Forest corridor barriers anchored by mossy crags
    const woodKeep=[...testKeep,{x:-20,z:45,r:10},{x:0,z:0,r:11},{x:28,z:-24,r:11}];
    const passes=[{x:0,z:0,r:10.5},{x:-30,z:-22,r:10},{x:30,z:22,r:10}];
    addDenseForestBelt(sim,{x:-64,z:-56},{x:64,z:56},{step:2.45,thickness:3,passes,keepClear:woodKeep,seedOffset:801});
    addNaturalBarrier(sim,-10,10,{r:3.4,height:5.2,kind:'mountain',passes,keepClear:woodKeep});
    addNaturalBarrier(sim,10,-10,{r:3.4,height:5.2,kind:'mountain',passes,keepClear:woodKeep});
    placeBuilding(sim,'tower',1,22,-18,true);
    connectCliffPassWall(sim,1,{x:26,z:-15},{x:50,z:-15},p1,{complete:true,withGate:true,withTower:false});
  }else if(mode==='campaign9'){
    // The Long Night: Spacious natural snow-cliff fortified winter valley with short cliff-linked gates & ALL resources inside!
    buildNaturalFortifiedBase(sim,0,{x:p0.x,z:p0.z},{radius:24,gates:['north','east'],towers:true,complete:true,includeResources:true,seedOffset:901});
    placeBuilding(sim,'blacksmith',0,p0.x-13,p0.z+8,true);
    addCliffRidge(sim,{x:-58,z:-18},{x:-16,z:-22},{step:3.8,width:1,radius:3.1,height:4.6,wobble:1.6,keepClear:testKeep,seedOffset:902});
    placeBuilding(sim,'workshop',1,26,-18,true);
    placeBuilding(sim,'tower',1,22,-22,true);
  }else if(mode==='campaign10'){
    // The Last Claim: Spacious cliff-walled southern staging citadel vs Valkor's mountain-ringed Imperial Summit Fortress
    const summitKeep=[...testKeep,{x:0,z:0,r:16}];
    buildNaturalFortifiedBase(sim,0,{x:p0.x,z:p0.z},{radius:24,gates:['north','east'],towers:true,complete:true,includeResources:true,seedOffset:1001});
    placeBuilding(sim,'stable',0,p0.x-14,p0.z+4,true);
    placeBuilding(sim,'blacksmith',0,p0.x+8,p0.z+13,true);
    addCliffRidge(sim,{x:-58,z:-14},{x:-20,z:-8},{step:3.6,width:1,radius:3.2,height:5.0,wobble:1.8,keepClear:summitKeep,seedOffset:1002});
    addCliffRidge(sim,{x:20,z:8},{x:58,z:14},{step:3.6,width:1,radius:3.2,height:5.0,wobble:1.8,keepClear:summitKeep,seedOffset:1003});
    // Valkor's Imperial Summit Fortress (Keep first, spacious cliff-linked perimeter around it!)
    placeBuilding(sim,'keep',1,35,-49,true);
    buildNaturalFortifiedBase(sim,1,{x:p1.x,z:p1.z},{radius:24,gates:['south','west'],towers:true,complete:true,includeResources:true,seedOffset:1004});
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
    // THE RING OF IRON — Spacious Natural Highland Citadel Basin (radius 33!)
    // 4 towering natural cliff-and-mountain bastions + 4 short cliff-linked Gatehouse walls + ALL resources inside!
    const c0={x:0,z:0},c1={x:-8,z:-88},c2={x:88,z:4},c3={x:-88,z:10};
    sim.players=[
      {...sim.makePlayer(playerFaction),name:'Your Citadel',team:1,age:2,controller:'human',slotNumber:1,color:PLAYER_COLORS[0],start:c0,resources:{food:900,wood:950,gold:550,stone:550},defeated:false},
      makeScenarioPlayer(sim,{name:'Lord Korr (North)',faction:'raven',team:2,age:2,difficulty:diff,aiPersonality:'rusher',colorIndex:1,start:c1,resources:{food:750,wood:750,gold:450,stone:300}}),
      makeScenarioPlayer(sim,{name:'General Syra (East)',faction:'sun',team:2,age:2,difficulty:diff,aiPersonality:'balanced',colorIndex:2,start:c2,resources:{food:750,wood:750,gold:450,stone:300}}),
      makeScenarioPlayer(sim,{name:'Western Relief',faction:'alder',team:1,age:2,difficulty:diff,aiPersonality:'rusher',colorIndex:3,start:c3,resources:{food:950,wood:950,gold:650,stone:450},dormant:true}),
    ];
    sim.spawnPositions=[c0,c1,c2,c3];

    // Grand, Spacious, Uncompressed Medieval Highland Citadel Districts inside a monumental 40m natural valley rim!
    // Generous royal courtyard avenues between quarters + all 4 sheltered diagonal cliff alcoves wide open for inner Wood, Gold, Stone & Berries!
    placeBuilding(sim,'towncenter',0,0,0,true);
    placeBuilding(sim,'keep',0,-15,-14,true);
    placeBuilding(sim,'barracks',0,15,-13,true);
    placeBuilding(sim,'range',0,17,9,true);
    placeBuilding(sim,'stable',0,-17,9,true);
    placeBuilding(sim,'blacksmith',0,0,-19,true);
    placeBuilding(sim,'market',0,-20,-2,true);
    placeBuilding(sim,'monastery',0,19,-2,true);
    placeBuilding(sim,'mill',0,0,15,true);
    placeBuilding(sim,'house',0,-12,-27,true);
    placeBuilding(sim,'house',0,12,-27,true);
    placeBuilding(sim,'house',0,-26,8,true);
    placeBuilding(sim,'house',0,26,-8,true);
    for(const [fx,fz] of [[-9,21],[9,21],[-9,27],[9,27]])placeBuilding(sim,'farm',0,fx,fz,true);

    // Organic Continent-Wide Highland Mountain Crossroads:
    // FOUR massive branching mountain ranges sweep across all 4 quadrants of the 240x240 realm
    // (NEVER a fake rock circle!) and converge at 4 natural canyon passes sealed by straight castle curtain walls!
    const outerKeep=[{x:c1.x,z:c1.z,r:26},{x:c2.x,z:c2.z,r:26},{x:c3.x,z:c3.z,r:26},{x:4,z:80,r:22}];
    buildNaturalFortifiedBase(sim,0,c0,{
      radius:40,
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
    for(let i=0;i<4;i++)placeUnit(sim,'knight',0,-6+i*4,-31);
    for(let i=0;i<4;i++)placeUnit(sim,'swordsman',0,31,-6+i*4);
    for(let i=0;i<4;i++)placeUnit(sim,'archer',0,-6+i*4,31);
    placeUnit(sim,'monk',0,-5,-8);placeUnit(sim,'monk',0,5,-8);

    // Outer Alpine Border Headlands & Forested Valleys framing the wider 240x240 province
    const borderKeep=[{x:0,z:0,r:46},...outerKeep];
    addMountainMassif(sim,-104,-100,{radius:16,peaks:5,keepClear:borderKeep,seedOffset:1101});
    addMountainMassif(sim,104,-100,{radius:16,peaks:5,keepClear:borderKeep,seedOffset:1102});
    addMountainMassif(sim,104,100,{radius:16,peaks:5,keepClear:borderKeep,seedOffset:1103});
    addMountainMassif(sim,-104,100,{radius:16,peaks:5,keepClear:borderKeep,seedOffset:1104});
    addDenseForestBelt(sim,{x:-108,z:-58},{x:-66,z:-44},{step:2.6,thickness:2,keepClear:borderKeep,seedOffset:1105});
    addDenseForestBelt(sim,{x:66,z:-46},{x:108,z:-58},{step:2.6,thickness:2,keepClear:borderKeep,seedOffset:1106});
    addDenseForestBelt(sim,{x:66,z:48},{x:108,z:62},{step:2.6,thickness:2,keepClear:borderKeep,seedOffset:1107});
    addDenseForestBelt(sim,{x:-108,z:62},{x:-66,z:48},{step:2.6,thickness:2,keepClear:borderKeep,seedOffset:1108});

    // Enemy 1: Lord Korr's Northern Siege Camp
    placeBuilding(sim,'towncenter',1,c1.x,c1.z,true);
    placeBuilding(sim,'barracks',1,c1.x-13,c1.z+9,true);
    placeBuilding(sim,'workshop',1,c1.x+13,c1.z+10,true);
    placeBuilding(sim,'tower',1,c1.x-11,c1.z+20,true);
    placeBuilding(sim,'tower',1,c1.x+11,c1.z+20,true);
    placeBuilding(sim,'house',1,c1.x-15,c1.z-9,true);
    placeBuilding(sim,'house',1,c1.x+15,c1.z-9,true);
    placeBuilding(sim,'mill',1,c1.x,c1.z-13,true);
    for(let i=0;i<10;i++)placeUnit(sim,'villager',1,c1.x-8+(i%5)*3,c1.z-6+Math.floor(i/5)*3);
    for(let i=0;i<6;i++)placeUnit(sim,i%2?'swordsman':'spearman',1,c1.x-8+i*3,c1.z+24);
    placeUnit(sim,'ram',1,c1.x,c1.z+26);

    // Enemy 2: General Syra's Eastern Raider Hold
    placeBuilding(sim,'towncenter',2,c2.x,c2.z,true);
    placeBuilding(sim,'stable',2,c2.x-13,c2.z-9,true);
    placeBuilding(sim,'range',2,c2.x-13,c2.z+10,true);
    placeBuilding(sim,'tower',2,c2.x-20,c2.z-10,true);
    placeBuilding(sim,'tower',2,c2.x-20,c2.z+10,true);
    placeBuilding(sim,'house',2,c2.x+13,c2.z-10,true);
    placeBuilding(sim,'house',2,c2.x+13,c2.z+10,true);
    placeBuilding(sim,'mill',2,c2.x+13,c2.z,true);
    for(let i=0;i<10;i++)placeUnit(sim,'villager',2,c2.x+6+(i%5)*2.5,c2.z-6+Math.floor(i/5)*3);
    for(let i=0;i<6;i++)placeUnit(sim,i%2?'knight':'archer',2,c2.x-24,c2.z-10+i*4);

    // Southern Forward Encirclement Outpost
    placeBuilding(sim,'barracks',1,4,80,true);
    placeBuilding(sim,'tower',1,-5,70,true);
    placeBuilding(sim,'tower',1,13,70,true);
    for(let i=0;i<5;i++)placeUnit(sim,i%2?'spearman':'archer',1,-6+i*3.5,64);

    seedBaseDeposits(sim,c1,112);seedBaseDeposits(sim,c2,113);seedBaseDeposits(sim,c3,114);
  }else if(mode==='campaign12'){
    // THE SUNDERED PASS — Towering North-to-South Stone Mountain Range + 3 Narrow Passes + Cliff-Anchored Allied Garrison!
    const c0={x:-74,z:50},c1={x:24,z:-4},c2={x:84,z:-36},c3={x:-68,z:-56};
    sim.players=[
      {...sim.makePlayer(playerFaction),name:'Your Stronghold',team:1,age:2,controller:'human',slotNumber:1,color:PLAYER_COLORS[0],start:c0,resources:{food:850,wood:900,gold:500,stone:650},defeated:false},
      makeScenarioPlayer(sim,{name:'Pass Fortress',faction:'alder',team:2,age:2,difficulty:diff,aiPersonality:'turtle',colorIndex:1,start:c1,resources:{food:650,wood:650,gold:400,stone:450}}),
      makeScenarioPlayer(sim,{name:'Eastern Empire',faction:'sun',team:2,age:2,difficulty:diff,aiPersonality:'boomer',colorIndex:2,start:c2,resources:{food:900,wood:900,gold:600,stone:450}}),
      makeScenarioPlayer(sim,{name:'Northern Ally',faction:'alder',team:1,age:2,difficulty:diff,aiPersonality:'turtle',colorIndex:3,start:c3,resources:{food:850,wood:850,gold:500,stone:450}}),
    ];
    sim.spawnPositions=[c0,c1,c2,c3];

    const passes=[{x:-8,z:-64,r:10},{x:-8,z:0,r:10.5},{x:-8,z:64,r:10}];
    const keep=[{x:c0.x,z:c0.z,r:24},{x:c1.x,z:c1.z,r:24},{x:c2.x,z:c2.z,r:24},{x:c3.x,z:c3.z,r:24}];
    addCliffRidge(sim,{x:-10,z:-half+6},{x:-8,z:half-6},{step:3.4,width:2,radius:3.3,height:5.2,wobble:2.8,passes,keepClear:keep,seedOffset:1201});
    addCliffRidge(sim,{x:52,z:24},{x:58,z:half-8},{step:3.8,width:1,radius:3.1,height:4.6,wobble:2.0,passes:[{x:54,z:56,r:11}],keepClear:keep,seedOffset:1202});

    // Player Western Stronghold (open valley so player can seal ONLY the 2 narrow western passes with short walls!)
    placeBuilding(sim,'towncenter',0,c0.x,c0.z,true);
    placeBuilding(sim,'barracks',0,c0.x+15,c0.z-7,true);
    placeBuilding(sim,'range',0,c0.x+14,c0.z+11,true);
    placeBuilding(sim,'blacksmith',0,c0.x-13,c0.z-9,true);
    placeBuilding(sim,'mill',0,c0.x-13,c0.z+9,true);
    placeBuilding(sim,'house',0,c0.x-16,c0.z,true);
    placeBuilding(sim,'house',0,c0.x,c0.z+16,true);
    placeBuilding(sim,'house',0,c0.x,c0.z-15,true);
    placeBuilding(sim,'tower',0,-24,60,true);
    for(let i=0;i<12;i++)placeUnit(sim,'villager',0,c0.x-6+(i%4)*3.2,c0.z+19+Math.floor(i/4)*2.6);
    for(let i=0;i<8;i++)placeUnit(sim,i%3===0?'archer':'spearman',0,-28+(i%4)*3,54+Math.floor(i/4)*3);
    placeUnit(sim,'scout',0,-26,10);

    // Active Allied Northern Border Garrison inside a spacious cliff-cradled mountain fort!
    placeBuilding(sim,'towncenter',3,c3.x,c3.z,true);
    placeBuilding(sim,'barracks',3,c3.x+11,c3.z+9,true);
    placeBuilding(sim,'stable',3,c3.x-11,c3.z+9,true);
    placeBuilding(sim,'house',3,c3.x-12,c3.z-11,true);
    placeBuilding(sim,'house',3,c3.x+12,c3.z-11,true);
    placeBuilding(sim,'mill',3,c3.x,c3.z-12,true);
    buildNaturalFortifiedBase(sim,3,c3,{radius:25,gates:['east','south'],towers:true,complete:true,includeResources:true,seedOffset:1203});
    for(let i=0;i<10;i++)placeUnit(sim,'villager',3,c3.x-4+(i%4)*2.8,c3.z+6+Math.floor(i/4)*2.8);
    for(let i=0;i<6;i++)placeUnit(sim,i%2?'swordsman':'archer',3,-26,-62+i*2.6);

    // Enemy 1: Central Mountain Gatehouse Fortress guarding the middle pass
    placeBuilding(sim,'towncenter',1,c1.x,c1.z,true);
    placeBuilding(sim,'keep',1,c1.x-12,c1.z,true);
    placeBuilding(sim,'barracks',1,c1.x+11,c1.z-11,true);
    placeBuilding(sim,'range',1,c1.x+11,c1.z+11,true);
    placeBuilding(sim,'house',1,c1.x+16,c1.z,true);
    buildNaturalFortifiedBase(sim,1,c1,{radius:25,gates:['west','east'],towers:true,complete:true,includeResources:true,keepClear:[{x:c0.x,z:c0.z,r:26},{x:c2.x,z:c2.z,r:28},{x:c3.x,z:c3.z,r:28}],seedOffset:1204,backToBorder:false});
    for(let i=0;i<8;i++)placeUnit(sim,'villager',1,c1.x+6+(i%4)*2.6,c1.z-4+Math.floor(i/4)*3);
    for(let i=0;i<8;i++)placeUnit(sim,i%2?'swordsman':'archer',1,c1.x-26,c1.z-10+i*3);

    // Enemy 2: Eastern Imperial Capital behind spacious cliff ramparts
    placeBuilding(sim,'towncenter',2,c2.x,c2.z,true);
    placeBuilding(sim,'barracks',2,c2.x-13,c2.z+11,true);
    placeBuilding(sim,'stable',2,c2.x-13,c2.z-11,true);
    placeBuilding(sim,'workshop',2,c2.x,c2.z+15,true);
    placeBuilding(sim,'blacksmith',2,c2.x+13,c2.z-9,true);
    placeBuilding(sim,'house',2,c2.x+13,c2.z+9,true);
    placeBuilding(sim,'house',2,c2.x,c2.z-15,true);
    placeBuilding(sim,'mill',2,c2.x+15,c2.z,true);
    buildNaturalFortifiedBase(sim,2,c2,{radius:26,gates:['west','south'],towers:true,complete:true,includeResources:true,seedOffset:1205});
    for(let i=0;i<12;i++)placeUnit(sim,'villager',2,c2.x-4+(i%4)*3,c2.z-6+Math.floor(i/4)*3);
    for(let i=0;i<6;i++)placeUnit(sim,i%2?'knight':'marksman',2,c2.x-27,c2.z-8+i*3);

    seedBaseDeposits(sim,c0,121);
  }else if(mode==='campaign13'){
    // THE FALLEN BANNER — Hero Rescue-and-Expand!
    // Oakhold sits inside a spacious cliff-and-forest valley with ALL resources safely inside its gates!
    const c0={x:-88,z:78},c1={x:18,z:38},c2={x:74,z:-68},c3={x:-24,z:16};
    sim.players=[
      {...sim.makePlayer(playerFaction),name:'Royal Vanguard',team:1,age:2,controller:'human',slotNumber:1,color:PLAYER_COLORS[0],start:c0,resources:{food:550,wood:600,gold:400,stone:300},defeated:false},
      makeScenarioPlayer(sim,{name:'Oakhold Raiders',faction:'raven',team:2,age:1,difficulty:diff,aiPersonality:'rusher',colorIndex:1,start:c1,resources:{food:450,wood:450,gold:250,stone:150}}),
      makeScenarioPlayer(sim,{name:'Warlord Malrik',faction:'raven',team:2,age:2,difficulty:diff,aiPersonality:'turtle',colorIndex:2,start:c2,resources:{food:900,wood:900,gold:600,stone:450}}),
      makeScenarioPlayer(sim,{name:'Village of Oakhold',faction:'alder',team:1,age:2,difficulty:diff,aiPersonality:'turtle',colorIndex:3,start:c3,resources:{food:600,wood:600,gold:300,stone:250},dormant:true}),
    ];
    sim.spawnPositions=[c0,c1,c2,c3];

    const passes=[{x:-56,z:48,r:11},{x:-2,z:26,r:12},{x:24,z:-24,r:11},{x:-24,z:-44,r:11}];
    const keep=[{x:c0.x,z:c0.z,r:18},{x:c1.x,z:c1.z,r:18},{x:c2.x,z:c2.z,r:28},{x:c3.x,z:c3.z,r:28}];
    addDenseForestBelt(sim,{x:-half+10,z:10},{x:half-10,z:-48},{step:2.5,thickness:3,passes,keepClear:keep,seedOffset:1301});
    addCliffRidge(sim,{x:-72,z:22},{x:-52,z:8},{step:3.6,width:1,radius:3.1,height:4.6,wobble:1.8,passes,keepClear:keep,seedOffset:1302});
    addCliffRidge(sim,{x:38,z:16},{x:78,z:6},{step:3.6,width:1,radius:3.1,height:4.6,wobble:1.8,passes,keepClear:keep,seedOffset:1303});

    // Player's Heroic Rescue Vanguard (NO Town Center yet!)
    const king=placeUnit(sim,'king',0,c0.x,c0.z);
    if(king)king.displayName='Sovereign Bannerlord';
    for(let i=0;i<4;i++)placeUnit(sim,'knight',0,c0.x+4+i*2.5,c0.z-4);
    for(let i=0;i<5;i++)placeUnit(sim,'swordsman',0,c0.x-4+i*2.5,c0.z-8);
    for(let i=0;i<5;i++)placeUnit(sim,'archer',0,c0.x-5+i*2.5,c0.z+5);
    placeUnit(sim,'monk',0,c0.x-3,c0.z+2);placeUnit(sim,'monk',0,c0.x+3,c0.z+2);

    // Forest Trail Ambush Patrol
    for(let i=0;i<4;i++)placeUnit(sim,i%2?'spearman':'archer',1,-56+i*2.8,46-i*1.8);

    // Besieged Walled Village of Oakhold (spacious cliff-cradled valley town with safe interior resources!)
    placeBuilding(sim,'towncenter',3,c3.x,c3.z,true);
    placeBuilding(sim,'barracks',3,c3.x-12,c3.z+9,true);
    placeBuilding(sim,'mill',3,c3.x-12,c3.z-9,true);
    placeBuilding(sim,'house',3,c3.x+12,c3.z-11,true);
    placeBuilding(sim,'house',3,c3.x+12,c3.z+11,true);
    placeBuilding(sim,'farm',3,c3.x-14,c3.z,true);
    placeBuilding(sim,'farm',3,c3.x,c3.z-14,true);
    placeBuilding(sim,'farm',3,c3.x,c3.z+14,true);
    buildNaturalFortifiedBase(sim,3,c3,{radius:26,gates:['south','east','north'],towers:true,complete:true,includeResources:true,keepClear:[{x:c0.x,z:c0.z,r:22},{x:c1.x,z:c1.z,r:18},{x:c2.x,z:c2.z,r:30}],seedOffset:1304,backToBorder:false});
    for(let i=0;i<10;i++)placeUnit(sim,'villager',3,c3.x-4+(i%5)*2.6,c3.z+5+Math.floor(i/5)*2.6);

    // Enemy 1: Oakhold Raider Camp besieging the eastern gate
    placeBuilding(sim,'barracks',1,c1.x,c1.z,true);
    placeBuilding(sim,'tower',1,c1.x-8,c1.z-6,true);
    placeBuilding(sim,'house',1,c1.x+9,c1.z+6,true);
    for(let i=0;i<6;i++)placeUnit(sim,i%3===0?'archer':'spearman',1,c1.x-10+(i%3)*3,c1.z-10+Math.floor(i/3)*3);

    // Enemy 2: High Warlord Malrik's Spacious Cliff-Walled Blackwood Citadel
    placeBuilding(sim,'towncenter',2,c2.x,c2.z,true);
    placeBuilding(sim,'keep',2,c2.x-12,c2.z+8,true);
    placeBuilding(sim,'barracks',2,c2.x+12,c2.z+11,true);
    placeBuilding(sim,'stable',2,c2.x-13,c2.z-10,true);
    placeBuilding(sim,'range',2,c2.x+13,c2.z-10,true);
    placeBuilding(sim,'blacksmith',2,c2.x,c2.z-14,true);
    placeBuilding(sim,'house',2,c2.x+15,c2.z+2,true);
    placeBuilding(sim,'house',2,c2.x-15,c2.z+1,true);
    placeBuilding(sim,'mill',2,c2.x,c2.z+15,true);
    buildNaturalFortifiedBase(sim,2,c2,{radius:27,gates:['south','west'],towers:true,complete:true,includeResources:true,seedOffset:1305});
    for(let i=0;i<12;i++)placeUnit(sim,'villager',2,c2.x-5+(i%4)*3,c2.z-4+Math.floor(i/4)*3);
    for(let i=0;i<8;i++)placeUnit(sim,i%2?'knight':'swordsman',2,c2.x-8+(i%4)*4,c2.z+29+Math.floor(i/4)*3);
  }else if(mode==='campaign14'){
    // CROWN OF THREE KINGDOMS — Grand 2v2 Imperial Coalition War across Twin Rivers & Natural Cliff Fortresses!
    const c0={x:-78,z:58},c1={x:78,z:56},c2={x:78,z:-58},c3={x:-76,z:-58};
    sim.players=[
      {...sim.makePlayer(playerFaction),name:'Your Royal Army',team:1,age:2,controller:'human',slotNumber:1,color:PLAYER_COLORS[0],start:c0,resources:{food:1100,wood:1100,gold:750,stone:700},defeated:false},
      makeScenarioPlayer(sim,{name:'Sunward Usurper',faction:'sun',team:2,age:2,difficulty:diff,aiPersonality:'boomer',colorIndex:1,start:c1,resources:{food:1000,wood:1000,gold:700,stone:550}}),
      makeScenarioPlayer(sim,{name:'Raven Warlord',faction:'raven',team:2,age:2,difficulty:diff,aiPersonality:'rusher',colorIndex:2,start:c2,resources:{food:1000,wood:1000,gold:700,stone:550}}),
      makeScenarioPlayer(sim,{name:'Queen Maren (Ally)',faction:'alder',team:1,age:2,difficulty:diff,aiPersonality:'rusher',colorIndex:3,start:c3,resources:{food:1050,wood:1050,gold:700,stone:550}}),
    ];
    sim.spawnPositions=[c0,c1,c2,c3];

    const keep=[{x:c0.x,z:c0.z,r:29},{x:c1.x,z:c1.z,r:29},{x:c2.x,z:c2.z,r:29},{x:c3.x,z:c3.z,r:29},{x:-22,z:0,r:16},{x:22,z:0,r:16}];
    addCliffRidge(sim,{x:-12,z:-94},{x:12,z:-64},{step:3.8,width:1,radius:3.1,height:4.8,wobble:2.0,keepClear:keep,seedOffset:1401});
    addCliffRidge(sim,{x:-12,z:64},{x:12,z:94},{step:3.8,width:1,radius:3.1,height:4.8,wobble:2.0,keepClear:keep,seedOffset:1402});

    const buildCitadel=(owner,center,gates,armyTypes)=>{
      placeBuilding(sim,'towncenter',owner,center.x,center.z,true);
      placeBuilding(sim,'keep',owner,center.x+(center.x<0?11:-11),center.z+(center.z<0?10:-10),true);
      placeBuilding(sim,'barracks',owner,center.x-12,center.z+11,true);
      placeBuilding(sim,'range',owner,center.x+12,center.z-11,true);
      placeBuilding(sim,'stable',owner,center.x-12,center.z-11,true);
      placeBuilding(sim,'blacksmith',owner,center.x+13,center.z+10,true);
      placeBuilding(sim,'house',owner,center.x,center.z-15,true);
      placeBuilding(sim,'house',owner,center.x,center.z+15,true);
      placeBuilding(sim,'mill',owner,center.x+(center.x<0?-15:15),center.z,true);
      buildNaturalFortifiedBase(sim,owner,center,{radius:27,gates,towers:true,complete:true,includeResources:true,seedOffset:1410+owner});
      for(let i=0;i<12;i++)placeUnit(sim,'villager',owner,center.x-5+(i%4)*3.2,center.z-4+Math.floor(i/4)*2.8);
      armyTypes.forEach((t,i)=>placeUnit(sim,t,owner,center.x+(center.x<0?28:-28),center.z-8+i*3));
    };

    buildCitadel(0,c0,['east','north'],['knight','knight','swordsman','swordsman','archer','archer','monk','scout']);
    buildCitadel(3,c3,['east','south'],['knight','knight','swordsman','swordsman','archer','archer','monk']);
    buildCitadel(1,c1,['west','north'],['marksman','marksman','swordsman','swordsman','knight','knight','ram']);
    buildCitadel(2,c2,['west','south'],['outrider','outrider','knight','knight','spearman','spearman','ram']);
    // Natural continent-wide alpine outcrops flanking the river approaches & map borders
    scatterBiomeCliffs(sim,{count:4,ridgeLen:24,withMassifs:true,keepClear:keep,passes:[{x:-22,z:0,r:16},{x:22,z:0,r:16}],seedOffset:1405});
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
  const base=ally.start||{x:-88,z:10};
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
