import * as THREE from 'three';
import {entityGroundHeight} from './entity-ground.js';
import {nodeRuntime,standardMaterial} from './render-runtime.js';
import {treeDetail,farFootprintScale,footprintScaledMatrix,treeTint} from './tree-lod.js';
import {treeDetailThreshold} from './distance-lod.js';
import {targetFrameRate} from './frame-pacing.js';
import {BUILDINGS,UNITS,seededRandom} from './data.js';
import {Landscape,buildLandscape,animateWater} from './landscape.js';
import {ensureModels,buildingModel,unitModel,resourceModel,treeModel} from './models-3d.js';
import {renderModelPortrait} from './portrait-3d.js';
import {nearViewport,markInstancePrefix,prepareViewport} from './render-batches.js';
import {applySurfaceMaterials} from './surface-assets.js';
import {attackFlight,updateFlight,FlightEffects} from './battle-effects.js';
import {fitFarmTerrain,farmSelectionGeometry} from './farm-grounding.js';
import {groundBuildingFoundation,groundGatePortcullis,updateGatePortcullis,syncFoundationMaterials,fitBuildingSelectionRing} from './building-grounding.js';
import {wallTier} from './fortified-walls.js';
import {treeBiome,isSnowBiome,isAridBiome} from './terrain-biomes.js';
import {architectureOutdated} from './architecture-age.js';
import {shadeBattlefieldFog} from './fog-surface.js';
import {updateBridgeVisibility} from './bridge-art.js';
import {biomeVolcanicTreeModel} from './biome-art.js';
import {forEachNearbyUnit} from './spatial-buckets.js';

export function forestTransform(view,base,id,leaves=false,fall=null){
  const pose=view.forestPose??=new THREE.Matrix4(),rotation=view.forestRotation??=new THREE.Matrix4();pose.copy(base);
  if(fall){const t=Math.max(0,Math.min(1,(view.clock-fall.at)/1.5));rotation.makeRotationZ(t*t*1.48);pose.multiply(rotation);}
  else if(leaves&&view.settings.quality!=='low'&&!view.settings.reducedMotion){
    const wind=view.atmosphereUniforms?.wind?.value;
    const wLen=wind?Math.hypot(wind.x,wind.z):0;
    const speed=wLen>.001?Math.max(.55,Math.min(2.4,wLen*.7)):1;
    const wx=wLen>.001?wind.x/wLen:1;
    const wz=wLen>.001?wind.z/wLen:0;
    const amp=.009+(view.weatherState?.amount||0)*.015;
    const primary=Math.sin(view.clock*(1.08+.14*speed)+id*.27);
    const gust=Math.sin(view.clock*(2.15+.25*speed)+id*.71)*.22;
    const sway=(primary+gust)*amp;
    rotation.makeRotationZ(sway*(wLen>.001?.75+.25*Math.abs(wx):1));
    pose.multiply(rotation);
    if(wLen>.001&&Math.abs(wz)>.08){
      const cross=view.forestCrossRotation??=new THREE.Matrix4();
      cross.makeRotationX(sway*wz*.45);
      pose.multiply(cross);
    }
  }
  return pose;
}

function forestShadowTexture(){
  const size=64,data=new Uint8Array(size*size*4);
  for(let y=0;y<size;y++)for(let x=0;x<size;x++){
    const u=(x+.5)/size*2-1,v=(y+.5)/size*2-1,r=Math.hypot(u,v);
    // Soft multi-lobe humus + dappled canopy shadow fading cleanly to 0 at r=1.
    const angle=Math.atan2(v,u);
    const rim=Math.max(0,1-Math.min(1,r/(.94+.05*Math.sin(angle*5+.6)+.03*Math.cos(angle*3-1.1))));
    const alpha=Math.pow(rim,1.65);
    const i=(y*size+x)*4;
    data[i]=255;data[i+1]=255;data[i+2]=255;data[i+3]=Math.round(alpha*255);
  }
  const tex=new THREE.DataTexture(data,size,size,THREE.RGBAFormat);
  tex.colorSpace=THREE.SRGBColorSpace;
  tex.magFilter=THREE.LinearFilter;
  tex.minFilter=THREE.LinearMipmapLinearFilter;
  tex.generateMipmaps=true;
  tex.needsUpdate=true;
  return tex;
}

