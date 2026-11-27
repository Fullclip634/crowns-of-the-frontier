import test from 'node:test';
import assert from 'node:assert/strict';
import {Simulation} from '../src/simulation.js';
import {DIFFICULTIES} from '../src/data.js';
import {BATTLE_SIZES} from '../src/custom-battle.js';
import {canAttackFrom} from '../src/ai-siege.js';
import {dryFootprint} from '../src/battlefield-start.js';

const seed=2026;
const save=sim=>JSON.parse(JSON.stringify(sim.serialize()));
const advance=(sim,seconds)=>{for(let i=0;i<seconds*10&&!sim.ended;i++)sim.tick(.1);};

test('Survival announces real raiders that reach the defenses on both fortified and coastal maps',()=>{
  for(const map of ['bastion','coast']){
    const sim=new Simulation({mode:'survival',map,mapSize:'spacious',seed});
    const waves=[];
    let firstHit;
    sim.on(event=>{
      if(event.type==='wave')waves.push(event.count);
      if(event.type==='attack'&&event.entity.owner===1&&event.target.owner===0)firstHit??=sim.time;
    });
    advance(sim,125);
    assert.deepEqual(waves,[8],map);
    assert.ok(firstHit>=90&&firstHit<125,`${map} raiders never reached a defender`);
    assert.equal(sim.ended,null);
  }
});

test('all ten Survival waves have their full roster and victory waits for the last raider',()=>{
  for(const difficulty of Object.keys(DIFFICULTIES)){
    const sim=new Simulation({mode:'survival',map:'coast',mapSize:'large',difficulty,seed});
    const waves=[];
    sim.on(event=>{if(event.type==='wave')waves.push(event.count);});
    for(let wave=1;wave<=10;wave++){
      sim.spawnWave();
      const raiders=sim.owned(1,'unit');
      assert.equal(sim.wave,wave);
      assert.equal(waves.at(-1),Math.round((5+wave*2.5)*DIFFICULTIES[difficulty].wave));
      assert.equal(raiders.length,waves.at(-1));
      assert.ok(raiders.every(unit=>unit.order?.type==='attack'&&!sim.isWater(unit.x,unit.z)));
      sim.checkVictory();
      assert.equal(sim.ended,null);
      for(const unit of raiders)sim.hurt(unit,unit.hp+1);
      sim.checkVictory();
      assert.equal(sim.ended?.won,wave===10?true:undefined);
    }
  }
});

test('a saved disconnected Survival wave resumes the raid with the original troops',()=>{
  const old=new Simulation({mode:'survival',map:'coast',mapSize:'spacious',seed,replay:true,battlefieldLayout:4});
  old.spawnWave();
  advance(old,20);
  const data=save(old),raiders=old.owned(1,'unit');
  data.options.replay=false;
  const sim=Simulation.restore(data);
  let firstHit=false,announcements=0;
  sim.on(event=>{
    if(event.type==='wave')announcements++;
    if(event.type==='attack'&&raiders.some(unit=>unit.id===event.entity.id)&&event.target.owner===0)firstHit=true;
  });
  for(const unit of raiders)assert.equal(sim.get(unit.id)?.hp,unit.hp);
  advance(sim,40);
  assert.ok(firstHit);
  assert.equal(sim.wave,1);
  assert.equal(announcements,0);
});

test('new Survival games and their replays deploy the same numbered wave',()=>{
  const game=new Simulation({mode:'survival',map:'bastion',mapSize:'spacious',seed});
  const replay=new Simulation({...game.options,replay:true});
  advance(game,105);
  advance(replay,105);
  assert.equal(game.wave,1);
  assert.deepEqual(replay.owned(1,'unit'),game.owned(1,'unit'));
  assert.deepEqual(replay.stats,game.stats);
});

test('water maps keep control objectives on dry, unblocked ground and repair older wet shrines',()=>{
  for(const map of ['coast','templelagoon','archipelago'])for(const mode of ['dominion','koth']){
    const sim=new Simulation({mode,map,mapSize:'spacious',seed});
    const shrines=sim.candidatesFor('shrine');
    assert.equal(shrines.length,mode==='dominion'?3:1);
    for(const shrine of shrines){
      assert.ok(dryFootprint(sim,shrine,shrine.r),`${mode} on ${map}`);
      const cell=sim.cell(shrine.x,shrine.z);
      assert.equal(sim.grid(0)[cell.z*sim.gridSize+cell.x],0);
    }
  }
  const old=new Simulation({mode:'dominion',map:'coast',mapSize:'spacious',seed,replay:true,battlefieldLayout:4});
  const wet=old.candidatesFor('shrine').find(shrine=>old.isWater(shrine.x,shrine.z));
  assert.ok(wet);
  Object.assign(wet,{owner:1,capturer:0,progress:8});
  const data=save(old);
  data.options.replay=false;
  const sim=Simulation.restore(data),shrine=sim.get(wet.id);
  assert.ok(dryFootprint(sim,shrine,shrine.r));
  assert.deepEqual([shrine.owner,shrine.capturer,shrine.progress],[1,0,8]);
});

