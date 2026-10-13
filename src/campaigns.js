import {UNITS} from './data.js';
const copy=value=>JSON.parse(JSON.stringify(value));
const army=s=>s.owned(0,'unit').filter(e=>!e.embarked&&!UNITS[e.type].naval&&!['worker','fisher','quest'].includes(UNITS[e.type].role)&&!['scout','king'].includes(e.type));
const completed=(s,type)=>s.owned(0,'building',type).filter(e=>e.progress>=1);
const conquered=s=>!s.owned(1,'building','towncenter').length;

export const CAMPAIGN_SCRIPTS={
  campaign1:{speaker:'Marshal Elian',intro:'Our people need a foothold before they need a war. Stock the settlement, raise another roof, and prepare a company to defend it.',
    stages:[
      {title:'A settlement supplied',text:'Gather 250 resources and complete a third house.',done:s=>s.stats.gathered>=250&&completed(s,'house').length>=3,dialogue:'The storehouses are filling. A settlement survives through many hands; keep your workers safe.'},
      {title:'A company assembled',text:'Field six land military units. Scouts and caravans do not count.',done:s=>army(s).length>=6,dialogue:'Your company is ready. Spears stop riders; a mixed army will survive longer than a single line of troops.'},
      {title:'Clear the raider settlement',text:'Destroy the rival town center while protecting your own.',marker:{x:40,z:-34},done:conquered,dialogue:'The first frontier settlement stands. This land now has a future.'},
    ],optional:{text:'Finish with at least eight villagers alive.',done:s=>s.owned(0,'unit','villager').length>=8}},
  campaign2:{speaker:'Quartermaster Sera',intro:'The eastern garrison has cut the supply road. Take the caravan across the central bridge and establish a safe bridgehead. Its loss ends the mission.',cart:{name:'Bridge caravan',x:-34,z:43},
    stages:[
      {title:'Escort the supplies',text:'Escort the caravan to the marked eastern bridgehead. Keep it alive.',marker:{x:20,z:-8},done:(s,q)=>{const cart=s.get(q.cartId);return cart&&!cart.embarked&&Math.hypot(cart.x-20,cart.z+8)<7;},dialogue:'The supplies have reached the far bank. Establish a position before pushing toward the garrison.'},
      {title:'Secure the bridgehead',text:'Complete a watchtower east of the river, or move five land military units onto the eastern bank.',marker:{x:20,z:-8},done:s=>completed(s,'tower').some(e=>e.x>10)||army(s).filter(e=>e.x>10).length>=5,dialogue:'The bridgehead is secure. The garrison can no longer isolate our settlement.'},
      {title:'Break the garrison',text:'Reach the Castle Age and destroy the rival town center. Protect the caravan throughout.',marker:{x:40,z:-34},done:s=>s.players[0].age>=2&&conquered(s),dialogue:'The supply road is open. The caravan will carry word of your victory.'},
    ],optional:{text:'Complete the escort with the caravan above half health.',done:(s,q)=>(s.get(q.cartId)?.hp||0)>s.get(q.cartId)?.maxHp*.5}},
  campaign3:{speaker:'Castellan Maera',intro:'The warbands are gathering beyond the ridge. Raise a castle, protect your economy, and prepare for eight assaults.',
    stages:[
      {title:'Raise the stronghold',text:'Complete a castle before the final waves arrive.',done:s=>completed(s,'keep').length>0,dialogue:'Stone is only the beginning. Repair your defenses and keep producing reinforcements.'},
      {title:'Hold through the first assaults',text:'Survive until the fourth wave arrives with a castle standing.',done:s=>s.wave>=4&&completed(s,'keep').length>0,dialogue:'The early attacks were a test. Siege engines will follow; meet them outside your walls when you can.'},
      {title:'The last bastion',text:'Survive all eight waves, eliminate the attackers, and keep a castle standing.',done:s=>s.wave>=8&&!s.owned(1,'unit').length&&completed(s,'keep').length>0,dialogue:'The last warband has broken. Your stronghold has earned its name.'},
    ],optional:{text:'End with ten villagers alive to rebuild the frontier.',done:s=>s.owned(0,'unit','villager').length>=10}},
  campaign4:{speaker:'Keeper Nalin',intro:'Three shrines bind this valley together. Claim their ground with military units and defend the approaches. Conquering the rival capital is an alternative path to victory.',alternativeConquest:true,
    stages:[
      {title:'Claim the first shrine',text:'Capture any shrine with land military units.',marker:{x:-26,z:-23},done:s=>s.entities.some(e=>e.kind==='shrine'&&e.owner===0),dialogue:'The first shrine answers your banner. Its gold can sustain the struggle for the others.'},
      {title:'Unite the valley',text:'Capture all three shrines at the same time.',marker:{x:3,z:1},done:s=>s.entities.filter(e=>e.kind==='shrine').every(e=>e.owner===0),dialogue:'All three banners fly together. The rival will try to break the weakest position.'},
      {title:'Protect the sacred ground',text:'Hold all three shrines continuously for three minutes, or conquer the rival capital.',done:s=>s.hold>=180,dialogue:'The valley is united, and the shrines stand under your protection.'},
    ],optional:{text:'Win by shrine control rather than conquest.',done:(s,q)=>q.route!=='conquest'}},
  campaign5:{speaker:'Marshal Elian',intro:'The enemy capital stands behind gates and stone. Bring siege engines, protect their crews, and open a route for the army.',
    stages:[
      {title:'Assemble the siege train',text:'Field two battering rams or trebuchets.',done:s=>army(s).filter(e=>['ram','catapult'].includes(e.type)).length>=2,dialogue:'The siege train is ready. Keep infantry beside it, and use healers to preserve the escort.'},
      {title:'Breach the defenses',text:'Destroy the enemy gatehouse or a section of its starting wall.',marker:{x:36,z:-5},done:(s,q)=>q.defenses.some(id=>!s.get(id)),dialogue:'There is a breach in the line. Reinforce it before sending the siege engines toward the capital.'},
      {title:'End the frontier war',text:'Destroy the rival town center and defend your own settlement.',marker:{x:40,z:-34},done:conquered,dialogue:'The capital has fallen. The frontier war is over, but the work of rebuilding begins.'},
    ],optional:{text:'Finish with at least one siege engine surviving.',done:s=>army(s).some(e=>['ram','catapult'].includes(e.type))}},
  campaign6:{speaker:'Admiral Iven',intro:'The final frontier lies beyond the water. Secure a fishing economy, prepare the fleet, then choose a landing force or long-range naval siege.',
    stages:[
      {title:'Secure the fishing grounds',text:'Bring home 150 food with fishing boats.',done:(s,q)=>q.fish>=150,dialogue:'The fishing crews are supplying the fleet. Protect them; ships cannot replace a working economy.'},
      {title:'Choose the invasion',text:'Land four military units on the eastern coast, or field an Imperial siege galleon.',marker:{x:23,z:-24},done:s=>army(s).filter(e=>e.x>17).length>=4||s.owned(0,'unit','warship').length>0,dialogue:'The invasion is underway. Establish a harbor on the far shore or use the fleet to support your land troops.'},
      {title:'Beyond the horizon',text:'Destroy the rival coastal town center. Land troops and naval artillery can both achieve victory.',marker:{x:40,z:-34},done:conquered,dialogue:'The coast is secure. From a frontier village, your kingdom has reached the horizon.'},
    ],optional:{text:'Complete a harbor on the eastern shore.',done:s=>completed(s,'dock').some(e=>e.x>17)}},
};

