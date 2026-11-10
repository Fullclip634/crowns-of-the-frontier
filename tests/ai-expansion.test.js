import test from 'node:test';
import assert from 'node:assert/strict';
import {Simulation} from '../src/simulation.js';

// The roadmap asks whether the AI can recover after worker losses and exhausted
// nearby resources. Worker recovery is covered elsewhere; this covers expansion:
// given a long match with nobody interfering, both commanders have to keep
// growing, move to distant nodes, and put buildings where those nodes are
// instead of walking across the whole map.
test('both commanders expand to distant resources instead of stalling at home',()=>{
  const sim=new Simulation({mode:'custom',spectator:true,map:'highlands',mapSize:'medium',seed:909});
  const start=sim.entities.length;
  // Reaching out is a capability, not an instant. Sampling only the final tick
  // measured whichever villager happened to be walking back at t=300, which sat
  // about one unit either side of the threshold and flipped on unrelated AI
  // tuning. Track the furthest node each commander ever worked instead.
  const furthest={0:0,1:0};
  let tickCount=0;
  while(sim.time<300&&!sim.ended){
    sim.tick(.1);tickCount++;
    if(tickCount%20)continue;
    for(const owner of [0,1]){
      const homes=sim.owned(owner,'building','towncenter');if(!homes.length)continue;
      for(const villager of sim.owned(owner,'unit','villager')){
        if(villager.order?.type!=='gather')continue;
        const target=villager.order.target?sim.get(villager.order.target):null;
        if(!target)continue;
        // Distance from the nearest owned settlement: a commander that founded a
        // forward town centre has not stopped reaching out, it has moved its base.
        const nearest=Math.min(...homes.map(home=>Math.hypot(target.x-home.x,target.z-home.z)));
        furthest[owner]=Math.max(furthest[owner],nearest);
      }
    }
  }

  assert.equal(sim.ended,null,'neither commander collapses inside five minutes');

  for(const owner of [0,1]){
    const villagers=sim.owned(owner,'unit','villager');
    assert.ok(villagers.length>=12,`commander ${owner} keeps growing its economy (${villagers.length} villagers)`);

    const base=sim.owned(owner,'building','towncenter')[0];
    assert.ok(base,`commander ${owner} still holds a town center`);

    // Forward buildings are the evidence that the economy reached out rather
    // than walking villagers to the far side of the map.
    const camps=sim.owned(owner,'building','camp').filter(e=>e.progress>=1);
    const mines=sim.owned(owner,'building','mine').filter(e=>e.progress>=1);
    assert.ok(camps.length>=1,`commander ${owner} builds a lumber camp`);
    assert.ok(mines.length>=1,`commander ${owner} builds a mining camp`);

    const working=villagers.filter(v=>v.order?.type==='gather');
    assert.ok(working.length>=6,`commander ${owner} keeps its villagers working (${working.length} gathering)`);

    assert.ok(furthest[owner]>30,`commander ${owner} is willing to work distant nodes (furthest ${furthest[owner].toFixed(1)})`);
  }

  assert.ok(sim.entities.length>start,'the world grew rather than shrank');
  assert.ok(sim.entities.every(e=>Number.isFinite(e.hp)&&Number.isFinite(e.x)&&Number.isFinite(e.z)),'every entity stays finite');
});
