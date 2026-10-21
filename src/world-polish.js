import {standardMaterial} from './render-runtime.js';
import * as THREE from 'three';
import {UNITS,seededRandom} from './data.js';
import {workerVisualTask} from './authored-assets.js';
import {combatJointAngle} from './combat-poses.js';
import {siegeArmAngle,combatRenderOffset} from './combat-timing.js';

function texture(kind){const c=document.createElement('canvas');c.width=c.height=256;const ctx=c.getContext('2d');ctx.fillStyle=kind==='stone'?'#bdb8ac':kind==='roof'?'#d9d5cf':'#a98c67';ctx.fillRect(0,0,256,256);
  if(kind==='stone'){for(let row=0;row<8;row++)for(let col=-1;col<9;col++){const x=col*40+(row%2)*20,y=row*32;ctx.fillStyle=`rgb(${165+Math.random()*35},${162+Math.random()*32},${147+Math.random()*30})`;ctx.fillRect(x+2,y+2,36,28);ctx.strokeStyle='#8b897c';ctx.lineWidth=1;ctx.strokeRect(x+2,y+2,36,28);ctx.fillStyle='#dbd5c477';ctx.fillRect(x+3,y+3,34,2);}}
  else if(kind==='roof'){for(let y=0;y<256;y+=22){ctx.fillStyle='#fff4';ctx.fillRect(0,y,256,2);ctx.fillStyle='#384e4435';ctx.fillRect(0,y+18,256,4);for(let x=0;x<256;x+=26){ctx.fillStyle='#354c4422';ctx.fillRect(x+(y%44?13:0),y,1,22);}}}
  else{for(let x=0;x<256;x+=32){ctx.fillStyle='#4d392b66';ctx.fillRect(x,0,2,256);ctx.strokeStyle='#6e553055';for(let i=0;i<5;i++){ctx.beginPath();ctx.moveTo(x+4+i*5,0);ctx.bezierCurveTo(x+16+i*2,80,x+3+i*5,170,x+5+i*5,256);ctx.stroke();}}}
  const t=new THREE.CanvasTexture(c);t.colorSpace=THREE.SRGBColorSpace;t.wrapS=t.wrapT=THREE.RepeatWrapping;t.anisotropy=4;return t;
}
function barkTexture(){
  const canvas=document.createElement('canvas');canvas.width=canvas.height=256;
  const ctx=canvas.getContext('2d'),rng=seededRandom(6417);ctx.fillStyle='#b7aea0';ctx.fillRect(0,0,256,256);
  for(let i=0;i<180;i++){
    const x=rng()*256,y=rng()*256,length=18+rng()*95;
    ctx.strokeStyle=i%3?'#50473d55':'#f4eddd66';ctx.lineWidth=.5+rng()*2.5;
    ctx.beginPath();ctx.moveTo(x,y);ctx.bezierCurveTo(x-3,y+length*.3,x+4,y+length*.65,x,y+length);ctx.stroke();
    if(y+length>256){ctx.beginPath();ctx.moveTo(x,y-256);ctx.lineTo(x,y+length-256);ctx.stroke();}
  }
  const map=new THREE.CanvasTexture(canvas);map.colorSpace=THREE.SRGBColorSpace;map.wrapS=map.wrapT=THREE.RepeatWrapping;map.anisotropy=4;return map;
}
export function decorateMaterials(view){view.materials.stone.map=texture('stone');view.materials.wood.map=texture('wood');view.materials.trunk.map=barkTexture();view.materials.trunk.roughness=.98;view.roofMaterials=view.teamMaterials.map((m,i)=>{const roof=m.clone();roof.map=texture('roof');view.materials['teamRoof'+i]=roof;return roof;});
  const canvas=document.createElement('canvas');canvas.width=canvas.height=128;const c=canvas.getContext('2d');c.fillStyle='#87b6b2';c.fillRect(0,0,128,128);for(let i=0;i<30;i++){c.strokeStyle=i%2?'#ccdfd63c':'#3d7c8940';c.beginPath();c.moveTo(0,i*5);c.bezierCurveTo(30,i*5-6,80,i*5+6,128,i*5);c.stroke();}const t=new THREE.CanvasTexture(canvas);t.wrapS=t.wrapT=THREE.RepeatWrapping;t.colorSpace=THREE.SRGBColorSpace;view.materials.water.map=t;view.materials.water.color.setHex(0x89b8bd);
}

