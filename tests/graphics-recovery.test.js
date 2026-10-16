import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {transitionRendererQuality} from '../src/render-quality.js';
import {graphicsCheckpoint} from '../src/graphics-checkpoint.js';

const wait=()=>{let resolve;const promise=new Promise(done=>resolve=done);return {promise,resolve};};
const turn=()=>new Promise(resolve=>setImmediate(resolve));
function fixture(){
  const sim={time:37,units:[{id:1,hp:80,orders:[{type:'gather',target:2}]}]},view={sim,settings:{quality:'high',autoQuality:false},renderQuality:'low',target:new THREE.Vector3(17,2,-9),zoom:36,angle:.4,tilt:.7,scene:new THREE.Scene(),materials:{},camera:new THREE.PerspectiveCamera(),renderer:{shadowMap:{enabled:false},getPixelRatio(){return this.ratio||1;},setPixelRatio(value){this.ratio=value;}},sun:{shadow:{mapSize:{x:1024,y:1024,set(x,y){this.x=x;this.y=y;}}}},updateCamera(){},attach(next){this.sim=next;this.scene.userData.quality=this.settings.quality;this.target.set(0,0,0);}};
  view.scene.userData.quality='low';return {view,sim};
}

test('a partial scene failure rebuilds the previous visuals without changing match data or camera',async()=>{
  const {view,sim}=fixture(),before=structuredClone(sim),target=view.target.clone();
  await assert.rejects(transitionRendererQuality(view,'high',async()=>{},()=>{view.scene.clear();view.scene.userData.quality='broken';throw new Error('forest failed');},()=>graphicsCheckpoint(view)),/forest failed/);
  assert.equal(view.sim,sim);assert.deepEqual(sim,before);assert.equal(view.scene.userData.quality,'low');assert.deepEqual(view.target,target);assert.equal(view.zoom,36);assert.equal(view.angle,.4);assert.equal(view.settings.quality,'low');assert.equal(view.renderQuality,'low');assert.equal(view.graphicsRebuilding,null);assert.equal(view.graphicsLoading,null);assert.equal(view.graphicsFatal,undefined);assert.equal(view.graphicsSceneValid,true);
});

test('recovery rebuilds the current match if a new match replaced the original while shaders were pending',()=>{
  const {view,sim}=fixture(),checkpoint=graphicsCheckpoint(view),newMatch={time:0,units:[{id:9,hp:100}]};
  view.sim=newMatch;view.target.set(-44,1,30);view.zoom=52;checkpoint.restore();checkpoint.release();
  assert.equal(view.sim,newMatch);assert.notEqual(view.sim,sim);assert.deepEqual(view.target.toArray(),[-44,1,30]);assert.equal(view.zoom,52);assert.equal(newMatch.units[0].id,9);
});

test('superseded scene preparation rolls back before the newer replacement starts',async()=>{
  const {view}=fixture(),ready=wait(),events=[];let compiles=0;
  view.renderer.compileAsync=()=>++compiles===1?ready.promise:Promise.resolve();
  const capture=()=>{const checkpoint=graphicsCheckpoint(view);return {restore(options){events.push('restore');checkpoint.restore(options);},release:()=>checkpoint.release()};};
  const first=transitionRendererQuality(view,'high',async()=>{},()=>{events.push('high');view.attach(view.sim);},capture);await turn();
  view.settings.quality='medium';const second=transitionRendererQuality(view,'medium',async()=>{},()=>{events.push('medium');view.attach(view.sim);},capture);await turn();assert.deepEqual(events,['high']);
  ready.resolve();assert.equal(await first,false);assert.equal(await second,true);assert.deepEqual(events,['high','restore','medium']);assert.equal(view.settings.quality,'medium');assert.equal(view.renderQuality,'medium');assert.equal(view.scene.userData.quality,'medium');assert.equal(view.graphicsMutationTail,null);
});

test('a later failed load cannot replace the stable target baseline while an earlier compilation is held',async()=>{
  const {view}=fixture(),ready=wait();view.renderer.compileAsync=()=>ready.promise;
  const first=transitionRendererQuality(view,'high',async()=>{},()=>view.attach(view.sim),()=>graphicsCheckpoint(view));await turn();
  view.settings.quality='medium';await assert.rejects(transitionRendererQuality(view,'medium',()=>Promise.reject(new Error('missing asset')),()=>assert.fail('no rebuild')),/missing asset/);
  assert.equal(view.graphicsRebuilding,1);view.settings.quality='low';const latest=transitionRendererQuality(view,'low',async()=>{},()=>view.attach(view.sim),()=>graphicsCheckpoint(view));await turn();ready.resolve();
  assert.equal(await first,false);assert.equal(await latest,true);assert.equal(view.renderQuality,'low');assert.equal(view.renderer.shadowMap.enabled,false);assert.equal(view.sun.shadow.mapSize.x,1024);assert.equal(view.graphicsMutationTail,null);
});

test('persistent rebuild failure holds invalid graphics and a successful retry clears the fatal state',async()=>{
  const {view,sim}=fixture();
  await assert.rejects(transitionRendererQuality(view,'high',async()=>{},()=>{throw new Error('new scene failed');},()=>({restore(){throw new Error('old scene failed');},release(){}})),AggregateError);
  assert.equal(view.sim,sim);assert.ok(view.graphicsFatal);assert.equal(view.graphicsSceneValid,false);assert.equal(view.graphicsRebuilding,null);assert.equal(view.graphicsMutationTail,null);
  view.settings.quality='low';assert.equal(await transitionRendererQuality(view,'low',async()=>{},()=>view.attach(view.sim),()=>graphicsCheckpoint(view)),true);assert.equal(view.graphicsFatal,null);assert.equal(view.graphicsSceneValid,true);assert.equal(view.sim,sim);
});

test('leaving the page releases a pending transition without rebuilding a disposed battlefield',async()=>{
  const {view}=fixture(),ready=wait();view.renderer.compileAsync=()=>ready.promise;let releases=0;
  const change=transitionRendererQuality(view,'high',async()=>{},()=>view.attach(view.sim),()=>({restore(){assert.fail('Disposed scene must not be restored');},release(){releases++;}}));
  await turn();view.renderingReleased=true;ready.resolve();assert.equal(await change,false);assert.equal(releases,1);assert.equal(view.graphicsMutationTail,null);assert.equal(view.graphicsRebuilding,null);
});
