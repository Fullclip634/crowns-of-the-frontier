import test from 'node:test';
import assert from 'node:assert/strict';
import {restoreProjectileState,nextProjectileId,projectileActor} from '../src/projectile-state.js';

// A restored save must never turn a corrupt projectile record into NaN damage,
// a duplicate impact or an unrenderable flight. These tests drive the sanitiser
// with the shapes a damaged or older save actually produces.
function world(){
  const archer={id:1,kind:'unit',type:'archer',owner:0,x:0,z:0,r:.3,hp:40,maxHp:40,heading:0,cooldown:0};
  const spearman={id:2,kind:'unit',type:'spearman',owner:1,x:6,z:0,r:.3,hp:50,maxHp:50};
  const entities=new Map([[1,archer],[2,spearman]]);
  const sim={players:[{},{ }],halfWorld:100,worldSize:200,time:10,projectiles:[],get:id=>entities.get(id)};
  return {sim,archer,spearman};
}
const flight=(overrides={})=>{
  const {archer,spearman}=world();
  return {id:7,source:1,target:2,owner:0,stage:'flight',releaseAt:9,orderType:null,
    entity:projectileActor(archer),victim:projectileActor(spearman),
    aim:{x:6,z:0},damage:6,releasedAt:9,duration:.3,impactAt:9.3,siege:false,bonus:[],...overrides};
};

test('a damaged save keeps only coherent projectile records',()=>{
  const {sim}=world();
  const kept=restoreProjectileState({projectiles:[
    flight(),
    flight({id:8,stage:'flight',damage:NaN}),
    flight({id:9,stage:'flight',impactAt:9.9}),
    flight({id:10,stage:'flight',entity:{...flight().entity,id:2}}),
    flight({id:11,stage:'flight',aim:{x:1e9,z:0}}),
    flight({id:12,stage:'flight',bonus:[2]}),
    flight({id:13,stage:'teleport'}),
    flight({id:7}),
  ]},sim);
  assert.deepEqual(kept.projectiles.map(shot=>shot.id),[7],'only the coherent record survives');
  assert.equal(kept.projectiles[0].impactAt,9.3);
});

test('prepare records survive without a flight body but still need a live shooter',()=>{
  const {sim}=world();
  const prepare={id:3,source:1,target:2,owner:0,stage:'prepare',releaseAt:10.5,orderType:null};
  const kept=restoreProjectileState({projectiles:[
    prepare,
    {...prepare,id:4,releaseAt:40},
    {...prepare,id:5,source:2},
    {...prepare,id:6,orderType:7},
  ]},sim);
  assert.deepEqual(kept.projectiles.map(shot=>shot.id),[3]);
});

test('restoring cannot lower the projectile id counter',()=>{
  const {sim}=world();
  assert.equal(restoreProjectileState({projectiles:[flight({id:41})],nextProjectileId:9},sim).nextProjectileId,41,'a stale counter is raised to the highest live id');
  assert.equal(restoreProjectileState({projectiles:[flight({id:41})],nextProjectileId:90},sim).nextProjectileId,90,'a valid counter is kept');
  assert.equal(restoreProjectileState({projectiles:[]},sim).nextProjectileId,0);
});

test('new projectile ids skip ids that are still in flight',()=>{
  const {sim}=world();
  sim.projectiles=[{id:3},{id:4}];
  sim.nextProjectileId=2;
  assert.equal(nextProjectileId(sim),5,'a stale counter steps past every live shot');
  assert.equal(nextProjectileId(sim),6,'and keeps counting from there');
  assert.equal(sim.projectileIdsRecycled,true);
  const clear=world().sim;
  clear.nextProjectileId=41;
  assert.equal(nextProjectileId(clear),42,'the ordinary path just increments');
  assert.equal(clear.projectileIdsRecycled,undefined);
});

test('projectile actors copy only the known simulation fields',()=>{
  const actor=projectileActor({id:1,kind:'unit',type:'archer',owner:0,x:1,z:2,r:.3,hp:4,maxHp:5,heading:1,cooldown:0,path:[{x:0}],secret:'x'});
  assert.deepEqual(Object.keys(actor).sort(),['cooldown','heading','hp','id','kind','maxHp','owner','r','type','x','z']);
  assert.equal(actor.secret,undefined);
  assert.equal(actor.path,undefined);
});
