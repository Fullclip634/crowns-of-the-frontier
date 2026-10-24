import * as THREE from 'three';
import {environmentGenerator,standardMaterial} from './render-runtime.js';
import {UNITS} from './data.js';
import {decorateMaterials} from './world-polish.js';
import {nearViewport,markInstancePrefix} from './render-batches.js';
import {renderPosition} from './motion-smoothing.js';

// Shared materials and one instanced shadow pass keep the depth cues affordable.
function surfaceRelief(material,scale){
  if(!material.map)return;
  material.bumpMap=material.map.clone();
  material.bumpMap.colorSpace=THREE.NoColorSpace;
  material.bumpMap.needsUpdate=true;
  material.bumpScale=scale;
  material.roughness=.88;
  material.needsUpdate=true;
}

function initializeDepth(view){
  const sky=document.createElement('canvas');sky.width=128;sky.height=64;
  const c=sky.getContext('2d'),gradient=c.createLinearGradient(0,0,0,64);
  gradient.addColorStop(0,'#7ba3c3');gradient.addColorStop(.47,'#d7e3e8');
  gradient.addColorStop(.53,'#e4d5b1');gradient.addColorStop(1,'#465538');
  c.fillStyle=gradient;c.fillRect(0,0,128,64);
  const source=new THREE.CanvasTexture(sky);source.colorSpace=THREE.SRGBColorSpace;
  source.mapping=THREE.EquirectangularReflectionMapping;
  const generator=environmentGenerator(view.renderer);
  view.environmentTarget=generator.fromEquirectangular(source);
  view.scene.environment=view.environmentTarget.texture;view.scene.environmentIntensity=.3;
  source.dispose();generator.dispose();

  const m=view.materials;
  surfaceRelief(m.stone,.12);surfaceRelief(m.wood,.055);
  for(const roof of view.roofMaterials)surfaceRelief(roof,.085);
  m.plaster.color.setHex(0xd9c8a6);m.stone.color.setHex(0xb6b5a4);
  m.stoneDark.color.setHex(0x737e78);m.iron.metalness=.8;m.iron.roughness=.32;
  m.gold.metalness=.75;m.gold.roughness=.3;m.shadow.opacity=.06;
  m.glass=standardMaterial({color:0x263e42,roughness:.3,metalness:.08});
  m.timberEdge=standardMaterial({color:0x473328,roughness:.92});
  view.geo.head=new THREE.SphereGeometry(1,10,8);
  view.geo.torso=new THREE.CylinderGeometry(.47,.53,1,8);
  view.geo.shield=new THREE.CylinderGeometry(.5,.5,1,12).rotateZ(Math.PI/2);
  view.geo.sphere.dispose();view.geo.sphere=new THREE.IcosahedronGeometry(1,1);

  const shadowCanvas=document.createElement('canvas');shadowCanvas.width=shadowCanvas.height=64;
  const context=shadowCanvas.getContext('2d'),fade=context.createRadialGradient(32,32,3,32,32,32);
  fade.addColorStop(0,'rgba(14,26,20,.65)');fade.addColorStop(.45,'rgba(14,26,20,.34)');fade.addColorStop(1,'rgba(14,26,20,0)');
  context.fillStyle=fade;context.fillRect(0,0,64,64);
  const map=new THREE.CanvasTexture(shadowCanvas);map.colorSpace=THREE.SRGBColorSpace;
  const material=new THREE.MeshBasicMaterial({map,transparent:true,opacity:.72,depthWrite:false});
  view.contactShadows=new THREE.InstancedMesh(new THREE.PlaneGeometry(1,1),material,1024);
  view.contactShadows.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  view.contactShadows.frustumCulled=false;view.contactShadows.count=0;
  view.contactDummy=new THREE.Object3D();view.contactDummy.rotation.x=-Math.PI/2;
  view.scene.add(view.contactShadows);
}

export function contactPose(view,e,x,z,radius,ground){
  const cache=view.contactCache??=new Map(),previous=cache.get(e.id);
  if(previous&&previous.x===x&&previous.z===z&&previous.radius===radius)return previous;
  ground??=view.groundHeight(x,z);
  const dummy=view.contactDummy;
  dummy.position.set(x,ground+.035,z);
  const normal=(view.contactNormal??=new THREE.Vector3()).set(view.groundHeight(x-.25,z)-view.groundHeight(x+.25,z),.5,view.groundHeight(x,z-.25)-view.groundHeight(x,z+.25)).normalize();
  dummy.quaternion.setFromUnitVectors(view.contactForward??=new THREE.Vector3(0,0,1),normal);
  dummy.scale.set(radius*2.8,radius*2.8,1);dummy.updateMatrix();
  const pose={x,z,radius,ground,matrix:dummy.matrix.clone()};cache.set(e.id,pose);return pose;
}

