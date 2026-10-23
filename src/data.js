export const WORLD = 160;
export const AGES = ['Frontier Age', 'Feudal Age', 'Castle Age', 'Imperial Age'];
export const RESOURCE = { food: 'Food', wood: 'Timber', gold: 'Gold', stone: 'Stone' };
export const RELEASE='2.6 - Fieldcraft and controls';
export const MAPS={highlands:{name:'Emerald highlands',desc:'Balanced forests, fertile fields, and open battlefields.'},valley:{name:'The river crossing',desc:'A winding river divides the frontier. Fight for the central bridge.'},desert:{name:'Sunlit meadows',desc:'Green meadows, scattered leafy trees, and long sight lines.'},winter:{name:'Winterwood',desc:'A snow-covered frontier with abundant northern timber.'},canyon:{name:'The iron frontier',desc:'Green foothills and exposed rock surround valuable central mines.'},rivers:{name:'Twin rivers',desc:'Two waterways and two bridges create a dangerous central corridor.'}};
export const ICONS = {food:'◒',wood:'♣',gold:'◆',stone:'⬟',pop:'♟',villager:'♟',scout:'♞',spearman:'⚑',archer:'➶',swordsman:'⚔',knight:'♞',ram:'▰',catapult:'☄',monk:'✚',towncenter:'♜',house:'⌂',farm:'▤',mill:'✣',camp:'♣',mine:'⬟',barracks:'⚔',range:'➶',stable:'♞',workshop:'⚙',tower:'♜',keep:'♜',wall:'▥',gate:'⋂',market:'⚖',blacksmith:'⚒',monastery:'✚',wonder:'♛',age:'✧',economy:'♣',attack:'⚔',armor:'⬟',ranged:'➶',fortification:'♜',husbandry:'♞'};
export const UNITS = {
  villager:{name:'Villager',desc:'Builds, repairs, farms, and gathers every resource.',cost:{food:50},hp:55,damage:3,range:1.9,speed:4.1,time:12,age:0,at:['towncenter'],role:'worker',vision:15},
  scout:{name:'Scout',desc:'Fast reconnaissance. Reveals a wide area; weak in battle.',cost:{food:70},hp:85,damage:5,range:2,speed:7.5,time:16,age:0,at:['towncenter','stable'],role:'cavalry',vision:24},
  spearman:{name:'Spearman',desc:'Cheap defensive infantry. Deals triple damage to cavalry.',cost:{food:60,wood:25},hp:105,damage:10,range:2.5,speed:3.6,time:17,age:0,at:['barracks'],role:'spear',vision:15},
  archer:{name:'Archer',desc:'Ranged infantry. Counters spearmen; vulnerable to cavalry.',cost:{wood:50,gold:25},hp:65,damage:9,range:11,speed:3.7,time:18,age:1,at:['range'],role:'ranged',vision:17},
  swordsman:{name:'Man-at-arms',desc:'Armored frontline infantry. Excels against archers and spears.',cost:{food:75,gold:30},hp:145,damage:16,armor:3,range:2,speed:3.2,time:22,age:1,at:['barracks'],role:'infantry',vision:15},
  knight:{name:'Knight',desc:'Heavy cavalry. Devastates archers; beware of spearmen.',cost:{food:110,gold:65},hp:215,damage:24,armor:3,range:2.4,speed:6.2,time:29,age:2,at:['stable'],role:'cavalry',vision:18},
  ram:{name:'Battering ram',desc:'Slow, armored siege. Crushing damage to buildings.',cost:{wood:170,gold:50},hp:440,damage:38,armor:8,range:3.1,speed:2.5,time:32,age:2,at:['workshop'],role:'siege',vision:14},
  catapult:{name:'Trebuchet',desc:'Long-range siege with splash damage. Protect it with infantry.',cost:{wood:240,gold:150},hp:180,damage:52,range:25,speed:2.1,time:40,age:3,at:['workshop'],role:'siege',vision:23,cooldown:3.8},
  monk:{name:'Healer',desc:'Automatically heals nearby allies. Cannot attack.',cost:{gold:90},hp:65,damage:0,range:10,speed:3.1,time:25,age:2,at:['monastery'],role:'healer',vision:18},
  king:{name:'Sovereign',desc:'Your irreplaceable ruler in Crownfall mode. Protect the sovereign at all costs.',cost:{},hp:360,damage:15,armor:4,range:2,speed:4.2,time:0,age:2,at:[],role:'infantry',vision:20},
};
export const BUILDINGS = {
  towncenter:{name:'Town center',desc:'The heart of your settlement. Trains workers and scouts, advances ages, and receives all resources.',cost:{wood:300,stone:200},hp:2600,r:5,time:65,age:0,cap:15,drop:['food','wood','gold','stone'],damage:13,range:16},
  house:{name:'House',desc:'Adds 10 population capacity.',cost:{wood:55},hp:450,r:2.3,time:18,age:0,cap:10},
  farm:{name:'Farm',desc:'Renewable food source. Assign a villager to harvest.',cost:{wood:65},hp:250,r:3,time:12,age:0,resource:'food'},
  mill:{name:'Mill',desc:'Nearby food drop-off. Reduces walking time for farmers and foragers.',cost:{wood:90},hp:550,r:2.5,time:22,age:0,drop:['food']},
  camp:{name:'Lumber camp',desc:'A timber drop-off near forests.',cost:{wood:80},hp:450,r:2.2,time:18,age:0,drop:['wood']},
  mine:{name:'Mining camp',desc:'A drop-off point for gold and stone.',cost:{wood:85},hp:500,r:2.2,time:20,age:0,drop:['gold','stone']},
  barracks:{name:'Barracks',desc:'Trains spearmen and men-at-arms.',cost:{wood:150},hp:1050,r:3.5,time:30,age:0},
  range:{name:'Archery range',desc:'Trains archers.',cost:{wood:175},hp:950,r:3.5,time:32,age:1},
  stable:{name:'Stable',desc:'Trains scouts and knights.',cost:{wood:180},hp:1100,r:3.5,time:32,age:1},
  workshop:{name:'Siege workshop',desc:'Builds battering rams and trebuchets.',cost:{wood:220,gold:100},hp:1200,r:3.8,time:40,age:2},
  blacksmith:{name:'Blacksmith',desc:'Researches weapons, armor, and ranged upgrades.',cost:{wood:160},hp:900,r:2.8,time:30,age:1},
  market:{name:'Market',desc:'Exchange resources for gold, or buy supplies. Economic research is available here.',cost:{wood:180},hp:900,r:3.4,time:32,age:1},
  tower:{name:'Watchtower',desc:'Automatically fires on enemies. Provides excellent vision.',cost:{wood:90,stone:130},hp:1400,r:2,time:35,age:1,damage:18,range:20,vision:27},
  keep:{name:'Castle',desc:'Powerful fortress with heavy fire and 20 population capacity.',cost:{stone:550,wood:160},hp:4000,r:4.8,time:80,age:2,damage:35,range:23,cap:20,vision:30},
  wall:{name:'Stone wall',desc:'Blocks ground movement and protects your settlement. Tap a start and end or drag, then choose Build wall.',cost:{stone:22},hp:1400,r:1.5,time:14,age:1},
  gate:{name:'Gatehouse',desc:'Friendly units can pass through. Blocks enemy movement.',cost:{stone:90,wood:30},hp:1600,r:2.5,time:24,age:1},
  monastery:{name:'Monastery',desc:'Trains healers. Heal wounded troops between engagements.',cost:{wood:200,gold:80},hp:1100,r:3.4,time:35,age:2},
  wonder:{name:'Grand monument',desc:'Imperial achievement. In Wonder mode, defend it for 4 minutes to win.',cost:{wood:900,gold:900,stone:900},hp:5000,r:5.5,time:120,age:3},
};
export const TECHS = {
  economy:{name:'Efficient tools',desc:'+25% gathering speed per level.',at:['towncenter','market','mill','camp','mine'],cost:{food:120,wood:80},max:3,age:0,time:28},
  attack:{name:'Forged weapons',desc:'+20% melee attack per level.',at:['blacksmith'],cost:{food:130,gold:100},max:3,age:1,time:32},
  armor:{name:'Tempered armor',desc:'+2 armor and +15% maximum health per level.',at:['blacksmith'],cost:{food:100,gold:130},max:3,age:1,time:32},
  ranged:{name:'Bodkin arrows',desc:'+20% ranged attack and +1 range per level.',at:['blacksmith','range'],cost:{wood:120,gold:110},max:3,age:1,time:32},
  fortification:{name:'Masonry',desc:'+30% building health and +15% tower attack per level.',at:['towncenter','keep'],cost:{wood:100,stone:150},max:3,age:1,time:35},
  husbandry:{name:'Husbandry',desc:'+20% cavalry movement speed.',at:['stable'],cost:{food:180,gold:80},max:1,age:1,time:30},
};
export const AGE_COSTS = [{food:350,gold:150},{food:650,gold:350},{food:1000,gold:650}];
export const FACTIONS = {
  alder:{name:'The Alder Kingdom',motto:'Steadfast. Unbroken.',desc:'A resilient kingdom of stone and steel. Buildings have 20% more health; infantry have 15% more health.',color:0x397f8c,bonus:'Fortified buildings · Hardy infantry',buildingHP:1.2,infantryHP:1.15,gather:1,cavalry:1,cost:1},
  sun:{name:'The Sunward Sultanate',motto:'Prosperity is power.',desc:'Master merchants of the sunlit frontier. Gather 18% faster; buildings cost 10% less.',color:0xd4a24e,bonus:'Swift economy · Efficient construction',buildingHP:1,infantryHP:1,gather:1.18,cavalry:1,cost:.9},
  raven:{name:'The Raven Clans',motto:'Ride beyond the horizon.',desc:'Restless riders of the northern highlands. Cavalry move 15% faster and deal 20% more damage.',color:0x9a687d,bonus:'Fearsome cavalry · Fast reconnaissance',buildingHP:1,infantryHP:1,gather:1,cavalry:1.2,cost:1},
};
export const DIFFICULTIES = {
  story:{name:'Explorer',desc:'Room to learn. Slow raids and a forgiving opponent.',attack:220,ai:1.6,wave:.65},
  normal:{name:'Commander',desc:'An active opponent. Balance economy and defense.',attack:150,ai:1,wave:1},
  hard:{name:'Conqueror',desc:'Earlier raids, stronger armies, relentless pressure.',attack:95,ai:.72,wave:1.35},
  brutal:{name:'Legendary',desc:'Rapid expansion and coordinated assaults. Every decision counts.',attack:65,ai:.48,wave:1.75},
};
export const MODES = [
  {id:'tutorial',name:'First light',label:'LEARN TO RULE',desc:'Found your first settlement. A guided introduction to gathering, building, and command.',tag:'Tutorial',objective:'Complete the five settlement lessons.',time:'10–15 min'},
  {id:'skirmish',name:'Clash of crowns',label:'CONQUEST',desc:'Build an empire from a humble frontier village. Destroy every enemy town center to win.',tag:'Skirmish',objective:'Destroy the rival town center.',time:'20–40 min'},
  {id:'regicide',name:'Crownfall',label:'PROTECT THE SOVEREIGN',desc:'Every kingdom has a weakness. Defend your sovereign and hunt the enemy ruler in a Castle Age battle.',tag:'Regicide',objective:'Defeat the rival sovereign. Keep your own ruler alive.',time:'15–30 min'},
  {id:'survival',name:'The last bastion',label:'HOLD THE LINE',desc:'The warbands are coming. Fortify your town and survive ten increasingly dangerous waves.',tag:'Survival',objective:'Survive 10 waves and eliminate their soldiers.',time:'18–25 min'},
  {id:'dominion',name:'The sacred valley',label:'CONTROL THE FRONTIER',desc:'Capture the three ancient shrines with military units. Hold all three for three minutes.',tag:'Dominion',objective:'Hold all 3 shrines for 180 seconds, or destroy the rival town center.',time:'20–35 min'},
  {id:'wonder',name:'An empire eternal',label:'LEAVE A LEGACY',desc:'Reach the Imperial Age, raise a grand monument, and defend it for four minutes.',tag:'Wonder race',objective:'Defend a completed monument for 240 seconds, or conquer the rival.',time:'25–45 min'},
  {id:'sandbox',name:'A quiet kingdom',label:'BUILD WITHOUT PRESSURE',desc:'Shape a peaceful realm with abundant supplies. Explore every unit, building, and technology.',tag:'Sandbox',objective:'Build and explore at your own pace. No enemy attacks.',time:'At your pace'},
];
export const MISSIONS = [
  {id:'campaign1',chapter:'I',name:'A foothold in the wild',desc:'Alder scouts have found fertile land beyond the old border. Raise a barracks, train six soldiers, and break the raider outpost.',objective:'Build a barracks, field 6 soldiers, and destroy the rival town center.',age:0,enemies:3,seed:4301},
  {id:'campaign2',chapter:'II',name:'The broken crossing',desc:'An enemy garrison controls the only crossing. Establish a strong economy and use archers to secure the far bank.',objective:'Reach the Castle Age and destroy the rival town center.',age:1,enemies:9,seed:4302,map:'valley'},
  {id:'campaign3',chapter:'III',name:'A crown of stone',desc:'A border fortress faces a gathering storm. Build a castle and survive eight assaults from the Raven warbands.',objective:'Build a castle and survive 8 waves.',age:2,enemies:0,seed:4303,survival:true,waves:8},
  {id:'campaign4',chapter:'IV',name:'Keepers of the valley',desc:'Three forgotten shrines unite the valley. Capture them before the rival kingdom claims their power.',objective:'Hold all shrines for 180 seconds, or conquer the enemy.',age:2,enemies:15,seed:4304,dominion:true},
  {id:'campaign5',chapter:'V',name:'The final siege',desc:'The enemy capital stands behind walls and towers. Bring siege engines, break the gates, and end the frontier war.',objective:'Destroy the fortified enemy capital.',age:3,enemies:22,seed:4305,fortress:true},
];
export function seededRandom(seed){let s=seed>>>0;const rng=()=>{s=(s+0x6D2B79F5)>>>0;let t=s;t=Math.imul(t^t>>>15,t|1);t^=t+Math.imul(t^t>>>7,t|61);return((t^t>>>14)>>>0)/4294967296;};Object.defineProperty(rng,'state',{get:()=>s,set:value=>s=value>>>0});return rng;}
export function formatTime(t){return `${Math.floor(t/60).toString().padStart(2,'0')}:${Math.floor(t%60).toString().padStart(2,'0')}`;}
export function costText(cost){return Object.entries(cost).map(([r,n])=>`${ICONS[r]} ${Math.ceil(n)}`).join('  ');}
export function availableTo(definition,faction){return !!definition&&(!definition.faction||definition.faction===faction);}

