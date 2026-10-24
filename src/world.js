import {installWorldPolish} from './world-polish.js';
import {installVisualDepth} from './visual-depth.js';
import {installRealm3D} from './realm-3d.js';
import {installCampaignView} from './campaign-view.js';
import {installWeather} from './weather.js';
import {installWorldInteractions} from './world-interactions.js';
import * as THREE from 'three';
import {standardMaterial,nodeRuntime} from './render-runtime.js';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';
import {WORLD, FACTIONS, UNITS, BUILDINGS, seededRandom} from './data.js';
import {insideMap} from './map-geometry.js';
import {terrainBiome} from './terrain-biomes.js';
import {authoredAssetState,prepareAuthoredAssets,workerVisualTask,trimAuthoredAssets} from './authored-assets.js';
import {beginUnitFrame,writeUnitPose,endUnitFrame,nearViewport,installRenderFrame,markInstancePrefix,prepareViewport} from './render-batches.js';
import {sceneNodeFor,releaseSceneNode} from './scene-nodes.js';
import {installBattleRemains} from './battle-remains.js';
import {loadSurfaceAssets,retainedSurfaceTextures,trimSurfaceAssets} from './surface-assets.js';
import {mergeUnitModel} from './unit-palette.js';
import {installStructurePalette} from './structure-palette.js';
import {targetFrameRate} from './frame-pacing.js';
import {updateFlight,releaseEffect,ImpactEffects} from './battle-effects.js';
import {LocalMotion,smoothHeading,renderPosition} from './motion-smoothing.js';
import {pickFruitVolume} from './resource-picking.js';
import {UnitLocomotion} from './locomotion.js';
import {UnitActions} from './unit-actions.js';
import {createRigidUnitPart,disposeRigidPart} from './rig-batches.js';
import {setShadowEnabled,applyRendererQuality,transitionRendererQuality} from './render-quality.js';
import {WallVisuals} from './wall-visuals.js';
import {scheduleShadows,positionShadowLight} from './shadow-sampling.js';
import {ensureModelIndices} from './vertex-layout.js';
import {createWorldRenderer} from './render-context.js';
import {graphicsCheckpoint} from './graphics-checkpoint.js';
import {installCombatPresentation,combatTime} from './combat-presentation.js';
import {projectileTargetHeight} from './combat-timing.js';