export function shipModel(view,e){const g=new THREE.Group(),m=view.materials,team=view.teamMaterials[e.owner],heavy=e.type==='warship',scale=heavy?1.35:1;
  const hull=new THREE.Mesh(new THREE.CylinderGeometry(.7,1.15,3.6,6,1),m.wood);hull.rotation.x=Math.PI/2;hull.scale.set(1.1*scale,scale,1);hull.position.y=.55;hull.castShadow=true;g.add(hull);
  view.box(g,m.darkwood,0,.92,0,2.1*scale,.4,3.8*scale);view.box(g,m.wood,0,1.2,0,1.8*scale,.15,3.55*scale);
  for(const x of [-1.05,1.05])view.box(g,m.darkwood,x*scale,1.4,0,.12,.3,3.6*scale);
  view.box(g,team,0,1.38,-1.4*scale,1.9*scale,.16,.65);
  if(e.type!=='fishingboat'){view.cylinder(g,m.darkwood,0,3,0,.085,5.2);view.box(g,m.wood,0,4.65,0,2.5*scale,.09,.09);view.box(g,m.plaster,0,3.5,.03,2.5*scale,2.1,.045);view.box(g,team,0,3.5,.06,.24,1.5,.045);view.box(g,team,0,3.5,.07,1.45,.22,.045);view.flag(g,team,0,6,0,.7);}
  else{view.box(g,m.wood,0,1.6,-.5,1.6,.9,1.2);view.roof(g,team,0,2.2,-.5,1.5,.8,1.2);view.box(g,m.darkwood,1.3,1.1,.6,.07,.07,2);}
  if(heavy){for(const x of [-.85,.85])for(const z of [-1,1]){const gun=view.cylinder(g,m.iron,x,1.6,z,.2,.9);gun.rotation.z=Math.PI/2;}view.box(g,m.gold,0,1.7,-1.7,1.5,.08,.1);}
  if(e.type==='galley')view.box(g,m.iron,0,1.6,1.8,.35,.3,.8);
  if(e.type==='transport'){for(let i=0;i<4;i++)view.box(g,m.wood,(i%2-.5)*.8,1.55,-1+Math.floor(i/2)*.8,.6,.5,.6);}
  const wake=new THREE.Mesh(new THREE.RingGeometry(1.6,1.85,32),new THREE.MeshBasicMaterial({color:0xd7eee7,transparent:true,opacity:.22,depthWrite:false,side:THREE.DoubleSide}));wake.rotation.x=-Math.PI/2;wake.position.y=.14;wake.scale.set(1,1.8,1);g.add(wake);return g;
}