Object.assign(UNITS,{
  sentinel:{name:'Alder sentinel',desc:'Alder unique heavy infantry. Durable against arrows; slow and vulnerable to concentrated siege.',faction:'alder',model:'swordsman',cost:{food:90,gold:55},hp:175,damage:15,armor:6,range:2,speed:2.65,time:26,age:2,at:['barracks'],role:'infantry',vision:15},
  marksman:{name:'Sunward marksman',desc:'Sunward unique longbow infantry. Long reach and 2 armor penetration; slow attacks and vulnerable to cavalry.',faction:'sun',model:'archer',cost:{food:60,gold:60},hp:80,damage:15,armor:0,penetration:2,range:14,speed:3.2,time:28,age:2,at:['range'],role:'ranged',vision:21,cooldown:1.8},
  outrider:{name:'Raven outrider',desc:'Raven unique light cavalry. Fast raiders deal double damage to workers; vulnerable to spearmen and heavy cavalry.',faction:'raven',model:'scout',cost:{food:80,wood:30,gold:30},hp:120,damage:11,armor:0,range:2,speed:8,time:22,age:2,at:['stable'],role:'cavalry',vision:23,workerBonus:2},
});
Object.assign(TECHS,{
  shieldDrill:{name:'Shield drill',desc:'Alder unique technology: infantry and spearmen gain 2 armor.',faction:'alder',at:['blacksmith'],cost:{food:250,gold:200},max:1,age:2,time:45},
  caravanLedger:{name:'Caravan ledger',desc:'Sunward unique technology: market sales yield 90 gold; purchases provide 110 resources.',faction:'sun',at:['market'],cost:{wood:200,gold:250},max:1,age:2,time:45},
  raidingParties:{name:'Raiding parties',desc:'Raven unique technology: cavalry move 10% faster and earn 3 gold for each enemy unit they defeat.',faction:'raven',at:['stable'],cost:{food:300,gold:250},max:1,age:2,time:45},
});
Object.assign(ICONS,{sentinel:'♜',marksman:'➶',outrider:'♞',shieldDrill:'⛨',caravanLedger:'⚖',raidingParties:'⚑'});
UNITS.cart={name:'Supply caravan',desc:'A campaign supply wagon. Escort it with military units; it cannot attack or be trained.',cost:{},hp:240,damage:0,range:0,speed:3.2,time:0,age:0,at:[],role:'quest',vision:14,radius:1.15};
ICONS.cart='▰';
FACTIONS.alder.desc+=' Unique sentinel infantry and Shield drill reinforce the frontline.';
FACTIONS.sun.desc+=' Unique marksmen provide long-range support; Caravan ledger improves market trades.';
FACTIONS.raven.desc+=' Unique outriders raid workers; Raiding parties reward cavalry victories.';

