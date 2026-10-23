import * as THREE from 'three';
import {standardMaterial} from './render-runtime.js';
import {WALL_SPACING} from './walls.js';
import {markInstancePrefix} from './render-batches.js';

// One instanced wall mesh and two solid endpoint markers. Cost and blockers
// use the same plan as the confirmation controls; these are never foundations.
export class WallPreview{
  constructor(view){
    this.view=view;this.group=new THREE.Group();this.group.name='Wall placement preview';this.group.visible=false;view.scene.add(this.group);this.pose=new THREE.Object3D();this.color=new THREE.Color();
    const material=standardMaterial({color:0xffffff,transparent:true,opacity:.43,depthWrite:false,roughness:1});this.walls=new THREE.InstancedMesh(new THREE.BoxGeometry(WALL_SPACING+.03,2.8,1.45),material,201);this.walls.count=0;this.walls.frustumCulled=false;this.walls.renderOrder=4;this.group.add(this.walls);
    const geometry=new THREE.CylinderGeometry(.34,.34,.18,16),startMaterial=standardMaterial({color:0xf0d48e,roughness:1}),endMaterial=standardMaterial({color:0x8de3c5,roughness:1});this.start=new THREE.Mesh(geometry,startMaterial);this.end=new THREE.Mesh(geometry,endMaterial);this.group.add(this.start,this.end);
  }
  show(plan){
    const view=this.view,angle=plan.from&&plan.to?-Math.atan2(plan.to.z-plan.from.z,plan.to.x-plan.from.x):0,count=Math.min(201,plan.segments.length);
    for(let i=0;i<count;i++){const point=plan.segments[i];this.pose.position.set(point.x,view.groundHeight(point.x,point.z)+1.55,point.z);this.pose.rotation.set(0,angle,0);this.pose.updateMatrix();this.walls.setMatrixAt(i,this.pose.matrix);this.walls.setColorAt(i,this.color.setHex(!point.valid?0xee816a:!point.affordable?0xe2b466:0x8de3c5));}
    this.walls.count=count;markInstancePrefix(this.walls);if(this.walls.instanceColor){this.walls.instanceColor.clearUpdateRanges();this.walls.instanceColor.addUpdateRange(0,count*3);this.walls.instanceColor.needsUpdate=true;}
    for(const [mesh,point]of [[this.start,plan.start],[this.end,plan.end]]){mesh.visible=!!point;if(point)mesh.position.set(point.x,view.groundHeight(point.x,point.z)+.19,point.z);}
    this.group.visible=!!count||!!plan.start;view.hideGhost();view.wallPreviewDiagnostics={segments:count,blocked:plan.blocked||0,unaffordable:plan.unaffordable||0,drawCalls:count?3:plan.start?2:0,from:plan.from,to:plan.to};
  }
  hide(){this.group.visible=false;this.walls.count=0;this.view.wallPreviewDiagnostics={segments:0,drawCalls:0};}
}