export function installWorldPolish(WorldView){const p=WorldView.prototype,base={makeUnit:p.makeUnit,makeBuilding:p.makeBuilding,createNode:p.createNode,render:p.render,attach:p.attach};
  const roof=p.roof;
  p.roof=function(g,m,...args){const i=this.teamMaterials.indexOf(m);if(i>=0){this.roofMaterials[i].color.copy(m.color);m=this.roofMaterials[i];}return roof.call(this,g,m,...args);};
  const house=p.houseModel;
  p.houseModel=function(g,team,x,z,scale=1){const start=g.children.length;house.call(this,g,team,x,z,scale);if(!this.geo.gable){const vertices=[-.71,-.5,.71,.71,-.5,.71,0,.5,.71,.71,-.5,-.71,-.71,-.5,-.71,0,.5,-.71,-.71,-.5,-.71,-.71,-.5,.71,0,.5,.71,-.71,-.5,-.71,0,.5,.71,0,.5,-.71,0,.5,-.71,0,.5,.71,.71,-.5,.71,0,.5,-.71,.71,-.5,.71,.71,-.5,-.71];const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3));const uv=[];for(let i=0;i<vertices.length;i+=3)uv.push((vertices[i]+.71)/1.42,vertices[i+1]+.5);geometry.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));geometry.computeVertexNormals();this.geo.gable=geometry;}for(const child of g.children.slice(start))if(child.geometry===this.geo.roof){child.geometry=this.geo.gable;child.position.y+=.65*scale;child.rotation.y=0;}};
  p.makeUnit=function(e){if(UNITS[e.type].naval)return shipModel(this,e);const g=base.makeUnit.call(this,e);const body=g.userData.body;
    if(body){body.children.forEach(mesh=>{if(!mesh.isMesh)return;if(mesh.geometry!==this.geo.box){if(mesh.position.x>.4&&(mesh.geometry===this.geo.cone||mesh.geometry.type==='TorusGeometry'))mesh.userData.motion={type:'arm',side:1,pivot:[.4,1.43+((e.type==='knight'||e.type==='scout')?.9:0),0]};return;}const s=mesh.scale,pos=mesh.position;
      const leg=Math.abs(pos.x)<.4&&s.x<.25&&s.y>.5&&s.y<1.1&&pos.y<1.4;
      const arm=Math.abs(pos.x)>.3&&s.x<.3&&s.y>.5&&s.y<1&&pos.y>=1;
      const tool=Math.abs(pos.x)>.45&&(s.x<.16||s.z<.16)&&!leg&&!arm;
      if(leg||arm||tool){mesh.userData.motion={type:leg?'leg':'arm',side:Math.sign(pos.x)||1,pivot:[leg?pos.x:.4*(Math.sign(pos.x)||1),leg?pos.y+s.y/2:1.43+((e.type==='knight'||e.type==='scout')?.9:0),leg?pos.z:0]};}
    });}return g;
  };
  p.makeBuilding=function(e){const g=base.makeBuilding.call(this,e),m=this.materials;
    if(e.type==='dock'){this.clearGroup(g);this.box(g,m.wood,0,.25,0,6,.5,6);for(const x of [-2.8,2.8])for(const z of [-2.8,2.8])this.cylinder(g,m.darkwood,x,.6,z,.14,1.2);this.houseModel(g,this.teamMaterials[e.owner],0,-1,.9);for(let i=0;i<5;i++)this.box(g,m.darkwood,0,.55,-2.5+i,6,.05,.06);this.flag(g,this.teamMaterials[e.owner],2,4,-2,.8);let angle=0;for(let i=0;i<16;i++)if(this.sim.isWater(e.x+Math.cos(i*Math.PI/8)*9,e.z+Math.sin(i*Math.PI/8)*9)){angle=i*Math.PI/8;break;}const dx=Math.cos(angle),dz=Math.sin(angle);this.box(g,m.wood,dx*4.4,.4,dz*4.4,8.8,.25,1.7,-angle);for(let i=1;i<=4;i++)this.cylinder(g,m.darkwood,dx*i*2,.5,dz*i*2,.13,1.1);}
    if(!['wall','farm','gate','tower'].includes(e.type)){this.box(g,m.wood,-e.r*.55,.4,e.r*.75,.65,.7,.65);this.cylinder(g,m.darkwood,e.r*.6,.45,e.r*.7,.4,.85);}
    return g;
  };
  p.attach=function(sim){if(!this.polished){decorateMaterials(this);this.polished=true;}base.attach.call(this,sim);if(sim.options.map==='coast')this.makeSea();};
  p.makeSea=function(){const vertices=[],uv=[],indices=[];for(let i=0;i<=80;i++){const z=-80+i*2,mid=Math.sin(z*.03)*2;vertices.push(mid-14,.12,z,mid+14,.12,z);uv.push(0,i*.13,1,i*.13);if(i<80){const a=i*2;indices.push(a,a+2,a+1,a+1,a+2,a+3);}}const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3));geo.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));geo.setIndex(indices);geo.computeVertexNormals();const sea=new THREE.Mesh(geo,this.materials.water);this.terrain.add(sea);
    const shore=new THREE.Mesh(new THREE.PlaneGeometry(35,160),standardMaterial({color:0xb8ac85,roughness:1}));shore.rotation.x=-Math.PI/2;shore.position.y=.045;shore.receiveShadow=true;this.terrain.add(shore);
  };
  p.createNode=function(e){const node=base.createNode.call(this,e);if(e.water){this.clearGroup(node);const ring=new THREE.Mesh(new THREE.RingGeometry(1.8,2,28),new THREE.MeshBasicMaterial({color:0xd2e9df,transparent:true,opacity:.5,side:THREE.DoubleSide,depthWrite:false}));ring.rotation.x=-Math.PI/2;ring.position.y=.25;ring.userData.entity=e.id;node.add(ring);for(let i=0;i<5;i++){const fish=this.piece(node,this.geo.cone,this.materials.iron,Math.sin(i)*1.3,.3,Math.cos(i)*1.3,.13,.45,.13);fish.rotation.x=Math.PI/2;fish.userData.entity=e.id;}}
    return node;
  };
  p.pruneMissing=function(){const present=new Set(this.sim.entities.map(e=>e.id));for(const[id,node]of this.nodes)if(!present.has(id)){if(node.userData.batch){const {batch,index}=node.userData,dummy=new THREE.Object3D();dummy.scale.setScalar(0);dummy.updateMatrix();for(const part of batch.parts)part.setMatrixAt(index,dummy.matrix);batch.ids[index]=null;batch.free.push(index);}node.removeFromParent();this.nodes.delete(id);}};
  p.foliageFog=function(menu=false){if(!this.foliageMatrices)return;const empty=new THREE.Matrix4().makeScale(0,0,0);for(const e of this.sim.entities)if(e.type==='wood'&&e.hp>0&&this.treeIndices.has(e.id)){const i=this.treeIndices.get(e.id),matrices=this.foliageMatrices.get(e.id);if(!matrices)continue;const show=menu||this.settings.fog===false||this.sim.isExplored(e.x,e.z);this.treeTrunks.setMatrixAt(i,show?matrices[0]:empty);for(let k=0;k<2;k++)this.treeLeaves.setMatrixAt(i*2+k,show?matrices[k+1]:empty);}for(const mesh of [this.treeTrunks,this.treeLeaves]){mesh.instanceMatrix.needsUpdate=true;mesh.boundingSphere=null;}};
  const fog=p.updateFog;
  p.updateFog=function(){fog.call(this);if(this.foliageMatrices)this.foliageFog(this.menuFoliage);};
  const attach=p.attach;
  p.attach=function(sim){this.foliageMatrices=null;attach.call(this,sim);this.foliageMatrices=new Map();for(const e of sim.entities)if(e.type==='wood'&&this.treeIndices.has(e.id)){const i=this.treeIndices.get(e.id),matrices=[new THREE.Matrix4(),new THREE.Matrix4(),new THREE.Matrix4()];this.treeTrunks.getMatrixAt(i,matrices[0]);this.treeLeaves.getMatrixAt(i*2,matrices[1]);this.treeLeaves.getMatrixAt(i*2+1,matrices[2]);this.foliageMatrices.set(e.id,matrices);}this.menuFoliage=true;};
  p.render=function(dt,menu){if(this.materials.water.map)this.materials.water.map.offset.y=this.clock*.04;if(this.menuFoliage!==menu){this.menuFoliage=menu;this.foliageFog(menu);}base.render.call(this,dt,menu);};
}