export function volcanicSnagModel(view,variant=0,far=false){
  const g=new THREE.Group(),m=view.materials,rng=seededRandom(7331+variant*137);
  const segs=far?5:6;
  const trunkMat=m.trunk||m.wood;
  const addLimb=(mat,x,y,z,topR,botR,len,rx,ry,rz)=>{
    const geo=new THREE.CylinderGeometry(topR,botR,len,segs,1,false);
    geo.translate(0,len*.5,0);
    const mesh=new THREE.Mesh(geo,mat);
    mesh.position.set(x,y,z);
    mesh.rotation.order='YXZ';
    mesh.rotation.set(rx,ry,rz);
    g.add(mesh);
    return mesh;
  };
  const h1=1.85+rng()*.55,leanX=(rng()-.5)*.26,leanZ=(rng()-.5)*.26;
  const baseR=.36+rng()*.08,midR=.21+rng()*.05;
  // Flared root buttress + crooked lower charred trunk
  addLimb(trunkMat,0,-.12,0,baseR*1.05,baseR*1.42,.58,0,rng()*6.28,0);
  addLimb(trunkMat,0,.32,0,midR,baseR,h1,leanX,0,leanZ);
  const topX=-Math.sin(leanZ)*h1,topY=.32+Math.cos(Math.hypot(leanX,leanZ))*h1,topZ=Math.sin(leanX)*h1;
  const h2=1.95+rng()*.95,bendX=leanX+(rng()-.5)*.34,bendZ=leanZ+(rng()-.5)*.34;
  addLimb(trunkMat,topX,topY-.08,topZ,.055+rng()*.03,midR*.96,h2,bendX,0,bendZ);
  // Broken forked charred limbs
  const limbCount=far?3:4;
  for(let i=0;i<limbCount;i++){
    const t=.28+(i/limbCount)*.62+rng()*.08;
    const lx=topX-Math.sin(bendZ)*h2*t,ly=topY+Math.cos(Math.hypot(bendX,bendZ))*h2*t,lz=topZ+Math.sin(bendX)*h2*t;
    const yaw=(i*(Math.PI*2/limbCount))+rng()*.7,pitch=.52+rng()*.48,len=1.05+rng()*1.15;
    const r0=Math.max(.06,midR*(.65-t*.3));
    addLimb(trunkMat,lx,ly,lz,r0*.24,r0,len,pitch,yaw,0);
    if(!far&&i<3){
      const midLen=len*.56;
      const sx=lx+Math.sin(yaw)*Math.sin(pitch)*midLen,sy=ly+Math.cos(pitch)*midLen,sz=lz+Math.cos(yaw)*Math.sin(pitch)*midLen;
      addLimb(trunkMat,sx,sy,sz,.018,r0*.42,.55+rng()*.45,pitch+.38,yaw+(i%2?1:-1)*.65,0);
    }
  }
  // Subtle glowing ember cleft near charred root collar on near LOD
  if(!far&&m.glow){
    const cleftAngle=rng()*6.28;
    const ember=new THREE.Mesh(new THREE.CylinderGeometry(.045,.11,.46,5,1,false),m.glow);
    ember.position.set(Math.cos(cleftAngle)*baseR*.78,.24,Math.sin(cleftAngle)*baseR*.78);
    ember.rotation.set(.18,cleftAngle,-.14);
    g.add(ember);
  }
  g.userData.foliageSpecies='volcanic snag';
  return g;
}