MAPS.coast={name:'The divided coast',desc:'Two kingdoms separated by a wide sea channel. Fish, fight, and land troops across the water.'};
Object.assign(ICONS,{dock:'⚓',fishingboat:'⚓',galley:'⛵',warship:'⛵',transport:'⚓',king:'♛'});
BUILDINGS.dock={name:'Harbor',desc:'Build near the shore. Trains fishing boats, warships, and transports; receives fish.',cost:{wood:180},hp:1400,r:3.6,time:35,age:1,drop:['food'],shore:true};
Object.assign(UNITS,{
  fishingboat:{name:'Fishing boat',desc:'Harvests fish shoals and returns its catch to a harbor. A vulnerable but efficient food economy.',cost:{wood:90},hp:110,damage:0,range:0,speed:4.5,time:20,age:1,at:['dock'],role:'fisher',naval:true,vision:16},
  galley:{name:'Galley',desc:'Swift arrow ship. Protects fishing boats and counters transports.',cost:{wood:180,gold:70},hp:240,damage:18,range:19,speed:5.7,time:30,age:1,at:['dock'],role:'ranged',naval:true,vision:24},
  warship:{name:'Siege galleon',desc:'Heavy, long-range artillery ship. Bombards shoreline fortifications.',cost:{wood:320,gold:220},hp:450,damage:50,armor:4,range:29,speed:3.8,time:45,age:3,at:['dock'],role:'siege',naval:true,vision:30,cooldown:3},
  transport:{name:'Transport ship',desc:'Carries up to 8 land troops. Command troops onto it, sail across, then select a shore to unload.',cost:{wood:140,gold:50},hp:340,damage:0,range:0,speed:5.3,time:25,age:1,at:['dock'],role:'transport',naval:true,vision:20,capacity:8},
});
TECHS.seamanship={name:'Seamanship',desc:'+15% ship speed and +20% ship attack per level.',at:['dock'],cost:{wood:160,gold:120},max:2,age:1,time:35};
ICONS.seamanship='⚓';
MODES.push({id:'tides',name:'Masters of the tide',label:'NAVAL CONQUEST',tag:'Naval warfare',map:'coast',desc:'Two kingdoms face each other across the sea. Fish to grow your economy, escort transports, and land an army on the rival coast.',objective:'Destroy the rival town center. Use transports or Imperial siege ships.',time:'25–45 min'});
MISSIONS.push({id:'campaign6',chapter:'VI',name:'Beyond the horizon',desc:'The frontier war reaches the sea. Establish a fleet, protect the fishing grounds, and carry your army to the enemy capital.',objective:'Destroy the rival coastal capital.',age:2,enemies:12,seed:4306,map:'coast'});
for(const key of Object.keys(ICONS))ICONS[key]+='\uFE0E';

MODES.push({id:'custom',name:'War of the kingdoms',label:'CUSTOM BATTLE',tag:'Custom',desc:'Choose civilizations, allied and enemy teams, independent AI difficulties, large battlefields, and the victory rule. Play solo or host friends.',objective:'Eliminate the opposing kingdoms using the selected victory condition.',time:'At your pace'});