export function updateContacts(view,menu){
  const mesh=view.contactShadows;let count=0,culled=0,computed=0,reused=0;
  for(const e of view.sim.entities){
    if(count===1024)break;
    if(e.hp<=0||e.embarked||e.water||UNITS[e.type]?.naval||e.type==='farm'||(e.kind==='building'&&e.progress===0))continue;
    const shown=menu||e.owner===0||e.kind==='shrine'||view.sim.isVisible(e.x,e.z)||(e.kind==='resource'&&view.sim.isExplored(e.x,e.z));
    if(!shown)continue;
    const radius=e.type==='wood'?2.2:e.kind==='unit'?Math.max(.55,e.r||.5):(e.r||1.5)*1.05;
    const position=renderPosition(view,e),x=position.x,z=position.z,previous=view.contactCache?.get(e.id),unchanged=previous&&previous.x===x&&previous.z===z&&previous.radius===radius;
    const ground=unchanged?previous.ground:view.groundHeight(x,z);
    if(!nearViewport(view,x,ground,z,Math.max(4,radius*2))){culled++;continue;}
    const pose=unchanged?previous:contactPose(view,e,x,z,radius,ground);if(unchanged)reused++;else computed++;
    mesh.setMatrixAt(count++,pose.matrix);
  }
  if(view.clock-(view.contactPrunedAt||0)>2){for(const id of view.contactCache?.keys()||[])if(!view.sim.get(id))view.contactCache.delete(id);view.contactPrunedAt=view.clock;}
  mesh.count=count;markInstancePrefix(mesh,count);
  view.contactDiagnostics={visible:count,culled,computed,reused,cached:view.contactCache?.size||0,matrixUploadBytes:count*64};
}

export function installVisualDepth(WorldView){
  const p=WorldView.prototype,attach=p.attach,render=p.render,house=p.houseModel,makeUnit=p.makeUnit;
  p.attach=function(sim){
    const sameSimulation=this.sim===sim;
    this.contactCache=new Map();this.contactPrunedAt=0;
    if(!this.polished){decorateMaterials(this);this.polished=true;}
    if(!this.depthInitialized){initializeDepth(this);this.depthInitialized=true;}
    attach.call(this,sim);if(!sameSimulation)this.setCameraPreset(this.settings.cameraPreset,true);
  };
  p.houseModel=function(g,team,x,z,s=1){
    house.call(this,g,team,x,z,s);const m=this.materials;
    // Real beams, window recesses, eaves, and entry steps reveal the side walls.
    for(const side of [-1,1]){
      for(const yy of [.45,2.9])this.box(g,m.timberEdge,x+side*1.91*s,yy*s,z,.13*s,.14*s,3.5*s);
      for(const zz of [-1.6,0,1.6])this.box(g,m.timberEdge,x+side*1.91*s,1.72*s,z+zz*s,.13*s,2.6*s,.14*s);
      for(const zz of [-.8,.8]){
        this.box(g,m.timberEdge,x+side*1.93*s,2.03*s,z+zz*s,.14*s,.83*s,.73*s);
        this.box(g,m.glass,x+side*2.015*s,2.03*s,z+zz*s,.025*s,.6*s,.51*s);
        this.box(g,m.wood,x+side*2.04*s,2.03*s,z+zz*s,.04*s,.63*s,.065*s);
      }
      this.box(g,m.timberEdge,x+side*1.2*s,2.03*s,z+1.78*s,.69*s,.83*s,.14*s);
      this.box(g,m.glass,x+side*1.2*s,2.03*s,z+1.86*s,.48*s,.6*s,.025*s);
      this.box(g,m.wood,x+side*1.2*s,2.03*s,z+1.89*s,.055*s,.61*s,.025*s);
      this.box(g,m.timberEdge,x+side*2.34*s,2.97*s,z,.15*s,.16*s,4.34*s);
      const brace=this.box(g,m.timberEdge,x+side*1.16*s,4.08*s,z+2.14*s,.14*s,3.26*s,.16*s);
      brace.rotation.z=side*Math.PI/4;
    }
    this.box(g,m.timberEdge,x,5.25*s,z,.17*s,.17*s,4.4*s);
    this.box(g,m.wood,x,2.45*s,z+1.79*s,1.06*s,.14*s,.18*s);
    for(let i=0;i<2;i++)this.box(g,m.stoneDark,x,(.13+i*.15)*s,z+(2.17-i*.25)*s,1.3*s,(.22+i*.16)*s,.42*s);
    this.box(g,m.gold,x+.27*s,1.3*s,z+1.8*s,.06*s,.08*s,.05*s);
  };
  p.makeUnit=function(e){
    const g=makeUnit.call(this,e),body=g.userData.body;if(!body)return g;
    const riding=e.type==='knight'||e.type==='scout',offset=riding?.9:0,m=this.materials;
    for(const part of body.children){
      if(part.geometry===this.geo.sphere&&(part.material===m.skin||part.material===m.iron))part.geometry=this.geo.head;
      if(part.geometry===this.geo.box&&Math.abs(part.position.x)<.01&&Math.abs(part.position.y-(1.05+offset))<.01)part.geometry=this.geo.torso;
      if(e.type==='swordsman'&&part.material===this.teamMaterials[e.owner]&&part.position.x<-.4)part.geometry=this.geo.shield;
    }
    if(e.type!=='ram'&&e.type!=='catapult'){
      this.box(body,m.darkwood,0,.85+offset,0,.62,.1,.44);
      this.box(body,m.iron,0,.86+offset,.24,.13,.1,.045);
    }
    return g;
  };
  p.render=function(dt,menu){if(this.contactShadows)updateContacts(this,menu);render.call(this,dt,menu);};
}