function initializeStory(sim){
  const script=CAMPAIGN_SCRIPTS[sim.options.mode];if(!script)return;
  const q=sim.campaignState={stage:0,fish:0,clock:0,finished:false,route:'objectives',history:[{time:0,speaker:script.speaker,text:script.intro}],defenses:sim.owned(1,'building').filter(e=>['wall','gate'].includes(e.type)).map(e=>e.id),optional:false};
  if(script.cart){const cart=sim.addUnit('cart',0,script.cart.x,script.cart.z);cart.displayName=script.cart.name;q.cartId=cart.id;}
  sim.campaignCheckpoint=null;
}
export function campaignObjective(sim){const q=sim.campaignState,script=CAMPAIGN_SCRIPTS[sim.options.mode];return !q||q.legacy||q.finished||!script?null:{...script.stages[Math.min(q.stage,script.stages.length-1)],index:q.stage,total:script.stages.length,optional:script.optional.text,cart:q.cartId?sim.get(q.cartId):null,fish:q.fish};}

export function installCampaigns(Simulation){
  const p=Simulation.prototype,initialize=p.initialize,tick=p.tick,end=p.end,emit=p.emit,serialize=p.serialize,restore=Simulation.restore;
  p.initialize=function(){initialize.call(this);initializeStory(this);if(this.campaignState)this.campaignCheckpoint=copy({...serialize.call(this),campaignState:this.campaignState,checkpointTag:true});};
  p.emit=function(type,data={}){if(type==='gathered'&&data.owner===0&&data.source==='fishingboat'&&this.campaignState&&!this.campaignState.legacy)this.campaignState.fish+=data.amount;emit.call(this,type,data);};
  p.end=function(won,reason){if(won&&this.campaignState&&!this.campaignState.legacy&&!this.campaignState.finished)return;end.call(this,won,reason);};
  p.tick=function(dt){tick.call(this,dt);const q=this.campaignState,script=CAMPAIGN_SCRIPTS[this.options.mode];if(!q||q.legacy||q.finished||this.ended)return;
    q.clock+=dt;if(q.clock<.5)return;q.clock=0;
    if(q.cartId&&!this.get(q.cartId)){end.call(this,false,'The supply caravan was lost. Restore a checkpoint or begin the escort again.');return;}
    if(script.alternativeConquest&&conquered(this)){q.route='conquest';q.stage=script.stages.length;q.finished=true;q.optional=false;end.call(this,true,'The rival capital has fallen. The valley is secured by conquest.');return;}
    const stage=script.stages[q.stage];if(!stage?.done(this,q))return;
    q.history.push({time:this.time,speaker:script.speaker,text:stage.dialogue});q.stage++;this.emit('campaign-stage',{title:stage.title,text:stage.dialogue,stage:q.stage,total:script.stages.length});
    if(q.stage>=script.stages.length){q.finished=true;q.optional=!!script.optional.done(this,q);end.call(this,true,stage.dialogue);return;}
    this.campaignCheckpoint=copy({...serialize.call(this),campaignState:q,checkpointTag:true});this.emit('campaign-checkpoint',{stage:q.stage});
  };
  p.serialize=function(){return {...serialize.call(this),campaignState:this.campaignState||null,campaignCheckpoint:this.campaignCheckpoint||null};};
  Simulation.restore=function(data){const sim=restore.call(this,data);sim.campaignState=data.campaignState?copy(data.campaignState):sim.mission?{legacy:true}:null;sim.campaignCheckpoint=data.campaignCheckpoint?copy(data.campaignCheckpoint):data.checkpointTag?copy(data):null;return sim;};
}
