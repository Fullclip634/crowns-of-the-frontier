import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import * as THREE from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {MeshoptDecoder} from 'three/addons/libs/meshopt_decoder.module.js';
import {bindFootJoints,prepareFootPlacement,pruneFootPlacements,visualBodyOffset} from '../src/foot-placement.js';
import {animatePart,beginJointPose,endJointPose} from '../src/world-polish.js';
import {UnitLocomotion} from '../src/locomotion.js';
import {writeUnitPose} from '../src/render-batches.js';
import {attackFlight} from '../src/battle-effects.js';
import {bowReleasePoint} from '../src/archery-pose.js';
import {projectileTargetHeight} from '../src/combat-timing.js';
import {UNITS} from '../src/data.js';

const batch={model3d:{terrainFeet:true}},catalogues=new Map();
async function catalogue(tier){
  if(!catalogues.has(tier)){const bytes=await fs.readFile(new URL(`../src/assets3d/frontier-${tier}.glb`,import.meta.url));const gltf=await new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'');const roots=new Map();gltf.scene.traverse(node=>{if(node.userData.assetKey)roots.set(node.userData.assetKey,node);});catalogues.set(tier,roots);}
  return catalogues.get(tier);
}
function environment(gait,sx=0,sz=0){return {clock:0,landscape:{},groundHeight:(x,z)=>sx*x+sz*z,locomotion:{get:()=>gait},footDiagnostics:{computed:0,reused:0,samples:0}};}
function rootAt(view,x,z,heading=0,bob=0){return new THREE.Matrix4().makeRotationY(heading).setPosition(x,view.groundHeight(x,z)+bob,z);}
function soles(root){const boots=[];root.updateMatrixWorld(true);root.traverse(mesh=>{if(mesh.isMesh&&mesh.userData.motion?.type==='ankle'){const positions=mesh.geometry.attributes.position,points=[];let low=Infinity;for(let i=0;i<positions.count;i++)low=Math.min(low,positions.getY(i));for(let i=0;i<positions.count;i++)if(positions.getY(i)<low+.001)points.push(new THREE.Vector3().fromBufferAttribute(positions,i).applyMatrix4(mesh.matrixWorld));boots.push({mesh,points,side:mesh.userData.motion.side});}});return boots;}

test('every released human boot retains its source geometry and sole contact across walking phases, headings and slopes',async()=>{
  let figures=0,contacts=0;
  for(const tier of ['low','balanced','near'])for(const [key,source]of await catalogue(tier)){
    if(!key.startsWith('unit:'))continue;const type=key.split(':')[1],def=UNITS[type],human=def&&!def.naval&&['worker','infantry','spear','ranged','healer'].includes(def.role),root=source.clone(true),geometries=[];root.traverse(p=>{if(p.isMesh)geometries.push(p.geometry);});
    assert.equal(bindFootJoints(root),!!human,key+' binds only complete unmounted human feet');if(!human)continue;figures++;assert.equal(bindFootJoints(root),true,'binding is idempotent');let index=0;root.traverse(p=>{if(p.isMesh)assert.equal(p.geometry,geometries[index++],'no mesh or vertex buffer is replaced');});
    const boots=soles(root);assert.equal(boots.length,2);
    for(const [sx,sz]of [[0,0],[.2,-.15],[.4,.12]])for(const heading of [0,Math.PI/3,Math.PI/2]){
      const gait={phase:0,blend:0,bob:0},view=environment(gait,sx,sz),entity={id:1,kind:'unit',type,hp:55,moving:false},saved={...entity};
      for(let step=-1;step<24;step++){
        gait.phase=Math.max(0,step)*Math.PI/12;gait.blend=Number(step>=0);gait.bob=step>=0?.025:0;entity.moving=step>=0;
        const matrix=rootAt(view,3,-2,heading,gait.bob),original=matrix.elements.slice(),body=prepareFootPlacement(view,batch,entity,matrix);assert.deepEqual(matrix.elements,original,'source render roots are never changed');beginJointPose(view,entity,body);
        for(const {mesh,points,side}of boots){const transform=animatePart(view,mesh,entity,body).clone(),cycle=(gait.phase+(side<0?Math.PI:0))%(Math.PI*2),stance=step<0||cycle<=Math.PI;let minimum=Infinity;
          for(const sourcePoint of points){const point=sourcePoint.clone().applyMatrix4(transform),gap=point.y-view.groundHeight(point.x,point.z);minimum=Math.min(minimum,gap);assert.ok(gap>=-.001,`${tier}/${key}: the sole never enters this walkable plane`);assert.ok(gap<.18,'swing clearance remains bounded');if(stance)assert.ok(gap<.003,'the stance sole follows the ground rather than floating');contacts++;}
          if(step>=0&&Math.abs(cycle-Math.PI*1.5)<.01)assert.ok(minimum>.14,'the free foot clears the terrain during swing');
        }endJointPose(view);
      }
      entity.moving=saved.moving;assert.deepEqual(entity,saved,'terrain presentation never changes authoritative unit data');
    }
  }
  assert.equal(figures,36);assert.ok(contacts>100000);
});

