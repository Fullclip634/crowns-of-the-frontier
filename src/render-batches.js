import * as THREE from 'three';
import {animatePart,beginJointPose,endJointPose} from './world-polish.js';
import {writeRigidPose,finishRigidFrame} from './rig-batches.js';
import {releasePreparedPrograms} from './shader-preparation.js';

// Keep allocation slots stable while packing only the current visible poses.
// Picking uses the packed IDs, never the allocator's potentially empty slots.
export function prepareViewport(view){
  view.camera.updateMatrixWorld();
  const projection=view.frameProjection??=new THREE.Matrix4();
  (view.frameFrustum??=new THREE.Frustum()).setFromProjectionMatrix(projection.multiplyMatrices(view.camera.projectionMatrix,view.camera.matrixWorldInverse));
}

export function beginUnitFrame(view,refreshViewport=true){
  view.jointPoseDiagnostics={computed:0,reused:0};
  if(refreshViewport)prepareViewport(view);
  for(const batch of view.unitBatches.values()){batch.renderIds.length=0;for(const part of batch.parts)part.userData.ownerChanged=false;}
}

// Prepare the camera before any render extension samples contacts or cargo.
export function installRenderFrame(WorldView){
  const render=WorldView.prototype.render;
  WorldView.prototype.render=function(dt,menu=false){if(this.graphicsRebuilding)return;this.renderFrameAt=performance.now();prepareViewport(this);try{return render.call(this,dt,menu);}finally{releasePreparedPrograms(this);}};
}

export function markInstancePrefix(mesh,count=mesh.count){
  if(!count)return;
  const attribute=mesh.instanceMatrix;attribute.clearUpdateRanges();attribute.addUpdateRange(0,count*16);attribute.needsUpdate=true;
}

export function nearViewport(view,x,y,z,radius=12){
  if(!view.frameFrustum)return true;
  const sphere=view.frameSphere??=new THREE.Sphere();sphere.center.set(x,y,z);sphere.radius=radius;
  return view.frameFrustum.intersectsSphere(sphere);
}

export function writeUnitPose(view,batch,e,matrix,shown){
  if(!shown)return false;
  const position=view.framePosition??=new THREE.Vector3();position.setFromMatrixPosition(matrix);
  if(!nearViewport(view,position.x,position.y,position.z))return false;
  const index=batch.renderIds.length;
  batch.renderIds.push(e.id);
  beginJointPose(view,e,matrix);
  try{for(const part of batch.parts){
    if(part.userData.rigidRig)writeRigidPose(part,index,e,matrix);else part.setMatrixAt(index,animatePart(view,part,e,matrix));const owner=part.geometry.getAttribute('instanceOwner'),value=e.owner||0;
    if(owner&&owner.getX(index)!==value){owner.setX(index,value);part.userData.ownerChanged=true;}
  }}finally{endJointPose(view);}
  return true;
}

export function endUnitFrame(view){
  let drawn=0,allocated=0,activeBatches=0,matrixUploadBytes=0,ownerUploadBytes=0,capacityMatrixBytes=0,rigUploadBytes=0,rigUsedBytes=0,rigParts=0;
  for(const batch of view.unitBatches.values()){
    const count=batch.renderIds.length;drawn+=count;allocated+=batch.ids.length-batch.free.length;
    if(count)activeBatches++;
    for(const part of batch.parts){part.count=count;part.visible=count>0;if(part.userData.rigidRig){const rig=finishRigidFrame(part,count);rigUploadBytes+=rig.uploaded;rigUsedBytes+=rig.used;rigParts++;}else{markInstancePrefix(part,count);matrixUploadBytes+=count*16*4;}part.boundingSphere=null;capacityMatrixBytes+=part.instanceMatrix.array.byteLength;const owner=part.geometry.getAttribute('instanceOwner');if(owner&&part.userData.ownerChanged&&count){owner.clearUpdateRanges();owner.addUpdateRange(0,count);owner.needsUpdate=true;ownerUploadBytes+=count*4;}}
  }
  view.unitRenderDiagnostics={drawn,allocated,activeBatches,matrixUploadBytes,ownerUploadBytes,capacityMatrixBytes,rigParts,rigUploadBytes,rigUsedBytes};
}
