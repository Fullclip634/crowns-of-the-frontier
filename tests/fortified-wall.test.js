import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {Simulation} from '../src/simulation.js';
import {BUILDINGS,TECHS,ICONS} from '../src/data.js';
import {technologyTreeMarkup} from '../src/technology-tree.js';
import {ICON_MAP,UI_ICONS} from '../src/ui-icons.js';
import {WallVisuals} from '../src/wall-visuals.js';
import {FORTIFIED_WALL_HP,FORTIFIED_GATE_HP,FORTIFIED_WALL_ARMOR,FORTIFIED_WALL_TECH,wallTier,wallBaseHP,wallTierStyle} from '../src/fortified-walls.js';

const fund=sim=>{sim.players[0].resources={food:9000,wood:9000,gold:9000,stone:9000};return sim;};
const sandbox=()=>fund(new Simulation({mode:'sandbox'}));

test('Stone Wall stays the unchanged base tier and the Fortified Wall is a single Castle-Age upgrade',()=>{
  assert.equal(BUILDINGS.wall.name,'Stone wall');
  assert.equal(BUILDINGS.wall.hp,1400);
  assert.equal(BUILDINGS.wall.age,1);
  assert.equal(BUILDINGS.wall.time,14);
  assert.deepEqual(BUILDINGS.wall.cost,{stone:22});
  assert.equal(BUILDINGS.gate.hp,1600);
  assert.equal(BUILDINGS.wonder.hp,5000);
  assert.equal(FORTIFIED_WALL_HP,4000);
  assert.equal(FORTIFIED_GATE_HP,4000);
  assert.ok(FORTIFIED_WALL_HP<BUILDINGS.wonder.hp,'base fortified HP stays below the Wonder');
  const d=TECHS[FORTIFIED_WALL_TECH];
  assert.equal(d.age,2);
  assert.equal(d.max,1);
  assert.deepEqual(d.at,['towncenter','keep']);
  assert.ok(d.time>0);
  assert.ok(Object.values(d.cost).every(n=>n>0));
  // No third placeable wall tier was introduced.
  assert.equal(Object.keys(BUILDINGS).filter(type=>type.includes('wall')).join(','),'wall');
  assert.ok(ICONS[FORTIFIED_WALL_TECH]);
});

test('the upgrade is gated behind the Castle Age, optional, and researchable at a town center or keep',()=>{
  const s=sandbox(),tc=s.addBuilding('towncenter',0,0,20,true),keep=s.addBuilding('keep',0,16,20,true);
  s.players[0].age=1;
  const before={...s.players[0].resources};
  assert.equal(s.research(tc.id,FORTIFIED_WALL_TECH),false,'Feudal Age cannot fortify walls');
  assert.deepEqual(s.players[0].resources,before,'a rejected upgrade spends nothing');
  assert.equal(s.players[0].tech[FORTIFIED_WALL_TECH],0);
  s.players[0].age=2;
  assert.equal(s.research(keep.id,FORTIFIED_WALL_TECH),true,'a Castle is a valid research site');
  assert.equal(s.research(tc.id,FORTIFIED_WALL_TECH),false,'a duplicate research is refused');
  assert.equal(keep.queue.length,1);
});

test('completion upgrades existing and future walls and gatehouses to 4000 base HP while preserving damage ratios',()=>{
  const s=sandbox(),tc=s.addBuilding('towncenter',0,0,20,true);
  s.players[0].age=2;
  const wall=s.addBuilding('wall',0,8,30,true),gate=s.addBuilding('gate',0,12,30,true),house=s.addBuilding('house',0,16,30,true);
  assert.equal(wallBaseHP(s,wall),1400);
  assert.equal(wallTier(s,wall),'stone');
  wall.hp=wall.maxHp*.5;
  const houseHP=house.maxHp;
  assert.equal(s.research(tc.id,FORTIFIED_WALL_TECH),true);
  const revision=s.revision;
  tc.queue[0].remaining=.01;s.tickBuilding(tc,.1);
  assert.equal(s.players[0].tech[FORTIFIED_WALL_TECH],1);
  assert.ok(s.revision>revision,'a structural upgrade invalidates cached render state');
  assert.equal(wallTier(s,wall),'fortified');
  assert.equal(wallBaseHP(s,wall),4000);
  assert.equal(wall.maxHp,4000*1.2);
  assert.equal(gate.maxHp,4000*1.2);
  assert.ok(Math.abs(wall.hp/wall.maxHp-.5)<1e-9,'damaged walls keep their health fraction');
  assert.equal(house.maxHp,houseHP,'ordinary buildings are untouched');
  const future=s.addBuilding('wall',0,20,30,true);
  assert.equal(future.maxHp,4000*1.2,'walls built after the upgrade inherit it');
  const enemy=s.addBuilding('wall',1,24,30,true);
  assert.equal(enemy.maxHp,1400,'the upgrade applies only to its owner');
});

