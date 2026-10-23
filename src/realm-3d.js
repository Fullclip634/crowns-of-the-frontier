import * as THREE from 'three';
import {nodeRuntime,standardMaterial} from './render-runtime.js';
import {treeDetail} from './tree-lod.js';
import {BUILDINGS,UNITS,seededRandom} from './data.js';
import {Landscape,buildLandscape,animateWater} from './landscape.js';
import {ensureModels,buildingModel,unitModel,resourceModel,treeModel} from './models-3d.js';
import {renderModelPortrait} from './portrait-3d.js';
import {nearViewport,markInstancePrefix} from './render-batches.js';
import {applySurfaceMaterials} from './surface-assets.js';
import {attackFlight,updateFlight,FlightEffects} from './battle-effects.js';
import {fitFarmTerrain,farmSelectionGeometry} from './farm-grounding.js';
import {groundBuildingFoundation,groundGatePortcullis,updateGatePortcullis,syncFoundationMaterials,fitBuildingSelectionRing} from './building-grounding.js';

export function forestTransform(view,base,id,leaves=false,fall=null){
  const pose=view.forestPose??=new THREE.Matrix4(),rotation=view.forestRotation??=new THREE.Matrix4();pose.copy(base);
  if(fall){const t=Math.max(0,Math.min(1,(view.clock-fall.at)/1.5));rotation.makeRotationZ(t*t*1.48);pose.multiply(rotation);}
  else if(leaves&&view.settings.quality!=='low'&&!view.settings.reducedMotion){rotation.makeRotationZ(Math.sin(view.clock*1.1+id*.27)*(.009+(view.weatherState?.amount||0)*.014));pose.multiply(rotation);}
  return pose;
}

function foundation(view,e){
  if(e.type==='farm')return view.landscape.surfaceHeightAt(e.x,e.z);
  const r=e.r*.65;let height=view.landscape.surfaceHeightAt(e.x,e.z);
  for(const x of [-r,r])for(const z of [-r,r])height=Math.max(height,view.landscape.surfaceHeightAt(e.x+x,e.z+z));
  return height-.12;
}
function buildForest(view){
  view.forest=[];const trees=view.sim.entities.filter(e=>e.type==='wood'&&e.hp>0),rng=seededRandom(view.sim.options.seed+191);
  for(let variant=0;variant<4;variant++){
    const entries=trees.filter(e=>e.id%4===variant);if(!entries.length)continue;
    const sets=[];
    for(const far of [false,true]){
      const model=view.mergeModel(treeModel(view,view.sim.options.map,variant,far)),parts=[],ids=[];
      model.traverse(part=>{if(!part.isMesh)return;const mesh=new THREE.InstancedMesh(part.geometry,part.material,entries.length);mesh.count=0;mesh.castShadow=true;mesh.receiveShadow=true;mesh.frustumCulled=false;mesh.userData.treeIds=ids;mesh.userData.model3d={kind:'resource',type:'wood'};view.objects.add(mesh);parts.push(mesh);});
      sets.push({parts,ids});
    }
    const matrices=entries.map(e=>{const dummy=new THREE.Object3D();dummy.position.set(e.x,view.landscape.surfaceHeightAt(e.x,e.z),e.z);dummy.rotation.y=rng()*6.28;dummy.scale.setScalar(.75+rng()*.55);dummy.updateMatrix();return dummy.matrix.clone();});
    view.forest.push({entries,sets,matrices});
  }
  view.treeIndices.clear();view.forestFog(true);
}
function scaffold(view,e){
  const g=new THREE.Group(),m=view.materials,r=Math.max(1.6,e.r),h=Math.min(8,e.r*1.7);
  for(const x of [-r,r])for(const z of [-r,r])view.cylinder(g,m.wood,x,h/2,z,.055,h);
  for(const yy of [h*.33,h*.66,h])for(const side of [-1,1]){view.box(g,m.wood,0,yy,side*r,r*2,.10,.08);view.box(g,m.wood,side*r,yy,0,.08,.1,r*2);}
  for(const side of [-1,1]){const brace=view.box(g,m.wood,0,h*.5,side*r,.085,Math.hypot(r*2,h),.08);brace.rotation.z=Math.atan2(r*2,h);}
  return view.mergeModel(g);
}

