import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {Simulation} from '../src/simulation.js';
import {battlePreset} from '../src/custom-battle.js';
import {SelectionOverlays,AFFILIATION_COLORS,selectionAffiliation,selectionColorHex,tacticalRangeRadius} from '../src/selection-overlays.js';
import {entityAffiliation,entityBarRatio,entityDisplayName,entityStatusText,inspectorEyebrow,inspectorStatsMarkup} from '../src/entity-inspector.js';
import {renderHealthBars} from '../src/health-layer.js';

function fakeLayer(){
  const makeEl=tag=>{
    const el={
      tagName:tag.toUpperCase(),className:'',style:{},textContent:'',hidden:false,children:[],parent:null,
      append(...nodes){for(const n of nodes){n.parent=el;el.children.push(n);}},
      remove(){if(!el.parent)return;const i=el.parent.children.indexOf(el);if(i>=0)el.parent.children.splice(i,1);el.parent=null;},
    };
    return el;
  };
  const layer=makeEl('div');
  layer.ownerDocument={createElement:makeEl};
  return layer;
}

test('SelectionOverlays renders color-coded marks for units, allies, enemies, trees, resources, shrines, rally flags, and range circles',()=>{
  const sim=new Simulation({mode:'custom',map:'highlands',mapSize:'spacious',seed:512,startAge:1,slots:battlePreset('2v2')});
  const scene=new THREE.Scene();
  const mineUnit=sim.addUnit('spearman',0,-10,10);
  const allyUnit=sim.addUnit('knight',1,-6,10);
  const enemyUnit=sim.addUnit('archer',2,10,-10);
  const enemyTower=sim.addBuilding('tower',2,18,-12,true);
  const mineBarracks=sim.addBuilding('barracks',0,-14,14,true);
  mineBarracks.rally={x:-4,z:22,target:null};
  const gold=sim.addResource('gold',4,4,800);
  const tree=sim.addResource('wood',8,8,240);
  const shrine=sim.addShrine(0,0);

  // Simulate jittered instanced tree visual matrix (+0.35m offset from simulation cell)
  const treeMatrix=new THREE.Matrix4().makeTranslation(8.35,1.2,7.75);
  const enemyTowerNode=new THREE.Group();
  const towerRing=new THREE.Mesh(new THREE.RingGeometry(.95,1,16),new THREE.MeshBasicMaterial({color:0xffffff}));
  towerRing.visible=false;
  enemyTowerNode.add(towerRing);
  enemyTowerNode.userData.ring=towerRing;

  const view={
    sim,scene,clock:1.5,angle:Math.PI/4,
    settings:{reducedMotion:false},
    selection:new Set([mineUnit.id,allyUnit.id,enemyUnit.id,gold.id,tree.id]),
    nodes:new Map([[enemyTower.id,enemyTowerNode]]),
    forest:[{entries:[tree],matrices:[treeMatrix]}],
    groundHeight:()=>1.0,
    landscape:{surfaceHeightAt:()=>1.0},
  };

  const overlays=new SelectionOverlays(view);
  overlays.update(false);

  assert.equal(overlays.rings.count,5,'all 5 selected non-building entities receive instanced ground rings');
  assert.equal(overlays.rings.visible,true);

  const color=new THREE.Color();
  const matrix=new THREE.Matrix4();
  const pos=new THREE.Vector3();

  // Verify exact affiliation colors on the 5 rings: mine, ally, enemy, gold, tree
  overlays.rings.getColorAt(0,color);assert.equal(color.getHex(),AFFILIATION_COLORS.mine,'friendly unit ring is emerald');
  overlays.rings.getColorAt(1,color);assert.equal(color.getHex(),AFFILIATION_COLORS.ally,'ally unit ring is royal cyan');
  overlays.rings.getColorAt(2,color);assert.equal(color.getHex(),AFFILIATION_COLORS.enemy,'enemy unit ring is crimson');
  overlays.rings.getColorAt(3,color);assert.equal(color.getHex(),AFFILIATION_COLORS.resource,'gold mine ring is harvest amber');
  overlays.rings.getColorAt(4,color);assert.equal(color.getHex(),AFFILIATION_COLORS.resource,'tree ring is harvest amber');

  // Tree ring snaps to exact jittered visual trunk coordinates rather than raw cell center
  overlays.rings.getMatrixAt(4,matrix);
  pos.setFromMatrixPosition(matrix);
  assert.ok(Math.abs(pos.x-8.35)<1e-3&&Math.abs(pos.z-7.75)<1e-3,`tree ring matches exact visual trunk (${pos.x.toFixed(2)},${pos.z.toFixed(2)})`);

  // Verify production building rally flag + dotted ground path
  view.selection=new Set([mineBarracks.id]);
  overlays.update(false);
  assert.equal(overlays.rallyPoles.count,1,'selected production building displays 3D rally flagpole');
  assert.equal(overlays.rallyPennants.count,1,'selected production building displays fluttering rally pennant');
  assert.ok(overlays.rallyDots.count>=2,'rally ground path draws dotted line to rally point');

  // Verify enemy watchtower gets crimson ring + attack range preview circle
  view.selection=new Set([enemyTower.id]);
  overlays.update(false);
  assert.equal(towerRing.visible,true,'enemy building ring becomes visible on selection');
  assert.equal(towerRing.material.color.getHex(),AFFILIATION_COLORS.enemy,'enemy building ring turns crimson');
  assert.equal(overlays.rangeMesh.visible,true,'enemy watchtower shows defensive attack range ring');
  assert.equal(overlays.rangeMat.color.getHex(),AFFILIATION_COLORS.enemy);
  assert.equal(tacticalRangeRadius(sim,enemyTower),20);

  // Verify shrine shows 7m capture range circle + hover preview works without selecting
  view.selection=new Set([shrine.id]);
  view.hoverEntityId=mineUnit.id;
  overlays.update(false);
  assert.equal(overlays.rangeMesh.visible,true,'selected shrine displays 7m capture perimeter');
  assert.equal(overlays.rings.count,2,'selected shrine plus hovered unit both render rings');

  // Verify clean disposal
  overlays.dispose();
  assert.equal(scene.children.includes(overlays.group),false,'disposal removes overlay group from scene');
});