function jointAngle(view,m,e){
  const combat=combatJointAngle(e,m,combatRenderOffset(view));if(combat!==null)return combat;
  const working=e.type==='villager'&&!e.moving&&['gather','build','repair'].includes(e.order?.type||e.activity);
  const gait=view.locomotion?.get(e.id),phase=gait?.phase??view.clock*8.5+e.id*.7,blend=gait?.blend??Number(!!e.moving),walk=Math.sin(phase)*(m.side??1)*blend;
  if(m.type==='wheel')return gait?.wheel??(e.moving?view.clock*5:0);
  if(m.type==='horseleg')return Math.sin(phase+(m.pivot[2]>0?Math.PI:0))*(m.side??1)*blend*.5;
  if(m.type==='knee')return m.riding?Math.sin(phase)*blend*.035:Math.max(0,-walk)*.65;
  if(m.type==='leg')return m.riding?Math.sin(phase)*blend*.025:walk*.46;
  if(m.type==='torso')return blend>.01?walk*.022:working?.04+Math.sin(view.clock*4+e.id)*.022:Math.sin(view.clock*1.7+e.id)*.009;
  if(m.type==='head')return blend>.01?-.018:Math.sin(view.clock*1.4+e.id)*.012;
  if(m.type==='cape')return Math.sin(view.clock*2+e.id)*(.025+(view.weatherState?.intensity||0)*.035)+(e.moving?.07:0);
  if(m.type==='sail')return Math.sin(view.clock*1.5+e.id)*.035;
  if(m.type==='oar')return e.moving?Math.sin(view.clock*3+e.id)*.18*m.side:0;
  if(m.type==='ram')return 0;
  if(m.type==='siege')return siegeArmAngle(e,combatRenderOffset(view));
  if(m.type==='forearm'){
    if(working)return m.side<0?-.12:-.18+Math.sin(view.clock*(workerVisualTask(view,e)==='build'?8:6)+e.id)*.12;
    return -.15*blend;
  }
  if(m.type==='arm'){
    if(working){const task=workerVisualTask(view,e),rate=task==='build'?8:task==='food'?4:6;return m.side<0?-.24+Math.sin(view.clock*rate+e.id)*.1:(task==='food'?-.55:-.65)+Math.sin(view.clock*rate+e.id)*(task==='food'?.22:task==='build'?.32:.60);}
    if(e.cooldown>.45)return -.3-Math.sin((1.2-e.cooldown)*5)*.75;
    return walk*.3;
  }
  return 0;
}
export function beginJointPose(view,entity,matrix){
  view.jointPoseEpoch=(view.jointPoseEpoch||0)+1;view.jointPoseEntity=entity;view.jointPoseRoot=matrix;
}
export function endJointPose(view){view.jointPoseEntity=null;view.jointPoseRoot=null;}

