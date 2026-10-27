import test from 'node:test';
import assert from 'node:assert/strict';
import {Simulation} from '../src/simulation.js';
import {meleeReach,meleeSurfaceDistance} from '../src/melee-contact.js';

function fixture(type='swordsman',building='house',angle=0){
  const sim=new Simulation({mode:'sandbox',map:'highlands',seed:512});sim.entities=[];sim.index=new Map();sim.grids={};sim.revision++;sim.visible.fill(1);sim.tickAI=()=>{};sim.checkVictory=()=>{};
  const target=sim.addBuilding(building,1,0,0,true);target.wallAngle=angle;
  const unit=sim.addUnit(type,0,0,-12);sim.command([unit.id],{type:'attack',target:target.id});return {sim,unit,target};
}

test('melee troops approach the visible faces of buildings before dealing damage',()=>{
  for(const type of ['villager','scout','spearman','swordsman','knight','ram'])for(const building of ['house','keep','wall','gate'])for(const angle of [0,Math.PI/4]){
    const {sim,unit,target}=fixture(type,building,angle),initial=target.hp;let struck=false;
    for(let frame=0;frame<650;frame++){
      sim.time+=.05;sim.tickUnit(unit,.05);const gap=meleeSurfaceDistance(unit,target);
      assert.ok(gap>=-.001,`${type}/${building}: troops do not enter the building footprint`);
      if(target.hp<initial){assert.ok(gap<=meleeReach(unit)+1e-7,`${type}/${building} hit from ${gap}`);struck=true;break;}
    }
    assert.ok(struck,`${type} reaches ${building} at angle ${angle}: ${unit.pathStatus}`);
  }
});

test('melee attacks use the near face rather than the extra building-center allowance',()=>{
  const {sim,unit,target}=fixture();unit.x=target.r+2.5;unit.z=0;const hp=target.hp;
  sim.tickUnit(unit,.05);assert.equal(target.hp,hp,'the old remote hit is rejected');assert.equal(unit.moving,true);
  for(let frame=0;frame<150&&target.hp===hp;frame++){sim.time+=.05;sim.tickUnit(unit,.05);}
  assert.ok(target.hp<hp);assert.ok(meleeSurfaceDistance(unit,target)<=meleeReach(unit));
});

test('ranged units keep their long-distance attacks and a saved melee assault resumes',()=>{
  const {sim,unit,target}=fixture('archer');const x=unit.x,z=unit.z;sim.tickUnit(unit,.05);
  assert.equal(unit.x,x);assert.equal(unit.z,z);assert.equal(sim.projectiles.length,1,'archers prepare a projectile at range');
  const melee=fixture('swordsman','keep');for(let i=0;i<15;i++){melee.sim.time+=.05;melee.sim.tickUnit(melee.unit,.05);}
  const restored=Simulation.restore(JSON.parse(JSON.stringify(melee.sim.serialize()))),attacker=restored.get(melee.unit.id),site=restored.get(melee.target.id),hp=site.hp;
  for(let i=0;i<500&&site.hp===hp;i++){restored.time+=.05;restored.tickUnit(attacker,.05);}
  assert.ok(site.hp<hp,'the saved order reaches and damages its target');assert.ok(meleeSurfaceDistance(attacker,site)<=meleeReach(attacker));
});

test('melee troops can reach a connected hostile wall without walking through it',()=>{
  for(const type of ['swordsman','spearman','ram']){
    const {sim,unit,target}=fixture(type,'wall');for(const x of [-5.7,-2.85,2.85,5.7])sim.addBuilding('wall',1,x,0,true);
    const hp=target.hp;
    for(let frame=0;frame<600&&target.hp===hp;frame++){sim.time+=.05;sim.tickUnit(unit,.05);assert.ok(unit.z<-.725-(unit.r||.65),'the attacker stays on its side of the wall');}
    assert.ok(target.hp<hp,`${type} reaches the connected wall`);assert.ok(meleeSurfaceDistance(unit,target)<=meleeReach(unit));
  }
});

test('a melee assault cannot damage a building through a sealed hostile wall or across unbridged water',()=>{
  for(const obstacle of ['wall','water']){
    const sim=new Simulation({mode:'sandbox',map:obstacle==='water'?'coast':'highlands',seed:512});sim.entities=[];sim.index=new Map();sim.grids={};sim.revision++;sim.visible.fill(1);
    if(obstacle==='wall')for(let x=-80;x<=80;x+=2.85)sim.addBuilding('wall',1,x,0,true);
    const site=sim.addBuilding('house',1,obstacle==='water'?20:0,obstacle==='water'?30:12,true),unit=sim.addUnit('swordsman',0,obstacle==='water'?-20:0,obstacle==='water'?30:-12),hp=site.hp;
    sim.command([unit.id],{type:'attack',target:site.id});for(let i=0;i<180;i++){sim.time+=.1;sim.tickUnit(unit,.1);}
    assert.equal(site.hp,hp,`the ${obstacle} remains a real barrier`);
    if(obstacle==='wall')assert.ok(unit.z<0);else assert.ok(unit.x<0);
  }
});
