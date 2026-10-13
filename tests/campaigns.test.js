import test from 'node:test';
import assert from 'node:assert/strict';
import {Simulation} from '../src/simulation.js';
import {campaignObjective,CAMPAIGN_SCRIPTS} from '../src/campaigns.js';
const advance=(s,seconds)=>{for(let i=0;i<seconds*10;i++)s.tick(.1);};
const quiet=mode=>{const s=new Simulation({mode,difficulty:'story'});s.tickAI=()=>{};return s;};

test('campaign settlement progresses through paid construction and training, freezes checkpoints, and completes conquest',()=>{
  const s=quiet('campaign1'),worker=s.owned(0,'unit','villager')[0],barracks=s.owned(0,'building','barracks')[0];
  assert.ok(s.build('house',-36,49,[worker.id]));for(let i=0;i<6;i++)assert.ok(s.train(barracks.id,'spearman'));advance(s,125);
  assert.equal(s.campaignState.stage,2);assert.equal(s.ended,null);assert.ok(s.stats.gathered>=250);assert.ok(s.campaignCheckpoint);
  const snapshot=JSON.stringify(s.campaignCheckpoint);s.command([worker.id],{type:'move',x:-20,z:50});advance(s,3);assert.equal(JSON.stringify(s.campaignCheckpoint),snapshot);
  const restored=Simulation.restore(JSON.parse(snapshot));assert.equal(restored.campaignState.stage,2);assert.ok(restored.campaignCheckpoint);assert.equal(restored.ended,null);
  const tc=s.owned(1,'building','towncenter')[0];s.hurt(tc,tc.hp,barracks);advance(s,1);assert.equal(s.ended.won,true);assert.ok(s.campaignState.finished);assert.ok(s.campaignState.optional);
});
test('destroying a capital early does not skip the current campaign objectives',()=>{
  const s=quiet('campaign1'),tc=s.owned(1,'building','towncenter')[0];s.hurt(tc,tc.hp,s.owned(0,'unit','scout')[0]);advance(s,2);
  assert.equal(s.ended,null);assert.equal(s.campaignState.stage,0);assert.match(campaignObjective(s).text,/250/);
});
test('caravan escort uses a reachable bridge route, remains distinct from the catalog, and recovers from loss through checkpoints',()=>{
  const s=quiet('campaign2'),cart=s.get(s.campaignState.cartId),soldiers=s.owned(0,'unit').filter(e=>['spearman','archer'].includes(e.type));
  assert.equal(cart.displayName,'Bridge caravan');s.guard(soldiers.map(e=>e.id),cart.id);s.command([cart.id],{type:'move',x:20,z:-8});advance(s,100);
  assert.ok(s.campaignState.stage>=1);assert.ok(cart.x>10);assert.ok(cart.hp>0);assert.ok(s.campaignCheckpoint);
  const checkpoint=JSON.parse(JSON.stringify(s.campaignCheckpoint));s.hurt(cart,cart.hp+1,s.owned(1,'unit')[0]);advance(s,1);assert.equal(s.ended.won,false);assert.match(s.ended.reason,/caravan/);
  const restored=Simulation.restore(checkpoint);assert.ok(restored.get(restored.campaignState.cartId));assert.equal(restored.ended,null);assert.equal(restored.campaignState.stage,checkpoint.campaignState.stage);
});
test('fortress defense requires a completed stronghold and all waves before victory',()=>{
  const s=quiet('campaign3');for(let i=0;i<8;i++)s.spawnWave();for(const unit of s.owned(1,'unit'))s.hurt(unit,unit.hp,s.owned(0,'unit')[0]);advance(s,1);assert.equal(s.ended,null);
  const workers=s.owned(0,'unit','villager').slice(0,3);assert.ok(s.build('keep',-36,49,workers.map(e=>e.id)));advance(s,110);
  assert.ok(s.campaignState.finished);assert.equal(s.ended.won,true);assert.equal(s.campaignState.stage,3);
});
test('sacred valley supports both continuous shrine control and a recorded conquest alternative',()=>{
  const s=quiet('campaign4'),shrines=s.entities.filter(e=>e.kind==='shrine'),soldiers=s.owned(0,'unit').filter(e=>['spearman','archer'].includes(e.type));
  shrines.forEach((shrine,i)=>s.command(soldiers.slice(i*3,i*3+3).map(e=>e.id),{type:'move',x:shrine.x,z:shrine.z}));advance(s,260);
  assert.equal(s.ended?.won,true);assert.ok(s.campaignState.optional);assert.equal(s.campaignState.route,'objectives');
  const alternate=quiet('campaign4'),tc=alternate.owned(1,'building','towncenter')[0];alternate.hurt(tc,tc.hp,alternate.owned(0,'unit')[0]);advance(alternate,1);
  assert.equal(alternate.ended.won,true);assert.equal(alternate.campaignState.route,'conquest');assert.equal(alternate.campaignState.optional,false);
});
test('coastal campaign counts deposited fishing catch and permits a paid naval artillery route',()=>{
  const s=quiet('campaign6');s.emit('gathered',{owner:0,source:'villager',resource:'food',amount:500});assert.equal(s.campaignState.fish,0);advance(s,180);
  assert.ok(s.campaignState.fish>=150);assert.equal(s.campaignState.stage,1);
  const tc=s.owned(0,'building','towncenter')[0],dock=s.owned(0,'building','dock')[0];assert.ok(s.research(tc.id,'age'));advance(s,100);assert.ok(s.train(dock.id,'warship'));advance(s,50);
  assert.equal(s.campaignState.stage,2);const enemy= s.owned(1,'building','towncenter')[0];s.hurt(enemy,enemy.hp,s.owned(0,'unit','warship')[0]);advance(s,1);assert.equal(s.ended.won,true);
});
test('final siege progresses through paid siege production and an actual gate attack before conquest',()=>{
  const s=quiet('campaign5'),workers=s.owned(0,'unit','villager').slice(0,2);assert.ok(s.build('workshop',-36,49,workers.map(e=>e.id)));advance(s,65);
  const workshop=s.owned(0,'building','workshop')[0];assert.equal(workshop.progress,1);assert.ok(s.train(workshop.id,'ram'));assert.ok(s.train(workshop.id,'ram'));advance(s,80);assert.equal(s.campaignState.stage,1);
  const gate=s.owned(1,'building','gate')[0],rams=s.owned(0,'unit','ram');s.command(rams.map(e=>e.id),{type:'attack',target:gate.id});advance(s,100);
  assert.ok(!s.get(gate.id));assert.equal(s.campaignState.stage,2);const tc=s.owned(1,'building','towncenter')[0];s.hurt(tc,tc.hp,s.owned(0,'unit')[0]);advance(s,1);assert.equal(s.ended.won,true);
});
test('existing campaign saves retain their legacy rules and do not gain a missing escort requirement',()=>{
  const s=quiet('campaign2'),data=JSON.parse(JSON.stringify(s.serialize()));delete data.campaignState;delete data.campaignCheckpoint;data.entities=data.entities.filter(e=>e.type!=='cart');
  const restored=Simulation.restore(data);assert.ok(restored.campaignState.legacy);assert.equal(campaignObjective(restored),null);assert.equal(restored.campaignCheckpoint,null);
  restored.emit('gathered',{owner:0,source:'fishingboat',resource:'food',amount:75});assert.deepEqual(restored.campaignState,{legacy:true});
});
test('every scripted campaign initializes finite objective actors and a bounded starting checkpoint on all difficulties',()=>{
  for(const mode of Object.keys(CAMPAIGN_SCRIPTS))for(const difficulty of ['story','normal','hard','brutal']){
    const s=new Simulation({mode,difficulty});assert.equal(s.campaignState.stage,0);assert.equal(s.campaignState.history.length,1);assert.ok(s.campaignCheckpoint);assert.ok(JSON.stringify(s.serialize()).length<1000000);
    if(s.campaignState.cartId)assert.ok(s.get(s.campaignState.cartId));assert.ok(s.entities.every(e=>Number.isFinite(e.hp)&&Number.isFinite(e.x)&&Number.isFinite(e.z)));
  }
});