export function animatePart(view,part,e,matrix){
  const m=part.userData.motion;if(!m)return matrix;
  const result=view.poseMatrix??=new THREE.Matrix4(),rotation=view.poseRotation??=new THREE.Matrix4();result.copy(matrix);
  if(m.type==='ram'){const translation=part.userData.ramTranslation??=new THREE.Matrix4();translation.makeTranslation(0,0,e.cooldown>0?Math.sin(e.cooldown*8)*.25:0);return result.multiply(translation);}
  if(!part.userData.poseChain){const chain=[];for(let joint=m;joint;joint=joint.parent)chain.unshift({joint,forward:new THREE.Matrix4().makeTranslation(...joint.pivot),back:new THREE.Matrix4().makeTranslation(-joint.pivot[0],-joint.pivot[1],-joint.pivot[2])});let prefix='';for(const pose of chain){const j=pose.joint;pose.key=prefix+=JSON.stringify([j.type,j.pivot,j.side,j.riding||false]);}part.userData.poseChain=chain;}
  if(view.jointPoseEntity===e&&view.jointPoseRoot===matrix){
    const cache=view.jointPoseCache??=new Map();let parent=matrix;
    for(const pose of part.userData.poseChain){
      let entry=cache.get(pose.key);if(!entry){entry={epoch:-1,matrix:new THREE.Matrix4()};cache.set(pose.key,entry);}
      if(entry.epoch!==view.jointPoseEpoch){rotation.makeRotationX(jointAngle(view,pose.joint,e));entry.matrix.copy(parent).multiply(pose.forward).multiply(rotation).multiply(pose.back);entry.epoch=view.jointPoseEpoch;if(view.jointPoseDiagnostics)view.jointPoseDiagnostics.computed++;}
      else if(view.jointPoseDiagnostics)view.jointPoseDiagnostics.reused++;
      parent=entry.matrix;
    }
    return parent;
  }
  for(const pose of part.userData.poseChain){rotation.makeRotationX(jointAngle(view,pose.joint,e));result.multiply(pose.forward).multiply(rotation).multiply(pose.back);}
  return result;
}