function foundation(view,e){
  if(e.type==='farm')return view.landscape.surfaceHeightAt(e.x,e.z);
  const r=e.r*.65;let height=view.landscape.surfaceHeightAt(e.x,e.z);
  for(const x of [-r,r])for(const z of [-r,r])height=Math.max(height,view.landscape.surfaceHeightAt(e.x+x,e.z+z));
  return height-.12;
}
function buildForest(view){
  view.forest=[];const trees=view.sim.entities.filter(e=>e.type==='wood'&&(e.hp>0||view.sim.resourceMemory?.has(e.id))),rng=seededRandom(view.sim.options.seed+191);
  const materials=new Map();
  const leafy=new Set([view.materials.leaf,view.materials.leafDark]);
  const map=view.sim.options.map,volcanic=map==='volcanic';
  // Arid frontiers read as sparse flat-topped desert acacias; volcanic frontiers
  // use sculpted charred dead snags; tundra keeps snow-laden alpine spruces.
  const canopyScale=volcanic?.95:isAridBiome(map)?.84:isSnowBiome(map)?.96:map==='woodland'?1.12:1;
  const shadowColor=volcanic?0x14100e:isSnowBiome(map)?0x3a4d62:isAridBiome(map)?0x4a3822:0x172414;
  const shadowOpacity=volcanic?.36:isSnowBiome(map)?.24:isAridBiome(map)?.26:.38;
  view.forestShadow=null;
  if(trees.length){
    const shadowMat=shadeBattlefieldFog(standardMaterial({
      map:view.forestShadowMap??=forestShadowTexture(),
      color:shadowColor,transparent:true,opacity:shadowOpacity,
      roughness:1,metalness:0,depthWrite:false,
      polygonOffset:true,polygonOffsetFactor:-1,polygonOffsetUnits:-1,
    }),view);
    const shadowGeo=view.geo.forestShadow??=(()=>{const g=new THREE.PlaneGeometry(1,1);g.rotateX(-Math.PI/2);return g;})();
    view.forestShadow=new THREE.InstancedMesh(shadowGeo,shadowMat,trees.length);
    view.forestShadow.count=0;view.forestShadow.castShadow=false;view.forestShadow.receiveShadow=false;
    view.forestShadow.frustumCulled=false;view.forestShadow.renderOrder=1;
    view.objects.add(view.forestShadow);
  }
  const up=new THREE.Vector3(0,1,0),slopeNormal=new THREE.Vector3(),slopeQuat=new THREE.Quaternion(),shadowDummy=new THREE.Object3D();
  for(let variant=0;variant<4;variant++){
    const entries=trees.filter(e=>e.id%4===variant);if(!entries.length)continue;
    const sets=[],footprint=[];
    // Bark keeps its authored colour; only the canopy varies per tree.
    const tints=entries.map(e=>{const tint=treeTint(e.id);return new THREE.Color().setRGB(tint.r,tint.g,tint.b);});
    for(const far of [false,true]){
      const rawModel=volcanic?(biomeVolcanicTreeModel(view,variant,far)||volcanicSnagModel(view,variant,far)):treeModel(view,map,variant,far);
      const model=view.mergeModel(rawModel),parts=[],ids=[];
      model.updateMatrixWorld(true);const bounds=new THREE.Box3().setFromObject(model),size=bounds.getSize(new THREE.Vector3());
      footprint.push(Math.max(size.x,size.z));
      model.traverse(part=>{
        if(!part.isMesh)return;
        if(view.settings.quality==='low'&&part.userData.foliageDetail==='closed leaf tips')return;
        const source=part.material;
        if(!materials.has(source)){const cloned=shadeBattlefieldFog(source.clone(),view);if(source===view.materials.glow)cloned.emissiveIntensity=1.75;materials.set(source,cloned);}
        const mesh=new THREE.InstancedMesh(part.geometry,materials.get(source),entries.length);mesh.count=0;mesh.castShadow=!far&&part.userData.foliageDetail!=='closed leaf tips';mesh.receiveShadow=true;mesh.frustumCulled=false;mesh.userData.treeIds=ids;mesh.userData.model3d={kind:'resource',type:'wood'};
        mesh.userData.foliageSway=!volcanic&&(leafy.has(source)||source===view.materials.snow);
        // One forest built from a single canopy still reads as rows of copies.
        // A small per-tree tint breaks that up without new geometry, and it is
        // derived from the tree id so it never changes between frames.
        if(leafy.has(part.material)){for(let i=0;i<entries.length;i++)mesh.setColorAt(i,tints[i]);if(mesh.instanceColor)mesh.instanceColor.needsUpdate=true;}
        view.objects.add(mesh);parts.push(mesh);
      });
      sets.push({parts,ids});
    }
    const matrices=[],shadowMatrices=[];
    const canopyDiameter=Math.max(2.6,Math.min(5.6,(footprint[0]||3.2)*(volcanic?.78:1.18)));
    for(const e of entries){
      const dummy=new THREE.Object3D();
      // Subtle sub-cell jitter (±0.42m) + varied height/width + natural trunk lean
      // breaks up grid rows while keeping trunks inside their exact simulation cell.
      const jx=(rng()-.5)*.84,jz=(rng()-.5)*.84,px=e.x+jx,pz=e.z+jz;
      const py=view.landscape.surfaceHeightAt(px,pz);
      const hL=view.landscape.surfaceHeightAt(px-.8,pz),hR=view.landscape.surfaceHeightAt(px+.8,pz);
      const hD=view.landscape.surfaceHeightAt(px,pz-.8),hU=view.landscape.surfaceHeightAt(px,pz+.8);
      const slope=Math.hypot(hR-hL,hU-hD)/1.6;
      const hScale=(.72+rng()*.62)*canopyScale,wScale=hScale*(.88+rng()*.24);
      dummy.position.set(px,py-Math.min(.22,slope*.24),pz);
      dummy.rotation.set((rng()-.5)*.08,rng()*6.28,(rng()-.5)*.08);
      dummy.scale.set(wScale,hScale,wScale);
      dummy.updateMatrix();
      matrices.push(dummy.matrix.clone());
      slopeNormal.set(hL-hR,1.6,hD-hU).normalize();
      slopeQuat.setFromUnitVectors(up,slopeNormal);
      shadowDummy.position.set(px,py+.055,pz);
      shadowDummy.quaternion.copy(slopeQuat);
      shadowDummy.scale.set(canopyDiameter*wScale,1,canopyDiameter*wScale);
      shadowDummy.updateMatrix();
      shadowMatrices.push(shadowDummy.matrix.clone());
    }
    // The authored far canopy is decimated and can also be smaller than the
    // near one. Restoring its footprint keeps distant trees reading as trees
    // instead of shrinking into a blob.
    const farScale=farFootprintScale(footprint[0],footprint[1]);
    // Widen the far canopy only. Scaling the whole basis would also stretch the
    // trunk and make distant trees taller than the near model, which pops at
    // the swap distance.
    const farMatrices=matrices.map(matrix=>footprintScaledMatrix(matrix,farScale));
    view.forest.push({entries,sets,matrices,farMatrices,shadowMatrices});
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

function fogScenery(view,node){
  const materials=view.sceneryFogMaterials??=new Map();
  node.traverse(part=>{
    if(!part.isMesh)return;
    const source=part.material;
    if(!materials.has(source)){
      const material=source.clone();
      material.onBeforeCompile=source.onBeforeCompile;
      material.customProgramCacheKey=source.customProgramCacheKey;
      materials.set(source,shadeBattlefieldFog(material,view));
    }
    part.material=materials.get(source);
  });
}

export function installRealm3D(WorldView){
  const p=WorldView.prototype,attach=p.attach,render=p.render,effect=p.effect,burst=p.burst;
  p.attach=function(sim){
    const sameSimulation=this.sim===sim;
    this.hideGhost();this.ghost.userData.type=null;
    if(this.forestShadow){this.forestShadow.material?.dispose?.();this.forestShadow=null;}
    this.landscape=new Landscape(sim.options.seed,sim.options.map,sim.worldSize,sim.spawnPositions,sim.startingSites);this.foundationHeights=new Map();this.forest=[];this.forestLodState=new Map();this.forestRefresh=undefined;this.waterMeshes=[];this.frameFrustum=null;
    while(this.teamMaterials.length<sim.players.length){const material=this.teamMaterials[0].clone();this.teamMaterials.push(material);if(this.roofMaterials){const roof=this.roofMaterials[0].clone();this.roofMaterials.push(roof);this.materials['teamRoof'+(this.roofMaterials.length-1)]=roof;}}
    attach.call(this,sim);this.camera.far=Math.max(400,sim.worldSize*2);this.camera.updateProjectionMatrix();const home=sim.owned(0,'building','towncenter')[0];if(!sameSimulation&&home)this.focus(home.x,home.z);this.scene.fog.near=115;this.scene.fog.far=275;
  };
  p.buildLandscape=function(){
    ensureModels(this);applySurfaceMaterials(this);syncFoundationMaterials(this);
    const roofColors={alder:new THREE.Color(0x687982),raven:new THREE.Color(0x716d68),sun:new THREE.Color(0x9d754d)};
    for(const [i,player] of this.sim.players.entries()){
      this.roofMaterials[i].color.copy(roofColors[player.faction]||roofColors.alder).lerp(this.teamMaterials[i].color,.11);
    }
    const map=this.sim.options.map,treeKind=treeBiome(map),volcanic=map==='volcanic',dry=isAridBiome(map)&&map!=='desert'&&!volcanic,lush=map==='woodland'||map==='riverland';
    this.materials.leaf.color.setHex(treeKind==='winter'?0x74836e:volcanic?0x4d433d:dry?0x878d4f:treeKind==='desert'?0x8a8752:lush?0x3e5f35:0x526b3c);
    this.materials.leafDark.color.setHex(treeKind==='winter'?0x364d40:volcanic?0x2b2421:dry?0x4f562e:treeKind==='desert'?0x4a4830:lush?0x2b4429:0x344e30);
    if(this.materials.trunk)this.materials.trunk.color.setHex(volcanic?0x382f2b:dry?0x6c5941:0x66563e);
    buildLandscape(this);
  };
  p.buildForest=function(){buildForest(this);};
  p.makeSea=function(){}; // The elevated landscape owns all river/coast meshes.
  p.makeBuilding=function(e){return buildingModel(this,e);};
  p.makeUnit=function(e,catalogue=null){return unitModel(this,e,catalogue);};
  p.groundHeight=function(x,z){return this.landscape?.walkableHeightAt(x,z)||0;};
  p.entityHeight=function(e,x=e.x,z=e.z){
    if(e.water||UNITS[e.type]?.naval)return .08;
    if(e.kind==='building'){if(!this.foundationHeights.has(e.id))this.foundationHeights.set(e.id,foundation(this,e));return this.foundationHeights.get(e.id);}
    return entityGroundHeight(this,e,x,z);
  };
  p.forestFog=function(menu=false){
    if(this.camera?.isCamera&&this.camera.matrixWorldInverse)prepareViewport(this);
    const dx=this.camera.position.x-this.target.x,dz=this.camera.position.z-this.target.z,length2=dx*dx+dz*dz;
    // Choose detail by projected size, so normal RTS zoom does not turn every
    // prominent tree into its coarsest mesh merely because the camera is high.
    const pixels=this.container?.clientHeight||globalThis.innerHeight||720;
    const projection=pixels/(2*Math.tan(THREE.MathUtils.degToRad(this.camera.fov)*.5));
    const lod=this.forestLodState??=new Map();
    // Real GPU time when available, CPU frame time otherwise. A bound frame
    // raises the swap threshold so more forest uses the decimated canopy.
    const budgetMs=1000/targetFrameRate(this.settings);
    const quality=this.settings.quality;
    const lodOptions=quality==='low'?{base:115,maximum:168}:quality==='medium'?{base:70,maximum:118}:{base:46,maximum:92};
    const threshold=treeDetailThreshold(this.frameTimeMs,budgetMs,lodOptions);
    this.forestDetailThreshold=threshold;
    let shadowCount=0;const useShadow=quality!=='low'&&this.forestShadow;
    this.fallSlots=new Map();for(const batch of this.forest||[]){for(const set of batch.sets)set.ids.length=0;batch.entries.forEach((e,i)=>{
      const current=this.sim.resourceMemory?.get(e.id)??this.sim.get(e.id),fall=this.treeFalls?.get(e.id);
      if(!(current?.hp>0||fall))return;
      const groundY=batch.matrices[i]?.elements[13]??this.groundHeight(e.x,e.z);
      if(!nearViewport(this,e.x,groundY+3,e.z,14))return;
      if(!(menu||this.settings.fog===false||this.sim.isExplored(e.x,e.z)))return;
      const along=length2>0?((e.x-this.target.x)*dx+(e.z-this.target.z)*dz)/length2:0,side=Math.hypot(e.x-this.target.x-along*dx,e.z-this.target.z-along*dz),lineHeight=this.target.y+(this.camera.position.y-this.target.y)*along;
      if(!menu&&this.tilt<.61&&along>.12&&along<1&&side<3.2&&lineHeight<groundY+8)return;
      const distance=Math.hypot(this.camera.position.x-e.x,this.camera.position.y-groundY-3,this.camera.position.z-e.z),screenHeight=6*projection/Math.max(1,distance),detail=treeDetail(screenHeight,quality,lod.get(e.id),{threshold}),set=batch.sets[detail.near?0:1],index=set.ids.length,base=detail.near?batch.matrices[i]:batch.farMatrices[i];lod.set(e.id,detail);set.ids.push(e.id);for(const part of set.parts)part.setMatrixAt(index,forestTransform(this,base,e.id,part.userData.foliageSway,fall));if(fall)this.fallSlots.set(e.id,{parts:set.parts,index,base});else if(useShadow&&batch.shadowMatrices?.[i]){this.forestShadow.setMatrixAt(shadowCount++,batch.shadowMatrices[i]);}
    });for(const set of batch.sets)for(const part of set.parts){part.count=set.ids.length;markInstancePrefix(part);part.boundingSphere=null;}}
    if(this.forestShadow){this.forestShadow.count=useShadow?shadowCount:0;markInstancePrefix(this.forestShadow);this.forestShadow.boundingSphere=null;}
  };
  p.foliageFog=function(menu){this.forestFog(menu);};
  p.releaseNode=function(node){
    const sharedMaterials=new Set([...Object.values(this.materials),...this.teamMaterials,...(this.sceneryFogMaterials?.values()||[])]),sharedGeometry=new Set([...Object.values(this.geo),...(this.authoredGeometry||[]),...(this.sharedModelGeometry||[])]);
    node.traverse(mesh=>{if(!mesh.isMesh)return;if(!sharedGeometry.has(mesh.geometry))mesh.geometry.dispose();if(!sharedMaterials.has(mesh.material))mesh.material.dispose();});
    this.foundationHeights.delete(node.userData.entity);
  };
  p.pruneMissing=function(presentIndex=null){
    const present=presentIndex?null:new Set(this.sim.entities.filter(e=>e.hp>0).map(e=>e.id));
    for(const [id,node]of this.nodes)if(presentIndex?!(presentIndex.get(id)?.hp>0):!present.has(id)){
      if(node.userData.batch){const {batch,index}=node.userData;batch.ids[index]=null;batch.free.push(index);}
      this.releaseNode(node);node.removeFromParent();this.nodes.delete(id);
    }
  };
  p.createNode=function(e){
    let node;
    if(e.kind==='unit')node=this.unitNode(e);
    else node=this.mergeModel(e.kind==='building'?this.makeBuilding(e):resourceModel(this,e));
    if(e.kind==='resource'||e.kind==='shrine')fogScenery(this,node);
    node.position.set(e.x,this.entityHeight(e),e.z);node.userData.entity=e.id;node.userData.model3d={...node.userData.model3d,kind:e.kind,type:e.water?'fish':e.type};
    if(e.kind==='building'&&!['farm','dock'].includes(e.type)){if(e.type==='wall'||e.type==='gate')node.rotation.y=e.wallAngle||0;groundBuildingFoundation(node,this.landscape);}
    if(e.type==='gate')groundGatePortcullis(node,this.landscape);
    node.traverse(child=>child.userData.entity=e.id);this.objects.add(node);this.nodes.set(e.id,node);
    if(e.owner===0){const field=e.type==='farm',building=e.kind==='building',geometry=field?(this.geo.farmRing??=farmSelectionGeometry()):building?(this.geo.buildingRing??=new THREE.RingGeometry(.975,1,64)):this.geo.ring,ring=new THREE.Mesh(geometry,new THREE.MeshBasicMaterial({color:building?0x88d5b5:0xc5eee2,transparent:true,opacity:.9,side:THREE.DoubleSide,depthWrite:false}));ring.rotation.x=-Math.PI/2;ring.position.y=.07;ring.scale.setScalar(e.r+(field?.14:.45));ring.visible=false;node.add(ring);node.userData.ring=ring;}
    if(e.type==='farm'){fitFarmTerrain(node,this.landscape);node.traverse(child=>{if(child.isMesh)child.castShadow=false;});}
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
      const shot={...flight,object,time:event.flightAge||0,recycle:mesh=>pool.release(mesh)};updateFlight(shot,Math.min(1,shot.time/shot.duration));if(flight.kind==='slash')this.scene.add(object);this.fx.push(shot);return;
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
    updateBridgeVisibility(this,menu);
    if(this.materials.glow)this.materials.glow.emissiveIntensity=1.4+Math.sin(this.clock*8)*.25;
    for(const [id,slot]of this.fallSlots||[]){const fall=this.treeFalls?.get(id);if(!fall)continue;const matrix=forestTransform(this,slot.base,id,false,fall);for(const part of slot.parts){part.setMatrixAt(slot.index,matrix);markInstancePrefix(part);}}
    let landUnits=null;
    for(const e of this.sim?.entities||[]){
      if(e.kind!=='building')continue;
      let node=this.nodes.get(e.id);if(!node)continue;
      if(e.hp>0&&(architectureOutdated(this.sim,e,node)||((e.type==='wall'||e.type==='gate')&&(node.userData.model3d?.wallTier??'stone')!==wallTier(this.sim,e)))){this.releaseNode(node);node.removeFromParent();this.nodes.delete(e.id);node=this.createNode(e);}
      const gate=node.userData.portcullis;
      if(node.userData.selectionRingFitted&&(e.type==='wall'||e.type==='gate'))node.userData.ring.rotation.z=-(e.wallAngle||0);
      if(gate){
        let nearby=false;
        if(this.sim.unitBuckets?.size){
          forEachNearbyUnit(this.sim,e.x,e.z,5.5,u=>{
            if(!nearby&&u.hp>0&&!u.embarked&&!UNITS[u.type]?.naval&&this.sim.allied(u.owner,e.owner)&&(u.x-e.x)**2+(u.z-e.z)**2<30.25)nearby=true;
          });
        }else{
          landUnits??=this.sim.entities.filter(u=>u.hp>0&&u.kind==='unit'&&!u.embarked&&!UNITS[u.type].naval);
          nearby=landUnits.some(u=>this.sim.allied(u.owner,e.owner)&&(u.x-e.x)**2+(u.z-e.z)**2<30.25);
        }
        const desired=nearby?(gate.userData.terrainGate?.openLift||2.5):0;gate.position.y=Math.abs(desired-gate.position.y)<.002?desired:gate.position.y+(desired-gate.position.y)*Math.min(1,dt*6);updateGatePortcullis(gate);
      }
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