export function installRealm3D(WorldView){
  const p=WorldView.prototype,attach=p.attach,render=p.render,effect=p.effect,burst=p.burst;
  p.attach=function(sim){
    this.hideGhost();this.ghost.userData.type=null;
    this.landscape=new Landscape(sim.options.seed,sim.options.map,sim.worldSize,sim.spawnPositions);this.foundationHeights=new Map();this.forest=[];this.forestLodState=new Map();this.forestRefresh=undefined;this.waterMeshes=[];this.frameFrustum=null;
    while(this.teamMaterials.length<sim.players.length){const material=this.teamMaterials[0].clone();this.teamMaterials.push(material);if(this.roofMaterials){const roof=this.roofMaterials[0].clone();this.roofMaterials.push(roof);this.materials['teamRoof'+(this.roofMaterials.length-1)]=roof;}}
    attach.call(this,sim);this.camera.far=Math.max(400,sim.worldSize*2);this.camera.updateProjectionMatrix();const home=sim.owned(0,'building','towncenter')[0];if(home)this.focus(home.x,home.z);this.scene.fog.near=115;this.scene.fog.far=275;
  };
  p.buildLandscape=function(){ensureModels(this);applySurfaceMaterials(this);syncFoundationMaterials(this);for(let i=0;i<this.sim.players.length;i++)this.roofMaterials[i].color.copy(this.teamMaterials[i].color).lerp(new THREE.Color(this.sim.players[i].faction==='sun'?0xa88651:this.sim.players[i].faction==='raven'?0x6d5b57:0x526479),.72);this.materials.leaf.color.setHex(this.sim.options.map==='winter'?0x74836e:0x5c743d);this.materials.leafDark.color.setHex(this.sim.options.map==='winter'?0x364d40:0x3e5732);buildLandscape(this);};
  p.buildForest=function(){buildForest(this);};
  p.makeSea=function(){}; // The elevated landscape owns all river/coast meshes.
  p.makeBuilding=function(e){return buildingModel(this,e);};
  p.makeUnit=function(e){return unitModel(this,e);};
  p.groundHeight=function(x,z){return this.landscape?.walkableHeightAt(x,z)||0;};
  p.entityHeight=function(e,x=e.x,z=e.z){
    if(e.water||UNITS[e.type]?.naval)return .08;
    if(e.kind==='building'){if(!this.foundationHeights.has(e.id))this.foundationHeights.set(e.id,foundation(this,e));return this.foundationHeights.get(e.id);}
    return this.groundHeight(x,z);
  };
  p.forestFog=function(menu=false){
    const dx=this.camera.position.x-this.target.x,dz=this.camera.position.z-this.target.z,length2=dx*dx+dz*dz;
    // Choose detail by projected size, so normal RTS zoom does not turn every
    // prominent tree into its coarsest mesh merely because the camera is high.
    const pixels=this.container?.clientHeight||globalThis.innerHeight||720;
    const projection=pixels/(2*Math.tan(THREE.MathUtils.degToRad(this.camera.fov)*.5));
    const lod=this.forestLodState??=new Map();
    this.fallSlots=new Map();for(const batch of this.forest||[]){for(const set of batch.sets)set.ids.length=0;batch.entries.forEach((e,i)=>{
      const current=this.sim.get(e.id);
      const fall=this.treeFalls?.get(e.id);
      const along=((e.x-this.target.x)*dx+(e.z-this.target.z)*dz)/length2,side=Math.hypot(e.x-this.target.x-along*dx,e.z-this.target.z-along*dz),lineHeight=this.target.y+(this.camera.position.y-this.target.y)*along;
      const obstructs=!menu&&this.tilt<.61&&along>.12&&along<1&&side<3.2&&lineHeight<this.groundHeight(e.x,e.z)+8;
      const shown=(current?.hp>0||fall)&&!obstructs&&nearViewport(this,e.x,this.groundHeight(e.x,e.z)+3,e.z,14)&&(menu||this.settings.fog===false||this.sim.isExplored(e.x,e.z));
      if(shown){const distance=Math.hypot(this.camera.position.x-e.x,this.camera.position.y-this.groundHeight(e.x,e.z)-3,this.camera.position.z-e.z),screenHeight=6*projection/Math.max(1,distance),detail=treeDetail(screenHeight,this.settings.quality,lod.get(e.id)),set=batch.sets[detail.near?0:1],index=set.ids.length;lod.set(e.id,detail);set.ids.push(e.id);for(const part of set.parts)part.setMatrixAt(index,forestTransform(this,batch.matrices[i],e.id,[this.materials.leaf,this.materials.leafDark,this.materials.snow].includes(part.material),fall));if(fall)this.fallSlots.set(e.id,{parts:set.parts,index,base:batch.matrices[i]});}
    });for(const set of batch.sets)for(const part of set.parts){part.count=set.ids.length;markInstancePrefix(part);part.boundingSphere=null;}}
  };
  p.foliageFog=function(menu){this.forestFog(menu);};
  p.releaseNode=function(node){
    const sharedMaterials=new Set([...Object.values(this.materials),...this.teamMaterials]),sharedGeometry=new Set([...Object.values(this.geo),...(this.authoredGeometry||[]),...(this.sharedModelGeometry||[])]);
    node.traverse(mesh=>{if(!mesh.isMesh)return;if(!sharedGeometry.has(mesh.geometry))mesh.geometry.dispose();if(!sharedMaterials.has(mesh.material))mesh.material.dispose();});
    this.foundationHeights.delete(node.userData.entity);
  };
  p.pruneMissing=function(){
    const present=new Set(this.sim.entities.filter(e=>e.hp>0).map(e=>e.id));
    for(const [id,node]of this.nodes)if(!present.has(id)){
      if(node.userData.batch){const {batch,index}=node.userData;batch.ids[index]=null;batch.free.push(index);}
      this.releaseNode(node);node.removeFromParent();this.nodes.delete(id);
    }
  };
  p.createNode=function(e){
    let node;
    if(e.kind==='unit')node=this.unitNode(e);
    else node=this.mergeModel(e.kind==='building'?this.makeBuilding(e):resourceModel(this,e));
    node.position.set(e.x,this.entityHeight(e),e.z);node.userData.entity=e.id;node.userData.model3d={...node.userData.model3d,kind:e.kind,type:e.water?'fish':e.type};
    if(e.kind==='building'&&!['farm','dock'].includes(e.type)){if(e.type==='wall'||e.type==='gate')node.rotation.y=e.wallAngle||0;groundBuildingFoundation(node,this.landscape);}
    if(e.type==='gate')groundGatePortcullis(node,this.landscape);
    node.traverse(child=>child.userData.entity=e.id);this.objects.add(node);this.nodes.set(e.id,node);
    if(e.owner===0){const field=e.type==='farm',building=e.kind==='building',geometry=field?(this.geo.farmRing??=farmSelectionGeometry()):building?(this.geo.buildingRing??=new THREE.RingGeometry(.975,1,64)):this.geo.ring,ring=new THREE.Mesh(geometry,new THREE.MeshBasicMaterial({color:building?0x88d5b5:0xc5eee2,transparent:true,opacity:.9,side:THREE.DoubleSide,depthWrite:false}));ring.rotation.x=-Math.PI/2;ring.position.y=.07;ring.scale.setScalar(e.r+(field?.14:.45));ring.visible=false;node.add(ring);node.userData.ring=ring;}
    if(e.type==='farm')fitFarmTerrain(node,this.landscape);
    else if(e.kind==='building'&&e.type!=='dock')fitBuildingSelectionRing(node,this.landscape);
    return node;
  };
  p.updateConstruction=function(e,node){
    if(this.renderer.isWebGPURenderer){
      if(e.progress<1){
        if(!node.userData.construction){
          const plane=new THREE.Plane(new THREE.Vector3(0,-1,0),0),group=new (nodeRuntime().ClippingGroup)();
          group.clippingPlanes=[plane];group.clipShadows=true;
          for(const child of [...node.children])if(child!==node.userData.ring)group.add(child);
          node.add(group);const frame=scaffold(this,e);node.add(frame);
          node.userData.construction={plane,group,frame};
        }
        node.userData.construction.plane.constant=node.position.y+Math.max(.18,e.progress*13);
      }else if(node.userData.construction){
        const {group,frame}=node.userData.construction;
        for(const child of [...group.children])node.add(child);group.removeFromParent();
        frame.traverse(mesh=>{if(mesh.isMesh)mesh.geometry.dispose();});frame.removeFromParent();delete node.userData.construction;
      }
      return;
    }
    if(e.progress<1){
      if(!node.userData.construction){
        const plane=new THREE.Plane(new THREE.Vector3(0,-1,0),0),materials=[],restore=[];
        node.traverse(mesh=>{if(!mesh.isMesh||mesh===node.userData.ring)return;const original=mesh.material,clipped=original.clone();clipped.defines={...original.defines};clipped.onBeforeCompile=original.onBeforeCompile;clipped.customProgramCacheKey=original.customProgramCacheKey;clipped.clippingPlanes=[plane];clipped.clipShadows=true;mesh.material=clipped;materials.push(clipped);restore.push([mesh,original]);});
        const frame=scaffold(this,e);node.add(frame);node.userData.construction={plane,materials,restore,frame};this.renderer.localClippingEnabled=true;
      }
      node.userData.construction.plane.constant=node.position.y+Math.max(.18,e.progress*13);
    }else if(node.userData.construction){
      const data=node.userData.construction;for(const [mesh,material]of data.restore)mesh.material=material;for(const material of data.materials)material.dispose();data.frame.traverse(mesh=>{if(mesh.isMesh)mesh.geometry.dispose();});node.remove(data.frame);delete node.userData.construction;
    }
  };
  p.showGhost=function(type,x,z,valid){
    if(this.ghost.userData.type!==type){
      this.ghost.userData.farmGroundX=this.ghost.userData.farmGroundZ=undefined;
      this.ghost.userData.foundationGroundX=this.ghost.userData.foundationGroundZ=undefined;
      this.ghost.traverse(mesh=>{if(mesh.isMesh){if(!Object.values(this.geo).includes(mesh.geometry)&&!this.authoredGeometry?.has(mesh.geometry)&&!this.sharedModelGeometry?.has(mesh.geometry))mesh.geometry.dispose();if(mesh.userData.previewMaterial)mesh.material.dispose();}});this.clearGroup(this.ghost);
      const model=this.mergeModel(this.makeBuilding({kind:'building',type,owner:0,r:BUILDINGS[type]?.r||2.5,x,z}));
      model.traverse(mesh=>{if(!mesh.isMesh)return;const original=mesh.material;mesh.material=original.clone();mesh.material.defines={...original.defines};mesh.material.onBeforeCompile=original.onBeforeCompile;mesh.material.customProgramCacheKey=original.customProgramCacheKey;mesh.material.transparent=true;mesh.material.opacity=.38;mesh.material.depthWrite=false;mesh.material.clippingPlanes=null;mesh.castShadow=false;mesh.userData.previewMaterial=true;});this.ghost.add(model);this.ghost.userData.type=type;
    }
    this.ghost.position.set(x,foundation(this,{type,r:BUILDINGS[type]?.r||2.5,x,z}),z);this.ghost.visible=true;
    if(type==='farm'&&(this.ghost.userData.farmGroundX!==x||this.ghost.userData.farmGroundZ!==z)){fitFarmTerrain(this.ghost,this.landscape,true);this.ghost.userData.farmGroundX=x;this.ghost.userData.farmGroundZ=z;}
    if(!['farm','dock'].includes(type)&&(this.ghost.userData.foundationGroundX!==x||this.ghost.userData.foundationGroundZ!==z)){groundBuildingFoundation(this.ghost.children[0],this.landscape,true);this.ghost.userData.foundationGroundX=x;this.ghost.userData.foundationGroundZ=z;}
    this.ghost.traverse(mesh=>{if(mesh.isMesh)mesh.material.color.setHex(valid?0x8de3c5:0xee816a);});
  };
  p.burst=function(x,z,color,size){const count=this.fx.length;burst.call(this,x,z,color,size);for(let i=count;i<this.fx.length;i++)this.fx[i].object.position.y=this.groundHeight(x,z)+.4;};
  p.effect=function(event){
    if(event.type==='attack'){
      if(this.fx.length>(this.settings.quality==='low'?32:90))return;
      const flight=attackFlight(this,event.entity,event.target,event.garrisonArrow||0,event),pool=this.flightEffects??=new FlightEffects(),object=pool.acquire(flight.kind);
      const shot={...flight,object,time:event.flightAge||0,recycle:mesh=>pool.release(mesh)};updateFlight(shot,Math.min(1,shot.time/shot.duration));this.scene.add(object);this.fx.push(shot);return;
    }
    const count=this.fx.length;effect.call(this,event);
    for(let i=count;i<this.fx.length;i++){
      const f=this.fx[i];if(f.particles)continue;
      if(event.type==='heal'){
        f.groundY=this.entityHeight(event.target);
      }
    }
  };
  p.render=function(dt,menu){
    animateWater(this);
    for(const bridge of this.bridgeMeshes||[])bridge.visible=!!menu||this.settings.fog===false||this.sim.isExplored(bridge.userData.bridge.center,0);
    if(this.materials.glow)this.materials.glow.emissiveIntensity=1.4+Math.sin(this.clock*8)*.25;
    for(const [id,slot]of this.fallSlots||[]){const fall=this.treeFalls?.get(id);if(!fall)continue;const matrix=forestTransform(this,slot.base,id,false,fall);for(const part of slot.parts){part.setMatrixAt(slot.index,matrix);markInstancePrefix(part);}}
    for(const e of this.sim?.entities||[]){
      let node=this.nodes.get(e.id);if(!node)continue;
      if(e.hp>0&&e.kind==='building'&&e.type==='towncenter'&&node.userData.model3d.architectureAge!==this.sim.players[e.owner].age){this.releaseNode(node);node.removeFromParent();this.nodes.delete(e.id);node=this.createNode(e);}
      const gate=node.userData.portcullis;
      if(node.userData.selectionRingFitted&&(e.type==='wall'||e.type==='gate'))node.userData.ring.rotation.z=-(e.wallAngle||0);
      if(gate){const nearby=this.sim.entities.some(u=>u.hp>0&&u.kind==='unit'&&this.sim.allied(u.owner,e.owner)&&!u.embarked&&!UNITS[u.type].naval&&Math.hypot(u.x-e.x,u.z-e.z)<5.5),desired=nearby?(gate.userData.terrainGate?.openLift||2.5):0;gate.position.y=Math.abs(desired-gate.position.y)<.002?desired:gate.position.y+(desired-gate.position.y)*Math.min(1,dt*6);updateGatePortcullis(gate);}
    }
    this.groundCover?.update(menu);
    this.terrainDetails?.update(menu);
    const cameraChanged=this.lastForestAngle!==this.angle||this.lastForestZoom!==this.zoom||this.lastForestX!==this.target.x||this.lastForestZ!==this.target.z||this.lastForestTilt!==this.tilt||this.lastForestQuality!==this.settings.quality||this.lastForestScale!==this.dynamicScale||this.lastForestAspect!==this.camera.aspect||this.lastForestHeight!==this.container.clientHeight;
    const forestInterval=this.settings.quality==='high'?.16:this.settings.quality==='medium'?.26:.45;
    if(cameraChanged||this.forestRefresh===undefined||this.clock-this.forestRefresh>forestInterval){this.forestFog(menu);this.forestRefresh=this.clock;this.lastForestAngle=this.angle;this.lastForestZoom=this.zoom;this.lastForestX=this.target.x;this.lastForestZ=this.target.z;this.lastForestTilt=this.tilt;this.lastForestQuality=this.settings.quality;this.lastForestScale=this.dynamicScale;this.lastForestAspect=this.camera.aspect;this.lastForestHeight=this.container.clientHeight;}
    render.call(this,dt,menu);
    if(!menu)renderModelPortrait(this);
  };
}

