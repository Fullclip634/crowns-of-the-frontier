import test from 'node:test';
import assert from 'node:assert/strict';
import {Simulation} from '../src/simulation.js';
import {alliedSupport} from '../src/allied-ai.js';

const slots=teams=>teams.map((team,i)=>({enabled:true,team,controller:i===0?'human':'ai'}));

test('an unreachable allied alarm does not prevent help reaching another threatened teammate',()=>{
  const sim=new Simulation({mode:'custom',map:'highlands',mapSize:'spacious',startAge:1,shareVision:false,slots:slots([1,1,1,2]),seed:512});
  sim.entities=sim.entities.filter(e=>e.kind==='building'&&e.type==='towncenter');
  const isolated=sim.owned(0,'building')[0],tc=sim.owned(1,'building')[0],reachable=sim.owned(2,'building')[0],enemyBase=sim.owned(3,'building')[0];
  Object.assign(isolated,{x:45,z:-5});Object.assign(tc,{x:-65,z:-55});Object.assign(reachable,{x:-45,z:40});Object.assign(enemyBase,{x:90,z:90});
  for(let z=-sim.halfWorld+1;z<sim.halfWorld;z+=3)sim.addBuilding('wall',3,0,z,true);
  const army=Array.from({length:18},(_,i)=>sim.addUnit('spearman',1,-25+i%3*2,-20+Math.floor(i/3)*2));sim.revision++;sim.time=100;
  sim.pathTo(army[0],{x:33,z:-10});assert.equal(army[0].pathStatus,'blocked','the first alarm is across a real continuous hostile wall');
  sim.pathTo(army[0],{x:-45,z:28});assert.equal(army[0].pathStatus,'ready','the other teammate has a real land route');
  sim.teamAlarms={
    ['0:'+isolated.id]:{owner:0,base:isolated.id,x:isolated.x,z:isolated.z,at:sim.time,intensity:500},
    ['2:'+reachable.id]:{owner:2,base:reachable.id,x:reachable.x,z:reachable.z,at:sim.time,intensity:35},
  };
  const before=army.map(e=>[e.id,e.x,e.z]),state={},sent=alliedSupport(sim,1,state,army,[],tc,[]);
  assert.ok(sent.size>=2,'send an available relief group rather than giving up after one blocked route');
  assert.equal(state.support.ally,2);assert.equal(state.support.base,reachable.id);assert.ok(state.support.x<0);
  assert.deepEqual(army.map(e=>[e.id,e.x,e.z]),before,'routing never teleports troops through the wall');
});

test('allied aid follows team membership across uneven, reordered and multiple-alliance custom battles',()=>{
  const configurations=[
    {teams:[1,1,2],owner:1,ally:0,enemy:2},
    {teams:[1,2,1,2],owner:2,ally:0,enemy:1},
    {teams:[1,2,2,1,2],owner:3,ally:0,enemy:2},
    {teams:[1,2,3,1,2,3],owner:5,ally:2,enemy:0},
    {teams:[1,2,1,2,1,2,1,2],owner:6,ally:0,enemy:1},
  ];
  for(const setup of configurations){
    const sim=new Simulation({mode:'custom',map:'highlands',mapSize:'spacious',startAge:1,shareVision:false,slots:slots(setup.teams),seed:512});
    sim.entities=sim.entities.filter(e=>e.kind==='building'&&e.type==='towncenter');sim.revision++;sim.time=100;
    const base=sim.owned(setup.ally,'building')[0],tc=sim.owned(setup.owner,'building')[0],enemy=sim.addUnit('spearman',setup.enemy,base.x+12,base.z),army=Array.from({length:18},(_,i)=>sim.addUnit('spearman',setup.owner,base.x-14-i%4*2,base.z-12-Math.floor(i/4)*2));
    sim.hurt(base,100,enemy);const state={},sent=alliedSupport(sim,setup.owner,state,army,[],tc,[]);
    assert.ok(sent.size>=2,JSON.stringify(setup));assert.equal(state.support.ally,setup.ally);
    assert.ok([...sent].every(id=>sim.get(id).owner===setup.owner));assert.ok(army.length-sent.size>=Math.ceil(army.length*.25));
    assert.equal(state.support.engaging,false,'a private damage report does not reveal the unseen attacker');
  }
});

test('AI can defend a remote human teammate without commanding that human army',()=>{
  const config=slots([1,2,1,1,2]);config[2].controller='human';
  const sim=new Simulation({mode:'custom',multiplayer:true,map:'highlands',mapSize:'spacious',startAge:1,slots:config,seed:512});
  sim.entities=sim.entities.filter(e=>e.kind==='building'&&e.type==='towncenter');sim.revision++;sim.time=100;
  assert.equal(sim.players[2].controller,'human');
  const base=sim.owned(2,'building')[0],tc=sim.owned(3,'building')[0],human=sim.addUnit('knight',2,base.x-15,base.z-15),enemy=sim.addUnit('spearman',1,base.x+12,base.z),army=Array.from({length:18},(_,i)=>sim.addUnit('spearman',3,base.x-14-i%4*2,base.z-12-Math.floor(i/4)*2)),state={};
  sim.hurt(base,100,enemy);const sent=alliedSupport(sim,3,state,[...army,human],[enemy],tc,[]);
  assert.ok(sent.size>=2);assert.equal(state.support.ally,2);assert.ok(!sent.has(human.id));assert.equal(human.order,null);
  assert.equal(alliedSupport(sim,2,{},[human],[enemy],base,[]).size,0);
});