test('actual travelled-distance gait plants each stance foot in world space at different frame rates',()=>{
  for(const frames of [120,240]){
    const entity={id:0,kind:'unit',type:'spearman',moving:true,hp:80},gait=new UnitLocomotion(),view={clock:0,landscape:{},groundHeight:(x,z)=>.2*x+.1*z,locomotion:gait};gait.update(entity,0,0,0);gait.get(0).blend=1;const previous=[null,null],heading=.7;
    for(let frame=1;frame<=frames;frame++){
      const distance=4.1*frame/frames,x=Math.sin(heading)*distance,z=Math.cos(heading)*distance,state=gait.update(entity,x,z,2/frames),body=prepareFootPlacement(view,batch,entity,rootAt(view,x,z,heading,state.bob));beginJointPose(view,entity,body);
      for(let index=0;index<2;index++){const side=index?1:-1,leg={type:'leg',pivot:[side*.18,1.26,0],side},knee={type:'knee',pivot:[side*.18,.73,.01],side,parent:leg},boot={userData:{motion:{type:'ankle',pivot:[side*.18,.285,.025],side,parent:knee}}},point=new THREE.Vector3(side*.18,0,.025).applyMatrix4(animatePart(view,boot,entity,body)),cycle=(state.phase+(side<0?Math.PI:0))%(Math.PI*2),old=previous[index];
        if(cycle<Math.PI&&old?.cycle<Math.PI&&cycle>old.cycle)assert.ok(point.distanceTo(old.point)<1e-5,'stance feet remain planted as the body travels');previous[index]={cycle,point};
      }endJointPose(view);
    }
  }
});

test('idle foot poses reuse all terrain samples, offscreen figures skip work and removed units release cached poses',()=>{
  const gait={phase:.7,blend:0,bob:0},view=environment(gait,.2,.1),entity={id:1,type:'villager',hp:55},matrix=rootAt(view,3,5);let samples=0;const height=view.groundHeight;view.groundHeight=(...args)=>{samples++;return height(...args);};
  const first=prepareFootPlacement(view,batch,entity,matrix),initial=samples;for(let i=0;i<120;i++)assert.equal(prepareFootPlacement(view,batch,entity,matrix),first);assert.equal(samples,initial);assert.equal(initial,4);assert.equal(view.footDiagnostics.reused,120);
  assert.equal(writeUnitPose(view,batch,entity,matrix,false),false);assert.equal(samples,initial);
  assert.equal(prepareFootPlacement(view,{model3d:{}},entity,matrix),matrix);assert.equal(samples,initial);
  const prior=view.footPoses.get(entity.id).feet[0].ankle.elements.slice(),center=height(3,5);view.landscape.grid={};view.groundHeight=(x,z)=>{samples++;return center-(height(x,z)-center);};prepareFootPlacement(view,batch,entity,matrix);
  assert.equal(samples,initial+4);assert.notDeepEqual(view.footPoses.get(entity.id).feet[0].ankle.elements,prior,'a replaced terrain grid refreshes a stationary foot pose');
  pruneFootPlacements(view,{entities:[]});assert.equal(view.footPoses.size,0);
});

test('body adjustment preserves grounded shadow roots and follows a complete walking boot through the batching path',async()=>{
  const root=(await catalogue('low')).get('unit:spearman').clone(true);bindFootJoints(root);const [{mesh:boot}]=soles(root),gait={phase:.3,blend:1,bob:.02},view=environment(gait,.3,.1),entity={id:1,type:'spearman',kind:'unit',hp:80,moving:true,owner:0},matrix=rootAt(view,0,0,0,gait.bob),shadow={},stored={};view.materials={shadow};
  const make=(key,motion,material)=>({userData:{motion},material,geometry:{getAttribute:()=>null},setMatrixAt(_index,value){stored[key]=value.clone();}}),renderBatch={model3d:{terrainFeet:true},renderIds:[],parts:[make('boot',boot.userData.motion,{}),make('shadow',null,shadow)]};
  assert.equal(writeUnitPose(view,renderBatch,entity,matrix,true),true);assert.deepEqual(stored.shadow.elements,matrix.elements);assert.deepEqual(renderBatch.renderIds,[1]);
  const point=new THREE.Vector3(-.18,0,.025).applyMatrix4(stored.boot);assert.ok(point.y-view.groundHeight(point.x,point.z)>=-.001);assert.equal(view.footPoseEntity,null);
});

test('ranged release and target heights follow the presented body adjustment',()=>{
  const gait={phase:0,blend:0,bob:0},view=environment(gait,.4,.1),source={id:1,kind:'unit',type:'archer',x:0,z:0,hp:65},target={id:2,kind:'unit',type:'spearman',x:0,z:15,hp:80};view.entityHeight=(e,x,z)=>view.groundHeight(x,z);
  const sourceRoot=prepareFootPlacement(view,batch,source,rootAt(view,0,0)).clone(),targetRoot=prepareFootPlacement(view,batch,target,rootAt(view,0,15)).clone(),flight=attackFlight(view,source,target);
  assert.ok(Math.abs(flight.from.y-sourceRoot.elements[13]-bowReleasePoint.y)<1e-6);assert.ok(Math.abs(flight.to.y-targetRoot.elements[13]-projectileTargetHeight(target))<1e-6);
  source.x=50;assert.equal(visualBodyOffset(view,source),0,'an offscreen move cannot reuse a body height from another location');
});
