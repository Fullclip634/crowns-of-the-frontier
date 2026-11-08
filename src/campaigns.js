import {UNITS} from './data.js';
const copy=value=>JSON.parse(JSON.stringify(value));
const army=s=>s.owned(0,'unit').filter(e=>!e.embarked&&!UNITS[e.type].naval&&!['worker','fisher','quest'].includes(UNITS[e.type].role)&&!['scout','king'].includes(e.type));
const completed=(s,type)=>s.owned(0,'building',type).filter(e=>e.progress>=1);
const conquered=s=>!s.owned(1,'building','towncenter').length;
const DIFFICULTY_ORDER=['story','normal','hard','brutal'];
const meetsDifficulty=(sim,level)=>DIFFICULTY_ORDER.indexOf(sim.options.difficulty)>=DIFFICULTY_ORDER.indexOf(level);

// Timed reinforcements and narration. Events fire once, are recorded in the
// campaign history, survive save/restore through campaignState.fired, and never
// spawn on water or outside the map.
function spawnReinforcements(sim,spec){
  const owner=spec.owner??0,anchor=sim.owned(owner,'building','towncenter')[0];if(!anchor)return 0;
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
      {title:'Clear the raider settlement',text:'Destroy the rival town center while protecting your own.',marker:{x:40,z:-34},done:conquered,dialogue:'The first frontier settlement stands. This land now has a future.'},
    ],optional:{text:'Finish with at least eight villagers alive.',done:s=>s.owned(0,'unit','villager').length>=8},
    events:[
      {at:45,id:'c1-foragers',text:'Foragers from the eastern woods ask to join the settlement.',reinforce:{type:'villager',count:2}},
      {at:100,id:'c1-militia',text:'Farmhands arrive from the outlying steadings with spears and shields.',reinforce:{type:'spearman',count:3}},
      {at:150,id:'c1-raid',minDifficulty:'hard',text:'Raiders are massing beyond the ridge. They have seen your walls go up.',reinforce:{owner:1,type:'spearman',count:2}},
    ]},
  campaign2:{speaker:'Quartermaster Sera',intro:'The eastern garrison has cut the supply road. Take the caravan across the central bridge and establish a safe bridgehead. Its loss ends the mission.',cart:{name:'Bridge caravan',x:-34,z:43},
    stages:[
      {title:'Escort the supplies',text:'Escort the caravan to the marked eastern bridgehead. Keep it alive.',marker:{x:20,z:-8},done:(s,q)=>{const cart=s.get(q.cartId);return cart&&!cart.embarked&&Math.hypot(cart.x-20,cart.z+8)<7;},dialogue:'The supplies have reached the far bank. Establish a position before pushing toward the garrison.'},
      {title:'Secure the bridgehead',text:'Complete a watchtower east of the river, or move five land military units onto the eastern bank.',marker:{x:20,z:-8},done:s=>completed(s,'tower').some(e=>e.x>10)||army(s).filter(e=>e.x>10).length>=5,dialogue:'The bridgehead is secure. The garrison can no longer isolate our settlement.'},
      {title:'Break the garrison',text:'Reach the Castle Age and destroy the rival town center. Protect the caravan throughout.',marker:{x:40,z:-34},done:s=>s.players[0].age>=2&&conquered(s),dialogue:'The supply road is open. The caravan will carry word of your victory.'},
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
      {title:'The last bastion',text:'Survive all eight waves, eliminate the attackers, and keep a castle standing.',done:s=>s.wave>=8&&!s.owned(1,'unit').length&&completed(s,'keep').length>0,dialogue:'The last warband has broken. Your stronghold has earned its name.'},
    ],optional:{text:'End with ten villagers alive to rebuild the frontier.',done:s=>s.owned(0,'unit','villager').length>=10},
    events:[
      {at:55,id:'c3-militia',text:'The outlying farms send spearmen to man the walls.',reinforce:{type:'spearman',count:3}},
      {at:115,id:'c3-archers',text:'Hunters arrive with bows and a full quiver.',reinforce:{type:'archer',count:2}},
      {at:90,id:'c3-sortie',minDifficulty:'brutal',when:s=>s.wave<8,text:'A warband sorties early to test the gate.',reinforce:{owner:1,type:'swordsman',count:2}},
    ]},
  campaign4:{speaker:'Keeper Nalin',intro:'Three shrines bind this valley together. Claim their ground with military units and defend the approaches. Conquering the rival capital is an alternative path to victory.',alternativeConquest:true,
    stages:[
      {title:'Claim the first shrine',text:'Capture any shrine with land military units.',marker:{x:-26,z:-23},done:s=>s.entities.some(e=>e.kind==='shrine'&&e.owner===0),dialogue:'The first shrine answers your banner. Its gold can sustain the struggle for the others.'},
      {title:'Unite the valley',text:'Capture all three shrines at the same time.',marker:{x:3,z:1},done:s=>s.entities.filter(e=>e.kind==='shrine').every(e=>e.owner===0),dialogue:'All three banners fly together. The rival will try to break the weakest position.'},
      {title:'Protect the sacred ground',text:'Hold all three shrines continuously for three minutes, or conquer the rival capital.',done:s=>s.hold>=180,dialogue:'The valley is united, and the shrines stand under your protection.'},
    ],optional:{text:'Win by shrine control rather than conquest.',done:(s,q)=>q.route!=='conquest'},
    events:[
      {at:200,id:'c4-pilgrims',when:s=>s.entities.filter(e=>e.kind==='shrine').every(e=>e.owner===0),text:'Pilgrims bring supplies to a valley united under one banner.',reinforce:{type:'villager',count:2}},
    ]},
  campaign5:{speaker:'Marshal Elian',intro:'The enemy capital stands behind gates and stone. Bring siege engines, protect their crews, and open a route for the army.',
    stages:[
      {title:'Assemble the siege train',text:'Field two battering rams or trebuchets.',done:s=>army(s).filter(e=>['ram','catapult'].includes(e.type)).length>=2,dialogue:'The siege train is ready. Keep infantry beside it, and use healers to preserve the escort.'},
      {title:'Breach the defenses',text:'Destroy the enemy gatehouse or a section of its starting wall.',marker:{x:36,z:-5},done:(s,q)=>q.defenses.some(id=>!s.get(id)),dialogue:'There is a breach in the line. Reinforce it before sending the siege engines toward the capital.'},
      {title:'End the frontier war',text:'Destroy the rival town center and defend your own settlement.',marker:{x:40,z:-34},done:conquered,dialogue:'The capital has fallen. The frontier war is over, but the work of rebuilding begins.'},
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
      {title:'Choose the invasion',text:'Land four military units on the eastern coast, or field an Imperial siege galleon.',marker:{x:23,z:-24},done:s=>army(s).filter(e=>e.x>17).length>=4||s.owned(0,'unit','warship').length>0,dialogue:'The invasion is underway. Establish a harbor on the far shore or use the fleet to support your land troops.'},
      {title:'Beyond the horizon',text:'Destroy the rival coastal town center. Land troops and naval artillery can both achieve victory.',marker:{x:40,z:-34},done:conquered,dialogue:'The coast is secure. From a frontier village, your kingdom has reached the horizon.'},
    ],optional:{text:'Complete a harbor on the eastern shore.',done:s=>completed(s,'dock').some(e=>e.x>17)},
    events:[
      {at:60,id:'c6-crews',text:'Fishing crews from the outer banks join the harbour.',reinforce:{type:'villager',count:2}},
      {at:150,id:'c6-marines',text:'Marines disembark to reinforce the beachhead.',reinforce:{type:'spearman',count:3}},
    ]},
  campaign7:{speaker:'Warden Ilya',intro:'The ember road is the only crossing through the cinder reach. Hold the ash pass, break the camp that feeds the raiders, and take the keep above the fields.',
    stages:[
      {title:'Hold the ash pass',text:'Complete a watchtower near the marked pass, or move five land military units onto it.',marker:{x:0,z:0},done:s=>completed(s,'tower').some(e=>Math.hypot(e.x,e.z)<24)||army(s).filter(e=>Math.hypot(e.x,e.z)<16).length>=5,dialogue:'The pass is held. The cinder camp can no longer supply the raiders by night.'},
      {title:'Break the cinder camp',text:'Destroy the rival barracks in the ash fields.',marker:{x:28,z:-24},done:s=>!s.owned(1,'building','barracks').length,dialogue:'The camp is broken. The ember keep stands alone above the road.'},
      {title:'Take the ember keep',text:'Destroy the rival town center and keep your own settlement.',marker:{x:40,z:-34},done:conquered,dialogue:'The ember road is open, and the mountain frontier is yours.'},
    ],optional:{text:'Finish with at least eight villagers alive.',done:s=>s.owned(0,'unit','villager').length>=8},
    events:[
      {at:50,id:'c7-guides',text:'Ash-field guides join you; they know which ground is safe.',reinforce:{type:'villager',count:2}},
      {at:120,id:'c7-wardens',text:'Pass wardens arrive with spears and shields.',reinforce:{type:'spearman',count:3}},
      {at:170,id:'c7-raid',minDifficulty:'hard',text:'Cinder raiders descend the pass to test your line.',reinforce:{owner:1,type:'swordsman',count:2}},
    ]},
  campaign8:{speaker:'Forester Brann',intro:'The deepwood has swallowed the border road. Raise a timber camp, break the ambush waiting under the canopy, and swear the woodfort to your banner.',
    stages:[
      {title:'Raise a timber camp',text:'Complete a lumber camp and field four land military units.',marker:{x:-20,z:45},done:s=>completed(s,'camp').length>0&&army(s).length>=4,dialogue:'The camp is cutting and your escort is ready. The deepwood will not give up its road without a fight.'},
      {title:'Break the ambush',text:'Destroy the rival barracks hidden in the deepwood.',marker:{x:28,z:-24},done:s=>!s.owned(1,'building','barracks').length,dialogue:'The ambush is broken. The woodfort stands exposed beyond the tree line.'},
      {title:'Swear the oath',text:'Destroy the rival town center and keep your own settlement.',marker:{x:40,z:-34},done:conquered,dialogue:'The woodfort swears to your banner. The border road is open again.'},
    ],optional:{text:'Finish with at least ten villagers alive.',done:s=>s.owned(0,'unit','villager').length>=10},
    events:[
      {at:60,id:'c8-woodcutters',text:'Woodcutters from the old camps join your timber crews.',reinforce:{type:'villager',count:2}},
      {at:130,id:'c8-archers',text:'Foresters arrive with hunting bows and a knowledge of the trails.',reinforce:{type:'archer',count:2}},
      {at:180,id:'c8-ambush',minDifficulty:'hard',text:'An ambush party slips through the deepwood toward your camp.',reinforce:{owner:1,type:'spearman',count:3}},
    ]},
  campaign9:{speaker:'Captain Sela',intro:'Frostmarch is cut off and the siege has settled in for the night. Hold the palisade until the relief column can march, then take the war to the camp that feeds their engines.',
    stages:[
      {title:'Hold the line',text:'Keep your town center standing for two and a half minutes while the siege waves break against it.',seconds:150,done:(s,q)=>q.elapsed>=150,dialogue:'Dawn is breaking and the palisade still stands. The siege camp is exposed and short of men.'},
      {title:'Break the siege camp',text:'Destroy the rival barracks that supplies the siege waves.',marker:{x:28,z:-24},done:s=>!s.owned(1,'building','barracks').length,dialogue:'The camp is burning. Their engines have no crews left to replace.'},
      {title:'End the siege',text:'Destroy the rival town center and keep your own settlement.',marker:{x:40,z:-34},done:conquered,dialogue:'Frostmarch holds, and the road south is open again.'},
    ],optional:{text:'Hold with a completed watchtower and eight villagers alive.',done:s=>completed(s,'tower').length>0&&s.owned(0,'unit','villager').length>=8},
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
      {title:'Break the last claim',text:'Destroy the rival keep, then their town center.',marker:{x:40,z:-34},done:conquered,dialogue:'The last claim is broken. The frontier is one kingdom at last.'},
    ],optional:{text:'Finish with the ridge still held and twelve villagers alive.',done:s=>(completed(s,'keep').length>0||completed(s,'tower').length>0)&&s.owned(0,'unit','villager').length>=12},
    events:[
      {at:70,id:'c10-veterans',text:'Veterans of the border war answer the summons.',reinforce:{type:'swordsman',count:3}},
      {at:110,id:'c10-siege',text:'A siege train arrives from the southern workshops.',reinforce:{type:'ram',count:1}},
      {at:160,id:'c10-counter',text:'The rival claim throws its household guard at the ridge.',reinforce:{owner:1,type:'knight',count:3}},
      {at:210,id:'c10-guard',minDifficulty:'hard',text:'Their last guard marches under the crown banner.',reinforce:{owner:1,type:'sentinel',count:2}},
    ]},
};