const mat=(color,extra={})=>standardMaterial({color,roughness:1,...extra});
export const CAMERA_PRESETS={balanced:{label:'Perspective',tilt:32*Math.PI/180,zoom:44},cinematic:{label:'Close view',tilt:20*Math.PI/180,zoom:30},tactical:{label:'Overview',tilt:56*Math.PI/180,zoom:62}};
export class WorldView {
  constructor(container,settings,renderer=createWorldRenderer()){
    this.container=container;this.settings=settings;this.nodes=new Map();this.selection=new Set();this.fx=[];this.treeIndices=new Map();this.unitBatches=new Map();this.dynamicScale=1;this.frameAverage=.016;this.performanceClock=0;this.target=new THREE.Vector3(-37,0,29);this.angle=Math.PI/4;this.zoom=48;this.tilt=(CAMERA_PRESETS[settings.cameraPreset]||CAMERA_PRESETS.balanced).tilt;
    this.renderer=renderer;this.renderer.setPixelRatio(Math.min(devicePixelRatio,settings.quality==='high'?2:settings.quality==='low'?1:1.25));this.renderer.setSize(container.clientWidth||innerWidth,container.clientHeight||innerHeight,false);this.renderer.shadowMap.enabled=settings.quality!=='low';this.renderer.shadowMap.type=THREE.PCFShadowMap;this.renderer.outputColorSpace=THREE.SRGBColorSpace;this.renderer.toneMapping=THREE.ACESFilmicToneMapping;this.renderer.toneMappingExposure=1.1;container.appendChild(this.renderer.domElement);
    this.renderQuality=settings.quality;this.scene=new THREE.Scene();this.scene.background=new THREE.Color(0xa5b4ad);this.scene.fog=new THREE.Fog(0xa5b4ad,105,230);
    this.camera=new THREE.PerspectiveCamera(46,innerWidth/innerHeight,.5,400);this.raycaster=new THREE.Raycaster();this.mouse=new THREE.Vector2();this.plane=new THREE.Plane(new THREE.Vector3(0,1,0),0);this.clock=0;
    this.hemi=new THREE.HemisphereLight(0xc7def1,0x52633a,.9);this.scene.add(this.hemi);this.sun=new THREE.DirectionalLight(0xffe4bd,2.7);this.sun.position.set(-48,62,32);this.sun.castShadow=true;this.sun.shadow.mapSize.set(settings.quality==='high'?2048:1024,settings.quality==='high'?2048:1024);Object.assign(this.sun.shadow.camera,{left:-55,right:55,top:55,bottom:-55,near:1,far:180});this.sun.shadow.bias=-.00025;this.sun.shadow.normalBias=.025;nodeRuntime()?.configureDirectionalShadow(this.sun,this.renderer);this.scene.add(this.sun,this.sun.target);
    this.materials={stone:mat(0xc1b9a4),stoneDark:mat(0x8c9288),plaster:mat(0xe6d5b4),wood:mat(0x756046),darkwood:mat(0x483c30),roof:mat(0x5a6c66),roofRed:mat(0x8b5949),gold:mat(0xd9b865,{metalness:.35,roughness:.55}),iron:mat(0x8a9ba0,{metalness:.45}),leaf:mat(0x617b4b),leafDark:mat(0x3e6550),trunk:mat(0x66563e),skin:mat(0xd2b08d),berry:mat(0x9d4d48),soil:mat(0x837052),furrow:mat(0x6b6343),crop:mat(0xc3ad62),water:mat(0x6a9fa6,{metalness:.35,roughness:.25,transparent:true,opacity:.85}),shadow:new THREE.MeshBasicMaterial({color:0x26382c,transparent:true,opacity:.14,depthWrite:false})};
    this.geo={box:new THREE.BoxGeometry(1,1,1),sphere:new THREE.IcosahedronGeometry(1,0),cylinder:new THREE.CylinderGeometry(1,1,1,10),cone:new THREE.ConeGeometry(1,1,7),roof:new THREE.ConeGeometry(1,1,4),ring:new THREE.RingGeometry(.83,1,32)};
    this.teamMaterials=[mat(0x397f8c),mat(0x9a687d)];
    this.terrain=new THREE.Group();this.scene.add(this.terrain);this.objects=new THREE.Group();this.scene.add(this.objects);this.fogCanvas=document.createElement('canvas');this.fogCanvas.width=80;this.fogCanvas.height=80;this.fogCtx=this.fogCanvas.getContext('2d');this.fogTexture=new THREE.CanvasTexture(this.fogCanvas);this.fogTexture.magFilter=THREE.LinearFilter;
    this.fogMesh=new THREE.Mesh(new THREE.PlaneGeometry(WORLD,WORLD),new THREE.MeshBasicMaterial({map:this.fogTexture,transparent:true,depthWrite:false}));this.fogMesh.rotation.x=-Math.PI/2;this.fogMesh.position.y=.32;this.fogMesh.renderOrder=5;this.scene.add(this.fogMesh);
    this.marker=new THREE.Group();for(let i=0;i<4;i++){const m=new THREE.Mesh(this.geo.box,new THREE.MeshBasicMaterial({color:0xf5d991}));m.scale.set(.13,.06,1.4);m.position.set(Math.sin(i*Math.PI/2)*1.8,.45,Math.cos(i*Math.PI/2)*1.8);m.rotation.y=i*Math.PI/2;this.marker.add(m);}this.scene.add(this.marker);this.marker.visible=false;
    this.ghost=new THREE.Group();this.scene.add(this.ghost);this.resize=()=>{const width=this.container.clientWidth||innerWidth,height=this.container.clientHeight||innerHeight;this.camera.aspect=width/height;this.camera.updateProjectionMatrix();this.renderer.setSize(width,height,false);this.updateCamera();};window.addEventListener('resize',this.resize);this.resize();
    this.burning=new THREE.InstancedMesh(this.geo.cone,new THREE.MeshBasicMaterial({color:0xf6b15b,transparent:true,opacity:.75,depthWrite:false}),80);this.burning.count=0;this.burning.frustumCulled=false;this.scene.add(this.burning);
    this.smoke=new THREE.InstancedMesh(this.geo.sphere,new THREE.MeshBasicMaterial({color:0x676c62,transparent:true,opacity:.16,depthWrite:false}),80);this.smoke.count=0;this.smoke.frustumCulled=false;this.scene.add(this.smoke);
  }
  piece(parent,geometry,material,x,y,z,sx=1,sy=1,sz=1,ry=0){const m=new THREE.Mesh(geometry,material);m.position.set(x,y,z);m.scale.set(sx,sy,sz);m.rotation.y=ry;m.castShadow=true;m.receiveShadow=true;parent.add(m);return m;}
  box(g,m,x,y,z,w,h,d,ry=0){return this.piece(g,this.geo.box,m,x,y,z,w,h,d,ry);}
  cylinder(g,m,x,y,z,r,h){return this.piece(g,this.geo.cylinder,m,x,y,z,r,h,r);}
  roof(g,m,x,y,z,w,h,d){return this.piece(g,this.geo.roof,m,x,y,z,w,h,d,Math.PI/4);}
  clearGroup(group){for(const child of [...group.children])group.remove(child);}
  mergeModel(group){
    group.updateMatrixWorld(true);const byMaterial=new Map(),remove=[];
    group.traverse(child=>{if(!child.isMesh||child.userData.flag||child.parent.userData.windmill||child.parent.userData.gate||child.parent.userData.dockPier)return;const key=child.material.uuid+':'+JSON.stringify(child.userData.motion||null);if(!byMaterial.has(key))byMaterial.set(key,{material:child.material,geometries:[],motion:child.userData.motion});const geometry=child.geometry.clone().applyMatrix4(child.matrixWorld);ensureModelIndices(geometry);byMaterial.get(key).geometries.push(geometry);remove.push(child);});
    for(const child of remove)child.removeFromParent();
    for(const {material,geometries,motion} of byMaterial.values()){const geometry=mergeGeometries(geometries);if(geometry){const mesh=new THREE.Mesh(geometry,material);mesh.castShadow=material!==this.materials.shadow;mesh.receiveShadow=true;mesh.userData.motion=motion;group.add(mesh);}for(const geo of geometries)geo.dispose();}
    return group;
  }
  unitNode(e){const variant=workerVisualTask(this,e),key=`${e.type}:${variant}`,rigid=this.settings.rigidUnits!==false;let batch=this.unitBatches.get(key);
    if(!batch){const model=mergeUnitModel(this,this.makeUnit(e),true);model.updateMatrixWorld(true);batch={parts:[],ids:[],renderIds:[],free:[],capacity:Math.max(512,this.sim.players.length*(this.sim.options.populationLimit||160)),model3d:model.userData.model3d};
      if(rigid){const part=createRigidUnitPart(this,model,batch);if(part){batch.parts.push(part);this.objects.add(part);}}
      model.traverse(part=>{if(!part.isMesh||rigid&&!part.material.transparent)return;const geometry=part.geometry.clone().applyMatrix4(part.matrixWorld);geometry.setAttribute('instanceOwner',new THREE.InstancedBufferAttribute(new Float32Array(batch.capacity),1).setUsage(THREE.DynamicDrawUsage));const inst=new THREE.InstancedMesh(geometry,part.material,batch.capacity);inst.count=0;inst.instanceMatrix.setUsage(THREE.DynamicDrawUsage);inst.castShadow=part.material!==this.materials.shadow;inst.receiveShadow=true;inst.frustumCulled=false;inst.userData.unitIds=batch.renderIds;inst.userData.motion=part.userData.motion;batch.parts.push(inst);this.objects.add(inst);});this.unitBatches.set(key,batch);this.releaseNode(model);}
    const index=batch.free.length?batch.free.pop():batch.ids.length;batch.ids[index]=e.id;
    const node=new THREE.Group();node.userData.batch=batch;node.userData.index=index;node.userData.model3d=batch.model3d;node.userData.unitVariant=variant;return node;
  }
  groundTexture(seed,map){const c=document.createElement('canvas');c.width=c.height=1024;const ctx=c.getContext('2d'),rng=seededRandom(seed);ctx.fillStyle=map==='winter'?'#d3dbcd':terrainBiome(map).ground[0];ctx.fillRect(0,0,1024,1024);
    for(let i=0;i<65000;i++){const x=rng()*1024,y=rng()*1024;ctx.fillStyle=rng()>.5?'rgba(43,68,35,.075)':'rgba(230,221,168,.07)';ctx.fillRect(x,y,2+rng()*7,2+rng()*7);}
    for(const sign of [1,-1]){ctx.strokeStyle='#ab9d78';ctx.lineWidth=20;ctx.lineCap='round';ctx.beginPath();ctx.moveTo(((-39*sign+80)/160)*1024,((30*sign+80)/160)*1024);ctx.lineTo(((-27*sign+80)/160)*1024,((24*sign+80)/160)*1024);ctx.lineTo(((-27*sign+80)/160)*1024,((0+80)/160)*1024);ctx.stroke();}
    const texture=new THREE.CanvasTexture(c);texture.colorSpace=THREE.SRGBColorSpace;texture.anisotropy=4;return texture;
  }
  attach(sim){const camera=this.sim===sim?{target:this.target.clone(),zoom:this.zoom,angle:this.angle,tilt:this.tilt}:null;this.sim=sim;
    this.wallVisuals?.dispose();this.wallVisuals=null;
    this.jointPoseCache=new Map();this.jointPoseEntity=null;this.jointPoseRoot=null;
    this.localMotion??=new LocalMotion();this.localMotion.clear();this.localBlend=1;
    this.locomotion??=new UnitLocomotion();this.locomotion.clear();this.locomotionPrunedAt=0;
    this.unitActions??=new UnitActions();this.unitActions.clear();
    for(const batch of this.unitBatches.values())for(const part of batch.parts){disposeRigidPart(part);part.geometry.dispose();part.dispose();part.removeFromParent();}this.unitBatches.clear();
    const sharedGeometry=new Set([...Object.values(this.geo),...(this.authoredGeometry||[]),...(this.sharedModelGeometry||[])]),sharedMaterials=new Set([...Object.values(this.materials),...this.teamMaterials]),sharedTextures=new Set([this.fogTexture,...retainedSurfaceTextures()]);
    for(const material of sharedMaterials)for(const key of ['map','bumpMap'])if(material[key])sharedTextures.add(material[key]);
    for(const root of [this.objects,this.terrain])root.traverse(child=>{if(!child.isMesh)return;if(child.geometry&&!sharedGeometry.has(child.geometry))child.geometry.dispose();if(child.isInstancedMesh)child.dispose();if(child.material&&!sharedMaterials.has(child.material)){for(const key of ['map','bumpMap'])if(child.material[key]&&!sharedTextures.has(child.material[key]))child.material[key].dispose();for(const texture of child.material.frontierOwnedTextures||[])texture.dispose();child.material.dispose();}});
    this.clearGroup(this.objects);this.clearGroup(this.terrain);this.nodes.clear();this.treeIndices.clear();for(const f of this.fx)releaseEffect(f);this.fx=[];
    sim.players.forEach((player,i)=>this.teamMaterials[i].color.setHex(player.color??FACTIONS[player.faction].color));
    this.buildLandscape(sim);if(camera){this.target.copy(camera.target);this.zoom=camera.zoom;this.angle=camera.angle;this.tilt=camera.tilt;this.updateCamera();}else{const home=sim.owned(0,'building','towncenter')[0]||sim.players[0].start||{x:-37,z:30};this.zoom=58;this.focus(home.x,home.z);}prepareViewport(this);this.buildForest(sim);
    for(const e of sim.entities)if(e.hp>0&&!(e.kind==='resource'&&e.type==='wood'))sceneNodeFor(this,e,e.owner===0||e.kind==='shrine'||sim.isVisible(e.x,e.z)||e.kind==='resource'&&sim.isExplored(e.x,e.z));
    this.updateFog();
    trimAuthoredAssets(this);
  }
  makeRiver(center=0,width=5){const vertices=[],indices=[];for(let i=0;i<=80;i++){const z=-80+i*2,x=center+Math.sin(z*.045)*(width===5?4:3);vertices.push(x-width,.08,z,x+width,.08,z);if(i<80){const a=i*2;indices.push(a,a+1,a+2,a+1,a+3,a+2);}}const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3));geo.setIndex(indices);geo.computeVertexNormals();this.terrain.add(new THREE.Mesh(geo,this.materials.water));
    const bridge=new THREE.Group();this.box(bridge,this.materials.wood,center,.38,0,15,.55,15);for(let z=-7;z<=7;z+=2)this.box(bridge,this.materials.darkwood,center,.7,z,15,.14,.12);for(const z of [-7,7]){this.box(bridge,this.materials.darkwood,center,1.4,z,15,.22,.22);for(const x of [-7,-3,3,7])this.box(bridge,this.materials.darkwood,center+x,1,z,.3,2,.3);}this.terrain.add(this.mergeModel(bridge));
  }
  flag(g,team,x,y,z,size=1){this.cylinder(g,this.materials.darkwood,x,y/2,z,.07,y);const flag=this.box(g,team,x+size*.5,y-.45,z,size,.75*size,.035);flag.userData.flag=true;}
  houseModel(g,team,x,z,scale=1){const m=this.materials;this.box(g,m.stone,x,.25,z,4.1*scale,.5,3.8*scale);this.box(g,m.plaster,x,1.7*scale,z,3.8*scale,2.8*scale,3.4*scale);this.roof(g,team,x,3.45*scale,z,3.3*scale,2.3*scale,3*scale);
    this.box(g,m.darkwood,x,1.25*scale,z+1.73*scale,.8*scale,2*scale,.08);for(const side of [-1,1]){this.box(g,m.darkwood,x+side*1.3*scale,1.95*scale,z+1.75*scale,.5*scale,.65*scale,.06);this.box(g,m.wood,x+side*1.85*scale,1.65*scale,z+1.74*scale,.15,2.8*scale,.12);}this.box(g,m.darkwood,x,2.9*scale,z+1.75*scale,3.8*scale,.18,.12);this.box(g,m.stoneDark,x+1.1*scale,3.7*scale,z-.6*scale,.45,1.8*scale,.5);
  }
  towerModel(g,team,x,z,scale=1,roof=true){const m=this.materials;this.cylinder(g,m.stoneDark,x,.3,z,1.65*scale,.6);this.cylinder(g,m.stone,x,3*scale,z,1.35*scale,6*scale);this.cylinder(g,m.stoneDark,x,5.8*scale,z,1.6*scale,.65);for(let i=0;i<8;i++){const a=i*Math.PI/4;this.box(g,m.stone,x+Math.sin(a)*1.4*scale,6.3*scale,z+Math.cos(a)*1.4*scale,.65*scale,.8*scale,.65*scale,a);}this.box(g,m.darkwood,x,3.8*scale,z+1.36*scale,.34,1.1,.05);if(roof)this.roof(g,team,x,7.2*scale,z,2.1*scale,2.5*scale,2.1*scale);}
  makeBuilding(e){const g=new THREE.Group(),m=this.materials,team=this.teamMaterials[e.owner];const t=e.type;
    const shadow=new THREE.Mesh(new THREE.CircleGeometry(e.r*1.2,24),m.shadow);shadow.rotation.x=-Math.PI/2;shadow.position.y=.03;g.add(shadow);
    if(t==='farm'){this.box(g,m.soil,0,.08,0,5.5,.15,5.5);for(let i=-2;i<=2;i++){this.box(g,m.furrow,i,.15,0,.15,.1,5.1);for(let k=-2;k<=2;k++)this.piece(g,this.geo.cone,m.crop,i+.3,.4,k,.18,.8,.18);}for(const x of [-3,3])for(const z of [-3,3])this.box(g,m.wood,x,.45,z,.15,.9,.15);return g;}
    if(t==='wall'){this.box(g,m.stoneDark,0,.35,0,2.9,.7,2.6);this.box(g,m.stone,0,1.8,0,2.8,3.1,1.55);for(let x=-1;x<=1;x++)this.box(g,m.stone,x,3.7,0,.6,.75,1.65);return g;}
    if(t==='gate'){for(const x of [-2,2])this.towerModel(g,team,x,0,.55,false);this.box(g,m.stone,0,3.4,0,4,1.2,1.4);this.box(g,team,0,4.1,0,4.8,.6,2);return g;}
    if(t==='tower'){this.towerModel(g,team,0,0,1,true);this.flag(g,team,0,9,0,.9);return g;}
    if(t==='keep'){this.box(g,m.stone,0,3,0,6,6,6);for(const x of [-3,3])for(const z of [-3,3])this.towerModel(g,team,x,z,.85,false);this.roof(g,team,0,7.3,0,4,3.6,4);this.box(g,m.darkwood,0,1.5,3.02,1.5,3,.08);this.flag(g,team,0,10,0,1.5);return g;}
    if(t==='wonder'){for(let i=0;i<3;i++)this.box(g,m.stone,0,.3+i*.5,0,10-i*1.5,.6,10-i*1.5);this.box(g,m.plaster,0,3.1,0,5.5,4,5.5);for(const x of [-2.5,2.5])for(const z of [-2.5,2.5]){this.cylinder(g,m.stone,x,4,z,.4,5.5);this.roof(g,m.gold,x,7.4,z,1.2,1.8,1.2);}this.cylinder(g,m.stone,0,6.4,0,2.2,3);this.piece(g,new THREE.SphereGeometry(2.25,12,8,0,Math.PI*2,0,Math.PI/2),m.gold,0,7.9,0);this.flag(g,team,0,11,0,1.5);return g;}
    if(t==='towncenter'){this.houseModel(g,team,0,0,1.4);this.houseModel(g,team,-3,-1,.85);this.houseModel(g,team,3,-1,.85);this.towerModel(g,team,0,-2,.65,true);this.box(g,m.wood,0,1,3.5,6,.3,1.8);for(const x of [-2.7,2.7])this.box(g,m.darkwood,x,.6,3.5,.18,1.3,.18);this.flag(g,team,0,8,1,1.5);return g;}
    if(t==='house'){this.houseModel(g,team,0,0);return g;}
    if(t==='mill'){this.houseModel(g,team,0,0,.9);const blades=new THREE.Group();blades.position.set(0,3,1.7);for(let i=0;i<4;i++){const blade=this.box(blades,m.wood,0,1.35,0,.35,2.9,.16);blade.position.set(Math.sin(i*Math.PI/2)*1.5,Math.cos(i*Math.PI/2)*1.5,0);blade.rotation.z=-i*Math.PI/2;}blades.userData.windmill=true;g.add(blades);return g;}
    if(t==='camp'||t==='mine'){this.box(g,m.stoneDark,0,.15,0,4,.3,3.5);for(const x of [-1.6,1.6])for(const z of [-1.3,1.3])this.box(g,m.wood,x,1.2,z,.2,2.4,.2);this.roof(g,team,0,2.5,0,3,1.5,2.7);for(let i=0;i<5;i++){if(t==='camp'){const log=this.cylinder(g,m.trunk,-1+i*.4,.5,1.3,.25,2);log.rotation.x=Math.PI/2;}else this.piece(g,this.geo.sphere,m.stoneDark,-1+i*.5,.4,1.2,.4,.5,.6);}return g;}
    this.houseModel(g,team,0,0,t==='monastery'?1.35:1.1);
    if(t==='barracks'){this.box(g,m.stoneDark,0,.12,3.5,6,.2,2);for(const x of [-2,2]){this.box(g,m.wood,x,1.4,3.4,.16,2.8,.16);this.box(g,m.wood,x,2,3.4,1.4,.16,.2);}this.flag(g,team,2.4,5,2.4,1.1);}
    if(t==='range'){for(const x of [-2,0,2]){this.box(g,m.wood,x,.8,3.5,.15,1.6,.15);const target=this.piece(g,this.geo.cylinder,m.plaster,x,1.6,3.5,.7,.1,.7);target.rotation.x=Math.PI/2;const bull=this.piece(g,this.geo.cylinder,team,x,1.6,3.58,.25,.11,.25);bull.rotation.x=Math.PI/2;}}
    if(t==='stable'){for(const x of [-2.8,2.8]){this.box(g,m.wood,x,.7,2.5,.18,1.4,4);this.box(g,m.wood,x,1,2.5,.2,.2,4);}this.box(g,m.wood,0,.3,3.5,4,.6,.7);}
    if(t==='workshop'){this.box(g,m.wood,0,.7,3.3,3,.8,1);for(const x of [-1.3,1.3]){const wheel=this.cylinder(g,m.darkwood,x,.65,3.3,.65,.15);wheel.rotation.z=Math.PI/2;}this.box(g,m.wood,0,1.7,3.3,.2,2.3,.2,-.4);}
    if(t==='blacksmith'){this.box(g,m.stoneDark,2,2,0,1.2,4,1.2);this.box(g,m.iron,0,.7,3,1.4,.3,.7);this.box(g,m.iron,0,.35,3,.5,.7,.5);}
    if(t==='market'){for(let i=-1;i<=1;i++){this.box(g,m.wood,i*2,1,3.3,1.7,1.4,.8);this.box(g,i%2===0?team:m.plaster,i*2,2.1,3.3,1.9,.16,1.3);}for(let i=0;i<6;i++)this.piece(g,this.geo.sphere,m.gold,-2+i*.75,1.8,3.3,.2,.2,.2);}
    if(t==='monastery'){this.towerModel(g,team,0,-2,.6,true);this.box(g,m.gold,0,7.6,-2,.2,1.5,.2);this.box(g,m.gold,0,7.8,-2,.8,.16,.18);}
    return g;
  }
  makeUnit(e){const g=new THREE.Group(),m=this.materials,team=this.teamMaterials[e.owner],t=e.type;const shadow=new THREE.Mesh(new THREE.CircleGeometry(t==='ram'?1.6:.9,12),m.shadow);shadow.rotation.x=-Math.PI/2;shadow.position.y=.04;g.add(shadow);const body=new THREE.Group();g.add(body);g.userData.body=body;
    if(t==='ram'||t==='catapult'){this.box(body,m.wood,0,.8,0,1.6,.65,2.8);for(const x of [-.95,.95])for(const z of [-.8,.8]){const wheel=this.cylinder(body,m.darkwood,x,.55,z,.55,.2);wheel.rotation.z=Math.PI/2;}
      if(t==='ram'){this.roof(body,team,0,1.9,0,1.8,1.2,2.7);const log=this.cylinder(body,m.trunk,0,1.15,1.1,.23,3.3);log.rotation.x=Math.PI/2;this.box(body,m.iron,0,1.15,2.7,.55,.55,.4);}else{this.box(body,m.wood,0,2,0,.3,3.4,.3);const arm=this.box(body,m.wood,0,3,0,.22,.22,4.6);arm.rotation.x=-.6;this.box(body,m.stoneDark,0,1.5,-1.6,.75,1,.75);this.flag(body,team,.9,2.2,0,.5);}return g;}
    let y=0;
    if(t==='knight'||t==='scout'){this.box(body,m.darkwood,0,1,0,.8,.7,1.7);this.box(body,m.darkwood,0,1.6,.72,.45,.85,.65);this.piece(body,this.geo.sphere,m.darkwood,0,1.85,1,.35,.35,.5);for(const x of [-.28,.28])for(const z of [-.55,.55])this.box(body,m.darkwood,x,.45,z,.16,.9,.16);this.box(body,team,0,1.2,0,.9,.25,1);y=.9;}
    this.box(body,t==='swordsman'||t==='knight'?m.iron:team,0,1.05+y,0,.58,.75,.4);this.piece(body,this.geo.sphere,m.skin,0,1.66+y,0,.25,.28,.25);
    if(t!=='villager'&&t!=='monk')this.piece(body,this.geo.sphere,m.iron,0,1.85+y,-.02,.27,.15,.28);
    if(t==='monk'){this.piece(body,this.geo.cone,m.plaster,0,.8,0,.5,1.6,.5);this.box(body,m.gold,.45,1.3,.2,.07,1.8,.07);}
    for(const side of [-1,1]){this.box(body,m.darkwood,side*.16,.35+y,0,.18,.65,.2);this.box(body,t==='knight'?m.iron:team,side*.4,1.1+y,0,.18,.65,.2);}
    if(t==='spearman'||t==='knight'||t==='scout'){this.box(body,m.wood,.55,1.5+y,.1,.065,2.8,.065);this.piece(body,this.geo.cone,m.iron,.55,3+y,.1,.14,.45,.14);}
    if(t==='swordsman'){this.box(body,m.iron,.5,1.2,.45,.09,.08,1.2);this.box(body,team,-.5,1.1,.2,.08,.8,.55);}
    if(t==='king'){this.cylinder(body,m.gold,0,1.95,0,.29,.22);for(let i=0;i<5;i++)this.piece(body,this.geo.cone,m.gold,Math.sin(i*Math.PI*.4)*.23,2.15,Math.cos(i*Math.PI*.4)*.23,.075,.3,.075);this.box(body,m.gold,.5,1.2,.4,.09,.1,1.1);this.box(body,team,0,1.15,-.27,.72,1.05,.06);}
    if(t==='archer'){const bow=new THREE.Mesh(new THREE.TorusGeometry(.45,.045,4,12,Math.PI),m.wood);bow.position.set(.5,1.2,.1);bow.rotation.z=-Math.PI/2;body.add(bow);}
    if(t==='villager'){this.box(body,m.wood,.5,1.2,.1,.07,1.3,.07);this.box(body,m.iron,.5,1.8,.1,.5,.16,.1);}
    return g;
  }
  createNode(e){if(e.kind==='resource'&&e.type==='wood')return;let g;
    if(e.kind==='building')g=this.mergeModel(this.makeBuilding(e));else if(e.kind==='unit')g=this.unitNode(e);else{g=new THREE.Group();if(e.kind==='shrine'){this.cylinder(g,this.materials.stoneDark,0,.25,0,3,.5);for(const x of [-1.5,1.5])for(const z of [-1.5,1.5])this.cylinder(g,this.materials.stone,x,2,z,.35,4);this.roof(g,this.materials.stone,0,4.2,0,3,1.4,3);this.piece(g,this.geo.sphere,this.materials.gold,0,2,0,.8,.8,.8);}else if(e.type==='food'){for(let i=0;i<4;i++){this.piece(g,this.geo.sphere,this.materials.leaf,-.7+i*.45,.75,(i%2)*.6,1,1,1);for(let j=0;j<3;j++)this.piece(g,this.geo.sphere,this.materials.berry,-.8+i*.5,1.2,j*.35-.2,.16,.16,.16);}}else{for(let i=0;i<4;i++)this.piece(g,this.geo.sphere,e.type==='gold'?this.materials.gold:this.materials.stoneDark,(i%2)*1.25-.6,.7,Math.floor(i/2)*1.2-.6,.85,1.1+i*.13,1);}}
    if(e.kind==='resource'||e.kind==='shrine')g=this.mergeModel(g);
    g.position.set(e.x,0,e.z);g.userData.entity=e.id;g.traverse(child=>child.userData.entity=e.id);this.objects.add(g);this.nodes.set(e.id,g);
    if(e.owner===0){const r=new THREE.Mesh(this.geo.ring,new THREE.MeshBasicMaterial({color:0xc5eee2,transparent:true,opacity:.9,side:THREE.DoubleSide,depthWrite:false}));r.rotation.x=-Math.PI/2;r.position.y=.13;r.scale.setScalar(e.r+(.6));r.visible=false;r.userData.selection=true;g.add(r);g.userData.ring=r;}
    return g;
  }
  updateFog(){const size=this.sim.gridSize;if(this.fogCanvas.width!==size)this.fogCanvas.width=this.fogCanvas.height=size;const image=this.fogCtx.createImageData(size,size);for(let i=0;i<size*size;i++){const p=i*4;image.data[p]=19;image.data[p+1]=32;image.data[p+2]=30;image.data[p+3]=this.sim.visible[i]?0:this.sim.explored[i]?100:197;}this.fogCtx.putImageData(image,0,0);this.fogTexture.needsUpdate=true;}
  groundPoint(clientX,clientY){const rect=this.renderer.domElement.getBoundingClientRect();this.mouse.set((clientX-rect.left)/rect.width*2-1,-(clientY-rect.top)/rect.height*2+1);this.raycaster.setFromCamera(this.mouse,this.camera);const point=this.landscape?this.landscape.rayPoint(this.raycaster.ray):this.raycaster.ray.intersectPlane(this.plane,new THREE.Vector3());return point&&insideMap(point.x,point.z,this.sim?.worldSize||WORLD)?point:null;}
  pick(clientX,clientY){this.groundPoint(clientX,clientY);const hits=this.raycaster.intersectObjects(this.objects.children,true);for(const hit of hits){let id=hit.object.userData.entity;if(hit.object.userData.treeIds)id=hit.object.userData.treeIds[hit.instanceId];if(hit.object.userData.unitIds)id=hit.object.userData.unitIds[hit.instanceId];if(hit.object.userData.wallIds)id=hit.object.userData.wallIds[hit.instanceId];const e=this.sim.get(id);if(e&&(e.owner===0||this.sim.isVisible(e.x,e.z)))return e;}return pickFruitVolume(this);}
  project(e){const x=e.renderX??e.x,z=e.renderZ??e.z,v=new THREE.Vector3(x,this.entityHeight(e,x,z)+(e.kind==='building'?7:UNITS[e.type]?.naval?5:3),z).project(this.camera),rect=this.renderer.domElement.getBoundingClientRect();return {x:rect.left+(v.x+1)*rect.width/2,y:rect.top+(1-v.y)*rect.height/2,visible:v.z>-1&&v.z<1};}
  focus(x,z){if(!Number.isFinite(x)||!Number.isFinite(z))return;const limit=(this.sim?.worldSize||WORLD)/2-8,xx=Math.max(-limit,Math.min(limit,x)),zz=Math.max(-limit,Math.min(limit,z));this.target.set(xx,this.groundHeight?.(xx,zz)||0,zz);this.updateCamera();}
  pan(dx,dz){const c=Math.cos(this.angle),s=Math.sin(this.angle);this.focus(this.target.x+dx*c+dz*s,this.target.z-dx*s+dz*c);}
  updateCamera(){this.camera.position.set(this.target.x+Math.sin(this.angle)*this.zoom,this.target.y+Math.tan(this.tilt)*this.zoom,this.target.z+Math.cos(this.angle)*this.zoom);this.camera.lookAt(this.target);this.camera.updateMatrixWorld();if(this.sun){const span=Math.max(34,Math.min(110,this.zoom*.95)),camera=this.sun.shadow.camera;Object.assign(camera,{left:-span,right:span,top:span,bottom:-span});camera.updateProjectionMatrix();positionShadowLight(this,span);}}
  setCameraPreset(value,resetZoom=false){const key=CAMERA_PRESETS[value]?value:'balanced',preset=CAMERA_PRESETS[key];this.settings.cameraPreset=key;this.tilt=preset.tilt;if(resetZoom)this.zoom=preset.zoom+(matchMedia('(pointer: coarse)').matches?4:0);this.updateCamera();return preset.label;}
  zoomBy(delta){this.zoom=Math.max(16,Math.min(this.sim?.options.mode==='custom'?160:112,this.zoom+delta));this.updateCamera();}
  showGhost(type,x,z,valid){if(this.ghost.userData.type!==type){this.clearGroup(this.ghost);const d=BUILDINGS[type];const m=new THREE.Mesh(new THREE.BoxGeometry(d.r*2,2,d.r*2),new THREE.MeshBasicMaterial({color:0x78c7ac,transparent:true,opacity:.35,depthWrite:false}));m.position.y=1;this.ghost.add(m);const edges=new THREE.LineSegments(new THREE.EdgesGeometry(m.geometry),new THREE.LineBasicMaterial({color:0x78c7ac}));edges.position.y=1;this.ghost.add(edges);this.ghost.userData.type=type;}this.ghost.position.set(x,.2,z);this.ghost.visible=true;this.ghost.children.forEach(c=>c.material.color.setHex(valid?0x9de2bc:0xeb7b65));}
  hideGhost(){this.ghost.visible=false;}
  mark(x,z){this.marker.position.set(x,this.groundHeight(x,z)+.12,z);this.marker.visible=true;this.markerTime=.8;}
  burst(x,z,color=0xe8c28b,size=1){if(this.fx.length>(this.settings.quality==='low'?24:70))return;const pool=this.impactEffects??=new ImpactEffects(),object=pool.acquire('burst',color),dummy=this.effectDummy??=new THREE.Object3D(),velocities=object.userData.velocities;object.position.set(x,.4,z);dummy.position.set(0,0,0);dummy.rotation.set(0,0,0);dummy.scale.setScalar(size);dummy.updateMatrix();for(let i=0;i<8;i++){const a=Math.random()*Math.PI*2,velocity=velocities[i];velocity.x=Math.cos(a)*(1+Math.random()*2)*size;velocity.y=(2+Math.random()*3)*size;velocity.z=Math.sin(a)*(1+Math.random()*2)*size;object.setMatrixAt(i,dummy.matrix);}markInstancePrefix(object);this.scene.add(object);this.fx.push({object,time:0,duration:.75,particles:velocities,size,recycle:mesh=>pool.release(mesh)});}
  effect(event){if(this.fx.length>(this.settings.quality==='low'?32:90))return;const e=event.entity;if(event.type==='attack'){
      const target=event.target,ranged=e.kind==='building'||UNITS[e.type].range>5;const object=new THREE.Mesh(ranged?new THREE.SphereGeometry(['catapult','warship'].includes(e.type)?.3:.09,5,4):new THREE.RingGeometry(.3,.6,8),new THREE.MeshBasicMaterial({color:['catapult','warship'].includes(e.type)?0xf0a564:0xf3db9b,transparent:true}));object.position.set(e.x,3,e.z);this.scene.add(object);this.fx.push({object,time:0,duration:['catapult','warship'].includes(e.type)?.65:ranged?.3:.2,from:new THREE.Vector3(e.x,e.kind==='building'?5:1.6,e.z),to:new THREE.Vector3(target.x,1.2,target.z),arc:['catapult','warship'].includes(e.type)?10:1,impact:['catapult','warship'].includes(e.type)});
    }else if(event.type==='death'){this.burst(e.x,e.z,0xcbb28d,e.kind==='building'?2.5:1);}
    else if(event.type==='heal'){const pool=this.impactEffects??=new ImpactEffects(),object=pool.acquire('heal',0x91e0b4);object.rotation.x=-Math.PI/2;object.position.set(event.target.x,.3,event.target.z);this.scene.add(object);this.fx.push({object,time:0,duration:.65,heal:true,recycle:mesh=>pool.release(mesh)});}
  }
  quality(value){this.settings.quality=value;this.graphicsError=null;this.graphicsRestoredQuality=null;let artwork;const request=(this.graphicsRequest||0)+1;
    const detail=['high','medium'].includes(value)?value:'low';
    if(!this.graphicsLoading&&!this.graphicsFatal&&this.graphicsSceneValid!==false&&authoredAssetState()?.detail===detail&&this.surfaceQuality===value){this.graphicsRequest=(this.graphicsRequest||0)+1;applyRendererQuality(this,value);return this.graphicsReady=Promise.resolve(true);}
    return this.graphicsReady=transitionRendererQuality(this,value,async()=>{
      const [models]=await Promise.allSettled([prepareAuthoredAssets(value),loadSurfaceAssets(value,this.renderer).catch(error=>console.warn('Detailed surfaces could not load:',error.message))]);
      if(models.status==='rejected')throw models.reason;artwork=models.value;
    },()=>{
      const target=this.target.clone(),zoom=this.zoom,angle=this.angle,tilt=this.tilt,forestLodState=this.forestLodState;
      artwork.activate();this.attach(this.sim);this.forestLodState=forestLodState;this.target.copy(target);this.zoom=zoom;this.angle=angle;this.tilt=tilt;this.updateCamera();
    },()=>graphicsCheckpoint(this)).catch(error=>{if(this.graphicsRequest===request)this.graphicsError=error.message;console.warn('Detailed graphics could not load:',error.message);return false;}).finally(()=>{artwork?.release();trimAuthoredAssets(this);trimSurfaceAssets(this);});
  }
  adapt(dt){if(this.settings.autoQuality===false||this.graphicsLoading||this.graphicsRebuilding||this.graphicsFatal){this.renderPressure=null;this.performanceClock=0;return;}const flight=this.renderer.backend?.isWebGPUBackend?this.renderFlight:null,pressure=flight?(this.renderPressure??={submitted:flight.submitted,skipped:flight.skipped}):null;this.frameAverage=this.frameAverage*.97+dt*.03;this.performanceClock+=dt;if(this.performanceClock<5)return;this.performanceClock=0;
    const base=Math.min(devicePixelRatio,this.settings.quality==='high'?2:this.settings.quality==='low'?1:1.25),budget=1/targetFrameRate(this.settings);
    let average=this.frameAverage,submitted=0,held=0;if(pressure){submitted=Math.max(0,flight.submitted-pressure.submitted);held=Math.max(0,flight.skipped-pressure.skipped);pressure.submitted=flight.submitted;pressure.skipped=flight.skipped;if(held)average=Math.max(average,budget)*(submitted?1+held/submitted:2);}
    // Queue holds are missed render opportunities, not fast displayed frames.
    this.graphicsPressure={cpuFrameSeconds:this.frameAverage,effectiveFrameSeconds:average,submitted,held,targetFPS:1/budget};
    if(average>budget*1.35&&this.settings.quality==='high'){this.quality('medium');return;}
    if(average>budget*1.6&&this.settings.quality==='medium'){this.quality('low');return;}
    if(average>budget*1.2&&this.dynamicScale>.62){this.dynamicScale=Math.max(.62,this.dynamicScale-.12);this.renderer.setPixelRatio(base*this.dynamicScale);}
    else if(average>budget*1.8)setShadowEnabled(this,false);
    else if(average<budget*1.05&&this.dynamicScale<1){this.dynamicScale=Math.min(1,this.dynamicScale+.08);this.renderer.setPixelRatio(base*this.dynamicScale);}
  }
  render(dt,menu=false){if(!this.sim)return;this.clock+=dt;this.fogMesh.visible=!menu&&this.settings.fog!==false;
    beginUnitFrame(this,false);
    for(const e of this.sim.entities){let node=this.nodes.get(e.id);if(e.kind==='resource'&&e.type==='wood'){
        if(e.hp<=0&&this.treeIndices.has(e.id)){const i=this.treeIndices.get(e.id),dummy=new THREE.Object3D();dummy.scale.set(0,0,0);dummy.updateMatrix();this.treeTrunks.setMatrixAt(i,dummy.matrix);this.treeLeaves.setMatrixAt(i*2,dummy.matrix);this.treeLeaves.setMatrixAt(i*2+1,dummy.matrix);this.treeTrunks.instanceMatrix.needsUpdate=true;this.treeLeaves.instanceMatrix.needsUpdate=true;this.treeIndices.delete(e.id);}continue;
      }
      const visible=menu||e.owner===0||e.kind==='shrine'||this.sim.isVisible(e.x,e.z)||(e.kind==='resource'&&this.sim.isExplored(e.x,e.z));node=sceneNodeFor(this,e,visible);if(!node)continue;
      if(node.userData.batch&&node.userData.unitVariant!==workerVisualTask(this,e)){releaseSceneNode(this,e,node);node=this.createNode(e);}
      node.visible=visible&&!e.embarked;
      const position=renderPosition(this,e),rx=position.x,rz=position.z,heading=e.kind==='unit'?smoothHeading(node,e.heading,dt):0,ground=this.entityHeight(e,rx,rz),gait=e.kind==='unit'?this.locomotion.update(e,rx,rz,dt):null;e.renderX=rx;e.renderZ=rz;
      if(e.kind==='unit')this.unitActions.update(this,e,dt);
      if(node.userData.batch){
        node.position.set(rx,ground,rz);node.rotation.y=heading;
        if(!visible||e.embarked||!nearViewport(this,rx,ground,rz,13)){node.visible=false;continue;}
        const {batch}=node.userData,dummy=(this.poseDummy??=new THREE.Object3D());dummy.position.set(rx,ground+(UNITS[e.type].naval?Math.sin(this.clock*2+e.id)*.055:gait.bob),rz);dummy.rotation.set(0,heading,UNITS[e.type].naval?Math.sin(this.clock*1.8+e.id)*.025:0);dummy.scale.setScalar(1);dummy.updateMatrix();node.visible=writeUnitPose(this,batch,e,dummy.matrix,true);
      }
      if(!visible||e.embarked)continue;
      node.position.set(rx,ground,rz);if(e.kind==='unit'){node.rotation.y=heading;const body=node.userData.body;if(body){body.position.y=e.moving?Math.sin(this.clock*10+e.id)*.065:0;if(e.type==='villager'&&e.order?.type==='gather'&&!e.moving)body.rotation.z=Math.sin(this.clock*6)*.08;else body.rotation.z=0;}}
      if(e.kind==='building'){node.scale.y=1;if(e.type==='wall'||e.type==='gate')node.rotation.y=e.wallAngle||0;this.updateConstruction(e,node);}if(node.userData.ring)node.userData.ring.visible=this.selection.has(e.id);
      if(e.type==='mill')node.traverse(child=>{if(child.userData.windmill)child.rotation.z=this.clock*.4;});
      node.traverse(child=>{if(child.userData.flag)child.rotation.y=Math.sin(this.clock*2+e.id)*.08;if(e.kind==='shrine'&&child.material===this.materials.gold){child.position.y=Math.sin(this.clock*1.4)*.22;child.rotation.y=this.clock*.4;}});
    }
    for(let i=this.fx.length-1;i>=0;i--){const f=this.fx[i];if(f.authoritative){f.time=Math.max(f.time,combatTime(this)-f.releasedAt);const target=f.tracked&&this.sim.get(f.tracked);if(target&&!target.embarked&&(target.owner===0||this.sim.isVisible(target.x,target.z))){f.to.x=target.renderX??target.x;f.to.z=target.renderZ??target.z;f.to.y=this.entityHeight(target,f.to.x,f.to.z)+projectileTargetHeight(target);}}else f.time+=dt;const t=f.time/f.duration;if(t>=1){if(f.impact)this.burst(f.to.x,f.to.z,f.impactColor??0xe9ac65,f.impactSize??1.8);releaseEffect(f);this.fx.splice(i,1);continue;}if(f.particles){const dummy=this.effectDummy??=new THREE.Object3D();f.particles.forEach((v,j)=>{dummy.position.set(v.x*f.time,Math.max(0,v.y*f.time-5*f.time*f.time),v.z*f.time);dummy.scale.setScalar(f.size*(1-t*.6));dummy.rotation.set(t*3,j+t*3,t);dummy.updateMatrix();f.object.setMatrixAt(j,dummy.matrix);});f.object.instanceMatrix.needsUpdate=true;f.object.material.opacity=1-t;}else if(f.heal){f.object.scale.setScalar(1+t);f.object.material.opacity=(1-t)*.6;f.object.position.y=(f.groundY||0)+.3+t*1.2;}else if(f.death){f.object.scale.setScalar(1+t*3);f.object.material.opacity=(1-t)*.4;}else updateFlight(f,t);}
    let fireCount=0;const dummy=this.fireDummy??=new THREE.Object3D();for(const e of this.sim.entities)if(e.hp>0&&e.kind==='building'&&e.hp<e.maxHp*.5&&e.progress>=1&&fireCount<80&&(e.owner===0||this.sim.isVisible(e.x,e.z))){const phase=(this.clock+e.id*.3)%2;dummy.position.set(e.x+.4,this.entityHeight(e)+e.r*.6+phase*.3,e.z+.4);dummy.scale.set(.45+Math.sin(this.clock*10+e.id)*.1,1.2+phase*.4,.45);dummy.updateMatrix();this.burning.setMatrixAt(fireCount,dummy.matrix);dummy.position.y+=phase*2+1;dummy.scale.setScalar(.8+phase*.8);dummy.updateMatrix();this.smoke.setMatrixAt(fireCount,dummy.matrix);fireCount++;}this.burning.count=fireCount;this.smoke.count=this.settings.quality==='low'?0:fireCount;markInstancePrefix(this.burning);markInstancePrefix(this.smoke);
    if(this.markerTime>0){this.markerTime-=dt;this.marker.rotation.y+=dt;this.marker.visible=this.markerTime>0;}
    endUnitFrame(this);
    if(this.clock-this.locomotionPrunedAt>2){this.locomotion.prune(this.sim);this.unitActions.prune(this.sim);this.locomotionPrunedAt=this.clock;}
    this.wallVisuals??=new WallVisuals(this);this.wallVisuals.update(menu);
    scheduleShadows(this);
    this.renderer.render(this.scene,this.camera);
  }
}

installWorldPolish(WorldView);
installVisualDepth(WorldView);
installRealm3D(WorldView);
installCampaignView(WorldView);
installWeather(WorldView);
installWorldInteractions(WorldView);
installBattleRemains(WorldView);
installStructurePalette(WorldView);
installCombatPresentation(WorldView);
installRenderFrame(WorldView);
