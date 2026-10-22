import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {WorldView} from '../src/world.js';
import {releaseEffect} from '../src/battle-effects.js';

test('the complete 3D effect layer retains final lit particles and volumetric healing geometry across quiet gaps',()=>{
  const view={settings:{quality:'high'},fx:[],scene:new THREE.Scene(),groundHeight:()=>3,entityHeight:()=>3,sim:{isVisible:()=>true}};
  let firstBurst,firstHeal,disposed=0;
  for(let cycle=0;cycle<5;cycle++){
    WorldView.prototype.burst.call(view,0,0,0xc3a17a,1.5);WorldView.prototype.effect.call(view,{type:'heal',entity:{kind:'unit',type:'monk',owner:0,x:0,z:0},target:{kind:'unit',type:'spearman',owner:0,x:1,z:0}});
    assert.equal(view.fx.length,2);const burst=view.fx.find(f=>f.particles),heal=view.fx.find(f=>f.heal);
    if(!cycle){firstBurst=burst.object;firstHeal=heal.object;for(const object of [firstBurst,firstHeal]){object.geometry.addEventListener('dispose',()=>disposed++);object.material.addEventListener('dispose',()=>disposed++);}}
    assert.equal(burst.object,firstBurst);assert.equal(heal.object,firstHeal);assert.equal(burst.object.geometry,view.impactEffects.geometry.burst);assert.equal(heal.object.geometry,view.impactEffects.geometry.heal);
    assert.ok(burst.object.material.isMeshStandardMaterial);assert.equal(burst.object.material.depthWrite,true);assert.equal(burst.object.position.y,3.4);assert.equal(heal.groundY,3);assert.equal(heal.object.material.forceSinglePass,false);
    for(const object of [burst.object,heal.object]){object.geometry.computeBoundingBox();const size=object.geometry.boundingBox.getSize(new THREE.Vector3());assert.ok(size.x>0&&size.y>0&&size.z>0,'Keep solid 3D forms');}
    for(const effect of view.fx)releaseEffect(effect);view.fx=[];assert.equal(view.scene.children.length,0);assert.equal(disposed,0);
  }
  view.impactEffects.dispose();assert.equal(disposed,4);
});
