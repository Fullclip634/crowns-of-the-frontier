import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {installCombatPresentation} from '../src/combat-presentation.js';
import {combatJointAngle} from '../src/combat-poses.js';
import {releaseDelay,projectileTargetHeight} from '../src/combat-timing.js';
import {attackFlight} from '../src/battle-effects.js';

test('bows draw before release, open after release and interpolate between simulation steps',()=>{
 const unit={type:'archer',kind:'unit',moving:false,order:{type:'attack',target:9}},joint={type:'forearm',side:1},interval=1.2,delay=releaseDelay(unit);
 const angle=age=>combatJointAngle({...unit,cooldown:interval-age},joint);
 assert.ok(angle(delay)<angle(0)-.5);assert.ok(angle(delay+.2)>angle(delay)+.5);
 const midway=combatJointAngle({...unit,cooldown:interval},joint,delay/2);assert.ok(midway<angle(0)&&midway>angle(delay));
 assert.equal(combatJointAngle({...unit,cooldown:interval,moving:true},joint),null);
});

test('authoritative flight and impact use the same building or artillery endpoint height',()=>{
 const view={entityHeight:e=>e.kind==='building'?4:2};
 for(const type of ['archer','catapult','warship'])for(const kind of ['unit','building']){
  const target={kind,type:kind==='unit'?'knight':'keep',x:10,z:10},source={kind:'unit',type,x:0,z:0,cooldown:3.4},siege=type!=='archer';
  const shot=attackFlight(view,source,target,0,{pendingImpact:true,flightDuration:.65,releasedAt:1,aimX:10,aimZ:10});
  assert.equal(shot.to.y,view.entityHeight(target)+projectileTargetHeight(target,siege));assert.equal(shot.impact,false);
 }
});

test('paused camera pans reveal in-flight meshes once without replaying or hiding their fixed age',()=>{
 class View{attach(sim){this.sim=sim;this.fx=[];}render(){}effect(event){this.fx.push({event});}}
 installCombatPresentation(View);const view=new View();view.target=new THREE.Vector3(500,0,0);view.zoom=44;view.angle=0;view.tilt=.6;view.camera=new THREE.PerspectiveCamera(45,1,.1,1000);view.camera.position.set(500,30,40);view.camera.lookAt(view.target);view.entityHeight=()=>0;
 const shot={id:1,stage:'flight',entity:{id:2,kind:'unit',type:'archer',owner:0,x:0,z:0},victim:{id:3,kind:'unit',type:'knight',owner:1,x:0,z:10},aim:{x:0,z:10},bonus:[],releasedAt:0,duration:.65,impactAt:.65};
 const sim={time:.2,options:{},projectiles:[shot]};view.attach(sim);view.render(0,false);assert.equal(view.fx.length,0);
 view.target.x=0;view.camera.position.x=0;view.camera.lookAt(view.target);view.render(0,false);assert.equal(view.fx.length,1);assert.equal(view.fx[0].event.flightAge,.2);
 view.render(0,false);view.target.x=1;view.render(0,false);assert.equal(view.fx.length,1,'seen shots stay deduplicated while panning');
 view.attach({...sim});view.render(0,false);assert.equal(view.fx.length,1,'scene recovery recreates the current flight once');
});
