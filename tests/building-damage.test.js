import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {BuildingDamageEffects,buildingFirePoints,fireTongueTexture,fireLickTexture,fireGlowTexture,emberSparkTexture} from '../src/battle-effects.js';

const building=(ratio,extra={})=>({id:1,kind:'building',type:'house',hp:ratio*100,maxHp:100,progress:1,r:2,...extra});

function setup(t,{w=3,h=5,d=3}={}){
  const scene=new THREE.Scene(),effects=new BuildingDamageEffects(scene),node=new THREE.Group();
  const geometry=new THREE.BoxGeometry(w,h,d),material=new THREE.MeshBasicMaterial();
  const roof=new THREE.Mesh(geometry,material);
  roof.position.y=h/2;node.add(roof);
  node.position.set(6,9,-3);
  const render=(entity,dt=.05)=>{
    effects.beginFrame();effects.add(entity,node,2,dt,null,true);effects.endFrame();
  };
  t.after(()=>{effects.dispose();geometry.dispose();material.dispose();});
  return {effects,render,node};
}

function pose(mesh,index=0){
  const matrix=new THREE.Matrix4();
  mesh.getMatrixAt(index,matrix);
  return {position:new THREE.Vector3().setFromMatrixPosition(matrix),scale:new THREE.Vector3().setFromMatrixScale(matrix)};
}

test('damage smoke starts below 60% and gets denser before flames appear',t=>{
  const {effects,render}=setup(t);
  render(building(.60));
  assert.equal(effects.smoke.count,0);
  render(building(.55));
  const early=pose(effects.smoke);
  assert.equal(effects.smoke.count,1);
  assert.equal(effects.flames.count,0);
  render(building(.50));
  const later=pose(effects.smoke);
  assert.equal(effects.flames.count,0);
  assert.ok(later.scale.y>early.scale.y);
  assert.ok(Math.abs(later.position.y-13.8)<1e-5,'smoke follows the model roof even above sloped terrain');
});

test('multi-point fire grows progressively across roof corners and clears when repaired',t=>{
  const {effects,render}=setup(t);
  const e=building(.10);
  // First brief frame ignites primary flame cleanly.
  render(e,.05);
  assert.equal(effects.flames.count,1);
  const initial=pose(effects.flames,0).scale.y;
  // As fire develops, all 3 multi-point flames ignite across distinct corners of the house.
  render(e,.6);
  assert.equal(effects.flames.count,3,'critically burning house spawns 3 distinct flames');
  assert.ok(pose(effects.flames,0).scale.y>initial*3);
  const p0=pose(effects.flames,0).position,p1=pose(effects.flames,1).position,p2=pose(effects.flames,2).position;
  assert.ok(p0.distanceTo(p1)>.5&&p1.distanceTo(p2)>.5,'flame points spread across distinct corners');
  assert.equal(e.hp,10,'visual effects cannot drain building health');

  // Repairing above 50% extinguishes flames while keeping damage smoke; 100% clears everything.
  render(building(.54));
  assert.equal(effects.flames.count,0);
  assert.equal(effects.smoke.count,1);
  render(building(1));
  assert.deepEqual([effects.flames.count,effects.smoke.count],[0,0]);
  render(e,.05);
  assert.equal(pose(effects.flames,0).scale.y,initial);
});

test('large fortresses and production buildings scale up to 4-5 multi-point flames',t=>{
  const {effects,render}=setup(t,{w:7,h:8,d:7});
  const keep=building(.10,{id:7,type:'keep',r:3.8});
  render(keep,1.0);
  assert.equal(effects.flames.count,5,'critically burning Castle Keep engulfs 5 multi-point blaze anchors');
  assert.equal(effects.smoke.count,2,'large critically burning fortress vents a secondary smoke plume');

  const barracks=building(.10,{id:9,type:'barracks',r:2.8});
  render(barracks,1.0);
  assert.equal(effects.flames.count,4,'critically burning Barracks ignites 4 flame points');
  assert.equal(buildingFirePoints({type:'towncenter',r:3.6}).length,5);
  assert.equal(buildingFirePoints({type:'gate',r:2.5}).length,4);
  assert.equal(buildingFirePoints({type:'wall',r:1.5},{palisadeWall:true}).length,1);
});

test('unfinished and destroyed buildings stay clear, stone walls only smoke',t=>{
  const {effects,render}=setup(t);
  for(const e of [building(.10,{progress:.5}),building(0)]){
    render(e);
    assert.deepEqual([effects.flames.count,effects.smoke.count],[0,0]);
  }
  render(building(.10,{type:'wall'}));
  assert.deepEqual([effects.flames.count,effects.smoke.count],[0,1]);
});

test('a damaged town uses capped batches and uploads only their active instances',t=>{
  const {effects,node}=setup(t);
  effects.beginFrame();
  for(let id=1;id<=200;id++)effects.add(building(.10,{id}),node,2,.8,null,true);
  effects.endFrame();
  assert.equal(effects.flames.count,240);
  assert.equal(effects.smoke.count,140);
  assert.equal(effects.flames.material.forceSinglePass,true);
  assert.equal(effects.smoke.material.forceSinglePass,true);
  assert.deepEqual(effects.flames.instanceMatrix.updateRanges,[{start:0,count:240*16}]);
  assert.deepEqual(effects.flames.instanceColor.updateRanges,[{start:0,count:240*3}]);
  assert.deepEqual(effects.smoke.instanceMatrix.updateRanges,[{start:0,count:140*16}]);
});