function initializeStory(sim){
  const script=CAMPAIGN_SCRIPTS[sim.options.mode];if(!script)return;
  const q=sim.campaignState={stage:0,stageAt:0,elapsed:0,fish:0,clock:0,finished:false,route:'objectives',history:[{time:0,speaker:script.speaker,text:script.intro}],defenses:sim.owned(1,'building').filter(e=>['wall','gate'].includes(e.type)).map(e=>e.id),optional:false,fired:[],resolved:[]};
  if(script.cart){const cart=sim.addUnit('cart',0,script.cart.x,script.cart.z);cart.displayName=script.cart.name;q.cartId=cart.id;}
  sim.campaignCheckpoint=null;
}
export function campaignObjective(sim){const q=sim.campaignState,script=CAMPAIGN_SCRIPTS[sim.options.mode];return !q||q.legacy||q.finished||!script?null:{...script.stages[Math.min(q.stage,script.stages.length-1)],index:q.stage,total:script.stages.length,optional:script.optional.text,cart:q.cartId?sim.get(q.cartId):null,fish:q.fish,elapsed:q.elapsed||0};}

export function installCampaigns(Simulation){
  const p=Simulation.prototype,initialize=p.initialize,tick=p.tick,end=p.end,emit=p.emit,serialize=p.serialize,restore=Simulation.restore;
  p.initialize=function(){initialize.call(this);initializeStory(this);if(this.campaignState)this.campaignCheckpoint=copy({...serialize.call(this),campaignState:this.campaignState,checkpointTag:true});};
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
      q.history.push({time:this.time,speaker:script.speaker,text:event.text});
      this.emit('campaign-event',{id:event.id,text:event.text,enemy:!!event.reinforce&&(event.reinforce.owner??0)!==0});
    }
    if(q.cartId&&!this.get(q.cartId)){end.call(this,false,'The supply caravan was lost. Restore a checkpoint or begin the escort again.');return;}
    if(script.alternativeConquest&&conquered(this)){q.route='conquest';q.stage=script.stages.length;q.finished=true;q.optional=false;end.call(this,true,'The rival capital has fallen. The valley is secured by conquest.');return;}
    const stage=script.stages[q.stage];if(!stage?.done(this,q))return;
    q.history.push({time:this.time,speaker:script.speaker,text:stage.dialogue});q.stage++;q.stageAt=this.time;q.elapsed=0;this.emit('campaign-stage',{title:stage.title,text:stage.dialogue,stage:q.stage,total:script.stages.length});
    if(q.stage>=script.stages.length){q.finished=true;q.optional=!!script.optional.done(this,q);end.call(this,true,stage.dialogue);return;}
    this.campaignCheckpoint=copy({...serialize.call(this),campaignState:q,checkpointTag:true});this.emit('campaign-checkpoint',{stage:q.stage});
  };
  p.serialize=function(){return {...serialize.call(this),campaignState:this.campaignState||null,campaignCheckpoint:this.campaignCheckpoint||null};};
  Simulation.restore=function(data){const sim=restore.call(this,data);sim.campaignState=data.campaignState?copy(data.campaignState):sim.mission?{legacy:true}:null;sim.campaignCheckpoint=data.campaignCheckpoint?copy(data.campaignCheckpoint):data.checkpointTag?copy(data):null;return sim;};
}
