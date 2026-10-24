import test from 'node:test';
import assert from 'node:assert/strict';
import {Simulation,distance} from '../src/simulation.js';
import {SpatialBuckets} from '../src/spatial-buckets.js';
import {constructionFace,constructionHeading,constructionPositions,constructionSegmentClear} from '../src/construction-contact.js';
import {workingTarget} from '../src/work-activity.js';
import {entityPerspective} from '../server/entity-perspective.js';
import {constructionNavigationGrid} from '../src/navigation.js';

function fixture(map='highlands'){
  const sim=new Simulation({mode:'sandbox',map,seed:512});sim.entities=[];sim.index=new Map();sim.grids={};sim.entityBuckets=null;sim.revision++;sim.visible.fill(1);return sim;
}
function advance(sim,workers,seconds,onWork=()=>{}){
  const buckets=new SpatialBuckets(4);sim.unitBuckets=buckets.columns;
  for(let n=0;n<Math.ceil(seconds*10);n++){
    buckets.reset();for(const w of workers)buckets.add(w);
    for(const w of workers){const before={x:w.x,z:w.z},target=sim.get(w.order?.target),progress=target?.progress,hp=target?.hp;sim.tickUnit(w,.1);assert.ok(distance(w,before)<1,'the worker walks to the work face');if(target&&(target.progress>progress||target.hp>hp))onWork(w,target);}
    sim.time+=.1;
  }
}

test('the fine approach rejects crossing the building or clipping its padded corner',()=>{
  for(const angle of [0,Math.PI/4]){
    const target={x:7,z:13,r:2.3,wallAngle:angle},c=Math.cos(angle),s=Math.sin(angle),point=(x,z)=>({x:target.x+c*x+s*z,z:target.z-s*x+c*z});
    assert.equal(constructionSegmentClear(point(5,0),point(-5,0),target,.7),false);
    assert.equal(constructionSegmentClear(point(4,0),point(0,4),target,.7),false);
    assert.equal(constructionSegmentClear(point(5,4),point(-5,4),target,.7),true);
  }
});

test('human and AI builders and repairers approach real work faces before changing the building',()=>{
  for(const owner of [0,1])for(const action of ['build','repair'])for(const angle of [0,Math.PI/4,Math.PI/2,Math.PI*1.25]){
    const sim=fixture(),house=sim.addBuilding('house',owner,.25,20.75,action==='repair');if(action==='repair')house.hp-=100;
    const worker=sim.addUnit('villager',owner,house.x+Math.cos(angle)*(house.r+3),house.z+Math.sin(angle)*(house.r+3)),bank=sim.players[owner].resources.wood,before={hp:house.hp,progress:house.progress};worker.order={type:action,target:house.id};
    sim.tickUnit(worker,.1);assert.equal(house.hp,before.hp);assert.equal(house.progress,before.progress);assert.equal(sim.players[owner].resources.wood,bank);
    let strokes=0;advance(sim,[worker],action==='build'?24:10,(w,target)=>{strokes++;const face=constructionFace(w,target);assert.ok(face>=0);assert.equal(w.heading,constructionHeading(target,face));});
    assert.ok(strokes>0);assert.equal(house.progress,1);assert.equal(house.hp,house.maxHp);assert.equal(sim.events.some(e=>e.type==='order-blocked'),false);
  }
});

test('workers inside a new foundation leave its footprint before construction begins',()=>{
  const sim=fixture(),house=sim.addBuilding('house',0,0,20),worker=sim.addUnit('villager',0,0,20);worker.order={type:'build',target:house.id};
  let strokes=0;advance(sim,[worker],24,(w,target)=>{strokes++;assert.ok(constructionFace(w,target)>=0);assert.ok(Math.abs(w.x-target.x)>target.r||Math.abs(w.z-target.z)>target.r);});
  assert.ok(strokes>0);assert.equal(house.progress,1);assert.equal(sim.events.some(e=>e.type==='order-blocked'),false);
});

test('aligned and fractional building sites finish the last step without opening the army grid',()=>{
  for(const type of ['house','mill','towncenter','keep'])for(const shift of [0,.3,1.15]){
    const sim=fixture(),site=sim.addBuilding(type,0,shift,20+shift),worker=sim.addUnit('villager',0,site.x+site.r+6,site.z),normal=sim.grid(0),before=normal.slice();worker.order={type:'build',target:site.id};let strokes=0;
    advance(sim,[worker],8,(w,target)=>{strokes++;assert.ok(constructionFace(w,target)>=0);});
    assert.ok(strokes>0,`${type} at ${shift} is reachable`);assert.deepEqual([...normal],[...before],'a close work approach never opens the global navigation grid');
    const centre=sim.cell(site.x,site.z);assert.equal(sim.grid(0)[centre.z*sim.gridSize+centre.x],1);
  }
});