test('a shrine requires land troops on foot and capital loss takes precedence over a timed win',()=>{
  const sim=new Simulation({mode:'koth',seed});
  const shrine=sim.candidatesFor('shrine')[0],{x,z}=shrine;
  sim.addUnit('transport',0,x,z);
  sim.addUnit('monk',0,x,z);
  const soldier=sim.addUnit('spearman',0,x,z);
  soldier.embarked=true;
  sim.tickShrines(19);
  assert.equal(shrine.owner,-1);
  soldier.embarked=false;
  sim.tickShrines(18);
  assert.equal(shrine.owner,0);
  sim.hold=179.95;
  const capital=sim.owned(0,'building','towncenter')[0];
  sim.hurt(capital,capital.hp+1);
  sim.tick(.1);
  assert.equal(sim.ended?.won,false);
  assert.match(sim.ended.reason,/town center/);
});

test('the coastal AI lands troops and captures every shrine on an Epic map',()=>{
  const sim=new Simulation({mode:'dominion',map:'coast',mapSize:'epic',seed});
  let landed=0;
  sim.on(event=>{if(event.type==='unload'&&event.entity.owner===1)landed+=event.count;});
  advance(sim,400);
  assert.ok(landed>0);
  assert.ok(sim.candidatesFor('shrine').every(shrine=>shrine.owner===1));
  assert.deepEqual(sim.ended,{won:false,reason:'The rival kingdom united the sacred valley.'});
});

test('a replacement Wonder starts a fresh defense clock and preserves it across save and load',()=>{
  const sim=new Simulation({mode:'wonder',seed});
  const first=sim.addBuilding('wonder',0,0,0,true),replacement=sim.addBuilding('wonder',0,16,0,true);
  sim.tickWonderRace(239);
  assert.equal(sim.wonderTime[0],239);
  assert.equal(sim.wonderTargets[0],first.id);
  const restored=Simulation.restore(save(sim));
  const original=restored.get(first.id);
  restored.hurt(original,original.hp+1);
  restored.tickWonderRace(1);
  assert.equal(restored.ended,null);
  assert.equal(restored.wonderTargets[0],replacement.id);
  assert.equal(restored.wonderTime[0],1);
  restored.tickWonderRace(239);
  assert.equal(restored.ended?.won,true);
});

test('Siege Galleons have a firing route toward either Tides capital at every available map size',()=>{
  for(const mapSize of Object.keys(BATTLE_SIZES)){
    const sim=new Simulation({mode:'tides',mapSize,seed});
    for(const owner of [0,1]){
      const dock=sim.owned(owner,'building','dock')[0],capital=sim.owned(1-owner,'building','towncenter')[0];
      const start=sim.spawnPoint(dock,true,'warship');
      assert.ok(start);
      assert.ok(canAttackFrom(sim,{...start,kind:'unit',type:'warship',owner,r:2},capital),`${mapSize} owner ${owner}`);
    }
  }
});

test('Tides can be won by a trained galleon sailing into range and bombarding the rival capital',()=>{
  const sim=new Simulation({mode:'tides',mapSize:'epic',seed});
  sim.tickAI=()=>{};
  for(const enemy of sim.owned(1,'unit'))sim.stop([enemy.id]);
  const defender=sim.owned(1,'unit','galley')[0];
  sim.hurt(defender,defender.hp+1);
  sim.players[0].age=3;
  const dock=sim.owned(0,'building','dock')[0],capital=sim.owned(1,'building','towncenter')[0];
  assert.ok(sim.train(dock.id,'warship'));
  advance(sim,46);
  const ship=sim.owned(0,'unit','warship')[0];
  assert.ok(ship);
  assert.ok(Math.abs(ship.z-capital.z)>100);
  sim.command([ship.id],{type:'attack',target:capital.id});
  advance(sim,360);
  assert.deepEqual(sim.ended,{won:true,reason:'The rival capital has fallen. The frontier is yours.'});
});
