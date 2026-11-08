import test from 'node:test';
import assert from 'node:assert/strict';
import {Simulation} from '../src/simulation.js';
import {UNITS} from '../src/data.js';

// A balance gate, not a balance claim. Combat outcomes vary with terrain and
// with who lands the first blow, so each matchup runs on several seeds and the
// intended counter has to win the majority rather than every single fight.
//
// Sandbox mode starts player 0 in the Imperial Age and player 1 in the Dark
// Age, and gives them different civilizations (Alder infantry +15% health
// against Raven cavalry +20% damage). Both sides are levelled here on purpose:
// without this the harness measures the age and civilization gap, not counters.
const BUDGET=600;
const SEEDS=[3,7,11];
const cost=type=>{const c=UNITS[type].cost||{};return (c.food||0)+(c.wood||0)+(c.gold||0)+(c.stone||0);};

function arena(seed){
  const sim=new Simulation({mode:'sandbox',map:'highlands',seed});
  sim.tickAI=()=>{};
  sim.entities=[];sim.index=new Map();sim.revision++;
  for(const player of sim.players){
    player.age=2;player.faction='alder';
    for(const key of Object.keys(player.tech))player.tech[key]=0;
  }
  return sim;
}

function duel(attacker,defender,seed){
  const countA=Math.max(1,Math.round(BUDGET/cost(attacker)));
  const countB=Math.max(1,Math.round(BUDGET/cost(defender)));
  const sim=arena(seed),A=[],B=[];
  for(let i=0;i<countA;i++)A.push(sim.addUnit(attacker,0,-14,(i-(countA-1)/2)*2.2));
  for(let i=0;i<countB;i++)B.push(sim.addUnit(defender,1,14,(i-(countB-1)/2)*2.2));
  sim.command(A.map(e=>e.id),{type:'attack',target:B[0].id});
  sim.command(B.map(e=>e.id),{type:'attack',target:A[0].id});
  for(let t=0;t<900&&!sim.ended;t++)sim.tick(.1);
  return {a:A.filter(e=>e.hp>0).length,b:B.filter(e=>e.hp>0).length};
}

function wins(attacker,defender){
  let won=0;
  for(const seed of SEEDS){const {a,b}=duel(attacker,defender,seed);if(a>b)won++;}
  return won;
}

test('the intended counters still beat what they are meant to beat',()=>{
  const spearsVsHorse=wins('spearman','knight');
  assert.ok(spearsVsHorse>=2,`spearmen must answer cavalry (won ${spearsVsHorse}/${SEEDS.length})`);
  const spearsVsScouts=wins('spearman','scout');
  assert.ok(spearsVsScouts>=2,`spearmen must answer light cavalry (won ${spearsVsScouts}/${SEEDS.length})`);
  const horseVsArchers=wins('knight','archer');
  assert.ok(horseVsArchers>=2,`cavalry must answer archers (won ${horseVsArchers}/${SEEDS.length})`);
  const swordsVsArchers=wins('swordsman','archer');
  assert.ok(swordsVsArchers>=2,`armoured infantry must answer archers (won ${swordsVsArchers}/${SEEDS.length})`);
  const swordsVsSpears=wins('swordsman','spearman');
  assert.ok(swordsVsSpears>=2,`swordsmen must beat spearmen in a straight fight (won ${swordsVsSpears}/${SEEDS.length})`);
});

// A mirror match is not a fairness test: the simulation is deterministic, so
// identical armies on identical ground always produce the same result, and the
// winner flips between five and six units purely on spacing. What looked like a
// player-one advantage was the age gap and the civilization bonuses above.