test('entity-inspector exposes complete stats for enemies, allies, buildings, resources, and shrines with real depletion bars',()=>{
  const sim=new Simulation({mode:'custom',map:'highlands',mapSize:'spacious',seed:512,startAge:1,slots:battlePreset('2v2')});
  const enemySpear=sim.addUnit('spearman',2,10,10);
  const allyKnight=sim.addUnit('knight',1,-6,6);
  const enemyTower=sim.addBuilding('tower',2,14,14,true);
  const minePalisade=sim.addBuilding('wall',0,-12,12,true);
  const gold=sim.addResource('gold',-2,2,800);
  gold.amount=200; // 25% left!
  const shrine=sim.addShrine(0,0);
  shrine.progress=9; // 50% captured!

  assert.equal(entityAffiliation(sim,enemySpear),'enemy');
  assert.equal(entityAffiliation(sim,allyKnight),'ally');
  assert.equal(entityAffiliation(sim,gold),'resource');
  assert.equal(selectionAffiliation(sim,enemyTower),'enemy');
  assert.equal(selectionColorHex(sim,allyKnight),AFFILIATION_COLORS.ally);

  // Real resource depletion bar & shrine capture progress
  assert.equal(entityBarRatio(gold),0.25,'depleted gold mine shows 25% bar instead of 100%');
  assert.equal(entityBarRatio(shrine),0.5,'half-captured shrine shows 50% capture bar');
  assert.match(entityStatusText(sim,gold),/200 \/ 800 Gold/);
  assert.match(entityStatusText(sim,shrine),/Capturing 50%/);

  // Enemy & ally units expose full combat stats and specialty tags
  const enemyStats=inspectorStatsMarkup(sim,enemySpear);
  assert.match(enemyStats,/ATK<b>\d+<\/b>/,'enemy unit displays upgraded ATK');
  assert.match(enemyStats,/ARM<b>\d+<\/b>/,'enemy unit displays ARM');
  assert.match(enemyStats,/3× vs Cavalry/,'enemy spearman displays counter tag');

  // Enemy tower exposes defensive stats without leaking hidden garrison count
  const towerStats=inspectorStatsMarkup(sim,enemyTower);
  assert.match(towerStats,/ATK<b>\d+×3<\/b>/,'tower shows volley damage');
  assert.match(towerStats,/RNG<b>20m<\/b>/,'tower shows firing range');
  assert.match(towerStats,/GARR<b>Cap 8<\/b>/,'enemy tower shows capacity without leaking hidden occupants');

  // Wall tier badge & resource stat chips
  assert.match(inspectorStatsMarkup(sim,minePalisade),/Wooden Palisade/);
  assert.equal(entityDisplayName(sim,gold),'Gold ore');
  assert.match(inspectorStatsMarkup(sim,gold),/TYPE<b>Gold<\/b>/);
  assert.match(inspectorStatsMarkup(sim,gold),/GATHER<b>Villager<\/b>/);
  assert.match(inspectorEyebrow(sim,enemySpear),/ENEMY/);
  assert.match(inspectorEyebrow(sim,allyKnight),/ALLY/);
});

test('renderHealthBars styles allied units in cyan and renders amber stock/capture bars for selected resources and shrines',()=>{
  const sim=new Simulation({mode:'custom',map:'highlands',mapSize:'spacious',seed:512,startAge:1,slots:battlePreset('2v2')});
  const ally=sim.addUnit('swordsman',1,0,0);
  const gold=sim.addResource('gold',5,5,1000);
  gold.amount=350;
  const unselectedTree=sim.addResource('wood',8,8,240);
  sim.isVisible=()=>true;
  sim.isExplored=()=>true;

  const layer=fakeLayer();
  const view={
    selection:new Set([ally.id,gold.id]),
    project:e=>({x:200+e.x*4,y:200+e.z*4,visible:true}),
  };

  renderHealthBars(layer,sim,view,{width:1280,height:720});
  assert.equal(layer.children.length,2,'renders bars for selected ally and selected resource only (skips unselected tree)');

  const allyBar=layer.children.find(c=>c.className.includes('ally'));
  const resBar=layer.children.find(c=>c.className.includes('resource'));
  assert.ok(allyBar,'allied unit receives distinct ally class');
  assert.ok(resBar,'selected resource receives amber resource world bar');
  assert.equal(resBar.children[0].style.width,'35.0%','resource world bar reflects real 35% remaining stock');
  assert.equal(resBar.children[1].textContent,'350','resource world bar shows remaining amount');
  assert.ok(unselectedTree.id>0);
});