test('crew members share a private work grid that retains other buildings, resources and water',()=>{
  const sim=fixture('coast'),site=sim.addBuilding('house',0,35,30),other=sim.addBuilding('house',1,42,30,true),tree=sim.addResource('wood',34,35,500),normal=sim.grid(0),before=normal.slice(),grid=constructionNavigationGrid(sim,site,0);
  assert.notStrictEqual(grid,normal);assert.strictEqual(constructionNavigationGrid(sim,site,0),grid);assert.deepEqual(normal,before);
  for(const point of [other,tree,{x:0,z:30}]){const cell=sim.cell(point.x,point.z);assert.equal(grid[cell.z*sim.gridSize+cell.x],1);}
  sim.addBuilding('wall',1,35,36,true);assert.notStrictEqual(constructionNavigationGrid(sim,site,0),grid,'a topology change discards the crew grid');
});

test('rotated gates and wall faces retain accessible work contact',()=>{
  for(const type of ['wall','gate'])for(const angle of [0,Math.PI/4,Math.PI/2]){
    const sim=fixture(),site=sim.addBuilding(type,0,0,20),worker=sim.addUnit('villager',0,9,26);site.wallAngle=angle;worker.order={type:'build',target:site.id};
    let strokes=0;advance(sim,[worker],34,(w,target)=>{strokes++;assert.ok(constructionFace(w,target)>=0);assert.equal(w.heading,constructionHeading(target,constructionFace(w,target)));});
    assert.ok(strokes>0);assert.equal(site.progress,1);
  }
});

test('a rotated wall builder arriving at a face end starts work instead of retrying an already reached point',()=>{
  const sim=fixture(),site=sim.addBuilding('wall',0,-10,8.550000000000002),worker=sim.addUnit('villager',0,-7.32,7.730000000000002);site.wallAngle=Math.PI/2;worker.order={type:'build',target:site.id};
  assert.ok(constructionFace(worker,site)>=0);advance(sim,[worker],16);assert.equal(site.progress,1);assert.equal(sim.events.some(e=>e.type==='order-blocked'),false);
});

test('AI wall-clearing moves reach their safe point instead of stopping inside a future foundation',()=>{
  const sim=fixture(),worker=sim.addUnit('villager',1,-51.715920683883425,4.026892327639348),point={x:-52.010433922646726,z:4.97488462074617},futureWall={x:-49.9,z:2.85};worker.order={type:'move',...point,aiFortification:true};
  advance(sim,[worker],1);assert.equal(worker.order,null);assert.ok(distance(worker,point)<=.05);assert.ok(distance(worker,futureWall)>1.5+worker.r+.12);
});

test('construction cannot reach through a hostile wall or an unbridged sea',()=>{
  for(const map of ['highlands','coast']){
    const sim=fixture(map),site=sim.addBuilding('house',0,25,30),worker=sim.addUnit('villager',0,-25,30),hp=site.hp;
    if(map==='highlands')for(let z=-sim.halfWorld+1;z<=sim.halfWorld-1;z+=2.85)sim.addBuilding('wall',1,0,z,true);
    worker.order={type:'build',target:site.id};advance(sim,[worker],10);
    assert.equal(site.progress,0);assert.equal(site.hp,hp);assert.ok(worker.x<0);assert.ok(sim.events.some(e=>e.type==='order-blocked'&&e.entity.id===worker.id));
  }
});

test('a dock builder uses a land-side work face without walking into the sea',()=>{
  const sim=fixture('coast'),site=sim.addBuilding('dock',0,16,30),worker=sim.addUnit('villager',0,29,30);worker.order={type:'build',target:site.id};let strokes=0;
  advance(sim,[worker],12,(w,target)=>{strokes++;assert.ok(constructionFace(w,target)>=0);assert.equal(sim.isWater(w.x,w.z),false);});
  assert.ok(strokes>0);assert.equal(sim.events.some(e=>e.type==='order-blocked'),false);
});

test('a crew resumes construction from a save without saved cosmetic approach positions',()=>{
  let sim=fixture();const site=sim.addBuilding('wonder',0,.25,20.75),workers=Array.from({length:8},(_,i)=>{const a=i*Math.PI/4,w=sim.addUnit('villager',0,site.x+Math.sin(a)*14,site.z+Math.cos(a)*14);w.order={type:'build',target:site.id};return w;});
  advance(sim,workers,3);sim=Simulation.restore(JSON.parse(JSON.stringify(sim.serialize())));const restored=workers.map(w=>sim.get(w.id)),strokes=new Set();
  advance(sim,restored,65,(w,target)=>{strokes.add(w.id);assert.ok(constructionFace(w,target)>=0);});
  assert.equal(sim.get(site.id).progress,1);assert.equal(strokes.size,workers.length);assert.equal(sim.events.some(e=>e.type==='order-blocked'),false);
});

test('observed construction uses the same contact rule without revealing its target or route',()=>{
  const sim=fixture(),site=sim.addBuilding('house',1,0,20),worker=sim.addUnit('villager',1,0,site.z+site.r+3);worker.order={type:'build',target:site.id};
  assert.equal(workingTarget(sim,worker),null);assert.equal(entityPerspective(sim,0,worker).working,false);
  const point=constructionPositions(worker,site).find(p=>p.face===2);worker.x=point.x;worker.z=point.z;worker.heading=constructionHeading(site,2);worker.moving=false;
  assert.equal(workingTarget(sim,worker),site);const observed=entityPerspective(sim,0,worker);assert.equal(observed.working,true);assert.equal(observed.order,undefined);assert.deepEqual(observed.orders,[]);assert.equal(observed.workApproach,undefined);
});
