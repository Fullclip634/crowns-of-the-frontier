import test from 'node:test';
import assert from 'node:assert/strict';
import {Simulation} from '../src/simulation.js';
import {battlePreset} from '../src/custom-battle.js';
import {readLocalSave,writeLocalSave} from '../src/local-save.js';

const memory=()=>{const data=new Map();return {getItem:key=>data.get(key)??null,setItem:(key,value)=>data.set(key,value)};};
const local=()=>new Simulation({mode:'custom',mapSize:'spacious',seed:721,slots:battlePreset('2v2')});

test('a saved allied AI battle restores resources, orders, map and AI state',()=>{
  const storage=memory(),sim=local(),worker=sim.owned(0,'unit','villager')[0];sim.players[0].resources.gold=1234;sim.time=73;sim.aiStates[1]={attackAt:450};sim.smartCommand([worker.id],null,worker.x+8,worker.z+5);
  assert.equal(writeLocalSave(sim,{storage}),'saved');const restored=Simulation.restore(readLocalSave(storage));assert.equal(restored.time,73);assert.equal(restored.players[0].resources.gold,1234);assert.equal(restored.worldSize,sim.worldSize);assert.ok(restored.allied(0,1));assert.deepEqual(restored.aiStates,sim.aiStates);assert.deepEqual(restored.get(worker.id).order,worker.order);assert.notEqual(restored.players[0],sim.players[0]);
});

test('active, disconnected and left multiplayer snapshots never overwrite the local kingdom',()=>{
  const storage=memory(),sim=local();assert.equal(writeLocalSave(sim,{storage}),'saved');const original=storage.getItem('crowns-save');
  const network=new Simulation({mode:'custom',mapSize:'spacious',seed:512,multiplayer:true});network.players[1].resources.gold=0;network.aiStates=null;
  for(const networkActive of [true,false]){assert.equal(writeLocalSave(network,{storage,networkActive}),'network');assert.equal(storage.getItem('crowns-save'),original);}
  // The live connection also protects a transitional snapshot before its
  // options have been applied, without serializing it or touching storage.
  let serialized=false;assert.equal(writeLocalSave({options:{},serialize(){serialized=true;}},{storage,networkActive:true}),'network');assert.equal(serialized,false);assert.equal(storage.getItem('crowns-save'),original);
  assert.equal(writeLocalSave(null,{storage}),'unavailable');assert.equal(storage.getItem('crowns-save'),original);
});

test('legacy network saves are not offered as local matches and are preserved for diagnosis',()=>{
  const storage=memory(),network=new Simulation({mode:'skirmish',seed:512,multiplayer:true}),raw=JSON.stringify(network.serialize());storage.setItem('crowns-save',raw);assert.equal(readLocalSave(storage),null);assert.equal(storage.getItem('crowns-save'),raw);
  const old=new Simulation({mode:'tutorial',seed:512});assert.equal(old.options.multiplayer,undefined);storage.setItem('crowns-save',JSON.stringify(old.serialize()));assert.equal(Simulation.restore(readLocalSave(storage)).options.mode,'tutorial');
});

test('unavailable storage, quota failures and malformed data do not report a successful save',()=>{
  const sim=local(),unavailable={getItem(){throw new Error('disabled');},setItem(){throw new Error('quota');}};assert.equal(readLocalSave(unavailable),null);assert.equal(writeLocalSave(sim,{storage:unavailable}),'storage');
  const storage=memory();for(const raw of [null,'{broken','null']){storage.setItem('crowns-save',raw);assert.equal(readLocalSave(storage),null);}
  const original=sim.serialize;sim.serialize=()=>{throw new Error('serialization failed');};assert.equal(writeLocalSave(sim,{storage}),'storage');sim.serialize=original;assert.equal(writeLocalSave(sim,{storage}),'saved');
});
