import * as THREE from 'three';
import {resourceModel,treeModel} from './models-3d.js';
import {workerVisualTask} from './authored-assets.js';
import {animatePart} from './world-polish.js';
import {mergeUnitModel} from './unit-palette.js';
import {trimSurfaceAssets} from './surface-assets.js';

// A small, throttled WebGL turntable uses the same solid models as the battlefield.
export class ModelPortrait {
  constructor(view){
    this.view=view;this.renderer=new THREE.WebGLRenderer({alpha:true,antialias:true,powerPreference:view.renderer.getContext().getContextAttributes()?.powerPreference||'high-performance'});
    this.renderer.setPixelRatio(Math.min(devicePixelRatio,1.5));this.renderer.setClearColor(0x1a3027,0);
    this.renderer.outputColorSpace=THREE.SRGBColorSpace;this.renderer.toneMapping=THREE.ACESFilmicToneMapping;
    this.renderer.domElement.setAttribute('aria-label','Rotating 3D model');
    this.scene=new THREE.Scene();this.camera=new THREE.PerspectiveCamera(38,1,.02,150);
    this.scene.add(new THREE.HemisphereLight(0xe3ece7,0x415039,1.4));const sun=new THREE.DirectionalLight(0xffe1bd,3);sun.position.set(-3,5,4);this.scene.add(sun);
    const c=document.createElement('canvas');c.width=32;c.height=16;const ctx=c.getContext('2d'),gradient=ctx.createLinearGradient(0,0,0,16);gradient.addColorStop(0,'#a7c6d9');gradient.addColorStop(.5,'#e7e0cf');gradient.addColorStop(1,'#546745');ctx.fillStyle=gradient;ctx.fillRect(0,0,32,16);
    const texture=new THREE.CanvasTexture(c);texture.colorSpace=THREE.SRGBColorSpace;texture.mapping=THREE.EquirectangularReflectionMapping;
    const generator=new THREE.PMREMGenerator(this.renderer);this.environment=generator.fromEquirectangular(texture);this.scene.environment=this.environment.texture;this.scene.environmentIntensity=.35;texture.dispose();generator.dispose();
  }
  clear(){
    if(!this.model)return;this.model.traverse(mesh=>{if(mesh.isMesh&&!Object.values(this.view.geo).includes(mesh.geometry)&&!this.view.authoredGeometry?.has(mesh.geometry)&&!this.view.sharedModelGeometry?.has(mesh.geometry))mesh.geometry.dispose();});this.scene.remove(this.model);this.model=null;
  }
  show(e){
    const key=`${e.kind}:${e.water?'fish':e.type}:${e.owner}:${this.view.sim.players[Math.max(0,e.owner)]?.faction}:${this.view.sim.options.map}:${e.kind==='building'?this.view.sim.players[e.owner]?.age:0}:${workerVisualTask(this.view,e)}:${this.view.settings.quality}:${this.view.artDiagnostics?.detail}`;
    if(this.key===key)return;this.clear();this.key=key;
    const raw=e.kind==='unit'?this.view.makeUnit(e):e.kind==='building'?this.view.makeBuilding(e):e.type==='wood'?treeModel(this.view,this.view.sim.options.map,e.id%4):resourceModel(this.view,e);
    this.model=e.kind==='unit'?mergeUnitModel(this.view,raw):this.view.mergeModel(raw);const bounds=new THREE.Box3().setFromObject(this.model),center=bounds.getCenter(new THREE.Vector3());this.model.position.sub(center);
    this.scene.add(this.model);this.radius=Math.max(.6,bounds.getSize(new THREE.Vector3()).length()*.5);trimSurfaceAssets(this.view);
  }
  render(container,e,now){
    if(now-(this.lastFrame||-1)<(this.view.settings.quality==='low'?1/12:1/24))return;this.lastFrame=now;
    if(this.renderer.domElement.parentElement!==container){container.textContent='';container.append(this.renderer.domElement);}
    this.show(e);const width=container.clientWidth,height=container.clientHeight;if(!width||!height)return;
    if(width!==this.width||height!==this.height){this.width=width;this.height=height;this.renderer.setSize(width,height,false);this.camera.aspect=width/height;this.camera.updateProjectionMatrix();}
    const distance=this.radius*3.4/Math.min(1,this.camera.aspect);this.camera.position.set(distance*.68,distance*.28,distance*.72);this.camera.lookAt(0,0,0);
    this.model.traverse(part=>{if(!part.userData.motion)return;part.matrixAutoUpdate=false;part.matrix.copy(animatePart(this.view,part,e,this.poseIdentity??=new THREE.Matrix4()));});
    this.model.rotation.y=now*.25;this.renderer.render(this.scene,this.camera);
  }
}

export function renderModelPortrait(view){
  const target=document.getElementById('model-portrait');if(!target||document.hidden||view.portraitDisabled)return;
  const entity=view.sim.get(Number(target.dataset.entity));if(!entity)return;
  try{view.modelPortrait??=new ModelPortrait(view);view.modelPortrait.render(target,entity,view.clock);}catch(error){view.portraitDisabled=true;console.error('3D portrait could not start',error);}
}