test('volumetric building fire uses seamless camera-facing billboards, multi-layer glow/licks/embers/smoke, and clean straight-alpha flame colors',t=>{
  const {effects,node}=setup(t,{w:7,h:8,d:7});
  // Single billboard quad per flame & smoke (2 triangles) — eliminates ugly 3-plane star X-creases.
  const triCount=geo=>(geo.index?geo.index.count:geo.attributes.position.count)/3;
  assert.equal(triCount(effects.flames.geometry),2,'primary flames use a single billboard quad (no crossed X-card seams)');
  assert.equal(triCount(effects.smoke.geometry),2,'smoke puffs use a single billboard quad');
  assert.equal(effects.glow.material.blending,THREE.AdditiveBlending,'roof firelight bloom uses AdditiveBlending');
  assert.equal(effects.flameLicks.material.blending,THREE.AdditiveBlending,'rising flame licks use AdditiveBlending');
  assert.equal(effects.embers.material.blending,THREE.AdditiveBlending,'rising embers use AdditiveBlending');

  // Verify camera-facing billboard alignment when camera is passed to beginFrame(camera).
  const camera=new THREE.PerspectiveCamera(45,1.6,1,200);
  camera.position.set(22,26,22);
  camera.lookAt(6,9,-3);
  camera.updateMatrixWorld(true);

  const tc=building(.12,{id:11,type:'towncenter',r:3.6});
  effects.beginFrame(camera);
  effects.add(tc,node,3.4,1.0,{x:.5,z:.25},false);
  effects.endFrame();

  assert.equal(effects.flames.count,5,'critical Town Center ignites 5 primary flame anchors');
  assert.equal(effects.glow.count,5,'each flame anchor casts warm roof firelight bloom');
  assert.ok(effects.flameLicks.count>=5,'rising animated flame licks layer above active blaze anchors');
  assert.ok(effects.embers.count>=5,'rising incandescent embers float above active blaze anchors');
  assert.ok(effects.smokeWisps.count>=4,'rising billowing battle smoke column emits above damaged roof');

  // Confirm primary flame billboard normal faces toward the camera horizontally (dot > 0.75).
  const m=new THREE.Matrix4(),q=new THREE.Quaternion(),pos=new THREE.Vector3(),sc=new THREE.Vector3();
  effects.flames.getMatrixAt(0,m);
  m.decompose(pos,q,sc);
  const normal=new THREE.Vector3(0,0,1).applyQuaternion(q);
  const toCam=new THREE.Vector3().subVectors(camera.position,pos).normalize();
  assert.ok(normal.dot(toCam)>.75,`flame billboard faces camera smoothly (dot=${normal.dot(toCam).toFixed(3)})`);

  // Repaired building clears all 6 instanced batches cleanly and hides empty draws.
  effects.beginFrame(camera);
  effects.add(building(1,{id:11,type:'towncenter',r:3.6}),node,3.5,.05,{x:.5,z:.25},false);
  effects.endFrame();
  for(const batch of [effects.glow,effects.smoke,effects.smokeWisps,effects.flames,effects.flameLicks,effects.embers]){
    assert.equal(batch.count,0);
    assert.equal(batch.visible,false);
  }

  // Straight-alpha flame texture must never contain muddy dark-brown semi-transparent border pixels.
  const fireTex=fireTongueTexture(128);
  const data=fireTex.image.data;
  let visiblePixels=0,muddyPixels=0;
  for(let i=0;i<data.length;i+=4){
    if(data[i+3]>=12){
      visiblePixels++;
      if(data[i]<215)muddyPixels++;
    }
  }
  assert.ok(visiblePixels>1000,'fire texture has rich flame silhouette');
  assert.equal(muddyPixels,0,'straight-alpha fire texture has zero muddy dark-brown halo pixels');
  fireTex.dispose();

  for(const tex of [fireLickTexture(64),fireGlowTexture(64),emberSparkTexture(32)]){
    const {data:td,width:w,height:h}=tex.image;
    let maxBorderA=0,peakA=0;
    for(let x=0;x<w;x++)maxBorderA=Math.max(maxBorderA,td[x*4+3],td[((h-1)*w+x)*4+3]);
    for(let y=0;y<h;y++)maxBorderA=Math.max(maxBorderA,td[(y*w)*4+3],td[(y*w+w-1)*4+3]);
    for(let i=3;i<td.length;i+=4)peakA=Math.max(peakA,td[i]);
    assert.ok(maxBorderA<=4,`volumetric fire map borders fade cleanly (max=${maxBorderA})`);
    assert.ok(peakA>=160,`volumetric fire map has crisp incandescent core (peak=${peakA})`);
    tex.dispose();
  }
});