test('Alder plus level-3 Masonry reaches exactly 9120 HP and damage pacing stays measurable',()=>{
  const s=sandbox();
  s.players[0].tech.fortification=3;
  s.players[0].tech[FORTIFIED_WALL_TECH]=1;
  const wall=s.addBuilding('wall',0,10,20,true);
  assert.equal(wall.maxHp,9120);
  assert.equal(wall.maxHp,4000*1.2*(1+3*.3));
  // Identical attacker, identical target: only the masonry armor changes.
  const p=sandbox(),target=p.addBuilding('wall',0,10,20,true),ram=p.addUnit('ram',1,12,20);
  const normal=p.attackDamage(ram,target);
  p.players[0].tech[FORTIFIED_WALL_TECH]=1;
  const fortified=p.attackDamage(ram,target);
  assert.equal(normal-fortified,FORTIFIED_WALL_ARMOR);
  assert.ok(fortified>0);
  // 4000 HP / 109 per ram hit is far slower than 1400 HP / 113 per hit.
  const stoneHits=Math.ceil(1400/normal),fortifiedHits=Math.ceil(4000/fortified);
  assert.ok(fortifiedHits>stoneHits*2.8,`siege pacing ${stoneHits} -> ${fortifiedHits} hits`);
  assert.equal(p.attackDamage(p.addUnit('archer',1,14,20),target),1,'ranged chip damage keeps its floor');
});

test('saves keep the upgrade and older saves initialize it without changing existing research',()=>{
  const s=sandbox(),tc=s.addBuilding('towncenter',0,0,20,true);
  s.players[0].age=2;s.players[0].tech.armor=2;
  assert.equal(s.research(tc.id,FORTIFIED_WALL_TECH),true);
  tc.queue[0].remaining=.01;s.tickBuilding(tc,.1);
  const wall=s.addBuilding('wall',0,8,20,true);
  const restored=Simulation.restore(JSON.parse(JSON.stringify(s.serialize())));
  assert.equal(restored.players[0].tech[FORTIFIED_WALL_TECH],1);
  assert.equal(restored.players[0].tech.armor,2);
  assert.equal(restored.get(wall.id).maxHp,4000*1.2);
  const legacy=JSON.parse(JSON.stringify(sandbox().serialize()));
  for(const player of legacy.players)delete player.tech[FORTIFIED_WALL_TECH];
  const older=Simulation.restore(legacy);
  assert.equal(older.players[0].tech[FORTIFIED_WALL_TECH],0);
  assert.equal(wallBaseHP(older,{kind:'building',type:'wall',owner:0}),1400);
});

test('the technology tree and icon set surface the new upgrade',()=>{
  const s=sandbox();
  s.players[0].age=2;
  const markup=technologyTreeMarkup(s,'alder');
  assert.match(markup,/Fortified walls/);
  assert.match(markup,/data-tree-tech="fortifiedWall"/);
  assert.equal(ICON_MAP[FORTIFIED_WALL_TECH],'castle');
  assert.match(UI_ICONS[FORTIFIED_WALL_TECH],/<svg\b/);
});

test('fortified connectors stay in two batches, change height and tint, and invalidate their cache',()=>{
  const sim=sandbox();sim.entities=[];sim.index=new Map();sim.revision++;sim.visible.fill(1);
  const a=sim.addBuilding('wall',0,0,20,true),b=sim.addBuilding('wall',0,3,20,true);
  const view={sim,objects:new THREE.Group(),geo:{box:new THREE.BoxGeometry()},materials:{stone:new THREE.MeshStandardMaterial(),stoneDark:new THREE.MeshStandardMaterial()},entityHeight:()=>0,groundHeight:()=>0};
  const visual=new WallVisuals(view);
  try{
    visual.update(false);
    assert.equal(visual.meshes.length,2);
    assert.equal(view.wallDiagnostics.batches,2);
    const stoneBefore=visual.stone.instanceMatrix.array.slice(),version=visual.stone.instanceMatrix.version;
    visual.update(false);
    assert.equal(visual.stone.instanceMatrix.version,version,'static connectors avoid repeated uploads');
    sim.players[0].tech[FORTIFIED_WALL_TECH]=1;
    visual.update(false);
    assert.equal(visual.meshes.length,2,'the heavier tier adds no draw batches');
    assert.equal(view.wallDiagnostics.batches,2);
    assert.notDeepEqual(Array.from(visual.stone.instanceMatrix.array.slice(0,16)),Array.from(stoneBefore.slice(0,16)),'the masonry silhouette grows');
    assert.ok(visual.stone.instanceColor,'per-instance colour carries the heavier stone');
    const color=new THREE.Color();visual.stone.getColorAt(0,color);
    assert.ok(color.r<1,'fortified stone is visibly darker');
    assert.ok(wallTierStyle('fortified').height>wallTierStyle('stone').height);
  }finally{
    visual.dispose();view.geo.box.dispose();for(const material of Object.values(view.materials))material.dispose();
  }
});
